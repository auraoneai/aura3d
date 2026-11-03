import { describe, expect, it, vi } from "vitest";
import { ProceduralVolumeEmitter } from "../../../packages/rendering/src/vfx/ProceduralVolumeEmitter";
import type { ParticleBatchHandle, ParticleRenderHook } from "../../../packages/rendering/src/contracts/particles";
import { effects } from "../../../packages/engine/src/agent-api/nodes/effects.composite";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraGroupNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { lowerEffectNode, type EffectNodeLike } from "../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import { ProductionEffectSystem, type AppLike } from "../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";

const weather = (effect: "rain" | "snow" = "rain"): EffectNodeLike => ({
  ...effects[effect]({ seed: 37, particleCount: 200 }).toJSON(), id: "weather"
});

function reference(node: EffectNodeLike, camera: readonly [number, number, number]): Float32Array {
  const lowered = lowerEffectNode(node);
  if (lowered.type !== "volume") throw new Error("Expected a weather volume.");
  return new ProceduralVolumeEmitter(lowered.volume, lowered.count).instanceData(0, camera).data;
}

function hook() {
  const packets = new Map<string, Float32Array>();
  const upsert = vi.fn((desc: { key: string }) => ({ key: desc.key }) as unknown as ParticleBatchHandle);
  const write = vi.fn((handle: ParticleBatchHandle, data: Float32Array, live: number) => {
    packets.set((handle as unknown as { key: string }).key, data.slice(0, live * 16));
  });
  const render = { upsertBatch: upsert, writeInstances: write, removeBatch: vi.fn() } as unknown as ParticleRenderHook;
  return { packets, upsert, write, render };
}

const appFor = (nodes: readonly EffectNodeLike[]): AppLike => ({
  scene: { nodes }, onFrame: () => () => undefined
});

describe("weather rigid transforms", () => {
  it.each(["rain", "snow"] as const)("keeps the default %s packet exactly camera-centered", (effect) => {
    const node = weather(effect);
    const camera = [3, 4, -2] as const;
    const system = new ProductionEffectSystem(appFor([node]));
    const output = hook();
    try {
      system.atmosphere.noteCamera(camera, [0, 0, -1]);
      system.feed(output.render);
      expect(output.packets.get("eff.vol.weather")).toEqual(reference(node, camera));
    } finally { system.dispose(); }
  });

  it("composes anonymous ancestors, local rotation and pivot while wrapping and fading in local space", () => {
    const node: EffectNodeLike = { ...weather(), position: [2, 0, 0], pivot: [1, 0, 0], rotation: [0, 0, Math.PI / 2] };
    const parent: EffectNodeLike = { kind: "group", position: [4, 3, 0], children: [node] };
    const system = new ProductionEffectSystem(appFor([parent]));
    const output = hook();
    try {
      system.atmosphere.noteCamera([1, 2, 3], [0, 0, -1]);
      system.feed(output.render);
      // Child transform is (x, y, z) -> (7-y, 2+x, z). The inverse puts the camera at (0, 6, 3).
      const local = reference(node, [0, 6, 3]);
      const actual = output.packets.get("eff.vol.weather")!;
      for (let i = 0; i < actual.length; i += 16) {
        expect(actual[i]).toBeCloseTo(7 - local[i + 1], 5);
        expect(actual[i + 1]).toBeCloseTo(2 + local[i], 5);
        expect(actual[i + 2]).toBeCloseTo(local[i + 2], 5);
        expect(actual[i + 3]).toBe(local[i + 3]);
        expect(actual[i + 4]).toBeCloseTo(-local[i + 5], 5);
        expect(actual[i + 5]).toBeCloseTo(local[i + 4], 5);
        expect(actual[i + 6]).toBeCloseTo(local[i + 6], 5);
        expect(actual[i + 11]).toBe(local[i + 11]);
        expect(actual[i + 14]).toBe(local[i + 14]);
      }
    } finally { system.dispose(); }
  });

  it("follows live parent changes and rejects invalid mutations or reparenting before they commit", () => {
    const node = effects.rain({ particleCount: 200, seed: 37 }).runtime({ id: "storm" }).toJSON();
    const parent: AuraGroupNode = { kind: "group", name: "parent", runtime: { id: "parent" }, children: [node] };
    const unsupported: AuraGroupNode = { kind: "group", name: "scaled", runtime: { id: "scaled" }, scale: [2, 1, 1], children: [] };
    const snapshot: AuraSceneSnapshot = { ...scene().toJSON(), nodes: [parent, unsupported] };
    const registry = createAuraRuntimeNodeRegistry(snapshot, { getScene: () => snapshot });
    const system = new ProductionEffectSystem({ scene: snapshot, nodes: registry, onFrame: () => () => undefined } as unknown as AppLike);
    const output = hook();
    try {
      system.feed(output.render);
      const first = output.packets.get("eff.vol.storm")!.slice();
      registry.require("parent").setRotation(0, 0, Math.PI / 2);
      system.feed(output.render);
      const turned = output.packets.get("eff.vol.storm")!.slice();
      expect(turned[0]).toBeCloseTo(-first[1], 5);
      expect(turned[1]).toBeCloseTo(first[0], 5);
      expect(turned[4]).toBeCloseTo(-first[5], 5);
      expect(turned[5]).toBeCloseTo(first[4], 5);
      registry.require("parent").setPosition(3, 4, 0);
      system.feed(output.render);
      expect(output.packets.get("eff.vol.storm")).not.toEqual(turned);
      expect(() => registry.require("parent").setScale(2)).toThrow(/WEATHER_TRANSFORM_UNSUPPORTED/);
      expect(registry.require("parent").scale).toEqual(1);
      expect(() => registry.require("parent").setPosition(Infinity, 0, 0)).toThrow(/WEATHER_TRANSFORM_INVALID/);
      expect(registry.require("parent").position).toEqual([3, 4, 0]);
      expect(() => registry.require("scaled").attach(registry.require("storm"))).toThrow(/WEATHER_TRANSFORM_UNSUPPORTED/);
      system.feed(output.render);
      expect(output.packets.get("eff.vol.storm")).toBeDefined();
    } finally { system.dispose(); registry.dispose(); }
  });

  it("rebinds a replacement scene and follows the new runtime parent", () => {
    const makeSnapshot = (rotation: number): AuraSceneSnapshot => ({
      ...scene().toJSON(),
      nodes: [{ kind: "group", runtime: { id: "parent" }, rotation: [0, 0, rotation],
        children: [effects.snow({ particleCount: 200, seed: 37 }).runtime({ id: "storm" }).toJSON()] }]
    });
    let snapshot = makeSnapshot(0);
    const callbacks = new Set<(frame: { dt: number }) => void>();
    const registry = createAuraRuntimeNodeRegistry(snapshot, { getScene: () => snapshot });
    const app = {
      get scene() { return snapshot; }, nodes: registry,
      onFrame(callback: (frame: { dt: number }) => void) { callbacks.add(callback); return () => { callbacks.delete(callback); }; }
    } as unknown as AppLike;
    const system = new ProductionEffectSystem(app);
    const output = hook();
    try {
      system.feed(output.render);
      const first = output.packets.get("eff.vol.storm")!.slice();
      snapshot = makeSnapshot(Math.PI / 2);
      registry.reset(snapshot);
      for (const callback of [...callbacks]) callback({ dt: 0 });
      system.feed(output.render);
      const next = output.packets.get("eff.vol.storm")!;
      expect(next[0]).toBeCloseTo(-first[1], 5);
      expect(next[1]).toBeCloseTo(first[0], 5);
      expect(next[4]).toBeCloseTo(-first[5], 5);
      expect(next[5]).toBeCloseTo(first[4], 5);
    } finally { system.dispose(); registry.dispose(); }
  });

  it("preserves a pivoted world pose on reparent and applies later Euler rotations", () => {
    const node = effects.rain({ particleCount: 200, pivot: [1, 0, 0], rotation: [0, 0, Math.PI / 2] }).runtime({ id: "storm" }).toJSON();
    const first: AuraGroupNode = { kind: "group", runtime: { id: "first" }, position: [4, 0, 0], children: [node] };
    const second: AuraGroupNode = { kind: "group", runtime: { id: "second" }, position: [-3, 2, 0], children: [] };
    const snapshot: AuraSceneSnapshot = { ...scene().toJSON(), nodes: [first, second] };
    const registry = createAuraRuntimeNodeRegistry(snapshot, { getScene: () => snapshot });
    try {
      const before = registry.atmosphereNodeState(node)!.worldMatrix;
      registry.require("second").attach(registry.require("storm"));
      const after = registry.atmosphereNodeState(node)!.worldMatrix;
      for (let i = 0; i < 16; i++) expect(after[i]).toBeCloseTo(before[i], 5);
      registry.require("storm").setRotation(0, 0, 0);
      const turned = registry.atmosphereNodeState(node)!.worldMatrix;
      expect(turned[0]).toBeCloseTo(1, 5);
      expect(turned[1]).toBeCloseTo(0, 5);
      // The former parent no longer owns weather and can be scaled normally.
      expect(() => registry.require("first").setScale(2)).not.toThrow();
      registry.require("first").visible = false;
      const system = new ProductionEffectSystem({ scene: snapshot, nodes: registry, onFrame: () => () => undefined } as unknown as AppLike);
      const output = hook();
      try {
        system.feed(output.render);
        expect(output.packets.get("eff.vol.storm")!.length).toBeGreaterThan(0);
      } finally { system.dispose(); }
    } finally { registry.dispose(); }
  });

  it("starts and removes initially hidden weather when a live parent changes visibility", () => {
    const node = effects.snow({ particleCount: 200 }).runtime({ id: "storm" }).toJSON();
    const parent = { kind: "group", runtime: { id: "parent" }, visible: false, children: [node] } as AuraGroupNode;
    const snapshot: AuraSceneSnapshot = { ...scene().toJSON(), nodes: [parent] };
    const registry = createAuraRuntimeNodeRegistry(snapshot, { getScene: () => snapshot });
    const app = { scene: snapshot, nodes: registry, onFrame: () => () => undefined } as unknown as AppLike;
    const system = new ProductionEffectSystem(app);
    system.bindRuntimeOwner(app, {});
    try {
      expect(system.emitterIds()).not.toContain("storm");
      registry.require("parent").visible = true;
      expect(system.emitterIds()).toContain("storm");
      registry.require("parent").visible = false;
      expect(system.emitterIds()).not.toContain("storm");
    } finally { system.dispose(); registry.dispose(); }
  });

  it("rejects unsupported authored ancestry and attachment during preflight", () => {
    const node = weather();
    expect(() => new ProductionEffectSystem(appFor([{ kind: "group", scale: [1, 2, 1], children: [node] }]))).toThrow(/WEATHER_TRANSFORM_UNSUPPORTED/);
    expect(() => new ProductionEffectSystem(appFor([{ kind: "group", lookAt: [0, 0, 0], children: [node] }]))).toThrow(/WEATHER_TRANSFORM_UNSUPPORTED/);
    expect(() => new ProductionEffectSystem(appFor([{ ...node, attachTo: "other" }]))).toThrow(/WEATHER_TRANSFORM_UNSUPPORTED/);
  });

  it.each([
    [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0.5, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    [NaN, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  ])("rejects invalid live matrices before updating the render hook", (...components) => {
    let matrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const node = weather();
    const app: AppLike = {
      ...appFor([node]),
      nodes: { get: () => undefined, atmosphereNodeState: () => ({ visible: true, worldPosition: [0, 0, 0], worldMatrix: matrix }) }
    };
    const system = new ProductionEffectSystem(app);
    const output = hook();
    try {
      system.feed(output.render);
      const before = output.packets.get("eff.vol.weather")!.slice();
      matrix = new Float32Array(components);
      expect(() => system.feed(output.render)).toThrow(/WEATHER_TRANSFORM_/);
      expect(output.upsert).toHaveBeenCalledTimes(1);
      expect(output.write).toHaveBeenCalledTimes(1);
      expect(output.packets.get("eff.vol.weather")).toEqual(before);
    } finally { system.dispose(); }
  });
});
