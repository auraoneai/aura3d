#!/usr/bin/env tsx
/**
 * Side-by-side contact sheets for the Cloud Runner art pass: before | after (port frames only, committable) written to
 * evidence/cloud-runner-port/compare-<state>.jpg, and original | before | after (third-party frame, local only) written beside the
 * original frames. Frames come from kid-goku-judge.ts's normalised 640x360 crops.
 *
 *   tsx kid-goku-compare.ts --before dir --after dir --original-crops dir [--out evidence/cloud-runner-port] [--states s0,...]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requireFromRoot = createRequire(path.join(process.cwd(), "package.json"));
const sharp = requireFromRoot("sharp") as (i: unknown) => { jpeg: (o: { quality: number }) => { toFile: (p: string) => Promise<unknown> } };
const arg = (n: string): string | undefined => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };

async function sheet(files: string[], out: string): Promise<void> {
  const W = 640, H = 360;
  const base = sharp({ create: { width: W * files.length, height: H, channels: 3, background: "#101010" } }) as unknown as { composite: (l: { input: string; left: number; top: number }[]) => { jpeg: (o: { quality: number }) => { toFile: (p: string) => Promise<unknown> } } };
  await base.composite(files.map((input, i) => ({ input, left: i * W, top: 0 }))).jpeg({ quality: 86 }).toFile(out);
}

async function main(): Promise<void> {
  const out = path.resolve(arg("--out") ?? "evidence/cloud-runner-port");
  const frames = path.join(out, "judge-frames");
  const crops = path.resolve(arg("--original-crops") ?? "evidence/look-reference-frames/kid-goku-beyond-the-clouds/judge-crops");
  const states = (arg("--states") ?? "s0,s570,s700,s1040,s1560,menu").split(",");
  for (const st of states) {
    const b = path.join(frames, `before-${st}.jpg`), a = path.join(frames, `after-${st}.jpg`), o = path.join(crops, `original-${st}.jpg`);
    if (!fs.existsSync(a)) continue;
    if (fs.existsSync(b)) await sheet([b, a], path.join(out, `compare-${st}.jpg`));
    if (fs.existsSync(o) && fs.existsSync(b)) await sheet([o, b, a], path.join(crops, `triple-${st}.jpg`));
  }
}
main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
