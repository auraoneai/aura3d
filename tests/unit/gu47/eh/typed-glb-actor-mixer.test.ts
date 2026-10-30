/**
 * GU47 E-H (WP-8) item 5: `TypedGLBActor.crossFadeTo(clip, seconds)` and
 * `playLayer(layer, clip, options)` drive the actor's PoseMixer; `advance(dt)`
 * steps it and writes the blended pose (`production-runtime/TypedGLBActor.ts`).
 * Uses the Khronos CesiumMan sample (skinned, one clip).
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTypedGLBActor, type TypedGLBActor } from "../../../../packages/engine/src/production-runtime/TypedGLBActor";

const GLB_BYTES = new Uint8Array(readFileSync("fixtures/three-compat/assets/corpus/cesium-man.glb"));
const nativeFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async () => new Response(new Uint8Array(GLB_BYTES), { status: 200 })) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = nativeFetch;
});

let serial = 0;
async function loadActor(): Promise<TypedGLBActor> {
  serial += 1;
  return createTypedGLBActor({
    asset: { url: `https://assets.invalid/gu47-eh/cesium-man-${serial}.glb`, type: "model", format: "glb" },
    id: `cesium-${serial}`,
    width: 64,
    height: 64,
    shareTextures: false
  });
}

describe("GU47 E-H TypedGLBActor crossFadeTo / playLayer", () => {
  it("crossFadeTo sets the mixer base clip with speed and loop, and advance applies it", async () => {
    const actor = await loadActor();
    const clip = actor.snapshot().clips[0]!;
    expect(clip).toBeTruthy();
    expect(actor.crossFadeTo(clip, 0.2, { speed: 2, loop: false })).toBe(actor);
    const base = actor.animation.mixer().baseAction();
    expect(base?.clipName).toBe(clip);
    expect(base?.timeScale).toBe(2);
    expect(base?.loopMode).toBe("once");
    expect(base?.clampWhenFinished).toBe(true);

    const result = actor.advance(0.1);
    expect(result.transformTracksApplied).toBeGreaterThan(0);
    // speed 2 → 0.2 s of clip time after a 0.1 s step.
    expect(actor.animation.mixer().baseAction()?.time).toBeCloseTo(0.2, 5);
    expect(actor.evidence.lastTracksApplied).toBe(result.tracksApplied);
    actor.dispose();
  });

  it("playLayer adds a layer action with weight, speed and fade-in; stopLayer removes it", async () => {
    const actor = await loadActor();
    const clip = actor.snapshot().clips[0]!;
    actor.crossFadeTo(clip, 0);
    actor.playLayer("overlay", clip, { weight: 0.5, speed: 0.5, fadeIn: 0.1 });
    const layered = actor.animation.mixer().activeActionEntries().filter((entry) => entry.layer === "overlay");
    expect(layered).toHaveLength(1);
    expect(layered[0]!.action.weight).toBe(0.5);
    expect(layered[0]!.action.timeScale).toBe(0.5);
    actor.advance(1 / 60);
    actor.stopLayer("overlay");
    expect(actor.animation.mixer().activeActionEntries().filter((entry) => entry.layer === "overlay")).toHaveLength(0);
    actor.dispose();
  });

  it("a masked layer only drives the bones the mask selects", async () => {
    const actor = await loadActor();
    const clip = actor.snapshot().clips[0]!;
    const joints = actor.animation.skeletonJointNames();
    actor.playLayer("masked", clip, { mask: { include: [joints[0]!] } });
    const action = actor.animation.mixer().activeActionEntries().find((entry) => entry.layer === "masked")!.action;
    expect(action.layerMask).toBeInstanceOf(Float32Array);
    expect(action.layerMask![0]).toBe(1);
    expect(Array.from(action.layerMask!).filter((weight) => weight > 0).length).toBeLessThan(joints.length);
    actor.dispose();
  });

  it("playClip still drives the actor statelessly and owns the evidence again", async () => {
    const actor = await loadActor();
    const clip = actor.snapshot().clips[0]!;
    actor.crossFadeTo(clip, 0);
    actor.advance(0.05);
    const direct = actor.playClip(clip, 0.5);
    expect(actor.evidence.lastClip).toBe(direct.clipName);
    actor.dispose();
  });
});
