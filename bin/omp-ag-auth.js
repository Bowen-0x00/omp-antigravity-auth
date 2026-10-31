#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import * as cp from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const hasProxy = Boolean(process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy);
const hasArg = process.execArgv.includes("--use-env-proxy") || Boolean(process.env.NODE_OPTIONS?.includes("--use-env-proxy"));

if (hasProxy && !hasArg) {
  const result = cp.spawnSync(process.execPath, ["--use-env-proxy", ...process.argv.slice(1)], {
    stdio: "inherit"
  });
  process.exit(result.status ?? 0);
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const distCli = path.join(dir, "../dist/cli.js");
const srcCli = path.join(dir, "../src/cli.js");

const target = fs.existsSync(distCli) ? distCli : srcCli;
const { runCli } = await import(pathToFileURL(target).href);

runCli().then((code) => {
  if (code !== 0) {
    process.exit(code);
  }
}).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
