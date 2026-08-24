/**
 * Patrol Wing SFX synth — generates original CC0 WAV cues entirely in-repo.
 *
 * No network downloads, no sampled material: every cue is synthesized from
 * oscillators / filtered noise with a small committed generator so provenance
 * is auditable (author "Aura3D synthesis", license CC0-1.0). Deterministic LCG
 * noise means regenerating any cue is byte-identical.
 *
 * Run from the repo root:  node apps/showcase-patrol-wing/scripts/build-sfx.mjs
 * Output: apps/showcase-patrol-wing/assets/sfx/*.wav (16-bit PCM mono 44100 Hz)
 *
 * After generation, register each audio file with the CLI so it lands in the
 * typed root asset map the route imports (`../../../src/aura-assets`), e.g.:
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts assets add \
 *     apps/showcase-patrol-wing/assets/sfx/engineLoop.wav --name patrolWingEngineLoopSfx --type audio \
 *     --license CC0-1.0 --author "Aura3D synthesis" \
 *     --source-page "apps/showcase-patrol-wing/scripts/build-sfx.mjs"
 *
 * Remaining cues use the same command template with these names:
 *   ringChime.wav   -> patrolWingRingChimeSfx
 *   cannonFire.wav  -> patrolWingCannonFireSfx
 *   droneHit.wav    -> patrolWingDroneHitSfx
 *   droneDown.wav   -> patrolWingDroneDownSfx
 *   hullAlarm.wav   -> patrolWingHullAlarmSfx
 *   shotDown.wav    -> patrolWingShotDownSfx
 *   crashThud.wav   -> patrolWingCrashThudSfx
 *   touchdown.wav   -> patrolWingTouchdownSfx
 *   patrolClear.wav -> patrolWingPatrolClearSfx
 *   ambientWind.wav -> patrolWingAmbientWindSfx  (register LAST — sibling-agent sentinel)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/sfx");
const SAMPLE_RATE = 44100;

// ---- waveform / DSP helpers (vault-breakers pattern) ------------------------
function noiseBuffer(length) {
  const out = new Float32Array(length);
  let seed = 0x9e3779b9;
  for (let i = 0; i < length; i += 1) {
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

function normalize(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak > 0) {
    const gain = Math.min(1, 0.9 / peak);
    for (let i = 0; i < samples.length; i += 1) samples[i] *= gain;
  }
  return samples;
}

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
  return normalize(out);
}

/** A click-free looping cue with faded edges (engine / wind beds). */
function loopCue(durationSec, fill) {
  const length = Math.floor(durationSec * SAMPLE_RATE);
  const out = new Float32Array(length);
  fill(out, length);
  const fade = Math.floor(0.03 * SAMPLE_RATE);
  for (let i = 0; i < fade; i += 1) {
    out[i] *= i / fade;
    out[length - 1 - i] *= i / fade;
  }
  return normalize(out);
}

// ---- cue recipes -------------------------------------------------------------

/** engineLoop: smooth, warm, low-rumble twin-turboprop turbine purr (no harsh saw buzzing). */
function engineLoop() {
  return loopCue(6.0, (out, length) => {
    for (let i = 0; i < length; i += 1) {
      const t = i / SAMPLE_RATE;
      const rpm = 0.95 + 0.05 * Math.sin(t * 0.8);
      const base = 70 * rpm;
      const sub = Math.sin(2 * Math.PI * base * t) * 0.45;
      const mid = Math.sin(2 * Math.PI * base * 2 * t) * 0.25;
      const breath = 0.85 + 0.15 * Math.sin(t * 1.5);
      out[i] = (sub + mid) * breath * 0.22;
    }
    const air = noiseBuffer(length);
    const band = lowpass(highpass(air, 180), 600);
    for (let i = 0; i < length; i += 1) out[i] += band[i] * 0.04;
  });
}

/** ambientWind: soothing open-air island breeze. */
function ambientWind() {
  return loopCue(8.0, (out, length) => {
    const raw = noiseBuffer(length);
    const band = highpass(lowpass(raw, 750), 120);
    for (let i = 0; i < length; i += 1) {
      const t = i / SAMPLE_RATE;
      const breath = 0.6 + 0.4 * Math.sin(t * 0.5) * Math.sin(t * 0.25 + 0.8);
      out[i] = band[i] * 0.18 * Math.max(0.1, breath);
    }
  });
}

/** ringChime: bright, delicate pass chime with warm velvet decay. */
function ringChime() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 987.77, amp: 0.3, attack: 0.002, decay: 4.5, total: 0.35 },
      { wave: "sine", freqStart: 1318.5, amp: 0.24, attack: 0.04, decay: 4.5, total: 0.4 },
      { wave: "triangle", freqStart: 1975.5, amp: 0.1, attack: 0.08, decay: 5, total: 0.35 }
    ]
  });
}

/** cannonFire: punchy, satisfying aerodynamic pulse. */
function cannonFire() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 180, freqEnd: 65, amp: 0.4, attack: 0.002, decay: 9, total: 0.08 }
    ],
    noise: { amp: 0.15, attack: 0.001, decay: 8, total: 0.05, hp: 600, lp: 2500 }
  });
}

/** droneHit: soft metallic hit confirm. */
function droneHit() {
  return renderCue({
    tone: [
      { wave: "triangle", freqStart: 380, freqEnd: 240, amp: 0.3, attack: 0.002, decay: 7, total: 0.08 },
      { wave: "sine", freqStart: 950, freqEnd: 880, amp: 0.15, attack: 0.002, decay: 6, total: 0.09 }
    ]
  });
}

/** droneDown: kill confirm — satisfying ascending chord chime. */
function droneDown() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 587.33, amp: 0.25, attack: 0.002, decay: 5, total: 0.12 },
      { wave: "sine", freqStart: 739.99, amp: 0.25, attack: 0.05, decay: 5, total: 0.16 },
      { wave: "sine", freqStart: 880.00, amp: 0.3, attack: 0.1, decay: 4.5, total: 0.25 }
    ],
    noise: { amp: 0.08, attack: 0.1, decay: 6, total: 0.2, hp: 1200, lp: 3000 }
  });
}

/** hullAlarm: gentle warning tone (soft dual pulse, no harsh ear-piercing buzz). */
function hullAlarm() {
  const length = Math.floor(0.32 * SAMPLE_RATE);
  const out = new Float32Array(length);
  const pulses = [{ start: 0, total: 0.1 }, { start: 0.14, total: 0.12 }];
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    let gate = 0;
    for (const p of pulses) {
      if (t >= p.start && t < p.start + p.total) {
        const u = (t - p.start) / p.total;
        gate = Math.min(1, (t - p.start) / 0.005) * Math.pow(1 - u, 2.5);
      }
    }
    const phase = 2 * Math.PI * 330 * t;
    out[i] = Math.sin(phase) * 0.25 * gate;
  }
  return normalize(out);
}

/** shotDown: gentle descending tone into low rumble. */
function shotDown() {
  return renderCue({
    tone: [
      { wave: "triangle", freqStart: 380, freqEnd: 80, amp: 0.35, attack: 0.01, decay: 2.2, total: 0.7 },
      { wave: "sine", freqStart: 80, freqEnd: 40, amp: 0.45, attack: 0.3, decay: 2.5, total: 0.8 }
    ],
    noise: { amp: 0.15, attack: 0.3, decay: 2.5, total: 0.5, hp: 50, lp: 600 }
  });
}

/** crashThud: soft low-frequency impact thud. */
function crashThud() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 110, freqEnd: 38, amp: 0.55, attack: 0.002, decay: 4, total: 0.25 }
    ],
    noise: { amp: 0.2, attack: 0.002, decay: 6, total: 0.12, hp: 60, lp: 1200 }
  });
}

/** touchdown: soft smooth landing chime + settling tap. */
function touchdown() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 330, freqEnd: 440, amp: 0.25, attack: 0.005, decay: 3.5, total: 0.15 },
      { wave: "sine", freqStart: 95, freqEnd: 55, amp: 0.35, attack: 0.02, decay: 4, total: 0.25 }
    ]
  });
}

/** patrolClear: mission fanfare — lush, warm ascending four-note chord. */
function patrolClear() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 523.25, amp: 0.25, attack: 0.005, decay: 4, total: 0.2 },
      { wave: "sine", freqStart: 659.25, amp: 0.25, attack: 0.08, decay: 4, total: 0.25 },
      { wave: "sine", freqStart: 783.99, amp: 0.28, attack: 0.16, decay: 4, total: 0.3 },
      { wave: "sine", freqStart: 1046.5, amp: 0.32, attack: 0.24, decay: 3.5, total: 0.5 }
    ]
  });
}

// ---- WAV writer --------------------------------------------------------------
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

// engineLoop + ambientWind are loops but NOT registered in any special order
// here; registration order is a CLI concern (ambientWind registers LAST).
const cues = {
  engineLoop,
  ringChime,
  cannonFire,
  droneHit,
  droneDown,
  hullAlarm,
  shotDown,
  crashThud,
  touchdown,
  patrolClear,
  ambientWind
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, fn] of Object.entries(cues)) {
  const samples = fn();
  const path = resolve(OUT_DIR, `${name}.wav`);
  const duration = writeWav(path, samples);
  console.log("wrote", path, "(" + duration.toFixed(3) + "s)");
}
console.log("\nGenerated", Object.keys(cues).length, "cues into", OUT_DIR);
