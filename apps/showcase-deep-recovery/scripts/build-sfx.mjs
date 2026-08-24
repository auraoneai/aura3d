/**
 * Deep Recovery SFX synth — generates original CC0 WAV cues entirely in-repo.
 *
 * Synthesizes:
 *   - sonarPing.wav     : resonant high-pitch underwater sonar ping (1100Hz -> 880Hz decay)
 *   - sonarReturn.wav   : muffled echo return blip (550Hz filtered)
 *   - hullCreak.wav     : low-frequency structural stress groan (80Hz FM)
 *   - breachAlarm.wav   : pulsing emergency klaxon (720Hz/580Hz square)
 *   - patchSeal.wav     : pneumatic hiss + metal lock latch
 *   - grappleLatch.wav  : magnetic mechanical clamp click
 *   - crateBank.wav     : buoyant surface lock + confirmation chime
 *   - oxygenWarn.wav    : rhythmic low-O2 warning chirp
 *   - blackout.wav      : descending low-pass sub drone / power loss
 *   - surfaceBreak.wav  : splash / hull surfacing whoosh
 *   - ambientDeep.wav   : looped deep ocean low-frequency rumble
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/sfx");
const SAMPLE_RATE = 44100;

function noiseBuffer(length) {
  const out = new Float32Array(length);
  let seed = 0x9e3779b9;
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    out[i] = ((seed / 0xffffffff) * 2 - 1);
  }
  return out;
}

function writeWav(filePath, samples) {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = SAMPLE_RATE * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i += 1) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const intSample = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  writeFileSync(filePath, Buffer.from(buffer));
}

mkdirSync(OUT_DIR, { recursive: true });

// 1. sonarPing.wav (0.9s)
{
  const len = Math.floor(SAMPLE_RATE * 0.9);
  const s = new Float32Array(len);
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    const freq = 1200 * Math.exp(-t * 0.8);
    const env = Math.exp(-t * 4.5);
    s[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.75 + Math.sin(2 * Math.PI * (freq * 2) * t) * env * 0.15;
  }
  writeWav(resolve(OUT_DIR, "sonarPing.wav"), s);
}

// 2. sonarReturn.wav (0.45s)
{
  const len = Math.floor(SAMPLE_RATE * 0.45);
  const s = new Float32Array(len);
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    const freq = 650;
    const env = Math.sin(Math.min(Math.PI, (t / 0.45) * Math.PI)) * Math.exp(-t * 6);
    s[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.55;
  }
  writeWav(resolve(OUT_DIR, "sonarReturn.wav"), s);
}

// 3. hullCreak.wav (1.2s)
{
  const len = Math.floor(SAMPLE_RATE * 1.2);
  const s = new Float32Array(len);
  const noise = noiseBuffer(len);
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    const mod = Math.sin(2 * Math.PI * 8 * t);
    const carrier = Math.sin(2 * Math.PI * (75 + mod * 25) * t);
    const env = Math.sin((t / 1.2) * Math.PI) * 0.6;
    s[i] = (carrier * 0.7 + noise[i] * 0.1) * env;
  }
  writeWav(resolve(OUT_DIR, "hullCreak.wav"), s);
}

// 4. breachAlarm.wav (0.8s)
{
  const len = Math.floor(SAMPLE_RATE * 0.8);
  const s = new Float32Array(len);
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    const freq = (t % 0.4) < 0.2 ? 780 : 580;
    const env = Math.min(1, (t % 0.2) / 0.02) * (1 - (t % 0.2) / 0.25);
    s[i] = (Math.sin(2 * Math.PI * freq * t) > 0 ? 0.6 : -0.6) * env * 0.5;
  }
  writeWav(resolve(OUT_DIR, "breachAlarm.wav"), s);
}

// 5. patchSeal.wav (0.6s)
{
  const len = Math.floor(SAMPLE_RATE * 0.6);
  const s = new Float32Array(len);
  const noise = noiseBuffer(len);
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    const hiss = noise[i] * Math.exp(-t * 8) * 0.4;
    const latch = t > 0.2 ? Math.sin(2 * Math.PI * 440 * (t - 0.2)) * Math.exp(-(t - 0.2) * 20) * 0.6 : 0;
    s[i] = hiss + latch;
  }
  writeWav(resolve(OUT_DIR, "patchSeal.wav"), s);
}

// 6. grappleLatch.wav (0.35s)
{
  const len = Math.floor(SAMPLE_RATE * 0.35);
  const s = new Float32Array(len);
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    const freq = 480 * Math.exp(-t * 12);
    const env = Math.exp(-t * 15);
    s[i] = (Math.sin(2 * Math.PI * freq * t) + Math.sin(2 * Math.PI * (freq * 2.3) * t) * 0.4) * env * 0.7;
  }
  writeWav(resolve(OUT_DIR, "grappleLatch.wav"), s);
}

// 7. crateBank.wav (0.7s)
{
  const len = Math.floor(SAMPLE_RATE * 0.7);
  const s = new Float32Array(len);
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    const c1 = Math.sin(2 * Math.PI * 523.25 * t) * Math.exp(-t * 6);
    const c2 = t > 0.12 ? Math.sin(2 * Math.PI * 659.25 * (t - 0.12)) * Math.exp(-(t - 0.12) * 5) : 0;
    const c3 = t > 0.24 ? Math.sin(2 * Math.PI * 783.99 * (t - 0.24)) * Math.exp(-(t - 0.24) * 4) : 0;
    s[i] = (c1 * 0.4 + c2 * 0.4 + c3 * 0.5) * 0.7;
  }
  writeWav(resolve(OUT_DIR, "crateBank.wav"), s);
}

// 8. oxygenWarn.wav (0.5s)
{
  const len = Math.floor(SAMPLE_RATE * 0.5);
  const s = new Float32Array(len);
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    const chirp = Math.sin(2 * Math.PI * (880 + Math.sin(2 * Math.PI * 20 * t) * 100) * t);
    const env = Math.sin((t / 0.5) * Math.PI) * 0.5;
    s[i] = chirp * env;
  }
  writeWav(resolve(OUT_DIR, "oxygenWarn.wav"), s);
}

// 9. blackout.wav (1.8s)
{
  const len = Math.floor(SAMPLE_RATE * 1.8);
  const s = new Float32Array(len);
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    const freq = 120 * Math.exp(-t * 1.5);
    const env = (1 - t / 1.8);
    s[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.7;
  }
  writeWav(resolve(OUT_DIR, "blackout.wav"), s);
}

// 10. surfaceBreak.wav (1.0s)
{
  const len = Math.floor(SAMPLE_RATE * 1.0);
  const s = new Float32Array(len);
  const noise = noiseBuffer(len);
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    const splash = noise[i] * Math.sin((t / 1.0) * Math.PI) * Math.exp(-t * 2.5);
    s[i] = splash * 0.6;
  }
  writeWav(resolve(OUT_DIR, "surfaceBreak.wav"), s);
}

// 11. ambientDeep.wav (2.5s loop)
{
  const len = Math.floor(SAMPLE_RATE * 2.5);
  const s = new Float32Array(len);
  const noise = noiseBuffer(len);
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    const r1 = Math.sin(2 * Math.PI * 42 * t) * 0.3;
    const r2 = Math.sin(2 * Math.PI * 65 * t) * 0.2;
    const n = noise[i] * 0.08;
    s[i] = (r1 + r2 + n) * 0.5;
  }
  writeWav(resolve(OUT_DIR, "ambientDeep.wav"), s);
}

console.log("Deep Recovery SFX generated in", OUT_DIR);
