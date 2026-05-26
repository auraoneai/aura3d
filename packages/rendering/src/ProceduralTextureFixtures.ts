import { Texture, type TextureColorSpace } from "./Texture";

export type ProceduralTextureFixtureKind =
  | "metallic-paint"
  | "metallic-roughness-map"
  | "racing-stripes"
  | "racing-number-decal"
  | "carbon-fiber"
  | "tire-tread"
  | "concrete-asphalt"
  | "sci-fi-panel"
  | "wood-plank"
  | "marble"
  | "starfield-nebula"
  | "normal-from-height";

export interface ProceduralTextureFixtureOptions {
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
  readonly label?: string;
}

export interface ProceduralTextureFixture {
  readonly id: ProceduralTextureFixtureKind;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly semantic: "albedo" | "normal" | "metallic-roughness" | "emissive-background";
  readonly colorSpace: TextureColorSpace;
  readonly data: Uint8Array;
  readonly hash: string;
  readonly knownLimits: readonly string[];
}

const DEFAULT_SIZE = 96;
const DEFAULT_SEEDS: Readonly<Record<ProceduralTextureFixtureKind, number>> = {
  "metallic-paint": 0x8a41_1201,
  "metallic-roughness-map": 0x8a41_1211,
  "racing-stripes": 0x8a41_1210,
  "racing-number-decal": 0x8a41_1212,
  "carbon-fiber": 0x8a41_1202,
  "tire-tread": 0x8a41_1203,
  "concrete-asphalt": 0x8a41_1204,
  "sci-fi-panel": 0x8a41_1205,
  "wood-plank": 0x8a41_1206,
  "marble": 0x8a41_1207,
  "starfield-nebula": 0x8a41_1208,
  "normal-from-height": 0x8a41_1209
};

export const proceduralTextureFixtureKinds: readonly ProceduralTextureFixtureKind[] = [
  "metallic-paint",
  "metallic-roughness-map",
  "racing-stripes",
  "racing-number-decal",
  "carbon-fiber",
  "tire-tread",
  "concrete-asphalt",
  "sci-fi-panel",
  "wood-plank",
  "marble",
  "starfield-nebula",
  "normal-from-height"
] as const;

export function createProceduralTextureFixture(kind: ProceduralTextureFixtureKind, options: ProceduralTextureFixtureOptions = {}): ProceduralTextureFixture {
  const width = options.width ?? DEFAULT_SIZE;
  const height = options.height ?? DEFAULT_SIZE;
  if (!Number.isInteger(width) || width < 8 || !Number.isInteger(height) || height < 8) {
    throw new RangeError("Procedural texture fixtures require integer dimensions >= 8.");
  }
  const seed = options.seed ?? DEFAULT_SEEDS[kind];
  if (!Number.isInteger(seed)) {
    throw new RangeError("Procedural texture fixture seed must be an integer.");
  }
  const data = kind === "normal-from-height" ? normalFromHeightMap(width, height, seed) : new Uint8Array(width * height * 4);
  if (kind !== "normal-from-height") {
    const generator = generatorFor(kind);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const color = generator(x, y, width, height, seed);
        data[index] = color[0];
        data[index + 1] = color[1];
        data[index + 2] = color[2];
        data[index + 3] = color[3];
      }
    }
  }
  const descriptor = descriptorFor(kind);
  return {
    id: kind,
    label: options.label ?? `external-parity-procedural-${kind}`,
    width,
    height,
    seed,
    semantic: descriptor.semantic,
    colorSpace: descriptor.colorSpace,
    data,
    hash: hashRgba8(data),
    knownLimits: [
      "Deterministic procedural fixture for browser evidence, not a production scanned material.",
      "Generated locally from seeded math; no external texture license or photogrammetry claim is made."
    ]
  };
}

export function createProceduralTexture(kind: ProceduralTextureFixtureKind, options: ProceduralTextureFixtureOptions = {}): Texture {
  const fixture = createProceduralTextureFixture(kind, options);
  return new Texture({
    width: fixture.width,
    height: fixture.height,
    colorSpace: fixture.colorSpace,
    label: fixture.label,
    data: fixture.data
  });
}

export function createProceduralTextureFixtureManifest(options: ProceduralTextureFixtureOptions = {}): readonly Omit<ProceduralTextureFixture, "data">[] {
  return proceduralTextureFixtureKinds.map((kind) => {
    const { data: _data, ...fixture } = createProceduralTextureFixture(kind, options);
    return fixture;
  });
}

export function normalFromHeightMap(width: number, height: number, seed = DEFAULT_SEEDS["normal-from-height"]): Uint8Array {
  const heights = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      heights[y * width + x] = layeredNoise(x / width, y / height, seed, 5);
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = heights[y * width + ((x + width - 1) % width)] ?? 0;
      const right = heights[y * width + ((x + 1) % width)] ?? 0;
      const down = heights[((y + height - 1) % height) * width + x] ?? 0;
      const up = heights[((y + 1) % height) * width + x] ?? 0;
      const normal = normalize([-((right - left) * 3.5), 1, -((up - down) * 3.5)]);
      const index = (y * width + x) * 4;
      data[index] = byte(normal[0] * 0.5 + 0.5);
      data[index + 1] = byte(normal[1] * 0.5 + 0.5);
      data[index + 2] = byte(normal[2] * 0.5 + 0.5);
      data[index + 3] = 255;
    }
  }
  return data;
}

export function hashRgba8(data: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const value of data) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

type Rgba = readonly [number, number, number, number];
type Generator = (x: number, y: number, width: number, height: number, seed: number) => Rgba;

function generatorFor(kind: ProceduralTextureFixtureKind): Generator {
  switch (kind) {
    case "metallic-paint":
      return metallicPaint;
    case "metallic-roughness-map":
      return metallicRoughnessMap;
    case "racing-stripes":
      return racingStripes;
    case "racing-number-decal":
      return racingNumberDecal;
    case "carbon-fiber":
      return carbonFiber;
    case "tire-tread":
      return tireTread;
    case "concrete-asphalt":
      return concreteAsphalt;
    case "sci-fi-panel":
      return sciFiPanel;
    case "wood-plank":
      return woodPlank;
    case "marble":
      return marble;
    case "starfield-nebula":
      return starfieldNebula;
    case "normal-from-height":
      return () => [128, 255, 128, 255];
  }
}

function descriptorFor(kind: ProceduralTextureFixtureKind): Pick<ProceduralTextureFixture, "semantic" | "colorSpace"> {
  if (kind === "normal-from-height") return { semantic: "normal", colorSpace: "linear" };
  if (kind === "metallic-roughness-map") return { semantic: "metallic-roughness", colorSpace: "linear" };
  if (kind === "starfield-nebula") return { semantic: "emissive-background", colorSpace: "srgb" };
  return { semantic: "albedo", colorSpace: "srgb" };
}

function metallicPaint(x: number, y: number, width: number, height: number, seed: number): Rgba {
  const u = x / width;
  const v = y / height;
  const flake = Math.pow(layeredNoise(u * 15.3, v * 15.3, seed, 4), 8);
  const stripe = Math.sin((u + v * 0.12) * Math.PI * 9) > 0.86 ? 0.16 : 0;
  return [byte(0.64 + flake * 0.34 + stripe), byte(0.06 + flake * 0.18), byte(0.1 + flake * 0.22), 255];
}

function metallicRoughnessMap(x: number, y: number, width: number, height: number, seed: number): Rgba {
  const u = x / width;
  const v = y / height;
  const brushed = Math.sin((u * 22 + v * 2.5) * Math.PI) * 0.5 + 0.5;
  const panelEdge = x % 32 < 2 || y % 32 < 2 ? 0.16 : 0;
  const flake = Math.pow(layeredNoise(u * 11.5, v * 11.5, seed, 4), 4);
  const roughness = 0.28 + brushed * 0.22 + panelEdge + flake * 0.12;
  const metallic = 0.52 + flake * 0.28 - panelEdge * 0.2;
  return [255, byte(roughness), byte(metallic), 255];
}

function racingStripes(x: number, y: number, width: number, height: number, seed: number): Rgba {
  const u = x / width;
  const v = y / height;
  const centerStripe = Math.abs(u - 0.5) < 0.055;
  const sideStripe = Math.abs(u - 0.37) < 0.025 || Math.abs(u - 0.63) < 0.025;
  const diagonalAccent = Math.abs(((u + v * 0.22 + noise2(u * 4, v * 4, seed) * 0.015) % 1) - 0.18) < 0.012;
  if (centerStripe || sideStripe) return [248, 250, 244, 255];
  if (diagonalAccent) return [32, 38, 48, 255];
  return [186, 14, 28, 255];
}

function racingNumberDecal(x: number, y: number, width: number, height: number, seed: number): Rgba {
  const u = x / Math.max(1, width - 1);
  const v = y / Math.max(1, height - 1);
  const plate = roundedBox(u, v, 0.1, 0.18, 0.8, 0.64, 0.055);
  if (!plate) return [0, 0, 0, 0];
  const border = roundedBoxBorder(u, v, 0.1, 0.18, 0.8, 0.64, 0.055, 0.045);
  const stripe = Math.abs(v - 0.5) < 0.035 && u > 0.14 && u < 0.86;
  const digit = sevenSegmentDigit(u, v, 0.23, 0.27, 0.2, 0.46, 3) || sevenSegmentDigit(u, v, 0.56, 0.27, 0.2, 0.46, 7);
  const speckle = noise2(u * 18, v * 18, seed) * 0.04;
  if (digit) return [byte(0.02 + speckle), byte(0.025 + speckle), byte(0.035 + speckle), 255];
  if (border || stripe) return [186, 14, 28, 255];
  return [byte(0.9 + speckle), byte(0.91 + speckle), byte(0.86 + speckle), 248];
}

function carbonFiber(x: number, y: number, width: number, height: number, seed: number): Rgba {
  const weaveA = ((Math.floor(x / 5) + Math.floor(y / 5)) % 2) === 0 ? 1 : 0;
  const weaveB = Math.sin((x + y) * 0.72) * 0.5 + 0.5;
  const n = noise2(x / width * 18, y / height * 18, seed);
  const shade = 0.08 + weaveA * 0.12 + weaveB * 0.08 + n * 0.05;
  return [byte(shade * 0.72), byte(shade * 0.78), byte(shade), 255];
}

function tireTread(x: number, y: number, width: number, height: number, seed: number): Rgba {
  const center = Math.abs((x / width) - 0.5);
  const grooves = Math.sin((y / height) * Math.PI * 24 + center * 11) > 0.48 ? 0.16 : 0;
  const shoulder = center > 0.34 ? -0.08 : 0;
  const n = noise2(x / width * 24, y / height * 24, seed) * 0.06;
  const shade = 0.12 + grooves + shoulder + n;
  return [byte(shade), byte(shade), byte(shade * 0.96), 255];
}

function concreteAsphalt(x: number, y: number, width: number, height: number, seed: number): Rgba {
  const n = layeredNoise(x / width * 7, y / height * 7, seed, 5);
  const speckle = noise2(x * 0.91, y * 0.91, seed ^ 0x55aa) > 0.82 ? 0.18 : 0;
  const shade = 0.28 + n * 0.32 + speckle;
  return [byte(shade * 0.92), byte(shade * 0.94), byte(shade), 255];
}

function sciFiPanel(x: number, y: number, width: number, height: number, seed: number): Rgba {
  const u = x / width;
  const v = y / height;
  const grid = x % 24 < 2 || y % 24 < 2 ? 0.18 : 0;
  const inset = (x % 48 > 8 && x % 48 < 40 && y % 48 > 8 && y % 48 < 40) ? 0.08 : -0.02;
  const diode = distance2(u, v, 0.78, 0.28) < 0.0018 ? 0.78 : 0;
  const n = noise2(u * 8, v * 8, seed) * 0.05;
  return [byte(0.1 + grid + inset + n), byte(0.16 + grid + inset + diode + n), byte(0.2 + grid + inset + diode * 0.7 + n), 255];
}

function woodPlank(x: number, y: number, width: number, height: number, seed: number): Rgba {
  const u = x / width;
  const v = y / height;
  const plank = Math.floor(v * 6);
  const grain = Math.sin((u * 22 + layeredNoise(u * 5, v * 3 + plank, seed, 4) * 9) * Math.PI) * 0.5 + 0.5;
  const seam = Math.abs((v * 6) % 1) < 0.035 ? -0.16 : 0;
  return [byte(0.5 + grain * 0.22 + seam), byte(0.28 + grain * 0.14 + seam), byte(0.12 + grain * 0.08 + seam), 255];
}

function marble(x: number, y: number, width: number, height: number, seed: number): Rgba {
  const u = x / width;
  const v = y / height;
  const turbulence = layeredNoise(u * 4.2, v * 4.2, seed, 5);
  const vein = Math.pow(Math.abs(Math.sin((u * 6 + v * 3 + turbulence * 2.4) * Math.PI)), 9);
  return [byte(0.82 - vein * 0.32 + turbulence * 0.1), byte(0.8 - vein * 0.34 + turbulence * 0.08), byte(0.76 - vein * 0.32 + turbulence * 0.12), 255];
}

function starfieldNebula(x: number, y: number, width: number, height: number, seed: number): Rgba {
  const u = x / width;
  const v = y / height;
  const nebula = Math.pow(layeredNoise(u * 2.2 + 8, v * 2.2 - 3, seed, 5), 2.2);
  const star = hashUnit(Math.floor(u * 220), Math.floor(v * 140), seed) > 0.996 ? 1 : 0;
  const dust = hashUnit(Math.floor(u * 90), Math.floor(v * 70), seed ^ 0xa11ce) > 0.985 ? 0.45 : 0;
  return [byte(0.03 + nebula * 0.32 + star + dust), byte(0.04 + nebula * 0.12 + star + dust), byte(0.08 + nebula * 0.46 + star + dust * 0.8), 255];
}

function sevenSegmentDigit(u: number, v: number, x: number, y: number, width: number, height: number, digit: 3 | 7): boolean {
  const du = (u - x) / width;
  const dv = (v - y) / height;
  if (du < 0 || du > 1 || dv < 0 || dv > 1) return false;
  const thickness = 0.16;
  const horizontal = du > thickness * 0.65 && du < 1 - thickness * 0.65;
  const verticalTop = dv > thickness * 0.45 && dv < 0.5 - thickness * 0.15;
  const verticalBottom = dv > 0.5 + thickness * 0.15 && dv < 1 - thickness * 0.45;
  const top = horizontal && dv < thickness;
  const middle = horizontal && Math.abs(dv - 0.5) < thickness * 0.5;
  const bottom = horizontal && dv > 1 - thickness;
  const upperRight = du > 1 - thickness && verticalTop;
  const lowerRight = du > 1 - thickness && verticalBottom;
  if (digit === 3) return top || middle || bottom || upperRight || lowerRight;
  const diagonal = Math.abs(du + dv * 0.42 - 0.95) < thickness * 0.3 && dv > 0.12;
  return top || upperRight || lowerRight || diagonal;
}

function roundedBox(u: number, v: number, x: number, y: number, width: number, height: number, radius: number): boolean {
  if (u < x || u > x + width || v < y || v > y + height) return false;
  const cx = u < x + radius ? x + radius : u > x + width - radius ? x + width - radius : u;
  const cy = v < y + radius ? y + radius : v > y + height - radius ? y + height - radius : v;
  return distance2(u, v, cx, cy) <= radius * radius;
}

function roundedBoxBorder(u: number, v: number, x: number, y: number, width: number, height: number, radius: number, thickness: number): boolean {
  return roundedBox(u, v, x, y, width, height, radius) && !roundedBox(u, v, x + thickness, y + thickness, width - thickness * 2, height - thickness * 2, Math.max(0, radius - thickness));
}

function layeredNoise(x: number, y: number, seed: number, octaves: number): number {
  let amplitude = 0.5;
  let frequency = 1;
  let value = 0;
  let total = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    value += smoothNoise(x * frequency, y * frequency, seed + octave * 1013) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total > 0 ? value / total : 0;
}

function smoothNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const a = hashUnit(x0, y0, seed);
  const b = hashUnit(x0 + 1, y0, seed);
  const c = hashUnit(x0, y0 + 1, seed);
  const d = hashUnit(x0 + 1, y0 + 1, seed);
  return mix(mix(a, b, tx), mix(c, d, tx), ty);
}

function noise2(x: number, y: number, seed: number): number {
  return smoothNoise(x, y, seed);
}

function hashUnit(x: number, y: number, seed: number): number {
  let value = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x85ebca6b) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35) >>> 0;
  value ^= value >>> 16;
  return value / 0xffffffff;
}

function normalize(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function byte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function distance2(x: number, y: number, cx: number, cy: number): number {
  return (x - cx) ** 2 + (y - cy) ** 2;
}
