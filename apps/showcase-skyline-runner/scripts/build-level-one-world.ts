import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  SKYLINE_SECTION_LAYOUTS,
  SKYLINE_SECTION_STRIDE,
  skylineTerrainWarp
} from "../src/level-layout";

const SOURCE = resolve("public/aura-assets/showcaseKenneyVerdantPlatformerWorld.9f7c2b49.glb");
const OUTPUT = resolve("apps/showcase-skyline-runner/generated/showcaseSkylineLevelOneWorld.glb");
const MODEL_TO_GAME = 0.18;
const MODEL_GAME_ORIGIN_X = -11.5;
const MODEL_SECTION_STRIDE = SKYLINE_SECTION_STRIDE / MODEL_TO_GAME;

interface GlbChunk {
  readonly type: number;
  readonly data: Buffer;
}

interface GltfNode {
  name?: string;
  mesh?: number;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  [key: string]: unknown;
}

interface GltfMaterial {
  name?: string;
  pbrMetallicRoughness?: {
    baseColorFactor?: [number, number, number, number];
    metallicFactor?: number;
    roughnessFactor?: number;
    [key: string]: unknown;
  };
  emissiveFactor?: [number, number, number];
  [key: string]: unknown;
}

interface GltfDocument {
  asset: { generator?: string; [key: string]: unknown };
  nodes: GltfNode[];
  materials?: GltfMaterial[];
  scenes: { nodes?: number[]; [key: string]: unknown }[];
  scene?: number;
  [key: string]: unknown;
}

/**
 * A deterministic nocturne palette for the authored Kenney material roles.
 *
 * The source GLB's bright stone/cloud values became near-white under the route's
 * moonlit key, flattening mountains, platforms, and clouds into one repeated
 * value bucket. Retune materials here, in the committed GLB producer, so the
 * registered typed world—not a route-level tint or screenshot treatment—owns
 * the cohesive Steel Dawn art direction. Geometry, mesh assignments, bounds,
 * and every certified playable surface remain byte-for-byte structurally
 * unchanged apart from the JSON material values.
 */
const NOCTURNE_MATERIALS: Readonly<Record<string, {
  readonly color: readonly [number, number, number, number];
  readonly metallic: number;
  readonly roughness: number;
  readonly emissive?: readonly [number, number, number];
}>> = {
  "platform stone": { color: [0.018, 0.065, 0.16, 1], metallic: 0.08, roughness: 0.82 },
  "platform cliff": { color: [0.045, 0.13, 0.29, 1], metallic: 0.04, roughness: 0.9 },
  "platform grass": { color: [0.42, 0.7, 0.84, 1], metallic: 0.02, roughness: 0.76 },
  "platform moss": { color: [0.27, 0.58, 0.72, 1], metallic: 0.02, roughness: 0.72 },
  "hazard lava": { color: [0.95, 0.16, 0.055, 1], metallic: 0.03, roughness: 0.34, emissive: [0.8, 0.07, 0.018] },
  bark: { color: [0.09, 0.045, 0.035, 1], metallic: 0.01, roughness: 0.94 },
  foliage: { color: [0.025, 0.2, 0.16, 1], metallic: 0.01, roughness: 0.88 },
  "collectible gold": { color: [1, 0.56, 0.06, 1], metallic: 0.18, roughness: 0.28, emissive: [0.85, 0.24, 0.018] },
  "accent purple": { color: [0.42, 0.16, 0.7, 1], metallic: 0.08, roughness: 0.34, emissive: [0.42, 0.04, 0.72] },
  "finish portal": { color: [0.03, 0.58, 0.78, 1], metallic: 0.12, roughness: 0.26, emissive: [0.02, 0.54, 0.82] },
  "background cloud": { color: [0.29, 0.38, 0.54, 1], metallic: 0.01, roughness: 0.95 }
};

function applyNocturneMaterials(json: GltfDocument): void {
  for (const entry of json.materials ?? []) {
    const palette = entry.name ? NOCTURNE_MATERIALS[entry.name] : undefined;
    if (!palette) continue;
    entry.pbrMetallicRoughness = {
      ...entry.pbrMetallicRoughness,
      baseColorFactor: [...palette.color],
      metallicFactor: palette.metallic,
      roughnessFactor: palette.roughness
    };
    if (palette.emissive) entry.emissiveFactor = [...palette.emissive];
    else delete entry.emissiveFactor;
  }
}

function readGlb(path: string): { json: GltfDocument; chunks: GlbChunk[] } {
  const input = readFileSync(path);
  if (input.toString("ascii", 0, 4) !== "glTF" || input.readUInt32LE(4) !== 2) {
    throw new Error(`${path} is not a GLB 2.0 file.`);
  }
  const chunks: GlbChunk[] = [];
  let json: GltfDocument | undefined;
  for (let offset = 12; offset < input.length;) {
    const length = input.readUInt32LE(offset);
    const type = input.readUInt32LE(offset + 4);
    const data = input.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) {
      json = JSON.parse(data.toString("utf8").replace(/[\0 ]+$/u, "")) as GltfDocument;
    } else {
      chunks.push({ type, data: Buffer.from(data) });
    }
    offset += 8 + length;
  }
  if (!json) throw new Error(`${path} has no JSON chunk.`);
  return { json, chunks };
}

function writeGlb(path: string, json: GltfDocument, chunks: readonly GlbChunk[]): void {
  const jsonSource = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPadding = (4 - (jsonSource.length % 4)) % 4;
  const jsonData = Buffer.concat([jsonSource, Buffer.alloc(jsonPadding, 0x20)]);
  const allChunks = [{ type: 0x4e4f534a, data: jsonData }, ...chunks];
  const totalLength = 12 + allChunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const output = Buffer.alloc(totalLength);
  output.write("glTF", 0, "ascii");
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  let offset = 12;
  for (const chunk of allChunks) {
    output.writeUInt32LE(chunk.data.length, offset);
    output.writeUInt32LE(chunk.type, offset + 4);
    chunk.data.copy(output, offset + 8);
    offset += 8 + chunk.data.length;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, output);
}

function checkpointGroup(name: string): number | undefined {
  const match = /^checkpoint-(?:column|header)-(\d)/u.exec(name);
  return match ? Number(match[1]) : undefined;
}

function followsTerrain(name: string): boolean {
  return /^(?:platform-|cliff-rock-|hazard-|tree-|collectible-|checkpoint-|finish-)/u.test(name);
}

/**
 * Keep one authored world, but do not stamp its entire decorative backdrop into
 * every district. Gameplay surfaces and hazards are untouched. The live route
 * already owns collectible/checkpoint presentation, so baked coins are omitted;
 * the review/runtime route owns the distant environment layer, so baked
 * mountains, clouds, and trees are omitted instead of being repeated once per
 * district. Playable surfaces, hazards, relay architecture, and the finish
 * remain authored by this typed world.
 */
function retainDecorativeNode(name: string): boolean {
  if (/^collectible-coin-/u.test(name)) return false;
  // The thick rectangular ground meshes made every landing read as a gray
  // test block. The source asset already provides a separate snow-cap mesh and
  // multiple faceted cliff-rock supports for each certified landing. Retain
  // those authored silhouettes and omit only the redundant rectangular fill;
  // route collision and the cap's top surface remain unchanged.
  if (/^platform-ground-/u.test(name)) return false;
  const mountain = /^background-mountain-(\d+)$/u.exec(name);
  // The route supplies a layered silhouette backdrop and the source's repeated
  // triangular mountains sit in front of its platforms at this side-on scale.
  // Keeping even three per district produced conspicuous cone wallpaper in the
  // exact frame, so the composed world relies on its trees/clouds plus that
  // planned distant skyline instead.
  if (mountain) return false;
  if (/^background-cloud-/u.test(name)) return false;
  if (/^tree-(?:trunk|canopy)-/u.test(name)) return false;
  return true;
}

const { json, chunks } = readGlb(SOURCE);
applyNocturneMaterials(json);
const baseNodes = json.nodes;
const longNodes: GltfNode[] = [];
const sceneNodes: number[] = [];

for (let section = 0; section < SKYLINE_SECTION_LAYOUTS.length; section += 1) {
  const layout = SKYLINE_SECTION_LAYOUTS[section]!;
  const relayGroup = section % 5;
  for (const sourceNode of baseNodes) {
    const sourceName = sourceNode.name ?? "node";
    if (!retainDecorativeNode(sourceName)) continue;
    const checkpoint = checkpointGroup(sourceName);
    if (checkpoint !== undefined && checkpoint !== relayGroup) continue;
    if (/^finish-/u.test(sourceName) && section !== SKYLINE_SECTION_LAYOUTS.length - 1) continue;

    const node = structuredClone(sourceNode);
    node.name = checkpoint !== undefined
      ? `relay-gate-${section + 1}-${sourceName}`
      : /^finish-/u.test(sourceName)
        ? `summit-goal-${sourceName}`
        : `district-${section + 1}-${layout.name}--${sourceName}`;
    if (node.translation) {
      const localModelX = node.translation[0];
      const localGameX = (localModelX - MODEL_GAME_ORIGIN_X) * MODEL_TO_GAME;
      const gameYOffset = layout.elevation + (followsTerrain(sourceName)
        ? skylineTerrainWarp(section, localGameX)
        : 0);
      node.translation = [
        localModelX + section * MODEL_SECTION_STRIDE,
        node.translation[1] + gameYOffset / MODEL_TO_GAME,
        node.translation[2]
      ];
    }
    const cliffRock = /^cliff-rock-(\d+)-(\d+)$/u.exec(sourceName);
    if (cliffRock) {
      const platformIndex = Number(cliffRock[1]);
      const rockIndex = Number(cliffRock[2]);
      const sourceScale = node.scale ?? [1, 1, 1];
      // In the source world these faceted rocks were embedded inside the thick
      // rectangular ground fill. Once that redundant fill is removed, their
      // original one-unit scale reads as a row of tiny debug dots. Enlarge the
      // existing authored meshes into overlapping, irregular cliff islands;
      // their tops meet the unchanged snow caps while collision remains owned
      // by the route's certified surface map.
      const widthFactor = 2.2 + ((platformIndex * 3 + rockIndex * 5) % 4) * 0.18;
      const heightFactor = 2.85 + ((platformIndex * 7 + rockIndex * 2) % 5) * 0.16;
      node.scale = [
        sourceScale[0] * widthFactor,
        sourceScale[1] * heightFactor,
        sourceScale[2] * 1.45
      ];
    }
    sceneNodes.push(longNodes.length);
    longNodes.push(node);
  }
}

json.nodes = longNodes;
const sceneIndex = json.scene ?? 0;
json.scenes[sceneIndex] = { ...json.scenes[sceneIndex], nodes: sceneNodes };
json.asset = {
  ...json.asset,
  generator: "Aura3D Skyline Level 1 deterministic GLB compositor",
  extras: {
    sourceAsset: "showcaseKenneyVerdantPlatformerWorld.9f7c2b49.glb",
    sourceLicense: "CC0-1.0",
    districts: SKYLINE_SECTION_LAYOUTS.length,
    terrainProfiles: "apps/showcase-skyline-runner/src/level.ts",
    materialDirection: "steel-dawn-nocturne-v1",
    platformerGeometry: {
      modelToGameScale: MODEL_TO_GAME,
      sectionModelSpan: MODEL_SECTION_STRIDE,
      maxRetainedPlayableSurfaces: 128,
      authoredLevelLength: SKYLINE_SECTION_LAYOUTS.length * SKYLINE_SECTION_STRIDE,
      authoredCompletionSeconds: 170
    }
  }
};

writeGlb(OUTPUT, json, chunks);
console.log(JSON.stringify({
  output: OUTPUT,
  sourceNodes: baseNodes.length,
  outputNodes: longNodes.length,
  districts: SKYLINE_SECTION_LAYOUTS.length,
  modelSectionStride: MODEL_SECTION_STRIDE
}, null, 2));
