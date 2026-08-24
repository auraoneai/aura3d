/**
 * Siege Golf SFX synth — generates original CC0 WAV cues entirely in-repo.
 *
 * No network downloads, no sampled material: every cue is synthesized from
 * oscillators / filtered noise with a small committed generator so provenance is
 * auditable (author "Aura3D synthesis", license CC0-1.0). Deterministic LCG noise
 * means regenerating any cue is byte-identical.
 *
 * Run from the repo root:  node apps/showcase-siege-golf/scripts/build-sfx.mjs
 * Output: apps/showcase-siege-golf/assets/sfx/*.wav (16-bit PCM mono 44100 Hz)
 *
 * After generation, register each audio file with the CLI so it lands in the typed
 * root asset map the route imports (`../../../src/aura-assets`), e.g.:
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts assets add \
 *     apps/showcase-siege-golf/assets/sfx/driveHit.wav --name siegeDriveHitSfx --type audio \
 *     --license CC0-1.0 --author "Aura3D synthesis" \
 *     --source-page "apps/showcase-siege-golf/scripts/build-sfx.mjs"
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
  let peak = 0;
  for (let i = 0; i < length; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const gain = Math.min(1, 0.9 / peak);
    for (let i = 0; i < length; i += 1) out[i] *= gain;
  }
  return out;
}

/** A looping pad — a full short loop (normalized, click-free edges). */
function loopCue(durationSec, wave, freqStart, freqEnd) {
  const length = Math.floor(durationSec * SAMPLE_RATE);
  const out = new Float32Array(length);
  const amp = 0.16;
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const progress = Math.min(1, t / durationSec);
    const f = freqStart + (freqEnd - freqStart) * progress + Math.sin(t * 18) * 4;
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

/** driveHit: firm felt thump with a bright tick — the ball strike. */
function driveHit() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 180, freqEnd: 70, amp: 0.55, attack: 0.002, decay: 6, total: 0.16 },
      { wave: "triangle", freqStart: 1400, freqEnd: 900, amp: 0.14, attack: 0.001, decay: 8, total: 0.05 }
    ],
    noise: { amp: 0.12, attack: 0.001, decay: 10, total: 0.04, hp: 1200 }
  });
}

/** woodCrack: dry knock with body — plank/crate impacts. */
function woodCrack() {
  return renderCue({
    tone: [
      { wave: "triangle", freqStart: 240, freqEnd: 150, amp: 0.42, attack: 0.002, decay: 7, total: 0.14 },
      { wave: "square", freqStart: 480, freqEnd: 320, amp: 0.1, attack: 0.002, decay: 8, total: 0.09 }
    ],
    noise: { amp: 0.3, attack: 0.001, decay: 9, total: 0.07, hp: 400, lp: 3800 }
  });
}

/** metalClang: ringing partials — barrel and target-pin metal. */
function metalClang() {
  return renderCue({ tone: [
    { wave: "sine", freqStart: 620, freqEnd: 600, amp: 0.34, attack: 0.001, decay: 6, total: 0.4 },
    { wave: "sine", freqStart: 940, freqEnd: 905, amp: 0.24, attack: 0.001, decay: 7, total: 0.34 },
    { wave: "sine", freqStart: 1490, freqEnd: 1440, amp: 0.16, attack: 0.001, decay: 8, total: 0.26 },
    { wave: "square", freqStart: 310, freqEnd: 300, amp: 0.08, attack: 0.001, decay: 7, total: 0.2 }
  ] });
}

/** targetDown: descending thunk plus rattle — a knock-down pin falls. */
function targetDown() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 220, freqEnd: 90, amp: 0.5, attack: 0.003, decay: 5, total: 0.3 },
      { wave: "triangle", freqStart: 520, freqEnd: 200, amp: 0.16, attack: 0.002, decay: 6, total: 0.22 }
    ],
    noise: { amp: 0.22, attack: 0.01, decay: 6, total: 0.3, hp: 300, lp: 2600 }
  });
}

/** cupSink: soft drop blip into a two-note confirm — target settles in the cup. */
function cupSink() {
  return renderCue({ tone: [
    { wave: "sine", freqStart: 300, freqEnd: 160, amp: 0.3, attack: 0.004, decay: 6, total: 0.14 },
    { wave: "sine", freqStart: 784, amp: 0.26, attack: 0.09, decay: 5, total: 0.28 },
    { wave: "sine", freqStart: 1046.5, amp: 0.24, attack: 0.16, decay: 5, total: 0.36 }
  ] });
}

/** parChime: warm ascending major arpeggio — par or better hole complete. */
function parChime() {
  return renderCue({ tone: [
    { wave: "triangle", freqStart: 523.25, amp: 0.34, attack: 0.006, decay: 4, total: 0.28 },
    { wave: "triangle", freqStart: 659.25, amp: 0.34, attack: 0.16, decay: 4, total: 0.42 },
    { wave: "triangle", freqStart: 783.99, amp: 0.36, attack: 0.32, decay: 3.5, total: 0.66 },
    { wave: "sine", freqStart: 1046.5, amp: 0.2, attack: 0.46, decay: 3.5, total: 0.8 }
  ] });
}

/** bogeySting: flat minor pair — over-par or failed hole. */
function bogeySting() {
  return renderCue({ tone: [
    { wave: "sawtooth", freqStart: 196, amp: 0.26, attack: 0.008, decay: 3.5, total: 0.34 },
    { wave: "sawtooth", freqStart: 185, amp: 0.28, attack: 0.2, decay: 3, total: 0.55 }
  ] });
}

/** uiConfirm: short soft click for pause/reset/charge start. */
function uiConfirm() {
  return renderCue({ tone: { wave: "triangle", freqStart: 880, freqEnd: 700, amp: 0.25, attack: 0.002, decay: 5, total: 0.09 } });
}

/** ambientWind: airy night-range loop — filtered noise breathing over a low pad. */
function ambientWind() {
  const base = loopCue(1.6, "sine", 58, 66);
  const length = base.length;
  let seed = 0x1234567;
  const breath = new Float32Array(length);
  let lpPrev = 0;
  const rc = 1 / (2 * Math.PI * 500);
  const dt = 1 / SAMPLE_RATE;
  const alpha = dt / (rc + dt);
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const n = ((seed / 0xffffffff) * 2 - 1);
    lpPrev += alpha * (n - lpPrev);
    breath[i] = lpPrev;
  }
  const swell = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    swell[i] = 0.55 + 0.45 * Math.sin(t * Math.PI * 2 / 1.6 * 2);
  }
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = base[i] + breath[i] * 0.22 * swell[i];
  const fade = Math.floor(0.02 * SAMPLE_RATE);
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
  driveHit,
  woodCrack,
  metalClang,
  targetDown,
  cupSink,
  parChime,
  bogeySting,
  uiConfirm,
  ambientWind
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
