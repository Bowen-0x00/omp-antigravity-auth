#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
