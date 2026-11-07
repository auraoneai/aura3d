import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Renderer } from "@aura3d/rendering";
import { createAuraApp, scene } from "@aura3d/engine";
import { createAuraRuntimeNodeRegistry, runtimeNodeQueryState } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { setPrd01ColorParsing } from "../../../packages/engine/src/agent-api/compiler/color";
import { createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { createProductionRuntimeRendererInput, setPrd01ModelMatrixCache } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { AuraApp, AuraPrimitiveNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

// The application and compiler are real; only the DOM-shaped target and the
// command-validating render device are fakes. No browser or GPU is involved.
class FakeCanvas {
  width = 200; height = 100; clientWidth = 200; clientHeight = 100;
  style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  getBoundingClientRect() { return { width: 200, height: 100, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

const apps: AuraApp[] = [];
const yaw = [0, Math.SQRT1_2, 0, Math.SQRT1_2] as const;
function snapshot(id: string, pivot = false): AuraSceneSnapshot {
  const node = {
    kind: "primitive", primitive: "box", name: id, runtime: { id },
    position: [2, 0, 0], quaternion: yaw,
    ...(pivot ? { pivot: [1, 0, 0] } : { instances: [{}], instanceColors: ["orange"] })
  } as AuraPrimitiveNode;
  return { ...scene().toJSON(), nodes: [node] };
}

function app(canvas: FakeCanvas, value: AuraSceneSnapshot, core: boolean, compiler: boolean, strict = core): AuraApp {
  const result = createAuraApp(canvas as unknown as HTMLCanvasElement, {
    scene: value, autoStart: false, resize: false, diagnostics: false, strict,
    renderer: { backend: "webgl2" },
    qualityRebuild: { allowUrlFlags: false, flags: {
      A3D_QR_CORE: core, A3D_QR_COMPILER: compiler, A3D_QR_CORE_GENERATOR: false,
      A3D_QR_CORE_OUTPUT: false, A3D_QR_LIGHTING: false, A3D_QR_POST: false,
      // The separate VFX overlay intentionally disallows two apps on one canvas.
      A3D_QR_VFX: false, A3D_QR_VFX_FOG: false
    } }
  });
  apps.push(result);
  return result;
}

function item(owner: AuraApp, id: string) {
  const items = runtimeNodeQueryState(owner.nodes.require(id))?.renderItems;
  expect(items).toHaveLength(1);
  return items![0]!;
}

beforeEach(() => {
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", {
    innerWidth: 200, innerHeight: 100, location: { href: "http://localhost/", search: "" },
    addEventListener() {}, removeEventListener() {}
  });
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const create = Renderer.create.bind(Renderer);
  vi.spyOn(Renderer, "create").mockImplementation(async (options) => {
    const renderer = await create({ ...options, backend: "mock", requiredFeatures: [] });
    Object.defineProperty(renderer.device, "kind", { value: "webgl2" });
    Object.defineProperty(renderer.device, "info", { value: {
      ...renderer.device.info, capabilities: [...(renderer.device.info.capabilities ?? []), "hdr-render-targets"]
    } });
    return renderer;
  });
});

afterEach(async () => {
  for (const owner of apps.splice(0)) await owner.disposeAsync();
  setPrd01ColorParsing(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("runtime-owned render input", () => {
  it("uses separate matrix caches for owners sharing the same canvas, scene and node", () => {
    const canvas = new FakeCanvas() as unknown as HTMLCanvasElement;
    const ownerA = {}, ownerB = {}, value = snapshot("same");
    const entries = createProductionRuntimePrimitiveEntries(value.nodes);
    const matrix = (x: number) => ({
      modelMatrix: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1]),
      beginFrame: () => {}, composed: 0, hits: 0
    });
    const staleA = setPrd01ModelMatrixCache(matrix(3), ownerA);
    const releaseA = setPrd01ModelMatrixCache(matrix(7), ownerA);
    const releaseB = setPrd01ModelMatrixCache(matrix(9), ownerB);
    const translation = (owner: object) => {
      const input = createProductionRuntimeRendererInput(value, canvas, [], entries, 0, undefined, new Set(),
        { color: [0, 0, 0], intensity: 0 }, [], undefined, undefined, undefined, owner);
      return [...(input.source.collectRenderItems?.() ?? [])][0]!.modelMatrix![12];
    };
    try {
      staleA();
      expect(translation(ownerA)).toBe(7);
      expect(translation(ownerB)).toBe(9);
      expect(translation(ownerA)).toBe(7);
      releaseA();
      expect(translation(ownerB)).toBe(9);
    } finally {
      releaseA(); releaseB();
      for (const entry of entries) for (const resource of entry.resources) {
        resource.textureDisposer?.();
        resource.geometry.dispose();
        if (resource.shadowGeometry && resource.shadowGeometry !== resource.geometry) resource.shadowGeometry.dispose();
        resource.material.dispose();
        resource.texturedMaterial?.dispose(); // a separate upgrade slot, never the scalar material
      }
    }
  });

  it("releases only its own query handoffs and ignores a stale registration disposer", () => {
    const canvas = new FakeCanvas() as unknown as HTMLCanvasElement;
    const ownerA = {}, ownerB = {}, valueA = snapshot("a"), valueB = snapshot("b");
    const flags = resolveQrFlags({ options: { A3D_QR_CORE: false }, env: {} });
    const registryA = createAuraRuntimeNodeRegistry(valueA, { flags });
    const registryB = createAuraRuntimeNodeRegistry(valueB, { flags });
    const entriesA = createProductionRuntimePrimitiveEntries(valueA.nodes);
    const entriesB = createProductionRuntimePrimitiveEntries(valueB.nodes);
    const staleA = setPrd01ModelMatrixCache(null, ownerA);
    const releaseA = setPrd01ModelMatrixCache(null, ownerA);
    const releaseB = setPrd01ModelMatrixCache(null, ownerB);
    const frame = (value: AuraSceneSnapshot, entries: typeof entriesA, registry: typeof registryA, owner: object) =>
      createProductionRuntimeRendererInput(value, canvas, [], entries, 0, registry, new Set(),
        { color: [0, 0, 0], intensity: 0 }, [], undefined, undefined, undefined, owner);
    const a = registryA.require("a"), b = registryB.require("b");
    try {
      frame(valueA, entriesA, registryA, ownerA);
      frame(valueB, entriesB, registryB, ownerB);
      staleA();
      expect(runtimeNodeQueryState(a)?.renderItems).toHaveLength(1);
      expect(runtimeNodeQueryState(b)?.renderItems).toHaveLength(1);
      releaseA();
      expect(runtimeNodeQueryState(a)?.renderItems).toHaveLength(0);
      expect(runtimeNodeQueryState(b)?.renderItems).toHaveLength(1);
      releaseB();
      expect(runtimeNodeQueryState(b)?.renderItems).toHaveLength(0);
    } finally {
      releaseA(); releaseB(); registryA.dispose(); registryB.dispose();
      for (const entry of [...entriesA, ...entriesB]) for (const resource of entry.resources) {
        resource.textureDisposer?.();
        resource.geometry.dispose();
        if (resource.shadowGeometry && resource.shadowGeometry !== resource.geometry) resource.shadowGeometry.dispose();
        resource.material.dispose();
        resource.texturedMaterial?.dispose(); // a separate upgrade slot, never the scalar material
      }
    }
  });

  it.each([false, true])("isolates core policies and query handoffs on one canvas (compiler=%s)", async (compiler) => {
    // A standalone strict policy must not bleed into the core-off app.
    setPrd01ColorParsing({ strict: true });
    const canvas = new FakeCanvas();
    const a = app(canvas, snapshot("a"), true, compiler);
    await a.ready();
    const b = app(canvas, snapshot("b"), false, compiler);
    await b.ready();
    expect(a.diagnostics().errors).toEqual([]);
    expect(b.diagnostics().errors).toEqual([]);

    a.step(0.016);
    const aItem = item(a, "a");
    expect(aItem.modelMatrix![0]).toBeCloseTo(0);
    expect(aItem.modelMatrix![2]).toBeCloseTo(-1);
    expect(aItem.instanceColors![0]).toBeCloseTo(1);
    expect(aItem.instanceColors![1]).toBeCloseTo(0.3762621);

    b.step(0.016);
    const bItem = item(b, "b");
    expect(bItem.modelMatrix![0]).toBeCloseTo(1);
    expect(bItem.modelMatrix![2]).toBeCloseTo(0);
    // A policy-less/legacy app parses CSS names too (was the near-black fallback).
    expect(bItem.instanceColors![0]).toBeCloseTo(1);
    expect(item(a, "a")).toBe(aItem);

    const aHandle = a.nodes.require("a");
    await a.disposeAsync();
    expect(runtimeNodeQueryState(aHandle)).toBeUndefined();
    expect(item(b, "b")).toBe(bItem);
    b.step(0.016);
    expect(item(b, "b")).toBeDefined();
  });

  it.each([false, true])("preserves strict and disabled color policy on frames (compiler=%s)", async (compiler) => {
    setPrd01ColorParsing({ strict: true });
    const strict = app(new FakeCanvas(), snapshot("strict"), true, compiler);
    const disabled = app(new FakeCanvas(), snapshot("disabled"), false, compiler, false);
    await strict.ready(); await disabled.ready();
    strict.nodes.require("strict").setInstances([{}], ["not-a-valid-color"]);
    disabled.nodes.require("disabled").setInstances([{}], ["not-a-valid-color"]);
    expect(() => strict.step(0.016)).toThrow(/color/i);
    // No policy never means a silent near-black: invalid colours throw COLOR_INVALID everywhere.
    expect(() => disabled.step(0.016)).toThrow(/COLOR_INVALID/);
  });

  it.each([false, true])("uses core pivot preflight and preserves ownership through remount (compiler=%s)", async (compiler) => {
    const canvas = new FakeCanvas();
    const owner = app(canvas, snapshot("pivot", true), true, compiler);
    await expect(owner.ready()).resolves.toBeUndefined();
    owner.step(0.016);
    const old = owner.nodes.require("pivot");
    expect(item(owner, "pivot").modelMatrix![2]).toBeCloseTo(-1);

    owner.setScene(snapshot("replacement"));
    await owner.ready();
    owner.step(0.016);
    expect(runtimeNodeQueryState(old)).toBeUndefined();
    expect(item(owner, "replacement").modelMatrix![2]).toBeCloseTo(-1);
    expect(item(owner, "replacement").instanceColors![0]).toBeCloseTo(1);
    const replacement = owner.nodes.require("replacement");
    await owner.disposeAsync();
    expect(runtimeNodeQueryState(replacement)).toBeUndefined();

    const next = app(canvas, snapshot("next"), false, compiler);
    await next.ready();
    next.step(0.016);
    expect(item(next, "next").modelMatrix![0]).toBeCloseTo(1);
    expect(item(next, "next").instanceColors![0]).toBeCloseTo(1);
  });

  it.each([false, true])("retains legacy pivot rejection when core is disabled (compiler=%s)", async (compiler) => {
    const owner = app(new FakeCanvas(), snapshot("legacy-pivot", true), false, compiler, true);
    await expect(owner.ready()).rejects.toThrow(/PIVOT_UNSUPPORTED_LEGACY_ROTATION/);
  });
});
