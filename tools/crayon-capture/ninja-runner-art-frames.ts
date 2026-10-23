#!/usr/bin/env tsx
/**
 * Unpack `NINJA_RUNNER_ART_FRAME <name> <base64>` lines from a remote ACR log into evidence/ninja-runner-port/art-<tag>-<name>.jpg
 * and print the `NINJA_RUNNER_ART_DIAG` lines.   tsx tools/crayon-capture/ninja-runner-art-frames.ts <acr-run.log> <tag>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [logPath, tag] = process.argv.slice(2);
if (!logPath || !tag) throw new Error("usage: ninja-runner-art-frames.ts <log> <tag>");
const out = resolve("evidence/ninja-runner-port");
mkdirSync(out, { recursive: true });
let count = 0;
for (const line of readFileSync(logPath, "utf8").split("\n")) {
  const frame = /NINJA_RUNNER_ART_FRAME (\S+) ([A-Za-z0-9+/=]+)/.exec(line);
  if (frame) { writeFileSync(`${out}/art-${tag}-${frame[1]}.jpg`, Buffer.from(frame[2]!, "base64")); count++; continue; }
  if (/NINJA_RUNNER_ART_(DIAG|ERRORS)|NINJA_RUNNER_BOOT_ERROR/.test(line)) console.log(line.slice(0, 2000));
}
console.log(`wrote ${count} frames to ${out} (tag ${tag})`);
