/**
 * Mech Hangar SFX synth — generates original CC0 WAV cues entirely in-repo.
 *
 * No network downloads, no sampled material: every cue is synthesized from
 * oscillators / noise with this committed generator so provenance is auditable
 * (author "Aura3D synthesis", license CC0-1.0).
 *
 * Run from the app directory:  node scripts/build-sfx.mjs
 * Output: assets/sfx/*.wav  (16-bit PCM mono 44100 Hz)
 *
 * After generation register each cue with the CLI (scripts/register-sfx.mjs).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/sfx");
const SAMPLE_RATE = 44100;
// ---- waveform helpers -------------------------------------------------------
function noiseBuffer(length, seed) {
  let s = (seed ?? 1) >>> 0 || 1;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    out[i] = ((s >>> 0) / 0xffffffff) * 2 - 1;
  }
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

function renderPart(out, part) {
  const { wave = "sine", freqStart, freqEnd = freqStart, amp = 0.5, attack = 0.005, decay = 3, total = 0.2 } = part;
  const length = out.length;
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
    else if (wave === "fm") v = Math.sin(phase + 2.2 * Math.sin(4 * phase));
    out[i] += v * env[i] * amp;
  }
}

function renderNoise(out, spec) {
  const { amp = 0.4, attack = 0.003, decay = 4, total = 0.15, hp = 0, lp = 0, seed = 7 } = spec;
  const raw = noiseBuffer(out.length, seed);
  const env = envelope(out.length, attack, decay, total);
  let hpPrev = 0;
  let lpPrev = 0;
  for (let i = 0; i < out.length; i += 1) {
    let v = raw[i];
    if (hp > 0) {
      hpPrev += 0.9 * (v - hpPrev);
      v = v - hpPrev;
    }
    if (lp > 0) {
      // one-pole low-pass whose cutoff sweeps down over the cue
      const cutoff = lp * Math.max(0.12, 1 - i / out.length);
      lpPrev += Math.min(0.95, cutoff) * (v - lpPrev);
      v = lpPrev;
    }
    out[i] += v * env[i] * amp;
  }
}

function renderCue(spec) {
  const tone = spec.tone;
  const noise = spec.noise;
  const tones = tone ? (Array.isArray(tone) ? tone : [tone]) : [];
  const totals = tones.map((p) => p.total ?? 0.2).concat([noise?.total ?? 0, 0.1]);
  const totalSec = Math.max(...totals) + 0.05;
  const length = Math.floor(totalSec * SAMPLE_RATE);
  const out = new Float32Array(length);
  for (const part of tones) renderPart(out, part);
  if (noise) renderNoise(out, noise);
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const norm = peak > 0 ? 0.9 / peak : 1;
  const g = spec.gain ?? 1;
  for (let i = 0; i < out.length; i += 1) out[i] *= norm * g;
  return out;
}

// ---- cue recipes ------------------------------------------------------------
/** Servo cycle — short mechanical whirr: FM sweep plus gritty noise. Slot cycles play this. */
function servoCycle() {
  return renderCue({
    tone: [
      { wave: "fm", freqStart: 620, freqEnd: 1180, amp: 0.5, attack: 0.004, decay: 5, total: 0.11 },
      { wave: "square", freqStart: 310, freqEnd: 590, amp: 0.16, attack: 0.006, decay: 6, total: 0.13 }
    ],
    noise: { amp: 0.14, attack: 0.003, decay: 7, total: 0.12, hp: 900 }
  });
}
/** Lock-in — heavy clack that settles: low thunk + metallic ping. */
function lockIn() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 150, freqEnd: 62, amp: 0.85, attack: 0.002, decay: 3.4, total: 0.22 },
      { wave: "triangle", freqStart: 1240, freqEnd: 880, amp: 0.3, attack: 0.001, decay: 7, total: 0.16 }
    ],
    noise: { amp: 0.3, attack: 0.001, decay: 6, total: 0.08, hp: 400, lp: 5200 }
  });
}
/** Walk heavy — slow stomping servo step for arena movement. */
function walkHeavy() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 96, freqEnd: 48, amp: 0.9, attack: 0.003, decay: 3, total: 0.19 },
      { wave: "triangle", freqStart: 220, freqEnd: 120, amp: 0.24, attack: 0.004, decay: 5, total: 0.15 }
    ],
    noise: { amp: 0.18, attack: 0.002, decay: 6, total: 0.12, hp: 180, lp: 2400 }
  });
}
/** Light hit — quick metallic smack. */
function lightHit() {
  return renderCue({
    tone: [
      { wave: "square", freqStart: 720, freqEnd: 260, amp: 0.55, attack: 0.001, decay: 8, total: 0.09 },
      { wave: "sine", freqStart: 340, freqEnd: 140, amp: 0.45, attack: 0.001, decay: 5, total: 0.12 }
    ],
    noise: { amp: 0.34, attack: 0.001, decay: 9, total: 0.07, hp: 1200 }
  });
}
/** Heavy hit — deep impact with metal ring-out. */
function heavyHit() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 190, freqEnd: 52, amp: 1, attack: 0.001, decay: 3.2, total: 0.3 },
      { wave: "triangle", freqStart: 980, freqEnd: 430, amp: 0.28, attack: 0.001, decay: 7, total: 0.26 },
      { wave: "square", freqStart: 480, freqEnd: 200, amp: 0.2, attack: 0.002, decay: 8, total: 0.14 }
    ],
    noise: { amp: 0.42, attack: 0.001, decay: 7, total: 0.12, hp: 300, lp: 6000 }
  });
}
/** Guard block — hard shield clang. */
function guardBlock() {
  return renderCue({
    tone: [
      { wave: "triangle", freqStart: 1560, freqEnd: 1100, amp: 0.42, attack: 0.001, decay: 8, total: 0.14 },
      { wave: "sine", freqStart: 210, freqEnd: 130, amp: 0.5, attack: 0.002, decay: 4, total: 0.14 }
    ],
    noise: { amp: 0.26, attack: 0.001, decay: 10, total: 0.06, hp: 2200 }
  });
}
/** Guard break — shattering stagger: descending crunch. */
function guardBreak() {
  return renderCue({
    tone: [
      { wave: "sawtooth", freqStart: 640, freqEnd: 90, amp: 0.6, attack: 0.002, decay: 4, total: 0.34 },
      { wave: "sine", freqStart: 160, freqEnd: 46, amp: 0.7, attack: 0.002, decay: 3, total: 0.36 }
    ],
    noise: { amp: 0.5, attack: 0.002, decay: 4, total: 0.26, hp: 350, lp: 7000 }
  });
}
/** Special fire — charge-up zap release. */
function specialFire() {
  return renderCue({
    tone: [
      { wave: "sawtooth", freqStart: 180, freqEnd: 1450, amp: 0.5, attack: 0.02, decay: 2.4, total: 0.3 },
      { wave: "fm", freqStart: 900, freqEnd: 2300, amp: 0.36, attack: 0.03, decay: 5, total: 0.24 },
      { wave: "sine", freqStart: 90, freqEnd: 60, amp: 0.5, attack: 0.01, decay: 3, total: 0.3 }
    ],
    noise: { amp: 0.22, attack: 0.02, decay: 6, total: 0.18, hp: 800 }
  });
}
/** KO sting — dramatic falling sting with sub drop. */
function koSting() {
  return renderCue({
    tone: [
      { wave: "sawtooth", freqStart: 520, freqEnd: 70, amp: 0.55, attack: 0.004, decay: 2.2, total: 0.85 },
      { wave: "sine", freqStart: 130, freqEnd: 34, amp: 0.85, attack: 0.004, decay: 2, total: 0.95 },
      { wave: "triangle", freqStart: 392, freqEnd: 196, amp: 0.3, attack: 0.02, decay: 2.6, total: 0.7 }
    ],
    noise: { amp: 0.3, attack: 0.004, decay: 3, total: 0.4, hp: 200, lp: 3600 }
  });
}
/** Ambient hangar — seamless low workshop hum loop (~3.2s), vent hiss + drone. */
function ambientHangar() {
  return renderCue({
    tone: [
      { wave: "sine", freqStart: 55, freqEnd: 55, amp: 0.4, attack: 0.4, decay: 0.35, total: 3.1 },
      { wave: "sine", freqStart: 110.3, freqEnd: 110.3, amp: 0.16, attack: 0.5, decay: 0.3, total: 3.05 },
      { wave: "triangle", freqStart: 164.8, freqEnd: 164.8, amp: 0.06, attack: 0.6, decay: 0.3, total: 3.0 }
    ],
    noise: { amp: 0.075, attack: 0.7, decay: 0.25, total: 3.1, hp: 500, seed: 99 },
    gain: 0.72
  });
}

// ---- wav encoding -----------------------------------------------------------
function encodeWav(samples) {
  const bytesPerSample = 2;
  const buffer = Buffer.alloc(44 + samples.length * bytesPerSample);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * bytesPerSample, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * bytesPerSample);
  }
  return buffer;
}

const cues = {
  mechServoCycleSfx: servoCycle,
  mechLockInSfx: lockIn,
  mechWalkHeavySfx: walkHeavy,
  mechLightHitSfx: lightHit,
  mechHeavyHitSfx: heavyHit,
  mechGuardBlockSfx: guardBlock,
  mechGuardBreakSfx: guardBreak,
  mechSpecialFireSfx: specialFire,
  mechKoStingSfx: koSting,
  mechAmbientHangarSfx: ambientHangar
};

mkdirSync(OUT_DIR, { recursive: true });
let written = 0;
for (const [name, make] of Object.entries(cues)) {
  const wav = encodeWav(make());
  const path = resolve(OUT_DIR, name + ".wav");
  writeFileSync(path, wav);
  console.log("wrote " + path + " (" + wav.length + " bytes)");
  written += 1;
}
console.log("done: " + written + " cues");
