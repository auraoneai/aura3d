/**
 * Aurora Lander SFX synth — generates original CC0 WAV cues entirely in-repo.
 *
 * No network downloads, no sampled material: every cue is synthesized from
 * oscillators / filtered noise with a small committed generator so provenance is
 * auditable (author "Aura3D synthesis", license CC0-1.0).
 *
 * Run from the repo root:  node apps/showcase-aurora-lander/scripts/build-sfx.mjs
 * Output: apps/showcase-aurora-lander/assets/sfx/*.wav (16-bit PCM mono 44100 Hz)
 *
 * After generation, run `pnpm --dir apps/showcase-aurora-lander register-sfx`
 * so every cue is registered with durable CC0 provenance and generated types.
 * typed root asset map the route imports (`../../../src/aura-assets`), e.g.:
 *   node packages/aura3d-cli/dist/cli.js assets add apps/showcase-aurora-lander/assets/sfx/thrustLoop.wav --name auroraThrustLoopSfx --type audio --license CC0-1.0 --author "Aura3D synthesis" --source-page "apps/showcase-aurora-lander/scripts/build-sfx.mjs"
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/sfx");
const SAMPLE_RATE = 44100;

// ---- waveform / DSP helpers -------------------------------------------------
function noiseBuffer(length) {
  const out = new Float32Array(length);
  let seed = 0x5a17_00d3;
  for (let i = 0; i < length; i += 1) {
    // Deterministic LCG noise so regenerating the cue is byte-identical.
    seed = (seed * 1664525 + 1013904223) >>> 0;
    out[i] = ((seed / 0xffffffff) * 2 - 1);
  }
  return out;
}

function envelope(length, attack, decay, total) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const start = Math.min(1, t / Math.max(0.0005, attack));
    const end = Math.pow(Math.max(0, 1 - t / total), decay);
    out[i] = start * end;
  }
  return out;
}

/** One-pole low-pass. */
function lowpass(samples, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SAMPLE_RATE;
  const alpha = dt / (rc + dt);
  let prev = 0;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    prev = prev + alpha * (samples[i] - prev);
    out[i] = prev;
  }
  return out;
}

/** One-pole high-pass. */
function highpass(samples, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SAMPLE_RATE;
  const alpha = dt / (rc + dt);
  let lp = 0;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    lp += alpha * (samples[i] - lp);
    out[i] = samples[i] - lp;
  }
  return out;
}

/**
 * Render a one-shot cue into a normalized mono buffer.
 * tone: {wave, freqStart, freqEnd, amp, attack, decay, total} or array of stacked partials
 * noise: {amp, attack, decay, total, hp?, lp?}
 */
function renderCue({ tone, noise }) {
  const parts = (Array.isArray(tone) ? tone : tone ? [tone] : []);
  const totalSec = Math.max(
    ...parts.map((p) => p.total ?? 0),
    noise?.total ?? 0,
    0.1
  ) + 0.08;
  const length = Math.floor(totalSec * SAMPLE_RATE);
  const out = new Float32Array(length);
  for (const part of parts) {
    const { wave = "sine", freqStart, freqEnd = freqStart, amp = 0.5, attack = 0.005, decay = 3, total = 0.2 } = part;
    const env = envelope(length, attack, decay, total);
    for (let i = 0; i < length; i += 1) {
      const t = i / SAMPLE_RATE;
      const progress = Math.min(1, t / total);
      const f = freqStart + (freqEnd - freqStart) * progress;
      const phase = 2 * Math.PI * f * t;
      let v = 0;
      if (wave === "sine") v = Math.sin(phase);
      else if (wave === "triangle") v = (2 / Math.PI) * Math.asin(Math.sin(phase));
      else if (wave === "sawtooth") v = 2 * (phase / (2 * Math.PI) - Math.floor(0.5 + phase / (2 * Math.PI)));
      else if (wave === "square") v = Math.sign(Math.sin(phase));
      else v = Math.sin(phase);
      out[i] += v * env[i] * amp;
    }
  }
  if (noise) {
    const { amp = 0.4, attack = 0.004, decay = 4, total = 0.16, hp = 0, lp = 0 } = noise;
    let raw = noiseBuffer(length);
    if (hp > 0) raw = highpass(raw, hp);
    if (lp > 0) raw = lowpass(raw, lp);
    const env = envelope(length, attack, decay, total);
    for (let i = 0; i < length; i += 1) out[i] += raw[i] * env[i] * amp;
  }
  // Normalize to a safe peak.
  let peak = 0;
  for (let i = 0; i < length; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const gain = Math.min(1, 0.9 / peak);
    for (let i = 0; i < length; i += 1) out[i] *= gain;
  }
  return out;
}

/** A looping pad — output is a full short loop (normalized, click-free edges). */
function loopCue(durationSec, wave, freqStart, freqEnd, amp = 0.16) {
  const length = Math.floor(durationSec * SAMPLE_RATE);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const f = freqStart + (freqEnd - freqStart) * (t / durationSec);
    const phase = 2 * Math.PI * f * t;
    let v = 0;
    if (wave === "sawtooth") v = 2 * (phase / (2 * Math.PI) - Math.floor(0.5 + phase / (2 * Math.PI)));
    else if (wave === "square") v = Math.sign(Math.sin(phase));
    else v = Math.sin(phase);
    out[i] = v * amp * (0.7 + 0.3 * Math.sin(t * 2));
  }
  const fade = Math.floor(0.02 * SAMPLE_RATE);
  for (let i = 0; i < fade; i += 1) {
    out[i] *= i / fade;
    out[length - 1 - i] *= i / fade;
  }
  return out;
}

// ---- cue recipes ------------------------------------------------------------
/** Main engine thrust loop: smooth rumbling filtered-noise rocket burn. */
function thrustLoop() {
  const duration = 1.4;
  const N = Math.floor(duration * SAMPLE_RATE);
  const raw = noiseBuffer(N);
  const hiss = highpass(raw, 180);
  const body = lowpass(hiss, 1200);
  const sub = loopCue(duration, "sine", 75, 95, 0.28);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i += 1) out[i] = sub[i] * 0.5 + body[i] * 0.5;
  const fade = Math.floor(0.04 * SAMPLE_RATE);
  for (let i = 0; i < fade; i += 1) {
    out[i] *= i / fade;
    out[out.length - 1 - i] *= i / fade;
  }
  return lowpass(out, 1800);
}
/** RCS rotation puff: short pressurized gas burst. */
function rcsPuff() {
  return renderCue({
    noise: { amp: 0.62, attack: 0.006, decay: 6, total: 0.24, hp: 900, lp: 5200 },
    tone: { wave: "sine", freqStart: 340, freqEnd: 210, amp: 0.14, attack: 0.008, decay: 5, total: 0.2 }
  });
}
/** Soft touchdown: dampened thump plus settling creak. */
function touchSoft() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 130, freqEnd: 70, amp: 0.5, attack: 0.004, decay: 4, total: 0.28 },
      { wave: "triangle", freqStart: 520, freqEnd: 300, amp: 0.12, attack: 0.02, decay: 5, total: 0.3 }
    ],
    noise: { amp: 0.18, attack: 0.01, decay: 6, total: 0.2, hp: 120, lp: 700 }
  });
}
/** Hard touchdown: harsher metallic impact. */
function touchHard() {
  return renderCue({
    tone: [
      { wave: "square", freqStart: 180, freqEnd: 90, amp: 0.42, attack: 0.002, decay: 5, total: 0.26 },
      { wave: "sawtooth", freqStart: 720, freqEnd: 260, amp: 0.16, attack: 0.002, decay: 6, total: 0.22 }
    ],
    noise: { amp: 0.36, attack: 0.002, decay: 6, total: 0.24, hp: 200, lp: 3200 }
  });
}
/** Crash: debris burst — big impact then scattered clatter. */
function crash() {
  const impact = renderCue({
    tone: { wave: "square", freqStart: 110, freqEnd: 42, amp: 0.55, attack: 0.002, decay: 3.4, total: 0.5 },
    noise: { amp: 0.7, attack: 0.002, decay: 3.2, total: 0.55, hp: 80, lp: 4200 }
  });
  const clatter = renderCue({
    tone: [
      { wave: "triangle", freqStart: 900, freqEnd: 500, amp: 0.2, attack: 0.12, decay: 5, total: 0.5 },
      { wave: "triangle", freqStart: 1400, freqEnd: 700, amp: 0.14, attack: 0.22, decay: 5, total: 0.55 }
    ],
    noise: { amp: 0.24, attack: 0.1, decay: 4, total: 0.6, hp: 800 }
  });
  const out = new Float32Array(Math.max(impact.length, clatter.length));
  for (let i = 0; i < out.length; i += 1) {
    out[i] = (impact[i] ?? 0) * 0.85 + (clatter[i] ?? 0) * 0.6;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < out.length; i += 1) out[i] *= Math.min(1, 0.92 / peak);
  return out;
}
/** Pad lock: two-note confirmation chime when the sensor zone reads a valid pad. */
function padLock() {
  return renderCue({ tone: [
    { wave: "sine", freqStart: 784, amp: 0.34, attack: 0.002, decay: 5, total: 0.18 },
    { wave: "sine", freqStart: 1174.7, amp: 0.3, attack: 0.002, decay: 5, total: 0.24 }
  ] });
}
/** Fuel low: attention-getting soft alarm blip pair. */
function fuelLow() {
  return renderCue({ tone: [
    { wave: "square", freqStart: 620, freqEnd: 590, amp: 0.2, attack: 0.004, decay: 4, total: 0.12 },
    { wave: "square", freqStart: 470, freqEnd: 450, amp: 0.2, attack: 0.15, decay: 4, total: 0.27 }
  ] });
}
/** Site clear: ascending four-note fanfare for a graded landing. */
function siteClear() {
  return renderCue({ tone: [
    { wave: "triangle", freqStart: 523.25, amp: 0.34, attack: 0.006, decay: 4, total: 0.22 },
    { wave: "triangle", freqStart: 659.25, amp: 0.34, attack: 0.16, decay: 4, total: 0.34 },
    { wave: "triangle", freqStart: 783.99, amp: 0.36, attack: 0.32, decay: 4, total: 0.46 },
    { wave: "triangle", freqStart: 1046.5, amp: 0.38, attack: 0.48, decay: 3.4, total: 0.72 }
  ] });
}
/** Gust warn: rising airy whoosh telegraphing a storm gust. */
function gustWarn() {
  return renderCue({
    noise: { amp: 0.5, attack: 0.16, decay: 2.4, total: 0.66, hp: 400, lp: 2600 },
    tone: { wave: "sine", freqStart: 220, freqEnd: 480, amp: 0.16, attack: 0.14, decay: 2.6, total: 0.62 }
  });
}
/** Ambient wind: slow airy loop under everything. */
function ambientWind() {
  const length = Math.floor(1.6 * SAMPLE_RATE);
  let raw = noiseBuffer(length);
  raw = lowpass(raw, 420);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    out[i] = raw[i] * (0.55 + 0.45 * Math.sin(t * 2 * Math.PI * 0.75)) * 0.5;
  }
  const fade = Math.floor(0.05 * SAMPLE_RATE);
  for (let i = 0; i < fade; i += 1) {
    out[i] *= i / fade;
    out[length - 1 - i] *= i / fade;
  }
  return out;
}

// ---- WAV writer -------------------------------------------------------------
function writeWav(path, samples) {
  const length = samples.length;
  const buffer = Buffer.alloc(44 + length * 2);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = SAMPLE_RATE * numChannels * bitsPerSample / 8;
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + length * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(numChannels * bitsPerSample / 8, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i += 1) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(path, buffer);
  return length / SAMPLE_RATE;
}

const cues = {
  thrustLoop, rcsPuff, touchSoft, touchHard, crash,
  padLock, fuelLow, siteClear, gustWarn, ambientWind
};

mkdirSync(OUT_DIR, { recursive: true });
const report = {};
for (const [name, fn] of Object.entries(cues)) {
  const samples = fn();
  const path = resolve(OUT_DIR, `${name}.wav`);
  const duration = writeWav(path, samples);
  report[name] = path + " (" + duration.toFixed(3) + "s)";
  console.log("wrote", report[name]);
}
console.log("\nGenerated", Object.keys(cues).length, "cues into", OUT_DIR);
