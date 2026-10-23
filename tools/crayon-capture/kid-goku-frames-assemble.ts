#!/usr/bin/env tsx
/**
 * Unpack `@@KG_FRAME <name> <variant> <base64>` lines from a kid-goku-frames run log into
 * evidence/look-reference-frames/kid-goku-beyond-the-clouds/ref-<name>-<variant>.jpg plus index.json.
 * The folder is gitignored (third-party screenshots, look reference only).
 *
 *   tsx tools/crayon-capture/kid-goku-frames-assemble.ts <run.log> [--out dir] [--prefix ref]
 */
import fs from "node:fs";
import path from "node:path";

export interface ParsedFrame { readonly name: string; readonly variant: string; readonly bytes: Buffer }

export function parseFrames(logIn: string): ParsedFrame[] {
  // ACR interleaves the tool's timestamped stderr lines into long stdout lines and may wrap them: strip the stderr text first
  const log = logIn.replace(/\[\d+(?:\.\d)?s\][^\r\n]*/g, "");
  const parts = new Map<string, { name: string; variant: string; total: number; chunks: Map<number, string> }>();
  const add = (m: RegExpExecArray, data: string): void => {
    const key = `${m[1]}/${m[2]}`;
    let e = parts.get(key);
    if (!e) parts.set(key, (e = { name: m[1] as string, variant: m[2] as string, total: Number(m[4]), chunks: new Map() }));
    if (!e.chunks.has(Number(m[3]))) e.chunks.set(Number(m[3]), data);
  };
  // new format: the data is closed by " ;" so wrapped lines can be rejoined safely
  const closed = /@@KG_CHUNK (\S+) (clean|hud) (\d+)\/(\d+) ([A-Za-z0-9+/=\r\n]+?) ;/g;
  for (let m = closed.exec(log); m; m = closed.exec(log)) add(m, (m[5] as string).replace(/[\r\n]/g, ""));
  // old format: one unwrapped line per chunk
  for (const line of log.split(/\r?\n/)) {
    const m = /@@KG_CHUNK (\S+) (clean|hud) (\d+)\/(\d+) ([A-Za-z0-9+/=]+)\s*$/.exec(line.trim());
    if (m) add(m, m[5] as string);
  }
  const out: ParsedFrame[] = [];
  for (const e of parts.values()) {
    if (e.chunks.size !== e.total) continue;
    const b64 = Array.from({ length: e.total }, (_, i) => e.chunks.get(i + 1) as string).join("");
    const bytes = Buffer.from(b64, "base64");
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) continue;
    out.push({ name: e.name, variant: e.variant, bytes });
  }
  return out;
}

function main(): void {
  const logPath = process.argv[2];
  if (!logPath) throw new Error("usage: kid-goku-frames-assemble.ts <run.log> [--out dir]");
  const i = process.argv.indexOf("--out");
  const outDir = path.resolve(i >= 0 ? (process.argv[i + 1] as string) : "evidence/look-reference-frames/kid-goku-beyond-the-clouds");
  const pi = process.argv.indexOf("--prefix");
  const prefix = pi >= 0 ? (process.argv[pi + 1] as string) : "ref";
  fs.mkdirSync(outDir, { recursive: true });
  const frames = parseFrames(fs.readFileSync(logPath, "utf8"));
  if (frames.length === 0) throw new Error("no @@KG_FRAME lines found");
  const index = frames.map((f) => {
    const file = `${prefix}-${f.name}-${f.variant}.jpg`;
    fs.writeFileSync(path.join(outDir, file), f.bytes);
    return { file, shot: f.name, variant: f.variant, bytes: f.bytes.length };
  });
  fs.writeFileSync(path.join(outDir, "index.json"), `${JSON.stringify({ schema: "a3d-look-reference-frames/1", game: "kid-goku-beyond-the-clouds", frames: index }, null, 2)}\n`);
  process.stdout.write(`wrote ${frames.length} frames to ${outDir}\n`);
}

if (process.argv[1] && /kid-goku-frames-assemble\.(ts|mjs|js)$/.test(process.argv[1])) main();
