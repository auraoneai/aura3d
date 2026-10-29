/**
 * Decodes a remote-acr run log of tests/browser/audit-fix/heatsink-port.spec.ts (--grep=fixes) and
 * tests/browser/shotsb-circuit.spec.ts: HP_FIX records to <out>/<tag>/fix.json, HP_SHOT and @@SB chunked JPEGs to
 * <out>/<tag>/*.jpg (and @@SB frames to the screens dir when given).
 * Usage: node decode.mjs <acr-run.log> <out-dir> <tag> [screens-dir]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [logPath, outDir, tag, screensDir] = process.argv.slice(2);
const dir = join(outDir, tag);
mkdirSync(dir, { recursive: true });
const lines = readFileSync(logPath, "utf8").split("\n").map((l) => l.replace(/^.*?(HP_FIX|HP_SHOT|@@SB |@@SBSTATE|HP_ERR|HP_CONSOLE)/, "$1"));
const fixes = [];
const chunks = new Map();
const sb = new Map();
const extra = [];
for (const line of lines) {
  if (line.startsWith("HP_FIX ")) { try { fixes.push(JSON.parse(line.slice(7))); } catch { extra.push(line.slice(0, 200)); } }
  else if (line.startsWith("HP_SHOT ")) {
    const [, name, part, b64] = line.split(" ");
    const [i, n] = part.split("/").map(Number);
    const c = chunks.get(name) ?? { n, parts: [] };
    c.parts[i - 1] = b64; chunks.set(name, c);
  } else if (line.startsWith("@@SB ")) {
    const [, , name, i, n, b64] = line.split(" ");
    const c = sb.get(name) ?? { n: Number(n), parts: [] };
    c.parts[Number(i)] = b64; sb.set(name, c);
  } else if (line.startsWith("HP_ERR") || line.startsWith("HP_CONSOLE") || line.startsWith("@@SBSTATE")) extra.push(line.slice(0, 400));
}
writeFileSync(join(dir, "fix.json"), `${JSON.stringify({ fixes, notes: extra }, null, 1)}\n`);
for (const [name, c] of chunks) if (c.parts.filter(Boolean).length === c.n) writeFileSync(join(dir, `${name}.jpg`), Buffer.from(c.parts.join(""), "base64"));
if (screensDir) for (const [name, c] of sb) if (c.parts.filter(Boolean).length === c.n) writeFileSync(join(screensDir, `${name.replace(/-card2x$/, "")}.jpg`), Buffer.from(c.parts.join(""), "base64"));
console.log(`fix records ${fixes.length}, shots ${chunks.size}, screens ${sb.size}, notes ${extra.length}`);
