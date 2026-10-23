#!/usr/bin/env tsx
/**
 * tools/crayon-capture/silt-and-signal-frames-split: rebuild the JPEG frames and the per-frame info that
 * tests/browser/silt-and-signal-frames.spec.ts printed (`@@SILT_FRAME <name> <i> <n> <base64>` and `@@SILT_INFO <name> <json>`)
 * into a directory of `<name>.jpg` files plus `info.json`.
 *
 *   pnpm exec tsx tools/crayon-capture/silt-and-signal-frames-split.ts --log run.log --out /tmp/silt-frames
 */
import fs from "node:fs";
import path from "node:path";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

export function splitSiltFrames(log: string, marker = "SILT_FRAME"): { frames: Map<string, Buffer>; info: Record<string, unknown> } {
  const parts = new Map<string, { n: number; chunks: Map<number, string> }>();
  for (const m of log.matchAll(new RegExp(`@@${marker} (\\S+) (\\d+) (\\d+) ([A-Za-z0-9+/=]+)`, "g"))) {
    const [, name, i, n, data] = m as unknown as [string, string, string, string, string];
    const entry = parts.get(name) ?? { n: Number(n), chunks: new Map<number, string>() };
    entry.chunks.set(Number(i), data);
    parts.set(name, entry);
  }
  const frames = new Map<string, Buffer>();
  for (const [name, { n, chunks }] of parts) {
    if (chunks.size !== n) { process.stderr.write(`frame ${name}: ${chunks.size}/${n} chunks, skipped\n`); continue; }
    frames.set(name, Buffer.from(Array.from({ length: n }, (_, i) => chunks.get(i) as string).join(""), "base64"));
  }
  const info: Record<string, unknown> = {};
  for (const m of log.matchAll(new RegExp(`@@${marker === "SILT_FRAME" ? "SILT_INFO" : "SILT_REFINFO"} (\\S+) (\\{.*\\})`, "g"))) {
    try { info[m[1] as string] = JSON.parse(m[2] as string); } catch { /* truncated line */ }
  }
  return { frames, info };
}

if (process.argv[1]?.endsWith("silt-and-signal-frames-split.ts")) {
  const log = fs.readFileSync(path.resolve(arg("--log") ?? "run.log"), "utf8");
  const out = path.resolve(arg("--out") ?? "silt-frames");
  fs.mkdirSync(out, { recursive: true });
  const { frames, info } = splitSiltFrames(log, arg("--marker") ?? "SILT_FRAME");
  for (const [name, buf] of frames) {
    fs.writeFileSync(path.join(out, `${name}.jpg`), buf);
    process.stdout.write(`${name}.jpg ${buf.length} bytes\n`);
  }
  fs.writeFileSync(path.join(out, "info.json"), `${JSON.stringify(info, null, 2)}\n`);
}
