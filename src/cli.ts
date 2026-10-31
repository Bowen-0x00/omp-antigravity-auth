import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readlinePromises from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { parseContent, parseInput } from "./parser.js";
import { importAccounts, listOmpAccounts, verifyAccount, removeAccount } from "./importer.js";
import type { ImportOptions } from "./types.js";

const VERSION = "1.0.0";

const HELP_TEXT = `
🚀 omp-antigravity-auth (v${VERSION})
One-click Google Antigravity (Gemini) Refresh Token Importer for Oh My Pi (omp).

USAGE:
  omp-ag-auth [command] [options] [arguments...]

COMMANDS:
  import [target]       Import accounts from JSON file, text file,
                        or direct string ("email refresh_token" or delimited line)
  remove <index|email>  Remove a specific account by 1-based index or email address
  verify [index]        Test & force-refresh token for an account (default: primary)
  help, -h, --help      Show this help message
  version, -v           Show version information
OPTIONS:
  --dry-run             Validate and parse without applying changes to omp
  --project <id>        Set custom Google Cloud Project ID (default: "aicode-consumers")
  --verify              Immediately verify token validity after importing

EXAMPLES:
  # 1. Import from Antigravity Manager JSON file:
  omp-ag-auth import C:\\Users\\Bowen\\Downloads\\antigravity_accounts_2026-10-31.json

  # 2. Import from raw email and refresh token:
  omp-ag-auth import "myaccount@gmail.com 1//0mock_antigravity_token_example"

  # 3. Import from delimited line format:
  omp-ag-auth import "acc@gmail.com|pass|recovery|2FA refresh_token:1//0mock_antigravity_token_example"

  # 4. Auto-detect from Downloads folder (no arguments):
  omp-ag-auth import

  # 5. List current accounts:
  omp-ag-auth list
`;

/**
 * Scan common download / working directories for antigravity export files
 */
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
    } catch {
      // Ignore read errors
    }
  }

  if (foundFiles.length === 0) return null;

  // Sort newest first
  foundFiles.sort((a, b) => {
    try {
      return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
    } catch {
      return 0;
    }
  });

  return foundFiles[0];
}

async function readFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return "";
  }
  const { promise, resolve } = Promise.withResolvers<string>();
  let data = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk: string | Buffer) => {
    data += chunk.toString();
  });
  process.stdin.on("end", () => {
    resolve(data.trim());
  });
  return promise;
}

export async function runCli(args: string[] = process.argv.slice(2)): Promise<number> {
  const flags = new Set<string>();
  const positional: string[] = [];
  let customProject: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run" || arg === "--verify" || arg === "-h" || arg === "--help" || arg === "-v" || arg === "--version") {
      flags.add(arg);
    } else if (arg === "--project" && i + 1 < args.length) {
      customProject = args[++i];
    } else {
      positional.push(arg);
    }
  }

  if (flags.has("-h") || flags.has("--help") || positional[0] === "help") {
    console.log(HELP_TEXT.trim());
    return 0;
  }

  if (flags.has("-v") || flags.has("--version") || positional[0] === "version") {
    console.log(`omp-antigravity-auth v${VERSION}`);
    return 0;
  }

  const command = positional[0] || "import";
  const targetArg = positional.slice(1).join(" ").trim();

  if (command === "list") {
    console.log("📋 Stored google-antigravity accounts in omp:\n");
    const accounts = listOmpAccounts();
    if (accounts.length === 0) {
      console.log("  (No google-antigravity accounts configured)");
    } else {
      for (const acc of accounts) {
        console.log(`  ${acc}`);
      }
    }
    return 0;
  }

  if (command === "verify") {
    const idx = targetArg ? parseInt(targetArg, 10) : undefined;
    console.log(`🔍 Verifying google-antigravity token${idx ? ` (account #${idx})` : ""}...`);
    const result = verifyAccount(idx);
    if (result.ok) {
      console.log(`✅ Success: ${result.message}`);
      return 0;
    } else {
      console.error(`❌ Verification failed:\n${result.message}`);
      return 1;
    }
  }

  if (command === "remove" || command === "rm" || command === "delete") {
    if (!targetArg) {
      console.error("❌ Please specify account index or email to remove: omp-ag-auth remove <index|email>");
      return 1;
    }
    const res = removeAccount(targetArg);
    if (res.success) {
      console.log(`✅ ${res.message}`);
      return 0;
    } else {
      console.error(`❌ ${res.message}`);
      return 1;
    }
  }

  if (command === "import") {
    let rawInput = targetArg;

    // Check stdin if not provided as argument
    if (!rawInput) {
      rawInput = await readFromStdin();
    }

    // If still empty, check for latest download file
    if (!rawInput) {
      const autoFound = findLatestExportFile();
      if (autoFound) {
        console.log(`💡 Detected latest Antigravity export: ${autoFound}`);
        rawInput = autoFound;
      }
    }

    // If still empty and in interactive TTY, prompt user
    if (!rawInput && process.stdin.isTTY) {
      const rl = readlinePromises.createInterface({ input, output });
      const answer = await rl.question("Please enter JSON file path or paste 'email refresh_token':\n> ");
      rl.close();
      rawInput = answer.trim();
    }

    if (!rawInput) {
      console.error("❌ Error: No file path or account credentials provided.");
      console.log("Run `omp-ag-auth --help` for usage details.");
      return 1;
    }

    console.log("🔄 Parsing credentials...");
    const parsed = parseInput(rawInput);

    if (parsed.accounts.length === 0) {
      console.error("❌ No valid Google Antigravity accounts found in input.");
      if (parsed.invalidLines.length > 0) {
        console.error(`Unrecognized inputs (${parsed.invalidLines.length} item(s)):`);
        for (const line of parsed.invalidLines.slice(0, 5)) {
          console.error(`  - ${line}`);
        }
      }
      return 1;
    }

    console.log(`🎯 Identified ${parsed.accounts.length} account(s):`);
    for (let i = 0; i < parsed.accounts.length; i++) {
      const acc = parsed.accounts[i];
      const maskedToken = acc.refreshToken.slice(0, 8) + "..." + acc.refreshToken.slice(-6);
      const emailLabel = acc.email || "(resolving email from Google...)";
      console.log(`  [${i + 1}] ${emailLabel} (token: ${maskedToken})`);
    }

    const options: ImportOptions = {
      projectId: customProject,
      dryRun: flags.has("--dry-run"),
      verify: flags.has("--verify")
    };

    console.log("\n🚀 Importing into omp credential vault...");
    const result = await importAccounts(parsed.accounts, options);

    if (!result.success) {
      console.error(`\n❌ Import failed:\n${result.error}`);
      return 1;
    }

    console.log(`\n✅ ${result.output || `Successfully imported ${result.imported} account(s)!`}`);
    if (result.accounts.some(a => a.email)) {
      console.log("Account details:");
      for (const a of result.accounts) {
        console.log(`  - ${a.email}`);
      }
    }

    // Verify if requested
    if (options.verify) {
      console.log("🔍 Verifying token connectivity...");
      const verifyRes = verifyAccount();
      if (verifyRes.ok) {
        console.log(`✅ Token check passed: ${verifyRes.message}`);
      } else {
        console.warn(`⚠️ Warning during token check: ${verifyRes.message}`);
      }
    }

    return 0;
  }

  // If unknown command, treat positional[0] as target to import
  if (positional.length > 0) {
    return runCli(["import", ...positional]);
  }

  console.log(HELP_TEXT.trim());
  return 0;
}
