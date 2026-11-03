import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01.js";
import { Renderer, type RenderSource } from "../../../packages/rendering/src/Renderer.js";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core.js";
import { createWorkerRenderer, installWorkerRenderer } from "../../../packages/engine/src/agent-api/app/workerRuntime.js";
import type { AuraWorkerEndpoint, AuraWorkerHostEndpoint, AuraWorkerRequest, AuraWorkerResponse } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import { realCompilerImpl } from "../../../packages/engine/src/agent-api/compiler/compileScene.js";
import { createSceneLabelLayer, worldLabelsFromSnapshot } from "../../../packages/engine/src/agent-api/compiler/labels.js";
import { createProductionRuntimePostprocess } from "../../../packages/engine/src/agent-api/compiler/postprocess.js";
import { effects } from "../../../packages/engine/src/agent-api/nodes/effects.composite.js";
import { labels } from "../../../packages/engine/src/agent-api/nodes/labels.js";
import { material } from "../../../packages/engine/src/agent-api/nodes/material.js";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { text3D } from "../../../packages/engine/src/agent-api/nodes/text3d.js";
import { TextureHandle, texture } from "../../../packages/engine/src/agent-api/nodes/texture.js";
import type { AuraApp, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { bindPostDiagnosticReader, collectPostSection, recordAuthoredPostContext, resetAuthoredPostContext, resetSubmittedPostprocess } from "../../../packages/engine/src/agent-api/postBridge.js";

// Browser-shaped canvas and transport only; the renderer uses the source mock
// device, so these tests do not assert GPU execution or pixel output.
class FakeOffscreenCanvas {
  constructor(public width: number, public height: number) {}
  getContext(kind: string) {
    return kind === "webgl2" ? { MAX_TEXTURE_SIZE: 0x0d33, getParameter: () => 4096 } : null;
  }
}
const offscreen = (canvas: FakeOffscreenCanvas): OffscreenCanvas => canvas as unknown as OffscreenCanvas;

class Port {
  peer?: Port;
  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  terminated = 0;
  postMessage(message: AuraWorkerRequest | AuraWorkerResponse, transfer: Transferable[] = []): void {
    // Node cannot transfer the fake canvas. Clone every other piece of the
    // message, including scene snapshots, just like the worker transport.
    const copy = message.type === "init"
      ? { ...structuredClone({ ...message, canvas: undefined }, { transfer: transfer.slice(1) }), canvas: message.canvas }
      : structuredClone(message, { transfer });
    queueMicrotask(() => { if (!this.terminated) this.peer?.emit(copy); });
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const entries = this.listeners.get(type) ?? new Set(); entries.add(listener); this.listeners.set(type, entries);
  }
  removeEventListener(type: string, listener: (event: MessageEvent) => void): void { this.listeners.get(type)?.delete(listener); }
  emit(data: unknown): void { for (const listener of [...(this.listeners.get("message") ?? [])]) listener({ data } as MessageEvent); }
  terminate(): void { this.terminated++; }
  count(): number { return [...this.listeners.values()].reduce((total, entries) => total + entries.size, 0); }
}

class ElementFixture {
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly children: ElementFixture[] = [];
  parentElement: ElementFixture | null = null;
  className = "";
  textContent: string | null = null;
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  append(child: ElementFixture): void { child.parentElement = this; this.children.push(child); }
  remove(): void {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }
  getBoundingClientRect() { return { width: 100, height: 50, left: 0, top: 0 }; }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetAuthoredPostContext();
  resetSubmittedPostprocess();
});

describe("production compiler with an offscreen worker canvas", () => {
  it("mounts DOM labels only for an HTML canvas and disposes both overlay layers", () => {
    const snapshot = scene().add(labels.billboard("world"))
      .add(text3D("ABC", { backend: "sdf", accessibleLabel: "Accessible text" })).toJSON();
    const canvas = offscreen(new FakeOffscreenCanvas(100, 50));
    vi.stubGlobal("document", undefined);
    expect(createSceneLabelLayer(canvas, snapshot)).toBeUndefined();

    const body = new ElementFixture();
    const create = vi.fn(() => new ElementFixture());
    vi.stubGlobal("document", { body, createElement: create, createElementNS: create });
    vi.stubGlobal("getComputedStyle", () => ({ position: "static" }));
    expect(createSceneLabelLayer(canvas, snapshot)).toBeUndefined();
    expect(create).not.toHaveBeenCalled();

    const domCanvas = Object.assign(new ElementFixture(), { width: 100, height: 50, clientWidth: 100, clientHeight: 50 });
    domCanvas.parentElement = body;
    const layer = createSceneLabelLayer(domCanvas as unknown as HTMLCanvasElement, snapshot)!;
    expect(body.children).toHaveLength(2);
    layer.setLabels(worldLabelsFromSnapshot(snapshot));
    layer.update(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    expect(layer.snapshot().map(label => label.text)).toContain("world");
    expect(body.children[1]!.children.map(child => child.textContent)).toEqual(["Accessible text"]);
    layer.dispose();
    layer.dispose();
    expect(body.children).toHaveLength(0);
  });

  it.each([false, true])("compiles, snapshots textures, resizes, replaces and disposes (document present=%s)", async documentPresent => {
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    vi.stubGlobal("WebGL2RenderingContext", undefined);
    const createElement = vi.fn(() => { throw new Error("unexpected DOM overlay"); });
    vi.stubGlobal("document", documentPresent ? { createElement, body: {} } : undefined);
    const actualCreate = Renderer.create.bind(Renderer);
    const renderers: Renderer[] = [];
    vi.spyOn(Renderer, "create").mockImplementation(async options => {
      const renderer = await actualCreate({ ...options, backend: "mock", requiredFeatures: [] });
      Object.defineProperty(renderer.device, "kind", { value: "webgl2" });
      Object.defineProperty(renderer.device, "info", { value: { ...renderer.device.info,
        capabilities: [...(renderer.device.info.capabilities ?? []), "hdr-render-targets"] } });
      vi.spyOn(renderer, "renderAsync");
      vi.spyOn(renderer, "dispose");
      renderers.push(renderer);
      return renderer;
    });
    const compile = vi.spyOn(realCompilerImpl, "compile");
    const host = new Port(), remote = new Port(); host.peer = remote; remote.peer = host;
    const stop = installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>);
    const canvas = new FakeOffscreenCanvas(8, 8);
    const hostTexture = texture.data({ width: 1, height: 1, data: Uint8Array.of(1, 2, 3, 255) });
    const snapshot = (name: string): AuraSceneSnapshot => scene()
      .add(primitives.box({ name, material: material.pbr({ texture: hostTexture }) }))
      .add(labels.billboard("DOM only"))
      .add(effects.depthOfField({ focusDistance: 3, maxBlur: 6 })).toJSON();
    const app = createWorkerRenderer({ canvas: offscreen(canvas), worker: host as unknown as AuraWorkerHostEndpoint,
      scene: snapshot("first"), renderer: { backend: "webgl2" }, autoStart: false });
    (hostTexture.texture.data as Uint8Array)[0] = 9;
    try {
      await app.ready;
      expect(compile).toHaveBeenCalledTimes(1);
      expect((compile.mock.calls[0]![1] as { canvas: unknown }).canvas).toBe(canvas);
      const node = compile.mock.calls[0]![0].nodes.find(candidate => candidate.kind === "primitive")!;
      const copy = (node as { material: { texture: TextureHandle } }).material.texture;
      expect(copy).toBeInstanceOf(TextureHandle);
      expect(copy).not.toBe(hostTexture);
      expect(Array.from(copy.texture.data as Uint8Array)).toEqual([1, 2, 3, 255]);
      const first = await app.step(0.016, 1);
      expect(first).toMatchObject({ backend: "webgl2", width: 8, height: 8 });
      const source = vi.mocked(renderers[0]!.renderAsync).mock.calls[0]![0] as RenderSource;
      expect([...(source.collectRenderItems?.() ?? [])].some(item => item.label?.includes(":first"))).toBe(true);
      expect((source.postprocess as { depthOfField?: unknown }).depthOfField).toBeTruthy();

      await app.resize({ width: 20, height: 10, pixelRatio: 2 });
      expect(await app.step(0.016, 2)).toMatchObject({ width: 40, height: 20 });
      await app.setScene(snapshot("second"));
      expect(compile).toHaveBeenCalledTimes(2);
      expect(copy.texture.disposed).toBe(true);
      expect(renderers[0]!.dispose).toHaveBeenCalledOnce();
      expect(await app.step(0.016, 3)).toMatchObject({ width: 40, height: 20 });
      const replacement = vi.mocked(renderers[1]!.renderAsync).mock.calls[0]![0] as RenderSource;
      expect([...(replacement.collectRenderItems?.() ?? [])].some(item => item.label?.includes(":second"))).toBe(true);
      expect(createElement).not.toHaveBeenCalled();
    } finally {
      await app.dispose();
      await stop();
      expect(renderers.at(-1)!.dispose).toHaveBeenCalledOnce();
      expect(hostTexture.texture.disposed).toBe(false);
      expect(host.terminated).toBe(1);
      expect([host.count(), remote.count()]).toEqual([0, 0]);
      hostTexture.dispose();
    }
  });

  it("scopes post diagnostics and the root DoF pair to each offscreen canvas", () => {
    const a = offscreen(new FakeOffscreenCanvas(10, 10)), b = offscreen(new FakeOffscreenCanvas(20, 20));
    const appA = { canvas: a } as unknown as AuraApp, appB = { canvas: b } as unknown as AuraApp;
    recordAuthoredPostContext({ flags: createTrustedQrFlags({ A3D_QR_POST: true }), options: {} }, appA);
    recordAuthoredPostContext({ flags: createTrustedQrFlags({ A3D_QR_POST: false }), options: {} }, appB);
    const snapshot = scene().add(effects.depthOfField({ focusDistance: 3, maxBlur: 6 })).add(effects.antiAlias({ mode: "off" })).toJSON();
    const native = createProductionRuntimePostprocess(snapshot, [], 10, 10, true, { canvas: a });
    const legacy = createProductionRuntimePostprocess(snapshot, [], 20, 20, true, { canvas: b });
    expect(native.v2).toBe(true);
    expect(legacy.v2).not.toBe(true);
    expect(native.depthOfField).toBeTruthy();
    expect(legacy.depthOfField).toBeTruthy();
    expect(native.pipeline).toMatchObject({ dof: { focusDistance: 3, maxBlurPx: 6 } });
    const unbindOld = bindPostDiagnosticReader(a, () => [{ viewId: "old", frameId: 1, skipped: [], stagesRan: [], outcome: "v2" }]);
    const unbindNew = bindPostDiagnosticReader(a, () => [{ viewId: "new", frameId: 2, skipped: [], stagesRan: [], outcome: "v2" }]);
    unbindOld();
    expect(collectPostSection(appA)).toMatchObject({ pipeline: "v2", views: [{ viewId: "new" }] });
    expect(collectPostSection(appB)).toMatchObject({ pipeline: "legacy" });
    unbindNew();
    expect(collectPostSection(appA)).toMatchObject({ pipeline: "v2", views: [] });
  });
});
