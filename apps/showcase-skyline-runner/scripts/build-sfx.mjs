/**
 * Skyline Runner SFX synth — generates original CC0 WAV cues entirely in-repo.
 *
 * No network downloads, no sampled material: every cue is synthesized from
 * oscillators / noise with a small committed generator so provenance is
 * auditable (author "Aura3D synthesis", license CC0-1.0).
 *
 * Run from this app directory:  node scripts/build-sfx.mjs
 * Output: assets/sfx/*.wav  (16-bit PCM mono 44100 Hz)
 *
 * After generation, register each with the CLI, e.g.:
 *   node ../../packages/aura3d-cli/dist/cli.js assets add ./assets/sfx/skylineJumpSfx.wav --name skylineJumpSfx --type audio --license CC0-1.0 --author "Aura3D synthesis" --source-page "apps/showcase-skyline-runner/scripts/build-sfx.mjs"
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/sfx");
const SAMPLE_RATE = 44100;

// ---- waveform helpers -------------------------------------------------------
function noiseBuffer(length) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = Math.random() * 2 - 1;
  return out;
}
function envelope(length, attack, decay, total) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE; // elapsed seconds
    const start = Math.min(1, t / attack);
    const end = Math.pow(Math.max(0, 1 - t / total), decay);
    out[i] = start * end;
  }
  return out;
}

/**
 * Render a cue into a normalized Float32 mono buffer, mixed with optional noise.
 * tone: {wave, freqStart, freqEnd, amp, attack, decay, total} or array for stacked partials
 * noiseCtx: {amp, attack, decay, total, hp?}
 */
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
        // one-pole high-pass
        lp += 0.9 * (v - lp);
        v = v - lp;
      }
      out[i] += v * envelope(length, attack, decay, total)[i] * amp;
    }
  }

  return out;
}

// ---- cue recipes ------------------------------------------------------------
/** Light spring "pluck" — rising sine with quick decay. */
function jump() {
  return renderCue({ tone: { wave: "triangle", freqStart: 520, freqEnd: 900, amp: 0.5, attack: 0.004, decay: 5, total: 0.16 } });
}
/** Soft dust thud on land — low sine + filtered noise. */
function landDust() {
  const noise = { amp: 0.22, attack: 0.002, decay: 4, total: 0.16, hp: 200 };
  const tone = { wave: "sine", freqStart: 160, freqEnd: 90, amp: 0.5, attack: 0.004, decay: 3, total: 0.18 };
  return renderCue({ noise, tone });
}
/** Bright ascending coin chime. */
function coinChime() {
  const tone = [
    { wave: "sine", freqStart: 880, amp: 0.4, attack: 0.002, decay: 5, total: 0.2 },
    { wave: "sine", freqStart: 1320, amp: 0.28, attack: 0.002, decay: 5, total: 0.2 },
    { wave: "sine", freqStart: 1760, amp: 0.18, attack: 0.002, decay: 6, total: 0.24 }
  ];
  return renderCue({ tone });
}
/** Relay checkpoint fanfare — two-note warm horn. */
function checkpointFanfare() {
  const tone = [
    { wave: "triangle", freqStart: 392, freqEnd: 392, amp: 0.5, attack: 0.008, decay: 4, total: 0.28 },
    { wave: "triangle", freqStart: 440, freqEnd: 440, amp: 0.5, attack: 0.25, decay: 4, total: 0.42 }
  ];
  return renderCue({ tone });
}
/** Ember fire — short hot flare pop. */
function emberFire() {
  return renderCue({ tone: [
    { wave: "sawtooth", freqStart: 700, freqEnd: 300, amp: 0.35, attack: 0.004, decay: 6, total: 0.18 },
    { wave: "sine", freqStart: 300, freqEnd: 150, amp: 0.25, attack: 0.005, decay: 6, total: 0.2 }
  ], noise: { amp: 0.15, attack: 0.002, decay: 5, total: 0.12, hp: 800 } });
}
/** Ember deny — muted fizzle (empty stock). */
function emberDeny() {
  return renderCue({ tone: { wave: "square", freqStart: 240, freqEnd: 130, amp: 0.16, attack: 0.008, decay: 5, total: 0.16 }, noise: { amp: 0.1, attack: 0.004, decay: 5, total: 0.14 } });
}
/** Sentry defeat — metallic clatter + punchy ping. */
function sentryDefeat() {
  const noise = { amp: 0.3, attack: 0.002, decay: 5, total: 0.22, hp: 400 };
  const tone = [
    { wave: "square", freqStart: 320, freqEnd: 90, amp: 0.3, attack: 0.002, decay: 6, total: 0.24 },
    { wave: "sine", freqStart: 1800, freqEnd: 1200, amp: 0.14, attack: 0.002, decay: 6, total: 0.2 }
  ];
  return renderCue({ noise, tone });
}
/** Sentry telegraph — rising servo whine. */
function sentryTelegraph() {
  return renderCue({ tone: { wave: "sawtooth", freqStart: 220, freqEnd: 520, amp: 0.16, attack: 0.1, decay: 3, total: 0.5 } });
}
/** Death sting — short downward sting. */
function deathSting() {
  return renderCue({ tone: [
    { wave: "sawtooth", freqStart: 420, freqEnd: 90, amp: 0.38, attack: 0.004, decay: 6, total: 0.42 },
    { wave: "sine", freqStart: 210, freqEnd: 60, amp: 0.3, attack: 0.004, decay: 6, total: 0.42 }
  ], noise: { amp: 0.1, attack: 0.002, decay: 5, total: 0.2 } });
}
/** Summit theme — uplifting two-chord aurora swell. */
function summitTheme() {
  const tone = [
    { wave: "triangle", freqStart: 523, freqEnd: 523, amp: 0.4, attack: 0.02, decay: 3, total: 1.1 },
    { wave: "triangle", freqStart: 659, freqEnd: 659, amp: 0.3, attack: 0.02, decay: 3, total: 1.1 },
    { wave: "sine", freqStart: 784, freqEnd: 880, amp: 0.22, attack: 0.05, decay: 3, total: 1.2 }
  ];
  return renderCue({ tone });
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
  jump, landDust, coinChime, checkpointFanfare, emberFire, emberDeny,
  sentryDefeat, sentryTelegraph, deathSting, summitTheme
};

mkdirSync(OUT_DIR, { recursive: true });
const report = {};
for (const [name, fn] of Object.entries(cues)) {
  const samples = fn();
  const path = resolve(OUT_DIR, `${name}.wav`);
  const duration = writeWav(path, samples);
  report[name] = `${path}` + ` (${duration.toFixed(3)}s)`;
  console.log(`wrote ${report[name]}`);
}
console.log("\nGenerated", Object.keys(cues).length, "cues into", OUT_DIR);
