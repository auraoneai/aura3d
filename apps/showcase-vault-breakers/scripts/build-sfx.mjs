/**
 * Vault Breakers SFX synth — generates original CC0 WAV cues entirely in-repo.
 *
 * No network downloads, no sampled material: every cue is synthesized from
 * oscillators / filtered noise with a small committed generator so provenance is
 * auditable (author "Aura3D synthesis", license CC0-1.0). Deterministic LCG noise
 * means regenerating any cue is byte-identical.
 *
 * Run from the repo root:  node apps/showcase-vault-breakers/scripts/build-sfx.mjs
 * Output: apps/showcase-vault-breakers/assets/sfx/*.wav (16-bit PCM mono 44100 Hz)
 *
 * After generation, register each audio file with the CLI so it lands in the typed
 * root asset map the route imports (`../../../src/aura-assets`), e.g.:
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts assets add \
 *     apps/showcase-vault-breakers/assets/sfx/flipperSnap.wav --name vaultFlipperSnapSfx --type audio \
 *     --license CC0-1.0 --author "Aura3D synthesis" \
 *     --source-page "apps/showcase-vault-breakers/scripts/build-sfx.mjs"
 *
 * Remaining cues use the same command template with these names:
 *   bumperHit.wav      -> vaultBumperHitSfx
 *   slingPop.wav       -> vaultSlingPopSfx
 *   rampRoll.wav       -> vaultRampRollSfx
 *   targetDown.wav     -> vaultTargetDownSfx
 *   bankClear.wav      -> vaultBankClearSfx
 *   vaultOpen.wav      -> vaultVaultOpenSfx
 *   multiball.wav      -> vaultMultiballSfx
 *   ballDrain.wav      -> vaultBallDrainSfx
 *   tiltWarn.wav       -> vaultTiltWarnSfx
 *   plungerRelease.wav -> vaultPlungerReleaseSfx
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

/** flipperSnap: sharp mechanical thunk — fast sine drop plus a bright click. */
function flipperSnap() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 300, freqEnd: 90, amp: 0.55, attack: 0.001, decay: 7, total: 0.12 }
    ],
    noise: { amp: 0.22, attack: 0.001, decay: 10, total: 0.03, hp: 1500 }
  });
}

/** bumperHit: bright round pop — sine partials around 800/1200 Hz, short. */
function bumperHit() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 800, freqEnd: 760, amp: 0.4, attack: 0.001, decay: 6, total: 0.12 },
      { wave: "sine", freqStart: 1200, freqEnd: 1140, amp: 0.26, attack: 0.001, decay: 7, total: 0.09 }
    ]
  });
}

/** slingPop: snappier mid pop — square body plus band-limited noise, harsher than a bumper. */
function slingPop() {
  return renderCue({
    tone: { wave: "square", freqStart: 560, freqEnd: 380, amp: 0.3, attack: 0.001, decay: 7, total: 0.09 },
    noise: { amp: 0.26, attack: 0.001, decay: 9, total: 0.05, hp: 900, lp: 5200 }
  });
}

/** rampRoll: short rolling rumble — lowpassed noise swelling up and away. */
function rampRoll() {
  return renderCue({
    noise: { amp: 0.6, attack: 0.13, decay: 2, total: 0.35, hp: 50, lp: 650 }
  });
}

/** targetDown: dry knock — woodCrack-style but lighter, a drop target folds down. */
function targetDown() {
  return renderCue({
    tone: [
      { wave: "triangle", freqStart: 250, freqEnd: 165, amp: 0.32, attack: 0.002, decay: 7, total: 0.12 },
      { wave: "square", freqStart: 500, freqEnd: 340, amp: 0.07, attack: 0.002, decay: 8, total: 0.08 }
    ],
    noise: { amp: 0.22, attack: 0.001, decay: 9, total: 0.06, hp: 450, lp: 4200 }
  });
}

/** bankClear: ascending 3-note triangle arpeggio — full target bank cleared. */
function bankClear() {
  return renderCue({
    tone: [
      { wave: "triangle", freqStart: 523.25, amp: 0.34, attack: 0.005, decay: 4, total: 0.18 },
      { wave: "triangle", freqStart: 659.25, amp: 0.34, attack: 0.1, decay: 4, total: 0.3 },
      { wave: "triangle", freqStart: 783.99, amp: 0.36, attack: 0.2, decay: 4, total: 0.44 }
    ]
  });
}

/** vaultOpen: deep unlock rumble (70->45 Hz) with a delayed bright chime. */
function vaultOpen() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 70, freqEnd: 45, amp: 0.6, attack: 0.004, decay: 2.5, total: 0.5 },
      { wave: "sine", freqStart: 1318.5, amp: 0.9, attack: 0.28, decay: 3, total: 0.72 },
      { wave: "sine", freqStart: 1760, amp: 0.7, attack: 0.32, decay: 3, total: 0.7 }
    ]
  });
}

/** multiball: energetic fast 4-note arpeggio with a high noise sparkle. */
function multiball() {
  return renderCue({
    tone: [
      { wave: "square", freqStart: 659.25, amp: 0.26, attack: 0.002, decay: 4, total: 0.1 },
      { wave: "square", freqStart: 783.99, amp: 0.45, attack: 0.07, decay: 3, total: 0.3 },
      { wave: "square", freqStart: 987.77, amp: 0.65, attack: 0.14, decay: 3, total: 0.36 },
      { wave: "square", freqStart: 1318.5, amp: 0.9, attack: 0.21, decay: 3, total: 0.44 }
    ],
    noise: { amp: 0.22, attack: 0.004, decay: 6, total: 0.28, hp: 3200 }
  });
}

/** ballDrain: descending sad thud — sine 220->60 Hz over half a second. */
function ballDrain() {
  return renderCue({
    tone: { wave: "sine", freqStart: 220, freqEnd: 60, amp: 0.5, attack: 0.004, decay: 3, total: 0.5 }
  });
}

/** tiltWarn: warning buzz — 140 Hz square gated into two pulses. */
function tiltWarn() {
  const length = Math.floor(0.42 * SAMPLE_RATE);
  const out = new Float32Array(length);
  const pulses = [
    { start: 0, total: 0.13 },
    { start: 0.19, total: 0.16 }
  ];
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    let gate = 0;
    for (const p of pulses) {
      if (t >= p.start && t < p.start + p.total) {
        const u = (t - p.start) / p.total;
        gate = Math.min(1, (t - p.start) / 0.004) * Math.pow(1 - u, 3);
      }
    }
    const phase = 2 * Math.PI * 140 * t;
    out[i] = Math.sign(Math.sin(phase)) * 0.45 * gate;
  }
  let peak = 0;
  for (let i = 0; i < length; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const gain = Math.min(1, 0.9 / peak);
    for (let i = 0; i < length; i += 1) out[i] *= gain;
  }
  return out;
}

/** plungerRelease: spring boing — sine sweep 200->900 Hz over 0.3 s. */
function plungerRelease() {
  return renderCue({
    tone: { wave: "sine", freqStart: 200, freqEnd: 900, amp: 0.5, attack: 0.003, decay: 2.5, total: 0.3 }
  });
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
  flipperSnap,
  bumperHit,
  slingPop,
  rampRoll,
  targetDown,
  bankClear,
  vaultOpen,
  multiball,
  ballDrain,
  tiltWarn,
  plungerRelease
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
