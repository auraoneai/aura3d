// Deterministic zero-file 256x256 sRGB procedural craft albedo & micro-grain textures.
// Zero network bytes, zero clocks, zero Math.random, and zero unsafe casts.
// Luminance stays clean and neutral-bright so linear vertex colors multiply cleanly
// without muddy stains or low-frequency blotches.

import { texture, type AuraTextureRef, type AuraTextureWrapMode } from "@aura3d/engine";
import { createFbm2D, seededRandom } from "@aura3d/engine/procedural";

export type CraftTextureId =
  | "feltBoucle"
  | "woodGrainPlank"
  | "ginghamCheck"
  | "wickerWeave"
  | "storybookBrickMasonry"
  | "quiltedStitch"
  | "clockAndGaugeDial"
  | "glazedCeramicSpeckle";

const SIZE = 256;
const TAU = Math.PI * 2;

const cache = new Map<CraftTextureId, AuraTextureRef>();

function byte(v01: number): number {
  const clamped = v01 < 0 ? 0 : v01 > 1 ? 1 : v01;
  return Math.round(clamped * 255);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Torus-periodic 2D noise helper in [-1, 1] so wrap="repeat" has zero tile seams. */
function makeSeamlessNoise(seed: number, cycles: number): (u: number, v: number) => number {
  const fbmA = createFbm2D(seed, { octaves: 3, frequency: 1, gain: 0.5 });
  const fbmB = createFbm2D(seed + 409, { octaves: 3, frequency: 1, gain: 0.5 });
  return (u, v) => {
    const au = u * TAU;
    const av = v * TAU;
    const n1 = fbmA(Math.cos(au) * cycles + 3.1, Math.cos(av) * cycles + 1.7);
    const n2 = fbmB(Math.sin(au) * cycles + 5.3, Math.sin(av) * cycles + 2.9);
    return (n1 + n2) * 0.5;
  };
}

function buildRgbaTexture(
  wrap: AuraTextureWrapMode,
  pixelAt: (u: number, v: number, ix: number, iy: number) => readonly [number, number, number, number]
): AuraTextureRef {
  const data = new Uint8Array(SIZE * SIZE * 4);
  let ptr = 0;
  for (let iy = 0; iy < SIZE; iy += 1) {
    const v = (iy + 0.5) / SIZE;
    for (let ix = 0; ix < SIZE; ix += 1) {
      const u = (ix + 0.5) / SIZE;
      const rgba = pixelAt(u, v, ix, iy);
      data[ptr] = byte(rgba[0]);
      data[ptr + 1] = byte(rgba[1]);
      data[ptr + 2] = byte(rgba[2]);
      data[ptr + 3] = byte(rgba[3]);
      ptr += 4;
    }
  }
  const ref = texture.data({
    width: SIZE,
    height: SIZE,
    data,
    format: "rgba8",
    colorSpace: "srgb"
  });
  ref.wrapS = wrap;
  ref.wrapT = wrap;
  ref.generateMipmaps = true;
  ref.minFilter = "linear-mipmap-linear";
  ref.magFilter = "linear";
  ref.needsUpdate = true;
  return ref;
}

/** 1. Ultra-clean high-frequency melange wool weave (~0.968..1.000 luminance, zero blotches). */
export function feltBoucleTexture(): AuraTextureRef {
  const cached = cache.get("feltBoucle");
  if (cached) return cached;
  const micro = makeSeamlessNoise(1103, 9.0);
  const rng = seededRandom(1109);
  const grain = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < grain.length; i += 1) {
    grain[i] = (rng() - 0.5) * 0.014;
  }
  const tex = buildRgbaTexture("repeat", (u, v, ix, iy) => {
    const warp = Math.sin((u * 64 + v * 8) * TAU) * 0.5 + 0.5;
    const weft = Math.sin((v * 64 - u * 8) * TAU) * 0.5 + 0.5;
    const weave = (warp * 0.5 + weft * 0.5 - 0.5) * 0.018;
    const fuzz = micro(u, v) * 0.01 + (grain[iy * SIZE + ix] ?? 0);
    const lum = 0.984 + weave + fuzz;
    return [lum + 0.003, lum, lum - 0.002, 1];
  });
  cache.set("feltBoucle", tex);
  return tex;
}

/** 2. Fine maple/beech wood grain & subtle chamfered plank seams (0.915..1.000 luminance). */
export function woodGrainPlankTexture(): AuraTextureRef {
  const cached = cache.get("woodGrainPlank");
  if (cached) return cached;
  const ringWarp = makeSeamlessNoise(2207, 2.5);
  const fiber = makeSeamlessNoise(2239, 12.0);
  const tex = buildRgbaTexture("repeat", (u, v) => {
    const plankCount = 4;
    const pv = (v * plankCount) % 1;
    const plankIdx = Math.floor(v * plankCount);
    const seam = smoothstep(0.0, 0.028, pv) * smoothstep(0.0, 0.028, 1 - pv);
    const shift = plankIdx * 0.27;
    const warped = (v + shift) * 5.0 + ringWarp(u, v) * 0.38;
    const rings = Math.sin((warped + Math.sin(u * TAU * 1.5) * 0.14) * TAU * 2.0) * 0.5 + 0.5;
    const streak = fiber(u * 0.5, v) * 0.018;
    const base = 0.958 + (rings - 0.5) * 0.042 + streak - (1 - seam) * 0.055;
    return [base + 0.008, base, base - 0.014, 1];
  });
  cache.set("woodGrainPlank", tex);
  return tex;
}

/** 3. Crisp woven storybook gingham cloth (neutral warm-white/rose-tinted check 0.86..1.00). */
export function ginghamCheckTexture(): AuraTextureRef {
  const cached = cache.get("ginghamCheck");
  if (cached) return cached;
  const tex = buildRgbaTexture("repeat", (u, v) => {
    const cells = 8;
    const cu = (u * cells) % 1;
    const cv = (v * cells) % 1;
    const stripeU = smoothstep(0.46, 0.5, cu) - smoothstep(0.96, 1.0, cu);
    const stripeV = smoothstep(0.46, 0.5, cv) - smoothstep(0.96, 1.0, cv);
    const thread = (Math.sin(u * 96 * TAU) * Math.sin(v * 96 * TAU)) * 0.012;
    const tone = stripeU + stripeV; // 0 = white square, 1 = half-tone, 2 = cross square
    const r = 0.995 - tone * 0.028 + thread;
    const g = 0.988 - tone * 0.095 + thread;
    const b = 0.985 - tone * 0.095 + thread;
    return [r, g, b, 1];
  });
  cache.set("ginghamCheck", tex);
  return tex;
}

/** 4. Interlaced honey-rattan wicker basket weave (0.87..1.00 luminance). */
export function wickerWeaveTexture(): AuraTextureRef {
  const cached = cache.get("wickerWeave");
  if (cached) return cached;
  const micro = makeSeamlessNoise(4409, 8.0);
  const tex = buildRgbaTexture("repeat", (u, v) => {
    const repeats = 10;
    const gx = u * repeats;
    const gy = v * repeats;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const horizontalOver = (ix + iy) % 2 === 0;
    const mainProfile = horizontalOver
      ? Math.sin(fy * Math.PI) * (0.82 + 0.18 * Math.sin(fx * Math.PI))
      : Math.sin(fx * Math.PI) * (0.82 + 0.18 * Math.sin(fy * Math.PI));
    const groove = Math.min(
      smoothstep(0.0, 0.09, fx) * smoothstep(0.0, 0.09, 1 - fx),
      smoothstep(0.0, 0.09, fy) * smoothstep(0.0, 0.09, 1 - fy)
    );
    const lum = 0.89 + mainProfile * 0.095 * groove + micro(u, v) * 0.01;
    return [lum + 0.012, lum, lum - 0.022, 1];
  });
  cache.set("wickerWeave", tex);
  return tex;
}

/** 5. Warm coursed storybook limestone/brick masonry with clean cream mortar (0.89..1.00). */
export function storybookBrickMasonryTexture(): AuraTextureRef {
  const cached = cache.get("storybookBrickMasonry");
  if (cached) return cached;
  const stoneGrain = makeSeamlessNoise(5501, 7.0);
  const tex = buildRgbaTexture("repeat", (u, v) => {
    const rows = 8;
    const cols = 4;
    const ry = v * rows;
    const row = Math.floor(ry);
    const fy = ry - row;
    const stagger = (row % 2) * 0.5;
    const rx = (u * cols + stagger) % cols;
    const col = Math.floor(rx);
    const fx = rx - col;
    const mortarY = 1 - smoothstep(0.0, 0.075, fy) * smoothstep(0.0, 0.075, 1 - fy);
    const mortarX = 1 - smoothstep(0.0, 0.045, fx) * smoothstep(0.0, 0.045, 1 - fx);
    const mortar = Math.max(mortarX, mortarY);
    const blockSeed = (((row * 17 + col * 31) % 11) - 5) * 0.007;
    const brickLum = 0.938 + blockSeed + stoneGrain(u, v) * 0.016;
    const mortarLum = 0.988;
    const lum = brickLum * (1 - mortar) + mortarLum * mortar;
    return [lum + 0.006, lum, lum - 0.008 * (1 - mortar), 1];
  });
  cache.set("storybookBrickMasonry", tex);
  return tex;
}

/** 6. Plush diamond quilt stitching & soft pillowed cells (0.92..1.00 luminance). */
export function quiltedStitchTexture(): AuraTextureRef {
  const cached = cache.get("quiltedStitch");
  if (cached) return cached;
  const nap = makeSeamlessNoise(6607, 10.0);
  const tex = buildRgbaTexture("repeat", (u, v) => {
    const scale = 6;
    const d1 = Math.abs(((u + v) * scale) % 1 - 0.5) * 2;
    const d2 = Math.abs((((u - v + 2) * scale) % 1) - 0.5) * 2;
    const seamDist = Math.min(1 - d1, 1 - d2);
    const pillow = smoothstep(0.0, 0.35, seamDist);
    const dash = Math.sin((u + v) * scale * TAU * 4) > 0 ? 1 : 0.35;
    const stitchLine = (1 - smoothstep(0.0, 0.055, seamDist)) * dash * 0.05;
    const lum = 0.94 + pillow * 0.052 - stitchLine + nap(u, v) * 0.008;
    return [lum + 0.003, lum + 0.001, lum, 1];
  });
  cache.set("quiltedStitch", tex);
  return tex;
}

/** 7. Crisp 12-marker storybook clock & gauge dial face (clamped to [0..1] disc). */
export function clockAndGaugeDialTexture(): AuraTextureRef {
  const cached = cache.get("clockAndGaugeDial");
  if (cached) return cached;
  const tex = buildRgbaTexture("clamp", (u, v) => {
    const dx = (u - 0.5) * 2;
    const dy = (v - 0.5) * 2;
    const r = Math.hypot(dx, dy);
    const rim = (1 - smoothstep(0.84, 0.89, r)) * smoothstep(0.78, 0.82, r);
    let tickInk = 0;
    for (let k = 0; k < 12; k += 1) {
      const ang = (k / 12) * TAU - Math.PI * 0.5;
      const tx = Math.cos(ang) * 0.68;
      const ty = Math.sin(ang) * 0.68;
      const dotRadius = k % 3 === 0 ? 0.068 : 0.044;
      const d = Math.hypot(dx - tx, dy - ty);
      tickInk = Math.max(tickInk, 1 - smoothstep(dotRadius * 0.65, dotRadius, d));
    }
    // Minute + hour hands + center pin so flat UV discs also read immediately as a friendly clock.
    const projHour = dx * 0.62 + dy * 0.78;
    const perpHour = Math.abs(-dx * 0.78 + dy * 0.62);
    const hourHand = projHour > -0.04 && projHour < 0.42 ? 1 - smoothstep(0.032, 0.055, perpHour) : 0;
    const projMin = dx * -0.25 - dy * 0.968;
    const perpMin = Math.abs(-dx * 0.968 + dy * 0.25);
    const minHand = projMin > -0.04 && projMin < 0.58 ? 1 - smoothstep(0.024, 0.046, perpMin) : 0;
    const hub = 1 - smoothstep(0.065, 0.095, r);
    const ink = Math.min(1, Math.max(tickInk, hourHand, minHand, rim * 0.65));
    const faceR = 0.996 - ink * 0.72 + hub * 0.16;
    const faceG = 0.986 - ink * 0.74 - hub * 0.22;
    const faceB = 0.958 - ink * 0.70 - hub * 0.28;
    return [faceR, faceG, faceB, 1];
  });
  cache.set("clockAndGaugeDial", tex);
  return tex;
}

/** 8. Clean satin porcelain/stoneware micro-grain (~0.972..1.000 luminance, zero dandruff speckles). */
export function glazedCeramicSpeckleTexture(): AuraTextureRef {
  const cached = cache.get("glazedCeramicSpeckle");
  if (cached) return cached;
  const micro = makeSeamlessNoise(8803, 10.0);
  const rng = seededRandom(8821);
  const flecks = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < flecks.length; i += 1) {
    const roll = rng();
    flecks[i] = roll > 0.992 ? -0.032 : (roll - 0.5) * 0.008;
  }
  const tex = buildRgbaTexture("repeat", (u, v, ix, iy) => {
    const sheen = micro(u, v) * 0.009 + (flecks[iy * SIZE + ix] ?? 0);
    const lum = 0.986 + sheen;
    return [lum + 0.003, lum + 0.001, lum - 0.003, 1];
  });
  cache.set("glazedCeramicSpeckle", tex);
  return tex;
}

export function getCraftTexture(id: CraftTextureId): AuraTextureRef {
  switch (id) {
    case "feltBoucle":
      return feltBoucleTexture();
    case "woodGrainPlank":
      return woodGrainPlankTexture();
    case "ginghamCheck":
      return ginghamCheckTexture();
    case "wickerWeave":
      return wickerWeaveTexture();
    case "storybookBrickMasonry":
      return storybookBrickMasonryTexture();
    case "quiltedStitch":
      return quiltedStitchTexture();
    case "clockAndGaugeDial":
      return clockAndGaugeDialTexture();
    case "glazedCeramicSpeckle":
      return glazedCeramicSpeckleTexture();
  }
}
