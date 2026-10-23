/**
 * Split ACR run logs (produced with `look-dump --emit-markers`) into evidence/look-specs/<game>.json.
 * Usage: tsx tools/crayon-capture/look-dump-split.ts --log run.log [--log run2.log] [--out evidence/look-specs]
 * Validates every spec; a block that fails to parse is reported and not written. Existing files are only
 * replaced by a spec with no more validation problems than the file it replaces.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { splitMarkerBlocks, stableStringify, validateLookSpec } from "./look-dump-lib.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const logs: string[] = [];
let out = path.join(repoRoot, "evidence", "look-specs");
const skipShots = new Set<string>();
let shotsOut = path.join(repoRoot, "evidence", "look-reference-frames");
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--log") logs.push(path.resolve(argv[++i] as string));
  else if (argv[i] === "--out") out = path.resolve(argv[++i] as string);
  else if (argv[i] === "--skip-shots") argv[++i]!.split(",").forEach((g) => skipShots.add(g));
  else if (argv[i] === "--shots-out") shotsOut = path.resolve(argv[++i] as string);
  else throw new Error(`unknown arg ${argv[i]}`);
}
if (logs.length === 0) {
  console.error("pass at least one --log");
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
let bad = 0;
for (const log of logs) {
  for (const block of splitMarkerBlocks(fs.readFileSync(log, "utf8"))) {
    if (block.json === null) {
      console.error(`[split] ${block.id}: ${block.error}`);
      bad++;
      continue;
    }
    const problems = validateLookSpec(block.json);
    const file = path.join(out, `${block.id}.json`);
    if (fs.existsSync(file)) {
      const prev = validateLookSpec(JSON.parse(fs.readFileSync(file, "utf8")));
      if (problems.length > prev.length) {
        console.log(`[split] ${block.id}: kept existing (${prev.length} problems) over new (${problems.length})`);
        continue;
      }
    }
    fs.writeFileSync(file, `${stableStringify(block.json)}\n`);
    console.log(`[split] ${block.id}: wrote (${problems.length} validation problems${problems.length ? `: ${problems.slice(0, 3).join("; ")}` : ""})`);
  }
}

// Reference screenshots (third-party look reference; the folder is gitignored and never staged).
for (const log of logs) {
  for (const block of splitMarkerBlocks(fs.readFileSync(log, "utf8"), "A3D_SHOTS")) {
    if (block.json === null) {
      console.error(`[split] shots ${block.id}: ${block.error}`);
      bad++;
      continue;
    }
    if (skipShots.has(block.id)) {
      console.log(`[split] shots ${block.id}: skipped (--skip-shots)`);
      continue;
    }
    const { index, files } = block.json as { index: Record<string, unknown>; files: { n: number; b64: string }[] };
    const dir = path.join(shotsOut, block.id);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(dir, `ref-${f.n}.jpg`), Buffer.from(f.b64, "base64"));
    fs.writeFileSync(path.join(dir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
    console.log(`[split] shots ${block.id}: wrote ${files.length} frames to ${path.relative(repoRoot, dir)}`);
  }
}
process.exit(bad ? 1 : 0);
