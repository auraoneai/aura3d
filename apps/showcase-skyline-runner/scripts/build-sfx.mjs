/**
 * Skyline Runner SFX synth — generates original CC0 WAV cues entirely in-repo.
 *
 * No network downloads, no sampled material: every cue is synthesized from
 * oscillators / noise with a small committed generator so provenance is
 * auditable (author "Aura3D synthesis", license CC0-1.0).
 *
 * Generate from this app directory:  node scripts/build-sfx.mjs
 * Output: assets/sfx/*.wav  (16-bit PCM mono 44100 Hz)
 *
 * Register from the repository root so the canonical root manifest/typegen owns it, e.g.:
 *   node packages/aura3d-cli/dist/cli.js assets add apps/showcase-skyline-runner/assets/sfx/jump.wav --name skylineJumpSfx --type audio --license CC0-1.0 --author "Aura3D synthesis" --source-page "apps/showcase-skyline-runner/scripts/build-sfx.mjs"
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
function envelope(length, attack, decay, total, delay = 0) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE - delay; // elapsed seconds since part onset
    if (t < 0) continue;
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
      const { wave = "sine", freqStart, freqEnd = freqStart, amp = 0.5, attack = 0.005, decay = 3, total = 0.2, delay = 0 } = part;
      const env = envelope(length, attack, decay, total, delay);
      // Frequency phase also waits for the part's delay so staggered blips start clean.
      const phaseDelay = delay;
      for (let i = 0; i < length; i += 1) {
        const t = i / SAMPLE_RATE;
        const local = Math.max(0, t - phaseDelay);
        const progress = Math.min(1, local / total);
        const f = freqStart + (freqEnd - freqStart) * progress;
        const phase = 2 * Math.PI * f * local;
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
    // Compute the envelope once: evaluating it per sample made every noisy cue
    // quadratic and stalled the new multi-second ambience stems entirely.
    const noiseEnv = envelope(length, attack, decay, total);
    let lp = 0;
    for (let i = 0; i < length; i += 1) {
      let v = raw[i];
      if (hp > 0) {
        // one-pole high-pass
        lp += 0.9 * (v - lp);
        v = v - lp;
      }
      out[i] += v * noiseEnv[i] * amp;
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
/** Short forward wind slice for the authored dash burst. */
function dashWind() {
  return renderCue({
    tone: [
      { wave: "sawtooth", freqStart: 760, freqEnd: 210, amp: 0.2, attack: 0.002, decay: 5, total: 0.2 },
      { wave: "sine", freqStart: 310, freqEnd: 125, amp: 0.24, attack: 0.003, decay: 5, total: 0.22 }
    ]
  });
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
/** Respawn recovery — a short low-to-high three-note resolve, distinct from death. */
function respawnRecovery() {
  return renderCue({ tone: [
    { wave: "triangle", freqStart: 220, freqEnd: 330, amp: 0.32, attack: 0.006, decay: 4, total: 0.24 },
    { wave: "sine", freqStart: 440, freqEnd: 554, amp: 0.25, attack: 0.08, decay: 4, total: 0.32 },
    { wave: "sine", freqStart: 659, freqEnd: 784, amp: 0.2, attack: 0.16, decay: 4, total: 0.42 }
  ] });
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

// ---- ambience stems (SR-A6): seamless-ish loops, one per act pair ------------
/** Fade both edges so a looping source never clicks at the seam. */
function fadeEdges(samples, seconds = 0.08) {
  const n = Math.floor(seconds * SAMPLE_RATE);
  for (let i = 0; i < n && i < samples.length; i += 1) {
    const g = i / n;
    samples[i] *= g;
    samples[samples.length - 1 - i] *= g;
  }
  return samples;
}
/** Home Grove / Broken Canopy: sparse birdsong blips over a soft bed. */
function ambienceGrove() {
  const blip = (delay, freq, amp) => ({ wave: "sine", freqStart: freq, freqEnd: freq * 0.82, amp, attack: 0.012, decay: 4, total: 0.14, delay });
  const tone = [
    { wave: "triangle", freqStart: 196, freqEnd: 180, amp: 0.05, attack: 0.6, decay: 0.7, total: 3.4 },
    blip(0.20, 2093, 0.10), blip(0.38, 2349, 0.08), blip(0.52, 1976, 0.11),
    blip(1.35, 2637, 0.09), blip(1.52, 2093, 0.07),
    blip(2.30, 2489, 0.10), blip(2.44, 2637, 0.08), blip(2.61, 2217, 0.06),
    { wave: "sine", freqStart: 392, freqEnd: 330, amp: 0.05, attack: 0.9, decay: 0.8, total: 2.6, delay: 0.5 }
  ];
  return renderCue({ tone });
}
/** Sentry Pass / Cloudstep Rise: steel wind — filtered gusts over a low drone. */
function ambienceSteel() {
  const tone = [
    { wave: "triangle", freqStart: 62, freqEnd: 55, amp: 0.16, attack: 0.9, decay: 0.5, total: 3.6 },
    { wave: "sine", freqStart: 124, freqEnd: 110, amp: 0.06, attack: 1.1, decay: 0.6, total: 3.2, delay: 0.4 }
  ];
  const noise = { amp: 0.13, attack: 1.2, decay: 0.9, total: 3.4, hp: 420 };
  return renderCue({ tone, noise });
}
/** Aurora Crown: high shimmer with slow-beating partials. */
function ambienceCrown() {
  const tone = [
    { wave: "sine", freqStart: 1568, freqEnd: 1560, amp: 0.07, attack: 1.1, decay: 0.5, total: 3.6 },
    { wave: "sine", freqStart: 1976, freqEnd: 1986, amp: 0.055, attack: 1.3, decay: 0.5, total: 3.4, delay: 0.25 },
    { wave: "sine", freqStart: 2637, freqEnd: 2620, amp: 0.04, attack: 1.5, decay: 0.5, total: 3.2, delay: 0.5 },
    { wave: "triangle", freqStart: 523, freqEnd: 494, amp: 0.06, attack: 1.0, decay: 0.6, total: 3.5 }
  ];
  return renderCue({ tone, noise: { amp: 0.03, attack: 1.6, decay: 0.7, total: 3.2, hp: 1200 } });
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
  jump, landDust, dashWind, coinChime, checkpointFanfare, emberFire, emberDeny,
  sentryDefeat, sentryTelegraph, deathSting, respawnRecovery, summitTheme
};

// Ambience stems loop in the scene, so they get seam fades on top of the cue body.
const ambientCues = {
  ambienceGrove: () => fadeEdges(ambienceGrove()),
  ambienceSteel: () => fadeEdges(ambienceSteel()),
  ambienceCrown: () => fadeEdges(ambienceCrown())
};

mkdirSync(OUT_DIR, { recursive: true });
const report = {};
const onlyCue = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : undefined;
const selectedCues = onlyCue
  ? Object.entries({ ...cues, ...ambientCues }).filter(([name]) => name === onlyCue)
  : Object.entries(cues);
if (onlyCue && selectedCues.length === 0) {
  throw new Error(`Unknown Skyline cue requested with --only: ${onlyCue}`);
}
for (const [name, fn] of selectedCues) {
  const samples = fn();
  const path = resolve(OUT_DIR, `${name}.wav`);
  const duration = writeWav(path, samples);
  report[name] = `${path}` + ` (${duration.toFixed(3)}s)`;
  console.log(`wrote ${report[name]}`);
}
for (const [name, fn] of onlyCue ? [] : Object.entries(ambientCues)) {
  const samples = fn();
  const path = resolve(OUT_DIR, `${name}.wav`);
  const duration = writeWav(path, samples);
  report[name] = `${path}` + ` (${duration.toFixed(3)}s, loop)`;
  console.log(`wrote ${report[name]}`);
}
console.log("\nGenerated", Object.keys(report).length, "cues into", OUT_DIR);
