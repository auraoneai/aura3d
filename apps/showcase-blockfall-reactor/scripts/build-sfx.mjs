/**
 * Blockfall Reactor SFX + music synth — generates original CC0 WAV assets entirely in-repo.
 *
 * No network downloads, no sampled material: every cue and music stem is synthesized
 * from oscillators / noise with this committed generator so provenance is auditable
 * (author "Aura3D synthesis", license CC0-1.0). Deterministic recipes, 16-bit PCM mono 44.1 kHz.
 *
 * Run from the repo root:
 *   node apps/showcase-blockfall-reactor/scripts/build-sfx.mjs
 *
 * Outputs:
 *   assets/sfx/*.wav    nine one-shot gameplay cues (BF-A1)
 *   assets/music/*.wav  looping ambient reactor hum + four additive intensity stems
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SFX_DIR = resolve(HERE, "../assets/sfx");
const MUSIC_DIR = resolve(HERE, "../assets/music");
const SAMPLE_RATE = 44100;

// ---- waveform & DSP helpers -------------------------------------------------
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

function noiseBuffer(length) {
  let seed = 0x5EEDB10C;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    out[i] = (seed / 0x100000000) * 2 - 1;
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

/**
 * Render a one-shot cue into a normalized Float32 mono buffer.
 */
function renderCue({ tone, noise }) {
  const tones = tone ? (Array.isArray(tone) ? tone : [tone]) : [];
  const totals = [
    ...tones.map((part) => (part.delay ?? 0) + part.total),
    ...(noise ? [(noise.delay ?? 0) + noise.total] : []),
    0.1
  ];
  const totalSec = Math.max(...totals) + 0.05;
  const length = Math.floor(totalSec * SAMPLE_RATE);
  const out = new Float32Array(length);

  for (const part of tones) {
    const {
      wave = "sine", freqStart, freqEnd = freqStart, amp = 0.5,
      attack = 0.005, decay = 3, total = 0.2, delay = 0
    } = part;
    const env = envelope(length, attack, decay, total);
    const offset = Math.floor(delay * SAMPLE_RATE);
    for (let i = offset; i < length; i += 1) {
      const t = (i - offset) / SAMPLE_RATE;
      const progress = Math.min(1, t / total);
      const f = freqStart + (freqEnd - freqStart) * progress;
      const phase = 2 * Math.PI * f * t;
      let v = 0;
      if (wave === "sine") v = Math.sin(phase);
      else if (wave === "triangle") v = 2 / Math.PI * Math.asin(Math.sin(phase));
      else if (wave === "sawtooth") v = 2 * (phase / (2 * Math.PI) - Math.floor(0.5 + phase / (2 * Math.PI)));
      else if (wave === "square") v = Math.sign(Math.sin(phase));
      else v = Math.sin(phase);
      out[i] += v * env[i - offset] * amp;
    }
  }

  if (noise) {
    const { amp = 0.4, attack = 0.003, decay = 4, total = 0.15, hp = 0, lp = 0, delay = 0 } = noise;
    let raw = noiseBuffer(length);
    if (hp > 0) raw = highpass(raw, hp);
    if (lp > 0) raw = lowpass(raw, lp);
    const env = envelope(length, attack, decay, total);
    const offset = Math.floor(delay * SAMPLE_RATE);
    for (let i = offset; i < length; i += 1) {
      out[i] += raw[i - offset] * env[i - offset] * amp;
    }
  }

  let peak = 0;
  for (let i = 0; i < length; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const gain = Math.min(1, 0.9 / peak);
    for (let i = 0; i < length; i += 1) out[i] *= gain;
  }

  return out;
}

/**
 * Render a seamless loop without clicks or harsh discontinuities.
 */
function renderLoop({ seconds, parts }) {
  const length = Math.round(seconds * SAMPLE_RATE);
  const out = new Float32Array(length);

  for (const part of parts) {
    const {
      wave = "sine", freq, amp = 0.3, tremoloHz = 0, tremoloDepth = 0,
      pulses
    } = part;

    for (let i = 0; i < length; i += 1) {
      const t = i / SAMPLE_RATE;
      let sample = 0;

      if (freq > 0 && amp > 0) {
        const phase = 2 * Math.PI * freq * t;
        let v = 0;
        if (wave === "sine") v = Math.sin(phase);
        else if (wave === "triangle") v = 2 / Math.PI * Math.asin(Math.sin(phase));
        else if (wave === "sawtooth") v = 2 * (phase / (2 * Math.PI) - Math.floor(0.5 + phase / (2 * Math.PI)));
        else if (wave === "square") v = Math.sign(Math.sin(phase));
        let tremolo = 1;
        if (tremoloHz > 0) {
          tremolo = 1 - tremoloDepth / 2 + (tremoloDepth / 2) * Math.sin(2 * Math.PI * tremoloHz * t);
        }
        sample += v * amp * tremolo;
      }

      if (pulses) {
        for (const p of pulses) {
          const { rateHz, offsetSec = 0, durSec = 0.1, toneFreq = 220, toneEndFreq = toneFreq, toneAmp = 0.3, isNoise = false, noiseHp = 0 } = p;
          const period = 1 / rateHz;
          const localT = (t - offsetSec + period * 100) % period;
          if (localT < durSec) {
            const u = localT / durSec;
            // Smooth attack + decay envelope
            const env = Math.sin(Math.PI * Math.min(1, u / 0.1)) * Math.pow(Math.max(0, 1 - u), 2.5);
            if (isNoise) {
              const n = (Math.sin((i + offsetSec * 44100) * 12.9898) * 43758.5453) % 1;
              sample += (n * 2 - 1) * toneAmp * env;
            } else {
              const f = toneFreq + (toneEndFreq - toneFreq) * u;
              sample += Math.sin(2 * Math.PI * f * localT) * toneAmp * env;
            }
          }
        }
      }

      out[i] += sample;
    }
  }

  // Crossfade edges so it's guaranteed 100% click-free
  const fade = Math.floor(0.015 * SAMPLE_RATE);
  for (let i = 0; i < fade; i += 1) {
    const k = i / fade;
    out[i] *= k;
    out[length - 1 - i] *= k;
  }

  let peak = 0;
  for (let i = 0; i < length; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const gain = Math.min(1, 0.88 / peak);
    for (let i = 0; i < length; i += 1) out[i] *= gain;
  }

  return out;
}

// ---- one-shot cue recipes (the nine BF-A1 cues) -----------------------------

/** Move tick — soft, organic, velvet tactile tap (no harsh beep). */
function move() {
  const length = Math.floor(0.04 * SAMPLE_RATE);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 120);
    const wave = Math.sin(2 * Math.PI * 420 * t) * 0.6 + Math.sin(2 * Math.PI * 840 * t) * 0.2;
    out[i] = wave * env * 0.22;
  }
  return lowpass(out, 1200);
}

/** Rotate chirp — silky smooth fluid whoosh with warm chime. */
function rotate() {
  const length = Math.floor(0.07 * SAMPLE_RATE);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.sin(Math.PI * (i / length)) * Math.exp(-t * 35);
    const f = 520 + 260 * (t / 0.07);
    const wave = Math.sin(2 * Math.PI * f * t) * 0.5 + Math.sin(2 * Math.PI * (f * 1.5) * t) * 0.2;
    out[i] = wave * env * 0.24;
  }
  return lowpass(out, 1800);
}

/** Lock thud — warm, rounded, satisfying acoustic block landing. */
function lockThud() {
  const length = Math.floor(0.12 * SAMPLE_RATE);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 40);
    const f = 110 * Math.exp(-t * 25) + 45;
    const body = Math.sin(2 * Math.PI * f * t) * 0.7;
    const click = Math.sin(2 * Math.PI * 320 * t) * Math.exp(-t * 160) * 0.3;
    out[i] = (body + click) * env * 0.35;
  }
  return lowpass(out, 500);
}

/** Line clear — sparkling, warm crystal chime cascade in D major. */
function lineClear() {
  const length = Math.floor(0.45 * SAMPLE_RATE);
  const out = new Float32Array(length);
  const freqs = [587.33, 739.99, 880.00, 1174.66]; // D5, F#5, A5, D6
  for (let n = 0; n < freqs.length; n++) {
    const delay = n * 0.045;
    const offset = Math.floor(delay * SAMPLE_RATE);
    const f = freqs[n];
    for (let i = offset; i < length; i++) {
      const t = (i - offset) / SAMPLE_RATE;
      const env = Math.exp(-t * 9);
      const tone = Math.sin(2 * Math.PI * f * t) * 0.4 + Math.sin(2 * Math.PI * (f * 2) * t) * 0.15;
      out[i] += tone * env * 0.25;
    }
  }
  return lowpass(out, 2800);
}

/** Quad fanfare — rich, triumphant, warm harmonic bloom for a Tetris clear. */
function quadFanfare() {
  const length = Math.floor(0.85 * SAMPLE_RATE);
  const out = new Float32Array(length);
  const notes = [293.66, 440.00, 587.33, 739.99, 880.00, 1174.66]; // D4..D6
  for (let n = 0; n < notes.length; n++) {
    const delay = n * 0.055;
    const offset = Math.floor(delay * SAMPLE_RATE);
    const f = notes[n];
    for (let i = offset; i < length; i++) {
      const t = (i - offset) / SAMPLE_RATE;
      const env = Math.exp(-t * 5.5);
      const tone = Math.sin(2 * Math.PI * f * t) * 0.35 + Math.sin(2 * Math.PI * (f * 1.5) * t) * 0.12;
      out[i] += tone * env * 0.22;
    }
  }
  return lowpass(out, 3200);
}

/** Level up — radiant, ascending melodic shimmer. */
function levelUp() {
  const length = Math.floor(0.75 * SAMPLE_RATE);
  const out = new Float32Array(length);
  const notes = [369.99, 440.00, 554.37, 659.25, 739.99, 880.00, 1108.73];
  for (let n = 0; n < notes.length; n++) {
    const delay = n * 0.06;
    const offset = Math.floor(delay * SAMPLE_RATE);
    const f = notes[n];
    for (let i = offset; i < length; i++) {
      const t = (i - offset) / SAMPLE_RATE;
      const env = Math.exp(-t * 6.5);
      const tone = Math.sin(2 * Math.PI * f * t) * 0.35 + Math.sin(2 * Math.PI * (f * 2) * t) * 0.1;
      out[i] += tone * env * 0.22;
    }
  }
  return lowpass(out, 3000);
}

/** Hold swap — gentle tactile mechanical latch click. */
function holdSwap() {
  const length = Math.floor(0.06 * SAMPLE_RATE);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const env1 = Math.exp(-t * 110);
    const c1 = Math.sin(2 * Math.PI * 480 * t) * env1 * 0.2;
    const t2 = t - 0.018;
    let c2 = 0;
    if (t2 > 0) c2 = Math.sin(2 * Math.PI * 680 * t2) * Math.exp(-t2 * 110) * 0.22;
    out[i] = (c1 + c2) * 0.5;
  }
  return lowpass(out, 1500);
}

/** Hard-drop slam — resonant, satisfying low-frequency impact. */
function hardDropSlam() {
  const length = Math.floor(0.22 * SAMPLE_RATE);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 18);
    const f = 90 * Math.exp(-t * 30) + 38;
    const sub = Math.sin(2 * Math.PI * f * t) * 0.65;
    const mid = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 60) * 0.25;
    out[i] = (sub + mid) * env * 0.45;
  }
  return lowpass(out, 400);
}

/** Game-over sting — gentle, soft descending minor chord cadence. */
function gameOverSting() {
  const length = Math.floor(0.95 * SAMPLE_RATE);
  const out = new Float32Array(length);
  const notes = [440.00, 369.99, 329.63, 293.66];
  for (let n = 0; n < notes.length; n++) {
    const delay = n * 0.18;
    const offset = Math.floor(delay * SAMPLE_RATE);
    const f = notes[n];
    for (let i = offset; i < length; i++) {
      const t = (i - offset) / SAMPLE_RATE;
      const env = Math.exp(-t * 4.2);
      const tone = Math.sin(2 * Math.PI * f * t) * 0.35 + Math.sin(2 * Math.PI * (f * 1.5) * t) * 0.1;
      out[i] += tone * env * 0.22;
    }
  }
  return lowpass(out, 1800);
}

// ---- loop recipes: 16.0-second seamless ambient progression ----------------
const LOOP_SECONDS = 16.0;

/**
 * Ambient reactor bed — lush, warm, tranquil sci-fi atmospheric chord progression (16 seconds).
 * Evolving gently: Dm9 -> Fmaj7 -> Bbmaj7 -> C(add9).
 * Zero buzz, zero repetitive thuds, pure warm ambient solace.
 */
function reactorHumLoop() {
  const length = Math.floor(LOOP_SECONDS * SAMPLE_RATE);
  const out = new Float32Array(length);
  // 4 chords across 16 seconds (4 seconds per chord)
  const chords = [
    [146.83, 220.00, 261.63, 329.63], // Dm9 (D3, A3, C4, E4)
    [174.61, 220.00, 261.63, 329.63], // Fmaj7 (F3, A3, C4, E4)
    [116.54, 174.61, 233.08, 293.66], // Bbmaj7 (Bb2, F3, Bb3, D4)
    [130.81, 196.00, 261.63, 293.66]  // Cadd9 (C3, G3, C4, D4)
  ];

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const chordIndex = Math.floor((t / LOOP_SECONDS) * chords.length) % chords.length;
    const chordProgress = (t % (LOOP_SECONDS / chords.length)) / (LOOP_SECONDS / chords.length);
    // Smooth crossfade envelope per chord
    const chordEnv = Math.sin(Math.PI * chordProgress);
    const activeChord = chords[chordIndex];

    let sample = 0;
    for (const freq of activeChord) {
      const phase = 2 * Math.PI * freq * t;
      const wave = Math.sin(phase) + 0.25 * Math.sin(phase * 2);
      sample += wave * 0.04;
    }
    // Very gentle slow breathing LFO (0.125 Hz = 8s period)
    const breath = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.125 * t);
    out[i] = sample * chordEnv * breath * 0.18;
  }

  // Crossfade loop boundaries for seamless continuity
  const fade = Math.floor(0.08 * SAMPLE_RATE);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[i] = out[i] * k + out[length - fade + i] * (1 - k);
  }
  return lowpass(out, 380);
}

/** Stem 1 (levels 1-5) — deep, warm, tranquil bassline moving slowly with chords (NO repetitive kick!). */
function musicStem1() {
  const length = Math.floor(LOOP_SECONDS * SAMPLE_RATE);
  const out = new Float32Array(length);
  const bassNotes = [73.42, 87.31, 58.27, 65.41]; // D2, F2, Bb1, C2

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const noteIndex = Math.floor((t / LOOP_SECONDS) * bassNotes.length) % bassNotes.length;
    const noteT = t % (LOOP_SECONDS / bassNotes.length);
    const env = Math.sin(Math.PI * (noteT / (LOOP_SECONDS / bassNotes.length)));
    const f = bassNotes[noteIndex];
    const wave = Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * (f * 2) * t);
    out[i] = wave * env * 0.14;
  }

  const fade = Math.floor(0.08 * SAMPLE_RATE);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[i] = out[i] * k + out[length - fade + i] * (1 - k);
  }
  return lowpass(out, 220);
}

/** Stem 2 (levels 6-10) — soft, delicate ambient rhodes chime arpeggios (16s cycle). */
function musicStem2() {
  const length = Math.floor(LOOP_SECONDS * SAMPLE_RATE);
  const out = new Float32Array(length);
  const notes = [
    440.00, 523.25, 659.25, 587.33,
    523.25, 659.25, 783.99, 659.25,
    466.16, 587.33, 698.46, 587.33,
    523.25, 587.33, 783.99, 659.25
  ];

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const step = Math.floor((t / LOOP_SECONDS) * notes.length) % notes.length;
    const stepT = t % (LOOP_SECONDS / notes.length);
    const env = Math.exp(-stepT * 4.5);
    const f = notes[step];
    const wave = Math.sin(2 * Math.PI * f * t) * 0.4 + Math.sin(2 * Math.PI * (f * 2) * t) * 0.1;
    out[i] = wave * env * 0.12;
  }

  const fade = Math.floor(0.08 * SAMPLE_RATE);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[i] = out[i] * k + out[length - fade + i] * (1 - k);
  }
  return lowpass(out, 1600);
}

/** Stem 3 (levels 11-15) — mellow, warm atmospheric bell melody. */
function musicStem3() {
  const length = Math.floor(LOOP_SECONDS * SAMPLE_RATE);
  const out = new Float32Array(length);
  const melody = [587.33, 0, 659.25, 739.99, 0, 880.00, 739.99, 0];

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const step = Math.floor((t / LOOP_SECONDS) * melody.length) % melody.length;
    const f = melody[step];
    if (f > 0) {
      const stepT = t % (LOOP_SECONDS / melody.length);
      const env = Math.exp(-stepT * 3.2);
      const wave = Math.sin(2 * Math.PI * f * t) * 0.35 + Math.sin(2 * Math.PI * (f * 1.5) * t) * 0.1;
      out[i] = wave * env * 0.11;
    }
  }

  const fade = Math.floor(0.08 * SAMPLE_RATE);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[i] = out[i] * k + out[length - fade + i] * (1 - k);
  }
  return lowpass(out, 2000);
}

/** Stem 4 (levels 16+) — celestial shimmer harmonic air. */
function musicStem4() {
  const length = Math.floor(LOOP_SECONDS * SAMPLE_RATE);
  const out = new Float32Array(length);
  const pads = [880.00, 1046.50, 1174.66, 1318.51];

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const lfo = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.25 * t);
    let sample = 0;
    for (const f of pads) {
      sample += Math.sin(2 * Math.PI * f * t) * 0.02;
    }
    out[i] = sample * lfo * 0.08;
  }

  const fade = Math.floor(0.08 * SAMPLE_RATE);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[i] = out[i] * k + out[length - fade + i] * (1 - k);
  }
  return lowpass(out, 2400);
}

// ---- WAV writer -------------------------------------------------------------
function writeWav(path, samples) {
  const length = samples.length;
  const buffer = Buffer.alloc(44 + length * 2);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (SAMPLE_RATE * numChannels * bitsPerSample) / 8;
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + length * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE((numChannels * bitsPerSample) / 8, 32);
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

mkdirSync(SFX_DIR, { recursive: true });
mkdirSync(MUSIC_DIR, { recursive: true });

const cues = {
  move, rotate, lockThud, lineClear, quadFanfare,
  levelUp, holdSwap, hardDropSlam, gameOverSting
};
const loops = {
  reactorHumLoop, musicStem1, musicStem2, musicStem3, musicStem4
};

const report = {};
for (const [name, fn] of Object.entries(cues)) {
  const path = resolve(SFX_DIR, name + ".wav");
  const duration = writeWav(path, fn());
  report[name] = path;
  console.log("wrote " + path + " (" + duration.toFixed(3) + "s)");
}
for (const [name, fn] of Object.entries(loops)) {
  const path = resolve(MUSIC_DIR, name + ".wav");
  const duration = writeWav(path, fn());
  report[name] = path;
  console.log("wrote " + path + " (" + duration.toFixed(3) + "s loop)");
}
console.log("");
console.log("Generated " + Object.keys(cues).length + " cues and " + Object.keys(loops).length + " loops into " + SFX_DIR + " and " + MUSIC_DIR);

