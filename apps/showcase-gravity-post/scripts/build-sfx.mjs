/**
 * Gravity Post SFX synth — generates original CC0 WAV cues entirely in-repo.
 *
 * No network downloads, no sampled material: every cue is synthesized from
 * oscillators / noise with this committed generator so provenance stays
 * auditable (author "Aura3D synthesis", license CC0-1.0).
 *
 * Run from this app directory:  node scripts/build-sfx.mjs
 * Output: assets/sfx/*.wav  (16-bit PCM mono 44100 Hz)
 *
 * After generation, register each cue with the CLI at the repo root, e.g.:
 *   node ../../packages/aura3d-cli/dist/cli.js assets add ./assets/sfx/launchWhoosh.wav \
 *     --name gravityPostLaunchWhooshSfx --type audio --license CC0-1.0 \
 *     --author "Aura3D synthesis" --source-page "apps/showcase-gravity-post/scripts/build-sfx.mjs"
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/sfx");
const SAMPLE_RATE = 44100;
let noiseState = 0x47504f53;

function deterministicNoise() {
  noiseState ^= noiseState << 13;
  noiseState ^= noiseState >>> 17;
  noiseState ^= noiseState << 5;
  return ((noiseState >>> 0) / 0xffffffff) * 2 - 1;
}

// ---- waveform helpers -------------------------------------------------------
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
    let lp = 0;
    const env = envelope(length, attack, decay, total);
    for (let i = 0; i < length; i += 1) {
      const raw = deterministicNoise();
      let v = raw;
      if (hp > 0) {
        lp += 0.9 * (raw - lp);
        v = raw - lp;
      }
      out[i] += v * env[i] * amp;
    }
  }

  return out;
}

// ---- cue recipes ------------------------------------------------------------
/** launchWhoosh — rising airy launch burst. */
function launchWhoosh() {
  return renderCue({
    tone: { wave: "triangle", freqStart: 220, freqEnd: 760, amp: 0.4, attack: 0.01, decay: 4, total: 0.42 },
    noise: { amp: 0.26, attack: 0.02, decay: 4, total: 0.4, hp: 500 }
  });
}
/** burnLoop — short thruster chuff, retrigged while burning. */
function burnLoop() {
  return renderCue({
    tone: [
      { wave: "sawtooth", freqStart: 140, freqEnd: 96, amp: 0.2, attack: 0.01, decay: 3, total: 0.28 },
      { wave: "sine", freqStart: 70, freqEnd: 58, amp: 0.22, attack: 0.012, decay: 3, total: 0.28 }
    ],
    noise: { amp: 0.16, attack: 0.01, decay: 3, total: 0.24, hp: 300 }
  });
}
/** dockLock — confident two-tone capture clunk. */
function dockLock() {
  return renderCue({ tone: [
    { wave: "square", freqStart: 392, freqEnd: 392, amp: 0.32, attack: 0.004, decay: 5, total: 0.14 },
    { wave: "triangle", freqStart: 784, freqEnd: 784, amp: 0.26, attack: 0.09, decay: 5, total: 0.3 }
  ] });
}
/** bounceOff — rubbery rejection blat. */
function bounceOff() {
  return renderCue({ tone: [
    { wave: "sine", freqStart: 320, freqEnd: 110, amp: 0.42, attack: 0.004, decay: 6, total: 0.22 },
    { wave: "square", freqStart: 160, freqEnd: 90, amp: 0.14, attack: 0.004, decay: 6, total: 0.18 }
  ], noise: { amp: 0.08, attack: 0.002, decay: 5, total: 0.12 } });
}
/** podLost — descending loss sting. */
function podLost() {
  return renderCue({ tone: [
    { wave: "sawtooth", freqStart: 460, freqEnd: 70, amp: 0.34, attack: 0.006, decay: 6, total: 0.55 },
    { wave: "sine", freqStart: 230, freqEnd: 48, amp: 0.28, attack: 0.006, decay: 6, total: 0.55 }
  ], noise: { amp: 0.08, attack: 0.01, decay: 5, total: 0.3 } });
}
/** contractClear — delivery fanfare. */
function contractClear() {
  return renderCue({ tone: [
    { wave: "triangle", freqStart: 523, freqEnd: 523, amp: 0.34, attack: 0.008, decay: 4, total: 0.24 },
    { wave: "triangle", freqStart: 659, freqEnd: 659, amp: 0.3, attack: 0.12, decay: 4, total: 0.36 },
    { wave: "sine", freqStart: 1046, freqEnd: 1046, amp: 0.18, attack: 0.2, decay: 5, total: 0.44 }
  ] });
}
/** assistChime — sparkle for a gravity assist logged. */
function assistChime() {
  return renderCue({ tone: [
    { wave: "sine", freqStart: 1318, amp: 0.2, attack: 0.002, decay: 6, total: 0.18 },
    { wave: "sine", freqStart: 1976, amp: 0.14, attack: 0.05, decay: 6, total: 0.22 }
  ] });
}
/** warpHum — time-warp swell, retrigged only while warping. */
function warpHum() {
  return renderCue({ tone: [
    { wave: "sine", freqStart: 196, freqEnd: 208, amp: 0.2, attack: 0.09, decay: 1.4, total: 0.5 },
    { wave: "triangle", freqStart: 98, freqEnd: 104, amp: 0.16, attack: 0.11, decay: 1.4, total: 0.5 }
  ] });
}
/** uiConfirm — HUD click. */
function uiConfirm() {
  return renderCue({ tone: { wave: "square", freqStart: 660, freqEnd: 660, amp: 0.14, attack: 0.002, decay: 6, total: 0.09 } });
}
/** ambientSpace — slow deep-space pad, retrigged as a continuous bed. */
function ambientSpace() {
  return renderCue({ tone: [
    { wave: "sine", freqStart: 55, freqEnd: 55, amp: 0.16, attack: 0.9, decay: 0.8, total: 6.2 },
    { wave: "sine", freqStart: 82.4, freqEnd: 82.4, amp: 0.1, attack: 1.2, decay: 0.8, total: 6.2 },
    { wave: "triangle", freqStart: 164.8, freqEnd: 166, amp: 0.05, attack: 1.6, decay: 0.9, total: 6.2 }
  ] });
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
  return length / SAMPLE_RATE;
}

const cues = {
  launchWhoosh, burnLoop, dockLock, bounceOff, podLost,
  contractClear, assistChime, warpHum, uiConfirm, ambientSpace
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, fn] of Object.entries(cues)) {
  const duration = writeWav(resolve(OUT_DIR, name + ".wav"), fn());
  console.log("wrote assets/sfx/" + name + ".wav (" + duration.toFixed(3) + "s)");
}
console.log("\nGenerated " + Object.keys(cues).length + " cues into " + OUT_DIR);
