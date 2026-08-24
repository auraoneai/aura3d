/**
 * Pulse Tunnel music synth — generates the four original CC0 stems entirely in-repo.
 *
 * No network downloads, no sampled material: every stem is synthesized from
 * oscillators / shaped noise with this committed generator so provenance is
 * auditable (author "Aura3D synthesis", license CC0-1.0).
 *
 * Run from this app directory:  node scripts/build-music.mjs
 * Output: assets/music/*.wav    (16-bit PCM mono 22050 Hz, exactly 90 s each)
 *
 * The arrangement is the game's difficulty contract, so it is fully deterministic:
 *   BPM 120 -> one beat every 0.5 s, four beats per bar, 45 bars = 90 s exactly.
 *   Sections (beats):  intro [0,32)   build [32,80)   drop [80,128)   finale [128,180)
 * The beat clock in src/beat-clock.ts schedules obstacles against these same numbers,
 * and tests/unit/apps/pulse-tunnel-clock.test.ts re-derives them independently.
 *
 * After generation, register each stem with the CLI from the repository root, e.g.:
 *   node packages/aura3d-cli/dist/cli.js assets add apps/showcase-pulse-tunnel/assets/music/drums.wav --name pulseDrumsStem --type audio --license CC0-1.0 --author "Aura3D synthesis" --source-page "apps/showcase-pulse-tunnel/scripts/build-music.mjs"
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/music");
const SAMPLE_RATE = 22050;
const DURATION_SECONDS = 90;
const TOTAL_FRAMES = DURATION_SECONDS * SAMPLE_RATE;
const BPM = 120;
const BEAT_SECONDS = 60 / BPM;
const BEATS_PER_BAR = 4;
const BAR_SECONDS = BEAT_SECONDS * BEATS_PER_BAR;
const TOTAL_BEATS = Math.round(DURATION_SECONDS / BEAT_SECONDS);
const TOTAL_BARS = TOTAL_BEATS / BEATS_PER_BAR;

export const PULSE_MUSIC_PLAN = {
  sampleRate: SAMPLE_RATE,
  durationSeconds: DURATION_SECONDS,
  bpm: BPM,
  beatSeconds: BEAT_SECONDS,
  beatsPerBar: BEATS_PER_BAR,
  totalBeats: TOTAL_BEATS,
  totalBars: TOTAL_BARS,
  sections: [
    { id: "intro", startBeat: 0, endBeat: 32 },
    { id: "build", startBeat: 32, endBeat: 80 },
    { id: "drop", startBeat: 80, endBeat: 128 },
    { id: "finale", startBeat: 128, endBeat: 180 }
  ]
};

// ---- shared helpers ---------------------------------------------------------

function emptyBuffer() {
  return new Float32Array(TOTAL_FRAMES);
}

function addSine(buf, startSec, durSec, freq, amp, { attack = 0.004, release = 0.05, detuneRatio = 1 } = {}) {
  const start = Math.max(0, Math.floor(startSec * SAMPLE_RATE));
  const length = Math.min(TOTAL_FRAMES - start, Math.floor(durSec * SAMPLE_RATE));
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const env = Math.min(1, t / attack) * Math.pow(Math.max(0, 1 - t / durSec), release > 0 ? (durSec / (durSec + release)) : 1);
    buf[start + i] += Math.sin(2 * Math.PI * freq * detuneRatio * t) * amp * env;
  }
}

function addNoiseBurst(buf, startSec, durSec, amp, { shape = 1.6, brightness = 0 } = {}) {
  let state = 0;
  const start = Math.max(0, Math.floor(startSec * SAMPLE_RATE));
  const length = Math.min(TOTAL_FRAMES - start, Math.floor(durSec * SAMPLE_RATE));
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const white = Math.sin(i * 12.9898 + startSec * 78.233) * 43758.5453;
    const noise = ((white - Math.floor(white)) * 2 - 1);
    // One-pole high-pass approximation: subtract the running mean to brighten hiss/crash layers.
    state = state * 0.72 + noise * 0.28;
    const value = brightness > 0 ? (noise - state) * brightness + noise * (1 - brightness) : noise;
    buf[start + i] += value * amp * Math.pow(Math.max(0, 1 - t / durSec), shape);
  }
}

function normalize(buf, peak = 0.88) {
  let max = 0;
  for (let i = 0; i < buf.length; i += 1) max = Math.max(max, Math.abs(buf[i]));
  if (max === 0) return;
  const gain = peak / max;
  for (let i = 0; i < buf.length; i += 1) buf[i] *= gain;
}

function writeWav(fileName, buf) {
  const bytesPerSample = 2;
  const dataSize = buf.length * bytesPerSample;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);       // PCM
  header.writeUInt16LE(1, 22);       // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28);
  header.writeUInt16LE(bytesPerSample, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  const data = Buffer.alloc(dataSize);
  for (let i = 0; i < buf.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, buf[i]));
    data.writeInt16LE(Math.round(clamped * 32767), i * bytesPerSample);
  }
  const outPath = resolve(OUT_DIR, fileName);
  writeFileSync(outPath, Buffer.concat([header, data]));
  console.log(`wrote ${fileName} (${(dataSize / 1024 / 1024).toFixed(2)} MiB)`);
}

// ---- musical material -------------------------------------------------------

// Chord roots per bar, cycling Am F C G across the whole run.
const CHORD_CYCLE = [
  { name: "Am", root: 110.0, tones: [220.0, 261.63, 329.63] },
  { name: "F", root: 87.31, tones: [174.61, 220.0, 261.63] },
  { name: "C", root: 130.81, tones: [261.63, 329.63, 392.0] },
  { name: "G", root: 98.0, tones: [196.0, 246.94, 293.66] }
];
const sectionOfBeat = (beat) => {
  if (beat < 32) return "intro";
  if (beat < 80) return "build";
  if (beat < 128) return "drop";
  return "finale";
};

function buildDrums() {
  const buf = emptyBuffer();
  for (let beat = 0; beat < TOTAL_BEATS; beat += 1) {
    const section = sectionOfBeat(beat);
    const t = beat * BEAT_SECONDS;
    const inBar = beat % BEATS_PER_BAR;
    // Kick anchors every beat in every section: it is the click players feel.
    addSine(buf, t, 0.16, 46, 0.95, { attack: 0.001, release: 0.02 });
    // Pitch-drop transient gives the kick its punch without any sample material.
    addSine(buf, t, 0.05, 150, 0.4, { attack: 0.001, release: 0.03 });
    if (section !== "intro" && (inBar === 1 || inBar === 3)) {
      addNoiseBurst(buf, t, 0.14, 0.5, { shape: 2.2, brightness: 0.55 });
      addSine(buf, t, 0.09, 192, 0.28, { attack: 0.001 });
    }
    if (section === "drop" || section === "finale") {
      // Sixteenth hats: closed on offbeats, accented every second eighth.
      for (let half = 0; half < 2; half += 1) {
        const hatT = t + half * BEAT_SECONDS / 2;
        if (half === 1 || section === "drop" || section === "finale") {
          addNoiseBurst(buf, hatT, 0.045, half === 1 ? 0.22 : 0.12, { shape: 3.2, brightness: 0.9 });
        }
      }
      if (section === "finale" && inBar === 3) {
        addNoiseBurst(buf, t + BEAT_SECONDS * 0.75, 0.09, 0.3, { shape: 2.4, brightness: 0.7 });
      }
    } else if (section === "build") {
      addNoiseBurst(buf, t + BEAT_SECONDS / 2, 0.04, 0.16, { shape: 3.4, brightness: 0.9 });
    }
  }
  // Riser into each section boundary plus a crash on the boundary itself.
  for (const boundary of [8, 20, 32]) {
    const riserStart = (boundary * BEATS_PER_BAR - 1) * BAR_SECONDS;
    addNoiseBurst(buf, riserStart, BAR_SECONDS * 0.92, 0.3, { shape: 0.35, brightness: 0.75 });
    addNoiseBurst(buf, boundary * BAR_SECONDS, 0.85, 0.42, { shape: 2.6, brightness: 0.65 });
    addSine(buf, boundary * BAR_SECONDS, 0.7, 220, 0.2, { attack: 0.002, release: 0.4 });
  }
  normalize(buf);
  return buf;
}

const SEMITONE = (root, semis) => root * Math.pow(2, semis / 12);

function buildBass() {
  const buf = emptyBuffer();
  const eighthPattern = [0, 0, 12, 0, 7, 0, 12, 7]; // semitone offsets over the bar's eighths
  for (let bar = 0; bar < TOTAL_BARS; bar += 1) {
    const chord = CHORD_CYCLE[bar % CHORD_CYCLE.length];
    const section = sectionOfBeat(bar * BEATS_PER_BAR);
    const barStart = bar * BAR_SECONDS;
    if (section === "intro") {
      addSine(buf, barStart, BAR_SECONDS * 0.96, chord.root, 0.3, { attack: 0.05, release: 0.9 });
      continue;
    }
    for (let step = 0; step < 8; step += 1) {
      const t = barStart + step * BAR_SECONDS / 8;
      const freq = SEMITONE(chord.root, eighthPattern[step]);
      // Stacked harmonics stand in for a saw; the falling mix keeps it rounded, not buzzy.
      addSine(buf, t, 0.2, freq, 0.5, { attack: 0.003, release: 0.14 });
      addSine(buf, t, 0.18, freq * 2, 0.16, { attack: 0.003, release: 0.2 });
      addSine(buf, t, 0.14, freq * 3, 0.07, { attack: 0.003, release: 0.24 });
    }
  }
  normalize(buf);
  return buf;
}

function buildLead() {
  const buf = emptyBuffer();
  const arpShape = [0, 1, 2, 1];
  for (let bar = 0; bar < TOTAL_BARS; bar += 1) {
    const chord = CHORD_CYCLE[bar % CHORD_CYCLE.length];
    const section = sectionOfBeat(bar * BEATS_PER_BAR);
    if (section !== "drop" && section !== "finale") continue;
    const octaveUp = section === "finale";
    for (let step = 0; step < 16; step += 1) {
      const t = bar * BAR_SECONDS + step * BAR_SECONDS / 16;
      const tone = chord.tones[arpShape[step % arpShape.length]];
      const freq = octaveUp ? tone * 2 : tone;
      addSine(buf, t, 0.13, freq, 0.26, { attack: 0.004, release: 0.3 });
      addSine(buf, t, 0.12, freq * 1.002, 0.12, { attack: 0.004, release: 0.3 }); // detune double
      if (step % 4 === 0) addSine(buf, t, 0.2, freq * 0.5, 0.08, { attack: 0.004, release: 0.5 });
    }
  }
  normalize(buf);
  return buf;
}

function buildAir() {
  const buf = emptyBuffer();
  for (let bar = 0; bar < TOTAL_BARS; bar += 1) {
    const chord = CHORD_CYCLE[bar % CHORD_CYCLE.length];
    const barStart = bar * BAR_SECONDS;
    for (const tone of chord.tones) {
      addSine(buf, barStart, BAR_SECONDS * 1.04, tone * 0.5, 0.16, { attack: 0.5, release: 1.4, detuneRatio: 0.9985 });
      addSine(buf, barStart, BAR_SECONDS * 1.04, tone * 0.5, 0.16, { attack: 0.5, release: 1.4, detuneRatio: 1.0015 });
    }
    if (sectionOfBeat(bar * BEATS_PER_BAR) === "intro") {
      // Keep the intro pad even sparser so the first unmute lands as an event.
      for (let i = Math.floor(barStart * SAMPLE_RATE); i < Math.floor((barStart + BAR_SECONDS) * SAMPLE_RATE); i += 1) buf[i] *= 0.6;
    }
  }
  // Slow breathing air bed across the whole run.
  for (let i = 0; i < TOTAL_FRAMES; i += 1) {
    const lfo = 0.5 + 0.5 * Math.sin((2 * Math.PI * 0.1 * i) / SAMPLE_RATE);
    const white = Math.sin(i * 0.618) * 43758.5453;
    const noise = ((white - Math.floor(white)) * 2 - 1);
    buf[i] += noise * 0.035 * lfo;
  }
  normalize(buf);
  return buf;
}

mkdirSync(OUT_DIR, { recursive: true });
writeWav("drums.wav", buildDrums());
writeWav("bass.wav", buildBass());
writeWav("lead.wav", buildLead());
writeWav("air.wav", buildAir());
console.log(JSON.stringify(PULSE_MUSIC_PLAN));
