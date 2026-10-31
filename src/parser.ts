import * as fs from "node:fs";
import * as path from "node:path";
import type { AccountItem, ParseResult } from "./types.js";

const EMAIL_REGEX = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}/;
const REFRESH_TOKEN_PREFIXED_REGEX = /(?:refresh_token|refreshToken|rt|token)\s*[:：=]\s*["']?(1\/\/[0-9a-zA-Z_-]+)["']?/i;
const REFRESH_TOKEN_STANDALONE_REGEX = /(1\/\/[0-9a-zA-Z_-]{20,})/;


/**
 * Parse an unknown object into an AccountItem if it contains valid email & token
 */
function parseObject(obj: Record<string, unknown>): AccountItem | null {
  if (!obj || typeof obj !== "object") return null;

  // Fuzzy find email
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

  // Fuzzy find refresh_token
  let refreshToken = "";
  for (const key of ["refresh_token", "refreshToken", "token", "rt", "refresh"]) {
    const val = obj[key];
    if (typeof val === "string" && val.trim().startsWith("1//")) {
      refreshToken = val.trim().replace(/^["']|["']$/g, "").trim();
      break;
    }
  }

  // Also check if this is an omp native auth document
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

/**
 * Parse single line of text into AccountItem
 */
export function parseLine(line: string): AccountItem | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
    return null;
  }

  // 1. Check if the line itself is a JSON object
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      return parseObject(parsed);
    } catch {
      // Fall through to regex parsing
    }
  }

  // 2. Extract email
  const emailMatch = trimmed.match(EMAIL_REGEX);
  if (!emailMatch) {
    return null;
  }
  const email = emailMatch[0].trim();

  // 3. Extract refresh token
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

/**
 * Parse text or JSON content
 */
export function parseContent(content: string): ParseResult {
  const accounts: AccountItem[] = [];
  const invalidLines: string[] = [];
  const trimmed = content.trim();

  if (!trimmed) {
    return { accounts, invalidLines };
  }

  // 1. Try parsing whole content as JSON
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const acc = parseObject(item);
          if (acc) {
            accounts.push(acc);
          } else {
            invalidLines.push(JSON.stringify(item));
          }
        }
        return deduplicateAccounts(accounts, invalidLines);
      } else if (typeof parsed === "object" && parsed !== null) {
        // Maybe omp auth export format with credentials array
        if (Array.isArray(parsed.credentials)) {
          for (const item of parsed.credentials) {
            const acc = parseObject(item);
            if (acc) {
              accounts.push(acc);
            }
          }
          return deduplicateAccounts(accounts, invalidLines);
        }

        const acc = parseObject(parsed);
        if (acc) {
          accounts.push(acc);
          return deduplicateAccounts(accounts, invalidLines);
        }
      }
    } catch {
      // Not valid JSON, continue with line-by-line parsing
    }
  }

  // 2. Parse line by line
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const tLine = line.trim();
    if (!tLine || tLine.startsWith("#") || tLine.startsWith("//")) continue;
    const acc = parseLine(line);
    if (acc) {
      accounts.push(acc);
    } else {
      invalidLines.push(line);
    }
  }

  return deduplicateAccounts(accounts, invalidLines);
}

/**
 * Deduplicate accounts by email, keeping the latest one
 */
function deduplicateAccounts(accounts: AccountItem[], invalidLines: string[]): ParseResult {
  const map = new Map<string, AccountItem>();
  for (const acc of accounts) {
    map.set(acc.email.toLowerCase(), acc);
  }
  return {
    accounts: Array.from(map.values()),
    invalidLines
  };
}

/**
 * High-level parser that takes a file path or raw string
 */
export function parseInput(input: string): ParseResult {
  const trimmed = input.trim().replace(/^["']|["']$/g, "");

  // Check if it's an existing file
  if (fs.existsSync(trimmed)) {
    try {
      const stats = fs.statSync(trimmed);
      if (stats.isFile()) {
        const fileContent = fs.readFileSync(trimmed, "utf-8");
        return parseContent(fileContent);
      }
    } catch (err) {
      return {
        accounts: [],
        invalidLines: [`Failed to read file ${trimmed}: ${String(err)}`]
      };
    }
  }

  // Otherwise, treat input as raw text or JSON content
  return parseContent(input);
}
