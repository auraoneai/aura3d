import { sampleTerrainHeightfield, type TerrainHeightfieldFixture } from "./TerrainFixtures";

export type VegetationFixtureLayer = "tree" | "grass" | "shrub";
export type VegetationFixtureLod = "mesh" | "impostor" | "culled";

export interface VegetationFixtureOptions {
  readonly terrain: TerrainHeightfieldFixture;
  readonly seed?: number;
  readonly cameraX?: number;
  readonly elapsedSeconds?: number;
  readonly maxInstances?: number;
}

export interface VegetationFixtureInstance {
  readonly id: string;
  readonly layer: VegetationFixtureLayer;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly rotation: number;
  readonly distanceToCamera: number;
  readonly lod: VegetationFixtureLod;
  readonly windOffsetX: number;
  readonly windOffsetZ: number;
}

export interface VegetationLSystemBranchSegment {
  readonly instanceId: string;
  readonly startX: number;
  readonly startY: number;
  readonly startZ: number;
  readonly endX: number;
  readonly endY: number;
  readonly endZ: number;
  readonly width: number;
  readonly depth: number;
}

export interface VegetationLSystemFixture {
  readonly source: "origin-master-lsystem-turtle-adapted";
  readonly axiom: "F";
  readonly rule: "F -> F[+F][-F]!F";
  readonly iterations: number;
  readonly generatedSymbolLength: number;
  readonly branchSegmentCount: number;
  readonly renderedBranchSegmentCount: number;
  readonly branchTipCount: number;
  readonly maxDepth: number;
  readonly hash: string;
  readonly segments: readonly VegetationLSystemBranchSegment[];
  readonly claimBoundary: string;
}

export interface VegetationFixtureSample {
  readonly id: "v4-old-branch-vegetation-fixture";
  readonly source: "origin-master-vegetation-system-adapted";
  readonly seed: number;
  readonly instanceCount: number;
  readonly visibleCount: number;
  readonly culledCount: number;
  readonly meshLodCount: number;
  readonly impostorLodCount: number;
  readonly treeCount: number;
  readonly grassCount: number;
  readonly shrubCount: number;
  readonly maxWindOffset: number;
  readonly instances: readonly VegetationFixtureInstance[];
  readonly lsystem: VegetationLSystemFixture;
  readonly hash: string;
  readonly claimBoundary: string;
}

export function sampleVegetationFixture(options: VegetationFixtureOptions): VegetationFixtureSample {
  const terrain = options.terrain;
  const seed = options.seed ?? terrain.seed ^ 0x6eed;
  if (!Number.isInteger(seed)) {
    throw new RangeError("Vegetation fixture seed must be an integer.");
  }
  const cameraX = finite(options.cameraX ?? 0, "cameraX");
  const elapsedSeconds = Math.max(0, finite(options.elapsedSeconds ?? 0, "elapsedSeconds"));
  const maxInstances = Math.max(1, Math.min(512, Math.floor(options.maxInstances ?? 96)));
  const instances: VegetationFixtureInstance[] = [];
  const step = Math.max(2, Math.floor(Math.sqrt((terrain.width * terrain.height) / maxInstances)));
  for (let y = 1; y < terrain.height - 1 && instances.length < maxInstances; y += step) {
    for (let x = 1; x < terrain.width - 1 && instances.length < maxInstances; x += step) {
      const sample = sampleTerrainHeightfield(terrain, x / (terrain.width - 1), y / (terrain.height - 1));
      const placement = placementFor(sample.biome, seed + x * 17 + y * 31);
      if (!placement) continue;
      const worldX = (x / (terrain.width - 1) - 0.5) * 5.2;
      const worldZ = (y / (terrain.height - 1) - 0.5) * 1.1;
      const distance = Math.abs(worldX - cameraX) + Math.abs(worldZ) * 0.35;
      const lod: VegetationFixtureLod = distance > 1.18 ? "culled" : distance > 0.62 ? "impostor" : "mesh";
      const wind = windDisplacement(worldX, worldZ, elapsedSeconds, placement.windResponse, seed);
      instances.push({
        id: `veg-${x}-${y}`,
        layer: placement.layer,
        x: Number(worldX.toFixed(4)),
        y: Number((sample.height * 0.7 - 0.53).toFixed(4)),
        z: Number(worldZ.toFixed(4)),
        scale: placement.scale,
        rotation: Number((seeded01(seed + x * 101 + y * 7) * Math.PI * 2).toFixed(4)),
        distanceToCamera: Number(distance.toFixed(4)),
        lod,
        windOffsetX: wind.x,
        windOffsetZ: wind.z
      });
    }
  }
  const visible = instances.filter((instance) => instance.lod !== "culled");
  const meshLodCount = instances.filter((instance) => instance.lod === "mesh").length;
  const impostorLodCount = instances.filter((instance) => instance.lod === "impostor").length;
  const treeCount = instances.filter((instance) => instance.layer === "tree").length;
  const grassCount = instances.filter((instance) => instance.layer === "grass").length;
  const shrubCount = instances.filter((instance) => instance.layer === "shrub").length;
  const maxWindOffset = Math.max(0, ...instances.map((instance) => Math.hypot(instance.windOffsetX, instance.windOffsetZ)));
  const lsystem = createVegetationLSystemFixture(instances, seed);
  return {
    id: "v4-old-branch-vegetation-fixture",
    source: "origin-master-vegetation-system-adapted",
    seed,
    instanceCount: instances.length,
    visibleCount: visible.length,
    culledCount: instances.length - visible.length,
    meshLodCount,
    impostorLodCount,
    treeCount,
    grassCount,
    shrubCount,
    maxWindOffset: Number(maxWindOffset.toFixed(5)),
    instances,
    lsystem,
    hash: hashVegetation(instances, lsystem.hash),
    claimBoundary: "Deterministic biome-aware vegetation placement, LOD selection, culling, wind-displacement telemetry, and bounded L-system branch/tip telemetry adapted from the old vegetation and L-system systems; this is bounded fixture evidence, not instanced vegetation rendering, billboards, collision, seasonal growth, procedural mesh generation, or production terrain vegetation parity."
  };
}

function createVegetationLSystemFixture(instances: readonly VegetationFixtureInstance[], seed: number): VegetationLSystemFixture {
  const iterations = 3;
  const generated = generateDOL("F", "F[+F][-F]!F", iterations);
  const visibleTrees = instances.filter((instance) => instance.layer === "tree" && instance.lod !== "culled");
  const visibleVegetation = instances.filter((instance) => instance.lod !== "culled");
  const treeFallback = instances.filter((instance) => instance.layer === "tree");
  const branchSources = (visibleTrees.length > 0 ? visibleTrees : visibleVegetation.length > 0 ? visibleVegetation : treeFallback).slice(0, 8);
  const segments = branchSources.flatMap((instance, index) => interpretTreeLSystem(generated, instance, seed + index * 971)).slice(0, 160);
  const branchTipCount = countBranchTips(generated) * branchSources.length;
  const maxDepth = segments.reduce((max, segment) => Math.max(max, segment.depth), 0);
  return {
    source: "origin-master-lsystem-turtle-adapted",
    axiom: "F",
    rule: "F -> F[+F][-F]!F",
    iterations,
    generatedSymbolLength: generated.length,
    branchSegmentCount: countDrawCommands(generated) * branchSources.length,
    renderedBranchSegmentCount: segments.length,
    branchTipCount,
    maxDepth,
    hash: hashLSystemSegments(generated, segments),
    segments,
    claimBoundary: "D0L grammar expansion and turtle-style branch interpretation adapted from the old L-system code as deterministic vegetation evidence only; this does not claim production procedural tree meshes, botanical simulation, growth, collision, or Unity/Unreal vegetation parity."
  };
}

function generateDOL(axiom: string, successor: string, iterations: number): string {
  let current = axiom;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let next = "";
    for (const symbol of current) {
      next += symbol === "F" ? successor : symbol;
    }
    current = next.length > 4_096 ? next.slice(0, 4_096) : next;
  }
  return current;
}

function interpretTreeLSystem(generated: string, instance: VegetationFixtureInstance, seed: number): VegetationLSystemBranchSegment[] {
  const angle = 0.45 + seeded01(seed ^ 0x512) * 0.22;
  const step = instance.scale * (instance.lod === "impostor" ? 0.72 : 1);
  const stack: { x: number; y: number; z: number; heading: number; width: number; depth: number }[] = [];
  const state = { x: instance.x + instance.windOffsetX, y: instance.y, z: instance.z + instance.windOffsetZ, heading: Math.PI / 2, width: Math.max(0.006, step * 0.28), depth: 0 };
  const segments: VegetationLSystemBranchSegment[] = [];
  for (const symbol of generated) {
    if (symbol === "F") {
      const startX = state.x;
      const startY = state.y;
      const startZ = state.z;
      state.x += Math.cos(state.heading) * step;
      state.y += Math.sin(state.heading) * step * 1.45;
      state.z += Math.sin(state.heading * 0.73 + seed * 0.001) * step * 0.22;
      segments.push({
        instanceId: instance.id,
        startX: Number(startX.toFixed(4)),
        startY: Number(startY.toFixed(4)),
        startZ: Number(startZ.toFixed(4)),
        endX: Number(state.x.toFixed(4)),
        endY: Number(state.y.toFixed(4)),
        endZ: Number(state.z.toFixed(4)),
        width: Number(state.width.toFixed(5)),
        depth: state.depth
      });
    } else if (symbol === "+") {
      state.heading += angle;
    } else if (symbol === "-") {
      state.heading -= angle;
    } else if (symbol === "[") {
      stack.push({ ...state });
      state.depth += 1;
      state.width *= 0.72;
    } else if (symbol === "]") {
      const popped = stack.pop();
      if (popped) {
        state.x = popped.x;
        state.y = popped.y;
        state.z = popped.z;
        state.heading = popped.heading;
        state.width = popped.width;
        state.depth = popped.depth;
      }
    } else if (symbol === "!") {
      state.width *= 0.78;
    }
  }
  return segments;
}

function countDrawCommands(value: string): number {
  let count = 0;
  for (const symbol of value) {
    if (symbol === "F") count += 1;
  }
  return count;
}

function countBranchTips(value: string): number {
  let tips = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "F" && value[index + 1] !== "[") tips += 1;
  }
  return tips;
}

function placementFor(biome: string, seed: number): { readonly layer: VegetationFixtureLayer; readonly scale: number; readonly windResponse: number } | null {
  const roll = seeded01(seed);
  if (biome === "forest") {
    return roll < 0.72 ? { layer: "tree", scale: 0.09 + seeded01(seed ^ 0x51) * 0.08, windResponse: 0.45 } : { layer: "shrub", scale: 0.05, windResponse: 0.7 };
  }
  if (biome === "grassland") {
    return roll < 0.62 ? { layer: "grass", scale: 0.035 + seeded01(seed ^ 0x22) * 0.025, windResponse: 1 } : null;
  }
  if (biome === "beach") {
    return roll < 0.2 ? { layer: "grass", scale: 0.03, windResponse: 0.9 } : null;
  }
  return null;
}

function windDisplacement(x: number, z: number, time: number, response: number, seed: number): { readonly x: number; readonly z: number } {
  const gust = Math.sin(time * 1.8 + x * 2.1 + z * 1.3 + seeded01(seed) * Math.PI * 2);
  const turbulence = Math.sin(time * 3.2 + x * 4.4 - z * 2.7);
  return {
    x: Number(((gust * 0.018 + turbulence * 0.006) * response).toFixed(5)),
    z: Number((Math.cos(time * 1.3 + z * 3.1) * 0.01 * response).toFixed(5))
  };
}

function hashVegetation(instances: readonly VegetationFixtureInstance[], lsystemHash: string): string {
  let hash = 0x811c9dc5;
  for (const char of lsystemHash) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  for (const instance of instances) {
    for (const value of [instance.x, instance.y, instance.z, instance.scale, instance.windOffsetX, instance.windOffsetZ]) {
      const scaled = Math.round(value * 10_000);
      hash ^= scaled & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
      hash ^= (scaled >>> 8) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= instance.layer.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= instance.lod.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function hashLSystemSegments(generated: string, segments: readonly VegetationLSystemBranchSegment[]): string {
  let hash = 0x9e3779b9;
  for (const symbol of generated) {
    hash ^= symbol.charCodeAt(0);
    hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  }
  for (const segment of segments) {
    for (const value of [segment.startX, segment.startY, segment.startZ, segment.endX, segment.endY, segment.endZ, segment.width, segment.depth]) {
      const scaled = Math.round(value * 10_000);
      hash ^= scaled & 0xffff;
      hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, "0");
}

function seeded01(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) % 10_000) / 10_000;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`Vegetation fixture ${label} must be finite.`);
  return value;
}
