import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { applyProductionActorAnimation } from "../../../packages/engine/src/agent-api/compiler/animation.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";

type V = [number, number, number];

/**
 * A rigged Idol GLB driven the way the game drives it: runtime handle `setAnimation({ clip })` -> handle snapshot -> the
 * engine's per-frame actor dispatch (`applyProductionActorAnimation`, which advances the pose mixer by the engine-time
 * delta). `frame(ms)` runs one frame at engine time `ms`; a constant `ms` (the old `app.step(0)`) never fades the clip in.
 * Hands are found topology-agnostically (Idol rigs have 19-52 unnamed bones): the two joints furthest out along the
 * T-pose arm axis.
 */
export async function idolClipRig(file: string) {
  const bytes = readFileSync(file);
  const url = `https://offline-idol.invalid/${file.split("/").pop()}`;
  vi.stubGlobal("fetch", async () => new Response(new Uint8Array(bytes), { status: 200 }));
  const actor = await createTypedGLBActor({
    asset: { type: "model", format: "glb", url } as never, id: "idol", name: "idol", width: 64, height: 64, shareTextures: false,
    imageDecoder: async () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 128, 255]) })
  } as never);
  vi.unstubAllGlobals();
  const assets = defineAuraAssets({ body: { type: "model", format: "glb", url, bounds: [1, 1, 1] } });
  const handle = createAuraRuntimeNodeRegistry(scene().add(model(assets.body, { name: "body", scaleMode: "world" }).runtime({ id: "body" })).toJSON()).require("body");
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes));
  const skin = doc.getRoot().listSkins()[0]!;
  const ibm = skin.getInverseBindMatrices()!.getArray()!;
  const joints = skin.listJoints().map((j) => j.getName());
  const rest = (k: number): V => {
    const m = ibm.slice(k * 16, k * 16 + 16);
    const s2 = m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!;
    return [0, 1, 2].map((r) => -(m[r * 4]! * m[12]! + m[r * 4 + 1]! * m[13]! + m[r * 4 + 2]! * m[14]!) / s2) as V;
  };
  // mesh space is the raw Idol frame (the yaw lives on a wrapper node), so the T-pose arm axis is whichever of x / z the
  // joints spread furthest along; the hands are its two extremes
  const spread = (axis: 0 | 2) => Math.max(...joints.map((_, k) => rest(k)[axis])) - Math.min(...joints.map((_, k) => rest(k)[axis]));
  const lateral: 0 | 2 = spread(0) >= spread(2) ? 0 : 2;
  const byLat = joints.map((_, k) => k).sort((a, b) => rest(a)[lateral] - rest(b)[lateral]);
  const hands = [byLat[0]!, byLat[byLat.length - 1]!];
  const identity = Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0));
  const clipNames = doc.getRoot().listAnimations().map((a) => a.getName());
  /** One engine frame at time `ms` with `spec` on the handle; returns every joint's posed position (mesh space). */
  const frame = (spec: { clip: string; loop: boolean; speed: number }, ms: number) => {
    handle.setAnimation(spec);
    const node = { kind: "model", animation: handle.snapshot().animation, runtime: { id: "body" } };
    const warnings = new Set<string>();
    applyProductionActorAnimation({ actor } as never, node as never, undefined, ms, warnings, identity, () => {});
    const pal = actor.collectRenderItems().find((i) => i.skinning)!.skinning!.matrices as Float32Array;
    const at = (k: number): V => {
      const p = rest(k), m = pal.subarray(k * 16, k * 16 + 16);
      return [0, 1, 2].map((r) => m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]!) as V;
    };
    return { warnings: [...warnings], at, joints: joints.map((_, k) => at(k)) };
  };
  const head = joints.map((_, k) => k).sort((a, b) => rest(b)[1] - rest(a)[1])[0]!;
  /**
   * How far each hand sits below the head in a posed frame (the palette's root frame differs from the bind frame, so
   * compare joints within one frame): about 0.05 in the T-pose bind, about 0.25 with the arms hanging (1 m-tall rigs).
   */
  const handDrop = (f: ReturnType<typeof frame>) => hands.map((k) => f.at(head)[1] - f.at(k)[1]);
  return { frame, handDrop, clipNames, jointCount: joints.length };
}

/** Max joint travel between two frames. */
export function maxTravel(a: { joints: readonly V[] }, b: { joints: readonly V[] }): number {
  return Math.max(...a.joints.map((p, i) => Math.hypot(p[0] - b.joints[i]![0], p[1] - b.joints[i]![1], p[2] - b.joints[i]![2])));
}
