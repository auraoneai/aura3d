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
  translation?: [number, number, number];
  [key: string]: unknown;
}

interface GltfDocument {
  asset: { generator?: string; [key: string]: unknown };
  nodes: GltfNode[];
  scenes: { nodes?: number[]; [key: string]: unknown }[];
  scene?: number;
  [key: string]: unknown;
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

const { json, chunks } = readGlb(SOURCE);
const baseNodes = json.nodes;
const longNodes: GltfNode[] = [];
const sceneNodes: number[] = [];

for (let section = 0; section < SKYLINE_SECTION_LAYOUTS.length; section += 1) {
  const layout = SKYLINE_SECTION_LAYOUTS[section]!;
  const relayGroup = section % 5;
  for (const sourceNode of baseNodes) {
    const sourceName = sourceNode.name ?? "node";
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
