export type VoxelFixtureBlockType =
  | "air"
  | "stone"
  | "dirt"
  | "grass"
  | "sand"
  | "water"
  | "wood"
  | "leaves"
  | "glass"
  | "coal-ore"
  | "iron-ore"
  | "gold-ore"
  | "diamond-ore"
  | "bedrock"
  | "cobblestone"
  | "planks"
  | "brick"
  | "snow"
  | "ice"
  | "lava";

export type VoxelFixtureLod = "near" | "mid" | "far" | "culled";

export interface VoxelFixtureOptions {
  readonly seed?: number;
  readonly chunkSize?: number;
  readonly viewDistance?: number;
  readonly cameraChunkX?: number;
  readonly cameraChunkZ?: number;
}

export interface VoxelBlockDescriptor {
  readonly type: VoxelFixtureBlockType;
  readonly color: readonly [number, number, number, number];
  readonly hardness: number;
  readonly toolRequired: string | null;
  readonly drops: VoxelFixtureBlockType | null;
  readonly sound: string;
  readonly animated: boolean;
  readonly lightLevel: number;
  readonly transparent: boolean;
  readonly solid: boolean;
}

export interface VoxelVisibleBlock {
  readonly id: string;
  readonly type: VoxelFixtureBlockType;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly lod: VoxelFixtureLod;
}

export interface VoxelWorldFixture {
  readonly id: "v4-old-branch-voxel-world-fixture";
  readonly source: "origin-master-voxel-world-adapted";
  readonly seed: number;
  readonly chunkSize: number;
  readonly viewDistance: number;
  readonly registry: readonly VoxelBlockDescriptor[];
  readonly blockTypeCount: number;
  readonly solidBlockTypes: number;
  readonly transparentBlockTypes: number;
  readonly animatedBlockTypes: number;
  readonly emittingBlockTypes: number;
  readonly chunkQueueSize: number;
  readonly generatingChunks: number;
  readonly meshingChunks: number;
  readonly lodCounts: Record<VoxelFixtureLod, number>;
  readonly blockCounts: Partial<Record<VoxelFixtureBlockType, number>>;
  readonly visibleBlocks: readonly VoxelVisibleBlock[];
  readonly visibleFaceEstimate: number;
  readonly memoryBytes: number;
  readonly hash: string;
  readonly claimBoundary: string;
}

const registry: readonly VoxelBlockDescriptor[] = [
  block("air", [0, 0, 0, 0], 0, null, null, "none", false, 0, true, false),
  block("stone", [0.5, 0.5, 0.5, 1], 1.5, "pickaxe", "cobblestone", "stone", false, 0, false, true),
  block("dirt", [0.4, 0.25, 0.15, 1], 0.5, null, "dirt", "dirt", false, 0, false, true),
  block("grass", [0.3, 0.7, 0.3, 1], 0.6, null, "dirt", "grass", false, 0, false, true),
  block("sand", [0.9, 0.85, 0.6, 1], 0.5, null, "sand", "sand", false, 0, false, true),
  block("water", [0.15, 0.4, 0.8, 0.6], 100, null, null, "water", true, 0, true, false),
  block("wood", [0.4, 0.25, 0.1, 1], 2, "axe", "wood", "wood", false, 0, false, true),
  block("leaves", [0.2, 0.6, 0.2, 0.9], 0.2, null, null, "grass", false, 0, true, true),
  block("glass", [0.7, 0.9, 1, 0.3], 0.3, null, "glass", "glass", false, 0, true, true),
  block("coal-ore", [0.12, 0.12, 0.12, 1], 3, "pickaxe", "coal-ore", "stone", false, 0, false, true),
  block("iron-ore", [0.72, 0.5, 0.34, 1], 3, "pickaxe", "iron-ore", "stone", false, 0, false, true),
  block("gold-ore", [1, 0.78, 0.2, 1], 3, "pickaxe", "gold-ore", "stone", false, 0, false, true),
  block("diamond-ore", [0.2, 0.85, 1, 1], 3, "pickaxe", "diamond-ore", "stone", false, 0, false, true),
  block("bedrock", [0.05, 0.05, 0.06, 1], 1000, null, null, "stone", false, 0, false, true),
  block("cobblestone", [0.38, 0.38, 0.38, 1], 2, "pickaxe", "cobblestone", "stone", false, 0, false, true),
  block("planks", [0.64, 0.42, 0.2, 1], 2, "axe", "planks", "wood", false, 0, false, true),
  block("brick", [0.62, 0.24, 0.18, 1], 2, "pickaxe", "brick", "stone", false, 0, false, true),
  block("snow", [0.92, 0.96, 1, 1], 0.2, null, "snow", "snow", false, 0, false, true),
  block("ice", [0.64, 0.88, 1, 0.72], 0.5, null, "ice", "glass", false, 0, true, true),
  block("lava", [1, 0.28, 0.02, 0.95], 100, null, null, "lava", true, 12, true, false)
];

export function sampleVoxelWorldFixture(options: VoxelFixtureOptions = {}): VoxelWorldFixture {
  const seed = integer(options.seed ?? 0x3d2025, "seed");
  const chunkSize = integer(options.chunkSize ?? 16, "chunkSize");
  if (chunkSize < 8 || chunkSize > 64) throw new RangeError("Voxel fixture chunkSize must be between 8 and 64.");
  const viewDistance = integer(options.viewDistance ?? 4, "viewDistance");
  if (viewDistance < 1 || viewDistance > 16) throw new RangeError("Voxel fixture viewDistance must be between 1 and 16.");
  const cameraChunkX = Math.trunc(options.cameraChunkX ?? 0);
  const cameraChunkZ = Math.trunc(options.cameraChunkZ ?? 0);
  const blockCounts: Partial<Record<VoxelFixtureBlockType, number>> = {};
  const visibleBlocks: VoxelVisibleBlock[] = [];
  let visibleFaceEstimate = 0;

  for (let x = 0; x < chunkSize; x += 1) {
    for (let z = 0; z < chunkSize; z += 1) {
      const worldX = cameraChunkX * chunkSize + x;
      const worldZ = cameraChunkZ * chunkSize + z;
      const height = terrainHeight(worldX, worldZ, seed, chunkSize);
      const surface = surfaceBlock(worldX, worldZ, seed, height, chunkSize);
      addCount(blockCounts, "bedrock", 1);
      addCount(blockCounts, "stone", Math.max(0, height - 4));
      addCount(blockCounts, "dirt", 3);
      addCount(blockCounts, surface, 1);
      if (height < chunkSize * 0.38) addCount(blockCounts, "water", Math.ceil(chunkSize * 0.38 - height));
      if (noise(worldX * 0.19 + 31, worldZ * 0.19 - 17, seed) > 0.9) addCount(blockCounts, oreBlock(height), 1);
      if (surface === "grass" && noise(worldX * 0.13 + 1000, worldZ * 0.13 + 1000, seed) > 0.88) {
        addCount(blockCounts, "wood", 3);
        addCount(blockCounts, "leaves", 6);
      }
      visibleFaceEstimate += 4 + Math.round(Math.abs(height - chunkSize * 0.5) * 0.8);
      if (visibleBlocks.length < 28 && (x + z) % 3 === 0) {
        const distance = Math.hypot(x - chunkSize / 2, z - chunkSize / 2) / chunkSize * viewDistance;
        visibleBlocks.push({
          id: `voxel-${x}-${z}`,
          type: surface,
          x: Number(((x / chunkSize - 0.5) * 2.3).toFixed(4)),
          y: Number(((height / chunkSize) * 0.72 - 0.64).toFixed(4)),
          z: Number(((z / chunkSize - 0.5) * 0.44 - 0.22).toFixed(4)),
          lod: lodForDistance(distance)
        });
      }
    }
  }

  const lodCounts = chunkLodCounts(viewDistance);
  const chunkQueueSize = Object.values(lodCounts).reduce((sum, count) => sum + count, 0);
  const memoryBytes = chunkQueueSize * chunkSize * chunkSize * chunkSize * 2;
  return {
    id: "v4-old-branch-voxel-world-fixture",
    source: "origin-master-voxel-world-adapted",
    seed,
    chunkSize,
    viewDistance,
    registry,
    blockTypeCount: registry.length,
    solidBlockTypes: registry.filter((entry) => entry.solid).length,
    transparentBlockTypes: registry.filter((entry) => entry.transparent).length,
    animatedBlockTypes: registry.filter((entry) => entry.animated).length,
    emittingBlockTypes: registry.filter((entry) => entry.lightLevel > 0).length,
    chunkQueueSize,
    generatingChunks: Math.min(2, chunkQueueSize),
    meshingChunks: Math.min(3, chunkQueueSize),
    lodCounts,
    blockCounts,
    visibleBlocks,
    visibleFaceEstimate,
    memoryBytes,
    hash: hashVoxel(seed, chunkSize, viewDistance, blockCounts, lodCounts, visibleFaceEstimate),
    claimBoundary: "Deterministic block registry, chunk queue, terrain columns, LOD buckets, and visible block markers adapted from the old voxel-world example; this is not a production voxel engine, mesh builder, collision system, multiplayer sandbox, or Minecraft parity claim."
  };
}

function block(
  type: VoxelFixtureBlockType,
  color: readonly [number, number, number, number],
  hardness: number,
  toolRequired: string | null,
  drops: VoxelFixtureBlockType | null,
  sound: string,
  animated: boolean,
  lightLevel: number,
  transparent: boolean,
  solid: boolean
): VoxelBlockDescriptor {
  return { type, color, hardness, toolRequired, drops, sound, animated, lightLevel, transparent, solid };
}

function terrainHeight(x: number, z: number, seed: number, chunkSize: number): number {
  const base = noise(x * 0.08, z * 0.08, seed);
  const detail = noise(x * 0.21 + 11, z * 0.21 - 7, seed) * 0.32;
  return Math.max(3, Math.min(chunkSize - 2, Math.round(chunkSize * (0.34 + base * 0.34 + detail))));
}

function surfaceBlock(x: number, z: number, seed: number, height: number, chunkSize: number): VoxelFixtureBlockType {
  if (height < chunkSize * 0.38) return "sand";
  if (height > chunkSize * 0.78) return noise(x * 0.13, z * 0.13, seed) > 0.45 ? "snow" : "stone";
  const biome = noise(x * 0.05 - 20, z * 0.05 + 30, seed);
  if (biome < 0.18) return "sand";
  if (biome > 0.82) return "stone";
  return "grass";
}

function oreBlock(height: number): VoxelFixtureBlockType {
  if (height < 6) return "diamond-ore";
  if (height < 9) return "gold-ore";
  if (height < 12) return "iron-ore";
  return "coal-ore";
}

function lodForDistance(distance: number): VoxelFixtureLod {
  if (distance <= 1.25) return "near";
  if (distance <= 2.5) return "mid";
  if (distance <= 4) return "far";
  return "culled";
}

function chunkLodCounts(viewDistance: number): Record<VoxelFixtureLod, number> {
  const counts: Record<VoxelFixtureLod, number> = { near: 0, mid: 0, far: 0, culled: 0 };
  const unloadDistance = viewDistance * 1.5;
  for (let x = -viewDistance; x <= viewDistance; x += 1) {
    for (let z = -viewDistance; z <= viewDistance; z += 1) {
      const distance = Math.hypot(x, z);
      if (distance <= viewDistance) counts[lodForDistance(distance)] += 1;
      else if (distance <= unloadDistance) counts.culled += 1;
    }
  }
  return counts;
}

function addCount(counts: Partial<Record<VoxelFixtureBlockType, number>>, type: VoxelFixtureBlockType, count: number): void {
  counts[type] = (counts[type] ?? 0) + count;
}

function noise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const top = lerp(hash(xi, zi, seed), hash(xi + 1, zi, seed), smoothstep(xf));
  const bottom = lerp(hash(xi, zi + 1, seed), hash(xi + 1, zi + 1, seed), smoothstep(xf));
  return lerp(top, bottom, smoothstep(zf));
}

function hash(x: number, z: number, seed: number): number {
  let value = Math.imul(x, 374761393) + Math.imul(z, 668265263) + seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function hashVoxel(
  seed: number,
  chunkSize: number,
  viewDistance: number,
  blockCounts: Partial<Record<VoxelFixtureBlockType, number>>,
  lodCounts: Record<VoxelFixtureLod, number>,
  visibleFaceEstimate: number
): string {
  let value = 0x811c9dc5;
  for (const entry of [seed, chunkSize, viewDistance, visibleFaceEstimate, ...Object.values(blockCounts), ...Object.values(lodCounts)]) {
    const scaled = Math.round((entry ?? 0) * 10);
    value ^= scaled & 0xff;
    value = Math.imul(value, 0x01000193) >>> 0;
    value ^= (scaled >>> 8) & 0xff;
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(16).padStart(8, "0");
}

function integer(value: number, label: string): number {
  if (!Number.isInteger(value)) throw new RangeError(`Voxel fixture ${label} must be an integer.`);
  return value;
}

function lerp(left: number, right: number, t: number): number {
  return left + (right - left) * t;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}
