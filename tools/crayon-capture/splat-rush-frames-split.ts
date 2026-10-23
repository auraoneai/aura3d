#!/usr/bin/env tsx
/**
 * tools/crayon-capture/splat-rush-frames-split: rebuild the JPEG frames that `splat-rush-frames.ts` / the port frame spec
 * printed as `@@SPLAT_FRAME <name> <i> <n> <base64>` lines in a remote-run log.
 *
 *   pnpm exec tsx tools/crayon-capture/splat-rush-frames-split.ts --log run.log --out evidence/look-reference-frames/splat-rush
 */
import fs from "node:fs";
import path from "node:path";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

export function splitFrames(log: string): Map<string, Buffer> {
  const parts = new Map<string, { n: number; chunks: Map<number, string> }>();
  for (const m of log.matchAll(/@@SPLAT_FRAME (\S+) (\d+) (\d+) ([A-Za-z0-9+/=]+)/g)) {
    const [, name, i, n, data] = m as unknown as [string, string, string, string, string];
    const entry = parts.get(name) ?? { n: Number(n), chunks: new Map<number, string>() };
    entry.chunks.set(Number(i), data);
    parts.set(name, entry);
  }
  const out = new Map<string, Buffer>();
  for (const [name, { n, chunks }] of parts) {
    if (chunks.size !== n) {
      process.stderr.write(`frame ${name}: ${chunks.size}/${n} chunks (log line split?), skipped\n`);
      continue;
    }
    const b64 = Array.from({ length: n }, (_, i) => chunks.get(i) as string).join("");
    out.set(name, Buffer.from(b64, "base64"));
  }
  return out;
}

if (process.argv[1]?.endsWith("splat-rush-frames-split.ts")) {
  const logs = process.argv.flatMap((a, i, all) => (a === "--log" ? [all[i + 1] as string] : []));
  const outDir = path.resolve(arg("--out") ?? "frames-out");
  fs.mkdirSync(outDir, { recursive: true });
  for (const logPath of logs) {
    const frames = splitFrames(fs.readFileSync(logPath, "utf8"));
    for (const [name, buf] of frames) {
      fs.writeFileSync(path.join(outDir, `${name}.jpg`), buf);
      process.stdout.write(`${name}.jpg ${buf.length} bytes\n`);
    }
  }
}
