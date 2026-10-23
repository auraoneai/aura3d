#!/usr/bin/env tsx
/**
 * tools/crayon-capture/where-the-wind-wanders-contact: side-by-side contact sheets for the art pass.
 *
 * Committed sheets hold only the port's own frames (before | after). When `--original-dir` is given a second,
 * LOCAL sheet (original | before | after) is written next to it for review: it contains the original's pixels, which
 * are third-party content, so write it to a gitignored directory (evidence/look-reference-frames/) and never commit it.
 *
 *   tsx where-the-wind-wanders-contact.ts --before dir --after dir --pairs "start=start=start,step-306=replay-306=replay-306"
 *       --out evidence/where-the-wind-wanders-port [--original-dir dir --original-crop 0,56,960,346 --local-out dir]
 *
 * A pair is `name=beforeFrame=afterFrame[=originalFrame]` (frame names are JPEG basenames without extension).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requireFromRoot = createRequire(path.join(process.cwd(), "package.json"));
type Sharp = (input: Buffer | { create: { width: number; height: number; channels: 3; background: string } }) => {
  extract: (r: { left: number; top: number; width: number; height: number }) => ReturnType<Sharp>;
  resize: (w: number, h: number, o?: Record<string, unknown>) => ReturnType<Sharp>;
  composite: (layers: { input: Buffer; left: number; top: number }[]) => ReturnType<Sharp>;
  jpeg: (o: { quality: number }) => ReturnType<Sharp>;
  toBuffer: () => Promise<Buffer>;
  toFile: (p: string) => Promise<unknown>;
};
const sharp = requireFromRoot("sharp") as Sharp;
const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };

const W = 640, H = 231, LABEL = 22;

async function tile(file: string, crop: number[] | null): Promise<Buffer> {
  let img = sharp(fs.readFileSync(file));
  if (crop) img = img.extract({ left: crop[0]!, top: crop[1]!, width: crop[2]!, height: crop[3]! });
  return img.resize(W, H, { fit: "fill" }).jpeg({ quality: 88 }).toBuffer();
}

async function labelled(img: Buffer, text: string): Promise<Buffer> {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LABEL}"><rect width="100%" height="100%" fill="#1b1d18"/><text x="8" y="15" font-family="sans-serif" font-size="12" fill="#e9e6d8">${text}</text></svg>`);
  return sharp({ create: { width: W, height: H + LABEL, channels: 3, background: "#1b1d18" } }).composite([{ input: svg, left: 0, top: 0 }, { input: img, left: 0, top: LABEL }]).jpeg({ quality: 88 }).toBuffer();
}

async function row(items: { file: string; label: string; crop: number[] | null }[], out: string): Promise<void> {
  const tiles = await Promise.all(items.map(async (i) => labelled(await tile(i.file, i.crop), i.label)));
  const sheet = sharp({ create: { width: W * tiles.length, height: H + LABEL, channels: 3, background: "#1b1d18" } }).composite(tiles.map((input, k) => ({ input, left: k * W, top: 0 }))).jpeg({ quality: 88 });
  await sheet.toFile(out);
}

async function main(): Promise<void> {
  const before = path.resolve(arg("--before") ?? "before");
  const after = path.resolve(arg("--after") ?? "after");
  const out = path.resolve(arg("--out") ?? "evidence/where-the-wind-wanders-port");
  const original = arg("--original-dir") ? path.resolve(arg("--original-dir")!) : null;
  const localOut = path.resolve(arg("--local-out") ?? "evidence/look-reference-frames/where-the-wind-wanders-replay");
  const crop = (arg("--original-crop") ?? "0,56,960,346").split(",").map(Number);
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(localOut, { recursive: true });
  const pairs = (arg("--pairs") ?? "start=start=start").split(",").map((p) => p.split("="));
  for (const [name, b, a, o] of pairs) {
    await row([
      { file: path.join(before, `${b}.jpg`), label: `${name}: before the art pass (flat primitives)`, crop: null },
      { file: path.join(after, `${a}.jpg`), label: `${name}: after (Aura3D port, this branch)`, crop: null }
    ], path.join(out, `compare-${name}.jpg`));
    if (original && o) {
      await row([
        { file: path.join(original, `${o}.jpg`), label: `${name}: original (third-party, local only)`, crop },
        { file: path.join(before, `${b}.jpg`), label: "before", crop: null },
        { file: path.join(after, `${a}.jpg`), label: "after", crop: null }
      ], path.join(localOut, `compare-${name}-with-original.jpg`));
    }
  }
  process.stdout.write(`${pairs.length} sheets written\n`);
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
