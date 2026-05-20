export interface SpaceEnvironmentStar {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly size: number;
  readonly speed: number;
  readonly brightness: number;
}

export interface SpaceEnvironmentNebula {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: readonly [number, number, number];
  readonly alpha: number;
  readonly drift: number;
}

export interface SpaceEnvironmentDustParticle {
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly size: number;
  readonly alpha: number;
}

export interface SpaceEnvironmentFixture {
  readonly id: "v4-old-branch-space-environment";
  readonly source: "origin-master-space-environment-adapted";
  readonly sourceFiles: readonly string[];
  readonly width: number;
  readonly height: number;
  readonly elapsedSeconds: number;
  readonly layerScroll: {
    readonly distantStars: number;
    readonly foregroundStars: number;
  };
  readonly stars: readonly SpaceEnvironmentStar[];
  readonly nebulae: readonly SpaceEnvironmentNebula[];
  readonly dust: readonly SpaceEnvironmentDustParticle[];
  readonly starCount: number;
  readonly nebulaCount: number;
  readonly dustCount: number;
  readonly visibleStarCount: number;
  readonly averageStarBrightness: number;
  readonly nebulaCoverage: number;
  readonly dustAlpha: number;
  readonly blockedClaims: readonly string[];
  readonly claimBoundary: string;
  readonly hash: string;
}

const sourceFiles = [
  "origin/master:examples/space-shooter/src/SpaceEnvironment.ts",
  "origin/master:src/assets/ProceduralTextures.ts"
] as const;

const blockedClaims = [
  "3D volumetric nebula rendering",
  "HDR skybox environment lighting",
  "production space-scene asset pack",
  "Unity VFX Graph background parity",
  "Unreal Niagara background parity"
] as const;

const nebulaPalette = [
  [0.42, 0.18, 0.76],
  [0.12, 0.42, 0.88],
  [0.78, 0.18, 0.48],
  [0.1, 0.68, 0.72],
  [0.86, 0.46, 0.72]
] as const;

export function sampleSpaceEnvironmentFixture(options: {
  readonly width?: number;
  readonly height?: number;
  readonly elapsedSeconds?: number;
  readonly seed?: number;
  readonly starCount?: number;
  readonly nebulaCount?: number;
  readonly dustCount?: number;
} = {}): SpaceEnvironmentFixture {
  const width = positiveInteger(options.width ?? 960, "width");
  const height = positiveInteger(options.height ?? 540, "height");
  const elapsedSeconds = finiteNonNegative(options.elapsedSeconds ?? 0, "elapsedSeconds");
  const seed = positiveInteger(options.seed ?? 0x51ace, "seed");
  const starCount = positiveInteger(options.starCount ?? 72, "starCount");
  const nebulaCount = positiveInteger(options.nebulaCount ?? 5, "nebulaCount");
  const dustCount = positiveInteger(options.dustCount ?? 96, "dustCount");
  const stars = Array.from({ length: starCount }, (_, index) => sampleStar(seed, index, width, height, elapsedSeconds));
  const nebulae = Array.from({ length: nebulaCount }, (_, index) => sampleNebula(seed, index, width, height, elapsedSeconds));
  const dust = Array.from({ length: dustCount }, (_, index) => sampleDust(seed, index, width, height, elapsedSeconds));
  const visibleStarCount = stars.filter((star) => star.x >= 0 && star.x <= width && star.y >= 0 && star.y <= height).length;
  const averageStarBrightness = stars.reduce((sum, star) => sum + star.brightness, 0) / stars.length;
  const nebulaCoverage = nebulae.reduce((sum, nebula) => sum + Math.PI * nebula.radius * nebula.radius, 0) / (width * height);
  const dustAlpha = dust.reduce((sum, particle) => sum + particle.alpha, 0) / dust.length;
  const fixtureWithoutHash = {
    id: "v4-old-branch-space-environment" as const,
    source: "origin-master-space-environment-adapted" as const,
    sourceFiles,
    width,
    height,
    elapsedSeconds: Number(elapsedSeconds.toFixed(4)),
    layerScroll: {
      distantStars: Number(((elapsedSeconds * 10) % height).toFixed(3)),
      foregroundStars: Number(((elapsedSeconds * 25) % height).toFixed(3))
    },
    stars,
    nebulae,
    dust,
    starCount,
    nebulaCount,
    dustCount,
    visibleStarCount,
    averageStarBrightness: Number(averageStarBrightness.toFixed(4)),
    nebulaCoverage: Number(nebulaCoverage.toFixed(4)),
    dustAlpha: Number(dustAlpha.toFixed(4)),
    blockedClaims,
    claimBoundary: "This fixture adapts old scrolling starfield, nebula, and dust concepts into deterministic 2D/background evidence. It does not claim volumetric space rendering, HDR skybox lighting, or Unity/Unreal VFX parity."
  };
  return {
    ...fixtureWithoutHash,
    hash: stableHash(JSON.stringify(fixtureWithoutHash))
  };
}

function sampleStar(seed: number, index: number, width: number, height: number, elapsedSeconds: number): SpaceEnvironmentStar {
  const depth = hash01(seed, index, 11);
  const speed = 20 + hash01(seed, index, 23) * 80;
  const rawY = hash01(seed, index, 37) * height + elapsedSeconds * speed;
  const twinkle = 0.8 + Math.sin(elapsedSeconds * speed * 0.08 + hash01(seed, index, 41) * Math.PI * 2) * 0.2;
  return {
    x: Number((hash01(seed, index, 17) * width).toFixed(3)),
    y: Number((rawY % height).toFixed(3)),
    depth: Number(depth.toFixed(4)),
    size: Number((0.8 + depth * 2.2).toFixed(3)),
    speed: Number(speed.toFixed(3)),
    brightness: Number(((0.52 + depth * 0.48) * twinkle).toFixed(4))
  };
}

function sampleNebula(seed: number, index: number, width: number, height: number, elapsedSeconds: number): SpaceEnvironmentNebula {
  const radius = width * (0.12 + hash01(seed, index, 53) * 0.18);
  const drift = (hash01(seed, index, 67) - 0.5) * 10;
  const rawY = hash01(seed, index, 79) * height + elapsedSeconds * drift;
  const palette = nebulaPalette[index % nebulaPalette.length] ?? nebulaPalette[0];
  return {
    x: Number((hash01(seed, index, 83) * width).toFixed(3)),
    y: Number((((rawY % height) + height) % height).toFixed(3)),
    radius: Number(radius.toFixed(3)),
    color: palette,
    alpha: Number((0.18 + hash01(seed, index, 97) * 0.22).toFixed(4)),
    drift: Number(drift.toFixed(3))
  };
}

function sampleDust(seed: number, index: number, width: number, height: number, elapsedSeconds: number): SpaceEnvironmentDustParticle {
  const velocityX = (hash01(seed, index, 109) - 0.5) * 20;
  const velocityY = 30 + hash01(seed, index, 127) * 50;
  const rawX = hash01(seed, index, 131) * width + elapsedSeconds * velocityX;
  const rawY = hash01(seed, index, 149) * height + elapsedSeconds * velocityY;
  return {
    x: Number((((rawX % width) + width) % width).toFixed(3)),
    y: Number((rawY % height).toFixed(3)),
    velocityX: Number(velocityX.toFixed(3)),
    velocityY: Number(velocityY.toFixed(3)),
    size: Number((0.4 + hash01(seed, index, 157) * 1.3).toFixed(3)),
    alpha: Number((0.28 + hash01(seed, index, 163) * 0.38).toFixed(4))
  };
}

function hash01(seed: number, index: number, salt: number): number {
  let hash = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0xffffffff;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`Space environment ${name} must be a positive integer.`);
  return value;
}

function finiteNonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Space environment ${name} must be finite and non-negative.`);
  return value;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
