/**
 * Gallery Shift SFX synth — generates original CC0 WAV cues entirely in-repo.
 *
 * No network downloads, no sampled material: every cue is synthesized from
 * oscillators / filtered noise with a small committed generator so provenance is
 * auditable (author "Aura3D synthesis", license CC0-1.0). Deterministic LCG noise
 * means regenerating any cue is byte-identical.
 *
 * Run from the repo root:  node apps/showcase-gallery-shift/scripts/build-sfx.mjs
 * Output: apps/showcase-gallery-shift/assets/sfx/*.wav (16-bit PCM mono 44100 Hz)
 *
 * After generation, register each audio file with the CLI so it lands in the typed
 * root asset map the route imports (`../../../src/aura-assets`). Registration
 * order matters for sibling-agent coordination: ambientHall registers BEFORE
 * exitWin, and exitWin registers LAST (it is the sentinel for the next agent).
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts assets add \
 *     apps/showcase-gallery-shift/assets/sfx/sneakStep.wav --name galleryShiftSneakStepSfx --type audio \
 *     --license CC0-1.0 --author "Aura3D synthesis" \
 *     --source-page "apps/showcase-gallery-shift/scripts/build-sfx.mjs"
 *
 * Remaining cues use the same command template with these names (register order):
 *   walkStep.wav     -> galleryShiftWalkStepSfx
 *   guardAlert.wav   -> galleryShiftGuardAlertSfx
 *   alertRise.wav    -> galleryShiftAlertRiseSfx
 *   exhibitLift.wav  -> galleryShiftExhibitLiftSfx
 *   laserTrip.wav    -> galleryShiftLaserTripSfx
 *   cameraWhir.wav   -> galleryShiftCameraWhirSfx
 *   caughtSting.wav  -> galleryShiftCaughtStingSfx
 *   floorClear.wav   -> galleryShiftFloorClearSfx
 *   ambientHall.wav  -> galleryShiftAmbientHallSfx   (before exitWin)
 *   exitWin.wav      -> galleryShiftExitWinSfx       (LAST - sibling sentinel)
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

/** sneakStep: hushed cloth footfall — tiny lowpassed noise tap, almost a whisper. */
function sneakStep() {
  return renderCue({
    noise: { amp: 0.5, attack: 0.004, decay: 10, total: 0.07, hp: 220, lp: 1600 }
  });
}

/** walkStep: firm shoe on marble — low knock plus a short bright scuff. */
function walkStep() {
  return renderCue({
    tone: { wave: "sine", freqStart: 170, freqEnd: 95, amp: 0.5, attack: 0.002, decay: 8, total: 0.1 },
    noise: { amp: 0.3, attack: 0.001, decay: 10, total: 0.045, hp: 700, lp: 5200 }
  });
}

/** guardAlert: sharp radio double-beep plus a rising brass-ish tone. */
function guardAlert() {
  const length = Math.floor(0.5 * SAMPLE_RATE);
  const out = new Float32Array(length);
  const beeps = [
    { start: 0, total: 0.09, freq: 1180 },
    { start: 0.13, total: 0.09, freq: 1180 },
    { start: 0.26, total: 0.2, freq: 620 }
  ];
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    for (const b of beeps) {
      if (t >= b.start && t < b.start + b.total) {
        const u = (t - b.start) / b.total;
        v += Math.sin(2 * Math.PI * b.freq * t) * Math.min(1, (t - b.start) / 0.004) * Math.pow(1 - u, 2) * 0.5;
      }
    }
    out[i] = v;
  }
  let peak = 0;
  for (let i = 0; i < length; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const gain = Math.min(1, 0.9 / peak);
    for (let i = 0; i < length; i += 1) out[i] *= gain;
  }
  return out;
}

/** alertRise: rising unease — sine sweep 240->660 Hz with a tremolo tail. */
function alertRise() {
  return renderCue({
    tone: { wave: "triangle", freqStart: 240, freqEnd: 660, amp: 0.45, attack: 0.01, decay: 2, total: 0.42 }
  });
}

/** exhibitLift: heavy pickup — marble grind (band noise) plus a wooden knock. */
function exhibitLift() {
  return renderCue({
    tone: [
      { wave: "triangle", freqStart: 140, freqEnd: 210, amp: 0.4, attack: 0.006, decay: 3, total: 0.3 },
      { wave: "sine", freqStart: 520, freqEnd: 700, amp: 0.2, attack: 0.16, decay: 3, total: 0.3 }
    ],
    noise: { amp: 0.4, attack: 0.02, decay: 3, total: 0.34, hp: 160, lp: 900 }
  });
}

/** laserTrip: alarm burst — urgent 950/1250 Hz alternating square pulses. */
function laserTrip() {
  const length = Math.floor(0.62 * SAMPLE_RATE);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const cycle = t / 0.11;
    const within = t - Math.floor(cycle) * 0.11;
    const gate = within < 0.07 ? Math.min(1, within / 0.004) * Math.pow(1 - within / 0.07, 2) : 0;
    const freq = Math.floor(cycle) % 2 === 0 ? 950 : 1250;
    out[i] = Math.sign(Math.sin(2 * Math.PI * freq * t)) * 0.42 * gate;
  }
  let peak = 0;
  for (let i = 0; i < length; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const gain = Math.min(1, 0.9 / peak);
    for (let i = 0; i < length; i += 1) out[i] *= gain;
  }
  return out;
}

/** cameraWhir: servo sweep — soft sawtooth gliss with airy noise. */
function cameraWhir() {
  return renderCue({
    tone: { wave: "sawtooth", freqStart: 320, freqEnd: 480, amp: 0.2, attack: 0.05, decay: 2, total: 0.4 },
    noise: { amp: 0.22, attack: 0.04, decay: 3, total: 0.42, hp: 1800, lp: 7000 }
  });
}

/** caughtSting: harsh minor-second stab — two detuned squares dropping. */
function caughtSting() {
  return renderCue({
    tone: [
      { wave: "square", freqStart: 340, freqEnd: 240, amp: 0.34, attack: 0.004, decay: 3, total: 0.55 },
      { wave: "square", freqStart: 362, freqEnd: 252, amp: 0.3, attack: 0.004, decay: 3, total: 0.55 },
      { wave: "sine", freqStart: 90, freqEnd: 55, amp: 0.5, attack: 0.004, decay: 2.5, total: 0.6 }
    ],
    noise: { amp: 0.18, attack: 0.002, decay: 8, total: 0.2, hp: 900, lp: 4000 }
  });
}

/** floorClear: relieved 3-note descending-then-rising chime. */
function floorClear() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 783.99, amp: 0.34, attack: 0.005, decay: 3.5, total: 0.2 },
      { wave: "sine", freqStart: 659.25, amp: 0.32, attack: 0.12, decay: 3.5, total: 0.3 },
      { wave: "sine", freqStart: 880, amp: 0.4, attack: 0.24, decay: 3, total: 0.44 }
    ]
  });
}

/** ambientHall: low gallery room tone — warm celestial A-minor suspense pad with soft filtered air. */
function ambientHall() {
  const duration = 3.2;
  const N = Math.floor(duration * SAMPLE_RATE);
  const tones = [220.0, 261.63, 329.63, 440.0]; // A3, C4, E4, A4
  const air = noiseBuffer(N);
  const lp = lowpass(air, 380);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    const t = i / SAMPLE_RATE;
    let sum = 0;
    for (let k = 0; k < tones.length; k += 1) {
      const freq = tones[k];
      const lfo = 0.8 + 0.2 * Math.sin(2 * Math.PI * (t / duration) * (k + 1));
      sum += Math.sin(2 * Math.PI * freq * t) * lfo * 0.12;
    }
    out[i] = sum + lp[i] * 0.08 * (0.8 + 0.2 * Math.sin(t * 0.8));
  }
  const fade = Math.floor(0.08 * SAMPLE_RATE);
  for (let i = 0; i < fade; i += 1) {
    const f = i / fade;
    out[i] *= f;
    out[N - 1 - i] *= f;
  }
  let peak = 0;
  for (let i = 0; i < N; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const gain = Math.min(1, 0.45 / peak);
    for (let i = 0; i < N; i += 1) out[i] *= gain;
  }
  return out;
}

/** exitWin: heist-complete fanfare — warm 4-note ascending arpeggio with sparkle. */
function exitWin() {
  return renderCue({
    tone: [
      { wave: "triangle", freqStart: 523.25, amp: 0.32, attack: 0.005, decay: 3.5, total: 0.18 },
      { wave: "triangle", freqStart: 659.25, amp: 0.38, attack: 0.12, decay: 3.5, total: 0.3 },
      { wave: "triangle", freqStart: 783.99, amp: 0.46, attack: 0.24, decay: 3, total: 0.42 },
      { wave: "triangle", freqStart: 1046.5, amp: 0.6, attack: 0.36, decay: 2.6, total: 0.62 }
    ],
    noise: { amp: 0.16, attack: 0.36, decay: 5, total: 0.3, hp: 3600 }
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
  sneakStep,
  walkStep,
  guardAlert,
  alertRise,
  exhibitLift,
  laserTrip,
  cameraWhir,
  caughtSting,
  floorClear,
  ambientHall,
  exitWin
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
