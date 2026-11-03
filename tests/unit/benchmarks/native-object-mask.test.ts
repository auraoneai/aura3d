import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import ts from "typescript";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Material } from "../../../packages/rendering/src/Material";
import { MockRenderDevice, type RenderTarget, type RenderShaderProgram } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { InstancedPBRMaterial } from "../../../packages/rendering/src/InstancedPBRMaterial";
import { Renderable } from "../../../packages/scene/src/Renderable";
import { Scene } from "../../../packages/scene/src/Scene";
import {
  captureNativeObjectMask, decodeObjectMaskId, decodeObjectMaskPixels,
  encodeObjectMaskId, MAX_OBJECT_MASK_ID
} from "../../../benchmarks/quality-rebuild/aura3d/lib/mask";
import { auraMaskPageDependencies, buildAuraMaskScene, objectMaskPng, runAuraMaskPage, type AuraMaskPageDependencies, type AuraMaskPageEnvironment, type AuraMaskPageState, type AuraMaskSceneSpec } from "../../../benchmarks/quality-rebuild/aura-mask";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { lights } from "../../../packages/engine/src/agent-api/nodes/lights";
import { material } from "../../../packages/engine/src/agent-api/nodes/material";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraApp } from "@aura3d/engine";
import type { ReadyPayload, SceneSpec } from "../../../benchmarks/quality-rebuild/shared/types";
import auraMaskViteConfig from "../../../benchmarks/quality-rebuild/vite.aura-mask.config";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const translation = (x: number, y = 0, z = 0) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

function fixture() {
  const device = new MockRenderDevice();
  const geometry = Geometry.triangle();
  const material = new UnlitMaterial();
  return { device, geometry, material, width: 2, height: 1, viewProjectionMatrix: identity };
}

describe("native object mask encoding", () => {
  it("uses independent little-endian RGB fixtures with transparent zero", () => {
    const cases = [
      [0, [0, 0, 0, 0]], [1, [1, 0, 0, 255]], [255, [255, 0, 0, 255]],
      [256, [0, 1, 0, 255]], [65536, [0, 0, 1, 255]],
      [0x123456, [0x56, 0x34, 0x12, 255]], [MAX_OBJECT_MASK_ID, [255, 255, 255, 255]]
    ] as const;
    for (const [id, bytes] of cases) {
      expect(encodeObjectMaskId(id)).toEqual(bytes);
      expect(decodeObjectMaskId(bytes)).toBe(id);
    }
    expect(Array.from(decodeObjectMaskPixels(Uint8Array.from([0, 0, 0, 0, 0x56, 0x34, 0x12, 255])))).toEqual([0, 0x123456]);
  });

  it("rejects invalid ID bounds, offsets, alpha and byte lengths", () => {
    for (const id of [-1, 0x1000000, 1.5, NaN, Infinity]) expect(() => encodeObjectMaskId(id)).toThrow(/OBJECT_MASK_ID_RANGE/);
    expect(() => decodeObjectMaskId([1, 2, 3, 255], -1)).toThrow(/OBJECT_MASK_PIXEL_RANGE/);
    expect(() => decodeObjectMaskId([1, 2, 3, 255], 1)).toThrow(/OBJECT_MASK_PIXEL_RANGE/);
    expect(() => decodeObjectMaskId([1, 2, 3, 128])).toThrow(/OBJECT_MASK_PIXEL_INVALID/);
    expect(() => decodeObjectMaskId([0, 0, 0, 255])).toThrow(/OBJECT_MASK_PIXEL_INVALID/);
    expect(() => decodeObjectMaskId([256, 0, 0, 255])).toThrow(/OBJECT_MASK_PIXEL_INVALID/);
    expect(() => decodeObjectMaskPixels(new Uint8Array(3))).toThrow(/OBJECT_MASK_PIXEL_RANGE/);
  });
});

describe("native object mask draw pass", () => {
  it("walks a native scene, respects inherited visibility and camera layers, and submits ordered depth draws", () => {
    const f = fixture();
    const scene = new Scene();
    const root = scene.root;
    const parent = scene.createNode("parent");
    parent.transform.setPosition(3, 0, 0);
    root.addChild(parent);
    const first = scene.createNode("first");
    first.transform.setPosition(2, 0, 0);
    first.renderOrder = 4;
    first.renderable = new Renderable({ geometry: "g", material: "m" });
    parent.addChild(first);
    const hidden = scene.createNode("hidden-parent");
    hidden.visible = false;
    root.addChild(hidden);
    const concealed = scene.createNode("concealed");
    concealed.renderable = new Renderable({ geometry: "g", material: "m" });
    hidden.addChild(concealed);
    const layer = scene.createNode("other-layer");
    layer.layerMask = 2;
    layer.renderable = new Renderable({ geometry: "g", material: "m" });
    root.addChild(layer);
    const second = scene.createNode("second");
    second.renderOrder = -2;
    second.renderable = new Renderable({ geometry: "g", material: "m" });
    root.addChild(second);
    const targetSpy = vi.spyOn(f.device, "createRenderTarget");
    const shaderSpy = vi.spyOn(f.device, "createShaderProgram");
    const out = captureNativeObjectMask({ ...f, source: { scene, geometryLibrary: new Map([["g", f.geometry]]), materialLibrary: { m: f.material } }, cameraLayerMask: 1 });
    expect(out.objects).toEqual([
      { id: 1, key: first.id, visible: true }, { id: 2, key: concealed.id, visible: false },
      { id: 3, key: layer.id, visible: false }, { id: 4, key: second.id, visible: true }
    ]);
    expect(out.origin).toBe("bottom-left");
    expect(Array.from(out.ids)).toEqual([0, 0]);
    expect(targetSpy).toHaveBeenCalledWith(expect.objectContaining({ width: 2, height: 1, format: "rgba8", depth: "renderbuffer", sampleCount: 1 }));
    expect(shaderSpy.mock.calls[0]![0].vertex.startsWith("#version 300 es\n")).toBe(true);
    expect(shaderSpy.mock.calls[0]![0].fragment.startsWith("#version 300 es\n")).toBe(true);
    const reflected = shaderSpy.mock.results[0]!.value.reflection;
    expect([...reflected.attributes.keys()]).toEqual(["a_position"]);
    expect([...reflected.uniforms]).toEqual(["u_maskMvp", "u_maskId"]);
    expect(f.device.drawCommands.map((command) => command.label)).toEqual(["object-mask:4:second", "object-mask:1:first"]);
    const [secondDraw, firstDraw] = f.device.drawCommands;
    expect(firstDraw?.renderState).toEqual(expect.objectContaining({ depthTest: true, depthWrite: true, depthCompare: "less-equal", blend: false, alphaToCoverage: false }));
    expect(firstDraw?.indexCount).toBe(3);
    expect(firstDraw?.uniforms?.get("u_maskId")).toEqual([1 / 255, 0, 0, 1]);
    expect((firstDraw?.uniforms?.get("u_maskMvp") as Float32Array)[12]).toBe(5);
    expect((secondDraw?.uniforms?.get("u_maskMvp") as Float32Array)[12]).toBe(0);
    f.geometry.dispose();
    f.material.dispose();
    f.device.dispose();
  });

  it("keeps IDs stable across visibility changes and supports native item ranges and instance transforms", () => {
    const f = fixture();
    f.geometry.drawRange = { start: 1, count: 2 };
    const scene = new Scene();
    const node = scene.createNode("toggle");
    node.renderable = new Renderable({ geometry: "g", material: "m" });
    scene.root.addChild(node);
    const instance = { geometry: f.geometry, material: f.material, label: "instances", instanceTransforms: [...translation(2), ...translation(5)], drawRange: { start: 0, count: 3 } };
    const source = { scene, geometryLibrary: { g: f.geometry }, materialLibrary: { m: f.material }, renderItems: [instance] };
    node.visible = false;
    const hidden = captureNativeObjectMask({ ...f, source });
    expect(hidden.objects.map(({ id, visible }) => [id, visible])).toEqual([[1, false], [2, true]]);
    expect(f.device.drawCommands.map((cmd) => (cmd.uniforms?.get("u_maskMvp") as Float32Array)[12])).toEqual([2, 5]);
    expect(f.device.drawCommands.every((cmd) => cmd.firstIndex === 1 && cmd.indexCount === 2)).toBe(true);
    node.visible = true;
    const shown = captureNativeObjectMask({ ...f, source });
    expect(shown.objects.map(({ id, visible }) => [id, visible])).toEqual([[1, true], [2, true]]);
    expect(f.device.drawCommands.map((cmd) => cmd.label)).toEqual(["object-mask:1:toggle", "object-mask:2:instances", "object-mask:2:instances"]);
    f.geometry.dispose();
    f.material.dispose();
    f.device.dispose();
  });

  it("supports Aura's native instanced material and flips culling for mirrored instances", () => {
    const f = fixture();
    const material = new InstancedPBRMaterial();
    const mirrored = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 0, 0, 1];
    captureNativeObjectMask({ ...f, source: { renderItems: [{ geometry: f.geometry, material, instanceTransforms: [...identity, ...mirrored] }] } });
    expect(f.device.drawCommands.map((command) => command.renderState?.cullMode)).toEqual(["back", "front"]);
    expect((f.device.drawCommands[1]!.uniforms!.get("u_maskMvp") as Float32Array)[12]).toBe(3);
    f.geometry.dispose(); material.dispose(); f.material.dispose(); f.device.dispose();
  });

  it("returns actual readback IDs and rejects unknown or malformed pixels", () => {
    const f = fixture();
    const source = { renderItems: [{ geometry: f.geometry, material: f.material, label: "box" }] };
    const read = vi.spyOn(f.device, "readPixels").mockReturnValue(Uint8Array.from([1, 0, 0, 255, 0, 0, 0, 0]));
    const result = captureNativeObjectMask({ ...f, source });
    expect(Array.from(result.ids)).toEqual([1, 0]);
    read.mockReturnValue(Uint8Array.from([2, 0, 0, 255, 0, 0, 0, 0]));
    expect(() => captureNativeObjectMask({ ...f, source })).toThrow(/unsubmitted object ID 2/);
    read.mockReturnValue(Uint8Array.of(1, 0, 0, 255));
    expect(() => captureNativeObjectMask({ ...f, source })).toThrow(/OBJECT_MASK_READBACK_INVALID/);
    f.geometry.dispose(); f.material.dispose(); f.device.dispose();
  });

  it("rejects unsupported draw paths before allocating pass resources", () => {
    const f = fixture();
    const target = vi.spyOn(f.device, "createRenderTarget");
    const custom = new Material({ shaderKey: "custom/vertex" });
    const cases = [
      { geometry: f.geometry, material: custom },
      { geometry: f.geometry, material: f.material, skinning: { jointCount: 1, matrices: new Float32Array(identity) } },
      { geometry: f.geometry, material: f.material, morphWeights: [0.5] },
      { geometry: f.geometry, material: f.material, onBeforeRender: () => {} },
      { geometry: f.geometry, material: f.material, instanceTransforms: [1, 2, 3] },
      { geometry: f.geometry, material: f.material, drawRange: { start: 3, count: 2 } }
    ];
    for (const item of cases) expect(() => captureNativeObjectMask({ ...f, source: { renderItems: [item] } })).toThrow(/OBJECT_MASK_DRAW_(UNSUPPORTED|RANGE_INVALID)/);
    f.material.setParameter("u_alphaCutoff", 0.5);
    expect(() => captureNativeObjectMask({ ...f, source: { renderItems: [{ geometry: f.geometry, material: f.material }] } })).toThrow(/u_alphaCutoff/);
    expect(target).not.toHaveBeenCalled();
    f.geometry.dispose(); f.material.dispose(); custom.dispose(); f.device.dispose();
  });

  it("rejects invalid target sizes, matrices, missing scene resources, and unavailable backends", () => {
    const f = fixture();
    const source = { renderItems: [] };
    for (const [width, height] of [[0, 1], [1.5, 1], [1, -1], [4097, 4097], [Infinity, 1]]) {
      expect(() => captureNativeObjectMask({ ...f, source, width, height })).toThrow(/OBJECT_MASK_SIZE_INVALID/);
    }
    expect(() => captureNativeObjectMask({ ...f, source, viewProjectionMatrix: [1, 2] })).toThrow(/OBJECT_MASK_MATRIX_INVALID/);
    const scene = new Scene();
    const node = scene.createNode();
    node.renderable = new Renderable({ geometry: "missing", material: "missing" });
    scene.root.addChild(node);
    expect(() => captureNativeObjectMask({ ...f, source: { scene } })).toThrow(/OBJECT_MASK_RESOURCE_MISSING/);
    Object.defineProperty(f.device, "kind", { value: "webgpu" });
    expect(() => captureNativeObjectMask({ ...f, source })).toThrow(/OBJECT_MASK_BACKEND_UNSUPPORTED/);
    f.geometry.dispose(); f.material.dispose(); f.device.dispose();
  });

  it("restores caller target and disposes temporary resources on success and submission failure", () => {
    const f = fixture();
    const callerTarget = f.device.createRenderTarget({ width: 1, height: 1 });
    f.device.setRenderTarget(callerTarget);
    let target: RenderTarget | undefined;
    let shader: RenderShaderProgram | undefined;
    const realTarget = f.device.createRenderTarget.bind(f.device);
    const realShader = f.device.createShaderProgram.bind(f.device);
    vi.spyOn(f.device, "createRenderTarget").mockImplementation((descriptor) => target = realTarget(descriptor));
    vi.spyOn(f.device, "createShaderProgram").mockImplementation((sources) => shader = realShader(sources));
    const source = { renderItems: [{ geometry: f.geometry, material: f.material }] };
    captureNativeObjectMask({ ...f, source });
    expect(f.device.getRenderTarget()).toBe(callerTarget);
    expect(target?.disposed).toBe(true);
    expect(shader?.disposed).toBe(true);
    expect(f.geometry.vertexBuffer.uploadedBuffer?.disposed).toBe(false);
    expect(callerTarget.disposed).toBe(false);
    vi.spyOn(f.device, "draw").mockImplementationOnce(() => { throw new Error("draw failure"); });
    expect(() => captureNativeObjectMask({ ...f, source })).toThrow("draw failure");
    expect(f.device.getRenderTarget()).toBe(callerTarget);
    expect(target?.disposed).toBe(true);
    expect(shader?.disposed).toBe(true);
    f.device.beginFrame(1, 1); // failed capture ended its frame
    f.device.endFrame();
    f.geometry.dispose(); f.material.dispose(); callerTarget.dispose(); f.device.dispose();
  });

  it("disposes the target if shader creation fails and restores WebGL dithering after a failed draw", () => {
    const f = fixture();
    let target: RenderTarget | undefined;
    const createTarget = f.device.createRenderTarget.bind(f.device);
    vi.spyOn(f.device, "createRenderTarget").mockImplementation((descriptor) => target = createTarget(descriptor));
    vi.spyOn(f.device, "createShaderProgram").mockImplementationOnce(() => { throw new Error("compile failure"); });
    const source = { renderItems: [{ geometry: f.geometry, material: f.material }] };
    expect(() => captureNativeObjectMask({ ...f, source })).toThrow("compile failure");
    expect(target?.disposed).toBe(true);
    Object.defineProperty(f.device, "kind", { value: "webgl2" });
    expect(() => captureNativeObjectMask({ ...f, source })).toThrow(/OBJECT_MASK_DITHER_UNSUPPORTED/);
    const context = { DITHER: 3024, RASTERIZER_DISCARD: 35977, SAMPLE_COVERAGE: 32928, isEnabled: vi.fn((_value: number) => true), disable: vi.fn((_value: number) => {}), enable: vi.fn((_value: number) => {}) };
    vi.spyOn(f.device, "draw").mockImplementationOnce(() => { throw new Error("raster failure"); });
    expect(() => captureNativeObjectMask({ ...f, source, webgl2Context: context })).toThrow("raster failure");
    expect(context.disable).toHaveBeenCalledWith(3024);
    expect(context.enable).toHaveBeenCalledWith(3024);
    expect(context.disable.mock.calls.map(([value]) => value)).toEqual([3024, 35977, 32928]);
    expect(context.enable.mock.calls.map(([value]) => value)).toEqual([32928, 35977, 3024]);
    expect(target?.disposed).toBe(true);
    f.geometry.dispose(); f.material.dispose(); f.device.dispose();
  });

  it("attempts all cleanup steps and preserves the draw failure when cleanup also fails", () => {
    const f = fixture();
    const prior = f.device.createRenderTarget({ width: 1, height: 1 });
    f.device.setRenderTarget(prior);
    let target: RenderTarget | undefined;
    let shader: RenderShaderProgram | undefined;
    const createTarget = f.device.createRenderTarget.bind(f.device);
    const createShader = f.device.createShaderProgram.bind(f.device);
    vi.spyOn(f.device, "createRenderTarget").mockImplementation((descriptor) => target = createTarget(descriptor));
    vi.spyOn(f.device, "createShaderProgram").mockImplementation((sources) => shader = createShader(sources));
    vi.spyOn(f.device, "draw").mockImplementationOnce(() => { throw new Error("primary draw failure"); });
    const endFrame = f.device.endFrame.bind(f.device);
    vi.spyOn(f.device, "endFrame").mockImplementationOnce(() => { endFrame(); throw new Error("end frame failure"); });
    let failure: unknown;
    try { captureNativeObjectMask({ ...f, source: { renderItems: [{ geometry: f.geometry, material: f.material }] } }); }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map((error) => (error as Error).message)).toEqual(["primary draw failure", "end frame failure"]);
    expect(f.device.getRenderTarget()).toBe(prior);
    expect(target?.disposed).toBe(true);
    expect(shader?.disposed).toBe(true);
    expect(f.geometry.vertexBuffer.uploadedBuffer?.disposed).toBe(false);
    f.geometry.dispose(); f.material.dispose(); prior.dispose(); f.device.dispose();
  });
});

describe("Aura-only object-mask page", () => {
  function pageFixture() {
    const f = fixture();
    const state: AuraMaskPageState = {};
    const body = { dataset: {} as DOMStringMap };
    const host = { style: {} } as HTMLElement;
    const pageHide: Array<() => void> = [];
    const environment: AuraMaskPageEnvironment = {
      search: "?engine=aura3d&scene=aura-native-mask&pass=mask&dpr=2",
      host, state, body, onPageHide: (callback) => pageHide.push(callback)
    };
    const spec = {
      id: "aura-native-mask", resolution: { width: 2, height: 1, devicePixelRatio: 1 },
      objects: [{ kind: "primitive", name: "triangle", shape: "box", size: [1, 1, 1], position: [0, 0, 0], material: { color: "#ffffff", roughness: 1, metalness: 0 }, castShadow: true, receiveShadow: true }],
      lights: [], background: { kind: "color", color: "#000000" },
      camera: { position: [0, 0, 4], target: [0, 0, 0], fov: 45, near: 0.1, far: 100 },
      toneMapping: "aces-filmic", exposure: 1, time: 0, settleFrames: 0
    } as unknown as SceneSpec;
    const payload = { engine: "aura3d", scene: spec.id, engineVersion: "test", warnings: [], errors: [], capabilityLog: [], loadMs: 0 } as ReadyPayload;
    const canvas = { width: 2, height: 1, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    const frame = { device: f.device, source: { renderItems: [{ geometry: f.geometry, material: f.material, label: "native triangle" }] }, camera: { viewProjectionMatrix: identity }, canvas, width: 2, height: 1 };
    const accessor = vi.fn(() => frame);
    const disarm = vi.fn();
    const arm = vi.fn(() => disarm);
    const renderer = { [Symbol.for("a3d.benchmark.lastFrame")]: accessor, [Symbol.for("a3d.benchmark.armFrameSnapshot")]: arm };
    const dispose = vi.fn();
    const step = vi.fn();
    const app = { [Symbol.for("a3d.prd01.renderer")]: renderer, dispose, step } as unknown as AuraApp;
    const dependencies: AuraMaskPageDependencies = {
      getScene: vi.fn(async () => spec),
      runScene: vi.fn(async (_spec, _host, options) => { options.collectExtra(app); return payload; }),
      encodePng: vi.fn(() => "data:image/png;base64,AQID"),
      allowMockDevice: true
    };
    return { ...f, state, body, host, environment, dependencies, spec, payload, frame, accessor, renderer, app, dispose, step, arm, disarm, pageHide };
  }

  it("mounts the native scene, submits an ID draw, reads it back, and publishes the page result", async () => {
    const f = pageFixture();
    vi.spyOn(f.device, "readPixels").mockReturnValue(Uint8Array.from([1, 0, 0, 255, 0, 0, 0, 0]));
    await runAuraMaskPage(f.environment, f.dependencies);
    expect(f.dependencies.getScene).toHaveBeenCalledWith("aura-native-mask");
    expect(f.dependencies.runScene).toHaveBeenCalledWith(f.spec, f.host, expect.objectContaining({ dpr: 2 }));
    expect(f.host.style).toMatchObject({ width: "2px", height: "1px" });
    expect(f.accessor).toHaveBeenCalledOnce();
    expect(f.arm).toHaveBeenCalledOnce();
    expect(f.step).toHaveBeenCalledWith(0);
    expect(f.disarm).toHaveBeenCalledOnce();
    expect(f.arm.mock.invocationCallOrder[0]).toBeLessThan(f.step.mock.invocationCallOrder[0]!);
    expect(f.step.mock.invocationCallOrder[0]).toBeLessThan(f.accessor.mock.invocationCallOrder[0]!);
    expect(f.accessor.mock.invocationCallOrder[0]).toBeLessThan(f.disarm.mock.invocationCallOrder[0]!);
    expect(f.device.drawCommands.map((draw) => draw.label)).toEqual(["object-mask:1:native triangle"]);
    expect(f.dependencies.encodePng).toHaveBeenCalledWith(expect.objectContaining({ origin: "bottom-left", ids: Uint32Array.from([1, 0]) }));
    expect(f.state.__QR_MASKS__).toEqual({ "object-id": { dataUrl: "data:image/png;base64,AQID", width: 2, height: 1, bytes: 3 } });
    expect(f.state.__QR_MASK_INDEX__).toEqual(["object-id"]);
    expect(f.state.__QR_OBJECT_IDS__).toEqual([{ id: 1, key: "native triangle", visible: true }]);
    expect(f.state.__QR_READY__).toBe(f.payload);
    expect(f.body.dataset.qrReady).toBe("true");
    expect(f.dispose).not.toHaveBeenCalled();
    f.pageHide[0]!();
    expect(f.dispose).toHaveBeenCalledOnce();
    f.geometry.dispose(); f.material.dispose(); f.device.dispose();
  });

  it("targets the isolated Aura HTML entry in its own Vite configuration", () => {
    expect(String(auraMaskViteConfig.build?.rollupOptions?.input)).toMatch(/quality-rebuild\/aura-mask\.html$/);
    expect(auraMaskViteConfig.define).toHaveProperty("__AURA3D_VERSION__");
    expect(auraMaskViteConfig.publicDir).toBe(false);
    expect(auraMaskViteConfig.plugins ?? []).toEqual([]);
    const aliases = auraMaskViteConfig.resolve?.alias;
    expect(Array.isArray(aliases)).toBe(true);
    if (!Array.isArray(aliases)) throw new Error("Expected explicit Aura aliases.");
    expect(aliases.some(({ find, replacement }) => /(?:^|\/)(?:three|comparisons|historical)(?:\/|$)/i.test(String(find)) || /(?:^|\/)(?:three|comparisons|historical)(?:\/|$)/i.test(replacement))).toBe(false);
  });

  it("keeps the Aura page's benchmark source graph independent of historical adapters", () => {
    const root = resolve("benchmarks/quality-rebuild");
    const pending = [resolve(root, "aura-mask.ts")];
    const seen = new Set<string>();
    while (pending.length) {
      const file = pending.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      expect(file).not.toMatch(/(?:^|\/)three(?:\/|$)/);
      expect(file).not.toMatch(/(?:^|\/)bloomMapping\.ts$/);
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && node.expression.getText(source) === "import.meta.glob") throw new Error(`Unexpected glob in Aura page source graph: ${file}`);
        let specifier: string | undefined;
        if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifier = node.moduleSpecifier.text;
        if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifier = node.moduleSpecifier.text;
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) specifier = node.arguments[0].text;
        if (specifier) {
          expect(specifier === "three" || specifier.startsWith("three/")).toBe(false);
          if (specifier.startsWith(".")) {
            const base = resolve(dirname(file), specifier.replace(/\.js$/, ""));
            const candidate = [base, `${base}.ts`, resolve(base, "index.ts")].find((value) => value.endsWith(".ts") && existsSync(value));
            if (candidate && candidate.startsWith(root + sep)) pending.push(candidate);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(seen.has(resolve(root, "aura3d/common.ts"))).toBe(false);
    expect(seen.has(resolve(root, "shared/scenes.ts"))).toBe(false);
    expect(seen.has(resolve(root, "shared/procedural.ts"))).toBe(false);
    expect(seen.has(resolve(root, "aura3d/lib/mask.ts"))).toBe(true);
  });

  it("resolves the independent Aura scene specification without loading the mixed router", async () => {
    const f = pageFixture();
    const runScene = vi.fn(async (spec: AuraMaskSceneSpec, _host: HTMLElement, options: Parameters<AuraMaskPageDependencies["runScene"]>[2]) => {
      expect(spec.id).toBe("aura-native-mask");
      expect(spec.objects.length).toBeGreaterThan(0);
      options.collectExtra(f.app);
      return f.payload;
    });
    await runAuraMaskPage(f.environment, { ...auraMaskPageDependencies, runScene, encodePng: f.dependencies.encodePng, allowMockDevice: true });
    expect(runScene).toHaveBeenCalledOnce();
    expect(await auraMaskPageDependencies.getScene("01-simple-geometry")).toBeUndefined();
    expect(f.state.__QR_READY__).toBe(f.payload);
    expect(f.device.drawCommands).toHaveLength(1);
    f.geometry.dispose(); f.material.dispose(); f.device.dispose();
  });

  it("connects the page, public app, guarded renderer snapshot and mask draw on a mock device", async () => {
    class FakeCanvas {
      width = 64; height = 64; clientWidth = 64; clientHeight = 64;
      style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
      getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
      hasAttribute() { return false; }
      getContext(kind: string) {
        return kind === "webgl2" ? { DITHER: 1, RASTERIZER_DISCARD: 2, SAMPLE_COVERAGE: 3, getParameter: () => 4096, isEnabled: () => false, disable() {}, enable() {} } : null;
      }
      addEventListener() {} removeEventListener() {}
    }
    vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
    vi.stubGlobal("WebGL2RenderingContext", { MAX_TEXTURE_SIZE: 4 });
    vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { href: "http://localhost/", search: "" }, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("__AURA3D_VERSION__", "test");
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { queueMicrotask(() => callback(0)); return 1; });
    const create = Renderer.create.bind(Renderer);
    let device: MockRenderDevice | undefined;
    vi.spyOn(Renderer, "create").mockImplementation(async (options) => {
      const renderer = await create({ ...options, backend: "mock", requiredFeatures: [] });
      device = renderer.device as MockRenderDevice;
      // The public app requires WebGL capabilities to mount; the device stays
      // a MockRenderDevice and this test makes no assertion about pixels.
      Object.defineProperty(device, "kind", { value: "webgl2" });
      Object.defineProperty(device, "info", { value: { ...device.info, capabilities: [...(device.info.capabilities ?? []), "hdr-render-targets"] } });
      return renderer;
    });
    const state: AuraMaskPageState = {};
    const pageHide: Array<() => void> = [];
    const canvas = new FakeCanvas();
    const environment: AuraMaskPageEnvironment = {
      search: "?scene=aura-native-mask&mask=object-id&dpr=1", host: canvas as unknown as HTMLElement,
      state, body: { dataset: {} as DOMStringMap }, onPageHide: (callback) => pageHide.push(callback)
    };
    try {
      await runAuraMaskPage(environment, {
        ...auraMaskPageDependencies,
        async getScene(id) {
          const spec = await auraMaskPageDependencies.getScene(id);
          return spec && { ...spec, resolution: { width: 64, height: 64, devicePixelRatio: 1 }, settleFrames: 0 };
        },
        encodePng: () => "data:image/png;base64,AQID"
      });
      expect(state.__QR_ERROR__).toBeUndefined();
      expect(state.__QR_MASK_INDEX__).toEqual(["object-id"]);
      const objects = state.__QR_OBJECT_IDS__ ?? [];
      expect(objects).toHaveLength(3);
      for (const name of ["mask-ground", "mask-cube", "mask-orb"]) {
        expect(objects.some((object) => object.key.endsWith(`:${name}`))).toBe(true);
      }
      expect(device?.drawCommands.filter((draw) => draw.label?.startsWith("object-mask:"))).toHaveLength(3);
      expect(pageHide).toHaveLength(1);
    } finally {
      for (const hide of pageHide) hide();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it("builds the asset-free benchmark fixture from native scene builders and rejects unsupported inputs", async () => {
    const spec = await auraMaskPageDependencies.getScene("aura-native-mask");
    expect(spec).toBeDefined();
    const native = { scene, camera, lights, material, primitives };
    const snapshot = buildAuraMaskScene(spec!, native).toJSON();
    const meshes = snapshot.nodes.filter((node) => node.kind === "primitive");
    expect(meshes.map((node) => node.name)).toEqual(["mask-ground", "mask-cube", "mask-orb"]);
    expect(meshes.map((node) => node.kind === "primitive" ? node.primitive : undefined)).toEqual(["plane", "box", "sphere"]);
    expect(snapshot.camera.position).toEqual(spec!.camera.position);
    expect(snapshot.camera.target).toEqual(spec!.camera.target);
    expect(snapshot.camera.fov).toBe(spec!.camera.fov);
    expect(meshes[1]).toMatchObject({ position: [-1, 0, 0], size: [1.2, 1.2, 1.2] });
    expect(() => buildAuraMaskScene({ ...spec!, fog: { color: "#ffffff", density: 0.1 } }, native)).toThrow(/OBJECT_MASK_SCENE_UNSUPPORTED/);
    expect(() => buildAuraMaskScene({ ...spec!, objects: [{ ...spec!.objects[0]!, kind: "particles" }] } as SceneSpec, native)).toThrow(/OBJECT_MASK_SCENE_UNSUPPORTED/);
    const first = spec!.objects[0]!;
    if (first.kind !== "primitive") throw new Error("Fixture must start with a primitive.");
    expect(() => buildAuraMaskScene({ ...spec!, objects: [{ ...first, material: { ...first.material, opacity: 0.5 } }] }, native)).toThrow(/opaque primitive subset/);
  });

  it("flips native readback rows before encoding PNG", () => {
    const bottomRow = [1, 0, 0, 255, 2, 0, 0, 255];
    const topRow = [3, 0, 0, 255, 4, 0, 0, 255];
    const pixels = new Uint8ClampedArray(16);
    const put = vi.fn();
    const context = { createImageData: vi.fn(() => ({ data: pixels })), putImageData: put };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), toDataURL: vi.fn(() => "data:image/png;base64,AQID") } as unknown as HTMLCanvasElement;
    const png = objectMaskPng({ backend: "mock", width: 2, height: 2, origin: "bottom-left", rgba: Uint8Array.from([...bottomRow, ...topRow]), ids: Uint32Array.from([1, 2, 3, 4]), objects: [] }, () => canvas);
    expect(png).toBe("data:image/png;base64,AQID");
    expect(Array.from(pixels)).toEqual([...topRow, ...bottomRow]);
    expect(put).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(2);
    expect(() => objectMaskPng({ backend: "mock", width: 2, height: 2, origin: "bottom-left", rgba: new Uint8Array(4), ids: new Uint32Array(1), objects: [] }, () => canvas)).toThrow(/OBJECT_MASK_PNG_INVALID/);
  });

  it("reports missing, busy, stale, and unsupported paths without publishing a mask", async () => {
    const f = pageFixture();
    delete (f.renderer as Record<symbol, unknown>)[Symbol.for("a3d.benchmark.lastFrame")];
    await runAuraMaskPage(f.environment, f.dependencies);
    expect(f.state.__QR_ERROR__).toMatch(/OBJECT_MASK_FRAME_UNAVAILABLE/);
    expect(f.state.__QR_READY__).toBeUndefined();
    expect(f.state.__QR_MASKS__).toBeUndefined();
    expect(f.dispose).toHaveBeenCalledTimes(1);
    (f.renderer as Record<symbol, unknown>)[Symbol.for("a3d.benchmark.lastFrame")] = () => { throw new Error("BENCHMARK_FRAME_BUSY"); };
    await runAuraMaskPage(f.environment, f.dependencies);
    expect(f.state.__QR_ERROR__).toMatch(/BENCHMARK_FRAME_BUSY/);
    expect(f.dispose).toHaveBeenCalledTimes(2);
    expect(f.disarm).toHaveBeenCalledTimes(1);
    (f.renderer as Record<symbol, unknown>)[Symbol.for("a3d.benchmark.lastFrame")] = () => ({ ...f.frame, width: 3 });
    await runAuraMaskPage(f.environment, f.dependencies);
    expect(f.state.__QR_ERROR__).toMatch(/incomplete or stale/);
    expect(f.state.__QR_MASKS__).toBeUndefined();
    const unsupported = { ...f.environment, search: "?mask=sky" };
    await runAuraMaskPage(unsupported, f.dependencies);
    expect(f.state.__QR_ERROR__).toMatch(/OBJECT_MASK_KIND_UNSUPPORTED/);
    expect(f.body.dataset.qrError).toBe("true");
    expect(f.body.dataset.qrReady).toBeUndefined();
    f.geometry.dispose(); f.material.dispose(); f.device.dispose();
  });

  it("rejects mock rasterization on the real page unless the source test injects it", async () => {
    const f = pageFixture();
    await runAuraMaskPage(f.environment, { ...f.dependencies, allowMockDevice: false });
    expect(f.state.__QR_ERROR__).toMatch(/mock device cannot provide rasterized pixels/);
    expect(f.state.__QR_MASKS__).toBeUndefined();
    expect(f.device.drawCommands).toHaveLength(0);
    expect(f.dispose).toHaveBeenCalledOnce();
    f.geometry.dispose(); f.material.dispose(); f.device.dispose();
  });

  it("refuses asset-backed scenes before mounting and propagates failed app cleanup", async () => {
    const f = pageFixture();
    const assetSpec = { ...f.spec, objects: [{ kind: "model" }] } as unknown as SceneSpec;
    const getScene = vi.fn(async () => assetSpec);
    await runAuraMaskPage(f.environment, { ...f.dependencies, getScene });
    expect(f.state.__QR_ERROR__).toMatch(/OBJECT_MASK_ASSET_UNSUPPORTED/);
    expect(f.dependencies.runScene).not.toHaveBeenCalled();
    f.accessor.mockImplementation(() => { throw new Error("BENCHMARK_FRAME_UNSUPPORTED"); });
    f.dispose.mockImplementation(() => { throw new Error("dispose failed"); });
    await runAuraMaskPage(f.environment, f.dependencies);
    expect(f.state.__QR_ERROR__).toMatch(/cleanup failed/);
    expect(f.state.__QR_READY__).toBeUndefined();
    f.geometry.dispose(); f.material.dispose(); f.device.dispose();
  });
});
