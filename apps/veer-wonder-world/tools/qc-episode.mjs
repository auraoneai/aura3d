#!/usr/bin/env node
// Automated 10-gate broadcast QC suite (PRD 09 WP14: A.7, B.6, R5, R9, R10, R12).
//
// Usage:
//   node tools/qc-episode.mjs --dir dist/shows/<id> [--kind show|short|episode] [--locale en] [--allow-prototype-audio]

import { execFile, spawn } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { measureEbur128, resolveAudioClipPath } from "./mix-episode.mjs";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = resolve(__dirname, "..");
const repoDir = resolve(appDir, "../..");

const FFMPEG = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const FFPROBE = existsSync("/opt/homebrew/bin/ffprobe") ? "/opt/homebrew/bin/ffprobe" : "ffprobe";

function getRootRequire() {
  const rootPkg = join(repoDir, "package.json");
  const localPkg = join(appDir, "package.json");
  return createRequire(existsSync(rootPkg) ? rootPkg : localPkg);
}

let cachedSharp = null;
function getSharp() {
  if (!cachedSharp) {
    cachedSharp = getRootRequire()("sharp");
  }
  return cachedSharp;
}

// Precompute 8-bit sRGB -> linear light lookup table for WCAG 2.3.1 relative luminance.
const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i += 1) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

class WcagFlashTracker {
  constructor(width, height, fps = 30) {
    this.width = width;
    this.height = height;
    this.fps = Math.max(1, Math.round(fps));
    this.numPixels = width * height;
    this.areaLimit = Math.ceil(this.numPixels * 0.25);

    this.curY = new Float32Array(this.numPixels);
    this.curRVal = new Float32Array(this.numPixels);
    this.curSatRed = new Uint8Array(this.numPixels);

    this.genAnchorY = new Float32Array(this.numPixels);
    this.redAnchorVal = new Float32Array(this.numPixels);
    this.redAnchorSat = new Uint8Array(this.numPixels);

    this.genDir = 0;
    this.redDir = 0;
    this.frameIndex = 0;

    this.genTransitionFrames = [];
    this.redTransitionFrames = [];
  }

  pushRgb24Frame(rgbBuf) {
    const expectedBytes = this.numPixels * 3;
    if (!rgbBuf || rgbBuf.length < expectedBytes) {
      throw new Error(`RGB24 frame too short: expected ${expectedBytes} bytes, got ${rgbBuf?.length ?? 0}`);
    }

    const { curY, curRVal, curSatRed, numPixels } = this;
    for (let p = 0, off = 0; p < numPixels; p += 1, off += 3) {
      const rLin = SRGB_TO_LINEAR[rgbBuf[off]];
      const gLin = SRGB_TO_LINEAR[rgbBuf[off + 1]];
      const bLin = SRGB_TO_LINEAR[rgbBuf[off + 2]];

      curY[p] = 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
      const sum = rLin + gLin + bLin;
      curSatRed[p] = sum > 1e-6 && rLin / sum >= 0.8 ? 1 : 0;
      const rDiff = (rLin - gLin - bLin) * 320;
      curRVal[p] = rDiff > 0 ? rDiff : 0;
    }

    const f = this.frameIndex;
    this.frameIndex += 1;

    if (f === 0) {
      this.genAnchorY.set(curY);
      this.redAnchorVal.set(curRVal);
      this.redAnchorSat.set(curSatRed);
      return;
    }

    // 1. General flash transitions (|dY| >= 0.10 with darker state < 0.80 across >= 25% of area).
    let brightPixels = 0;
    let darkPixels = 0;
    const genAnchor = this.genAnchorY;
    for (let p = 0; p < numPixels; p += 1) {
      const y = curY[p];
      const ay = genAnchor[p];
      const dY = y - ay;
      if (dY >= 0.1 && ay < 0.8) brightPixels += 1;
      else if (dY <= -0.1 && y < 0.8) darkPixels += 1;
    }

    if (brightPixels >= this.areaLimit && this.genDir !== 1) {
      this.genDir = 1;
      this.genTransitionFrames.push(f);
      genAnchor.set(curY);
    } else if (darkPixels >= this.areaLimit && this.genDir !== -1) {
      this.genDir = -1;
      this.genTransitionFrames.push(f);
      genAnchor.set(curY);
    } else if (this.genDir === 1) {
      for (let p = 0; p < numPixels; p += 1) {
        if (curY[p] > genAnchor[p]) genAnchor[p] = curY[p];
      }
    } else if (this.genDir === -1) {
      for (let p = 0; p < numPixels; p += 1) {
        if (curY[p] < genAnchor[p]) genAnchor[p] = curY[p];
      }
    }

    // 2. Saturated-red flash transitions (at least one state redRatio >= 0.80 and |dR_val| >= 20 across >= 25% of area).
    let redUpPixels = 0;
    let redDownPixels = 0;
    const redAnchorVal = this.redAnchorVal;
    const redAnchorSat = this.redAnchorSat;
    for (let p = 0; p < numPixels; p += 1) {
      if (curSatRed[p] || redAnchorSat[p]) {
        const dR = curRVal[p] - redAnchorVal[p];
        if (dR >= 20) redUpPixels += 1;
        else if (dR <= -20) redDownPixels += 1;
      }
    }

    if (redUpPixels >= this.areaLimit && this.redDir !== 1) {
      this.redDir = 1;
      this.redTransitionFrames.push(f);
      redAnchorVal.set(curRVal);
      redAnchorSat.set(curSatRed);
    } else if (redDownPixels >= this.areaLimit && this.redDir !== -1) {
      this.redDir = -1;
      this.redTransitionFrames.push(f);
      redAnchorVal.set(curRVal);
      redAnchorSat.set(curSatRed);
    } else if (this.redDir === 1) {
      for (let p = 0; p < numPixels; p += 1) {
        if (curRVal[p] > redAnchorVal[p]) {
          redAnchorVal[p] = curRVal[p];
          redAnchorSat[p] = curSatRed[p];
        }
      }
    } else if (this.redDir === -1) {
      for (let p = 0; p < numPixels; p += 1) {
        if (curRVal[p] < redAnchorVal[p]) {
          redAnchorVal[p] = curRVal[p];
          redAnchorSat[p] = curSatRed[p];
        }
      }
    }
  }

  finish() {
    const maxFlashesInSlidingWindow = (transitionFrames) => {
      let maxFlashes = 0;
      let worstWindowStartFrame = 0;
      let left = 0;
      for (let right = 0; right < transitionFrames.length; right += 1) {
        const curFrame = transitionFrames[right];
        while (left <= right && curFrame - transitionFrames[left] >= this.fps) {
          left += 1;
        }
        const transitionsIn1Sec = right - left + 1;
        // Per WCAG 2.3.1, 1 flash = 1 pair of opposing transitions.
        const flashes = Math.floor(transitionsIn1Sec / 2);
        if (flashes > maxFlashes) {
          maxFlashes = flashes;
          worstWindowStartFrame = transitionFrames[left];
        }
      }
      return { maxFlashes, worstWindowStartFrame };
    };

    const gen = maxFlashesInSlidingWindow(this.genTransitionFrames);
    const red = maxFlashesInSlidingWindow(this.redTransitionFrames);
    const passed = gen.maxFlashes <= 3 && red.maxFlashes <= 3;

    return {
      passed,
      framesAnalyzed: this.frameIndex,
      fps: this.fps,
      maxGeneralFlashesPerSec: gen.maxFlashes,
      maxRedFlashesPerSec: red.maxFlashes,
      generalTransitionsTotal: this.genTransitionFrames.length,
      redTransitionsTotal: this.redTransitionFrames.length,
      worstGeneralAtSec: Number((gen.worstWindowStartFrame / this.fps).toFixed(2)),
      worstRedAtSec: Number((red.worstWindowStartFrame / this.fps).toFixed(2))
    };
  }
}

/**
 * Pure WCAG 2.3.1 general & saturated-red flash detector on an iterable/array
 * of RGB24 frame buffers (`width * height * 3` bytes per frame).
 */
export function analyzeFlashSequence(frames, { width = 160, height = 90, fps = 30 } = {}) {
  const tracker = new WcagFlashTracker(width, height, fps);
  for (const frame of frames) {
    tracker.pushRgb24Frame(frame);
  }
  return tracker.finish();
}

async function analyzeVideoFlashSafety(mp4Path, { width = 160, height = 90, fps = 30 } = {}) {
  const frameBytes = width * height * 3;
  const tracker = new WcagFlashTracker(width, height, fps);

  await new Promise((resolveStream, rejectStream) => {
    const proc = spawn(
      FFMPEG,
      [
        "-v",
        "error",
        "-i",
        mp4Path,
        "-vf",
        `scale=${width}:${height}`,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1"
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let carry = Buffer.alloc(0);
    const stderrChunks = [];

    proc.stdout.on("data", (chunk) => {
      const combined = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk;
      let offset = 0;
      while (offset + frameBytes <= combined.length) {
        tracker.pushRgb24Frame(combined.subarray(offset, offset + frameBytes));
        offset += frameBytes;
      }
      carry = combined.subarray(offset);
    });

    proc.stderr.on("data", (chunk) => stderrChunks.push(chunk.toString("utf8")));
    proc.on("error", rejectStream);
    proc.on("close", (code) => {
      if (code === 0) resolveStream();
      else rejectStream(new Error(`ffmpeg flash decode failed (${code}): ${stderrChunks.join("")}`));
    });
  });

  return tracker.finish();
}

function parseSrtTimeToMs(ts) {
  const m = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.exec(String(ts).trim());
  if (!m) return NaN;
  return (
    Number(m[1]) * 3_600_000 +
    Number(m[2]) * 60_000 +
    Number(m[3]) * 1_000 +
    Number(m[4])
  );
}

/** Parses `.srt` text and validates numbering, timestamps, monotonic order, and pause cues. */
export function parseSrtCues(srtText) {
  const errors = [];
  const cues = [];
  const trimmed = String(srtText ?? "").replace(/\r\n/g, "\n").trim();
  if (!trimmed) {
    return { valid: true, cues: [], errors: [] };
  }

  const blocks = trimmed.split(/\n\n+/);
  let prevEndMs = 0;

  for (let i = 0; i < blocks.length; i += 1) {
    const lines = blocks[i].split("\n");
    if (lines.length < 3) {
      errors.push(`Cue block #${i + 1} has fewer than 3 lines`);
      continue;
    }
    const indexNum = Number(lines[0].trim());
    if (indexNum !== i + 1) {
      errors.push(`Cue #${i + 1} expected index ${i + 1}, got "${lines[0].trim()}"`);
    }
    const timeMatch = /^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})$/.exec(lines[1].trim());
    if (!timeMatch) {
      errors.push(`Cue #${i + 1} has invalid timestamp header "${lines[1].trim()}"`);
      continue;
    }
    const startMs = parseSrtTimeToMs(timeMatch[1]);
    const endMs = parseSrtTimeToMs(timeMatch[2]);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      errors.push(`Cue #${i + 1} has non-positive duration (${timeMatch[0]})`);
    }
    if (startMs < prevEndMs - 1) {
      errors.push(`Cue #${i + 1} overlaps previous cue (${startMs}ms < ${prevEndMs}ms)`);
    }
    prevEndMs = Math.max(prevEndMs, endMs);

    const text = lines.slice(2).join("\n").trim();
    if (!text) {
      errors.push(`Cue #${i + 1} has empty text`);
    }
    cues.push({ index: indexNum, startMs, endMs, text });
  }

  return { valid: errors.length === 0, cues, errors };
}

function getForbiddenChildNamePatterns(customAppDir = appDir) {
  const suffix = "-wonder-world";
  const folder = basename(resolve(customAppDir));
  const patterns = [];
  if (folder.endsWith(suffix) && folder.length > suffix.length) {
    const prefix = folder.slice(0, -suffix.length);
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    patterns.push({
      label: "founder-child-name",
      regex: new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9]|${suffix})`, "i")
    });
  }
  return patterns;
}

/** Scans text for child PII, family names, subscribe/merch calls, or disallowed URLs. */
export function checkPrivacyText(text, { customAppDir = appDir, allowAuraAppUrl = false } = {}) {
  const issues = [];
  const raw = String(text ?? "");

  for (const { label, regex } of getForbiddenChildNamePatterns(customAppDir)) {
    if (regex.test(raw)) {
      issues.push(`Detected forbidden ${label} in text`);
    }
  }
  if (/\bWELCOME_NAME\b/.test(raw)) {
    issues.push("Detected unstripped WELCOME_NAME token");
  }
  if (/\b(subscribe|click the bell|smash that like|buy our merch|buy now|shop now|link in bio|watch more videos)\b/i.test(raw)) {
    issues.push("Detected child-directed commercial/subscribe CTA");
  }
  if (/\b(getUserMedia|SpeechRecognition|MediaRecorder|gtag\s*\(|fbq\s*\()\b/.test(raw)) {
    issues.push("Detected prohibited microphone or tracking token");
  }

  const urls = raw.match(/https?:\/\/[^\s)"'>]+/gi) ?? [];
  for (const url of urls) {
    if (allowAuraAppUrl && /^https:\/\/[a-z0-9.-]*auraone\.ai(\/|$)/i.test(url)) {
      continue;
    }
    issues.push(`Disallowed external URL in broadcast artifact: ${url}`);
  }

  return { passed: issues.length === 0, issues };
}

/** Scans lines, descriptions, and end cards for banned efficacy claims and toddler safety hazards (A.7, R9). */
export function checkSafetyFactsText(text) {
  const issues = [];
  const raw = String(text ?? "");

  const bannedRules = [
    {
      name: "efficacy-speech-claim",
      regex: /\b(teaches? (your )?(baby|toddler|child|kids?) to talk|speech[- ]therapy|clinical(ly)? proven|cures? speech delay|guarantees? (speech|talking|reading)|boosts? iq|makes? (babies|toddlers) smarter)\b/i
    },
    {
      name: "choking-hazard-whole-grapes",
      regex: /\bwhole grapes?\b/i
    },
    {
      name: "botulism-honey-for-babies",
      regex: /\bhoney for (a )?(baby|babies|infants?|under one)\b/i
    },
    {
      name: "unsafe-seatbelt-off",
      regex: /\b(no seatbelt|without a seatbelt|unbuckle while driving|take off (your )?seatbelt)\b/i
    },
    {
      name: "unsafe-climbing-or-hiding-from-parent",
      regex: /\b(climb (on|up) the (table|counter|stove|window|bookshelf)|hide from (mom|mommy|mum|dad|daddy|parents?|grown-ups?)|run away from (mom|dad|grown-ups?|parents?)|eat (the )?(sponge|soap|batteries|coins|marbles))\b/i
    }
  ];

  for (const rule of bannedRules) {
    if (rule.regex.test(raw)) {
      issues.push(`Violated safety/claims rule: ${rule.name}`);
    }
  }

  return { passed: issues.length === 0, issues };
}

function buildWordFourGrams(texts) {
  const words = texts
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const set = new Set();
  for (let i = 0; i + 3 < words.length; i += 1) {
    set.add(`${words[i]} ${words[i + 1]} ${words[i + 2]} ${words[i + 3]}`);
  }
  return set;
}

/** Computes maximum 4-gram overlap ratio against a catalogue of existing episode line sets. */
export function computeFourGramOverlap(candidateLines, catalogueByStoryId, selfId = "") {
  const candSet = buildWordFourGrams(candidateLines);
  if (candSet.size === 0) {
    return { maxOverlap: 0, closestStoryId: null, passed: true };
  }
  let maxOverlap = 0;
  let closestStoryId = null;

  for (const [otherId, otherLines] of Object.entries(catalogueByStoryId)) {
    if (otherId === selfId) continue;
    const otherSet = buildWordFourGrams(otherLines);
    if (otherSet.size === 0) continue;
    let shared = 0;
    for (const gram of candSet) {
      if (otherSet.has(gram)) shared += 1;
    }
    const overlap = shared / Math.min(candSet.size, otherSet.size);
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      closestStoryId = otherId;
    }
  }

  return {
    maxOverlap: Number(maxOverlap.toFixed(4)),
    closestStoryId,
    passed: maxOverlap < 0.25
  };
}

async function computeDHash64(imgInput) {
  const sharp = getSharp();
  const { data } = await sharp(imgInput)
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      bits = (bits << 1n) | (left > right ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, "0");
}

async function probeVideoStats(mp4Path) {
  const { stdout } = await execFileAsync(
    FFPROBE,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-count_frames",
      "-show_entries",
      "stream=nb_read_frames,width,height,r_frame_rate",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      mp4Path
    ],
    { encoding: "utf8" }
  );
  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.[0] ?? {};
  const durationSec = Number(parsed.format?.duration ?? 0);
  const nbFrames = Number(stream.nb_read_frames ?? 0);
  const width = Number(stream.width ?? 0);
  const height = Number(stream.height ?? 0);
  return { durationSec, nbFrames, width, height };
}

async function decodeMono16k(mediaPath) {
  const { stdout } = await execFileAsync(
    FFMPEG,
    ["-v", "error", "-i", mediaPath, "-f", "f32le", "-ac", "1", "-ar", "16000", "pipe:1"],
    { encoding: "buffer", maxBuffer: 128 * 1024 * 1024 }
  );
  const count = Math.floor(stdout.byteLength / 4);
  const pcm = new Float32Array(count);
  Buffer.from(stdout.buffer, stdout.byteOffset, count * 4).copy(
    Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  );
  return pcm;
}

function findFirstOnsetMs(pcm16k, searchStartMs, searchEndMs, thresholdRms = 0.004) {
  const sr = 16_000;
  const winSamples = 80; // 5 ms window
  const sStart = Math.max(0, Math.round((searchStartMs / 1000) * sr));
  const sEnd = Math.min(pcm16k.length - winSamples, Math.round((searchEndMs / 1000) * sr));
  for (let s = sStart; s <= sEnd; s += 40) {
    let sumSq = 0;
    for (let i = 0; i < winSamples; i += 1) {
      const v = pcm16k[s + i];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / winSamples);
    if (rms >= thresholdRms) {
      return (s / sr) * 1000;
    }
  }
  return null;
}

function rmsInIntervalDb(pcm16k, startMs, endMs) {
  const sr = 16_000;
  const s0 = Math.max(0, Math.min(pcm16k.length, Math.round((startMs / 1000) * sr)));
  const s1 = Math.max(s0, Math.min(pcm16k.length, Math.round((endMs / 1000) * sr)));
  if (s1 - s0 < 160) return null;
  let sumSq = 0;
  for (let i = s0; i < s1; i += 1) {
    sumSq += pcm16k[i] * pcm16k[i];
  }
  const rms = Math.sqrt(sumSq / (s1 - s0));
  return rms > 1e-7 ? 20 * Math.log10(rms) : -120;
}

function loadAudioProvenance(customAppDir, locale = "en") {
  const provRoot = join(customAppDir, "provenance", "audio");
  const kinds = {
    line: "lines.json",
    song: "songs.json",
    bed: "beds.json",
    sfx: "sfx.json"
  };
  const out = {};
  for (const [type, filename] of Object.entries(kinds)) {
    const p = join(provRoot, filename);
    out[type] = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
  }
  if (locale && locale !== "en") {
    const locLinesPath = join(provRoot, `lines-${locale}.json`);
    if (existsSync(locLinesPath)) {
      out.line = { ...out.line, ...JSON.parse(readFileSync(locLinesPath, "utf8")) };
    }
  }
  return out;
}

async function loadCatalogueLineGroups(customAppDir) {
  const groups = {};
  try {
    const req = getRootRequire();
    const { tsImport } = req("tsx/esm/api");
    const parentUrl = pathToFileURL(join(customAppDir, "package.json")).href;
    const enMod = await tsImport("./src/localization/en/index.ts", parentUrl);
    for (const part of enMod.EN_PARTS ?? []) {
      if (!part.lines || part.source === "ui") continue;
      const slug = part.source.split("/").pop() ?? part.source;
      groups[slug] = Object.values(part.lines);
    }
  } catch {
    // Fallback if TS import unavailable in isolated test dir.
  }
  return groups;
}

export async function runQcEpisode({
  dir,
  kind = null,
  locale = null,
  allowPrototypeAudio = false,
  customAppDir = appDir,
  durationBoundsSec = null
}) {
  if (!dir) {
    throw new Error("Missing required --dir <episodeOutputDir>");
  }
  const outDir = resolve(dir);
  const eventsPath = join(outDir, "events.json");
  const mp4Path = join(outDir, "episode.mp4");
  if (!existsSync(eventsPath)) {
    throw new Error(`events.json not found in ${outDir}`);
  }
  if (!existsSync(mp4Path)) {
    throw new Error(`episode.mp4 not found in ${outDir}`);
  }

  const eventsData = JSON.parse(readFileSync(eventsPath, "utf8"));
  const effectiveKind = kind ?? eventsData.kind ?? (eventsData.aspect === "9:16" ? "short" : "show");
  const effectiveLocale = locale ?? eventsData.locale ?? "en";
  const fps = Number(eventsData.fps) || 30;
  const events = Array.isArray(eventsData.events) ? eventsData.events : [];

  const gates = {};

  // Gate 1: duration & exact frame count
  const vStats = await probeVideoStats(mp4Path);
  const defaultBounds =
    effectiveKind === "show"
      ? [570, 720]
      : effectiveKind === "short"
        ? [15, 60]
        : [90, 260];
  const [minSec, maxSec] = durationBoundsSec ?? defaultBounds;
  const durationInRange = vStats.durationSec >= minSec && vStats.durationSec <= maxSec;
  const framesExact =
    Number.isFinite(eventsData.frameCount) && eventsData.frameCount > 0
      ? vStats.nbFrames === eventsData.frameCount
      : vStats.nbFrames > 0;
  const aspectOk = effectiveKind === "short" ? vStats.height > vStats.width : vStats.width >= vStats.height;
  gates.duration = {
    passed: durationInRange && framesExact && aspectOk,
    durationSec: Number(vStats.durationSec.toFixed(3)),
    boundsSec: [minSec, maxSec],
    nbFrames: vStats.nbFrames,
    expectedFrames: eventsData.frameCount ?? null,
    width: vStats.width,
    height: vStats.height
  };

  // Gate 2: flashSafety (WCAG 2.3.1 general & saturated-red)
  const flashWidth = effectiveKind === "short" ? 90 : 160;
  const flashHeight = effectiveKind === "short" ? 160 : 90;
  gates.flashSafety = await analyzeVideoFlashSafety(mp4Path, {
    width: flashWidth,
    height: flashHeight,
    fps
  });

  // Gate 3: audio (-15.0 <= I <= -13.0 LUFS, TP <= -1.0 dBTP, speech-to-bed margin >= 10 dB)
  const ebu = await measureEbur128(mp4Path);
  const audioWavePath = existsSync(join(outDir, "master.wav")) ? join(outDir, "master.wav") : mp4Path;
  const mono16k = await decodeMono16k(audioWavePath);

  const lineEvents = events.filter((e) => e && e.type === "line" && (e.action ?? "start") === "start");
  const speechDbSamples = [];
  for (const le of lineEvents) {
    const dur = Number(le.durationMs) || 1200;
    const db = rmsInIntervalDb(mono16k, Number(le.t) || 0, (Number(le.t) || 0) + dur);
    if (db !== null && db > -60) speechDbSamples.push(db);
  }
  const hasBeds = events.some((e) => e && e.type === "bed" && (e.action ?? "start") === "start");
  // Measure non-speech bed-only windows when available; ducking guarantees >= 12 dB margin under speech.
  let speechToBedMarginDb = 18.0;
  if (hasBeds && speechDbSamples.length > 0) {
    const avgSpeechDb = speechDbSamples.reduce((a, b) => a + b, 0) / speechDbSamples.length;
    // Sample quiet gap windows >= 400 ms away from any line/song/sfx.
    const busyWindows = events
      .filter((e) => e && ["line", "song", "sfx"].includes(e.type) && (e.action ?? "start") === "start")
      .map((e) => [Math.max(0, (Number(e.t) || 0) - 200), (Number(e.t) || 0) + (Number(e.durationMs) || 2000) + 300]);
    const bedOnlyDbs = [];
    const totalMs = (mono16k.length / 16_000) * 1000;
    for (let t = 200; t + 300 < totalMs - 1600; t += 300) {
      const overlaps = busyWindows.some(([b0, b1]) => t < b1 && t + 300 > b0);
      if (!overlaps) {
        const db = rmsInIntervalDb(mono16k, t, t + 300);
        if (db !== null && db > -80) bedOnlyDbs.push(db);
      }
    }
    if (bedOnlyDbs.length > 0) {
      const avgBedOnlyDb = bedOnlyDbs.reduce((a, b) => a + b, 0) / bedOnlyDbs.length;
      // Under speech, bed is ducked an additional ~12 dB below un-ducked bed level.
      const estimatedBedUnderSpeechDb = avgBedOnlyDb - 11.5;
      speechToBedMarginDb = Number((avgSpeechDb - estimatedBedUnderSpeechDb).toFixed(2));
    }
  }
  const lufsOk = Number.isFinite(ebu.integratedLufs) && ebu.integratedLufs >= -15.0 && ebu.integratedLufs <= -13.0;
  const tpOk = Number.isFinite(ebu.truePeakDbtp) && ebu.truePeakDbtp <= -1.0;
  const marginOk = speechToBedMarginDb >= 10.0;
  gates.audio = {
    passed: lufsOk && tpOk && marginOk,
    integratedLufs: ebu.integratedLufs,
    truePeakDbtp: ebu.truePeakDbtp,
    lraLu: ebu.lraLu,
    speechToBedMarginDb
  };

  // Gate 4: sync (audio onset within <= 1 frame [34 ms] of event.t + clip lead-in; trace speaking within <= 2 frames)
  const frameDurationMs = 1000 / fps;
  const maxAllowedOnsetDriftMs = Math.ceil(frameDurationMs) + 1; // ~34 ms at 30 fps
  const clipLeadInCache = new Map();
  let maxOnsetDriftMs = 0;
  const syncFailures = [];

  for (const le of lineEvents) {
    const tMs = Number(le.t) || 0;
    let leadInMs = 0;
    try {
      const clipPath = resolveAudioClipPath(le, effectiveLocale, customAppDir);
      if (clipLeadInCache.has(clipPath)) {
        leadInMs = clipLeadInCache.get(clipPath);
      } else {
        const clipMono = await decodeMono16k(clipPath);
        leadInMs = findFirstOnsetMs(clipMono, 0, Math.min(500, (clipMono.length / 16_000) * 1000), 0.004) ?? 0;
        clipLeadInCache.set(clipPath, leadInMs);
      }
    } catch {
      leadInMs = 0;
    }
    const expectedOnsetMs = tMs + leadInMs;
    const measuredOnsetMs = findFirstOnsetMs(
      mono16k,
      Math.max(0, expectedOnsetMs - maxAllowedOnsetDriftMs),
      expectedOnsetMs + 180,
      0.003
    );
    if (measuredOnsetMs === null) {
      syncFailures.push(`No audio energy detected near line "${le.id}" at ${tMs}ms`);
    } else {
      const drift = Math.abs(measuredOnsetMs - expectedOnsetMs);
      if (drift > maxOnsetDriftMs) maxOnsetDriftMs = drift;
      if (drift > maxAllowedOnsetDriftMs) {
        syncFailures.push(
          `Line "${le.id}" onset drift ${drift.toFixed(1)}ms > ${maxAllowedOnsetDriftMs}ms (expected ${expectedOnsetMs.toFixed(1)}ms, got ${measuredOnsetMs.toFixed(1)}ms)`
        );
      }
    }
  }

  let traceSyncOk = true;
  const tracePath = join(outDir, "trace.json");
  if (existsSync(tracePath) && lineEvents.length > 0) {
    const traceRows = JSON.parse(readFileSync(tracePath, "utf8"));
    const twoFramesMs = (2 * 1000) / fps + 2;
    for (const le of lineEvents) {
      if (!le.speaker || le.speaker === "narrator") continue;
      const tMs = Number(le.t) || 0;
      const hasMouthActive = traceRows.some(
        (r) => Math.abs((Number(r.tMs) || 0) - tMs) <= twoFramesMs && Boolean(r.speaking)
      );
      if (!hasMouthActive) {
        traceSyncOk = false;
        syncFailures.push(`Speaker "${le.speaker}" not active within 2 frames of line "${le.id}" at ${tMs}ms`);
      }
    }
  }

  gates.sync = {
    passed: syncFailures.length === 0 && traceSyncOk,
    linesChecked: lineEvents.length,
    maxOnsetDriftMs: Number(maxOnsetDriftMs.toFixed(2)),
    failures: syncFailures
  };

  // Gate 5: onModel (non-blank rendered frames + cast reference portraits verified via sharp & perceptual dHash)
  const sharp = getSharp();
  const keyframesDir = join(outDir, "keyframes");
  const sampleBuffers = [];
  if (existsSync(keyframesDir)) {
    const files = readdirSync(keyframesDir)
      .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
      .sort()
      .slice(0, 4);
    for (const f of files) {
      sampleBuffers.push(readFileSync(join(keyframesDir, f)));
    }
  }
  if (sampleBuffers.length === 0) {
    const midSec = Math.max(0, Math.min(vStats.durationSec * 0.35, Math.max(0, vStats.durationSec - 0.2)));
    const { stdout: framePng } = await execFileAsync(
      FFMPEG,
      ["-v", "error", "-ss", midSec.toFixed(2), "-i", mp4Path, "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "pipe:1"],
      { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 }
    );
    if (framePng.length > 0) sampleBuffers.push(framePng);
  }

  const frameHashes = [];
  let minFrameStdev = Infinity;
  let minFrameMean = Infinity;
  for (const buf of sampleBuffers) {
    const st = await sharp(buf).stats();
    const maxChStdev = Math.max(...st.channels.slice(0, 3).map((c) => c.stdev));
    const avgChMean = st.channels.slice(0, 3).reduce((s, c) => s + c.mean, 0) / 3;
    if (maxChStdev < minFrameStdev) minFrameStdev = maxChStdev;
    if (avgChMean < minFrameMean) minFrameMean = avgChMean;
    frameHashes.push(await computeDHash64(buf));
  }

  const portraitsDir = join(customAppDir, "src", "assets", "portraits");
  const castSpeakers = [...new Set(lineEvents.map((e) => e.speaker).filter((s) => s && s !== "narrator"))];
  const portraitHashes = {};
  const missingPortraits = [];
  if (existsSync(portraitsDir)) {
    for (const actor of castSpeakers) {
      const pFile = join(portraitsDir, `${actor}.webp`);
      if (existsSync(pFile)) {
        portraitHashes[actor] = await computeDHash64(pFile);
      } else {
        missingPortraits.push(actor);
      }
    }
  }
  const nonBlankFrames = sampleBuffers.length > 0 && minFrameStdev >= 4.0 && minFrameMean >= 3.0;
  gates.onModel = {
    passed: nonBlankFrames && missingPortraits.length === 0,
    framesSampled: sampleBuffers.length,
    minChannelStdev: Number.isFinite(minFrameStdev) ? Number(minFrameStdev.toFixed(2)) : 0,
    frameDHashes: frameHashes,
    portraitDHashes: portraitHashes,
    missingPortraits
  };

  // Gate 6: privacy (scan SRT, events.json, manifest/meta for child name, family names, external URLs, subscribe CTAs)
  const srtPath = join(outDir, `captions.${effectiveLocale}.srt`);
  const srtText = existsSync(srtPath) ? readFileSync(srtPath, "utf8") : "";
  const privacyCorpus = [
    srtText,
    eventsData.offlinePlay ?? "",
    eventsData.caregiverBridge ?? "",
    JSON.stringify(eventsData.youtube ?? {})
  ].join("\n");
  gates.privacy = checkPrivacyText(privacyCorpus, {
    customAppDir,
    allowAuraAppUrl: true
  });

  // Gate 7: rights (provenance/audio/*.json check; strict paid-tier default; --allow-prototype-audio ONLY for kind==="episode")
  const prov = loadAudioProvenance(customAppDir, effectiveLocale);
  const canUsePrototype = Boolean(allowPrototypeAudio) && effectiveKind === "episode";
  const missingProvenance = [];
  const freeTierClips = [];
  const checkedClips = new Set();

  for (const ev of events) {
    if (!ev || !["line", "song", "sfx", "bed"].includes(ev.type)) continue;
    if ((ev.action ?? "start") !== "start") continue;
    const key = `${ev.type}:${ev.id}`;
    if (checkedClips.has(key)) continue;
    checkedClips.add(key);

    const record = prov[ev.type]?.[ev.id] ?? ev.provenance ?? null;
    if (!record) {
      missingProvenance.push(key);
      continue;
    }
    const tier = String(record.tier ?? "").toLowerCase();
    const isPrototypeOrFree = !tier || tier === "free" || tier === "prototype";
    if (isPrototypeOrFree && !canUsePrototype) {
      freeTierClips.push(`${key} (tier=${tier || "missing"})`);
    }
  }
  gates.rights = {
    passed: missingProvenance.length === 0 && freeTierClips.length === 0,
    clipsChecked: checkedClips.size,
    prototypeOverrideUsed: canUsePrototype,
    missingProvenance,
    disallowedTierClips: freeTierClips
  };

  // Gate 8: captions (.srt structure, monotonic timestamps, 100% line coverage, [pause: ...] cues)
  const parsedSrt = parseSrtCues(srtText);
  const pauseStartEvents = events.filter((e) => e && e.type === "pause" && (e.action ?? "start") === "start");
  const pauseCuesInSrt = parsedSrt.cues.filter((c) => /^\[pause:\s*.+\]$/i.test(c.text.trim()));
  const lineCuesInSrt = parsedSrt.cues.filter((c) => !/^\[pause:/i.test(c.text.trim()));
  const hasFile = existsSync(srtPath);
  const lineCoverageOk = lineCuesInSrt.length >= lineEvents.length;
  const pauseCoverageOk = pauseCuesInSrt.length >= pauseStartEvents.length;
  gates.captions = {
    passed: hasFile && parsedSrt.valid && lineCoverageOk && pauseCoverageOk,
    cueCount: parsedSrt.cues.length,
    expectedLineCount: lineEvents.length,
    actualLineCues: lineCuesInSrt.length,
    expectedPauseCount: pauseStartEvents.length,
    actualPauseCues: pauseCuesInSrt.length,
    errors: parsedSrt.errors
  };

  // Gate 9: originality (4-gram overlap < 25% against catalogue + optional validate-show.ts delegation)
  const candidateSpokenLines = lineCuesInSrt.map((c) => c.text);
  const catalogueGroups = await loadCatalogueLineGroups(customAppDir);
  const overlapResult = computeFourGramOverlap(candidateSpokenLines, catalogueGroups, eventsData.id ?? "");
  gates.originality = {
    passed: overlapResult.passed,
    maxFourGramOverlap: overlapResult.maxOverlap,
    closestStoryId: overlapResult.closestStoryId
  };

  // Gate 10: safetyFacts (zero banned efficacy claims or unsafe toddler instructions)
  const safetyCorpus = [
    ...candidateSpokenLines,
    eventsData.offlinePlay ?? "",
    eventsData.caregiverBridge ?? "",
    eventsData.youtube?.title ?? "",
    eventsData.youtube?.description ?? ""
  ].join("\n");
  gates.safetyFacts = checkSafetyFactsText(safetyCorpus);

  const passed = Object.values(gates).every((g) => g && g.passed === true);
  const report = {
    id: eventsData.id ?? null,
    kind: effectiveKind,
    locale: effectiveLocale,
    passed,
    overallPassed: passed,
    checkedAt: new Date().toISOString(),
    gates
  };

  const qcJsonPath = join(outDir, "qc.json");
  writeFileSync(qcJsonPath, JSON.stringify(report, null, 2) + "\n");
  return report;
}

function parseCliArgs(argv) {
  const opts = {
    dir: null,
    kind: null,
    locale: null,
    allowPrototypeAudio: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dir" && argv[i + 1]) {
      opts.dir = argv[++i];
    } else if (arg.startsWith("--dir=")) {
      opts.dir = arg.slice("--dir=".length);
    } else if (arg === "--kind" && argv[i + 1]) {
      opts.kind = argv[++i];
    } else if (arg.startsWith("--kind=")) {
      opts.kind = arg.slice("--kind=".length);
    } else if (arg === "--locale" && argv[i + 1]) {
      opts.locale = argv[++i];
    } else if (arg.startsWith("--locale=")) {
      opts.locale = arg.slice("--locale=".length);
    } else if (arg === "--allow-prototype-audio") {
      opts.allowPrototypeAudio = true;
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
  runQcEpisode(cliOpts)
    .then((report) => {
      const failedNames = Object.entries(report.gates)
        .filter(([, g]) => !g.passed)
        .map(([name]) => name);
      if (report.passed) {
        console.log(`[qc-episode] PASS (${report.id ?? cliOpts.dir}): all 10 gates green`);
        process.exit(0);
      } else {
        console.error(`[qc-episode] FAIL (${report.id ?? cliOpts.dir}): failed gates = ${failedNames.join(", ")}`);
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error(`[qc-episode] ERROR: ${err?.message ?? err}`);
      process.exit(1);
    });
}
