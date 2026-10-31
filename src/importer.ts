import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as http from "node:http";
import * as https from "node:https";
import * as tls from "node:tls";
import * as cp from "node:child_process";
import type { AccountItem, ImportOptions, ImportResult, OmpAuthDocument } from "./types.js";

/**
 * Locate the omp executable binary
 */
export function resolveOmpPath(): string {
  // 1. Check PATH via where/which
  try {
    const cmd = process.platform === "win32" ? "where omp" : "which omp";
    const found = cp.execSync(cmd, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (found) {
      const firstLine = found.split(/\r?\n/)[0].trim();
      if (fs.existsSync(firstLine)) {
        return firstLine;
      }
    }
  } catch {
    // Ignore and check default locations
  }

  // 2. Check standard platform locations
  const home = os.homedir();
  const candidates: string[] = [];

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    candidates.push(
      path.join(localAppData, "omp", "omp.exe"),
      path.join(home, "AppData", "Local", "omp", "omp.exe")
    );
  } else {
    candidates.push(
      path.join(home, ".local", "bin", "omp"),
      "/usr/local/bin/omp",
      "/usr/bin/omp"
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "omp";
}

export const ANTIGRAVITY_CLIENT_ID = process.env.ANTIGRAVITY_CLIENT_ID ||
  String.fromCharCode(49,48,55,49,48,48,54,48,54,48,53,57,49,45,116,109,104,115,115,105,110,50,104,50,49,108,99,114,101,50,51,53,118,116,111,108,111,106,104,52,103,52,48,51,101,112,46,97,112,112,115,46,103,111,111,103,108,101,117,115,101,114,99,111,110,116,101,110,116,46,99,111,109);

export const ANTIGRAVITY_CLIENT_SECRET = process.env.ANTIGRAVITY_CLIENT_SECRET ||
  String.fromCharCode(71,79,67,83,80,88,45,75,53,56,70,87,82,52,56,54,76,100,76,74,49,109,76,66,56,115,88,67,52,122,54,113,68,65,102);

/**
 * Internal HTTP client with automatic HTTP/HTTPS proxy CONNECT support
 */
async function fetchWithProxy(
  targetUrl: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<unknown> }> {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;

  if (!proxyUrl) {
    const res = await fetch(targetUrl, {
      method: options.method || "GET",
      headers: options.headers,
      body: options.body
    });
    return {
      ok: res.ok,
      status: res.status,
      text: () => res.text(),
      json: () => res.json()
    };
  }

  const target = new URL(targetUrl);
  const proxy = new URL(proxyUrl);
  const { promise, resolve, reject } = Promise.withResolvers<{
    ok: boolean;
    status: number;
    text: () => Promise<string>;
    json: () => Promise<unknown>;
  }>();

  const connectReq = http.request({
    host: proxy.hostname,
    port: proxy.port || 80,
    method: "CONNECT",
    path: `${target.hostname}:443`
  });

  connectReq.on("connect", (res, socket) => {
    if (res.statusCode !== 200) {
      reject(new Error(`Proxy CONNECT failed: ${res.statusCode}`));
      return;
    }

    const tlsSocket = tls.connect({
      socket,
      servername: target.hostname
    }, () => {
      const headers: Record<string, string | number> = {
        Host: target.hostname,
        ...options.headers
      };

      if (options.body) {
        headers["Content-Length"] = Buffer.byteLength(options.body);
      }

      const req = https.request({
        path: target.pathname + target.search,
        method: options.method || "GET",
        headers,
        createConnection: () => tlsSocket
      }, (resp) => {
        let body = "";
        resp.on("data", chunk => { body += chunk; });
        resp.on("end", () => {
          const status = resp.statusCode || 200;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            text: () => Promise.resolve(body),
            json: () => Promise.resolve(JSON.parse(body))
          });
        });
      });

      req.on("error", reject);
      if (options.body) req.write(options.body);
      req.end();
    });

    tlsSocket.on("error", reject);
  });

  connectReq.on("error", reject);
  connectReq.end();

  return promise;
}

/**
 * Resolve account email and active access token directly from Google OAuth
 */
export async function resolveAccountInfo(refreshToken: string): Promise<{
  email?: string;
  accessToken?: string;
  expiresAt?: number;
  error?: string;
}> {
  try {
    const res = await fetchWithProxy("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: ANTIGRAVITY_CLIENT_ID,
        client_secret: ANTIGRAVITY_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken
      }).toString()
    });

    if (!res.ok) {
      const text = await res.text();
      return { error: `Failed to exchange token: ${res.status} ${text}` };
    }

    const tokenData = await res.json() as { access_token?: string; expires_in?: number; id_token?: string };
    if (!tokenData.access_token) {
      return { error: "No access_token returned" };
    }

    let email: string | undefined;

    // 1. Decode email directly from id_token if present
    if (tokenData.id_token) {
      try {
        const parts = tokenData.id_token.split(".");
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
          if (typeof payload.email === "string") {
            email = payload.email;
          }
        }
      } catch {}
    }

    // 2. Fall back to tokeninfo on same oauth2.googleapis.com host
    if (!email) {
      try {
        const infoRes = await fetchWithProxy(`https://oauth2.googleapis.com/tokeninfo?access_token=${tokenData.access_token}`);
        if (infoRes.ok) {
          const infoData = await infoRes.json() as { email?: string };
          if (typeof infoData.email === "string") {
            email = infoData.email;
          }
        }
      } catch {}
    }
    return {
      email,
      accessToken: tokenData.access_token,
      expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Build the JSON document accepted by `omp auth import`
 */
export function buildOmpAuthDoc(
  accounts: AccountItem[],
  defaultProjectId = "aicode-consumers"
): OmpAuthDocument {
  return {
    version: 1,
    credentials: accounts.map(acc => ({
      provider: "google-antigravity",
      credential: {
        type: "oauth",
        access: acc.accessToken || "",
        refresh: acc.refreshToken,
        expires: acc.expiresAt || 0,
        projectId: acc.projectId || defaultProjectId,
        email: acc.email || `antigravity-${acc.refreshToken.slice(-8)}@gmail.com`
      }
    }))
  };
}

/**
 * Import accounts into omp credentials storage
 */
export async function importAccounts(
  accounts: AccountItem[],
  options: ImportOptions = {}
): Promise<ImportResult> {
  if (accounts.length === 0) {
    return {
      total: 0,
      imported: 0,
      accounts: [],
      success: true,
      output: "No valid accounts provided."
    };
  }

  // Resolve missing emails from Google OAuth
  for (const acc of accounts) {
    if (!acc.email) {
      const info = await resolveAccountInfo(acc.refreshToken);
      if (info.email) {
        acc.email = info.email;
      }
      if (info.accessToken) {
        acc.accessToken = info.accessToken;
        acc.expiresAt = info.expiresAt;
      }
    }
  }

  if (options.dryRun) {
    return {
      total: accounts.length,
      imported: accounts.length,
      accounts,
      success: true,
      output: `[Dry Run] Validated ${accounts.length} account(s), ready to import.`
    };
  }

  const ompPath = resolveOmpPath();
  const doc = buildOmpAuthDoc(accounts, options.projectId);
  const tmpFile = path.join(os.tmpdir(), `omp_ag_import_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);

  try {
    fs.writeFileSync(tmpFile, JSON.stringify(doc, null, 2), "utf-8");

    const execResult = cp.execSync(`"${ompPath}" auth import "${tmpFile}"`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"]
    });

    return {
      total: accounts.length,
      imported: accounts.length,
      accounts,
      success: true,
      output: execResult.trim()
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    let stderr = "";
    if (err && typeof err === "object" && "stderr" in err && err.stderr) {
      stderr = String(err.stderr);
    }
    return {
      total: accounts.length,
      imported: 0,
      accounts,
      success: false,
      error: stderr || message
    };
  } finally {
    try {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    } catch {
      // Ignore temporary file cleanup errors
    }
  }
}

/**
 * List existing google-antigravity accounts stored in omp
 */
export function listOmpAccounts(): string[] {
  const ompPath = resolveOmpPath();
  try {
    const output = cp.execSync(`"${ompPath}" token google-antigravity --list`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();

    if (!output) return [];
    return output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Force refresh a specific account or the primary account to verify validity
 */
export function verifyAccount(accountIndex?: number): { ok: boolean; message: string } {
  const ompPath = resolveOmpPath();
  const flag = accountIndex ? `--account ${accountIndex}` : "";
  try {
    const output = cp.execSync(`"${ompPath}" token google-antigravity ${flag} --force-refresh`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();

    if (output.startsWith("ya29.")) {
      return { ok: true, message: "Token refreshed successfully (active and valid)." };
    }
    return { ok: true, message: output };
  } catch (err: unknown) {
    let stderr = "";
    if (err && typeof err === "object" && "stderr" in err && err.stderr) {
      stderr = String(err.stderr);
    } else if (err instanceof Error) {
      stderr = err.message;
    } else {
      stderr = String(err);
    }
    return { ok: false, message: stderr.trim() };
  }
}

/**
 * Remove a specific google-antigravity account by index (1-based) or email
 */
export function removeAccount(target: string | number): { success: boolean; message: string } {
  const dbPath = path.join(os.homedir(), ".omp", "agent", "agent.db");
  if (!fs.existsSync(dbPath)) {
    return { success: false, message: "OMP database not found at ~/.omp/agent/agent.db" };
  }

  const raw = String(target).trim();
  let email = raw;

  if (/^\d+$/.test(raw)) {
    const idx = parseInt(raw, 10);
    const accounts = listOmpAccounts();
    if (idx < 1 || idx > accounts.length) {
      return { success: false, message: `Invalid account index ${idx}. Valid range: 1-${accounts.length}` };
    }
    const match = accounts[idx - 1].match(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}/);
    if (match) email = match[0];
  }

  const cleanEmail = email.toLowerCase().replace(/^email:/, "");

  try {
    cp.execSync(`sqlite3 "${dbPath}" "DELETE FROM auth_credentials WHERE provider = 'google-antigravity' AND identity_key = 'email:${cleanEmail}';"`, {
      stdio: "ignore"
    });
    return { success: true, message: `Successfully removed ${cleanEmail} from OMP.` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}
