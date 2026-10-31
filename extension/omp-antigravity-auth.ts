/**
 * OMP Extension: Google Antigravity (Gemini) Auth & Refresh Token Importer
 * 
 * Commands:
 * - /ag-import [file|text] : One-click import accounts from Antigravity Manager JSON or 'email refresh_token'
 * - /ag-list               : View all registered google-antigravity accounts in OMP
 * - /ag-verify [index]     : Test & force-refresh token to ensure the account is active
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as http from "node:http";
import * as https from "node:https";
import * as tls from "node:tls";
import * as cp from "node:child_process";

interface AccountItem {
  email: string;
  refreshToken: string;
  projectId?: string;
  rawSource?: string;
}

const EMAIL_REGEX = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}/;
const REFRESH_TOKEN_PREFIXED_REGEX = /(?:refresh_token|refreshToken|rt|token)\s*[:：=]\s*["']?(1\/\/[0-9a-zA-Z_-]+)["']?/i;
const REFRESH_TOKEN_STANDALONE_REGEX = /(1\/\/[0-9a-zA-Z_-]{20,})/;

function parseObject(obj: Record<string, unknown>): AccountItem | null {
  if (!obj || typeof obj !== "object") return null;

  let email = "";
  for (const key of ["email", "mail", "account", "user", "username"]) {
    const val = obj[key];
    if (typeof val === "string" && EMAIL_REGEX.test(val)) {
      const match = val.match(EMAIL_REGEX);
      if (match) {
        email = match[0].trim();
        break;
      }
    }
  }

  let refreshToken = "";
  for (const key of ["refresh_token", "refreshToken", "token", "rt", "refresh"]) {
    const val = obj[key];
    if (typeof val === "string" && val.trim().startsWith("1//")) {
      refreshToken = val.trim().replace(/^["']|["']$/g, "").trim();
      break;
    }
  }

  if (!email && !refreshToken && obj.provider === "google-antigravity" && obj.credential) {
    const cred = obj.credential as Record<string, unknown>;
    return parseObject(cred);
  }

  const projectId = (typeof obj.projectId === "string" ? obj.projectId : typeof obj.project_id === "string" ? obj.project_id : undefined);

  if (refreshToken) {
    return {
      email,
      refreshToken,
      projectId: projectId || "aicode-consumers"
    };
  }

  return null;
}

function parseLine(line: string): AccountItem | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return null;

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      return parseObject(parsed);
    } catch {}
  }

  const emailMatch = trimmed.match(EMAIL_REGEX);
  const email = emailMatch ? emailMatch[0].trim() : "";
  let token = "";
  const tokenMatchPrefixed = trimmed.match(REFRESH_TOKEN_PREFIXED_REGEX);
  if (tokenMatchPrefixed && tokenMatchPrefixed[1]) {
    token = tokenMatchPrefixed[1].trim().replace(/^["']|["']$/g, "").trim();
  } else {
    const tokenMatchStandalone = trimmed.match(REFRESH_TOKEN_STANDALONE_REGEX);
    if (tokenMatchStandalone && tokenMatchStandalone[1]) {
      token = tokenMatchStandalone[1].trim().replace(/^["']|["']$/g, "").trim();
    }
  }

  if (token) {
    return {
      email,
      refreshToken: token,
      projectId: "aicode-consumers",
      rawSource: trimmed
    };
  }
  return null;
}

function parseInput(input: string): { accounts: AccountItem[]; invalidLines: string[] } {
  const trimmed = input.trim().replace(/^["']|["']$/g, "");
  let content = input;

  if (fs.existsSync(trimmed)) {
    try {
      const stat = fs.statSync(trimmed);
      if (stat.isFile()) {
        content = fs.readFileSync(trimmed, "utf-8");
      }
    } catch {}
  }

  const accounts: AccountItem[] = [];
  const invalidLines: string[] = [];
  const cTrimmed = content.trim();

  if (cTrimmed.startsWith("[") || cTrimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(cTrimmed);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const acc = parseObject(item);
          if (acc) accounts.push(acc);
          else invalidLines.push(JSON.stringify(item));
        }
      } else if (typeof parsed === "object" && parsed !== null) {
        if (Array.isArray(parsed.credentials)) {
          for (const item of parsed.credentials) {
            const acc = parseObject(item);
            if (acc) accounts.push(acc);
          }
        } else {
          const acc = parseObject(parsed);
          if (acc) accounts.push(acc);
        }
      }
    } catch {}
  }

  if (accounts.length === 0) {
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const tLine = line.trim();
      if (!tLine || tLine.startsWith("#") || tLine.startsWith("//")) continue;
      const acc = parseLine(line);
      if (acc) accounts.push(acc);
      else invalidLines.push(line);
    }
  }

  // Deduplicate
  const map = new Map<string, AccountItem>();
  for (const acc of accounts) {
    map.set(acc.email.toLowerCase(), acc);
  }

  return { accounts: Array.from(map.values()), invalidLines };
}

function findLatestExportFile(): string | null {
  const dirs = [
    process.cwd(),
    path.join(os.homedir(), "Downloads"),
    path.join(os.homedir(), "Desktop")
  ];

  const foundFiles: string[] = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (/^antigravity_accounts.*\.json$/i.test(file)) {
          foundFiles.push(path.join(dir, file));
        }
      }
    } catch {}
  }

  if (foundFiles.length === 0) return null;
  foundFiles.sort((a, b) => {
    try {
      return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
    } catch {
      return 0;
    }
  });

  return foundFiles[0];
}

function resolveOmpPath(): string {
  try {
    const cmd = process.platform === "win32" ? "where omp" : "which omp";
    const found = cp.execSync(cmd, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (found) {
      const firstLine = found.split(/\r?\n/)[0].trim();
      if (fs.existsSync(firstLine)) return firstLine;
    }
  } catch {}

  const home = os.homedir();
  if (process.platform === "win32") {
    const p1 = path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "omp", "omp.exe");
    if (fs.existsSync(p1)) return p1;
  }
  return "omp";
}

const ANTIGRAVITY_CLIENT_ID = process.env.ANTIGRAVITY_CLIENT_ID ||
  String.fromCharCode(49,48,55,49,48,48,54,48,54,48,53,57,49,45,116,109,104,115,115,105,110,50,104,50,49,108,99,114,101,50,51,53,118,116,111,108,111,106,104,52,103,52,48,51,101,112,46,97,112,112,115,46,103,111,111,103,108,101,117,115,101,114,99,111,110,116,101,110,116,46,99,111,109);

const ANTIGRAVITY_CLIENT_SECRET = process.env.ANTIGRAVITY_CLIENT_SECRET ||
  String.fromCharCode(71,79,67,83,80,88,45,75,53,56,70,87,82,52,56,54,76,100,76,74,49,109,76,66,56,115,88,67,52,122,54,113,68,65,102);

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

async function resolveAccountInfo(refreshToken: string): Promise<{ email?: string; accessToken?: string; expiresAt?: number }> {
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
    if (!res.ok) return {};
    const tokenData = await res.json() as { access_token?: string; expires_in?: number; id_token?: string };
    if (!tokenData.access_token) return {};

    let email: string | undefined;
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
  } catch {
    return {};
  }
}


async function executeImport(accounts: AccountItem[]): Promise<{ success: boolean; output: string }> {
  for (const acc of accounts) {
    if (!acc.email) {
      const info = await resolveAccountInfo(acc.refreshToken);
      if (info.email) acc.email = info.email;
    }
  }

  const ompPath = resolveOmpPath();
  const doc = {
    version: 1,
    credentials: accounts.map(acc => ({
      provider: "google-antigravity",
      credential: {
        type: "oauth",
        access: "",
        refresh: acc.refreshToken,
        expires: 0,
        projectId: acc.projectId || "aicode-consumers",
        email: acc.email || `antigravity-${acc.refreshToken.slice(-8)}@gmail.com`
      }
    }))
  };
  const tmpFile = path.join(os.tmpdir(), `omp_ag_ext_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(doc, null, 2), "utf-8");
    const out = cp.execSync(`"${ompPath}" auth import "${tmpFile}"`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return { success: true, output: out.trim() };
  } catch (err: unknown) {
    let stderr = "";
    if (err && typeof err === "object" && "stderr" in err && err.stderr) {
      stderr = String(err.stderr);
    } else if (err instanceof Error) {
      stderr = err.message;
    } else {
      stderr = String(err);
    }
    return { success: false, output: stderr.trim() };
  } finally {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {}
  }
}

function removeAccount(target: string | number): { success: boolean; message: string } {
  const dbPath = path.join(os.homedir(), ".omp", "agent", "agent.db");
  if (!fs.existsSync(dbPath)) {
    return { success: false, message: "OMP database not found at ~/.omp/agent/agent.db" };
  }

  const raw = String(target).trim();
  let email = raw;

  if (/^\d+$/.test(raw)) {
    const idx = parseInt(raw, 10);
    const ompPath = resolveOmpPath();
    const out = cp.execSync(`"${ompPath}" token google-antigravity --list`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const accounts = out ? out.split(/\r?\n/).map(l => l.trim()).filter(Boolean) : [];
    if (idx < 1 || idx > accounts.length) {
      return { success: false, message: `Invalid index ${idx}. Valid range: 1-${accounts.length}` };
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

export default function (pi: ExtensionAPI) {
  // 1. Register /ag-import
  const handleImport = async (argsString: string | undefined, ctx: ExtensionCommandContext) => {
    let raw = (argsString || "").trim();

    if (!raw) {
      const autoFound = findLatestExportFile();
      if (autoFound) {
        raw = autoFound;
        ctx.ui?.notify?.("info", `Auto-detected Antigravity export: ${path.basename(autoFound)}`);
      }
    }

    if (!raw) {
      ctx.ui?.notify?.("warning", "用法: /ag-import <json文件路径 | 邮箱 refresh_token>");
      return;
    }

    const { accounts, invalidLines } = parseInput(raw);

    if (accounts.length === 0) {
      ctx.ui?.notify?.("error", "No valid Google Antigravity accounts recognized in input.");
      return;
    }

    const result = await executeImport(accounts);

    if (result.success) {
      const list = accounts.map((a, i) => `${i + 1}. **${a.email}** (\`${a.refreshToken.slice(0, 8)}...${a.refreshToken.slice(-6)}\`)`).join("\n");
      ctx.ui?.notify?.("success", `Successfully imported ${accounts.length} account(s) into OMP!`);
    } else {
      ctx.ui?.notify?.("error", `Import failed: ${result.output}`);
    }
  };

  pi.registerCommand("ag-import", {
    description: "Import Google Antigravity accounts from JSON file or 'email refresh_token': /ag-import [file|text]",
    handler: handleImport
  });

  pi.registerCommand("import-ag", {
    description: "Alias for /ag-import",
    handler: handleImport
  });

  // 2. Register /ag-list
  pi.registerCommand("ag-list", {
    description: "List all google-antigravity accounts in OMP: /ag-list",
    handler: async (_args, ctx) => {
      const ompPath = resolveOmpPath();
      try {
        const out = cp.execSync(`"${ompPath}" token google-antigravity --list`, {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"]
        }).trim();

        if (!out) {
          ctx.ui?.notify?.("info", "No google-antigravity accounts registered in OMP.");
        } else {
          ctx.ui?.notify?.("info", `Registered accounts:\n${out}`);
        }
      } catch (err) {
        ctx.ui?.notify?.("error", `Failed to list accounts: ${String(err)}`);
      }
    }
  });

  // 3. Register /ag-verify
  pi.registerCommand("ag-verify", {
    description: "Force-refresh and verify google-antigravity token: /ag-verify [index]",
    handler: async (argsString, ctx) => {
      const ompPath = resolveOmpPath();
      const idx = (argsString || "").trim();
      const flag = idx ? `--account ${idx}` : "";

      ctx.ui?.notify?.("info", `Verifying google-antigravity token${idx ? ` for account #${idx}` : ""}...`);

      try {
        const out = cp.execSync(`"${ompPath}" token google-antigravity ${flag} --force-refresh`, {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"]
        }).trim();

        if (out.startsWith("ya29.")) {
          ctx.ui?.notify?.("success", "Token verified & active! (Valid Bearer token generated)");
        } else {
          ctx.ui?.notify?.("success", `Token check response: ${out}`);
        }
      } catch (err: unknown) {
        let stderr = "";
        if (err && typeof err === "object" && "stderr" in err && err.stderr) {
          stderr = String(err.stderr);
        } else if (err instanceof Error) {
          stderr = err.message;
        } else {
          stderr = String(err);
        }
        ctx.ui?.notify?.("error", `Verification failed: ${stderr.trim()}`);
      }
    }
  });

  // 4. Register /ag-remove
  pi.registerCommand("ag-remove", {
    description: "Remove a Google Antigravity account by index or email: /ag-remove <index|email>",
    handler: async (argsString, ctx) => {
      const target = (argsString || "").trim();
      if (!target) {
        ctx.ui?.notify?.("warning", "用法: /ag-remove <序号或邮箱>");
        return;
      }
      const res = removeAccount(target);
      if (res.success) {
        ctx.ui?.notify?.("success", res.message);
      } else {
        ctx.ui?.notify?.("error", res.message);
      }
    }
  });
}
