// GU47 WP-6 (E-F) item 2: `effects.flipbook({ texture })` samples a typed
// texture asset sheet; `sprite` names a built-in atlas sequence; the default
// procedural fireball sheet is unchanged.

import { describe, expect, it } from "vitest";
import type { ParticleBatchDescriptor, ParticleBatchHandle, ParticleRenderHook } from "../../../../packages/rendering/src/contracts/particles";
import { effects } from "../../../../packages/engine/src";
import { lowerEffectNode, type EffectNodeLike } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import type { VfxSpriteLoader } from "../../../../packages/engine/src/production-runtime/effects/FlipbookAtlas";
import { ProductionEffectSystem, type AppLike } from "../../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";

const sheet = { kind: "aura-asset-ref", type: "texture", id: "smokeSheet", url: "/assets/smoke-sheet-4x2.png" } as never;

function fakeApp(nodes: EffectNodeLike[]): { app: AppLike; step(dt: number): void } {
  const callbacks: ((frame: { dt: number }) => void)[] = [];
  return {
    app: { scene: { nodes }, onFrame: (cb) => { callbacks.push(cb); return () => undefined; } },
    step: (dt) => { for (const cb of callbacks) cb({ dt }); }
  };
}

function recordingHook(): ParticleRenderHook & { descs: ParticleBatchDescriptor[]; data: Map<string, { data: Float32Array; live: number }> } {
  const descs: ParticleBatchDescriptor[] = [];
  const data = new Map<string, { data: Float32Array; live: number }>();
  return {
    descs,
    data,
    upsertBatch: (desc) => { descs.push(desc); return { key: desc.key } as unknown as ParticleBatchHandle; },
    writeInstances: (handle, values, live) => { data.set((handle as unknown as { key: string }).key, { data: values.slice(0, live * 16), live }); },
    removeBatch: () => undefined
  };
}

const loader = (calls: { url: string; rect: readonly number[] | null }[]): VfxSpriteLoader => async (url, rect) => {
  calls.push({ url, rect });
  const [, , w, h] = rect ?? [0, 0, 512, 256];
  return { width: w, height: h, data: new Uint8Array(w * h * 4).fill(255) };
};

describe("GU47 E-F item 2: flipbook({ texture })", () => {
  it("the builder records the texture asset; lowering samples it on the spriteColumns × spriteRows grid", () => {
    const node = effects.flipbook({ name: "smoke", texture: sheet, spriteColumns: 4, spriteRows: 2, frameRate: 12 }).toJSON() as EffectNodeLike;
    expect((node as { texture?: unknown }).texture).toBe(sheet);
    const lowered = lowerEffectNode(node);
    if (lowered.type !== "emitter") throw new Error("expected an emitter");
    expect(lowered.sprite).toEqual({ kind: "texture", url: "/assets/smoke-sheet-4x2.png", columns: 4, rows: 2, frames: 8, frame: 0 });
    expect(lowered.batch.atlasKey).toBe("tex:/assets/smoke-sheet-4x2.png:4x2");
    expect(lowered.emitter.flipbook).toMatchObject({ frames: 8, frameRate: 12, loop: true, columns: 4, rows: 2 });
  });

  it("a URL string works as the texture too", () => {
    const lowered = lowerEffectNode(effects.flipbook({ texture: "/fx/burst.png", spriteColumns: 2, spriteRows: 2 }).toJSON() as EffectNodeLike);
    if (lowered.type !== "emitter") throw new Error("expected an emitter");
    expect(lowered.sprite).toMatchObject({ kind: "texture", url: "/fx/burst.png", frames: 4 });
  });

  it("a built-in sprite name uses that sequence and its grid", () => {
    const lowered = lowerEffectNode(effects.flipbook({ name: "torch", sprite: "flame-loop" }).toJSON() as EffectNodeLike);
    if (lowered.type !== "emitter") throw new Error("expected an emitter");
    expect(lowered.sprite).toMatchObject({ kind: "builtin", name: "flame-loop", columns: 4, rows: 1, frames: 4 });
    expect(lowered.emitter.flipbook).toMatchObject({ frames: 4, columns: 4, rows: 1 });
    expect(lowered.batch.atlasKey).toBe("vfx:flame-loop");
  });

  it("without texture or sprite the procedural fireball sheet is unchanged", () => {
    const lowered = lowerEffectNode(effects.flipbook({ name: "boom", seed: 7 }).toJSON() as EffectNodeLike);
    if (lowered.type !== "emitter") throw new Error("expected an emitter");
    expect(lowered.sprite).toBeUndefined();
    expect(lowered.batch.atlasKey).toBe("flipbook.4x4.7");
    expect(lowered.emitter.key).toBe("eff.alpha.flipbook.4x4.7.0.0.0");
  });

  it("the system samples the loaded sheet (straight alpha, grid) and keeps the flipbook frame", async () => {
    const calls: { url: string; rect: readonly number[] | null }[] = [];
    const node = effects.flipbook({ name: "smoke", texture: sheet, spriteColumns: 4, spriteRows: 2, frameRate: 10 }).toJSON() as EffectNodeLike;
    const { app, step } = fakeApp([node]);
    const system = new ProductionEffectSystem(app, { tier: "high", spriteLoader: loader(calls) });
    const hook = recordingHook();
    step(0.35);
    system.feed(hook);
    expect(hook.descs[0].atlas.width).toBe(1); // soft-dot while the sheet loads, never the fireball
    await system.spritesSettled();
    expect(calls).toEqual([{ url: "/assets/smoke-sheet-4x2.png", rect: null }]);
    system.feed(hook);
    const desc = hook.descs[hook.descs.length - 1];
    expect(desc.atlas.width).toBe(512);
    expect(desc.atlasGrid).toEqual([4, 2]);
    expect(desc.atlasStraightAlpha).toBe(true);
    expect(desc.frameBlend).toBe(true);
    const written = [...hook.data.values()][0];
    expect(written.live).toBe(1);
    expect(written.data[13]).toBeCloseTo(3.5, 3); // age 0.35 s · 10 fps, wrapping over 8 frames
    system.dispose();
  });

  it("a default flipbook still samples the procedural fireball sheet", () => {
    const node = effects.flipbook({ name: "boom", seed: 3 }).toJSON() as EffectNodeLike;
    const { app, step } = fakeApp([node]);
    const system = new ProductionEffectSystem(app, { tier: "high", spriteLoader: loader([]) });
    step(0.1);
    const hook = recordingHook();
    system.feed(hook);
    expect(hook.descs[0].atlas.label).toContain("a3d-flipbook-fireball-4x4:3");
    expect(hook.descs[0].atlasGrid).toEqual([4, 4]);
    expect(system.spriteStatus()).toEqual({});
    system.dispose();
  });
});
