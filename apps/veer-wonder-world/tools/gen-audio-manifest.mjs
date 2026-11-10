#!/usr/bin/env node
// Generates src/audio-manifest.ts from src/assets/audio and the records in provenance/audio.
// Durations come from ffprobe and 20 Hz (50 ms step) speech envelopes come from ffmpeg.
// Reuses cached durationMs and env when src/audio-manifest.ts already has an entry with the exact same sha256.
// Never edit the output by hand.
//
//   node tools/gen-audio-manifest.mjs [--force]
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const audio = join(app, "src", "assets", "audio");
const provDir = join(app, "provenance", "audio");
const manifestPath = join(app, "src", "audio-manifest.ts");
const force = process.argv.includes("--force");

const FFMPEG = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const FFPROBE = existsSync("/opt/homebrew/bin/ffprobe") ? "/opt/homebrew/bin/ffprobe" : "ffprobe";
const CONCURRENCY = 16;
const SAMPLE_RATE = 2000;
const WINDOW_SAMPLES = 100; // 50 ms at 2000 Hz (20 Hz envelope)

const kinds = [
  ["lines", join(audio, "en", "lines"), "./assets/audio/en/lines/"],
  ["songs", join(audio, "songs"), "./assets/audio/songs/"],
  ["beds", join(audio, "music"), "./assets/audio/music/"],
  ["sfx", join(audio, "sfx"), "./assets/audio/sfx/"]
];

/** Parse existing src/audio-manifest.ts so unchanged clips reuse durationMs and env in < 100 ms. */
function readExistingCache(filePath) {
  const cache = new Map();
  if (!existsSync(filePath)) return cache;
  const text = readFileSync(filePath, "utf8");
  let currentKind = null;
  for (const line of text.split("\n")) {
    const sec = /^\s*(lines|sfx|songs|beds):\s*\{/.exec(line);
    if (sec) {
      currentKind = sec[1];
      continue;
    }
    if (!currentKind) continue;
    if (/^\s*\},?\s*$/.test(line)) {
      currentKind = null;
      continue;
    }
    const m = /^\s*"([^"]+)":\s*\{[^}]*sha256:\s*"([0-9a-f]{64})",\s*durationMs:\s*(\d+)(?:,\s*env:\s*"([A-Za-z0-9+/=]+)")?\s*\}/.exec(line);
    if (m) {
      cache.set(`${currentKind}:${m[1]}`, {
        sha256: m[2],
        durationMs: Number(m[3]),
        env: m[4] ?? undefined
      });
    }
  }
  return cache;
}

async function probeDurationMs(file) {
  const { stdout } = await execFileAsync(
    FFPROBE,
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
    { encoding: "utf8" }
  );
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`no duration for ${file}`);
  return Math.round(seconds * 1000);
}

async function computeEnvelopeBase64(file, durationMs) {
  const { stdout: pcm } = await execFileAsync(
    FFMPEG,
    ["-v", "error", "-i", file, "-f", "s16le", "-ac", "1", "-ar", String(SAMPLE_RATE), "pipe:1"],
    { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 }
  );
  const totalSamples = Math.floor(pcm.length / 2);
  const frameCount = Math.max(1, Math.ceil(durationMs / 50));
  const rms = new Float64Array(frameCount);
  let peak = 0;
  for (let w = 0; w < frameCount; w += 1) {
    const start = w * WINDOW_SAMPLES;
    const end = Math.min(totalSamples, start + WINDOW_SAMPLES);
    if (end <= start) {
      rms[w] = 0;
      continue;
    }
    let sumSq = 0;
    for (let s = start; s < end; s += 1) {
      const sample = pcm.readInt16LE(s * 2) / 32768;
      sumSq += sample * sample;
    }
    const val = Math.sqrt(sumSq / (end - start));
    rms[w] = val;
    if (val > peak) peak = val;
  }
  const bytes = new Uint8Array(frameCount);
  if (peak >= 0.005) {
    const refPeak = Math.max(peak, 0.015);
    for (let w = 0; w < frameCount; w += 1) {
      const norm = Math.min(1, rms[w] / refPeak);
      const scaled = Math.round(Math.min(255, Math.pow(norm, 0.85) * 244));
      bytes[w] = scaled < 6 ? 0 : scaled;
    }
  }
  return Buffer.from(bytes).toString("base64");
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

const existingCache = force ? new Map() : readExistingCache(manifestPath);
const tables = {};
const counts = {};
const workQueue = [];
let reused = 0;

for (const [kind, dir, urlPrefix] of kinds) {
  const prov = existsSync(join(provDir, `${kind}.json`)) ? JSON.parse(readFileSync(join(provDir, `${kind}.json`), "utf8")) : {};
  const rows = [];
  const files = existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(".mp3")).sort() : [];
  for (const f of files) {
    const id = f.slice(0, -4);
    if (!prov[id]) throw new Error(`${kind}/${f} has no provenance record`);
    const fullPath = join(dir, f);
    const bytes = readFileSync(fullPath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const cached = existingCache.get(`${kind}:${id}`);
    const row = {
      url: `${urlPrefix}${f}`,
      sha256,
      durationMs: cached && cached.sha256 === sha256 && cached.durationMs > 0 ? cached.durationMs : 0,
      env: kind === "lines" && cached && cached.sha256 === sha256 && cached.env ? cached.env : undefined
    };
    const needDuration = row.durationMs <= 0;
    const needEnv = kind === "lines" && !row.env;
    if (needDuration || needEnv) {
      workQueue.push({ kind, fullPath, row, needDuration, needEnv });
    } else {
      reused += 1;
    }
    rows.push([id, row]);
  }
  tables[kind] = rows;
  counts[kind] = rows.length;
}

if (workQueue.length > 0) {
  await runPool(workQueue, CONCURRENCY, async (job) => {
    if (job.needDuration) {
      job.row.durationMs = await probeDurationMs(job.fullPath);
    }
    if (job.needEnv) {
      job.row.env = await computeEnvelopeBase64(job.fullPath, job.row.durationMs);
    }
  });
}

const q = (s) => JSON.stringify(s);
const body = (rows, includeEnv) =>
  rows.length
    ? `{\n${rows
        .map(
          ([id, r]) =>
            `    ${q(id)}: { url: new URL(${q(r.url)}, import.meta.url).pathname, sha256: ${q(r.sha256)}, durationMs: ${r.durationMs}${includeEnv ? `, env: ${q(r.env ?? "")}` : ""} }`
        )
        .join(",\n")}\n  }`
    : "{}";

const out = `// GENERATED by tools/gen-audio-manifest.mjs from src/assets/audio. Do not edit by hand.
// Urls are module-relative so Vite builds and the esbuild dev server both resolve them; provenance per file is in provenance/audio/*.json.
import type { AudioClipRef, MusicBedId, SfxId, SongId } from "./types.js";

export const AUDIO_MANIFEST: {
  readonly lines: Readonly<Record<string, AudioClipRef>>;
  readonly sfx: Readonly<Partial<Record<SfxId, AudioClipRef>>>;
  readonly songs: Readonly<Partial<Record<SongId, AudioClipRef>>>;
  readonly beds: Readonly<Partial<Record<MusicBedId, AudioClipRef>>>;
} = {
  lines: ${body(tables.lines, true)},
  sfx: ${body(tables.sfx, false)},
  songs: ${body(tables.songs, false)},
  beds: ${body(tables.beds, false)}
};
`;

writeFileSync(manifestPath, out);
console.log(`audio manifest: ${JSON.stringify(counts)} (computed ${workQueue.length}, reused ${reused})`);
