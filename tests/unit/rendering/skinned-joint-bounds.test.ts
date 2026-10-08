/**
 * PRD-06 T2.6 — `skinnedItemLocalBounds` under `A3D_QR_ANIMATION` replaces the
 * per-frame exact bounds with a union of per-joint bind-space AABBs
 * transformed by the palette. This spec loads CesiumMan (the lane's skinned
 * corpus fixture — a Soldier-class humanoid) and samples its animation clip at
 * 50 pseudo-random times, checking on every pose that the joint-box union (a)
 * contains the exact CPU-skinned bound and (b) stays within 1.3× the exact
 * bound's volume. The per-frame cache key is `paletteKey`, so two actors
 * sharing one geometry no longer evict each other's bounds (E26).
 */

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { QrFlags, QrFlagName, QrFlagValue } from "@aura3d/rendering/contracts";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { skinnedItemLocalBounds } from "../../../packages/rendering/src/renderer/SkinnedBounds";
import {
  computeSkinnedGeometryBounds,
  computeSkinnedGeometryBoundsFromJointBoxes,
  type SkinningBoundsPalette
} from "../../../packages/rendering/src/SkinningBounds";
import { paletteKeyOf } from "../../../packages/rendering/src/SkinningUniforms";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import type { SkinningPaletteBinding } from "../../../packages/rendering/src/ForwardPass";
import { GLTFLoader } from "../../../packages/assets/src/GLTFLoader";
import { createGLTFSceneAnimationRuntime } from "../../../packages/assets/src/GLTFAnimationRuntime";

function flagsOf(values: Readonly<Partial<Record<QrFlagName, QrFlagValue>>>): QrFlags {
  return {
    values,
    on(name: QrFlagName): boolean {
      const v = values[name];
      return v !== undefined && v !== false && v !== "0" && v !== "off" && v !== "";
    }
  };
}

const FLAGS_ON = flagsOf({ A3D_QR_ANIMATION: true });
const FLAGS_OFF = flagsOf({});

afterEach(() => setRendererQrFlags(FLAGS_OFF));

interface CesiumRig {
  readonly geometry: Geometry;
  readonly jointCount: number;
  /** 50 clip-sampled joint palettes (coherent skeletal poses). */
  readonly poses: Float32Array[];
  /** The skinning binding the runtime stamps (paletteKey carrier). */
  readonly binding: SkinningPaletteBinding;
}

let rigPromise: Promise<CesiumRig> | undefined;
function loadCesiumRig(): Promise<CesiumRig> {
  rigPromise ??= (async () => {
    const base64 = readFileSync("tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb").toString("base64");
    const asset = await new GLTFLoader().load(
      { url: `data:model/gltf-binary;base64,${base64}` },
      { throwIfAborted: () => undefined } as never
    );
    const clip = asset.animations[0];
    if (!clip) throw new Error("CesiumMan has no clip 0");
    const mesh = asset.meshes.find((entry) => entry.skinIndex !== undefined);
    if (!mesh?.joints || !mesh.weights) throw new Error("CesiumMan skinned mesh missing");
    const jointCount = asset.skins[mesh.skinIndex!]!.joints.length;

    const vertices = new VertexBuffer(VertexFormat.P3J4W4, mesh.positions.length);
    mesh.positions.forEach((position, index) => {
      vertices.setAttribute(index, "position", [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0]);
      vertices.setAttribute(index, "joints", [mesh.joints![index]![0] ?? 0, mesh.joints![index]![1] ?? 0, mesh.joints![index]![2] ?? 0, mesh.joints![index]![3] ?? 0]);
      vertices.setAttribute(index, "weights", [mesh.weights![index]![0] ?? 0, mesh.weights![index]![1] ?? 0, mesh.weights![index]![2] ?? 0, mesh.weights![index]![3] ?? 0]);
    });
    const indices = Array.from(mesh.indices ?? []);
    const geometry = new Geometry(vertices, new IndexBuffer(indices, mesh.positions.length));

    // Sample clip 0 at 50 evenly-spread times → coherent skeletal palettes.
    const scene = asset.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations, asset });
    scene.updateWorldTransforms();
    const renderable = scene.collectRenderables().find(({ renderable }) => renderable.skinning && renderable.skinning.jointCount === jointCount);
    if (!renderable?.renderable.skinning) throw new Error("skinned renderable not bound");
    const binding = renderable.renderable.skinning;
    const duration = clip.duration;
    const poses: Float32Array[] = [];
    for (let pose = 0; pose < 50; pose += 1) {
      const t = (pose + 0.37) * (duration / 50);
      runtime.applyClip(clip, t);
      poses.push(new Float32Array(binding.matrices));
    }
    return { geometry, jointCount, poses, binding };
  })();
  return rigPromise;
}

function volumeOf(bounds: { readonly min: readonly number[]; readonly max: readonly number[] }): number {
  return Math.max(0, bounds.max[0]! - bounds.min[0]!) * Math.max(0, bounds.max[1]! - bounds.min[1]!) * Math.max(0, bounds.max[2]! - bounds.min[2]!);
}

function expectContains(outer: { readonly min: readonly number[]; readonly max: readonly number[] }, inner: { readonly min: readonly number[]; readonly max: readonly number[] }): void {
  for (let axis = 0; axis < 3; axis += 1) {
    expect(outer.min[axis]!).toBeLessThanOrEqual(inner.min[axis]! + 1e-6);
    expect(outer.max[axis]!).toBeGreaterThanOrEqual(inner.max[axis]! - 1e-6);
  }
}

describe("T2.6 per-joint skinned bounds (CesiumMan, 50 clip-sampled poses)", () => {
  it("contains the exact CPU-skinned bound and stays within 1.3x its volume on every pose", async () => {
    setRendererQrFlags(FLAGS_ON);
    const { geometry, jointCount, poses } = await loadCesiumRig();
    let maxRatio = 0;
    poses.forEach((matrices) => {
      const palette: SkinningBoundsPalette = { jointCount, matrices };
      const exact = computeSkinnedGeometryBounds(geometry, palette);
      const jointBoxes = computeSkinnedGeometryBoundsFromJointBoxes(geometry, palette);
      expectContains(jointBoxes, exact);
      const ratio = volumeOf(jointBoxes) / volumeOf(exact);
      maxRatio = Math.max(maxRatio, ratio);
      expect(ratio).toBeLessThanOrEqual(1.3);
    });
    console.info(`T2.6 max joint-box/exact volume ratio: ${maxRatio.toFixed(4)}`);
    expect(maxRatio).toBeGreaterThan(0);
  });

  it("skinnedItemLocalBounds caches per paletteKey — two actors sharing a geometry stop evicting each other (E26)", async () => {
    setRendererQrFlags(FLAGS_ON);
    const { geometry, jointCount, poses } = await loadCesiumRig();
    const keyA = { actor: "a" };
    const keyB = { actor: "b" };
    const small: SkinningPaletteBinding = { jointCount, matrices: poses[0]! };
    const wide: SkinningPaletteBinding = { jointCount, matrices: poses[1]! };
    (small as { paletteKey?: object }).paletteKey = keyA;
    (wide as { paletteKey?: object }).paletteKey = keyB;

    const a1 = skinnedItemLocalBounds(geometry, small);
    const b1 = skinnedItemLocalBounds(geometry, wide);
    const a2 = skinnedItemLocalBounds(geometry, small);
    expect(a2).toBe(a1);
    expect(a2).not.toBe(b1);
    expect(paletteKeyOf(small)).toBe(keyA);
    expect(paletteKeyOf(wide)).toBe(keyB);
  });

  it("flag off keeps the legacy exact-bounds path (identical output)", async () => {
    const { geometry, jointCount, poses } = await loadCesiumRig();
    const binding: SkinningPaletteBinding = { jointCount, matrices: poses[2]! };
    const palette: SkinningBoundsPalette = { jointCount, matrices: poses[2]! };
    setRendererQrFlags(FLAGS_ON);
    const flagged = skinnedItemLocalBounds(geometry, binding);
    setRendererQrFlags(FLAGS_OFF);
    const legacy = skinnedItemLocalBounds(geometry, binding);
    const exact = computeSkinnedGeometryBounds(geometry, palette);
    expect(legacy.min).toEqual(exact.min);
    expect(legacy.max).toEqual(exact.max);
    for (let axis = 0; axis < 3; axis += 1) {
      expect(flagged.min[axis]!).toBeLessThanOrEqual(legacy.min[axis]! + 1e-6);
      expect(flagged.max[axis]!).toBeGreaterThanOrEqual(legacy.max[axis]! - 1e-6);
    }
  });
});
