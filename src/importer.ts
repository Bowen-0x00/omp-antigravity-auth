import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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
        access: "",
        refresh: acc.refreshToken,
        expires: 0,
        projectId: acc.projectId || defaultProjectId,
        email: acc.email
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
