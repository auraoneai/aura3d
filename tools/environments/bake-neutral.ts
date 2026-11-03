#!/usr/bin/env -S node_modules/.bin/tsx
/**
 * Deterministic generator for Aura's default `neutral` environment.
 *
 * Source: the independently authored studio in
 * packages/rendering/src/environment/RoomEnvironmentScene.ts, scaled by
 * NEUTRAL_ROOM_EXPOSURE (probeBuild.ts) so its mean radiance is the neutral
 * exposure target. Steps, all with Aura's own CPU code:
 *   1. rasterize the room into six 256 px float faces (buildRoomFaces);
 *   2. GGX-prefilter the mip chain (workers/cpuPrefilter.ts, 128 Hammersley
 *      samples per texel; no random numbers);
 *   3. project the unfiltered faces onto SH9 (projectNeutralRoomSH9);
 *   4. write public/aura-environments/neutral.{specular.ktx2,sh9.f32,manifest.json}
 *      (indoor.* is kept as a byte copy, as before) and the SH9 literal in
 *      probeBuild.ts (NEUTRAL_FLOOR_SH9).
 * Then run `node tools/environments/embed-neutral.mjs` to refresh the embedded
 * self-contained copy (neutralEmbedded.ts).
 *
 * Usage: node_modules/.bin/tsx tools/environments/bake-neutral.ts [--check]
 * `--check` recomputes everything and fails if any written byte would change.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NEUTRAL_ENVIRONMENT_FACE_SIZE,
  NEUTRAL_ROOM_EXPOSURE,
  buildRoomFaces,
  deriveNeutralRoomExposure,
  projectNeutralRoomSH9
} from "../../packages/rendering/src/environment/probeBuild.ts";
import { packRgb9e5 } from "../../packages/rendering/src/environment/Rgb9e5Cube.ts";
import { prefilterCubeGGX } from "../../packages/rendering/src/environment/workers/cpuPrefilter.ts";

export const NEUTRAL_BAKE_SAMPLES = 128;

/** Minimal KTX2 container (VK_FORMAT_E5B9G9R9_UFLOAT_PACK32 cube, no DFD/KVD), the layout Rgb9e5Cube.ts reads. */
export function encodeNeutralKtx2(faceSize: number, levels: readonly { readonly faceSize: number; readonly faces: readonly Float32Array[] }[]): Uint8Array {
  const header = 68;
  const levelBytes = levels.map((level) => 6 * level.faceSize * level.faceSize * 4);
  let dataOffset = header + levels.length * 24;
  const bytes = new Uint8Array(dataOffset + levelBytes.reduce((sum, value) => sum + value, 0));
  bytes.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(12, 142, true); // VK_FORMAT_E5B9G9R9_UFLOAT_PACK32
  view.setUint32(16, 4, true); // typeSize
  view.setUint32(20, faceSize, true);
  view.setUint32(24, faceSize, true);
  view.setUint32(36, 6, true); // faces
  view.setUint32(40, levels.length, true);
  view.setUint32(48, header, true); // empty data-format descriptor
  view.setUint32(56, header, true); // empty key/value data
  levels.forEach((level, index) => {
    view.setBigUint64(header + index * 24, BigInt(dataOffset), true);
    view.setBigUint64(header + index * 24 + 8, BigInt(levelBytes[index]!), true);
    view.setBigUint64(header + index * 24 + 16, BigInt(levelBytes[index]!), true);
    const words = new Uint32Array(bytes.buffer, dataOffset, level.faceSize * level.faceSize * 6);
    let write = 0;
    for (const face of level.faces) {
      for (let texel = 0; texel < level.faceSize * level.faceSize; texel += 1) {
        words[write++] = packRgb9e5(face[texel * 4]!, face[texel * 4 + 1]!, face[texel * 4 + 2]!);
      }
    }
    dataOffset += levelBytes[index]!;
  });
  return bytes;
}

/** Format the SH9 literal exactly as it appears in probeBuild.ts. */
export function formatNeutralSh9(sh9: Float32Array): string {
  const rows: string[] = [];
  for (let basis = 0; basis < 9; basis += 1) {
    rows.push(`  ${[0, 1, 2].map((channel) => String(sh9[basis * 3 + channel])).join(", ")}`);
  }
  return rows.join(",\n");
}

function main(): void {
  const check = process.argv.includes("--check");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const exposure = deriveNeutralRoomExposure();
  if (exposure !== NEUTRAL_ROOM_EXPOSURE) throw new Error(`NEUTRAL_ROOM_EXPOSURE is stale: derived ${exposure}`);
  const faceSize = NEUTRAL_ENVIRONMENT_FACE_SIZE;
  const faces = buildRoomFaces(faceSize);
  const prefiltered = prefilterCubeGGX({ faceSize, faces }, { samples: NEUTRAL_BAKE_SAMPLES });
  const sh9 = projectNeutralRoomSH9(faceSize);
  const ktx2 = encodeNeutralKtx2(faceSize, prefiltered.levels);
  const shBytes = Buffer.from(sh9.buffer, sh9.byteOffset, sh9.byteLength);
  const manifestFor = (name: string) => JSON.stringify({
    name,
    source: "room",
    faceSize,
    mipCount: prefiltered.mipCount,
    format: "E5B9G9R9_UFLOAT_PACK32",
    specular: `${name}.specular.ktx2`,
    sh9: `${name}.sh9.f32`,
    sha256: {
      specular: createHash("sha256").update(ktx2).digest("hex"),
      sh9: createHash("sha256").update(shBytes).digest("hex")
    },
    license: "CC0",
    tags: ["neutral", "stand-in"],
    bakedBy: "tools/environments/bake-neutral.ts (Aura3D independent room, RoomEnvironmentScene.ts)",
    exposure: NEUTRAL_ROOM_EXPOSURE,
    samplesPerTexel: NEUTRAL_BAKE_SAMPLES
  }, null, 2);
  const probeBuildPath = join(root, "packages/rendering/src/environment/probeBuild.ts");
  const probeBuild = readFileSync(probeBuildPath, "utf8");
  const literal = /(export const NEUTRAL_FLOOR_SH9 = new Float32Array\(\[\n)[\s\S]*?(\n\]\);)/;
  if (!literal.test(probeBuild)) throw new Error("NEUTRAL_FLOOR_SH9 literal not found in probeBuild.ts");
  const outputs = new Map<string, Uint8Array | string>([
    ["public/aura-environments/neutral.specular.ktx2", ktx2],
    ["public/aura-environments/neutral.sh9.f32", shBytes],
    ["public/aura-environments/neutral.manifest.json", manifestFor("neutral")],
    ["public/aura-environments/indoor.specular.ktx2", ktx2],
    ["public/aura-environments/indoor.sh9.f32", shBytes],
    ["public/aura-environments/indoor.manifest.json", manifestFor("indoor")],
    ["packages/rendering/src/environment/probeBuild.ts", probeBuild.replace(literal, `$1${formatNeutralSh9(sh9)}$2`)]
  ]);
  const stale: string[] = [];
  for (const [path, value] of outputs) {
    const bytes = typeof value === "string" ? Buffer.from(value) : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    let current: Buffer | undefined;
    try { current = readFileSync(join(root, path)); } catch { current = undefined; }
    if (current && Buffer.compare(current, bytes) === 0) continue;
    stale.push(path);
    if (!check) writeFileSync(join(root, path), bytes);
  }
  if (check && stale.length > 0) throw new Error(`neutral environment is stale: ${stale.join(", ")}`);
  console.log(check ? "neutral environment matches the generator" : `wrote ${stale.length ? stale.join(", ") : "nothing (already current)"}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
