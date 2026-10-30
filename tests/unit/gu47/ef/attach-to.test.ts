// GU47 WP-6 (E-F) item 3: `attachTo` (emitter option and AuraVfxEffectSpec)
// is honoured by ProductionEffectSystem: the emitter follows a runtime node or
// a bone socket every frame; spawn(spec | kind, { node, socket }) follows too.

import { describe, expect, it } from "vitest";
import type { ParticleBatchHandle, ParticleRenderHook } from "../../../../packages/rendering/src/contracts/particles";
import { effects } from "../../../../packages/engine/src";
import type { EffectNodeLike } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import { ProductionEffectSystem, type AppLike } from "../../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";
import { createAppEffects } from "../../../../packages/engine/src/agent-api/vfx/effects-api";

interface FakeNode { position: [number, number, number]; getWorldPosition(): readonly number[]; animation?: unknown }

function fakeApp(nodes: EffectNodeLike[], registry: Map<string, FakeNode>): { app: AppLike; step(dt: number): void } {
  const callbacks: ((frame: { dt: number }) => void)[] = [];
  return {
    app: {
      scene: { nodes },
      onFrame: (cb) => { callbacks.push(cb); return () => undefined; },
      nodes: { get: (id: string) => registry.get(id) as never }
    },
    step: (dt) => { for (const cb of callbacks) cb({ dt }); }
  };
}

const node = (position: [number, number, number], extra: Partial<FakeNode> = {}): FakeNode => {
  const n: FakeNode = { position, getWorldPosition: () => n.position, ...extra };
  return n;
};

/** Live instance positions (x, y, z) written by feed. */
function positions(system: ProductionEffectSystem): [number, number, number][] {
  const out: [number, number, number][] = [];
  const hook: ParticleRenderHook = {
    upsertBatch: (desc) => ({ key: desc.key }) as unknown as ParticleBatchHandle,
    writeInstances: (_h, data, live) => { for (let i = 0; i < live; i++) out.push([data[i * 16], data[i * 16 + 1], data[i * 16 + 2]]); },
    removeBatch: () => undefined
  };
  system.feed(hook);
  return out;
}

const near = (p: readonly number[], q: readonly number[], r: number): boolean => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= r;

describe("GU47 E-F item 3: attachTo", () => {
  it("a scene emitter follows its node; `position` is the offset from it", () => {
    const hero = node([2, 0, 0]);
    const emitter = effects.particles({ name: "exhaust", attachTo: "hero", position: [0, 1, 0], particleCount: 200, emissionRate: 600, speed: 0, lifetime: [5, 5], gravity: 0, emitter: "ambient", radius: 0.01 }).toJSON() as EffectNodeLike;
    const { app, step } = fakeApp([emitter], new Map([["hero", hero]]));
    const system = new ProductionEffectSystem(app, { tier: "high" });
    step(1 / 60);
    const first = positions(system);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((p) => near(p, [2, 1, 0], 0.2))).toBe(true);
    hero.position = [12, 0, -4];
    step(1 / 60);
    const second = positions(system);
    expect(second.some((p) => near(p, [12, 1, -4], 0.2))).toBe(true);
    expect(second.some((p) => near(p, [2, 1, 0], 0.2))).toBe(true); // older particles stay in world space
    system.dispose();
  });

  it("{ node, socket } follows the actor's bone socket when it resolves", () => {
    const matrix = new Float32Array(16);
    matrix[12] = -3; matrix[13] = 1.5; matrix[14] = 7;
    const actor = node([0, 0, 0], { animation: { socket: (bone: string) => ({ valid: bone === "hand_r", worldMatrix: (out?: Float32Array) => { (out ?? new Float32Array(16)).set(matrix); return out ?? matrix; } }) } });
    const emitter = effects.particles({ name: "spark", attachTo: { node: "fighter", socket: "hand_r" }, particleCount: 50, emissionRate: 300, speed: 0, lifetime: [3, 3], gravity: 0, emitter: "ambient", radius: 0.01 }).toJSON() as EffectNodeLike;
    const { app, step } = fakeApp([emitter], new Map([["fighter", actor]]));
    const system = new ProductionEffectSystem(app, { tier: "high" });
    step(1 / 30);
    const live = positions(system);
    expect(live.length).toBeGreaterThan(0);
    expect(live.every((p) => near(p, [-3, 1.5, 7], 0.2))).toBe(true);
    expect(system.resolveTarget({ node: "fighter", socket: "missing_bone" })).toEqual([0, 0, 0]); // falls back to the node
    system.dispose();
  });

  it("a missing target is reported once and the emitter keeps its last position", () => {
    const registry = new Map<string, FakeNode>([["drone", node([5, 5, 5])]]);
    const emitter = effects.particles({ name: "smoke", attachTo: "drone", particleCount: 100, emissionRate: 300, speed: 0, lifetime: [4, 4], gravity: 0, emitter: "ambient", radius: 0.01 }).toJSON() as EffectNodeLike;
    const { app, step } = fakeApp([emitter], registry);
    const system = new ProductionEffectSystem(app, { tier: "high" });
    step(1 / 60);
    registry.delete("drone");
    step(1 / 60);
    step(1 / 60);
    const live = positions(system);
    expect(live.every((p) => near(p, [5, 5, 5], 0.2))).toBe(true);
    const notes = system.diagnostics.report().errors.filter((e) => e.code === "VFX_ATTACH_TARGET_MISSING");
    expect(notes).toHaveLength(1);
    system.dispose();
  });

  it("spawn(kind, { node }) and a spec's attachTo start at and follow the node instead of the world origin", () => {
    const hero = node([8, 2, -6]);
    const { app: appLike, step } = fakeApp([], new Map([["hero", hero]]));
    const system = new ProductionEffectSystem(appLike, { tier: "high" });
    const fx = createAppEffects({ onFrame: appLike.onFrame } as never, system);
    fx.spawn("dust", { node: "hero" });
    step(1 / 60);
    const burst = positions(system);
    expect(burst.length).toBeGreaterThan(0);
    expect(burst.every((p) => near(p, [8, 2, -6], 1.5))).toBe(true);
    fx.clear();
    const handle = fx.spawn({ name: "aura", layers: [{ type: "emitter" }], attachTo: "hero" }, [0, 1, 0]);
    hero.position = [-4, 0, 3];
    step(1 / 60);
    step(1 / 60);
    const following = positions(system);
    expect(following.some((p) => near(p, [-4, 1, 3], 1))).toBe(true);
    handle.stop();
    system.dispose();
  });
});
