/**
 * Bank Shot SFX synth — generates original CC0 WAV cues entirely in-repo.
 *
 * No network downloads, no sampled material: every cue is synthesized from
 * oscillators / filtered noise with a small committed generator so provenance is
 * auditable (author "Aura3D synthesis", license CC0-1.0). Deterministic LCG noise
 * means regenerating any cue is byte-identical.
 *
 * Run from the repo root:  node apps/showcase-bank-shot/scripts/build-sfx.mjs
 * Output: apps/showcase-bank-shot/assets/sfx/*.wav (16-bit PCM mono 44100 Hz)
 *
 * After generation, register each audio file with the CLI so it lands in the typed
 * root asset map the route imports (`../../../src/aura-assets`):
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts assets add \
 *     apps/showcase-bank-shot/assets/sfx/cueStrike.wav --name bankShotCueStrikeSfx --type audio \
 *     --license CC0-1.0 --author "Aura3D synthesis" \
 *     --source-page "apps/showcase-bank-shot/scripts/build-sfx.mjs"
 *
 * Remaining cues use the same command template with these names:
 *   cushionHit.wav  -> bankShotCushionHitSfx
 *   ballHit.wav     -> bankShotBallHitSfx
 *   pocketDrop.wav  -> bankShotPocketDropSfx
 *   rackClear.wav   -> bankShotRackClearSfx
 *   foulWhistle.wav -> bankShotFoulWhistleSfx
 *   eightWin.wav    -> bankShotEightWinSfx
 *   rackFail.wav    -> bankShotRackFailSfx
 *   comboChime.wav  -> bankShotComboChimeSfx
 *   ambientHall.wav -> bankShotAmbientHallSfx
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

/** cueStrike: leather-tip tap on resin — tight mid knock plus a dry high click. */
function cueStrike() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 420, freqEnd: 180, amp: 0.5, attack: 0.001, decay: 8, total: 0.09 },
      { wave: "triangle", freqStart: 1500, freqEnd: 1200, amp: 0.12, attack: 0.001, decay: 9, total: 0.04 }
    ],
    noise: { amp: 0.3, attack: 0.001, decay: 10, total: 0.035, hp: 1800, lp: 9000 }
  });
}

/** cushionHit: rubber rail thud — soft triangle drop, band-limited noise body. */
function cushionHit() {
  return renderCue({
    tone: { wave: "triangle", freqStart: 190, freqEnd: 95, amp: 0.5, attack: 0.002, decay: 6, total: 0.13 },
    noise: { amp: 0.2, attack: 0.001, decay: 8, total: 0.06, hp: 120, lp: 1400 }
  });
}

/** ballHit: hard resin click — bright short sine partials, the classic pool clack. */
function ballHit() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 2400, freqEnd: 2100, amp: 0.5, attack: 0.0008, decay: 9, total: 0.045 },
      { wave: "sine", freqStart: 3600, freqEnd: 3200, amp: 0.28, attack: 0.0008, decay: 10, total: 0.03 }
    ],
    noise: { amp: 0.24, attack: 0.0008, decay: 12, total: 0.02, hp: 3000 }
  });
}

/** pocketDrop: ball rolls over the leather and drops — short rumble then a low thud. */
function pocketDrop() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 150, freqEnd: 70, amp: 0.6, attack: 0.02, decay: 3.5, total: 0.34 }
    ],
    noise: { amp: 0.4, attack: 0.004, decay: 4, total: 0.16, hp: 80, lp: 900 }
  });
}

/** rackClear: ascending 3-note triangle arpeggio — a rack clocked clean. */
function rackClear() {
  return renderCue({
    tone: [
      { wave: "triangle", freqStart: 523.25, amp: 0.34, attack: 0.005, decay: 4, total: 0.18 },
      { wave: "triangle", freqStart: 659.25, amp: 0.34, attack: 0.1, decay: 4, total: 0.3 },
      { wave: "triangle", freqStart: 783.99, amp: 0.36, attack: 0.2, decay: 4, total: 0.44 }
    ]
  });
}

/** foulWhistle: table referee — two gated square pulses a semitone apart. */
function foulWhistle() {
  const length = Math.floor(0.46 * SAMPLE_RATE);
  const out = new Float32Array(length);
  const pulses = [
    { start: 0, total: 0.14, freq: 660 },
    { start: 0.2, total: 0.18, freq: 622.25 }
  ];
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    let gate = 0;
    let freq = 660;
    for (const p of pulses) {
      if (t >= p.start && t < p.start + p.total) {
        const u = (t - p.start) / p.total;
        gate = Math.min(1, (t - p.start) / 0.006) * Math.pow(1 - u, 2);
        freq = p.freq;
      }
    }
    const phase = 2 * Math.PI * freq * t;
    out[i] = (Math.sin(phase) * 0.6 + Math.sign(Math.sin(phase)) * 0.18) * 0.42 * gate;
  }
  let peak = 0;
  for (let i = 0; i < length; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const gain = Math.min(1, 0.9 / peak);
    for (let i = 0; i < length; i += 1) out[i] *= gain;
  }
  return out;
}

/** eightWin: the 8 drops clean — deep root, delayed bright triad fanfare. */
function eightWin() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 98, freqEnd: 65, amp: 0.55, attack: 0.004, decay: 2.5, total: 0.5 },
      { wave: "triangle", freqStart: 523.25, amp: 0.42, attack: 0.16, decay: 3, total: 0.5 },
      { wave: "triangle", freqStart: 659.25, amp: 0.44, attack: 0.26, decay: 3, total: 0.5 },
      { wave: "triangle", freqStart: 783.99, amp: 0.5, attack: 0.36, decay: 3, total: 0.56 },
      { wave: "sine", freqStart: 1046.5, amp: 0.5, attack: 0.46, decay: 3, total: 0.6 }
    ],
    noise: { amp: 0.18, attack: 0.46, decay: 4, total: 0.2, hp: 3200 }
  });
}

/** rackFail: the lights come up — descending minor pair over a flat low bed. */
function rackFail() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 110, freqEnd: 82, amp: 0.45, attack: 0.01, decay: 2.5, total: 0.7 },
      { wave: "triangle", freqStart: 440, amp: 0.4, attack: 0.08, decay: 2.5, total: 0.5 },
      { wave: "triangle", freqStart: 349.23, amp: 0.42, attack: 0.3, decay: 2.5, total: 0.55 }
    ]
  });
}

/** comboChime: streak sparkle — two quick high sine bells a fifth apart. */
function comboChime() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 1318.5, amp: 0.5, attack: 0.002, decay: 5, total: 0.14 },
      { wave: "sine", freqStart: 1975.5, amp: 0.45, attack: 0.07, decay: 5, total: 0.22 }
    ],
    noise: { amp: 0.12, attack: 0.002, decay: 10, total: 0.05, hp: 5000 }
  });
}

/** ambientHall: intimate billiards hall room tone — warm low-passed harmonic pad. */
function ambientHall() {
  const duration = 3.2;
  const N = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(N);
  const tones = [146.83, 220.0, 293.66]; // D3, A3, D4
  for (let i = 0; i < N; i += 1) {
    const t = i / SAMPLE_RATE;
    let sum = 0;
    for (let k = 0; k < tones.length; k += 1) {
      const freq = tones[k];
      const lfo = 0.85 + 0.15 * Math.sin(2 * Math.PI * (t / duration) * 2 + k);
      sum += Math.sin(2 * Math.PI * freq * t) * lfo * 0.18;
    }
    out[i] = sum;
  }
  const fade = Math.floor(0.08 * SAMPLE_RATE);
  for (let i = 0; i < fade; i += 1) {
    const f = i / fade;
    out[i] *= f;
    out[N - 1 - i] *= f;
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
  cueStrike,
  cushionHit,
  ballHit,
  pocketDrop,
  rackClear,
  foulWhistle,
  eightWin,
  rackFail,
  comboChime,
  ambientHall
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
