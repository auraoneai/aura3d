#!/usr/bin/env tsx
/**
 * Contact sheets for the Drift & Deliver art pass. Committed sheets hold only this repo's frames (port before | port after).
 * The full original | before | after sheets are written next to the original's frames (gitignored, third-party look reference).
 *
 *   tsx drift-and-deliver-compare.ts --original-dir evidence/look-reference-frames/drift-and-deliver \
 *       --before-dir evidence/drift-and-deliver-port/frames-before --after-dir evidence/drift-and-deliver-port/frames-after \
 *       [--out evidence/drift-and-deliver-port]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requireFromRoot = createRequire(path.join(process.cwd(), "package.json"));
const sharp = requireFromRoot("sharp") as (input: Buffer | { create: { width: number; height: number; channels: 3; background: string } }) => {
  resize: (w: number, h: number) => ReturnType<typeof sharp>;
  composite: (layers: { input: Buffer; left: number; top: number }[]) => ReturnType<typeof sharp>;
  jpeg: (o: { quality: number }) => { toBuffer: () => Promise<Buffer> };
  toBuffer: () => Promise<Buffer>;
};

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const W = 512, H = 288;

async function sheet(frames: Buffer[]): Promise<Buffer> {
  const tiles = await Promise.all(frames.map((f) => sharp(f).resize(W, H).toBuffer()));
  return sharp({ create: { width: W * tiles.length, height: H, channels: 3, background: "#000000" } })
    .composite(tiles.map((input, i) => ({ input, left: i * W, top: 0 })))
    .jpeg({ quality: 88 })
    .toBuffer();
}

async function main(): Promise<void> {
  const originalDir = path.resolve(arg("--original-dir") ?? "evidence/look-reference-frames/drift-and-deliver");
  const beforeDir = path.resolve(arg("--before-dir") ?? "evidence/drift-and-deliver-port/frames-before");
  const afterDir = path.resolve(arg("--after-dir") ?? "evidence/drift-and-deliver-port/frames-after");
  const out = path.resolve(arg("--out") ?? "evidence/drift-and-deliver-port");
  const file = (dir: string, shot: string): string => path.join(dir, `ref-${shot}-clean.jpg`);
  const shots = fs.readdirSync(afterDir).map((f) => /^ref-(.+)-clean\.jpg$/.exec(f)?.[1]).filter((s): s is string => !!s);
  let n = 0;
  for (const shot of shots) {
    const after = fs.readFileSync(file(afterDir, shot));
    const before = fs.existsSync(file(beforeDir, shot)) ? fs.readFileSync(file(beforeDir, shot)) : null;
    if (before) fs.writeFileSync(path.join(out, `compare-before-after-${shot}.jpg`), await sheet([before, after]));
    if (fs.existsSync(file(originalDir, shot))) {
      const original = fs.readFileSync(file(originalDir, shot));
      fs.writeFileSync(path.join(originalDir, `compare-${shot}.jpg`), await sheet(before ? [original, before, after] : [original, after]));
    }
    n++;
  }
  process.stdout.write(`wrote ${n} sheets\n`);
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
