#!/usr/bin/env node
// Softens the base-colour texture of the given GLBs under public/aura-assets (see soften-basecolor.mjs), writes each result next to
// the original under a new hash-named file, repoints every manifest block (aura.assets.json, src/aura-assets.ts and any extra
// file given) and any literal file-name reference in the extra files, then deletes the original.
// Usage: node tools/likeness-audit/apply-softened.mjs <public-dir> <old-file.glb>... [-- <extra-text-file>...]
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const sep = args.indexOf("--");
const [publicDir, ...olds] = sep < 0 ? args : args.slice(0, sep);
const extras = sep < 0 ? [] : args.slice(sep + 1);
const dir = path.join(publicDir, "aura-assets");
const tmp = path.join(process.env.TMPDIR ?? "/tmp", "soften-out");
const manifests = (process.env.MANIFESTS ?? "aura.assets.json,src/aura-assets.ts").split(",");
const TOOL = process.env.REPAINT_TOOL ?? "tools/likeness-audit/soften-basecolor.mjs";
const TOOL_ARGS = (process.env.REPAINT_ARGS ?? "40,512").split(",");
const targets = [...manifests, ...extras].filter((f) => existsSync(f));
const results = [];
for (const old of olds) {
  const stem = old.replace(/\.[0-9a-f]{8}\.glb$/, "");
  let out;
  try { out = JSON.parse(execFileSync("node", [TOOL, path.join(dir, old), tmp, stem, ...TOOL_ARGS], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); }
  catch { results.push({ old, skipped: "no base-colour texture" }); continue; }
  const buf = readFileSync(path.join(tmp, out.file));
  const oldBuf = readFileSync(path.join(dir, old));
  const oldSha = createHash("sha256").update(oldBuf).digest("hex");
  writeFileSync(path.join(dir, out.file), buf);
  for (const t of targets) {
    let text = readFileSync(t, "utf8");
    if (!text.includes(old) && !text.includes(oldSha)) continue;
    // block-scoped edits so sizeBytes only changes where the old entry lived
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].includes(old) && !lines[i].includes(oldSha)) continue;
      let a = i, b = i;
      while (a > 0 && !/^\s*(\{|"[^"]+": \{)\s*$/.test(lines[a - 1]) && i - a < 40) a -= 1;
      while (b < lines.length - 1 && !/^\s*\},?\s*$/.test(lines[b + 1]) && b - i < 60) b += 1;
      for (let k = a; k <= b; k += 1) lines[k] = lines[k].split(old).join(out.file).split(oldSha).join(out.sha256).replace(/("?sizeBytes"?: )\d+/, `$1${out.sizeBytes}`);
    }
    writeFileSync(t, lines.join("\n"));
  }
  rmSync(path.join(dir, old));
  results.push({ old, new: out.file, bytes: [oldBuf.length, out.sizeBytes] });
}
console.log(JSON.stringify(results, null, 1));
