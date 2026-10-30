import { afterEach, describe, expect, it } from "vitest";
import { Prd03PostSurface, createRootPostPipeline, resetRuntimePostOverrides } from "../../../../packages/engine/src/agent-api/postBridge";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";

// GU47 pass 4 (g19): `ambientOcclusion` and `filmGrain` are runtime post effects, so a governor can drop them.
const FLAGS = { on: () => true } as never;
const scene = (...nodes: { toJSON(): unknown }[]) => ({ nodes: nodes.map((n) => n.toJSON()) }) as never;
const derive = (snapshot: never, target: HTMLCanvasElement) =>
  createRootPostPipeline(snapshot, { near: 0.1, far: 100 }, undefined, QUALITY_TIERS.high, [], undefined, target).options as Record<string, any>;

afterEach(() => resetRuntimePostOverrides());

describe("runtime AO and film grain (pass 4)", () => {
  it("drops and restores both without a rebuild, and patches their fields", () => {
    const canvas = {} as HTMLCanvasElement;
    const snapshot = scene(effects.ambientOcclusion({ intensity: 0.8 }), effects.filmGrain({ intensity: 0.06 }));
    const post = new Prd03PostSurface(FLAGS, canvas);
    const before = derive(snapshot, canvas);
    const keys = Object.keys(before);
    const aoKey = keys.find((k) => /ambient|ao|gtao/i.test(k) && before[k]);
    const grainKey = keys.find((k) => /grain/i.test(k) && before[k]);
    expect(aoKey, keys.join(",")).toBeDefined();
    expect(grainKey, keys.join(",")).toBeDefined();
    post.setEffectEnabled("ambientOcclusion", false);
    post.setEffectEnabled("filmGrain", false);
    const off = derive(snapshot, canvas);
    expect(off[aoKey!] ?? false).toBeFalsy();
    expect(off[grainKey!] ?? false).toBeFalsy();
    post.setEffectEnabled("ambientOcclusion", true);
    post.setEffectEnabled("filmGrain", true);
    post.setEffect("filmGrain", { intensity: 0.02 });
    const on = derive(snapshot, canvas);
    expect(on[aoKey!]).toBeTruthy();
    expect(JSON.stringify(on[grainKey!])).not.toBe(JSON.stringify(before[grainKey!]));
  });
});
