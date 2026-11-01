#!/usr/bin/env node
// Writes apps/showcase-aura-links-3d/assets/sfx/*.wav: Aura Links 3D's own golf cues (GU47 phase 9, PRD D2), synthesised
// here from a fixed seed so the output is byte-stable. Licence: CC0-1.0 (Aura3D synthesis, original to this game; replaces
// the borrowed siege-golf cues). 44.1 kHz, 16-bit mono, peak-normalised to -3 dBFS, DC-free, 5 ms fades on one-shots.
// Then admit: node apps/showcase-aura-links-3d/scripts/extract-assets.mjs reads the hashed copies in public/aura-assets.
// Usage: node apps/showcase-aura-links-3d/scripts/build-sfx.mjs
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SR = 44100;
const TAU = Math.PI * 2;

/** mulberry32: deterministic noise, so every build writes the same bytes */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const buf = (sec) => new Float64Array(Math.round(sec * SR));

/** two-pole resonant band-pass (RBJ), in place */
function bandpass(x, f0, q) {
  const w = (TAU * f0) / SR, al = Math.sin(w) / (2 * q), c = Math.cos(w);
  const b0 = al, b2 = -al, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}

function lowpass(x, fc) {
  const k = 1 - Math.exp((-TAU * fc) / SR);
  let y = 0;
  for (let i = 0; i < x.length; i++) { y += k * (x[i] - y); x[i] = y; }
  return x;
}

/** damped sine partial added into out at t0 */
function partial(out, t0, f, amp, decay, phase = 0) {
  const s = Math.round(t0 * SR);
  for (let i = s; i < out.length; i++) {
    const t = (i - s) / SR;
    out[i] += amp * Math.exp(-t / decay) * Math.sin(TAU * f * t + phase);
  }
}

/** burst of filtered noise added into out at t0 */
function noiseBurst(out, t0, len, f0, q, amp, decay, seed) {
  const r = rng(seed), n = buf(len);
  for (let i = 0; i < n.length; i++) n[i] = r() * 2 - 1;
  bandpass(n, f0, q);
  const s = Math.round(t0 * SR);
  for (let i = 0; i < n.length && s + i < out.length; i++) out[s + i] += amp * n[i] * Math.exp(-i / SR / decay);
}

function finish(x, { fade = 0.005, loop = false } = {}) {
  let mean = 0;
  for (const v of x) mean += v;
  mean /= x.length;
  for (let i = 0; i < x.length; i++) x[i] -= mean;
  if (!loop) {
    const f = Math.round(fade * SR);
    for (let i = 0; i < f; i++) { x[i] *= i / f; x[x.length - 1 - i] *= i / f; }
  }
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.708 / peak : 0;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

function wav(x) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write("WAVE", 8);
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  return b;
}

const cues = {
  /** driver on a teed ball: a hard titanium click, the ball's high ping and a short air rip */
  linksDriveStrikeSfx() {
    const x = buf(0.32);
    noiseBurst(x, 0, 0.012, 4200, 0.9, 1.0, 0.003, 11);
    partial(x, 0, 2960, 0.55, 0.035);
    partial(x, 0, 4710, 0.3, 0.02, 0.7);
    partial(x, 0.001, 1180, 0.35, 0.05);
    const air = buf(0.3);
    noiseBurst(air, 0, 0.3, 1800, 0.7, 0.22, 0.09, 12);
    for (let i = 0; i < air.length; i++) x[i] += air[i] * Math.min(1, i / (0.02 * SR));
    return finish(x);
  },
  /** ball dropping into the cup: two plastic-liner knocks, a quick rattle and the settle */
  linksCupDropSfx() {
    const x = buf(0.5);
    for (const [t, f, a] of [[0, 940, 1], [0.085, 1210, 0.7], [0.13, 1050, 0.45], [0.165, 990, 0.3], [0.19, 1100, 0.18]]) {
      partial(x, t, f, a, 0.028);
      partial(x, t, f * 2.31, a * 0.35, 0.015);
      noiseBurst(x, t, 0.006, 2600, 1.2, a * 0.5, 0.002, 20 + Math.round(t * 1000));
    }
    partial(x, 0.21, 180, 0.4, 0.06);
    return finish(x);
  },
  /** ball against the flagstick: a thin steel ping with an inharmonic ring */
  linksFlagstickRattleSfx() {
    const x = buf(0.6);
    noiseBurst(x, 0, 0.008, 5200, 1.0, 0.6, 0.002, 31);
    for (const [f, a, d] of [[612, 0.7, 0.22], [1683, 0.5, 0.14], [3120, 0.3, 0.08], [4977, 0.15, 0.05]]) partial(x, 0, f, a, d);
    partial(x, 0.055, 1683, 0.18, 0.06, 1.1);
    return finish(x);
  },
  /** birdie or par saved: a bright rising mallet third (G5 -> B5 -> D6) */
  linksBirdieChimeSfx() {
    const x = buf(1.0);
    [[0, 783.99], [0.11, 987.77], [0.22, 1174.66]].forEach(([t, f], i) => {
      partial(x, t, f, 0.8 - i * 0.1, 0.32);
      partial(x, t, f * 4, 0.12, 0.05);
      partial(x, t, f * 2, 0.18, 0.15, 0.5);
    });
    return finish(x);
  },
  /** bogey: a muted falling minor second on a soft low mallet */
  linksBogeyThudSfx() {
    const x = buf(0.7);
    partial(x, 0, 293.66, 0.9, 0.18);
    partial(x, 0, 587.32, 0.2, 0.06);
    partial(x, 0.18, 261.63, 0.9, 0.26);
    partial(x, 0.18, 523.25, 0.18, 0.07);
    noiseBurst(x, 0, 0.01, 900, 1.0, 0.25, 0.004, 41);
    noiseBurst(x, 0.18, 0.01, 800, 1.0, 0.25, 0.004, 42);
    return finish(lowpass(x, 2400));
  },
  /** menu confirm: a soft wooden tick and a short blip */
  linksMenuTickSfx() {
    const x = buf(0.16);
    noiseBurst(x, 0, 0.005, 3000, 1.5, 0.6, 0.0015, 51);
    partial(x, 0, 1568, 0.6, 0.03);
    partial(x, 0.045, 2093, 0.45, 0.028);
    return finish(x);
  },
  /** coastal wind bed: band-limited noise with slow gusts, 4 s, seamless loop (equal-power crossfade of the tail into the head) */
  linksCoastWindLoopSfx() {
    const len = 4.0, xf = 0.5;
    const r = rng(61), raw = buf(len + xf);
    for (let i = 0; i < raw.length; i++) raw[i] = r() * 2 - 1;
    const lo = lowpass(Float64Array.from(raw), 520);
    const hi = bandpass(Float64Array.from(raw), 1300, 0.6);
    for (let i = 0; i < raw.length; i++) {
      const t = i / SR;
      const gust = 0.6 + 0.25 * Math.sin((TAU * t) / len) + 0.15 * Math.sin((TAU * 3 * t) / len + 1.3);
      raw[i] = lo[i] * 1.0 * gust + hi[i] * 0.18 * gust * gust;
    }
    const n = Math.round(len * SR), f = Math.round(xf * SR), out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = raw[i];
    for (let i = 0; i < f; i++) {
      const a = Math.sin((Math.PI / 2) * (i / f));
      out[i] = raw[i] * a + raw[n + i] * Math.cos((Math.PI / 2) * (i / f));
    }
    return finish(out, { loop: true });
  }
};

const sfxDir = resolve(appDir, "assets/sfx");
const pubDir = resolve(appDir, "public/aura-assets");
mkdirSync(sfxDir, { recursive: true });
mkdirSync(pubDir, { recursive: true });
const rows = [];
for (const [key, make] of Object.entries(cues)) {
  const bytes = wav(make());
  const hash = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(resolve(sfxDir, `${key}.wav`), bytes);
  for (const f of readdirSync(pubDir)) if (f.startsWith(`${key}.`) && f.endsWith(".wav")) rmSync(resolve(pubDir, f));
  writeFileSync(resolve(pubDir, `${key}.${hash.slice(0, 8)}.wav`), bytes);
  rows.push({ key, url: `/aura-assets/${key}.${hash.slice(0, 8)}.wav`, hash: `sha256-${hash}`, seconds: +((bytes.length - 44) / 2 / SR).toFixed(3) });
}
console.log(JSON.stringify(rows, null, 1));
