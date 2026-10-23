#!/usr/bin/env tsx
/**
 * tools/crayon-capture/roadster-hours-sheet: side-by-side contact sheets for the Roadster Hours art pass.
 * Committed sheets hold only our own frames (before | after); the local sheets add the original's frame first and are written
 * under the gitignored evidence/look-reference-frames tree (third-party pixels are never committed).
 *
 *   tsx roadster-hours-sheet.ts --before-dir /tmp/rh-art/before --after-dir /tmp/rh-art/after \
 *       [--original-dir evidence/look-reference-frames/roadster-hours] [--states s0030,lineup,...] [--level 0] [--suffix -bare]
 *       [--out evidence/roadster-hours-port] [--local-out evidence/look-reference-frames/roadster-hours/sheets]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requireFromRoot = createRequire(path.join(process.cwd(), "package.json"));
type Sharp = ((input: Buffer | { create: { width: number; height: number; channels: 3; background: string } }) => {
  resize: (w: number, h: number, o?: Record<string, unknown>) => ReturnType<Sharp>;
  composite: (layers: { input: Buffer; left: number; top: number }[]) => ReturnType<Sharp>;
  jpeg: (o: { quality: number }) => { toBuffer: () => Promise<Buffer> };
  toBuffer: () => Promise<Buffer>;
}) ;
const sharp = requireFromRoot("sharp") as unknown as Sharp;

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };

const W = 480, H = 270, LABEL = 22;

async function sheet(columns: { label: string; file: string }[], out: string): Promise<void> {
  const present = columns.filter((c) => fs.existsSync(c.file));
  if (present.length < 2) return;
  const layers: { input: Buffer; left: number; top: number }[] = [];
  for (const [i, c] of present.entries()) {
    const img = await sharp(fs.readFileSync(c.file)).resize(W, H, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
    layers.push({ input: img, left: i * W, top: LABEL });
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LABEL}"><rect width="100%" height="100%" fill="#10131a"/><text x="8" y="15" font-family="sans-serif" font-size="12" fill="#cfd6e4">${c.label}</text></svg>`);
    layers.push({ input: svg, left: i * W, top: 0 });
  }
  const base = sharp({ create: { width: present.length * W, height: H + LABEL, channels: 3, background: "#10131a" } });
  const buf = await base.composite(layers).jpeg({ quality: 82 }).toBuffer();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buf);
  process.stdout.write(`${out} ${buf.length} bytes\n`);
}

async function main(): Promise<void> {
  const beforeDir = path.resolve(arg("--before-dir") ?? "before");
  const afterDir = path.resolve(arg("--after-dir") ?? "after");
  const originalDir = arg("--original-dir") ? path.resolve(arg("--original-dir") as string) : null;
  const states = (arg("--states") ?? "menu,s0030,lineup,s0720,air,s1680,s2400,s3000,s3600,s4200,s4800").split(",");
  const level = arg("--level") ?? "0";
  const suffix = arg("--suffix") ?? "";
  const out = path.resolve(arg("--out") ?? "evidence/roadster-hours-port");
  const localOut = path.resolve(arg("--local-out") ?? "evidence/look-reference-frames/roadster-hours/sheets");
  for (const state of states) {
    const before = { label: "before (committed port)", file: path.join(beforeDir, `l${level}-${state}${suffix}.jpg`) };
    const after = { label: "after (art pass)", file: path.join(afterDir, `l${level}-${state}${suffix}.jpg`) };
    await sheet([before, after], path.join(out, `compare-${state}.jpg`));
    if (originalDir) {
      const original = { label: "original (local only)", file: path.join(originalDir, `orig-${state}${suffix}.jpg`) };
      await sheet([original, before, after], path.join(localOut, `triple-${state}.jpg`));
    }
  }
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
