#!/usr/bin/env node
// Sample-exact 48 kHz offline audio mixer & -14 LUFS broadcast master (PRD 09 WP13: B.2, B.4, B.6, C.6).
//
// Usage:
//   node tools/mix-episode.mjs --dir dist/shows/<id> [--locale en]

import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = resolve(__dirname, "..");
const repoDir = resolve(appDir, "../..");

const FFMPEG = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";

export const DEFAULT_SAMPLE_RATE = 48_000;
export const BASE_BED_GAIN = 0.125; // -18.06 dB
export const SPEECH_DUCKED_BED_GAIN = 0.0315; // -12.0 dB below base bed (-30 dB below unity speech)
export const PAUSE_BED_GAIN = 0.0625; // 50% of base bed level during PAUSE beats (PRD 09 C.6 / B3.2)

function getRootRequire() {
  const rootPkg = join(repoDir, "package.json");
  const localPkg = join(appDir, "package.json");
  return createRequire(existsSync(rootPkg) ? rootPkg : localPkg);
}

/**
 * Resolves an audio event (`line` | `song` | `sfx` | `bed`) to its on-disk MP3/WAV
 * path under `src/assets/audio/`, checking locale-specific paths first and
 * falling back to shared/English assets.
 */
export function resolveAudioClipPath(event, locale = "en", customAppDir = appDir) {
  if (!event || typeof event !== "object") {
    throw new Error("Invalid audio event passed to resolveAudioClipPath");
  }
  if (typeof event.file === "string" && event.file.length > 0) {
    const abs = isAbsolute(event.file) ? event.file : resolve(customAppDir, event.file);
    if (existsSync(abs)) return abs;
  }

  const id = String(event.id ?? "").trim();
  if (!id) {
    throw new Error(`Audio event of type "${event.type}" is missing id`);
  }

  const audioRoot = join(customAppDir, "src", "assets", "audio");
  const candidates = [];

  if (event.type === "line") {
    candidates.push(
      join(audioRoot, locale, "lines", `${id}.mp3`),
      join(audioRoot, locale, "lines", `${id}.wav`),
      join(audioRoot, "en", "lines", `${id}.mp3`),
      join(audioRoot, "en", "lines", `${id}.wav`)
    );
  } else if (event.type === "song") {
    candidates.push(
      join(audioRoot, locale, "songs", `${id}.mp3`),
      join(audioRoot, "songs", `${id}.mp3`),
      join(audioRoot, "en", "songs", `${id}.mp3`)
    );
  } else if (event.type === "sfx") {
    candidates.push(
      join(audioRoot, locale, "sfx", `${id}.mp3`),
      join(audioRoot, "sfx", `${id}.mp3`),
      join(audioRoot, "en", "sfx", `${id}.mp3`)
    );
  } else if (event.type === "bed") {
    candidates.push(
      join(audioRoot, locale, "music", `${id}.mp3`),
      join(audioRoot, "music", `${id}.mp3`),
      join(audioRoot, "en", "music", `${id}.mp3`)
    );
  } else {
    throw new Error(`Unsupported audio clip type "${event.type}"`);
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Audio clip not found for ${event.type} "${id}" (locale="${locale}"). Checked: ${candidates.join(", ")}`
  );
}

/**
 * Computes a sample-exact bed gain envelope with:
 * - Base bed level `-18 dB` (`0.125`),
 * - Ducked `>= 12 dB` below base bed (`0.0315`, `>= 10 dB` below speech) with
 *   120 ms attack and 280 ms release whenever a spoken `"line"` is active,
 * - Dropped 50% (`0.0625`) during `"pause"` intervals,
 * - Smooth 1.5 s fade-out at episode end.
 */
export function computeDuckEnvelope({
  frameCount,
  sampleRate = DEFAULT_SAMPLE_RATE,
  speechIntervalsMs = [],
  pauseIntervalsMs = [],
  baseBedGain = BASE_BED_GAIN,
  speechDuckedGain = SPEECH_DUCKED_BED_GAIN,
  pauseBedGain = PAUSE_BED_GAIN,
  attackMs = 120,
  releaseMs = 280,
  fadeOutMs = 1500
}) {
  const n = Math.max(0, Math.floor(frameCount));
  const env = new Float32Array(n);
  if (n === 0) return env;

  const target = new Float32Array(n);
  target.fill(baseBedGain);

  for (const [startMs, endMs] of pauseIntervalsMs) {
    const s0 = Math.max(0, Math.min(n, Math.round((startMs / 1000) * sampleRate)));
    const s1 = Math.max(s0, Math.min(n, Math.round((endMs / 1000) * sampleRate)));
    for (let i = s0; i < s1; i += 1) {
      if (pauseBedGain < target[i]) target[i] = pauseBedGain;
    }
  }

  // Look-ahead by half of attack window so bed is already smoothly ducking at speech onset.
  const preDuckSamples = Math.round(((attackMs * 0.5) / 1000) * sampleRate);
  for (const [startMs, endMs] of speechIntervalsMs) {
    const s0 = Math.max(0, Math.min(n, Math.round((startMs / 1000) * sampleRate) - preDuckSamples));
    const s1 = Math.max(s0, Math.min(n, Math.round((endMs / 1000) * sampleRate)));
    for (let i = s0; i < s1; i += 1) {
      if (speechDuckedGain < target[i]) target[i] = speechDuckedGain;
    }
  }

  const attackSpan = Math.max(1, Math.round((attackMs / 1000) * sampleRate));
  const releaseSpan = Math.max(1, Math.round((releaseMs / 1000) * sampleRate));
  const maxStepDown = Math.max(1e-6, (baseBedGain - speechDuckedGain) / attackSpan);
  const maxStepUp = Math.max(1e-6, (baseBedGain - speechDuckedGain) / releaseSpan);

  let current = target[0];
  for (let i = 0; i < n; i += 1) {
    const tgt = target[i];
    if (current > tgt) {
      current = Math.max(tgt, current - maxStepDown);
    } else if (current < tgt) {
      current = Math.min(tgt, current + maxStepUp);
    }
    env[i] = current;
  }

  const fadeSamples = Math.min(n, Math.max(0, Math.round((fadeOutMs / 1000) * sampleRate)));
  if (fadeSamples > 1) {
    const fadeStart = n - fadeSamples;
    for (let i = fadeStart; i < n; i += 1) {
      const rem = (n - 1 - i) / fadeSamples;
      env[i] *= Math.max(0, rem);
    }
  }

  return env;
}

function toStereoPcm(clipEntry) {
  if (!clipEntry) return null;
  if (clipEntry instanceof Float32Array) {
    // Assume interleaved stereo by default when plain Float32Array is passed.
    return clipEntry;
  }
  const pcm = clipEntry.pcm;
  if (!(pcm instanceof Float32Array)) {
    throw new Error("Clip entry must be a Float32Array or { pcm: Float32Array, channels?: 1 | 2 }");
  }
  const channels = clipEntry.channels ?? 2;
  if (channels === 2) return pcm;
  if (channels === 1) {
    const stereo = new Float32Array(pcm.length * 2);
    for (let i = 0; i < pcm.length; i += 1) {
      stereo[i * 2] = pcm[i];
      stereo[i * 2 + 1] = pcm[i];
    }
    return stereo;
  }
  throw new Error(`Unsupported channel count: ${channels}`);
}

function lookupClipStereo(clipsByKey, type, id) {
  if (!clipsByKey) return null;
  const typedKey = `${type}:${id}`;
  const raw =
    clipsByKey instanceof Map
      ? (clipsByKey.get(typedKey) ?? clipsByKey.get(id))
      : (clipsByKey[typedKey] ?? clipsByKey[id]);
  return raw ? toStereoPcm(raw) : null;
}

function pairIntervals(events, matchType, totalDurationMs, defaultDurationMs = null) {
  const intervals = [];
  const openById = new Map();

  for (const ev of events) {
    if (!ev || ev.type !== matchType) continue;
    const action = ev.action ?? "start";
    const key = ev.id ?? "__default__";
    const t = Math.max(0, Number(ev.t) || 0);

    if (action === "start") {
      if (openById.has(key)) {
        const prevStart = openById.get(key);
        if (t > prevStart.t) {
          intervals.push({ id: ev.id, startMs: prevStart.t, endMs: t, event: prevStart });
        }
      }
      if (Number.isFinite(ev.durationMs) && ev.durationMs > 0) {
        intervals.push({ id: ev.id, startMs: t, endMs: Math.min(totalDurationMs, t + ev.durationMs), event: ev });
      } else {
        openById.set(key, { ...ev, t });
      }
    } else if (action === "stop") {
      const open = openById.get(key) ?? (key === "__default__" ? [...openById.values()][0] : undefined);
      if (open) {
        openById.delete(open.id ?? "__default__");
        if (t > open.t) {
          intervals.push({ id: open.id, startMs: open.t, endMs: Math.min(totalDurationMs, t), event: open });
        }
      }
    }
  }

  for (const [, open] of openById.entries()) {
    const endMs =
      defaultDurationMs !== null
        ? Math.min(totalDurationMs, open.t + defaultDurationMs)
        : totalDurationMs;
    if (endMs > open.t) {
      intervals.push({ id: open.id, startMs: open.t, endMs, event: open });
    }
  }

  return intervals;
}

function renderLoopedBedIntoMix(mixStereo, bedStereo, startSample, endSample, duckEnvelope, sampleRate) {
  const totalFrames = Math.floor(mixStereo.length / 2);
  const bedFrames = Math.floor(bedStereo.length / 2);
  if (bedFrames <= 0) return;

  const s0 = Math.max(0, Math.min(totalFrames, startSample));
  const s1 = Math.max(s0, Math.min(totalFrames, endSample));
  const span = s1 - s0;
  if (span <= 0) return;

  const xfade = Math.min(Math.round(0.25 * sampleRate), Math.floor(bedFrames / 3), Math.floor(span / 2));
  const edgeFade = Math.min(Math.round(0.25 * sampleRate), Math.floor(span / 2));
  const stepFrames = Math.max(1, bedFrames - xfade);

  let cursor = s0;
  let cycle = 0;
  while (cursor < s1) {
    const chunkLen = Math.min(bedFrames, s1 - cursor);
    for (let i = 0; i < chunkLen; i += 1) {
      const outIdx = cursor + i;
      let weight = 1.0;

      // Crossfade in on subsequent loop iterations; fade-in on iteration 0.
      if (cycle === 0) {
        if (edgeFade > 0 && outIdx - s0 < edgeFade) {
          weight *= (outIdx - s0) / edgeFade;
        }
      } else if (xfade > 0 && i < xfade) {
        weight *= i / xfade;
      }

      // Crossfade out when another iteration follows.
      const nextCursor = cursor + stepFrames;
      if (xfade > 0 && nextCursor < s1 && i >= stepFrames) {
        const fadePos = i - stepFrames;
        weight *= Math.max(0, 1 - fadePos / xfade);
      }

      // Segment stop fade-out.
      if (edgeFade > 0 && s1 - outIdx <= edgeFade) {
        weight *= Math.max(0, (s1 - outIdx) / edgeFade);
      }

      const gain = weight * (duckEnvelope ? duckEnvelope[outIdx] : BASE_BED_GAIN);
      mixStereo[outIdx * 2] += bedStereo[i * 2] * gain;
      mixStereo[outIdx * 2 + 1] += bedStereo[i * 2 + 1] * gain;
    }
    if (bedFrames <= xfade || cursor + stepFrames <= cursor) {
      break;
    }
    cursor += stepFrames;
    cycle += 1;
  }
}

/**
 * Sample-exact 48 kHz stereo timeline mixer.
 * Places every `"line"`, `"song"`, `"sfx"` at `Math.round((event.t / 1000) * sampleRate)`
 * and loops `"bed"` tracks with 250 ms crossfades and smooth speech/pause ducking.
 */
export function mixTimelineBuffers({
  durationMs,
  sampleRate = DEFAULT_SAMPLE_RATE,
  events = [],
  clipsByKey = {},
  fadeOutMs = 1500
}) {
  const frameCount = Math.max(1, Math.round((Math.max(1, durationMs) / 1000) * sampleRate));
  const mixStereo = new Float32Array(frameCount * 2);

  const speechIntervalsMs = [];
  const linePlacements = [];

  for (const ev of events) {
    if (!ev || ev.type !== "line" || (ev.action ?? "start") !== "start") continue;
    const stereo = lookupClipStereo(clipsByKey, "line", ev.id);
    if (!stereo) continue;
    const clipFrames = Math.floor(stereo.length / 2);
    const startMs = Math.max(0, Number(ev.t) || 0);
    const clipMs = (clipFrames / sampleRate) * 1000;
    const endMs = startMs + clipMs;
    speechIntervalsMs.push([startMs, endMs]);
    linePlacements.push({ ev, stereo, startSample: Math.round((startMs / 1000) * sampleRate), clipFrames });
  }

  const pauseIntervals = pairIntervals(events, "pause", durationMs, 2500).map((p) => [p.startMs, p.endMs]);

  const duckEnvelope = computeDuckEnvelope({
    frameCount,
    sampleRate,
    speechIntervalsMs,
    pauseIntervalsMs: pauseIntervals,
    fadeOutMs
  });

  // Song ducking envelope: unity (0.75) normally, gently ducked to 0.20 under overlapping spoken lines.
  const songEnvelope = computeDuckEnvelope({
    frameCount,
    sampleRate,
    speechIntervalsMs,
    pauseIntervalsMs: [],
    baseBedGain: 0.75,
    speechDuckedGain: 0.20,
    pauseBedGain: 0.75,
    attackMs: 120,
    releaseMs: 280,
    fadeOutMs
  });

  // 1. Render background music beds with 250 ms loop crossfades and speech/pause ducking.
  const bedIntervals = pairIntervals(events, "bed", durationMs, null);
  for (const interval of bedIntervals) {
    const bedStereo = lookupClipStereo(clipsByKey, "bed", interval.id);
    if (!bedStereo) continue;
    const startSample = Math.round((interval.startMs / 1000) * sampleRate);
    const endSample = Math.round((interval.endMs / 1000) * sampleRate);
    renderLoopedBedIntoMix(mixStereo, bedStereo, startSample, endSample, duckEnvelope, sampleRate);
  }

  // 2. Place songs at exact sample offsets, gently ducked under overlapping lines.
  for (const ev of events) {
    if (!ev || ev.type !== "song" || (ev.action ?? "start") !== "start") continue;
    const stereo = lookupClipStereo(clipsByKey, "song", ev.id);
    if (!stereo) continue;
    const clipFrames = Math.floor(stereo.length / 2);
    const startSample = Math.round((Math.max(0, Number(ev.t) || 0) / 1000) * sampleRate);
    const userGain = Number.isFinite(ev.gain) ? ev.gain : 1.0;
    const maxFrames = Math.min(clipFrames, Math.max(0, frameCount - startSample));
    for (let i = 0; i < maxFrames; i += 1) {
      const idx = startSample + i;
      const g = songEnvelope[idx] * userGain;
      mixStereo[idx * 2] += stereo[i * 2] * g;
      mixStereo[idx * 2 + 1] += stereo[i * 2 + 1] * g;
    }
  }

  // 3. Place SFX at exact sample offsets (capped below speech peak).
  for (const ev of events) {
    if (!ev || ev.type !== "sfx" || (ev.action ?? "start") !== "start") continue;
    const stereo = lookupClipStereo(clipsByKey, "sfx", ev.id);
    if (!stereo) continue;
    const clipFrames = Math.floor(stereo.length / 2);
    const startSample = Math.round((Math.max(0, Number(ev.t) || 0) / 1000) * sampleRate);
    const baseSfxGain = Number.isFinite(ev.gain) ? ev.gain : 0.55;
    const maxFrames = Math.min(clipFrames, Math.max(0, frameCount - startSample));
    for (let i = 0; i < maxFrames; i += 1) {
      const idx = startSample + i;
      const underSpeech = duckEnvelope[idx] < PAUSE_BED_GAIN * 0.85;
      const g = underSpeech ? Math.min(baseSfxGain, 0.32) : baseSfxGain;
      mixStereo[idx * 2] += stereo[i * 2] * g;
      mixStereo[idx * 2 + 1] += stereo[i * 2 + 1] * g;
    }
  }

  // 4. Place spoken lines at exact sample offsets (`Math.round((t / 1000) * sampleRate)`).
  for (const { ev, stereo, startSample, clipFrames } of linePlacements) {
    const lineGain = Number.isFinite(ev.gain) ? ev.gain : 1.0;
    const maxFrames = Math.min(clipFrames, Math.max(0, frameCount - startSample));
    for (let i = 0; i < maxFrames; i += 1) {
      const idx = startSample + i;
      mixStereo[idx * 2] += stereo[i * 2] * lineGain;
      mixStereo[idx * 2 + 1] += stereo[i * 2 + 1] * lineGain;
    }
  }

  // Soft-knee safety clamp so raw mix never clips > 0.98 before EBU R128 mastering.
  for (let s = 0; s < mixStereo.length; s += 1) {
    const v = mixStereo[s];
    if (v > 0.98) mixStereo[s] = 0.98 + 0.02 * Math.tanh((v - 0.98) * 10);
    else if (v < -0.98) mixStereo[s] = -0.98 + 0.02 * Math.tanh((v + 0.98) * 10);
  }

  return {
    pcmStereo: mixStereo,
    frameCount,
    sampleRate,
    speechIntervalsMs,
    pauseIntervalsMs: pauseIntervals,
    duckEnvelope
  };
}

/** Encodes an interleaved Float32 stereo array as a standard 32-bit IEEE float WAV buffer. */
export function encodeWavFloat32Stereo(pcmStereo, sampleRate = DEFAULT_SAMPLE_RATE) {
  const numChannels = 2;
  const bitsPerSample = 32;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmStereo.byteLength;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(3, 20); // WAVE_FORMAT_IEEE_FLOAT
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);

  const payload = Buffer.from(pcmStereo.buffer, pcmStereo.byteOffset, pcmStereo.byteLength);
  return Buffer.concat([header, payload]);
}

function escapeFfmetaValue(str) {
  return String(str ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/=/g, "\\=")
    .replace(/;/g, "\\;")
    .replace(/#/g, "\\#")
    .replace(/\n/g, " ");
}

/**
 * Generates FFmpeg `FFMETADATA1` chapters text from `ShowSpec.chapters`.
 */
export function buildFfmetadataChapters(chapters, segmentTimesMs = {}, totalDurationMs = 0, localePack = null, title = "") {
  const list = Array.isArray(chapters) ? chapters : [];
  const lines = [";FFMETADATA1"];
  if (title) {
    lines.push(`title=${escapeFfmetaValue(title)}`);
  }
  if (list.length === 0) {
    return lines.join("\n") + "\n";
  }

  const resolved = list.map((ch, idx) => {
    const segKey = ch.segmentId ?? ch.atSegment ?? `s${idx + 1}`;
    const startMs =
      Number.isFinite(ch.atSec) && ch.atSec >= 0
        ? Math.round(ch.atSec * 1000)
        : Number.isFinite(segmentTimesMs[segKey])
          ? Math.round(segmentTimesMs[segKey])
          : idx === 0
            ? 0
            : Math.round((idx / list.length) * totalDurationMs);
    const label =
      localePack?.strings?.[ch.titleKey] ??
      localePack?.lines?.[ch.titleKey] ??
      ch.title ??
      ch.titleKey ??
      `Chapter ${idx + 1}`;
    return { startMs, label };
  });

  resolved.sort((a, b) => a.startMs - b.startMs);

  for (let i = 0; i < resolved.length; i += 1) {
    const start = Math.max(0, resolved[i].startMs);
    const nextStart = i + 1 < resolved.length ? resolved[i + 1].startMs : totalDurationMs;
    const end = Math.max(start + 1000, nextStart);
    lines.push("");
    lines.push("[CHAPTER]");
    lines.push("TIMEBASE=1/1000");
    lines.push(`START=${start}`);
    lines.push(`END=${end}`);
    lines.push(`title=${escapeFfmetaValue(resolved[i].label)}`);
  }

  return lines.join("\n") + "\n";
}

async function decodeClipToFloat32Stereo(filePath, sampleRate = DEFAULT_SAMPLE_RATE) {
  const { stdout } = await execFileAsync(
    FFMPEG,
    [
      "-v",
      "error",
      "-i",
      filePath,
      "-f",
      "f32le",
      "-ac",
      "2",
      "-ar",
      String(sampleRate),
      "pipe:1"
    ],
    { encoding: "buffer", maxBuffer: 256 * 1024 * 1024 }
  );
  const floatCount = Math.floor(stdout.byteLength / 4);
  const out = new Float32Array(floatCount);
  Buffer.from(stdout.buffer, stdout.byteOffset, floatCount * 4).copy(
    Buffer.from(out.buffer, out.byteOffset, out.byteLength)
  );
  return out;
}

/** Measures Integrated Loudness (LUFS) and True Peak (dBTP) via FFmpeg `ebur128=peak=true`. */
export async function measureEbur128(mediaPath) {
  const { stderr } = await execFileAsync(
    FFMPEG,
    ["-nostats", "-i", mediaPath, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );

  const summaryIdx = stderr.lastIndexOf("Summary:");
  const tail = summaryIdx >= 0 ? stderr.slice(summaryIdx) : stderr;

  const iMatch = /\bI:\s*(-?\d+(?:\.\d+)?)\s*LUFS/.exec(tail);
  const lraMatch = /\bLRA:\s*(-?\d+(?:\.\d+)?)\s*LU/.exec(tail);
  const tpMatch = /\bPeak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/.exec(tail);

  return {
    integratedLufs: iMatch ? Number(iMatch[1]) : NaN,
    lraLu: lraMatch ? Number(lraMatch[1]) : NaN,
    truePeakDbtp: tpMatch ? Number(tpMatch[1]) : NaN,
    rawSummary: tail.trim()
  };
}

async function masterToMinus14Lufs(rawWavPath, masterWavPath) {
  // Pass 1: measure loudnorm JSON stats.
  const { stderr: pass1Stderr } = await execFileAsync(
    FFMPEG,
    [
      "-nostats",
      "-i",
      rawWavPath,
      "-af",
      "loudnorm=I=-14:TP=-1.6:LRA=9:print_format=json",
      "-f",
      "null",
      "-"
    ],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );

  let loudnormJson = null;
  const jsonBlocks = pass1Stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/g);
  if (jsonBlocks && jsonBlocks.length > 0) {
    try {
      loudnormJson = JSON.parse(jsonBlocks[jsonBlocks.length - 1]);
    } catch {
      loudnormJson = null;
    }
  }

  // Ceiling 0.822 (~ -1.70 dBFS) gives extra headroom for AAC 192k mux overshoot while staying <= -1.2 dBTP.
  const limiterFilter = "alimiter=limit=0.822:attack=5:release=50:level=false";
  const measuredI = loudnormJson ? Number(loudnormJson.input_i) : NaN;

  if (loudnormJson && Number.isFinite(measuredI) && measuredI > -65) {
    const lnFilter =
      `loudnorm=I=-14:TP=-1.6:LRA=9:` +
      `measured_I=${loudnormJson.input_i}:` +
      `measured_TP=${loudnormJson.input_tp}:` +
      `measured_LRA=${loudnormJson.input_lra}:` +
      `measured_thresh=${loudnormJson.input_thresh}:` +
      `offset=${loudnormJson.target_offset}:linear=true,${limiterFilter}`;
    await execFileAsync(
      FFMPEG,
      ["-y", "-v", "error", "-i", rawWavPath, "-af", lnFilter, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", masterWavPath]
    );
  } else {
    await execFileAsync(
      FFMPEG,
      [
        "-y",
        "-v",
        "error",
        "-i",
        rawWavPath,
        "-af",
        `loudnorm=I=-14:TP=-1.6:LRA=9,${limiterFilter}`,
        "-ar",
        "48000",
        "-ac",
        "2",
        "-c:a",
        "pcm_s24le",
        masterWavPath
      ]
    );
  }

  // Verify via ebur128 and apply exact linear gain trim if outside -14.0 +/- 0.55 LUFS or TP > -1.35 dBTP.
  let metrics = await measureEbur128(masterWavPath);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const iOk = Number.isFinite(metrics.integratedLufs) && Math.abs(metrics.integratedLufs - -14.0) <= 0.55;
    const tpOk = Number.isFinite(metrics.truePeakDbtp) && metrics.truePeakDbtp <= -1.35;
    if (iOk && tpOk) break;
    if (!Number.isFinite(metrics.integratedLufs) || metrics.integratedLufs <= -70) break;

    const deltaDb = -14.0 - metrics.integratedLufs;
    const tmpOut = `${masterWavPath}.trim${attempt}.wav`;
    // If large boost is needed on sparse audio, gently compress peaks before linear gain + true-peak limiter.
    const filterChain =
      deltaDb > 2.5
        ? `acompressor=threshold=-16dB:ratio=3:attack=5:release=60:makeup=1,volume=${deltaDb.toFixed(3)}dB,${limiterFilter}`
        : `volume=${deltaDb.toFixed(3)}dB,${limiterFilter}`;
    await execFileAsync(
      FFMPEG,
      ["-y", "-v", "error", "-i", masterWavPath, "-af", filterChain, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", tmpOut]
    );
    renameSync(tmpOut, masterWavPath);
    metrics = await measureEbur128(masterWavPath);
  }

  return metrics;
}

async function tryLoadShowChaptersAndLocale(id, localeCode, customAppDir) {
  try {
    const req = getRootRequire();
    const { tsImport } = req("tsx/esm/api");
    const parentUrl = pathToFileURL(join(customAppDir, "package.json")).href;
    const enMod = await tsImport("./src/localization/en/index.ts", parentUrl);
    let show = null;
    const showsIndex = join(customAppDir, "src", "content", "shows", "index.ts");
    if (existsSync(showsIndex)) {
      const showsMod = await tsImport("./src/content/shows/index.ts", parentUrl);
      show = showsMod.showById ? showsMod.showById(id) : (showsMod.SHOWS ?? []).find((s) => s.id === id);
    }
    let localePack = enMod.en;
    if (localeCode !== "en") {
      const locTs = join(customAppDir, "src", "localization", `${localeCode}.ts`);
      if (existsSync(locTs)) {
        const mod = await tsImport(`./src/localization/${localeCode}.ts`, parentUrl);
        localePack = mod[localeCode] ?? enMod.en;
      }
    }
    return { show, localePack };
  } catch {
    return { show: null, localePack: null };
  }
}

export async function mixEpisodeDir({ dir, locale = null, customAppDir = appDir }) {
  if (!dir) {
    throw new Error("Missing required --dir <episodeOutputDir>");
  }
  const outDir = resolve(dir);
  mkdirSync(outDir, { recursive: true });

  const eventsPath = join(outDir, "events.json");
  if (!existsSync(eventsPath)) {
    throw new Error(`events.json not found in ${outDir}`);
  }
  const eventsData = JSON.parse(readFileSync(eventsPath, "utf8"));
  const effectiveLocale = locale ?? eventsData.locale ?? "en";
  const durationMs = Math.max(1000, Number(eventsData.durationMs) || 1000);
  const events = Array.isArray(eventsData.events) ? eventsData.events : [];

  // Decode each unique audio clip once at 48 kHz stereo Float32.
  const clipCacheByPath = new Map();
  const clipsByKey = new Map();

  for (const ev of events) {
    if (!ev || !["line", "song", "sfx", "bed"].includes(ev.type)) continue;
    if ((ev.action ?? "start") !== "start") continue;
    const typedKey = `${ev.type}:${ev.id}`;
    if (clipsByKey.has(typedKey)) continue;

    const clipPath = resolveAudioClipPath(ev, effectiveLocale, customAppDir);
    let pcmStereo = clipCacheByPath.get(clipPath);
    if (!pcmStereo) {
      pcmStereo = await decodeClipToFloat32Stereo(clipPath, DEFAULT_SAMPLE_RATE);
      clipCacheByPath.set(clipPath, pcmStereo);
    }
    clipsByKey.set(typedKey, pcmStereo);
  }

  const mixResult = mixTimelineBuffers({
    durationMs,
    sampleRate: DEFAULT_SAMPLE_RATE,
    events,
    clipsByKey,
    fadeOutMs: 1500
  });

  const rawMixPath = join(outDir, "raw-mix.wav");
  writeFileSync(rawMixPath, encodeWavFloat32Stereo(mixResult.pcmStereo, DEFAULT_SAMPLE_RATE));

  const masterWavPath = join(outDir, "master.wav");
  const masterMetrics = await masterToMinus14Lufs(rawMixPath, masterWavPath);

  const { show, localePack } = await tryLoadShowChaptersAndLocale(
    eventsData.id,
    effectiveLocale,
    customAppDir
  );
  const chapters = eventsData.chapters ?? show?.chapters ?? [];
  const segmentTimesMs = eventsData.segmentStartMsById ?? eventsData.beatStartMsById ?? {};
  const titleText =
    show?.youtube?.title ??
    (show?.titleKey && localePack?.strings?.[show.titleKey]) ??
    eventsData.id ??
    "Wonder World";

  const chaptersMetaPath = join(outDir, "chapters.ffmeta");
  writeFileSync(
    chaptersMetaPath,
    buildFfmetadataChapters(chapters, segmentTimesMs, durationMs, localePack, titleText),
    "utf8"
  );

  const framesMp4Path = join(outDir, "frames.mp4");
  const srtPath = join(outDir, `captions.${effectiveLocale}.srt`);
  const hasSrt = existsSync(srtPath) && readFileSync(srtPath, "utf8").trim().length > 0;
  const episodeMp4Path = join(outDir, "episode.mp4");

  if (existsSync(framesMp4Path)) {
    const muxArgs = [
      "-y",
      "-v",
      "error",
      "-i",
      framesMp4Path,
      "-i",
      masterWavPath,
      "-f",
      "ffmetadata",
      "-i",
      chaptersMetaPath
    ];
    if (hasSrt) {
      muxArgs.push("-i", srtPath);
    }
    muxArgs.push("-map", "0:v:0", "-map", "1:a:0", "-map_metadata", "2", "-map_chapters", "2");
    if (hasSrt) {
      muxArgs.push(
        "-map",
        "3:s:0",
        "-c:s",
        "mov_text",
        "-metadata:s:s:0",
        `language=${effectiveLocale === "pa" ? "pan" : "eng"}`
      );
    }
    muxArgs.push(
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      episodeMp4Path
    );
    await execFileAsync(FFMPEG, muxArgs);
  }

  const finalMetrics = existsSync(episodeMp4Path)
    ? await measureEbur128(episodeMp4Path)
    : masterMetrics;

  const mixReport = {
    id: eventsData.id ?? null,
    locale: effectiveLocale,
    durationMs,
    uniqueClipsDecoded: clipCacheByPath.size,
    speechIntervalsCount: mixResult.speechIntervalsMs.length,
    pauseIntervalsCount: mixResult.pauseIntervalsMs.length,
    masterWavMetrics: masterMetrics,
    episodeMp4Metrics: finalMetrics
  };
  writeFileSync(join(outDir, "mix-report.json"), JSON.stringify(mixReport, null, 2) + "\n");

  return {
    outDir,
    rawMixPath,
    masterWavPath,
    chaptersMetaPath,
    episodeMp4Path: existsSync(episodeMp4Path) ? episodeMp4Path : null,
    metrics: finalMetrics
  };
}

function parseCliArgs(argv) {
  const opts = { dir: null, locale: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dir" && argv[i + 1]) {
      opts.dir = argv[++i];
    } else if (arg.startsWith("--dir=")) {
      opts.dir = arg.slice("--dir=".length);
    } else if (arg === "--locale" && argv[i + 1]) {
      opts.locale = argv[++i];
    } else if (arg.startsWith("--locale=")) {
      opts.locale = arg.slice("--locale=".length);
    }
  }
  return opts;
}

function isExecutedDirectly(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return fileURLToPath(metaUrl) === process.argv[1];
  }
}

if (isExecutedDirectly(import.meta.url)) {
  const cliOpts = parseCliArgs(process.argv.slice(2));
  mixEpisodeDir(cliOpts)
    .then((res) => {
      console.log(
        `[mix-episode] ${res.episodeMp4Path ?? res.masterWavPath} (I=${res.metrics.integratedLufs} LUFS, TP=${res.metrics.truePeakDbtp} dBTP)`
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[mix-episode] FAILED: ${err?.message ?? err}`);
      process.exit(1);
    });
}
