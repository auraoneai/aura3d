/**
 * GU47 E-H (WP-8) item 2: `actor.animation.playLayer(layer, clip, { speed })`
 * forwards `speed` to the PoseMixer layer action as its `timeScale`
 * (`agent-api/app/actorAnimationHandle.ts`).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createPrd06ActorAnimationApi,
  registerPrd06AnimationActor,
  resetActorClipInfoSources,
  resetQrAnimationFlags,
  setQrAnimationFlags
} from "../../../../packages/engine/src/agent-api/app/actorAnimationHandle.js";
import type { AuraRuntimeNodeHandle } from "../../../../packages/engine/src/agent-api/index.js";

interface LayerCall { layer: string; clip: string; options: Record<string, unknown> }

function fakeActor(id: string) {
  const calls: LayerCall[] = [];
  const fades: number[] = [];
  const mixer = {
    playLayer(layer: string, clip: string, options: Record<string, unknown>) {
      calls.push({ layer, clip, options });
      return { fadeIn: (seconds: number) => { fades.push(seconds); } };
    }
  };
  const actor = { id, animation: { mixer: () => mixer }, pipeline: { resources: { scene: { traverse: () => {} } } } };
  return { actor, calls, fades };
}

const handle = (id: string) => ({ kind: "model", id }) as unknown as AuraRuntimeNodeHandle;

describe("GU47 E-H playLayer speed", () => {
  beforeEach(() => {
    resetActorClipInfoSources();
    setQrAnimationFlags({ values: {}, on: (flag: string) => flag === "A3D_QR_ANIMATION" } as never);
  });
  afterEach(() => resetQrAnimationFlags());

  it("forwards speed as the layer action's timeScale", () => {
    const { actor, calls } = fakeActor("runner");
    registerPrd06AnimationActor(actor as never);
    const api = createPrd06ActorAnimationApi(handle("runner"));
    api.playLayer("upper", "Wave", { speed: 2, weight: 0.5 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.layer).toBe("upper");
    expect(calls[0]!.clip).toBe("Wave");
    expect(calls[0]!.options.timeScale).toBe(2);
    expect(calls[0]!.options.weight).toBe(0.5);
  });

  it("speed 0 freezes the layer clip; a non-finite speed reads as 1", () => {
    const { actor, calls } = fakeActor("runner");
    registerPrd06AnimationActor(actor as never);
    const api = createPrd06ActorAnimationApi(handle("runner"));
    api.playLayer("upper", "Wave", { speed: 0 });
    api.playLayer("upper", "Wave", { speed: Number.NaN });
    expect(calls[0]!.options.timeScale).toBe(0);
    expect(calls[1]!.options.timeScale).toBe(1);
  });

  it("omitting speed leaves the mixer default (no timeScale key)", () => {
    const { actor, calls, fades } = fakeActor("runner");
    registerPrd06AnimationActor(actor as never);
    const api = createPrd06ActorAnimationApi(handle("runner"));
    api.playLayer("upper", "Wave", { fadeIn: 0.25 });
    expect("timeScale" in calls[0]!.options).toBe(false);
    expect(fades).toEqual([0.25]);
  });

  it("degrades to the stub (no throw) while the actor has not loaded", () => {
    const api = createPrd06ActorAnimationApi(handle("ghost"));
    expect(api.playLayer("upper", "Wave", { speed: 3 })).toBe(api);
  });
});
