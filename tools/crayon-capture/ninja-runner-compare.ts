#!/usr/bin/env tsx
/**
 * Contact sheets for the Ninja Runner art pass. Writes (1) port-only before|after sheets to evidence/ninja-runner-port/
 * compare-<state>.jpg (committable) and (2) original|port sheets for the village states to
 * evidence/look-reference-frames/ninja-runner/compare-original-<state>.jpg (local only: the original's frames are third-party and gitignored).
 *
 *   tsx ninja-runner-compare.ts --before evidence/ninja-runner-port/art-before --after evidence/ninja-runner-port/art-a5
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requireFromRoot = createRequire(path.join(process.cwd(), "package.json"));
interface Sharp {
  (input: Buffer | { create: { width: number; height: number; channels: 3; background: string } }): Sharp;
  extract(r: { left: number; top: number; width: number; height: number }): Sharp;
  resize(w: number, h: number, o: { fit: "fill" }): Sharp;
  composite(layers: { input: Buffer; left: number; top: number }[]): Sharp;
  jpeg(o: { quality: number }): Sharp;
  metadata(): Promise<{ width?: number; height?: number }>;
  toBuffer(): Promise<Buffer>;
}
const sharp = requireFromRoot("sharp") as Sharp;
const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };

const W = 800, H = 450, LABEL = 26;
const label = (text: string): Buffer => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LABEL}"><rect width="100%" height="100%" fill="#10181f"/><text x="12" y="18" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#fff0cc">${text}</text></svg>`);

async function sheet(left: { name: string; image: Buffer }, right: { name: string; image: Buffer }, out: string): Promise<void> {
  const fit = (b: Buffer): Promise<Buffer> => sharp(b).resize(W, H, { fit: "fill" }).jpeg({ quality: 88 }).toBuffer();
  const canvas = await sharp({ create: { width: W * 2, height: H + LABEL, channels: 3, background: "#10181f" } })
    .composite([
      { input: label(left.name), left: 0, top: 0 }, { input: label(right.name), left: W, top: 0 },
      { input: await fit(left.image), left: 0, top: LABEL }, { input: await fit(right.image), left: W, top: LABEL }
    ]).jpeg({ quality: 88 }).toBuffer();
  fs.writeFileSync(out, canvas);
}

async function main(): Promise<void> {
  const before = path.resolve(arg("--before") ?? "evidence/ninja-runner-port/art-before");
  const after = path.resolve(arg("--after") ?? "evidence/ninja-runner-port/art-a5");
  const outDir = path.resolve(arg("--out") ?? "evidence/ninja-runner-port");
  const originalDir = path.resolve(arg("--original-dir") ?? "evidence/look-reference-frames/ninja-runner");
  let written = 0;
  for (const state of ["intro", "run-start", "village", "alley", "stairs", "rooftops", "descent", "bridge", "forest", "valley", "rasengan", "shuriken", "clones", "form-sage", "form-kurama", "finish", "lost"]) {
    const b = `${before}-${state}.jpg`, a = `${after}-${state}.jpg`;
    if (!fs.existsSync(a)) continue;
    if (fs.existsSync(b)) { await sheet({ name: `before: soldier on boxes (${state})`, image: fs.readFileSync(b) }, { name: `after (${state})`, image: fs.readFileSync(a) }, path.join(outDir, `compare-${state}.jpg`)); written++; }
  }
  const pairs: [string, string, string][] = [["village-a", "ref-2.jpg", "run-start"], ["village-b", "ref-5.jpg", "village"]];
  for (const [name, ref, state] of pairs) {
    const r = path.join(originalDir, ref), a = `${after}-${state}.jpg`;
    if (!fs.existsSync(r) || !fs.existsSync(a)) continue;
    const meta = await sharp(fs.readFileSync(r)).metadata();
    const w = meta.width ?? 1280, h = meta.height ?? 720;
    const crop = await sharp(fs.readFileSync(r)).extract({ left: Math.round(w * 0.1), top: Math.round(h * 0.19), width: Math.round(w * 0.8), height: h - Math.round(h * 0.19) }).jpeg({ quality: 90 }).toBuffer();
    const pm = await sharp(fs.readFileSync(a)).metadata();
    const pw = pm.width ?? W, ph = pm.height ?? H;
    const portCrop = await sharp(fs.readFileSync(a)).extract({ left: Math.round(pw * 0.1), top: Math.round(ph * 0.19), width: Math.round(pw * 0.8), height: ph - Math.round(ph * 0.19) }).jpeg({ quality: 90 }).toBuffer();
    await sheet({ name: `original (${ref}, HUD cropped out)`, image: crop }, { name: `port (${state})`, image: portCrop }, path.join(originalDir, `compare-original-${name}.jpg`));
    written++;
  }
  process.stdout.write(`wrote ${written} contact sheets\n`);
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
