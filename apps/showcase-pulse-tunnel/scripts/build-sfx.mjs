/**
 * Pulse Tunnel SFX synth — generates the original CC0 cue WAVs entirely in-repo.
 *
 * No network downloads, no sampled material: every cue is synthesized from
 * oscillators / shaped noise with this committed generator so provenance is
 * auditable (author "Aura3D synthesis", license CC0-1.0).
 *
 * Run from this app directory:  node scripts/build-sfx.mjs
 * Output: assets/sfx/*.wav      (16-bit PCM mono 44100 Hz)
 *
 * After generation, register each cue with the CLI from the repository root, e.g.:
 *   node packages/aura3d-cli/dist/cli.js assets add apps/showcase-pulse-tunnel/assets/sfx/laneSwitch.wav --name pulseLaneSwitchSfx --type audio --license CC0-1.0 --author "Aura3D synthesis" --source-page "apps/showcase-pulse-tunnel/scripts/build-sfx.mjs"
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/sfx");
const SAMPLE_RATE = 44100;

function renderCue(totalSeconds, fill) {
  const length = Math.max(1, Math.floor(totalSeconds * SAMPLE_RATE));
  const out = new Float32Array(length);
  const ctx = {
    addTone(startSec, durSec, freqStart, freqEnd, amp, { attack = 0.004, curve = 0.7 } = {}) {
      const start = Math.floor(startSec * SAMPLE_RATE);
      const count = Math.min(length - start, Math.floor(durSec * SAMPLE_RATE));
      let phase = 0;
      for (let i = 0; i < count; i += 1) {
        const t = i / SAMPLE_RATE;
        const progress = t / durSec;
        const freq = freqStart + (freqEnd - freqStart) * Math.pow(progress, curve);
        phase += (2 * Math.PI * freq) / SAMPLE_RATE;
        const env = Math.min(1, t / attack) * Math.pow(Math.max(0, 1 - progress), 1.4);
        if (start + i < length) out[start + i] += Math.sin(phase) * amp * env;
      }
    },
    addNoise(startSec, durSec, amp, { shape = 2, brightness = 0.5 } = {}) {
      const start = Math.floor(startSec * SAMPLE_RATE);
      const count = Math.min(length - start, Math.floor(durSec * SAMPLE_RATE));
      let state = 0;
      for (let i = 0; i < count; i += 1) {
        const t = i / SAMPLE_RATE;
        const white = Math.sin((start + i) * 12.9898 + startSec * 78.233) * 43758.5453;
        const noise = ((white - Math.floor(white)) * 2 - 1);
        state = state * (1 - brightness) + noise * brightness;
        const value = noise - state; // one-pole high-pass
        out[start + i] += value * amp * Math.pow(Math.max(0, 1 - t / durSec), shape);
      }
    }
  };
  fill(ctx);
  let max = 0;
  for (let i = 0; i < out.length; i += 1) max = Math.max(max, Math.abs(out[i]));
  const gain = max > 0 ? 0.86 / max : 1;
  return { sampleRate: SAMPLE_RATE, samples: Float32Array.from(out, (v) => Math.max(-1, Math.min(1, v * gain))) };
}

function writeWav(fileName, rendered) {
  const bytesPerSample = 2;
  const dataSize = rendered.samples.length * bytesPerSample;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28);
  header.writeUInt16LE(bytesPerSample, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  const data = Buffer.alloc(dataSize);
  for (let i = 0; i < rendered.samples.length; i += 1) {
    data.writeInt16LE(Math.round(rendered.samples[i] * 32767), i * bytesPerSample);
  }
  writeFileSync(resolve(OUT_DIR, fileName), Buffer.concat([header, data]));
  console.log(`wrote ${fileName} (${dataSize} bytes)`);
}

const CUES = {
  // Quick lane-change blip: short rising square-ish fifth.
  "laneSwitch.wav": renderCue(0.14, (a) => {
    a.addTone(0, 0.09, 520, 660, 0.7, { attack: 0.002 });
    a.addTone(0.02, 0.08, 780, 990, 0.25, { attack: 0.002 });
  }),
  // Jump: bright rising chirp with a soft noise tick.
  "jump.wav": renderCue(0.24, (a) => {
    a.addTone(0, 0.2, 330, 720, 0.8, { attack: 0.003, curve: 0.55 });
    a.addNoise(0, 0.05, 0.12, { shape: 3 });
  }),
  // Slide: filtered noise sweeping down.
  "slide.wav": renderCue(0.3, (a) => {
    a.addNoise(0, 0.28, 0.65, { shape: 1.4, brightness: 0.35 });
    a.addTone(0, 0.26, 420, 140, 0.3, { attack: 0.01, curve: 0.8 });
  }),
  // Graze: sparkle double ping.
  "graze.wav": renderCue(0.18, (a) => {
    a.addTone(0, 0.09, 1320, 1320, 0.6, { attack: 0.001 });
    a.addTone(0.06, 0.1, 1760, 1760, 0.5, { attack: 0.001 });
  }),
  // Shield hit: heavy impact thud plus burst.
  "shieldHit.wav": renderCue(0.34, (a) => {
    a.addTone(0, 0.26, 180, 46, 0.95, { attack: 0.001, curve: 0.85 });
    a.addNoise(0, 0.16, 0.55, { shape: 2.4, brightness: 0.6 });
  }),
  // Shield break: glassy descending partials over a noise burst.
  "shieldBreak.wav": renderCue(0.5, (a) => {
    a.addNoise(0, 0.22, 0.6, { shape: 1.8, brightness: 0.8 });
    a.addTone(0, 0.42, 1046, 392, 0.5, { attack: 0.002, curve: 0.6 });
    a.addTone(0.04, 0.38, 1568, 523, 0.32, { attack: 0.002, curve: 0.6 });
    a.addTone(0.08, 0.34, 2093, 659, 0.2, { attack: 0.002, curve: 0.6 });
  }),
  // Section rise: swelling chord announcing a new section.
  "sectionRise.wav": renderCue(0.7, (a) => {
    a.addTone(0, 0.66, 220, 220, 0.5, { attack: 0.35 });
    a.addTone(0.05, 0.62, 277.18, 277.18, 0.42, { attack: 0.35 });
    a.addTone(0.1, 0.58, 329.63, 329.63, 0.36, { attack: 0.35 });
    a.addTone(0.15, 0.52, 440, 440, 0.22, { attack: 0.35 });
  }),
  // Run over: three-note descending motif.
  "runOver.wav": renderCue(1.2, (a) => {
    a.addTone(0, 0.3, 392, 392, 0.6, { attack: 0.01 });
    a.addTone(0.32, 0.3, 311.13, 311.13, 0.6, { attack: 0.01 });
    a.addTone(0.64, 0.5, 233.08, 220, 0.65, { attack: 0.01, curve: 0.4 });
  }),
  // UI confirm: two-tone latch.
  "uiConfirm.wav": renderCue(0.2, (a) => {
    a.addTone(0, 0.08, 660, 660, 0.6, { attack: 0.002 });
    a.addTone(0.09, 0.1, 880, 880, 0.55, { attack: 0.002 });
  })
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [fileName, rendered] of Object.entries(CUES)) writeWav(fileName, rendered);
console.log(`generated ${Object.keys(CUES).length} cues`);
