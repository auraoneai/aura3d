// 5.7.0: `effects.flipbook({ texture })` accepts a live texture handle such as
// `createFlipbookAtlas(kind).texture` with no `as never` cast (it was TS2322),
// and the particle pass samples that handle's sheet. Before 5.7.0 the cast
// compiled but lowering found no URL on the handle and drew the procedural
// fireball instead of the atlas.

import { describe, expect, it } from "vitest";
import type { ParticleBatchDescriptor, ParticleBatchHandle, ParticleRenderHook } from "../../../../packages/rendering/src/contracts/particles";
import { effects } from "../../../../packages/engine/src";
import { createFlipbookAtlas } from "../../../../packages/game/src/feel/index";
import { lowerEffectNode, type EffectNodeLike } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import { ProductionEffectSystem, type AppLike } from "../../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";

function fakeApp(nodes: EffectNodeLike[]): { app: AppLike; step(dt: number): void } {
  const callbacks: ((frame: { dt: number }) => void)[] = [];
  return {
    app: { scene: { nodes }, onFrame: (cb) => { callbacks.push(cb); return () => undefined; } },
    step: (dt) => { for (const cb of callbacks) cb({ dt }); }
  };
}

function recordingHook(): ParticleRenderHook & { descs: ParticleBatchDescriptor[] } {
  const descs: ParticleBatchDescriptor[] = [];
  return {
    descs,
    upsertBatch: (desc) => { descs.push(desc); return { key: desc.key } as unknown as ParticleBatchHandle; },
    writeInstances: () => undefined,
    removeBatch: () => undefined
  };
}

describe("5.7.0 effects.flipbook({ texture: createFlipbookAtlas().texture })", () => {
  it("type-checks without a cast and lowers to the handle's sheet on the atlas grid", () => {
    const sparks = createFlipbookAtlas("sparks", [255, 206, 112]);
    // No `as never`: the sharded typecheck covers this line.
    const node = effects.flipbook({ name: "sparks", texture: sparks.texture, spriteColumns: sparks.columns, spriteRows: sparks.rows, frameRate: 30 }).toJSON() as EffectNodeLike;
    const lowered = lowerEffectNode(node);
    if (lowered.type !== "emitter") throw new Error("expected an emitter");
    expect(lowered.sprite).toMatchObject({ kind: "texture", url: `aura-texture-ref:${sparks.texture.id}`, columns: 8, rows: 4, frames: 32, frame: 0 });
    expect(lowered.sprite && lowered.sprite.kind === "texture" ? lowered.sprite.ref : undefined).toBe(sparks.texture);
    expect(lowered.batch.atlasKey).toBe(`tex:aura-texture-ref:${sparks.texture.id}:8x4`);
    expect(lowered.emitter.flipbook).toMatchObject({ frames: 32, frameRate: 30, columns: 8, rows: 4 });
  });

  it("the system samples the handle's texture at once (no load, straight alpha), never the fireball", () => {
    const dust = createFlipbookAtlas("dust");
    const node = effects.flipbook({ name: "dust", texture: dust.texture, spriteColumns: dust.columns, spriteRows: dust.rows }).toJSON() as EffectNodeLike;
    const { app, step } = fakeApp([node]);
    const system = new ProductionEffectSystem(app, { tier: "high", spriteLoader: async () => { throw new Error("a live handle must not be fetched"); } });
    step(0.1);
    const hook = recordingHook();
    system.feed(hook);
    const desc = hook.descs[0];
    expect(desc.atlas).toBe(dust.texture.texture);
    expect(desc.atlas.width).toBe(384);
    expect(desc.atlas.height).toBe(192);
    expect(desc.atlasGrid).toEqual([8, 4]);
    expect(desc.atlasStraightAlpha).toBe(true);
    expect(system.spriteStatus()).toEqual({});
    system.dispose();
  });

  it("a disposed handle draws the soft-dot instead of a dead texture", () => {
    const ink = createFlipbookAtlas("ink");
    ink.texture.dispose();
    const node = effects.flipbook({ name: "ink", texture: ink.texture, spriteColumns: ink.columns, spriteRows: ink.rows }).toJSON() as EffectNodeLike;
    const { app, step } = fakeApp([node]);
    const system = new ProductionEffectSystem(app, { tier: "high" });
    step(0.1);
    const hook = recordingHook();
    system.feed(hook);
    expect(hook.descs[0].atlas.width).toBe(1);
    system.dispose();
  });
});
