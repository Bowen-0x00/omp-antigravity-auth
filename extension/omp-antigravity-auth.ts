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

  if (email && refreshToken) {
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
  if (!emailMatch) return null;
  const email = emailMatch[0].trim();

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

  if (email && token) {
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

function executeImport(accounts: AccountItem[]): { success: boolean; output: string } {
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
        email: acc.email
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

    const result = executeImport(accounts);

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
}
