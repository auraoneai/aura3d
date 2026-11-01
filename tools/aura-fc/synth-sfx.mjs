#!/usr/bin/env node
// Aura FC 3D: deterministic synthesis of the football SFX the game had borrowed from basketball (audit FC-16).
//   kick  boot on a leather ball: a short pitched thump (150 Hz falling to 55 Hz) under a 4 ms contact click
//   net   ball into the net: band-limited noise rustle with a soft attack and a 0.45 s tail
//   post  ball off an aluminium post: inharmonic ringing partials over a dull knock
// GU47 phase 9 (D2: no borrowed keys) adds the four cues the game still borrowed from basketball, baseball and bank shot:
//   whistle      referee pea whistle: a 2.9 kHz tone trilled by the pea (about 27 Hz) over breath noise
//   save         keeper's gloves on the ball: a padded slap (short low thump under a damped noise burst)
//   crowdBed     stadium crowd bed, 6 s seamless loop: band-limited murmur layers with slow independent swells
//   crowdSwell   goal roar: the crowd bed rising over 0.3 s with vowel-like formant bands, then easing off
// Writes 44.1 kHz 16-bit mono WAVs, named <id>.<first 8 hex of sha256>.wav, into apps/showcase-aura-fc-3d/public/aura-assets/
// and prints the manifest entries. Same input, same bytes: the PRNG is seeded and nothing reads the clock.
// Usage: node tools/aura-fc/synth-sfx.mjs [outDir]
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RATE = 44100;
const outDir = process.argv[2] ?? "apps/showcase-aura-fc-3d/public/aura-assets";

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
}

/** One-pole low-pass and high-pass, enough to shape noise. */
function onePole(cutoff) { const a = Math.exp(-2 * Math.PI * cutoff / RATE); let y = 0; return (x) => (y = (1 - a) * x + a * y); }

function kick() {
  const n = Math.round(0.22 * RATE), out = new Float32Array(n), r = rng(0xf0a7c1c), lp = onePole(2400);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const f = 55 + 95 * Math.exp(-t / 0.018);
    phase += 2 * Math.PI * f / RATE;
    const body = Math.sin(phase) * Math.exp(-t / 0.045);
    const click = lp(r()) * Math.exp(-t / 0.004);
    const leather = lp(r()) * 0.18 * Math.exp(-t / 0.03);
    out[i] = 0.9 * body + 0.55 * click + leather;
  }
  return out;
}

function net() {
  const n = Math.round(0.6 * RATE), out = new Float32Array(n), r = rng(0x7e7b3a11);
  const lpA = onePole(4200), lpB = onePole(900);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = (1 - Math.exp(-t / 0.012)) * Math.exp(-t / 0.16);
    // band-pass: low-passed noise minus its darker copy; a slow wobble reads as the mesh swinging
    const x = r(), band = lpA(x) - lpB(x);
    const wobble = 0.75 + 0.25 * Math.sin(2 * Math.PI * 11 * t);
    out[i] = band * env * wobble * 2.4;
  }
  return out;
}

function post() {
  const n = Math.round(0.9 * RATE), out = new Float32Array(n), r = rng(0x9057b011), lp = onePole(1200);
  const partials = [[612, 1, 0.32], [1489, 0.55, 0.22], [2671, 0.32, 0.14], [3922, 0.18, 0.09]];
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let ring = 0;
    for (const [f, a, tau] of partials) ring += a * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / tau);
    const knock = lp(r()) * Math.exp(-t / 0.01);
    out[i] = 0.42 * ring + 0.8 * knock;
  }
  return out;
}

function whistle() {
  const n = Math.round(0.62 * RATE), out = new Float32Array(n), r = rng(0x3415e11e), lp = onePole(6000), lpLow = onePole(2200);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.012) * Math.min(1, (0.62 - t) / 0.07);
    const trill = 0.55 + 0.45 * Math.sin(2 * Math.PI * 27 * t + 0.6 * Math.sin(2 * Math.PI * 3.1 * t));
    const f = 2900 + 70 * Math.sin(2 * Math.PI * 27 * t) + 40 * Math.min(1, t / 0.08);
    phase += 2 * Math.PI * f / RATE;
    const tone = Math.sin(phase) + 0.18 * Math.sin(2 * phase);
    const x = r(), breath = (lp(x) - lpLow(x)) * 0.35;
    out[i] = env * (tone * trill + breath);
  }
  return out;
}

function save() {
  const n = Math.round(0.36 * RATE), out = new Float32Array(n), r = rng(0x5a7e6107), lp = onePole(1800), lp2 = onePole(500);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const f = 70 + 60 * Math.exp(-t / 0.02);
    phase += 2 * Math.PI * f / RATE;
    const thump = Math.sin(phase) * Math.exp(-t / 0.05);
    const slap = lp(r()) * Math.exp(-t / 0.009);
    const leather = lp2(r()) * 0.5 * Math.exp(-t / 0.07);
    out[i] = 0.7 * thump + 1.0 * slap + leather;
  }
  return out;
}

/** Crowd murmur: several band-limited noise voices, each with a slow random swell. Returns n samples. */
function crowdLayers(n, seed, gainAt) {
  const out = new Float32Array(n), r = rng(seed);
  const bands = [[260, 520], [420, 900], [700, 1500], [1100, 2600]].map(([lo, hi]) => ({ a: onePole(hi), b: onePole(lo) }));
  // per-band swell: sum of three slow sines with seeded phases
  const swells = bands.map(() => [0.13, 0.31, 0.57].map((hz) => ({ hz: hz * (0.8 + 0.4 * Math.abs(r())), ph: Math.PI * 2 * Math.abs(r()) })));
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let s = 0;
    for (let k = 0; k < bands.length; k++) {
      const x = r(), band = bands[k].a(x) - bands[k].b(x);
      let sw = 0;
      for (const { hz, ph } of swells[k]) sw += Math.sin(2 * Math.PI * hz * t + ph);
      s += band * (0.7 + 0.1 * sw) * [1, 0.9, 0.6, 0.3][k];
    }
    out[i] = s * gainAt(t);
  }
  return out;
}

function crowdBed() {
  const len = 6, fade = 0.5;
  const n = Math.round(len * RATE), f = Math.round(fade * RATE);
  const raw = crowdLayers(n + f, 0xc40bd0ed, () => 1);
  const out = new Float32Array(n);
  // seamless loop: the tail past `len` is cross-faded into the head (equal power)
  for (let i = 0; i < n; i++) {
    if (i < f) { const a = i / f; out[i] = raw[i] * Math.sin(a * Math.PI / 2) + raw[n + i] * Math.cos(a * Math.PI / 2); }
    else out[i] = raw[i];
  }
  return out;
}

function crowdSwell() {
  const len = 1.6, n = Math.round(len * RATE);
  const out = crowdLayers(n, 0x60a1f00d, (t) => Math.min(1, t / 0.3) ** 1.5 * Math.exp(-Math.max(0, t - 0.55) / 0.6));
  // "oh!" formants (about 450 and 800 Hz) give the roar a voiced core
  const r = rng(0x0a0a0a0a), f1a = onePole(560), f1b = onePole(380), f2a = onePole(950), f2b = onePole(700);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.25) * Math.exp(-Math.max(0, t - 0.5) / 0.5);
    const x = r(), y = r();
    out[i] += env * (2.2 * (f1a(x) - f1b(x)) + 1.4 * (f2a(y) - f2b(y)));
  }
  return out;
}

function wav(samples) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0 ? 0.89 / peak : 1;   // normalise to about -1 dBFS
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * gain * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

mkdirSync(outDir, { recursive: true });
const entries = [];
for (const [id, fn] of [
  ["fcKickSfx", kick], ["fcNetSfx", net], ["fcPostSfx", post],
  ["fcWhistleSfx", whistle], ["fcSaveSfx", save], ["fcCrowdBedSfx", crowdBed], ["fcCrowdSwellSfx", crowdSwell]
]) {
  const buf = wav(fn());
  const hex = createHash("sha256").update(buf).digest("hex");
  for (const old of readdirSync(outDir)) if (old.startsWith(`${id}.`) && old.endsWith(".wav")) unlinkSync(join(outDir, old));
  const file = `${id}.${hex.slice(0, 8)}.wav`;
  writeFileSync(join(outDir, file), buf);
  entries.push({ id, url: `/aura-assets/${file}`, hash: `sha256-${hex}`, sizeBytes: buf.length });
}
console.log(JSON.stringify(entries, null, 2));
