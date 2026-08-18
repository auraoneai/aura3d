#!/usr/bin/env node
/**
 * Synthesizes the Neon Corridor Strike SFX set as original CC0 recordings.
 * No downloads: every sound is generated here, so provenance is this script.
 * Output: examples/neon-corridor-strike/assets/*.wav (mono PCM16, 22050 Hz).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "assets");
mkdirSync(outDir, { recursive: true });

const RATE = 22050;

function envelope(sampleCount, attack, hold, release, shape = (t) => 1 - t) {
  return (i) => {
    const t = i / sampleCount;
    const attackT = attack / (sampleCount / RATE);
    const holdT = hold / (sampleCount / RATE);
    if (t < attackT) return t / attackT;
    if (t < attackT + holdT) return 1;
    const rel = (t - attackT - holdT) / Math.max(1e-6, 1 - attackT - holdT);
    return Math.max(0, shape(rel));
  };
}

let seed = 1337;
function noise() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return (seed / 0x7fffffff) * 2 - 1;
}

function render(duration, fn) {
  const count = Math.floor(duration * RATE);
  const data = new Int16Array(count);
  for (let i = 0; i < count; i += 1) {
    const value = Math.max(-1, Math.min(1, fn(i, i / RATE, i / count)));
    data[i] = Math.round(value * 32767);
  }
  return data;
}

function writeWav(name, samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength).copy(buffer, 44);
  const path = join(outDir, name);
  writeFileSync(path, buffer);
  console.log("wrote", path);
}

// 1. Fire: bright crack (filtered noise burst) + low thump.
writeWav("fire.wav", render(0.22, (i, t) => {
  const env = envelope(0.22 * RATE, 0.002, 0.02, 0.19)(i);
  const crack = noise() * Math.exp(-t * 34);
  const thump = Math.sin(2 * Math.PI * (72 - 40 * t) * t) * Math.exp(-t * 22) * 0.9;
  return crack * 0.85 * env + thump * env;
}));

// 2. Hit confirm: meaty mid thud.
writeWav("hit.wav", render(0.16, (i, t) => {
  const env = envelope(0.16 * RATE, 0.002, 0.015, 0.14)(i);
  const body = Math.sin(2 * Math.PI * (190 - 90 * t) * t) * Math.exp(-t * 26);
  const slap = noise() * Math.exp(-t * 55) * 0.5;
  return (body * 0.9 + slap) * env;
}));

// 3. Kill: heavy drop with a growl-ish falling tone.
writeWav("kill.wav", render(0.5, (i, t) => {
  const env = envelope(0.5 * RATE, 0.004, 0.05, 0.44)(i);
  const drop = Math.sin(2 * Math.PI * (140 - 95 * t) * t) * Math.exp(-t * 6.5);
  const rumble = noise() * Math.exp(-t * 9) * 0.35;
  return (drop * 0.85 + rumble) * env;
}));

// 4. Reload start: mag-out double click.
writeWav("reloadStart.wav", render(0.22, (i, t) => {
  const click = (at) => Math.exp(-Math.abs(t - at) * 900) * (noise() * 0.7 + 0.3 * Math.sin(2 * Math.PI * 2400 * t));
  return click(0.02) * 0.8 + click(0.13) * 0.6;
}));

// 5. Reload complete: mag seat + rack.
writeWav("reloadDone.wav", render(0.24, (i, t) => {
  const click = (at, gain) => Math.exp(-Math.abs(t - at) * 700) * (noise() * 0.8 + 0.4 * Math.sin(2 * Math.PI * 1500 * t));
  return click(0.03, 1) * 0.9 + click(0.16, 1) * 0.75;
}));

// 6. Dry fire: hollow click.
writeWav("dryFire.wav", render(0.09, (i, t) => {
  return Math.exp(-t * 70) * (noise() * 0.5 + Math.sin(2 * Math.PI * 3100 * t) * 0.35);
}));

// 7. Player hurt: low sting.
writeWav("hurt.wav", render(0.3, (i, t) => {
  const env = envelope(0.3 * RATE, 0.003, 0.03, 0.26)(i);
  const tone = Math.sin(2 * Math.PI * (110 - 35 * t) * t) + 0.4 * Math.sin(2 * Math.PI * (164 - 50 * t) * t);
  return tone * 0.5 * env + noise() * Math.exp(-t * 18) * 0.25;
}));

// 8. Pickup: two-note chime.
writeWav("pickup.wav", render(0.34, (i, t) => {
  const note = (f, at, dur) => t >= at && t < at + dur ? Math.sin(2 * Math.PI * f * (t - at)) * Math.exp(-(t - at) * 9) * 0.5 : 0;
  return note(660, 0, 0.16) + note(880, 0.12, 0.22);
}));

// 9. Alarm: corridor wakes — rising two-tone siren blip.
writeWav("alarm.wav", render(0.6, (i, t) => {
  const f = 220 + 240 * Math.min(1, t / 0.4);
  const env = envelope(0.6 * RATE, 0.01, 0.1, 0.45)(i);
  return (Math.sin(2 * Math.PI * f * t) * 0.4 + noise() * 0.08) * env;
}));

// 10. Win: cleared fanfare (three rising notes).
writeWav("win.wav", render(0.9, (i, t) => {
  const note = (f, at, dur) => t >= at ? Math.sin(2 * Math.PI * f * (t - at)) * Math.exp(-(t - at) * 4) * 0.42 * (t < at + dur ? 1 : 0.35) : 0;
  return note(392, 0, 0.24) + note(523, 0.2, 0.24) + note(659, 0.4, 0.5);
}));

// 11. Lose: falling death sting.
writeWav("lose.wav", render(0.8, (i, t) => {
  const f = 220 - 130 * Math.min(1, t / 0.7);
  const env = envelope(0.8 * RATE, 0.01, 0.08, 0.7)(i);
  return (Math.sin(2 * Math.PI * f * t) * 0.5 + Math.sin(2 * Math.PI * f * 0.5 * t) * 0.3) * env;
}));

// 12. Low ammo warn tick.
writeWav("warn.wav", render(0.12, (i, t) => {
  return Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 30) * 0.5;
}));

console.log("done");
