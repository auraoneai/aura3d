#!/usr/bin/env tsx
/**
 * tools/crayon-capture/last-train-frames: rebuild the JPEG frames, metrics and contact sheets that
 * tests/browser/last-train-art.spec.ts printed as `LTART <tag> <name> <i> <n> <base64>` lines in a remote-run log.
 *
 *   pnpm exec tsx tools/crayon-capture/last-train-frames.ts --log run.log --out evidence/last-train-port [--sheet]
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

export function splitFrames(log: string): Map<string, Map<string, Buffer>> {
  const parts = new Map<string, { n: number; chunks: Map<number, string> }>();
  for (const m of log.matchAll(/LTART (before|after) (\S+) (\d+) (\d+) ([A-Za-z0-9+/=]+)/g)) {
    const [, tag, name, i, n, data] = m as unknown as [string, string, string, string, string, string];
    const key = `${tag}/${name}`;
    const entry = parts.get(key) ?? { n: Number(n), chunks: new Map<number, string>() };
    entry.chunks.set(Number(i), data);
    parts.set(key, entry);
  }
  const out = new Map<string, Map<string, Buffer>>();
  for (const [key, { n, chunks }] of parts) {
    const [tag, name] = key.split("/") as [string, string];
    if (chunks.size !== n) { process.stderr.write(`frame ${key}: ${chunks.size}/${n} chunks, skipped\n`); continue; }
    const b64 = Array.from({ length: n }, (_, i) => chunks.get(i) as string).join("");
    (out.get(tag) ?? out.set(tag, new Map()).get(tag)!).set(name, Buffer.from(b64, "base64"));
  }
  return out;
}

async function sheet(frames: Map<string, Buffer>, names: string[], file: string, cols = 3, w = 480): Promise<void> {
  const h = Math.round((w * 9) / 16);
  const rows = Math.ceil(names.length / cols);
  const tiles = await Promise.all(names.map(async (n, i) => ({ input: await sharp(frames.get(n)!).resize(w, h).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * h })));
  await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: "#0e1220" } }).composite(tiles).jpeg({ quality: 82 }).toFile(file);
}

async function main(): Promise<void> {
  const logs = process.argv.flatMap((a, i, all) => (a === "--log" ? [all[i + 1] as string] : []));
  const outDir = path.resolve(arg("--out") ?? "frames-out");
  fs.mkdirSync(outDir, { recursive: true });
  const all = new Map<string, Map<string, Buffer>>();
  let text = "";
  for (const logPath of logs) {
    const log = fs.readFileSync(logPath, "utf8");
    text += log;
    for (const [tag, frames] of splitFrames(log)) for (const [name, buf] of frames) (all.get(tag) ?? all.set(tag, new Map()).get(tag)!).set(name, buf);
  }
  for (const [tag, frames] of all) {
    const dir = path.join(outDir, `art-${tag}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, buf] of frames) fs.writeFileSync(path.join(dir, `${name}.jpg`), buf);
    process.stdout.write(`${tag}: ${frames.size} frames\n`);
  }
  const metrics: Record<string, unknown> = {};
  for (const m of text.matchAll(/LTART_(METRICS|ASSETS|ERRORS) (before|after|ui) (.*)/g)) metrics[`${m[2]}.${m[1]!.toLowerCase()}`] = m[3];
  fs.writeFileSync(path.join(outDir, "art-metrics.json"), JSON.stringify(metrics, null, 2));
  if (process.argv.includes("--sheet")) {
    const before = all.get("before"), after = all.get("after");
    if (after) {
      const names = [...after.keys()].sort();
      await sheet(after, names, path.join(outDir, "compare-after.jpg"));
      if (before) {
        const shared = names.filter((n) => before.has(n));
        const pairs = new Map<string, Buffer>();
        const list: string[] = [];
        for (const n of shared) { pairs.set(`b-${n}`, before.get(n)!); pairs.set(`a-${n}`, after.get(n)!); list.push(`b-${n}`, `a-${n}`); }
        await sheet(pairs, list, path.join(outDir, "compare-before-after.jpg"), 2, 560);
      }
    }
  }
}

if (process.argv[1]?.endsWith("last-train-frames.ts")) void main();
