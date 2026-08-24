/**
 * Courier Rush SFX synth — generates original CC0 WAV cues entirely in-repo.
 *
 * No network downloads, no sampled material: every cue is synthesized from
 * oscillators / filtered noise with a small committed generator so provenance is
 * auditable (author "Aura3D synthesis", license CC0-1.0).
 *
 * Run from the repo root:  node apps/showcase-courier-rush/scripts/build-sfx.mjs
 * Output: apps/showcase-courier-rush/assets/sfx/*.wav (16-bit PCM mono 44100 Hz)
 *
 * After generation, register each audio file with the CLI so it lands in the
 * typed root asset map the route imports (`../../../src/aura-assets`), e.g.:
 *   node packages/aura3d-cli/dist/cli.js assets add apps/showcase-courier-rush/assets/sfx/engineLoop.wav --name courierEngineSfx --type audio --license CC0-1.0 --author "Aura3D synthesis" --source-page "apps/showcase-courier-rush/scripts/build-sfx.mjs"
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/sfx");
const SAMPLE_RATE = 44100;

// ---- waveform / DSP helpers -------------------------------------------------
function noiseBuffer(length) {
  const out = new Float32Array(length);
  let seed = 0x9e3779b9;
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

/** A looping pad — output is a full short loop (normalized, can be looped by the player). */
function loopCue(durationSec, wave, freqStart, freqEnd, wobble = 4) {
  const length = Math.floor(durationSec * SAMPLE_RATE);
  const out = new Float32Array(length);
  const amp = 0.16;
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const progress = Math.min(1, t / durationSec);
    const f = freqStart + (freqEnd - freqStart) * progress + Math.sin(t * wobble) * wobble;
    const phase = 2 * Math.PI * f * t;
    let v = 0;
    if (wave === "sawtooth") v = 2 * (phase / (2 * Math.PI) - Math.floor(0.5 + phase / (2 * Math.PI)));
    else if (wave === "square") v = Math.sign(Math.sin(phase));
    else v = Math.sin(phase);
    out[i] = v * amp * (0.7 + 0.3 * Math.sin(t * 2));
  }
  // Fade the loop edges so replaying is click-free.
  const fade = Math.floor(0.02 * SAMPLE_RATE);
  for (let i = 0; i < fade; i += 1) {
    out[i] *= i / fade;
    out[length - 1 - i] *= i / fade;
  }
  return out;
}

// ---- cue recipes ------------------------------------------------------------
/** Engine loop: smooth electric/hybrid delivery van purr (no harsh short wobbles). */
function engineLoop() {
  const duration = 6.0;
  const length = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const sub = Math.sin(2 * Math.PI * 48 * t) * 0.4;
    const hum = Math.sin(2 * Math.PI * 96 * t) * 0.2;
    const purr = Math.sin(2 * Math.PI * 144 * t) * 0.08;
    out[i] = (sub + hum + purr) * 0.2;
  }
  const fade = Math.floor(0.05 * SAMPLE_RATE);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[i] = out[i] * k + out[length - fade + i] * (1 - k);
  }
  return lowpass(out, 300);
}

/** Dispatch blip: delicate two-tone radio confirmation chime. */
function dispatchBlip() {
  return renderCue({ tone: [
    { wave: "sine", freqStart: 660, freqEnd: 660, amp: 0.2, attack: 0.003, decay: 6, total: 0.08 },
    { wave: "sine", freqStart: 880, freqEnd: 880, amp: 0.22, attack: 0.08, decay: 6, total: 0.15 }
  ] });
}

/** Parcel pickup: soft tactile cardboard tap + gentle settlement. */
function parcelPickup() {
  return renderCue({
    noise: { amp: 0.2, attack: 0.01, decay: 5, total: 0.15, hp: 400, lp: 2200 },
    tone: [
      { wave: "sine", freqStart: 180, freqEnd: 110, amp: 0.25, attack: 0.005, decay: 4, total: 0.16 }
    ]
  });
}

/** Parcel drop: satisfying velvet delivery chime over a soft settlement. */
function parcelDrop() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 523.25, amp: 0.25, attack: 0.003, decay: 4.5, total: 0.16 },
      { wave: "sine", freqStart: 783.99, amp: 0.28, attack: 0.05, decay: 4.5, total: 0.28 },
      { wave: "sine", freqStart: 1046.5, amp: 0.2, attack: 0.1, decay: 5, total: 0.38 }
    ],
    noise: { amp: 0.08, attack: 0.003, decay: 6, total: 0.08, lp: 900 }
  });
}

/** Early bonus: delicate crystal cascade chime. */
function earlyBonus() {
  return renderCue({ tone: [
    { wave: "sine", freqStart: 880, amp: 0.18, attack: 0.002, decay: 5.5, total: 0.1 },
    { wave: "sine", freqStart: 1174.7, amp: 0.18, attack: 0.05, decay: 5.5, total: 0.15 },
    { wave: "sine", freqStart: 1567.98, amp: 0.2, attack: 0.1, decay: 5.5, total: 0.22 }
  ] });
}

/** Strike hit: dull cushioned bumper thud. */
function strikeHit() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 130, freqEnd: 55, amp: 0.4, attack: 0.003, decay: 3.8, total: 0.24 }
    ],
    noise: { amp: 0.2, attack: 0.002, decay: 5, total: 0.12, hp: 120, lp: 1600 }
  });
}

/** Shift clear: warm, lush four-note celebration chord. */
function shiftClear() {
  return renderCue({ tone: [
    { wave: "sine", freqStart: 523.25, amp: 0.25, attack: 0.005, decay: 4, total: 0.25 },
    { wave: "sine", freqStart: 659.25, amp: 0.25, attack: 0.12, decay: 4, total: 0.38 },
    { wave: "sine", freqStart: 783.99, amp: 0.28, attack: 0.25, decay: 3.8, total: 0.55 },
    { wave: "sine", freqStart: 1046.5, amp: 0.3, attack: 0.4, decay: 3.5, total: 0.75 }
  ] });
}

/** Shift fail: gentle descending acoustic tone. */
function shiftFail() {
  return renderCue({ tone: [
    { wave: "triangle", freqStart: 330, freqEnd: 90, amp: 0.25, attack: 0.01, decay: 2.8, total: 0.7 },
    { wave: "sine", freqStart: 165, freqEnd: 45, amp: 0.28, attack: 0.02, decay: 2.5, total: 0.8 }
  ] });
}

/** Horn near: gentle polite dual tone. */
function hornNear() {
  return renderCue({ tone: [
    { wave: "sine", freqStart: 392, amp: 0.18, attack: 0.01, decay: 3, total: 0.25 },
    { wave: "sine", freqStart: 523.25, amp: 0.18, attack: 0.01, decay: 3, total: 0.25 }
  ] });
}

/** Ambient city night: soothing, distant nocturnal cityscape breeze. */
function ambientCity() {
  const duration = 8.0;
  const N = Math.floor(duration * SAMPLE_RATE);
  const raw = noiseBuffer(N);
  const air = lowpass(highpass(raw, 100), 550);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const breath = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.15 * t);
    const distantHum = Math.sin(2 * Math.PI * 55 * t) * 0.06;
    out[i] = (air[i] * 0.15 + distantHum) * breath;
  }
  const fade = Math.floor(0.08 * SAMPLE_RATE);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[i] = out[i] * k + out[N - fade + i] * (1 - k);
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
  engineLoop, dispatchBlip, parcelPickup, parcelDrop, earlyBonus,
  strikeHit, shiftClear, shiftFail, hornNear, ambientCity
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
