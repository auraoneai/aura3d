#!/usr/bin/env node
// Decode tests/browser/game-luma-capture.spec.ts output from remote acr-run.log files into frames and a table.
//   node evidence/audit-fix/e5/decode-luma.mjs <label>=<acr-run.log> [...] --out <dir>
// Writes <out>/frames/<label>/<target>--<shot>.jpg, <out>/luma-<label>.json (every GL_META row) and prints the
// steady-state rows (the last shot per target) as JSON lines.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args[outAt + 1] : "evidence/audit-fix/e5";
const inputs = args.filter((a, i) => a.includes("=") && i !== outAt + 1);
for (const input of inputs) {
  const [label, file] = input.split("=");
  const text = readFileSync(file, "utf8");
  const metas = [];
  const chunks = new Map();
  for (const line of text.split("\n")) {
    if (line.startsWith("GL_META ")) { try { metas.push(JSON.parse(line.slice(8))); } catch { /* torn line */ } continue; }
    const m = /^GL_JPG (\S+) (\S+) (\d+)\/(\d+) (\S+)$/.exec(line);
    if (!m) continue;
    const key = `${m[1]}--${m[2]}`;
    if (!chunks.has(key)) chunks.set(key, { n: Number(m[4]), parts: new Map() });
    chunks.get(key).parts.set(Number(m[3]), m[5]);
  }
  const dir = join(out, "frames", label);
  mkdirSync(dir, { recursive: true });
  let written = 0, broken = 0;
  for (const [key, { n, parts }] of chunks) {
    if (parts.size !== n) { broken++; continue; }
    writeFileSync(join(dir, `${key}.jpg`), Buffer.from([...Array(n).keys()].map((i) => parts.get(i + 1)).join(""), "base64"));
    written++;
  }
  writeFileSync(join(out, `luma-${label}.json`), JSON.stringify(metas, null, 1) + "\n");
  const last = new Map();
  for (const m of metas) last.set(m.target, m);
  for (const m of last.values()) console.log(JSON.stringify({ label, target: m.target, shot: m.id, mean: m.mean, p95: m.p95, clip: m.clipFrac, dark: m.darkFrac, path: m.info?.renderPath ?? null, draws: m.info?.drawCalls ?? null }));
  console.error(`${label}: ${metas.length} shots, ${written} frames, ${broken} incomplete`);
}
