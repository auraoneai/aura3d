#!/usr/bin/env tsx
/**
 * tools/crayon-capture/saiyan-snake-way-art-frames: rebuild the JPEG frames and metrics that
 * `tests/browser/saiyan-snake-way-art.spec.ts` printed in a remote-run log as
 * `@@SSW_ART <tag> <name> <i> <n> <base64>`, `@@SSW_METRIC <tag> <name> <json>` and `@@SSW_PERF <tag> <json>`.
 *
 *   pnpm exec tsx tools/crayon-capture/saiyan-snake-way-art-frames.ts --log run.log --out evidence/saiyan-snake-way-port/art
 *
 * Writes `<out>/<tag>/<name>.jpg` and `<out>/metrics.json` ({ frames, metrics, perf } keyed by tag and name).
 */
import fs from "node:fs";
import path from "node:path";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

export interface ArtCapture {
  readonly frames: Map<string, Buffer>;
  readonly metrics: Record<string, Record<string, unknown>>;
  readonly perf: Record<string, unknown>;
}

export function parseArtLog(log: string): ArtCapture {
  const parts = new Map<string, { n: number; chunks: Map<number, string> }>();
  for (const m of log.matchAll(/@@SSW_ART (\S+) (\S+) (\d+) (\d+) ([A-Za-z0-9+/=]+)/g)) {
    const [, tag, name, i, n, data] = m as unknown as [string, string, string, string, string, string];
    const key = `${tag}/${name}`;
    const entry = parts.get(key) ?? { n: Number(n), chunks: new Map<number, string>() };
    entry.chunks.set(Number(i), data);
    parts.set(key, entry);
  }
  const frames = new Map<string, Buffer>();
  for (const [key, { n, chunks }] of parts) {
    if (chunks.size !== n) {
      process.stderr.write(`frame ${key}: ${chunks.size}/${n} chunks, skipped\n`);
      continue;
    }
    frames.set(key, Buffer.from(Array.from({ length: n }, (_, i) => chunks.get(i) as string).join(""), "base64"));
  }
  const metrics: Record<string, Record<string, unknown>> = {};
  for (const m of log.matchAll(/@@SSW_METRIC (\S+) (\S+) (\{.*\})/g)) {
    const [, tag, name, json] = m as unknown as [string, string, string, string];
    (metrics[tag] ??= {})[name] = JSON.parse(json);
  }
  const perf: Record<string, unknown> = {};
  for (const m of log.matchAll(/@@SSW_PERF (\S+) (\{.*\})/g)) perf[m[1] as string] = JSON.parse(m[2] as string);
  return { frames, metrics, perf };
}

if (process.argv[1]?.endsWith("saiyan-snake-way-art-frames.ts")) {
  const logs = process.argv.flatMap((a, i, all) => (a === "--log" ? [all[i + 1] as string] : []));
  const outDir = path.resolve(arg("--out") ?? "evidence/saiyan-snake-way-port/art");
  const all: { frames: string[]; metrics: Record<string, Record<string, unknown>>; perf: Record<string, unknown> } = { frames: [], metrics: {}, perf: {} };
  for (const logPath of logs) {
    const { frames, metrics, perf } = parseArtLog(fs.readFileSync(logPath, "utf8"));
    for (const [key, buf] of frames) {
      const file = path.join(outDir, `${key}.jpg`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      all.frames.push(key);
      process.stdout.write(`${key}.jpg ${buf.length} bytes\n`);
    }
    for (const [tag, byName] of Object.entries(metrics)) all.metrics[tag] = { ...(all.metrics[tag] ?? {}), ...byName };
    Object.assign(all.perf, perf);
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "metrics.json"), `${JSON.stringify(all, null, 2)}\n`);
}
