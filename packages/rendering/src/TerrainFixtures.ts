export type TerrainFixtureBiome = "water" | "beach" | "grassland" | "forest" | "rock" | "snow";

export interface TerrainHeightfieldFixtureOptions {
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
}

export interface TerrainHeightfieldSample {
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly moisture: number;
  readonly temperature: number;
  readonly biome: TerrainFixtureBiome;
}

export interface TerrainHeightfieldFixture {
  readonly id: "external-parity-old-branch-terrain-heightfield";
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly data: Float32Array;
  readonly samples: readonly TerrainHeightfieldSample[];
  readonly biomeCounts: Readonly<Record<TerrainFixtureBiome, number>>;
  readonly meanHeight: number;
  readonly roughness: number;
  readonly riverCellCount: number;
  readonly hash: string;
  readonly source: "origin-master-terrain-generator-adapted";
  readonly claimBoundary: string;
}

const terrainBiomes: readonly TerrainFixtureBiome[] = ["water", "beach", "grassland", "forest", "rock", "snow"] as const;

export function createTerrainHeightfieldFixture(options: TerrainHeightfieldFixtureOptions = {}): TerrainHeightfieldFixture {
  const width = options.width ?? 32;
  const height = options.height ?? 32;
  if (!Number.isInteger(width) || width < 8 || !Number.isInteger(height) || height < 8) {
    throw new RangeError("Terrain heightfield fixture dimensions must be integer values >= 8.");
  }
  const seed = options.seed ?? 0x7434_2025;
  if (!Number.isInteger(seed)) {
    throw new RangeError("Terrain heightfield fixture seed must be an integer.");
  }
  const minHeight = finite(options.minHeight ?? -0.12, "minHeight");
  const maxHeight = finite(options.maxHeight ?? 0.42, "maxHeight");
  if (maxHeight <= minHeight) {
    throw new RangeError("Terrain heightfield fixture maxHeight must be greater than minHeight.");
  }
  const data = new Float32Array(width * height);
  const biomeCounts = Object.fromEntries(terrainBiomes.map((biome) => [biome, 0])) as Record<TerrainFixtureBiome, number>;
  let sum = 0;
  let roughness = 0;
  let riverCellCount = 0;
  const samples: TerrainHeightfieldSample[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / Math.max(1, width - 1);
      const v = y / Math.max(1, height - 1);
      const base = fractalNoise(u * 3.3, v * 3.3, seed, 5);
      const detail = fractalNoise(u * 13.7 + 4.1, v * 13.7 - 2.4, seed ^ 0x4f53, 3);
      const river = Math.max(0, 1 - Math.abs(v - (0.48 + Math.sin(u * Math.PI * 2.2) * 0.08)) * 32);
      const normalized = clamp(base * 0.82 + detail * 0.18 - river * 0.22, 0, 1);
      const value = minHeight + normalized * (maxHeight - minHeight);
      data[y * width + x] = value;
      sum += value;
      if (river > 0.35) riverCellCount += 1;
      const moisture = clamp(fractalNoise(u * 2.4 + 7.2, v * 2.4 - 1.8, seed ^ 0x9ab1, 4) + river * 0.28, 0, 1);
      const temperature = clamp((1 - v) * 0.78 + fractalNoise(u * 1.8 - 3.2, v * 1.8 + 5.8, seed ^ 0x1c0d, 3) * 0.22 - normalized * 0.38, 0, 1);
      const biome = biomeFor(normalized, moisture, temperature, river);
      biomeCounts[biome] += 1;
      if (x % Math.max(1, Math.floor(width / 4)) === 0 && y % Math.max(1, Math.floor(height / 4)) === 0) {
        samples.push({ x, y, height: Number(value.toFixed(4)), moisture: Number(moisture.toFixed(4)), temperature: Number(temperature.toFixed(4)), biome });
      }
      if (x > 0) roughness += Math.abs(value - (data[y * width + x - 1] ?? value));
      if (y > 0) roughness += Math.abs(value - (data[(y - 1) * width + x] ?? value));
    }
  }
  return {
    id: "external-parity-old-branch-terrain-heightfield",
    width,
    height,
    seed,
    minHeight,
    maxHeight,
    data,
    samples,
    biomeCounts,
    meanHeight: Number((sum / data.length).toFixed(5)),
    roughness: Number((roughness / Math.max(1, data.length * 2 - width - height)).toFixed(5)),
    riverCellCount,
    hash: hashFloat32(data),
    source: "origin-master-terrain-generator-adapted",
    claimBoundary: "Deterministic heightfield, biome, roughness, and river-cell telemetry adapted from the old terrain generator concepts; this is a bounded local fixture, not full terrain ECS, erosion, collision, vegetation, or streaming terrain parity."
  };
}

export function sampleTerrainHeightfield(fixture: TerrainHeightfieldFixture, u: number, v: number): TerrainHeightfieldSample {
  const x = Math.max(0, Math.min(fixture.width - 1, Math.round(clamp(u, 0, 1) * (fixture.width - 1))));
  const y = Math.max(0, Math.min(fixture.height - 1, Math.round(clamp(v, 0, 1) * (fixture.height - 1))));
  const height = fixture.data[y * fixture.width + x] ?? 0;
  const normalized = (height - fixture.minHeight) / Math.max(0.0001, fixture.maxHeight - fixture.minHeight);
  const moisture = clamp(fractalNoise((x / fixture.width) * 2.4 + 7.2, (y / fixture.height) * 2.4 - 1.8, fixture.seed ^ 0x9ab1, 4), 0, 1);
  const temperature = clamp((1 - y / fixture.height) * 0.78 + fractalNoise((x / fixture.width) * 1.8 - 3.2, (y / fixture.height) * 1.8 + 5.8, fixture.seed ^ 0x1c0d, 3) * 0.22 - normalized * 0.38, 0, 1);
  return { x, y, height: Number(height.toFixed(4)), moisture: Number(moisture.toFixed(4)), temperature: Number(temperature.toFixed(4)), biome: biomeFor(normalized, moisture, temperature, 0) };
}

function biomeFor(height: number, moisture: number, temperature: number, river: number): TerrainFixtureBiome {
  if (height < 0.18 || river > 0.62) return "water";
  if (height < 0.24) return "beach";
  if (height > 0.78 && temperature < 0.34) return "snow";
  if (height > 0.68) return "rock";
  if (moisture > 0.58) return "forest";
  return "grassland";
}

function fractalNoise(x: number, y: number, seed: number, octaves: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    value += smoothNoise(x * frequency, y * frequency, seed + octave * 1013) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total === 0 ? 0 : value / total;
}

function smoothNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const a = valueNoise(x0, y0, seed);
  const b = valueNoise(x0 + 1, y0, seed);
  const c = valueNoise(x0, y0 + 1, seed);
  const d = valueNoise(x0 + 1, y0 + 1, seed);
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

function valueNoise(x: number, y: number, seed: number): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

function hashFloat32(values: Float32Array): string {
  let hash = 0x811c9dc5;
  const view = new DataView(new ArrayBuffer(4));
  for (const value of values) {
    view.setFloat32(0, value, true);
    for (let index = 0; index < 4; index += 1) {
      hash ^= view.getUint8(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, "0");
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`Terrain heightfield fixture ${label} must be finite.`);
  return value;
}

function lerp(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
