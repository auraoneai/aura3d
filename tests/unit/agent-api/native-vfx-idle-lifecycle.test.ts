import { describe, expect, it, vi } from "vitest";
import {
  ProductionEffectSystem,
  type AppLike
} from "../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";
import type { EffectNodeLike } from "../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";

type Frame = (frame: { dt: number }) => void;

function managedHarness(initial: readonly EffectNodeLike[] = []) {
  const callbacks = new Set<Frame>();
  const sceneListeners = new Set<() => void>();
  let snapshot = { nodes: initial, version: 0 };
  let effectiveNodes = initial;
  let topologyVersion = 0;
  let subscriptions = 0;
  let unsubscriptions = 0;
  const app: AppLike = {
    get scene() { return snapshot; },
    onFrame(callback) {
      subscriptions += 1;
      callbacks.add(callback);
      return () => { if (callbacks.delete(callback)) unsubscriptions += 1; };
    },
    nodes: {
      get version() { return topologyVersion; },
      get: () => undefined,
      onSceneChange(listener) {
        sceneListeners.add(listener);
        return () => { sceneListeners.delete(listener); };
      },
      // The real registry returns a fresh root array on every call.
      sceneWithRuntimeAdditions: () => ({ nodes: [...effectiveNodes] })
    }
  };
  const system = new ProductionEffectSystem(app, { tier: "high" });
  const owner = {};
  system.bindRuntimeOwner(app, owner);
  return {
    app, system, callbacks, sceneListeners,
    get subscriptions() { return subscriptions; },
    get unsubscriptions() { return unsubscriptions; },
    frame(dt = 1 / 60) { for (const callback of [...callbacks]) callback({ dt }); },
    replace(nodes: readonly EffectNodeLike[]) {
      snapshot = { nodes, version: snapshot.version + 1 };
      effectiveNodes = nodes;
      topologyVersion += 1;
      for (const listener of [...sceneListeners]) listener();
    },
    setRuntimeTopology(nodes: readonly EffectNodeLike[]) {
      effectiveNodes = nodes;
      topologyVersion += 1;
      for (const listener of [...sceneListeners]) listener();
    }
  };
}

const particles = (id: string, overrides: Partial<EffectNodeLike> = {}): EffectNodeLike => ({
  kind: "effect", effect: "particles", id, particleCount: 3, emissionRate: 0,
  burst: 3, lifetime: [0.05, 0.05], speed: 0, gravity: 0, ...overrides
});

describe("managed VFX frame demand", () => {
  it("lets an empty managed system become idle without disposing its owner or authority", () => {
    const h = managedHarness();
    const onDispose = vi.fn();
    const offDispose = h.system.onDispose(onDispose);
    try {
      // Initial managed scene ingestion can request the first frame.
      h.frame(0);
      expect(h.callbacks.size).toBe(0);
      expect(h.sceneListeners.size).toBe(1);
      expect(onDispose).not.toHaveBeenCalled();
      expect(h.system.captureAtmosphereSnapshot()).not.toBeNull();
      expect(h.subscriptions).toBe(h.unsubscriptions);
    } finally { offDispose(); h.system.dispose(); }
    expect(h.callbacks.size).toBe(0);
    expect(h.sceneListeners.size).toBe(0);
  });

  it("wakes for a runtime burst, advances it, then releases the callback after it expires", () => {
    const h = managedHarness();
    try {
      h.frame(0);
      expect(h.callbacks.size).toBe(0);
      h.system.addInstance("burst", particles("burst"));
      expect(h.callbacks.size).toBe(1);
      expect(h.system.liveCount()).toBe(3);
      h.frame(0.02);
      expect(h.callbacks.size).toBe(1);
      h.frame(0.1);
      expect(h.system.instanceAlive("burst")).toBe(false);
      expect(h.callbacks.size).toBe(0);
      expect(h.subscriptions).toBe(h.unsubscriptions);
    } finally { h.system.dispose(); }
  });

  it("retains continuous effects and clears scene-owned emitters on scene replacement", () => {
    const h = managedHarness([particles("scene-emitter", { burst: 0, emissionRate: 30 })]);
    try {
      h.frame(0.1);
      expect(h.system.emitterIds()).toContain("scene-emitter");
      expect(h.system.liveCount()).toBeGreaterThan(0);
      expect(h.callbacks.size).toBe(1);
      h.replace([]);
      h.frame(0);
      expect(h.system.emitterIds()).not.toContain("scene-emitter");
      // A scene change may have requested a final frame while reconciling.
      h.frame(0);
      expect(h.callbacks.size).toBe(0);
    } finally { h.system.dispose(); }
  });

  it("wakes for registry-only additions and retires them on removal without restarting every frame", () => {
    const h = managedHarness();
    const runtimeParticle = (id: string): EffectNodeLike => ({
      kind: "effect", effect: "particles", name: "fountain particle system", runtime: { id }, particleCount: 30,
      emissionRate: 30, burst: 0, lifetime: [1, 1], speed: 0, gravity: 0
    } as EffectNodeLike);
    const first = runtimeParticle("runtime-first");
    const second = runtimeParticle("runtime-second");
    try {
      h.frame(0);
      expect(h.callbacks.size).toBe(0);
      h.setRuntimeTopology([first]);
      h.frame(0.1);
      const beforeAddition = h.system.liveCount();
      expect(beforeAddition).toBeGreaterThan(0);
      h.setRuntimeTopology([first, second]);
      expect(h.system.emitterIds()).toEqual(expect.arrayContaining(["runtime-first", "runtime-second"]));
      expect(h.system.liveCount()).toBe(beforeAddition);
      expect(h.callbacks.size).toBe(1);
      h.frame(0.1);
      const afterFirst = h.system.liveCount();
      expect(afterFirst).toBeGreaterThan(0);
      h.frame(0.1);
      expect(h.system.liveCount()).toBeGreaterThan(afterFirst);
      h.setRuntimeTopology([second]);
      expect(h.system.emitterIds()).not.toContain("runtime-first");
      expect(h.system.emitterIds()).toContain("runtime-second");
      expect(h.system.liveCount()).toBeGreaterThan(0);
      h.setRuntimeTopology([]);
      h.frame(0);
      h.frame(0);
      expect(h.system.emitterIds()).toHaveLength(0);
      expect(h.callbacks.size).toBe(0);
    } finally { h.system.dispose(); }
  });

  it("preserves mesh-particle simulation when an unrelated runtime node is added or removed", () => {
    const h = managedHarness();
    const mesh = {
      kind: "effect", effect: "meshParticles", name: "mesh particles", runtime: { id: "mesh" }, particleCount: 2
    } as EffectNodeLike;
    const unrelated: EffectNodeLike = { kind: "primitive", id: "unrelated" };
    try {
      h.frame(0);
      h.setRuntimeTopology([mesh]);
      h.frame(0.2);
      const batch = h.system.meshFeed()[0]!.batch;
      const before = new Float32Array(batch.capacity * 23);
      expect(batch.instanceData(before)).toBe(2);
      h.setRuntimeTopology([mesh, unrelated]);
      expect(h.system.meshFeed()[0]!.batch).toBe(batch);
      const after = new Float32Array(batch.capacity * 23);
      batch.instanceData(after);
      expect(after).toEqual(before);
      h.frame(0.1);
      h.setRuntimeTopology([mesh]);
      expect(h.system.meshFeed()[0]!.batch).toBe(batch);
      h.setRuntimeTopology([]);
      h.frame(0);
      h.frame(0);
      expect(h.system.meshFeed()).toHaveLength(0);
      expect(h.callbacks.size).toBe(0);
    } finally { h.system.dispose(); }
  });

  it("keeps animated aurora active and sleeps after its scene node is removed", () => {
    const h = managedHarness([{ kind: "effect", effect: "auroraRibbon", id: "aurora", sway: 0, shimmer: 0 }]);
    try {
      h.frame(0);
      expect(h.callbacks.size).toBe(1);
      h.replace([]);
      h.frame(0);
      h.frame(0);
      expect(h.callbacks.size).toBe(0);
    } finally { h.system.dispose(); }
  });

  it("advances and removes a finite decal while allowing a permanent decal to idle", () => {
    const h = managedHarness();
    try {
      h.frame(0);
      h.system.addInstance("finite", { kind: "effect", effect: "decal", id: "finite", decal: { lifetime: 0.1 } });
      h.frame(0.05);
      const batch = h.system.decalFeed();
      expect(batch.has("runtime-decal.finite")).toBe(true);
      // Renderer frame time and VFX simulation time have different origins.
      batch.buildAll(100_000);
      expect(batch.has("runtime-decal.finite")).toBe(true);
      expect(h.callbacks.size).toBe(1);
      h.frame(0.06);
      expect(h.system.instanceAlive("finite")).toBe(false);
      expect(h.system.decalFeed().has("runtime-decal.finite")).toBe(false);
      expect(h.callbacks.size).toBe(0);
      h.system.addInstance("permanent", { kind: "effect", effect: "decal", id: "permanent", decal: {} });
      h.frame(0);
      expect(h.system.instanceAlive("permanent")).toBe(true);
      expect(h.callbacks.size).toBe(0);
    } finally { h.system.dispose(); }
  });

  it("continues following and fading a trail, then wakes again for a flash", () => {
    const h = managedHarness();
    try {
      h.frame(0);
      h.system.addTrail("trail", undefined, { width: 0.3, life: 0.1 });
      h.system.trailPush("trail", [0, 0, 0]);
      expect(h.callbacks.size).toBe(1);
      h.frame(0.05);
      h.system.stopTrail("trail");
      h.frame(0.2);
      expect(h.system.trailInfo("trail")).toBeNull();
      expect(h.callbacks.size).toBe(0);
      expect(h.system.flashLight({ position: [0, 0, 0], color: [1, 1, 1], intensity: 1, duration: 0.1 })).toBe(true);
      expect(h.callbacks.size).toBe(1);
      h.frame(0.2);
      expect(h.system.collectedLights()).toHaveLength(0);
      expect(h.callbacks.size).toBe(0);
    } finally { h.system.dispose(); }
  });

  it("wakes and continues for an atmosphere transition, then sleeps after its final frame", () => {
    const fog: EffectNodeLike = { kind: "effect", effect: "fog", density: 0.2, color: "#446688" };
    const h = managedHarness([fog]);
    try {
      h.frame(0);
      expect(h.callbacks.size).toBe(0);
      h.system.atmosphere.setFog({ density: 0.8 }, { transitionSeconds: 1 });
      expect(h.callbacks.size).toBe(1);
      h.frame(0.5);
      expect(h.system.captureAtmosphereSnapshot()!.fog?.density).toBeCloseTo(0.5);
      expect(h.callbacks.size).toBe(1);
      h.frame(0.6);
      expect(h.system.captureAtmosphereSnapshot()!.fog?.density).toBeCloseTo(0.8);
      h.frame(0);
      expect(h.callbacks.size).toBe(0);
    } finally { h.system.dispose(); }
  });

  it("keeps drifting sky clouds active and sleeps when cloud drift is disabled", () => {
    const h = managedHarness();
    try {
      h.frame(0);
      h.system.atmosphere.setSky({ model: "gradient", zenith: "#123456", horizon: "#abcdef", clouds: { coverage: 0.5 } });
      h.frame(0);
      expect(h.callbacks.size).toBe(1);
      h.system.atmosphere.setSky({ model: "gradient", zenith: "#123456", horizon: "#abcdef", clouds: { coverage: 0.5, speed: 0 } });
      h.frame(0);
      h.frame(0);
      expect(h.callbacks.size).toBe(0);
    } finally { h.system.dispose(); }
  });

  it("checks cloud activity from the staged snapshot without reentering authored getters", () => {
    const h = managedHarness();
    let coverageReads = 0;
    let reenter = false;
    const clouds = {
      get coverage() {
        coverageReads += 1;
        if (reenter) h.system.atmosphere.setWetness(0.9);
        return 0.5;
      },
      speed: 1
    };
    try {
      h.frame(0);
      h.system.atmosphere.setSky({ model: "gradient", zenith: "#123456", horizon: "#abcdef", clouds });
      const stagedReads = coverageReads;
      expect(stagedReads).toBeGreaterThan(0);
      reenter = true;
      h.frame(0.02);
      h.frame(0.02);
      expect(h.callbacks.size).toBe(1);
      expect(coverageReads).toBe(stagedReads);
      expect(h.system.atmosphere.state().wetness).toBe(0);
    } finally { h.system.dispose(); }
  });

  it("does not schedule or retain callbacks after disposal", () => {
    const h = managedHarness();
    h.frame(0);
    const stale = [...h.sceneListeners];
    h.system.dispose();
    h.system.addInstance("after", particles("after"));
    h.system.addTrail("after-trail", undefined, { width: 1, life: 1 });
    expect(h.system.flashLight({ position: [0, 0, 0], color: [1, 1, 1], intensity: 1 })).toBe(false);
    for (const listener of stale) listener();
    expect(h.callbacks.size).toBe(0);
    expect(h.sceneListeners.size).toBe(0);
    expect(h.system.liveCount()).toBe(0);
    h.system.dispose();
  });

  it("keeps the conservative subscription for hosts without scene-change notifications", () => {
    const callbacks = new Set<Frame>();
    const app: AppLike = { scene: { nodes: [] }, onFrame: (callback) => { callbacks.add(callback); return () => { callbacks.delete(callback); }; } };
    const system = new ProductionEffectSystem(app);
    try {
      expect(callbacks.size).toBe(1);
      for (const callback of [...callbacks]) callback({ dt: 0 });
      expect(callbacks.size).toBe(1);
    } finally { system.dispose(); }
    expect(callbacks.size).toBe(0);
  });
});
