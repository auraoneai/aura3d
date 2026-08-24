/**
 * Neon Swarm SFX synth — generates original CC0 WAV cues entirely in-repo.
 *
 * No network downloads, no sampled material: every cue is synthesized from
 * oscillators / noise with this committed generator so provenance is auditable
 * (author "Aura3D synthesis", license CC0-1.0).
 *
 * Run from this app directory:  node scripts/build-sfx.mjs
 * Output: assets/sfx/*.wav  (16-bit PCM mono 44100 Hz)
 *
 * After generation, register each with the CLI, e.g.:
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts assets add \
 *     ./apps/showcase-neon-swarm/assets/sfx/neonPulseFireSfx.wav --name neonPulseFireSfx \
 *     --type audio --license CC0-1.0 --author "Aura3D synthesis" \
 *     --source-page "apps/showcase-neon-swarm/scripts/build-sfx.mjs"
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/sfx");
const SAMPLE_RATE = 44100;

// ---- waveform helpers -------------------------------------------------------
let noiseState = 0x4e534658;
function nextNoise() {
  noiseState = (Math.imul(noiseState, 1664525) + 1013904223) >>> 0;
  return noiseState / 4294967296;
}
function noiseBuffer(length) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = nextNoise() * 2 - 1;
  return out;
}
function envelope(length, attack, decay, total) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const start = Math.min(1, t / attack);
    const end = Math.pow(Math.max(0, 1 - t / total), decay);
    out[i] = start * end;
  }
  return out;
}

/** Render a cue into a normalized Float32 mono buffer from tone/noise parts. */
function renderCue({ tone, noise }) {
  const partTotals = Array.isArray(tone) ? tone.map((part) => part.total) : [tone?.total ?? 0];
  const totalSec = Math.max(...partTotals, noise?.total ?? 0, 0.1) + 0.05;
  const length = Math.floor(totalSec * SAMPLE_RATE);
  const out = new Float32Array(length);

  if (tone) {
    const tones = Array.isArray(tone) ? tone : [tone];
    for (const part of tones) {
      const { wave = "sine", freqStart, freqEnd = freqStart, amp = 0.5, attack = 0.005, decay = 3, total = 0.2 } = part;
      const env = envelope(length, attack, decay, total);
      for (let i = 0; i < length; i += 1) {
        const t = i / SAMPLE_RATE;
        const progress = Math.min(1, t / total);
        const f = freqStart + (freqEnd - freqStart) * progress;
        const phase = 2 * Math.PI * f * t;
        let v = 0;
        if (wave === "sine") v = Math.sin(phase);
        else if (wave === "triangle") v = 2 / Math.PI * Math.asin(Math.sin(phase));
        else if (wave === "sawtooth") v = 2 * (phase / (2 * Math.PI) - Math.floor(0.5 + phase / (2 * Math.PI)));
        else if (wave === "square") v = Math.sign(Math.sin(phase));
        else v = Math.sin(phase);
        out[i] += v * env[i] * amp;
      }
    }
  }

  if (noise) {
    const { amp = 0.4, attack = 0.003, decay = 4, total = 0.15, hp = 0 } = noise;
    const raw = noiseBuffer(length);
    let lp = 0;
    for (let i = 0; i < length; i += 1) {
      let v = raw[i];
      if (hp > 0) {
        lp += 0.9 * (v - lp);
        v = v - lp;
      }
      out[i] += v * envelope(length, attack, decay, total)[i] * amp;
    }
  }

  // normalize to 0.92 peak
  let peak = 0;
  for (let i = 0; i < length; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const gain = 0.92 / peak;
    for (let i = 0; i < length; i += 1) out[i] *= gain;
  }
  return out;
}

// ---- cue recipes ------------------------------------------------------------
/** Pulse fire — neon zap: fast saw drop plus a bright crack. */
function pulseFire() {
  return renderCue({
    tone: [
      { wave: "sawtooth", freqStart: 1400, freqEnd: 320, amp: 0.42, attack: 0.002, decay: 7, total: 0.14 },
      { wave: "sine", freqStart: 700, freqEnd: 220, amp: 0.3, attack: 0.002, decay: 6, total: 0.16 }
    ],
    noise: { amp: 0.18, attack: 0.001, decay: 8, total: 0.07, hp: 1600 }
  });
}
/** Drone hit — short metallic tick. */
function droneHit() {
  return renderCue({
    tone: [
      { wave: "square", freqStart: 520, freqEnd: 300, amp: 0.3, attack: 0.001, decay: 9, total: 0.08 },
      { wave: "sine", freqStart: 1900, freqEnd: 1400, amp: 0.12, attack: 0.001, decay: 8, total: 0.06 }
    ],
    noise: { amp: 0.12, attack: 0.001, decay: 10, total: 0.05, hp: 900 }
  });
}
/** Drone die — spark burst: noise crunch plus descending core. */
function droneDie() {
  return renderCue({
    tone: [
      { wave: "sawtooth", freqStart: 420, freqEnd: 80, amp: 0.34, attack: 0.002, decay: 6, total: 0.3 },
      { wave: "sine", freqStart: 210, freqEnd: 55, amp: 0.26, attack: 0.002, decay: 5, total: 0.32 }
    ],
    noise: { amp: 0.3, attack: 0.002, decay: 6, total: 0.24, hp: 500 }
  });
}
/** Player hurt — harsh low buzz. */
function playerHurt() {
  return renderCue({
    tone: [
      { wave: "square", freqStart: 190, freqEnd: 95, amp: 0.4, attack: 0.003, decay: 4, total: 0.26 },
      { wave: "sawtooth", freqStart: 96, freqEnd: 60, amp: 0.3, attack: 0.003, decay: 4, total: 0.28 }
    ],
    noise: { amp: 0.14, attack: 0.002, decay: 6, total: 0.16 }
  });
}
/** Dash — air whoosh: band-passed noise swell with a rising tail. */
function dash() {
  return renderCue({
    tone: { wave: "sine", freqStart: 240, freqEnd: 620, amp: 0.16, attack: 0.05, decay: 3, total: 0.28 },
    noise: { amp: 0.34, attack: 0.04, decay: 3.4, total: 0.3, hp: 320 }
  });
}
/** Pickup — bright ascending two-note chime. */
function pickup() {
  return renderCue({ tone: [
    { wave: "triangle", freqStart: 660, amp: 0.36, attack: 0.003, decay: 5, total: 0.18 },
    { wave: "sine", freqStart: 990, amp: 0.3, attack: 0.09, decay: 4, total: 0.3 },
    { wave: "sine", freqStart: 1320, amp: 0.16, attack: 0.11, decay: 5, total: 0.32 }
  ] });
}
/** Wave start — alarm two-tone. */
function waveStart() {
  return renderCue({ tone: [
    { wave: "square", freqStart: 440, amp: 0.22, attack: 0.01, decay: 3, total: 0.18 },
    { wave: "square", freqStart: 554, amp: 0.22, attack: 0.17, decay: 3, total: 0.36 }
  ] });
}
/** Wave clear — resolving neon triad. */
function waveClear() {
  return renderCue({ tone: [
    { wave: "triangle", freqStart: 523, amp: 0.3, attack: 0.01, decay: 3.4, total: 0.5 },
    { wave: "triangle", freqStart: 659, amp: 0.26, attack: 0.09, decay: 3.4, total: 0.52 },
    { wave: "sine", freqStart: 784, amp: 0.24, attack: 0.17, decay: 3, total: 0.62 }
  ] });
}
/** Charged radial burst — broad rising core with a decisive gold impact. */
function radialBurst() {
  return renderCue({ tone: [
    { wave: "sine", freqStart: 90, freqEnd: 180, amp: 0.46, attack: 0.008, decay: 2.8, total: 0.56 },
    { wave: "triangle", freqStart: 360, freqEnd: 980, amp: 0.32, attack: 0.05, decay: 3.2, total: 0.5 },
    { wave: "sine", freqStart: 1320, freqEnd: 660, amp: 0.22, attack: 0.18, decay: 4, total: 0.62 }
  ] });
}
/** Graze — a very short high chime that cannot be confused with collection. */
function graze() {
  return renderCue({ tone: [
    { wave: "sine", freqStart: 1760, freqEnd: 2217, amp: 0.32, attack: 0.001, decay: 10, total: 0.11 },
    { wave: "triangle", freqStart: 880, freqEnd: 1320, amp: 0.16, attack: 0.018, decay: 8, total: 0.14 }
  ] });
}
/** Combo break — a clipped descending dyad. */
function comboBreak() {
  return renderCue({ tone: [
    { wave: "square", freqStart: 440, freqEnd: 220, amp: 0.25, attack: 0.002, decay: 6, total: 0.19 },
    { wave: "sine", freqStart: 330, freqEnd: 110, amp: 0.3, attack: 0.06, decay: 5, total: 0.3 }
  ] });
}
/** Death sting — heavy downward fall. */
function deathSting() {
  return renderCue({
    tone: [
      { wave: "sawtooth", freqStart: 392, freqEnd: 70, amp: 0.4, attack: 0.004, decay: 4.6, total: 0.85 },
      { wave: "sine", freqStart: 196, freqEnd: 48, amp: 0.34, attack: 0.004, decay: 4, total: 0.9 }
    ],
    noise: { amp: 0.16, attack: 0.002, decay: 5, total: 0.4 }
  });
}
/** Ambient hum — slow breathing city-drone bed, loopable. */
function ambientHum() {
  const total = 3.6;
  const length = Math.floor(total * SAMPLE_RATE);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const lfo = 0.5 + 0.5 * Math.sin(2 * Math.PI * t / total * 2);
    const body = Math.sin(2 * Math.PI * 55 * t) * 0.5 + Math.sin(2 * Math.PI * 82.5 * t) * 0.3 + Math.sin(2 * Math.PI * 110.2 * t) * 0.2;
    const shimmer = Math.sin(2 * Math.PI * 660 * t) * 0.05 * lfo;
    out[i] = (body * (0.35 + 0.2 * lfo) + shimmer) * 0.55;
  }
  // crossfade ends so the file loops cleanly
  const fade = Math.floor(0.25 * SAMPLE_RATE);
  for (let i = 0; i < fade; i += 1) {
    const k = i / fade;
    out[i] *= k;
    out[length - 1 - i] *= k;
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
  buffer.writeUInt16LE(1, 20); // PCM
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
}

// ---- main -------------------------------------------------------------------
const cues = {
  neonPulseFireSfx: pulseFire(),
  neonDroneHitSfx: droneHit(),
  neonDroneDieSfx: droneDie(),
  neonPlayerHurtSfx: playerHurt(),
  neonDashSfx: dash(),
  neonPickupSfx: pickup(),
  neonWaveStartSfx: waveStart(),
  neonWaveClearSfx: waveClear(),
  neonBurstSfx: radialBurst(),
  neonGrazeSfx: graze(),
  neonComboBreakSfx: comboBreak(),
  neonDeathStingSfx: deathSting(),
  neonAmbientHumSfx: ambientHum()
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, samples] of Object.entries(cues)) {
  const path = resolve(OUT_DIR, name + ".wav");
  writeWav(path, samples);
  console.log("wrote", path, samples.length, "samples");
}
