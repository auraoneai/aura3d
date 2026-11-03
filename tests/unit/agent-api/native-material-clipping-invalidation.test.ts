import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuraApp } from "../../../packages/engine/src/public/index";
import { createAuraRuntimeNodeRegistry, runtimeNodeEffectiveVisibility, runtimeNodeHandleForSceneNode } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { clipping } from "../../../packages/engine/src/agent-api/nodes/clipping";
import { effects } from "../../../packages/engine/src/agent-api/nodes/effects.composite";
import { groups } from "../../../packages/engine/src/agent-api/nodes/groups";
import { material } from "../../../packages/engine/src/agent-api/nodes/material";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { prd07SystemFor } from "../../../packages/engine/src/agent-api/vfx/effects-api";
import { bindRuntimeCompiled, type CompiledScene, type RuntimeCompiledSceneInternals } from "../../../packages/engine/src/contracts/compiler";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { flattenNodesWithLineWorldMatrices } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import type { AuraMaterialSpec, AuraRuntimeNodeHandle, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";

const snapshot = (id = "box"): AuraSceneSnapshot => scene()
  .add(primitives.box().runtime({ id }))
  .toJSON() as AuraSceneSnapshot;
const materialOf = (handle: AuraRuntimeNodeHandle): AuraMaterialSpec | undefined =>
  (handle.snapshot() as { readonly material?: AuraMaterialSpec }).material;

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style = {}; dataset = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("runtime material change notifications", () => {
  it("publishes the committed material to independent subscribers and isolates errors", () => {
    const registry = createAuraRuntimeNodeRegistry(snapshot());
    const handle = registry.require("box");
    const group = clipping.material({ planes: [[1, 0, 0, 0]] });
    const next = material.pbr({ color: "#ffffff", clipping: group });
    const seen: Array<AuraMaterialSpec | undefined> = [];
    const observe = () => { seen.push(materialOf(handle)); };
    registry.onChange(() => { throw new Error("observer failure"); });
    const releaseFirst = registry.onChange(observe);
    const releaseSecond = registry.onChange(observe);

    expect(handle.setMaterial(next)).toBe(handle);
    expect(seen).toEqual([next, next]);
    releaseFirst();
    releaseFirst();
    handle.setMaterial(next); // Reapplying a mutable spec is still a change signal.
    expect(seen).toEqual([next, next, next]);
    handle.setPosition(1, 2, 3);
    expect(seen).toHaveLength(3);
    releaseSecond();
    handle.setMaterial(material.pbr({ color: "#000000" }));
    expect(seen).toHaveLength(3);
    registry.dispose();
  });

  it("publishes add, remove and reset only after registry topology changes", () => {
    const registry = createAuraRuntimeNodeRegistry(snapshot());
    const observed: Array<readonly string[]> = [];
    registry.onChange(() => { observed.push(registry.ids()); });
    const added = registry.add(primitives.sphere().runtime({ id: "added" }));
    expect(observed).toEqual([["box", "added"]]);
    expect(registry.remove("missing")).toBe(false);
    expect(observed).toHaveLength(1);
    expect(registry.remove("added")).toBe(true);
    expect(observed).toEqual([["box", "added"], ["box"]]);
    added.setMaterial(material.pbr({ color: "#ffffff" }));
    expect(observed).toHaveLength(2);
    const previous = registry.require("box");
    registry.reset(snapshot("replacement"));
    expect(observed).toEqual([["box", "added"], ["box"], ["replacement"]]);
    previous.setMaterial(material.pbr({ color: "#ff0000" }));
    expect(observed).toHaveLength(3);
    registry.dispose();
  });

  it("queues reentrant changes and stops calling a released subscription", () => {
    const registry = createAuraRuntimeNodeRegistry(snapshot());
    const handle = registry.require("box");
    const events: string[] = [];
    const second = material.pbr({ color: "#00ff00" });
    let release: () => void = () => {};
    registry.onChange(() => {
      events.push("first");
      if (events.length === 1) {
        release();
        handle.setMaterial(second);
      }
    });
    release = registry.onChange(() => { events.push("released"); });
    registry.onChange(() => { events.push("last"); });
    handle.setMaterial(material.pbr({ color: "#ffffff" }));
    expect(events).toEqual(["first", "last", "first", "last"]);
    expect(materialOf(handle)).toBe(second);
    registry.dispose();
  });

  it("publishes one completed change when the legacy path resets during add or removal", () => {
    let current = snapshot();
    const registry = createAuraRuntimeNodeRegistry(current);
    registry.configure({ getScene: () => current, setScene: (next) => { current = next; registry.reset(next); } });
    const observed: Array<readonly string[]> = [];
    registry.onChange(() => { observed.push(registry.ids()); });
    registry.add(primitives.sphere().runtime({ id: "added" }));
    registry.remove("added");
    expect(observed).toEqual([["box", "added"], ["box"]]);
    registry.dispose();
  });

  it("notifies for an anonymous child edited through a live group traversal", () => {
    const source = scene().add(groups.create("parent", [primitives.box({ name: "child" })]).runtime({ id: "parent" })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(source);
    const next = material.pbr({ color: "#ffffff" });
    const changed = vi.fn();
    registry.onChange(changed);
    let staleChild: AuraRuntimeNodeHandle | undefined;
    registry.require("parent").traverse((node) => {
      if (node.name === "child") { staleChild = node; node.setMaterial(next); }
    });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(source.nodes[0]?.kind === "group" && source.nodes[0].children[0]?.kind === "primitive" && source.nodes[0].children[0].material).toBe(next);
    registry.remove("parent");
    expect(changed).toHaveBeenCalledTimes(2);
    staleChild!.setMaterial(material.pbr({ color: "#000000" }));
    expect(changed).toHaveBeenCalledTimes(2);
    registry.dispose();
  });

  it("does not notify from a traversed child after that child is removed", () => {
    const source = scene().add(groups.create("parent", [primitives.box({ name: "child" }).runtime({ id: "child" })])
      .runtime({ id: "parent" })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(source);
    const changed = vi.fn();
    registry.onChange(changed);
    const children: AuraRuntimeNodeHandle[] = [];
    registry.require("parent").traverse((node) => { if (node.id === "child") children.push(node); });
    expect(children.length).toBeGreaterThan(0);
    const child = children.at(-1)!;
    child.setMaterial(material.pbr({ color: "#ffffff" }));
    expect(changed).toHaveBeenCalledTimes(1);
    registry.remove("child");
    expect(changed).toHaveBeenCalledTimes(2);
    child.setMaterial(material.pbr({ color: "#000000" }));
    expect(changed).toHaveBeenCalledTimes(2);
    registry.dispose();
  });

  it("keeps app registries isolated and retires listeners on disposal", () => {
    const first = createAuraRuntimeNodeRegistry(snapshot());
    const second = createAuraRuntimeNodeRegistry(snapshot());
    const firstChanged = vi.fn(), secondChanged = vi.fn();
    first.onChange(firstChanged);
    second.onChange(secondChanged);
    const retired = first.require("box");
    retired.setMaterial(material.pbr({ color: "#ffffff" }));
    expect(firstChanged).toHaveBeenCalledTimes(1);
    expect(secondChanged).not.toHaveBeenCalled();
    first.dispose();
    retired.setMaterial(material.pbr({ color: "#000000" }));
    first.onChange(firstChanged)();
    expect(firstChanged).toHaveBeenCalledTimes(1);
    second.require("box").setMaterial(material.pbr({ color: "#000000" }));
    expect(secondChanged).toHaveBeenCalledTimes(1);
    second.dispose();
  });

  it("does not let an old renderer detach the newer compiled scene during remount", () => {
    const registry = createAuraRuntimeNodeRegistry(snapshot(), { flags: resolveQrFlags({ options: ["compiler"] }) });
    const oldScene = {} as CompiledScene, newScene = {} as CompiledScene;
    const oldAdd = vi.fn(), newAdd = vi.fn();
    bindRuntimeCompiled(oldScene, { addSubtree: oldAdd, removeSubtree: () => false } as unknown as RuntimeCompiledSceneInternals);
    bindRuntimeCompiled(newScene, { addSubtree: newAdd, removeSubtree: () => false } as unknown as RuntimeCompiledSceneInternals);
    registry.attachCompiled(oldScene);
    registry.attachCompiled(newScene);
    registry.detachCompiled(oldScene);
    registry.add(primitives.sphere().runtime({ id: "new" }));
    expect(oldAdd).not.toHaveBeenCalled();
    expect(newAdd).toHaveBeenCalledTimes(1);
    registry.detachCompiled(newScene);
    registry.add(primitives.sphere().runtime({ id: "unmounted" }));
    expect(newAdd).toHaveBeenCalledTimes(1);
    registry.dispose();
  });
});

describe("runtime scene change notifications", () => {
  it("notifies after visibility and transform edits without triggering material rescans", () => {
    const registry = createAuraRuntimeNodeRegistry(snapshot());
    const node = registry.require("box");
    const observed: Array<{ position: readonly number[]; visible: boolean }> = [];
    const clippingChange = vi.fn();
    registry.onChange(clippingChange);
    registry.onSceneChange(() => { observed.push({ position: [...node.position], visible: node.visible }); });
    node.position = [1, 2, 3];
    node.setPosition(2, 3, 4);
    node.translate(1, 0, 0);
    node.rotation = [0, 1, 0];
    node.setRotation(0, 2, 0);
    node.scale = [1, 2, 3];
    node.setScale(2);
    node.setPivot(1, 0, 0);
    node.setTransform({ position: [8, 9, 10], scale: 3 });
    node.visible = false;
    node.setVisible(true);
    expect(observed).toHaveLength(11);
    expect(observed[0]).toEqual({ position: [1, 2, 3], visible: true });
    expect(observed[8]).toEqual({ position: [8, 9, 10], visible: true });
    expect(observed[9]?.visible).toBe(false);
    expect(observed[10]?.visible).toBe(true);
    node.setVisible(true);
    node.visible = true;
    expect(observed).toHaveLength(11);
    expect(clippingChange).not.toHaveBeenCalled();
    expect(() => node.setPivot(NaN, 0, 0)).toThrow(RangeError);
    expect(() => node.setTransform({ position: [0, Infinity, 0] })).toThrow(RangeError);
    expect(observed).toHaveLength(11);
    node.setMaterial(material.pbr());
    expect(clippingChange).toHaveBeenCalledTimes(1);
    expect(observed).toHaveLength(11);
    registry.dispose();
  });

  it("links authored fog effects and anonymous ancestors to live visibility and world position", () => {
    const authored = scene().add(groups.create("parent", [
      groups.create("anonymous", [
        effects.fogVolume({ position: [1, 0, 0] }).runtime({ id: "fog" }),
        effects.fogVolume({ position: [0, 0, 2] })
      ], { position: [0, 1, 0] })
    ], { position: [2, 0, 0] }).runtime({ id: "parent" })).toJSON() as AuraSceneSnapshot;
    const flat = { ...authored, nodes: flattenNodesWithLineWorldMatrices(authored.nodes) };
    const registry = createAuraRuntimeNodeRegistry(flat, {}, authored);
    const parent = registry.require("parent");
    const outer = authored.nodes[0];
    if (!outer || outer.kind !== "group" || outer.children[0]?.kind !== "group") throw new Error("Expected nested groups");
    const inner = outer.children[0], named = inner.children[0]!, anonymous = inner.children[1]!;
    const innerHandle = runtimeNodeHandleForSceneNode(registry, inner)!;
    const namedHandle = runtimeNodeHandleForSceneNode(registry, named)!;
    const anonymousHandle = runtimeNodeHandleForSceneNode(registry, anonymous)!;
    expect(namedHandle).toBe(registry.require("fog"));
    expect(namedHandle.getWorldPosition()).toEqual([3, 1, 0]);
    expect(anonymousHandle.getWorldPosition()).toEqual([2, 1, 2]);
    expect(registry.atmosphereNodeState(named)).toMatchObject({ visible: true, worldPosition: [3, 1, 0] });
    expect(registry.atmosphereNodeState({ ...named })).toBeUndefined();
    const changed = vi.fn(), materialChanged = vi.fn();
    registry.onSceneChange(changed);
    registry.onChange(materialChanged);
    innerHandle.setPosition(0, 3, 0);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(namedHandle.getWorldPosition()).toEqual([3, 3, 0]);
    innerHandle.setRotation(0, Math.PI / 2, 0);
    const rotated = namedHandle.getWorldPosition();
    expect(rotated[0]).toBeCloseTo(2);
    expect(rotated[1]).toBeCloseTo(3);
    expect(rotated[2]).toBeCloseTo(-1);
    parent.setVisible(false);
    expect(changed).toHaveBeenCalledTimes(3);
    expect(runtimeNodeEffectiveVisibility(namedHandle)).toBe(false);
    expect(runtimeNodeEffectiveVisibility(anonymousHandle)).toBe(false);
    const hidden = registry.atmosphereNodeState(anonymous)!;
    expect(hidden.visible).toBe(false);
    expect(hidden.worldPosition[0]).toBeCloseTo(4);
    expect(hidden.worldPosition[1]).toBeCloseTo(3);
    expect(hidden.worldPosition[2]).toBeCloseTo(0);
    parent.visible = true;
    namedHandle.setPosition(5, 0, 0);
    expect(namedHandle.getWorldPosition()[2]).toBeCloseTo(-5);
    expect(runtimeNodeEffectiveVisibility(namedHandle)).toBe(true);
    expect(materialChanged).not.toHaveBeenCalled();
    registry.dispose();
    expect(registry.atmosphereNodeState(named)).toBeUndefined();
    innerHandle.setVisible(false);
    expect(changed).toHaveBeenCalledTimes(5);
  });

  it("hands off an independent composed world matrix including shear and reflection", () => {
    const authored = scene().add(groups.create("scaled", [
      groups.create("rotated", [effects.fogVolume({ position: [1, 0, 0] }).runtime({ id: "fog" })],
        { position: [0, 1, 0], rotation: [0, Math.PI / 4, 0] })
    ], { position: [2, 0, 0], scale: [2, 1, -3] }).runtime({ id: "scaled" })).toJSON() as AuraSceneSnapshot;
    const flat = { ...authored, nodes: flattenNodesWithLineWorldMatrices(authored.nodes) };
    const registry = createAuraRuntimeNodeRegistry(flat, {}, authored);
    const outer = authored.nodes[0];
    if (!outer || outer.kind !== "group" || outer.children[0]?.kind !== "group") throw new Error("Expected nested groups");
    const inner = outer.children[0], node = inner.children[0]!;
    const initial = registry.atmosphereNodeState(node)!;
    const world = initial.worldMatrix;
    expect(world).toBeInstanceOf(Float32Array);
    expect(world).toHaveLength(16);
    expect(world[0]).toBeCloseTo(Math.SQRT2, 5);
    expect(world[2]).toBeCloseTo(3 / Math.SQRT2, 5);
    expect(world[8]).toBeCloseTo(Math.SQRT2, 5);
    expect(world[10]).toBeCloseTo(-3 / Math.SQRT2, 5);
    expect(world[12]).toBeCloseTo(2 + Math.SQRT2, 5);
    expect(world[13]).toBeCloseTo(1, 5);
    expect(world[14]).toBeCloseTo(3 / Math.SQRT2, 5);
    expect(world[0]! * world[8]! + world[2]! * world[10]!).toBeCloseTo(-2.5, 5);
    expect(initial.worldPosition).toEqual([world[12], world[13], world[14]]);
    world[0] = 999;
    expect(registry.atmosphereNodeState(node)!.worldMatrix[0]).toBeCloseTo(Math.SQRT2, 5);
    registry.require("fog").setScale([1, 2, 0.5]);
    const updated = registry.atmosphereNodeState(node)!.worldMatrix;
    expect(updated[5]).toBeCloseTo(2, 5);
    expect(updated[8]).toBeCloseTo(1 / Math.SQRT2, 5);
    expect(updated[10]).toBeCloseTo(-1.5 / Math.SQRT2, 5);
    expect(world[0]).toBe(999);
    registry.dispose();
    expect(registry.atmosphereNodeState(node)).toBeUndefined();
  });

  it("notifies committed topology changes and suppresses stale handles and disposed subscribers", () => {
    const registry = createAuraRuntimeNodeRegistry(snapshot());
    const events: Array<readonly string[]> = [];
    const listener = () => { events.push(registry.ids()); };
    const release = registry.onSceneChange(listener);
    const otherRelease = registry.onSceneChange(listener);
    const old = registry.require("box");
    const added = registry.add(primitives.sphere().runtime({ id: "added" }));
    expect(events).toEqual([["box", "added"], ["box", "added"]]);
    release(); release();
    registry.remove("added");
    added.visible = false;
    expect(events).toEqual([["box", "added"], ["box", "added"], ["box"]]);
    registry.reset(snapshot("next"));
    old.setPosition(4, 0, 0);
    expect(events).toEqual([["box", "added"], ["box", "added"], ["box"], ["next"]]);
    otherRelease();
    registry.require("next").setVisible(false);
    expect(events).toHaveLength(4);
    registry.dispose();
    registry.onSceneChange(listener)();
    old.visible = true;
    expect(events).toHaveLength(4);
  });

  it("covers instance transforms and attachment while ignoring rejected edits", () => {
    const source = scene().add(primitives.box().runtime({ id: "parent" }))
      .add(primitives.box().runtime({ id: "child" })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(source);
    const parent = registry.require("parent"), child = registry.require("child");
    const changed = vi.fn(), materialChanged = vi.fn();
    registry.onSceneChange(changed);
    registry.onChange(materialChanged);
    child.setInstances([{ position: [1, 0, 0] }]);
    child.setInstanceMatrices(Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1]), 1);
    parent.attach(child);
    expect(changed).toHaveBeenCalledTimes(3);
    expect(materialChanged).not.toHaveBeenCalled();
    expect(() => child.setInstanceMatrices(new Float32Array(0), 1)).toThrow();
    expect(() => parent.attach(parent)).toThrow();
    expect(changed).toHaveBeenCalledTimes(3);
    registry.dispose();
  });

  it("queues nested scene edits, isolates listener failures, and retires pruned scene lookups", () => {
    const source = scene().add(groups.create("anonymous", [
      effects.fogVolume().runtime({ id: "fog" })
    ])).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(source);
    const group = source.nodes[0]!;
    const groupHandle = runtimeNodeHandleForSceneNode(registry, group)!;
    const events: string[] = [];
    registry.onSceneChange(() => { throw new Error("observer failure"); });
    registry.onSceneChange(() => {
      events.push("first");
      if (events.length === 1) registry.require("fog").setVisible(false);
    });
    registry.onSceneChange(() => { events.push("last"); });
    groupHandle.setPosition(1, 0, 0);
    expect(events).toEqual(["first", "last", "first", "last"]);
    registry.remove("fog");
    expect(runtimeNodeHandleForSceneNode(registry, group)).toBeUndefined();
    const count = events.length;
    groupHandle.setVisible(false);
    expect(events).toHaveLength(count);
    registry.dispose();
  });

  it("retains ancestor handle identity when compiled additions and removals copy the scene tree", () => {
    const source = scene().add(groups.create("outer", [groups.create("parent", [
      effects.fogVolume({ position: [1, 0, 0] }).runtime({ id: "fog" })
    ], { position: [0, 1, 0] }).runtime({ id: "parent" })], { position: [2, 0, 0] })).toJSON() as AuraSceneSnapshot;
    const flat = { ...source, nodes: flattenNodesWithLineWorldMatrices(source.nodes) };
    const registry = createAuraRuntimeNodeRegistry(flat, { flags: resolveQrFlags({ options: ["compiler"] }), getScene: () => source }, source);
    const compiled = {} as CompiledScene;
    bindRuntimeCompiled(compiled, { addSubtree: () => {}, removeSubtree: () => true } as unknown as RuntimeCompiledSceneInternals);
    registry.attachCompiled(compiled);
    const outer = source.nodes[0]!;
    const outerHandle = runtimeNodeHandleForSceneNode(registry, outer)!;
    outerHandle.setPosition(4, 0, 0);
    registry.add(effects.fogVolume({ position: [3, 0, 0] }).runtime({ id: "added" }), { parent: "parent" });
    const addedScene = registry.sceneWithRuntimeAdditions()!;
    const copiedOuter = addedScene.nodes[0]!;
    if (copiedOuter.kind !== "group" || copiedOuter.children[0]?.kind !== "group") throw new Error("Expected nested groups");
    const copiedParent = copiedOuter.children[0];
    expect(copiedOuter).not.toBe(outer);
    expect(registry.atmosphereNodeState(copiedOuter)).toMatchObject({ visible: true, worldPosition: [4, 0, 0] });
    expect(registry.atmosphereNodeState(copiedParent)).toMatchObject({ visible: true, worldPosition: [4, 1, 0] });
    expect(registry.atmosphereNodeState(copiedParent.children[1]!)).toMatchObject({ visible: true, worldPosition: [7, 1, 0] });
    registry.remove("fog");
    const removedScene = registry.sceneWithRuntimeAdditions()!;
    const removedOuter = removedScene.nodes[0]!;
    if (removedOuter.kind !== "group" || removedOuter.children[0]?.kind !== "group") throw new Error("Expected nested groups");
    expect(registry.atmosphereNodeState(removedOuter)).toMatchObject({ visible: true, worldPosition: [4, 0, 0] });
    expect(registry.atmosphereNodeState(removedOuter.children[0])).toMatchObject({ visible: true, worldPosition: [4, 1, 0] });
    registry.dispose();
  });
});

describe("public app clipping invalidation", () => {
  it("redraws an idle scene and replaces material subscriptions without leaking across remounts", async () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
    vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { href: "http://localhost/", search: "" }, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++nextFrame; callbacks.set(id, callback); return id; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
    const devices: MockRenderDevice[] = [];
    const create = Renderer.create.bind(Renderer);
    vi.spyOn(Renderer, "create").mockImplementation(async (options) => {
      const renderer = await create({ ...options, backend: "mock", requiredFeatures: [] });
      const device = renderer.device as MockRenderDevice;
      Object.defineProperty(device, "kind", { value: "webgl2" });
      Object.defineProperty(device, "info", { value: { ...device.info, capabilities: [...(device.info.capabilities ?? []), "hdr-render-targets"] } });
      devices.push(device);
      return renderer;
    });
    const first = clipping.material({ planes: [[1, 0, 0, -1]] });
    const second = clipping.material({ planes: [[1, 0, 0, -3]] });
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(primitives.box({ name: "mesh" }).runtime({ id: "mesh", mutable: false })),
      autoStart: true, resize: false, strict: true,
      qualityRebuild: { flags: { A3D_QR_COMPILER: true, A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_LIGHTING: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false } }
    });
    // The default effects system registers a continuous frame callback even for an empty static scene.
    prd07SystemFor(app)?.dispose();
    const fireFrame = (): void => {
      expect(callbacks.size).toBe(1);
      const [id, callback] = [...callbacks][0]!;
      callbacks.delete(id);
      callback(nextFrame * 16);
    };
    const submittedPlane = (): number | undefined => {
      const draw = devices.at(-1)?.drawCommands.find((command) => command.uniforms?.has("u_a3dClipPlanes"));
      return (draw?.uniforms?.get("u_a3dClipPlanes") as Float32Array | undefined)?.[3];
    };
    try {
      await app.ready();
      if (callbacks.size) fireFrame(); // Drain mount-time resource readiness before testing idle invalidation.
      expect([...callbacks.values()].map((callback) => callback.name)).toEqual([]);
      app.nodes.require("mesh").setMaterial(material.pbr({ color: "#ffffff", clipping: first }));
      fireFrame();
      expect(submittedPlane()).toBe(-1);
      first.update({ planes: [[1, 0, 0, -2]] });
      fireFrame();
      expect(submittedPlane()).toBe(-2);
      // A scope mismatch fails subscription discovery; it must still schedule
      // a frame that reports the error and retain the prior valid listener.
      const invalid = clipping.global({ planes: [[1, 0, 0, 0]] });
      app.nodes.require("mesh").setMaterial(material.pbr({ color: "#ffffff", clipping: invalid }));
      fireFrame();
      expect(app.diagnostics().errors.some((message) => message.includes("RENDER_FRAME_TERMINAL") && message.includes("material clipping group"))).toBe(true);
      first.update({ planes: [[1, 0, 0, -2.5]] });
      expect(callbacks.size).toBe(1);
      app.nodes.require("mesh").setMaterial(material.pbr({ color: "#ffffff", clipping: second }));
      fireFrame();
      expect(submittedPlane()).toBe(-3);
      first.update({ planes: [[1, 0, 0, -4]] });
      expect(callbacks.size).toBe(0);
      second.update({ planes: [[1, 0, 0, -5]] });
      fireFrame();
      expect(submittedPlane()).toBe(-5);
      expect(app.nodes.remove!("mesh")).toBe(true);
      fireFrame();
      second.update({ planes: [[1, 0, 0, -6]] });
      expect(callbacks.size).toBe(0);
      const added = clipping.material({ planes: [[1, 0, 0, -8]] });
      app.nodes.add!(primitives.box({ name: "added", material: material.pbr({ color: "#ffffff", clipping: added }) })
        .runtime({ id: "added", mutable: false }));
      fireFrame();
      expect(submittedPlane()).toBe(-8);
      added.update({ planes: [[1, 0, 0, -9]] });
      fireFrame();
      expect(submittedPlane()).toBe(-9);
      expect(app.nodes.remove!("added")).toBe(true);
      fireFrame();
      added.update({ planes: [[1, 0, 0, -10]] });
      expect(callbacks.size).toBe(0);
      app.setScene(scene().add(primitives.box({ name: "next" }).runtime({ id: "next", mutable: false })));
      await app.ready();
      if (callbacks.size) fireFrame();
      expect(callbacks.size).toBe(0);
      second.update({ planes: [[1, 0, 0, -7]] });
      expect(callbacks.size).toBe(0);
      app.nodes.require("next").setMaterial(material.pbr({ color: "#ffffff", clipping: first }));
      fireFrame();
      expect(submittedPlane()).toBe(-4);
      app.dispose();
      first.update({ planes: [[1, 0, 0, -7]] });
      expect(callbacks.size).toBe(0);
    } finally { app.dispose(); }
  });
});
