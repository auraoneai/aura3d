/**
 * PRD-06 T0.7 — `inspectAnimationClips` (commands/prd06) reports the same clip
 * durations three r185's GLTFLoader produces (`AnimationClip.duration`) within
 * 1e-3, on `fixtures/threejs-parity/assets/character/soldier.glb`.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectAnimationClips, readGlbDocument } from "../../../packages/aura3d-cli/src/commands/prd06/inspectAnimationClips";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const soldierPath = resolve(repoRoot, "fixtures/threejs-parity/assets/character/soldier.glb");

interface ThreeGltf {
  readonly animations: readonly { readonly name: string; readonly duration: number }[];
}

async function threeClipDurations(): Promise<readonly { name: string; duration: number }[]> {
  // three r185's GLTFLoader touches `self`/createObjectURL for texture blobs;
  // animation clips parse without them.
  (globalThis as { self?: unknown }).self = globalThis;
  if (!URL.createObjectURL) {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:stub";
  }
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const buf = readFileSync(soldierPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await new Promise<ThreeGltf>((resolvePromise, rejectPromise) => {
    new GLTFLoader().parse(ab, "", resolvePromise, rejectPromise);
  });
  return gltf.animations.map((clip) => ({ name: clip.name, duration: clip.duration }));
}

describe("inspectAnimationClips (T0.7)", () => {
  it("matches three r185 GLTFLoader clip durations within 1e-3 on soldier.glb", async () => {
    const { json, bin } = readGlbDocument(new Uint8Array(readFileSync(soldierPath)));
    const clips = inspectAnimationClips(json, bin);
    const three = await threeClipDurations();
    expect(clips.map((clip) => clip.name)).toEqual(three.map((clip) => clip.name));
    for (const [index, clip] of clips.entries()) {
      expect(clip.duration, `${clip.name} duration`).toBeCloseTo(three[index]!.duration, 3);
      expect(clip.channelCount).toBeGreaterThan(0);
    }
    const walk = clips.find((clip) => clip.name === "Walk");
    expect(walk?.duration).toBeCloseTo(1.0333, 3);
  });
});
