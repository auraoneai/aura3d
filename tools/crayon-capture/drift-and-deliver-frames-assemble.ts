#!/usr/bin/env tsx
/**
 * Unpack `@@KG_CHUNK` lines from a drift-and-deliver-frames run log into
 * evidence/look-reference-frames/drift-and-deliver/ref-<name>-<variant>.jpg plus index.json (gitignored, look reference only).
 *
 *   tsx tools/crayon-capture/drift-and-deliver-frames-assemble.ts <run.log> [--out dir]
 */
import fs from "node:fs";
import path from "node:path";

export interface ParsedFrame { readonly name: string; readonly variant: string; readonly bytes: Buffer }

/**
 * ACR wraps very long lines and interleaves the tool's timestamped stderr lines (`[12.3s] ...`) into them, so those are
 * stripped first, the base64 is read across line breaks, and each frame is cut at the JPEG end-of-image marker.
 */
export function parseFrames(log: string): ParsedFrame[] {
  const cleaned = log.replace(/\[\d+(?:\.\d)?s\][^\r\n]*/g, "");
  const parts = new Map<string, { name: string; variant: string; total: number; chunks: Map<number, string> }>();
  for (const m of cleaned.matchAll(/@@KG_CHUNK (\S+) (clean|hud) (\d+)\/(\d+) ([A-Za-z0-9+/=\r\n]+)/g)) {
    const key = `${m[1]}/${m[2]}`;
    let e = parts.get(key);
    if (!e) parts.set(key, (e = { name: m[1] as string, variant: m[2] as string, total: Number(m[4]), chunks: new Map() }));
    e.chunks.set(Number(m[3]), (m[5] as string).replace(/[\r\n]/g, ""));
  }
  const out: ParsedFrame[] = [];
  for (const e of parts.values()) {
    if (e.chunks.size !== e.total) continue;
    const raw = Buffer.from(Array.from({ length: e.total }, (_, i) => e.chunks.get(i + 1) as string).join(""), "base64");
    if (raw[0] !== 0xff || raw[1] !== 0xd8) continue;
    let end = -1;
    for (let i = raw.length - 2; i >= 2; i--) if (raw[i] === 0xff && raw[i + 1] === 0xd9) { end = i + 2; break; }
    if (end > 0) out.push({ name: e.name, variant: e.variant, bytes: raw.subarray(0, end) });
  }
  return out;
}


function main(): void {
  const logPath = process.argv[2];
  if (!logPath) throw new Error("usage: drift-and-deliver-frames-assemble.ts <run.log> [--out dir]");
  const i = process.argv.indexOf("--out");
  const outDir = path.resolve(i >= 0 ? (process.argv[i + 1] as string) : "evidence/look-reference-frames/drift-and-deliver");
  fs.mkdirSync(outDir, { recursive: true });
  const frames = parseFrames(fs.readFileSync(logPath, "utf8"));
  if (frames.length === 0) throw new Error("no @@KG_CHUNK frames found");
  const index = frames.map((f) => {
    const file = `ref-${f.name}-${f.variant}.jpg`;
    fs.writeFileSync(path.join(outDir, file), f.bytes);
    return { file, shot: f.name, variant: f.variant, bytes: f.bytes.length };
  });
  fs.writeFileSync(path.join(outDir, "index.json"), `${JSON.stringify({ schema: "a3d-look-reference-frames/1", game: "drift-and-deliver", frames: index }, null, 2)}\n`);
  process.stdout.write(`wrote ${frames.length} frames to ${outDir}\n`);
}

if (process.argv[1] && /drift-and-deliver-frames-assemble\.(ts|mjs|js)$/.test(process.argv[1])) main();
