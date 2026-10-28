import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GLTFLoader, LoadContext, createGLTFSceneAnimationRuntime } from "../../../packages/assets/src";
import type { AuraRuntimeNodeHandle } from "../../../packages/engine/src/agent-api/index";
import {
  ANIMATION_RETARGET_SOURCE_NOT_LOADED,
  createPrd06ActorAnimationApi,
  registerPrd06AnimationActor,
  resetQrAnimationFlags,
  setQrAnimationFlags
} from "../../../packages/engine/src/agent-api/app/actorAnimationHandle";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { TypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";

/**
 * Root retargeting (PRD beat-three.js WP-K.3): a route holds runtime-node handles, never the
 * loaded actor's animation runtime, so `node.animation.addClipsFrom(...)` has to accept the
 * source model node itself (handle or id).
 */
const model = (id: string) => ({ id, kind: "model" }) as AuraRuntimeNodeHandle;

afterEach(() => {
  resetQrAnimationFlags();
  vi.restoreAllMocks();
});

async function loadRuntime(file: string) {
  const url = `data:model/gltf-binary;base64,${readFileSync(file).toString("base64")}`;
  const asset = await new GLTFLoader().load({ url, type: "gltf" }, new LoadContext());
  return createGLTFSceneAnimationRuntime({ scene: asset.createScene(), clips: asset.animations });
}

describe("node.animation.addClipsFrom with a model node as the source", () => {
  it("forwards the source node's actor runtime to the target runtime", async () => {
    setQrAnimationFlags(resolveQrFlags({ options: ["animation"] }));
    const sourceRuntime = { skeletons: () => [], compiledClips: () => new Map() };
    const addClipsFrom = vi.fn(async () => ["Walk"]);
    registerPrd06AnimationActor({ id: "src-node", animation: sourceRuntime } as unknown as TypedGLBActor);
    registerPrd06AnimationActor({ id: "dst-node", animation: { addClipsFrom } } as unknown as TypedGLBActor);
    const api = createPrd06ActorAnimationApi(model("dst-node"));

    await expect(api.addClipsFrom(model("src-node"), { hipsScale: 2 })).resolves.toEqual(["Walk"]);
    await expect(api.addClipsFrom("src-node")).resolves.toEqual(["Walk"]);
    expect(addClipsFrom).toHaveBeenNthCalledWith(1, sourceRuntime, { hipsScale: 2 });
    expect(addClipsFrom).toHaveBeenNthCalledWith(2, sourceRuntime, {});
  });

  it("rejects with ANIMATION_RETARGET_SOURCE_NOT_LOADED instead of baking nothing", async () => {
    setQrAnimationFlags(resolveQrFlags({ options: ["animation"] }));
    registerPrd06AnimationActor({ id: "dst-unloaded", animation: { addClipsFrom: vi.fn() } } as unknown as TypedGLBActor);
    const api = createPrd06ActorAnimationApi(model("dst-unloaded"));
    await expect(api.addClipsFrom(model("never-loaded"))).rejects.toThrow(ANIMATION_RETARGET_SOURCE_NOT_LOADED);
  });

  it("still accepts a {skeleton, clips} pair", async () => {
    setQrAnimationFlags(resolveQrFlags({ options: ["animation"] }));
    const addClipsFrom = vi.fn(async () => []);
    registerPrd06AnimationActor({ id: "dst-pair", animation: { addClipsFrom } } as unknown as TypedGLBActor);
    const pair = { skeleton: {}, clips: new Map() };
    await createPrd06ActorAnimationApi(model("dst-pair")).addClipsFrom(pair);
    expect(addClipsFrom).toHaveBeenCalledWith(pair, {});
  });

  it("retargets the Soldier's Run and Walk onto the Expressive Robot by node handle", async () => {
    setQrAnimationFlags(resolveQrFlags({ options: ["animation"] }));
    const soldier = await loadRuntime("fixtures/threejs-parity/assets/character/soldier.glb");
    const robot = await loadRuntime("fixtures/threejs-parity/assets/character/robot-expressive.glb");
    registerPrd06AnimationActor({ id: "soldier-node", animation: soldier } as unknown as TypedGLBActor);
    registerPrd06AnimationActor({ id: "robot-node", animation: robot } as unknown as TypedGLBActor);
    const api = createPrd06ActorAnimationApi(model("robot-node"));

    const names = await api.addClipsFrom(model("soldier-node"), { hipsScale: "leg-length" });
    expect(names).toEqual(expect.arrayContaining(["Run", "Walk"]));
    // The robot now owns clips it never shipped with, baked onto its own bones.
    const baked = robot.compiledClips().get("Run");
    expect(baked).toBeDefined();
    expect(baked!.tracks.length).toBeGreaterThan(0);
    for (const track of baked!.tracks) for (const value of track.values) expect(Number.isFinite(value)).toBe(true);
    const robotBones = new Set(robot.skeletons()[0]!.jointNames);
    expect(baked!.tracks.every((track) => robotBones.has(track.target.slice(0, track.target.lastIndexOf("."))))).toBe(true);
    expect(robot.skeletons()[0]!.jointNames).not.toContain("mixamorig:Hips");
  });
});
