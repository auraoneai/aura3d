/** Viewport, scissor, array/stereo cameras and XR device viewport hooks. */

import { describe, expect, it, vi } from "vitest";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { computePerspectiveCameraFrame } from "../../../packages/rendering/src/CameraFraming";
import { ScreenSpaceLineMaterial } from "../../../packages/rendering/src/ScreenSpaceLineMaterial";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import "../../../packages/rendering/src/lanes/prd01";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { rendererProgramCache } from "../../../packages/rendering/src/renderer/qrSubFlags";
import { MockRenderDevice, MockRenderTarget, RenderDeviceError, type DrawCommand, type MockDrawViewState, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { Renderable, Scene } from "@aura3d/scene";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { DeferredPipeline } from "../../../packages/rendering/src/webgpu/DeferredPipeline";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { cameras } from "../../../packages/engine/src/agent-api/nodes/cameras";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { AuraRuntimeError } from "../../../packages/engine/src/agent-api/compiler/errors";
import { createProductionParitySurfaces } from "../../../packages/engine/src/agent-api/compiler/paritySurfaces";
import { isAuraCameraArrayNode, isAuraCameraStereoNode } from "../../../packages/engine/src/agent-api/nodes/cameras";
import { computeStereoEyes } from "../../../packages/engine/src/agent-api/stereoMath";

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function drawTriangle(device: MockRenderDevice): void {
  const geometry = Geometry.triangle();
  const vertexBuffer = geometry.vertexBuffer.upload(device);
  const shader = device.createShaderProgram({
    label: "viewport-test",
    marker: "@aura3d-test:viewport",
    vertex: "#version 300 es\n// @aura3d-test:viewport\nin vec3 a_position;\nvoid main(){gl_Position=vec4(a_position,1.0);}",
    fragment: "#version 300 es\n// @aura3d-test:viewport\nprecision mediump float;\nout vec4 o;\nvoid main(){o=vec4(1.0);}"
  });
  device.draw({ topology: "triangles", vertexBuffer, vertexFormat: geometry.vertexBuffer.format, vertexCount: geometry.vertexBuffer.vertexCount, shader });
}

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe("MockRenderDevice viewport / scissor recording (SC-01)", () => {
  it("records viewport, scissor and scissorTest calls in order, with bounds", () => {
    const device = new MockRenderDevice();
    device.beginFrame(64, 32);
    device.setViewport(4, 6, 20, 10);
    device.setScissor(5, 7, 8, 9);
    device.setScissorTest(true);
    expect(device.getViewportCalls()).toEqual([
      { call: "viewport", args: [4, 6, 20, 10], persistent: false },
      { call: "scissor", args: [5, 7, 8, 9] },
      { call: "scissorTest", args: [true] }
    ]);
    device.endFrame();
  });

  it("stamps each draw with the viewport/scissor in force", () => {
    const device = new MockRenderDevice();
    device.beginFrame(64, 32);
    drawTriangle(device);
    device.setViewport(0, 0, 32, 32);
    device.setScissor(0, 0, 32, 32);
    device.setScissorTest(true);
    drawTriangle(device);
    device.setViewport(32, 0, 32, 32);
    device.setScissor(32, 0, 32, 32);
    drawTriangle(device);
    device.setScissorTest(false);
    drawTriangle(device);
    device.endFrame();
    const states = device.getDrawViewStates();
    expect(states.map((s) => s.viewport)).toEqual([rect(0, 0, 64, 32), rect(0, 0, 32, 32), rect(32, 0, 32, 32), rect(32, 0, 32, 32)]);
    expect(states.map((s) => s.scissor)).toEqual([null, rect(0, 0, 32, 32), rect(32, 0, 32, 32), null]);
    expect(states.every((s) => s.destination === "canvas" && s.framebuffer === null)).toBe(true);
  });

  it("frame-scoped state resets at beginFrame; a render target never inherits the canvas override", () => {
    const device = new MockRenderDevice();
    device.beginFrame(64, 32);
    device.setViewport(8, 8, 16, 16);
    device.setScissor(8, 8, 16, 16);
    device.setScissorTest(true);
    const target = device.createRenderTarget({ width: 10, height: 10, label: "rt" });
    device.setRenderTarget(target);
    drawTriangle(device);
    device.setRenderTarget(null);
    drawTriangle(device);
    device.endFrame();
    const [onTarget, onCanvas] = device.getDrawViewStates() as [MockDrawViewState, MockDrawViewState];
    expect(onTarget.viewport).toEqual(rect(0, 0, 10, 10));
    expect(onTarget.scissor).toBeNull();
    expect(onTarget.destination).toBe("render-target");
    expect(onCanvas.viewport).toEqual(rect(8, 8, 16, 16));
    expect(onCanvas.scissor).toEqual(rect(8, 8, 16, 16));
    device.beginFrame(64, 32);
    drawTriangle(device);
    device.endFrame();
    expect(device.getDrawViewStates()[0]).toMatchObject({ viewport: rect(0, 0, 64, 32), scissor: null });
  });

  it("a persistent viewport survives beginFrame, only applies to the default framebuffer, and resetViewport clears it", () => {
    const device = new MockRenderDevice();
    device.beginFrame(64, 32);
    device.setViewport(10, 4, 30, 20, { persistent: true });
    device.endFrame();
    device.beginFrame(64, 32);
    const target = device.createRenderTarget({ width: 12, height: 12, label: "post-target" });
    device.setRenderTarget(target);
    drawTriangle(device);
    device.setRenderTarget(null);
    drawTriangle(device);
    device.endFrame();
    const [post, present] = device.getDrawViewStates() as [MockDrawViewState, MockDrawViewState];
    expect(post.viewport).toEqual(rect(0, 0, 12, 12));
    expect(present.viewport).toEqual(rect(10, 4, 30, 20));
    device.beginFrame(64, 32);
    device.resetViewport();
    drawTriangle(device);
    device.endFrame();
    expect(device.getDrawViewStates()[0]!.viewport).toEqual(rect(0, 0, 64, 32));
  });

  it("a frame-scoped viewport wins over the persistent one for the same frame", () => {
    const device = new MockRenderDevice();
    device.setViewport(10, 4, 30, 20, { persistent: true });
    device.beginFrame(64, 32);
    device.setViewport(1, 2, 3, 4);
    drawTriangle(device);
    device.endFrame();
    expect(device.getDrawViewStates()[0]!.viewport).toEqual(rect(1, 2, 3, 4));
  });

  it("setExternalFramebuffer redirects canvas draws until called with null", () => {
    const device = new MockRenderDevice();
    const fb = { xr: "framebuffer" };
    device.setExternalFramebuffer(fb, 128, 96);
    expect(device.getExternalFramebuffer()).toEqual({ handle: fb, width: 128, height: 96 });
    device.beginFrame(64, 32);
    drawTriangle(device);
    device.endFrame();
    expect(device.getDrawViewStates()[0]).toMatchObject({ destination: "external", framebuffer: fb, viewport: rect(0, 0, 128, 96) });
    device.setExternalFramebuffer(null, 0, 0);
    expect(device.getExternalFramebuffer()).toBeNull();
    device.beginFrame(64, 32);
    drawTriangle(device);
    device.endFrame();
    expect(device.getDrawViewStates()[0]).toMatchObject({ destination: "canvas", framebuffer: null, viewport: rect(0, 0, 64, 32) });
  });

  it("a persistent viewport applies to the external framebuffer; render targets stay off it", () => {
    const device = new MockRenderDevice();
    const fb = { xr: "framebuffer" };
    device.setExternalFramebuffer(fb, 200, 100);
    device.setViewport(100, 0, 100, 100, { persistent: true });
    device.beginFrame(200, 100);
    drawTriangle(device);
    device.endFrame();
    expect(device.getDrawViewStates()[0]).toMatchObject({ destination: "external", framebuffer: fb, viewport: rect(100, 0, 100, 100) });
  });

  it("rejects invalid viewport and external-framebuffer dimensions", () => {
    const device = new MockRenderDevice();
    expect(() => device.setViewport(0, 0, 0, 5)).toThrow(RenderDeviceError);
    expect(() => device.setExternalFramebuffer({}, 0, 10)).toThrow(RenderDeviceError);
    expect(() => device.setExternalFramebuffer({}, 10, -1)).toThrow(RenderDeviceError);
  });
});

describe("Renderer automatic camera matrices", () => {
  it.each(["sync", "async"] as const)("supplies auto-frame view and projection to world-unit lines (%s)", async (mode) => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const geometry = Geometry.screenSpaceLineSegments([{ start: [0, 0, -1], end: [1, 0, -2] }]);
    const material = new ScreenSpaceLineMaterial({ width: 0.5, worldUnits: true });
    const bounds = { min: [-1, -2, -3] as const, max: [2, 1, 0] as const };
    const frameOptions = { paddingRatio: 0.14, yawRadians: -0.38, pitchRadians: -0.18, nearPadding: 0.2, farPadding: 2.4 };
    const expected = computePerspectiveCameraFrame(bounds, { width: 100, height: 50 }, frameOptions);
    const input = { renderItems: [{ geometry, material }], cameraPolicy: "auto-frame" as const, cameraFrameBounds: bounds };
    if (mode === "sync") renderer.render(input); else await renderer.renderAsync(input);
    const draw = (renderer.device as MockRenderDevice).drawCommands[0]!;
    expect(Array.from(draw.uniforms!.get("u_viewMatrix") as Float32Array)).toEqual(expected.viewMatrix.map(Math.fround));
    expect(Array.from(draw.uniforms!.get("u_projectionMatrix") as Float32Array)).toEqual(expected.projectionMatrix.map(Math.fround));
    expect(draw.uniforms!.get("u_lineWorldUnits")).toBe(1);
    renderer.dispose();
    geometry.dispose();
    material.dispose();
  });
});

describe("Renderer view isolation", () => {
  const item = (label = "cube", x = 0, layerMask = 1) => {
    const modelMatrix = IDENTITY.slice();
    modelMatrix[12] = x;
    return { geometry: Geometry.litCube(1), material: new PBRMaterial({ name: label }), label, modelMatrix, layerMask, includeInAutoFrame: false };
  };

  interface RecordedDraw {
    readonly command: DrawCommand;
    readonly state: MockDrawViewState;
    readonly target: RenderTarget | null;
    readonly sampledTargets: readonly { readonly id: number; readonly width: number; readonly height: number; readonly firstPixel: readonly number[] }[];
  }
  const instrument = (device: MockRenderDevice) => {
    const frames: RecordedDraw[][] = [];
    const targets: RenderTarget[] = [];
    const clearTargets: Array<RenderTarget | null> = [];
    let frame: RecordedDraw[] = [];
    const createTarget = device.createRenderTarget.bind(device);
    const draw = device.draw.bind(device);
    const clear = device.clear.bind(device);
    const endFrame = device.endFrame.bind(device);
    device.createRenderTarget = (descriptor) => {
      const target = createTarget(descriptor);
      targets.push(target);
      return target;
    };
    device.clear = (color) => { clearTargets.push(device.getRenderTarget()); clear(color); };
    device.draw = (command) => {
      draw(command);
      const sampledTargets = [...(command.uniforms?.values() ?? [])].flatMap((value) => {
        if (!(value instanceof TextureBinding) || !value.texture) return [];
        const source = targets.find((target) => target.colorTexture === value.texture);
        return source instanceof MockRenderTarget
          ? [{ id: source.id, width: source.width, height: source.height, firstPixel: Array.from(source.colorPixels.slice(0, 4)) }]
          : [];
      });
      frame.push({ command, state: device.getDrawViewStates().at(-1)!, target: device.getRenderTarget(), sampledTargets });
    };
    device.endFrame = () => { frames.push(frame); frame = []; endFrame(); };
    return { frames, targets, clearTargets };
  };

  const viewCamera = (x = 0, layerMask = 1) => {
    const matrix = IDENTITY.slice();
    matrix[12] = -x;
    return { viewProjectionMatrix: matrix, layerMask };
  };
  const source = () => ({ renderItems: [item()], cameraPolicy: "require" as const, frustumCulling: false });

  it("renders each view to a separate sized target and composites in order with independent clipping", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const seen = instrument(renderer.device as MockRenderDevice);
    const left = rect(0, 0, 50, 50);
    const right = rect(50, 0, 50, 50);
    const crop = rect(55, 5, 30, 35);
    renderer.render({ source: source(), views: [
      { id: "left", camera: viewCamera(), viewport: left },
      { id: "right", camera: viewCamera(), viewport: right, scissor: crop }
    ] });
    expect(seen.frames).toHaveLength(3);
    const first = seen.frames[0]!.find((draw) => draw.command.label === "cube")!;
    const second = seen.frames[1]!.find((draw) => draw.command.label === "cube")!;
    expect(first.target).not.toBeNull();
    expect(second.target).not.toBeNull();
    expect(first.target!.id).not.toBe(second.target!.id);
    expect([first.target!.width, first.target!.height, second.target!.width, second.target!.height]).toEqual([50, 50, 50, 50]);
    const composite = seen.frames[2]!;
    expect(composite).toHaveLength(2);
    expect(composite.map((draw) => draw.state)).toMatchObject([
      { destination: "canvas", viewport: left, scissor: left },
      { destination: "canvas", viewport: right, scissor: crop }
    ]);
    expect(composite[0]!.sampledTargets[0]!.id).toBe(first.target!.id);
    expect(composite[1]!.sampledTargets[0]!.id).toBe(second.target!.id);
    expect(seen.clearTargets.filter((target) => target === null)).toHaveLength(1);
    expect(renderer.info.render.frame).toBe(1);
    renderer.dispose();
  });

  it("recomputes culling, camera matrices and layers for each view", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const seen = instrument(renderer.device as MockRenderDevice);
    const items = [item("left-visible", 0, 1), item("left-wrong-layer", 0, 2), item("right-wrong-layer", 3, 1), item("right-visible", 3, 2)];
    renderer.render({ source: { renderItems: items, cameraPolicy: "require", frustumCulling: true }, views: [
      { camera: viewCamera(0, 1), viewport: rect(0, 0, 50, 50) },
      { camera: viewCamera(3, 2), viewport: rect(50, 0, 50, 50) }
    ] });
    expect(seen.frames[0]!.map((draw) => draw.command.label)).toEqual(["left-visible"]);
    expect(seen.frames[1]!.map((draw) => draw.command.label)).toEqual(["right-visible"]);
    renderer.dispose();
  });

  it("frustum-culls Scene renderables independently for matrix-only views (no Camera instance)", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const seen = instrument(renderer.device as MockRenderDevice);
    const graph = new Scene();
    for (const [name, x] of [["scene-left", 0], ["scene-right", 3]] as const) {
      const node = graph.createNode(name);
      graph.root.addChild(node);
      node.transform.setPosition(x, 0, 0);
      node.renderable = new Renderable({ geometry: "geometry:cube", material: "material:unlit" });
    }
    const geometry = Geometry.cube(0.5), material = new UnlitMaterial();
    try {
      const diagnostics = renderer.render({ source: { scene: graph, geometryLibrary: { "geometry:cube": geometry },
        materialLibrary: { "material:unlit": material }, cameraPolicy: "require" }, views: [
        { camera: viewCamera(0), viewport: rect(0, 0, 50, 50) },
        { camera: viewCamera(3), viewport: rect(50, 0, 50, 50) }
      ] });
      expect(seen.frames[0]!.map((draw) => draw.command.label)).toEqual(["scene-left"]);
      expect(seen.frames[1]!.map((draw) => draw.command.label)).toEqual(["scene-right"]);
      expect(diagnostics).toBeDefined();
    } finally { renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("sorts transparent items from each view's camera position", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const seen = instrument(renderer.device as MockRenderDevice);
    const transparent = new UnlitMaterial({ renderState: { blend: true, depthWrite: false } });
    const objects = [
      { ...item("near-left", -2), material: transparent },
      { ...item("near-right", 2), material: transparent }
    ];
    renderer.render({ source: { renderItems: objects, cameraPolicy: "require", frustumCulling: false }, views: [
      { camera: viewCamera(), cameraPosition: [-5, 0, 0], viewport: rect(0, 0, 50, 50) },
      { camera: viewCamera(), cameraPosition: [5, 0, 0], viewport: rect(50, 0, 50, 50) }
    ] });
    expect(seen.frames[0]!.map((draw) => draw.command.label)).toEqual(["near-right", "near-left"]);
    expect(seen.frames[1]!.map((draw) => draw.command.label)).toEqual(["near-left", "near-right"]);
    renderer.dispose();
  });

  it("collects one-shot render items once and makes them available to every view", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const seen = instrument(renderer.device as MockRenderDevice);
    const iterator = [item("collected")][Symbol.iterator]();
    let collections = 0;
    renderer.render({ source: {
      collectRenderItems: () => { collections += 1; return iterator; },
      cameraPolicy: "require", frustumCulling: false
    }, views: [
      { camera: viewCamera(), viewport: rect(0, 0, 50, 50) },
      { camera: viewCamera(), viewport: rect(50, 0, 50, 50) }
    ] });
    expect(collections).toBe(1);
    expect(seen.frames[0]!.map((draw) => draw.command.label)).toEqual(["collected"]);
    expect(seen.frames[1]!.map((draw) => draw.command.label)).toEqual(["collected"]);
    renderer.dispose();
  });

  it("inherits, replaces and disables postprocessing independently across views", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 120, height: 40, clearColor: [0.5, 0.5, 0.5, 1] });
    const seen = instrument(renderer.device as MockRenderDevice);
    const tone = (exposure: number) => ({ execution: "cpu-deterministic" as const, targetFormat: "rgba8" as const,
      toneMapping: { exposure, gamma: 1, operator: "reinhard" as const, outputColorSpace: "linear" as const } });
    renderer.render({ source: { ...source(), postprocess: tone(1) }, views: [
      { id: "inherit", camera: viewCamera(), viewport: rect(0, 0, 40, 40) },
      { id: "dim", camera: viewCamera(), viewport: rect(40, 0, 40, 40), postprocess: tone(0.25) },
      { id: "raw", camera: viewCamera(), viewport: rect(80, 0, 40, 40), postprocess: false }
    ] });
    const outputs = seen.frames.at(-1)!.map((draw) => draw.sampledTargets[0]!);
    expect(outputs).toHaveLength(3);
    expect(new Set(outputs.map((target) => target.id)).size).toBe(3);
    // Mock rendering deliberately does not rasterize. The first pixel reflects
    // the clear color flowing through the actual CPU postprocess path.
    expect(outputs[1]!.firstPixel[0]).toBeLessThan(outputs[0]!.firstPixel[0]!);
    expect(outputs[0]!.firstPixel[0]).toBeLessThan(outputs[2]!.firstPixel[0]!);
    expect(outputs[2]!.firstPixel).toEqual([128, 128, 128, 255]);
    renderer.dispose();
  });

  it("resizes each target, releases obsolete storage and uses the new view dimensions", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const seen = instrument(renderer.device as MockRenderDevice);
    const sizes: number[][] = [];
    const cam = { viewProjectionMatrix: IDENTITY, resize: (width: number, height: number) => sizes.push([width, height]) };
    const render = (width: number, height: number) => renderer.render({ source: source(), views: [
      { id: "a", camera: cam, viewport: rect(0, 0, width / 2, height) },
      { id: "b", camera: cam, viewport: rect(width / 2, 0, width / 2, height) }
    ] });
    render(100, 50);
    const firstTargets = seen.frames.at(-1)!.map((draw) => draw.sampledTargets[0]!.id);
    renderer.resize(120, 80);
    render(120, 80);
    const secondTargets = seen.frames.at(-1)!.map((draw) => draw.sampledTargets[0]!);
    expect(secondTargets.map(({ width, height }) => [width, height])).toEqual([[60, 80], [60, 80]]);
    expect(secondTargets.every((target) => !firstTargets.includes(target.id))).toBe(true);
    expect(firstTargets.every((id) => seen.targets.find((target) => target.id === id)?.disposed)).toBe(true);
    expect(sizes).toEqual([[50, 50], [50, 50], [60, 80], [60, 80]]);
    renderer.dispose();
    expect(secondTargets.every(({ id }) => seen.targets.find((target) => target.id === id)?.disposed)).toBe(true);
  });

  it("retires removed views and restores the device after a draw failure", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const device = renderer.device as MockRenderDevice;
    const seen = instrument(device);
    const releaseView = vi.fn(), releaseScope = vi.fn();
    Object.assign(device, { releaseNativePostEffectView: releaseView, releaseNativePostEffectScope: releaseScope });
    const left = { id: "left", camera: viewCamera(), viewport: rect(0, 0, 50, 50) };
    const right = { id: "right", camera: viewCamera(), viewport: rect(50, 0, 50, 50) };
    renderer.render({ source: source(), views: [left, right] });
    const removed = seen.frames.at(-1)![1]!.sampledTargets[0]!.id;
    renderer.render({ source: source(), views: [left] });
    expect(seen.targets.find((target) => target.id === removed)?.disposed).toBe(true);
    expect(releaseView).toHaveBeenCalledTimes(1);
    const [scope, releasedId] = releaseView.mock.calls[0]!;
    expect(scope).toBeTypeOf("object");
    expect(releasedId).toBe("view:string:right");

    const throwing = { ...item("failure"), onBeforeRender: () => { throw new Error("injected view failure"); } };
    expect(() => renderer.render({ source: { ...source(), renderItems: [throwing] }, views: [left] })).toThrow("injected view failure");
    renderer.render({ source: source(), camera: viewCamera() });
    expect(seen.frames.at(-1)![0]!.state).toMatchObject({ destination: "canvas", viewport: rect(0, 0, 100, 50), scissor: null });
    expect(releaseView).toHaveBeenCalledWith(scope, "view:string:left");
    expect(seen.targets.filter((target) => target.label.startsWith("renderer-view-")).every((target) => target.disposed)).toBe(true);
    renderer.dispose();
    expect(releaseScope).toHaveBeenCalledWith(scope);
  });

  it("works through renderAsync and can composite into an explicit target", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const device = renderer.device as MockRenderDevice;
    const target = device.createRenderTarget({ width: 40, height: 20, label: "destination" });
    const seen = instrument(device);
    await renderer.renderAsync({ source: source(), target, views: [
      { camera: viewCamera(), viewport: rect(0, 0, 20, 20) },
      { camera: viewCamera(), viewport: rect(20, 0, 20, 20) }
    ] });
    expect(seen.frames).toHaveLength(3);
    expect(seen.frames.at(-1)!.map((draw) => draw.state)).toMatchObject([
      { destination: "render-target", viewport: rect(0, 0, 20, 20) },
      { destination: "render-target", viewport: rect(20, 0, 20, 20) }
    ]);
    expect(target.disposed).toBe(false);
    renderer.dispose();
  });

  it("rejects bad rectangles and recovers frame state after failure", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const device = renderer.device as MockRenderDevice;
    const seen = instrument(device);
    for (const bad of [rect(60, 0, 50, 50), rect(0, 0, 0, 10), rect(Number.NaN, 0, 10, 10)]) {
      expect(() => renderer.render({ source: source(), views: [{ camera: viewCamera(), viewport: bad }] })).toThrowError(expect.objectContaining({ code: "INVALID_VIEWPORT" }));
    }
    expect(() => renderer.render({ source: source(), views: [] })).toThrowError(expect.objectContaining({ code: "INVALID_VIEWPORT" }));
    expect(() => renderer.render({ source: source(), views: [{ camera: viewCamera(), viewport: rect(0, 0, 50, 50), scissor: rect(0, 0, 110, 50) }] })).toThrowError(expect.objectContaining({ code: "INVALID_VIEWPORT" }));
    expect(() => renderer.render({ source: source(), views: [
      { id: "duplicate", camera: viewCamera(), viewport: rect(0, 0, 50, 50) },
      { id: "duplicate", camera: viewCamera(), viewport: rect(50, 0, 50, 50) }
    ] })).toThrowError(expect.objectContaining({ code: "INVALID_VIEW_ID" }));
    renderer.render({ source: source(), camera: viewCamera() });
    expect(seen.frames.at(-1)![0]!.state).toMatchObject({ destination: "canvas", viewport: rect(0, 0, 100, 50), scissor: null });
    renderer.dispose();
  });

  it("preserves a single viewport override without leaking it to the next frame", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const seen = instrument(renderer.device as MockRenderDevice);
    renderer.render({ source: source(), camera: viewCamera(), viewport: rect(20, 10, 40, 20) });
    renderer.render({ source: source(), camera: viewCamera() });
    expect(seen.frames[0]![0]!.state).toMatchObject({ viewport: rect(20, 10, 40, 20) });
    expect(seen.frames[1]![0]!.state).toMatchObject({ viewport: rect(0, 0, 100, 50), scissor: null });
    renderer.dispose();
  });

  it("precompiles programs visible to each camera without submitting a frame", async () => {
    const flags = resolveQrFlags({ options: { A3D_QR_CORE: true } });
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const seen = instrument(device);
    const left = item("pbr", 0, 1);
    const right = { ...item("unlit", 0, 2), material: new UnlitMaterial({ name: "unlit" }) };
    // A caller may hand the renderer a one-shot iterator. It must be
    // snapshotted once, then independently filtered for both cameras.
    const result = await renderer.precompile({ source: { renderItems: [left, right][Symbol.iterator](), cameraPolicy: "require", frustumCulling: false }, views: [
      { camera: viewCamera(0, 1), viewport: rect(0, 0, 50, 50) },
      { camera: viewCamera(0, 2), viewport: rect(50, 0, 50, 50) }
    ] });
    const stats = rendererProgramCache(device, flags).stats();
    expect(stats.compiled).toBeGreaterThanOrEqual(2);
    expect(stats.pending).toBe(0);
    expect(stats.failed).toBe(0);
    expect(device.getDiagnostics().shaders).toBeGreaterThanOrEqual(2);
    expect(result.compiledPrograms).toBeGreaterThanOrEqual(2);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(seen.frames).toHaveLength(0);
    renderer.dispose();
  });

  it("reports programs actually compiled during precompile", async () => {
    const flags = resolveQrFlags({ options: { A3D_QR_CORE: true } });
    const renderer = await Renderer.create({ backend: "mock", width: 20, height: 20, qrFlags: flags });
    const result = await renderer.precompile({ source: source(), views: [
      { camera: viewCamera(), viewport: rect(0, 0, 20, 20) }
    ] });
    const cache = rendererProgramCache(renderer.device, flags).stats();
    expect(cache.compiled).toBeGreaterThan(0);
    expect(result.compiledPrograms).toBe(cache.compiled);
    renderer.dispose();
  });
});

type Vec3 = readonly [number, number, number];

// These fixtures use camera geometry and the perspective equations directly:
// a point (x,y,z) in eye space projects to (f*x/aspect + offset*z,
// f*y, A*z+B, -z), where f = zoom/tan(fov/2). The two eyes are
// displaced by half the interocular distance along the camera's right axis.
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: Vec3): Vec3 => { const d = Math.hypot(...v); return [v[0] / d, v[1] / d, v[2] / d]; };
const addScaled = (a: Vec3, b: Vec3, scale: number): Vec3 => [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
const delta = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

function referenceCamera(position: Vec3, target: Vec3, fov: number, aspect: number, near: number, far: number, zoom: number) {
  const back = unit(delta(position, target));
  const right = unit(cross([0, 1, 0], back));
  const up = cross(back, right);
  const view = [right[0], up[0], back[0], 0, right[1], up[1], back[1], 0, right[2], up[2], back[2], 0, -dot(right, position), -dot(up, position), -dot(back, position), 1];
  const f = zoom / Math.tan(fov * Math.PI / 360);
  const projection = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, -(far + near) / (far - near), -1, 0, 0, -(2 * far * near) / (far - near), 0];
  return { back, right, up, view, projection, f };
}

function multiplyPoint(matrix: ArrayLike<number>, point: Vec3): number[] {
  return [0, 1, 2, 3].map((row) => matrix[row]! * point[0] + matrix[4 + row]! * point[1] + matrix[8 + row]! * point[2] + matrix[12 + row]!);
}

function expectValuesClose(actual: ArrayLike<number>, expected: ArrayLike<number>): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i += 1) expect(actual[i], `element ${i}`).toBeCloseTo(expected[i]!, 5);
}

describe("stereo geometry", () => {
  const cases = [
    { fov: 50, aspect: 1.6, near: 0.1, far: 100, focus: 10, zoom: 1, eyeSeparation: 0.064, aspectScale: 0.5, position: [0, 1.5, 5], target: [0, 0, 0] },
    { fov: 75, aspect: 2, near: 0.5, far: 300, focus: 3, zoom: 1.5, eyeSeparation: 0.2, aspectScale: 1, position: [3, 2, -4], target: [0, 1, 0] },
    { fov: 30, aspect: 0.75, near: 0.05, far: 50, focus: 25, zoom: 0.8, eyeSeparation: 0.5, aspectScale: 2, position: [-6, 4, 9], target: [1, 0, -1] },
    { fov: 90, aspect: 1, near: 1, far: 1000, focus: 1.5, zoom: 1, eyeSeparation: 0.01, aspectScale: 0.5, position: [0, 0, 0.1], target: [0, 0, -5] }
  ] as const;

  for (const params of cases) {
    it(`projects convergent eyes independently at fov ${params.fov}, focus ${params.focus}, separation ${params.eyeSeparation}`, () => {
      const base = referenceCamera(params.position, params.target, params.fov, params.aspect, params.near, params.far, params.zoom);
      const eyes = computeStereoEyes({ ...params, viewMatrix: base.view, projectionMatrix: base.projection, cameraPosition: params.position });
      const focusPoint = addScaled(params.position, base.back, -params.focus);
      for (const [eye, sign] of [[eyes.left, -1], [eyes.right, 1]] as const) {
        const expectedPosition = addScaled(params.position, base.right, sign * params.eyeSeparation / 2);
        expectValuesClose(eye.cameraPosition, expectedPosition);
        const expectedView = [...base.view];
        expectedView[12] = -dot(base.right, expectedPosition);
        expectedView[13] = -dot(base.up, expectedPosition);
        expectedView[14] = -dot(base.back, expectedPosition);
        expectValuesClose(eye.viewMatrix, expectedView);
        const expectedProjection = [...base.projection];
        expectedProjection[0] = base.f / (params.aspect * params.aspectScale);
        expectedProjection[8] = -sign * (params.eyeSeparation / 2) * expectedProjection[0] / params.focus;
        expectValuesClose(eye.projectionMatrix, expectedProjection);
        // The optical axes are parallel, while both frusta meet at the
        // specified convergence plane; this also checks matrix multiplication.
        const focusClip = multiplyPoint(eye.viewProjectionMatrix, focusPoint);
        expect(focusClip[0]! / focusClip[3]!).toBeCloseTo(0, 5);
        const testPoint = addScaled(addScaled(focusPoint, base.right, 0.4), base.up, 0.25);
        const cameraSpace = delta(testPoint, expectedPosition);
        const x = dot(base.right, cameraSpace), y = dot(base.up, cameraSpace), z = dot(base.back, cameraSpace);
        expectValuesClose(multiplyPoint(eye.viewProjectionMatrix, testPoint), [expectedProjection[0]! * x + expectedProjection[8]! * z, expectedProjection[5]! * y, expectedProjection[10]! * z + expectedProjection[14]!, -z]);
      }
    });
  }

  it("uses the documented default separation and focus", () => {
    const base = referenceCamera([0, 0, 4], [0, 0, 0], 60, 1.5, 0.1, 100, 1);
    const eyes = computeStereoEyes({ viewMatrix: base.view, projectionMatrix: base.projection, cameraPosition: [0, 0, 4], fov: 60, aspect: 1.5, near: 0.1 });
    expect(eyes.eyeSeparation).toBe(0.064);
    expect(eyes.focus).toBe(10);
    expectValuesClose(eyes.left.cameraPosition, [-0.032, 0, 4]);
    expectValuesClose(eyes.right.cameraPosition, [0.032, 0, 4]);
    expect(eyes.left.projectionMatrix[8]).toBeCloseTo(-eyes.right.projectionMatrix[8]!, 6);
  });

  it("validates its inputs", () => {
    const base = { viewMatrix: IDENTITY, projectionMatrix: IDENTITY, cameraPosition: [0, 0, 0] as const, fov: 50, aspect: 1, near: 0.1 };
    expect(() => computeStereoEyes({ ...base, eyeSeparation: 0 })).toThrow(RangeError);
    expect(() => computeStereoEyes({ ...base, eyeSeparation: Number.NaN })).toThrow(RangeError);
    expect(() => computeStereoEyes({ ...base, focus: -1 })).toThrow(RangeError);
    expect(() => computeStereoEyes({ ...base, zoom: 0 })).toThrow(RangeError);
    expect(() => computeStereoEyes({ ...base, fov: 180 })).toThrow(RangeError);
    expect(() => computeStereoEyes({ ...base, near: 0 })).toThrow(RangeError);
    expect(() => computeStereoEyes({ ...base, aspect: 0 })).toThrow(RangeError);
    expect(() => computeStereoEyes({ ...base, viewMatrix: [1, 2, 3] })).toThrow(RangeError);
  });
});

describe("cameras.array / cameras.stereo nodes (SC-01)", () => {
  it("cameras.stereo applies documented defaults and emits a typed node", () => {
    const node = cameras.stereo().toJSON();
    expect(isAuraCameraStereoNode(node)).toBe(true);
    expect(node).toMatchObject({ kind: "camera-stereo", eyeSeparation: 0.064, focus: 10, zoom: 1, layout: "side-by-side" });
  });

  it("cameras.stereo carries explicit options", () => {
    const node = cameras.stereo({ name: "vr", eyeSeparation: 0.1, focus: 4, fov: 70, aspect: 0.5, zoom: 1.2, layout: "over-under" }).toJSON();
    expect(node).toMatchObject({ name: "vr", eyeSeparation: 0.1, focus: 4, fov: 70, aspect: 0.5, zoom: 1.2, layout: "over-under" });
  });

  it("cameras.stereo validates its options with invalid-camera-spec", () => {
    for (const bad of [
      { eyeSeparation: 0 },
      { eyeSeparation: Number.NaN },
      { focus: -2 },
      { zoom: 0 },
      { fov: 0 },
      { fov: 180 },
      { aspect: -1 },
      { layout: "diagonal" as never }
    ]) {
      expect(() => cameras.stereo(bad), JSON.stringify(bad)).toThrowError(expect.objectContaining({ code: "invalid-camera-spec" }));
    }
    expect(() => cameras.stereo({ eyeSeparation: -1 })).toThrow(AuraRuntimeError);
  });

  it("cameras.array emits a typed node and copies viewports", () => {
    const entry = { camera: { position: [1, 2, 3] as const }, viewport: { x: 0, y: 0, width: 0.5, height: 1 } };
    const node = cameras.array({ name: "split", cameras: [entry, { viewport: { x: 0.5, y: 0, width: 0.5, height: 1 } }] }).toJSON();
    expect(isAuraCameraArrayNode(node)).toBe(true);
    expect((node as unknown as { cameras: unknown[] }).cameras).toHaveLength(2);
    expect(node).toMatchObject({ kind: "camera-array", name: "split" });
  });

  it("cameras.array validates viewports with invalid-camera-spec", () => {
    const code = expect.objectContaining({ code: "invalid-camera-spec" });
    expect(() => cameras.array({ cameras: [] })).toThrowError(code);
    expect(() => cameras.array({} as never)).toThrowError(code);
    expect(() => cameras.array({ cameras: [{ viewport: undefined as never }] })).toThrowError(code);
    expect(() => cameras.array({ cameras: [{ viewport: { x: 0, y: 0, width: 0, height: 1 } }] })).toThrowError(code);
    expect(() => cameras.array({ cameras: [{ viewport: { x: 0.6, y: 0, width: 0.6, height: 1 } }] })).toThrowError(code);
    expect(() => cameras.array({ cameras: [{ viewport: { x: -0.1, y: 0, width: 0.5, height: 1 } }] })).toThrowError(code);
    expect(() => cameras.array({ cameras: [{ viewport: { x: Number.NaN, y: 0, width: 0.5, height: 1 } }] })).toThrowError(code);
  });

  it("preserves independent eye settings and rejects ambiguous or invalid settings", () => {
    const viewport = rect(0, 0, 0.5, 1);
    const scissor = rect(0.1, 0.2, 0.3, 0.5);
    const array = cameras.array({ cameras: [
      { id: "overview", viewport, scissor, camera: { fov: 60, layers: 2 }, postprocess: false },
      { id: "detail", viewport: rect(0.5, 0, 0.5, 1), postprocess: { colorGrade: { contrast: 1.5 } } }
    ] }).toJSON();
    expect(array).toMatchObject({ cameras: [
      { id: "overview", viewport, scissor, camera: { fov: 60, layers: 2 }, postprocess: false },
      { id: "detail", postprocess: { colorGrade: { contrast: 1.5 } } }
    ] });
    viewport.x = 0.2;
    scissor.x = 0.2;
    expect(array).toMatchObject({ cameras: [{ viewport: { x: 0 }, scissor: { x: 0.1 } }, {}] });

    const stereo = cameras.stereo({ views: [
      { id: "left", viewport: rect(0, 0, 0.4, 1), postprocess: false },
      { id: "right", scissor: rect(0.6, 0, 0.4, 1), camera: { fov: 65 } }
    ] }).toJSON();
    expect(stereo).toMatchObject({ views: [{ id: "left", postprocess: false }, { id: "right", camera: { fov: 65 } }] });
    const code = expect.objectContaining({ code: "invalid-camera-spec" });
    expect(() => cameras.array({ cameras: [{ id: "same", viewport: rect(0, 0, 0.5, 1) }, { id: "same", viewport: rect(0.5, 0, 0.5, 1) }] })).toThrowError(code);
    expect(() => cameras.array({ cameras: [{ viewport: rect(0, 0, 1, 1), scissor: rect(0.9, 0, 0.2, 1) }] })).toThrowError(code);
    expect(() => cameras.array({ cameras: [{ viewport: rect(0, 0, 1, 1), postprocess: [] as never }] })).toThrowError(code);
    expect(() => cameras.stereo({ views: [{}] as never })).toThrowError(code);
    expect(() => cameras.stereo({ views: [{ id: "same" }, { id: "same" }] })).toThrowError(code);
  });
});

describe("production views from authored camera nodes (SC-01)", () => {
  const baseSource = () => ({ collectRenderItems: () => [], cameraPolicy: "require" as const, frustumCulling: false });
  const build = async (nodes: readonly ReturnType<typeof cameras.stereo>[] | readonly ReturnType<typeof cameras.array>[], mode: "perspective" | "orthographic" = "perspective") => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const warnings: string[] = [];
    const surfaces = createProductionParitySurfaces(renderer, (message) => warnings.push(message));
    let builder = scene().camera(camera[mode]({ position: [0, 0, 6], target: [0, 0, 0], fov: 40 })).add(primitives.sphere({ name: "ball" }));
    for (const node of nodes) builder = builder.add(node);
    return { renderer, surfaces, warnings, snapshot: builder.toJSON() };
  };

  it("a scene without view nodes returns the source untouched", async () => {
    const { renderer, surfaces, snapshot } = await build([]);
    const source = baseSource();
    expect(surfaces.prepare(source, snapshot as never, undefined, 0, 2, { width: 100, height: 50 })).toBe(source);
    renderer.dispose();
  });

  it("cameras.stereo yields left/right eye views in viewport halves with shifted frusta", async () => {
    const { renderer, surfaces, snapshot, warnings } = await build([cameras.stereo({ eyeSeparation: 0.2, focus: 6 })]);
    const prepared = surfaces.prepare(baseSource(), snapshot as never, undefined, 0, 2, { width: 100, height: 50 });
    const views = prepared.views!;
    expect(warnings).toEqual([]);
    expect(views.map((v) => v.viewport)).toEqual([rect(0, 0, 50, 50), rect(50, 0, 50, 50)]);
    expect(views[0]!.cameraPosition![0]).toBeCloseTo(-0.1, 5);
    expect(views[1]!.cameraPosition![0]).toBeCloseTo(0.1, 5);
    expect(views[0]!.cameraPosition![2]).toBeCloseTo(6, 5);
    expect(views[0]!.camera.projectionMatrix![8]).toBeGreaterThan(0);
    expect(views[1]!.camera.projectionMatrix![8]).toBeLessThan(0);
    expect(views[0]!.camera.viewProjectionMatrix).toBeInstanceOf(Float32Array);
    renderer.dispose();
  });

  it("each eye keeps a correct aspect: side-by-side halves the width, so eye aspect = canvas aspect / 2", async () => {
    const { renderer, surfaces, snapshot } = await build([cameras.stereo({ eyeSeparation: 0.1 })]);
    const [left] = surfaces.prepare(baseSource(), snapshot as never, undefined, 0, 2, { width: 100, height: 50 }).views!;
    const fovRad = (40 * Math.PI) / 180;
    // projection[0] = near / (ymax * aspect_eye) with aspect_eye = 2 * 0.5 = 1
    expect(left!.camera.projectionMatrix![5]).toBeCloseTo(1 / Math.tan(fovRad / 2), 5);
    expect(left!.camera.projectionMatrix![0]).toBeCloseTo(1 / Math.tan(fovRad / 2), 3);
    renderer.dispose();
  });

  it("over-under layout puts the left eye on top (origin bottom-left)", async () => {
    const { renderer, surfaces, snapshot } = await build([cameras.stereo({ layout: "over-under" })]);
    const views = surfaces.prepare(baseSource(), snapshot as never, undefined, 0, 2, { width: 100, height: 50 }).views!;
    expect(views.map((v) => v.viewport)).toEqual([rect(0, 25, 100, 25), rect(0, 0, 100, 25)]);
    renderer.dispose();
  });

  it("splits an orthographic scene camera into two views without a fallback warning", async () => {
    const { renderer, surfaces, snapshot, warnings } = await build([cameras.stereo()], "orthographic");
    const source = baseSource();
    const prepared = surfaces.prepare(source, snapshot as never, undefined, 0, 2, { width: 100, height: 50 });
    expect(prepared.views?.map((view) => view.viewport)).toEqual([rect(0, 0, 50, 50), rect(50, 0, 50, 50)]);
    expect(prepared.views?.map((view) => view.camera.projectionMetadata?.kind)).toEqual(["orthographic", "orthographic"]);
    expect(warnings).toEqual([]);
    renderer.dispose();
  });

  it("cameras.array maps normalized viewports to pixels and inherits unset camera fields", async () => {
    const { renderer, surfaces, snapshot } = await build([
      cameras.array({
        cameras: [
          { viewport: { x: 0, y: 0, width: 0.5, height: 1 } },
          { camera: { position: [3, 0, 6] }, viewport: { x: 0.5, y: 0, width: 0.5, height: 1 } }
        ]
      })
    ]);
    const views = surfaces.prepare(baseSource(), snapshot as never, undefined, 0, 2, { width: 100, height: 50 }).views!;
    expect(views.map((v) => v.viewport)).toEqual([rect(0, 0, 50, 50), rect(50, 0, 50, 50)]);
    expect(views[0]!.cameraPosition).toEqual([0, 0, 6]);
    expect(views[1]!.cameraPosition).toEqual([3, 0, 6]);
    expect(views[0]!.camera.viewProjectionMatrix).not.toEqual(views[1]!.camera.viewProjectionMatrix);
    renderer.dispose();
  });

  it("lowers array view settings independently and recomputes pixel rectangles on resize", async () => {
    const { renderer, surfaces, snapshot } = await build([cameras.array({ name: "split", cameras: [
      { id: "wide", viewport: rect(0, 0, 0.5, 1), scissor: rect(0.1, 0.2, 0.3, 0.6), camera: { layers: 2 }, postprocess: false },
      { id: "detail", viewport: rect(0.5, 0, 0.5, 1), camera: { position: [3, 0, 6], layers: 4 }, postprocess: { colorGrade: { contrast: 1.2 } } }
    ] })]);
    const initial = surfaces.prepare(baseSource(), snapshot as never, undefined, 0, 2, { width: 100, height: 50 }).views!;
    const resized = surfaces.prepare(baseSource(), snapshot as never, undefined, 0, 2, { width: 200, height: 100 }).views!;
    expect(initial[0]).toMatchObject({ viewport: rect(0, 0, 50, 50), scissor: rect(10, 10, 30, 30), postprocess: false, camera: { layerMask: 2 } });
    expect(initial[1]).toMatchObject({ viewport: rect(50, 0, 50, 50), postprocess: { colorGrade: { contrast: 1.2 } }, cameraPosition: [3, 0, 6], camera: { layerMask: 4 } });
    expect(resized[0]).toMatchObject({ viewport: rect(0, 0, 100, 100), scissor: rect(20, 20, 60, 60) });
    expect(resized[1]!.viewport).toEqual(rect(100, 0, 100, 100));
    expect(initial.map((view) => view.id)).toEqual(resized.map((view) => view.id));
    expect(initial[0]!.id).toBeDefined();
    expect(initial[0]!.id).not.toBe(initial[1]!.id);
    renderer.dispose();
  });

  it("rounds adjacent normalized viewport edges consistently at odd sizes", async () => {
    const { renderer, surfaces, snapshot } = await build([cameras.array({ cameras: [
      { viewport: rect(0, 0, 1 / 3, 1) },
      { viewport: rect(1 / 3, 0, 1 / 3, 1) },
      { viewport: rect(2 / 3, 0, 1 / 3, 1) }
    ] })]);
    const views = surfaces.prepare(baseSource(), snapshot as never, undefined, 0, 101 / 51, { width: 101, height: 51 }).views!;
    expect(views.map((view) => view.viewport)).toEqual([rect(0, 0, 34, 51), rect(34, 0, 33, 51), rect(67, 0, 34, 51)]);
    renderer.dispose();
  });

  it("lowers stereo eye camera, clip and post overrides without changing the other eye", async () => {
    const { renderer, surfaces, snapshot } = await build([cameras.stereo({ eyeSeparation: 0.2, focus: 6, views: [
      { id: "left", postprocess: false },
      { id: "right", viewport: rect(0.5, 0.2, 0.5, 0.8), scissor: rect(0.6, 0.3, 0.3, 0.5), camera: { position: [3, 0, 6], layers: 4, fov: 65 }, postprocess: { colorGrade: { saturation: 0.2 } } }
    ] })]);
    const [left, right] = surfaces.prepare(baseSource(), snapshot as never, undefined, 0, 2, { width: 100, height: 50 }).views!;
    expect(left).toMatchObject({ viewport: rect(0, 0, 50, 50), postprocess: false });
    expect(left!.cameraPosition![0]).toBeCloseTo(-0.1, 5);
    expect(right).toMatchObject({ viewport: rect(50, 10, 50, 40), scissor: rect(60, 15, 30, 25), postprocess: { colorGrade: { saturation: 0.2 } }, camera: { layerMask: 4 } });
    expect(right!.cameraPosition![0]).toBeGreaterThan(3);
    expect(right!.camera.projectionMatrix![5]).not.toBeCloseTo(left!.camera.projectionMatrix![5]!, 3);
    expect(left!.id).not.toBe(right!.id);
    renderer.dispose();
  });

  // 5.0 contract (WP-02): every authored camera group is honoured in scene
  // order with independent per-view matrices; 4.x kept only the first group
  // and warned CAMERA_VIEWS_MULTIPLE. Groups need distinct names.
  it("honours every multi-view node in authored order with independent eye matrices", async () => {
    const { renderer, surfaces, snapshot, warnings } = await build([
      cameras.stereo({ eyeSeparation: 0.2, focus: 6 }), cameras.stereo({ name: "second", eyeSeparation: 0.6, focus: 6 })
    ]);
    const views = surfaces.prepare(baseSource(), snapshot as never, undefined, 0, 2, { width: 100, height: 50 }).views!;
    expect(views).toHaveLength(4);
    expect(new Set(views.map((view) => view.id)).size).toBe(4);
    expect(views.slice(0, 2).every((view) => String(view.id).startsWith("camera-stereo:"))).toBe(true);
    expect(views.slice(2).every((view) => String(view.id).startsWith("second:"))).toBe(true);
    expect(views.map((view) => view.cameraPosition![0]).map((x) => Number(x.toFixed(5)))).toEqual([-0.1, 0.1, -0.3, 0.3]);
    expect(warnings.some((w) => w.startsWith("CAMERA_VIEWS_MULTIPLE"))).toBe(false);
    renderer.dispose();
  });

  it("rejects multiple camera groups without distinct names before any capture", async () => {
    const { renderer, surfaces, snapshot } = await build([cameras.stereo(), cameras.stereo()]);
    expect(() => surfaces.prepare(baseSource(), snapshot as never, undefined, 0, 2, { width: 100, height: 50 }))
      .toThrow(/CAMERA_VIEWS_GROUP_ID/);
    renderer.dispose();
  });

  it("prepared views drive one frame per eye through the renderer", async () => {
    const { renderer, surfaces, snapshot } = await build([cameras.stereo({ eyeSeparation: 0.2, focus: 6 })]);
    const device = renderer.device as MockRenderDevice;
    const frames: Array<readonly MockDrawViewState[]> = [];
    const endFrame = device.endFrame.bind(device);
    device.endFrame = () => {
      frames.push([...device.getDrawViewStates()]);
      endFrame();
    };
    const item = {
      geometry: Geometry.litCube(1),
      material: new PBRMaterial({ name: "ball" }),
      label: "ball",
      modelMatrix: IDENTITY,
      includeInAutoFrame: false
    };
    const source = surfaces.prepare({ collectRenderItems: () => [item], cameraPolicy: "require", frustumCulling: false }, snapshot as never, undefined, 0, 2, { width: 100, height: 50 });
    renderer.render(source, { viewProjectionMatrix: IDENTITY });
    expect(frames).toHaveLength(3);
    expect(frames[0]![0]).toMatchObject({ destination: "render-target", viewport: rect(0, 0, 50, 50) });
    expect(frames[1]![0]).toMatchObject({ destination: "render-target", viewport: rect(0, 0, 50, 50) });
    expect(frames[2]!.map((view) => view.viewport)).toEqual([rect(0, 0, 50, 50), rect(50, 0, 50, 50)]);
    renderer.dispose();
  });
});


describe("Renderer camera depth negotiation", () => {
  it.each(["sync", "async"] as const)("rejects unsupported depth before starting any view (%s)", async (mode) => {
    const renderer = await Renderer.create({ backend: "mock", width: 40, height: 20 });
    const device = renderer.device as MockRenderDevice;
    const item = { geometry: Geometry.triangle(), material: new UnlitMaterial() };
    const good = { viewProjectionMatrix: IDENTITY };
    // Reversed depth is native; a logarithmic view without a near/far range is not.
    const unsupported = { viewProjectionMatrix: IDENTITY, projectionMetadata: { kind: "custom" as const, mode: "logarithmic" as const, clipRange: "minus-one-to-one" as const } };
    const input = { source: { renderItems: [item], cameraPolicy: "require" as const }, views: [
      { camera: good, viewport: rect(0, 0, 20, 20) },
      { camera: unsupported, viewport: rect(20, 0, 20, 20) }
    ] };
    if (mode === "sync") expect(() => renderer.render(input)).toThrowError(/finite 0 < near < far/);
    else await expect(renderer.renderAsync(input)).rejects.toThrowError(/finite 0 < near < far/);
    expect(device.drawCommands).toHaveLength(0);
    expect(renderer.info.render.frame).toBe(0);
    renderer.dispose();
  });

  it("rejects an advertised fallback whose projection was not rebuilt", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 20, height: 20 });
    const camera = { viewProjectionMatrix: IDENTITY,
      projectionMetadata: { kind: "perspective" as const, mode: "reversed" as const, clipRange: "minus-one-to-one" as const },
      depthConvention: { requestedMode: "reversed" as const, mode: "standard" as const, clipRange: "minus-one-to-one" as const, clearValue: 1 as const, compare: "less-equal" as const, biasSign: 1 as const, fallbackReason: "unavailable" } };
    expect(() => renderer.render({ source: { renderItems: [] }, camera })).toThrowError(/projection and depth convention do not match/);
    expect((renderer.device as MockRenderDevice).drawCommands).toHaveLength(0);
    renderer.dispose();
  });

  it("rejects a device left in reversed depth before submitting a standard camera", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 20, height: 20 });
    Object.assign(renderer.device, { getDepthConvention: () => ({ requestedMode: "reversed", mode: "reversed", clipRange: "minus-one-to-one", clearValue: 0, compare: "greater-equal", biasSign: -1 }) });
    expect(() => renderer.render({ renderItems: [{ geometry: Geometry.triangle(), material: new UnlitMaterial() }], cameraPolicy: "identity" })).toThrowError(/active device depth convention/);
    expect((renderer.device as MockRenderDevice).drawCommands).toHaveLength(0);
    renderer.dispose();
  });

  it("rejects explicit zero-to-one camera matrices instead of applying WebGPU conversion twice", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 20, height: 20 });
    const camera = { viewProjectionMatrix: IDENTITY, projectionMetadata: { kind: "perspective" as const, mode: "standard" as const, clipRange: "zero-to-one" as const } };
    expect(() => renderer.render({ source: { renderItems: [] }, camera })).toThrowError(/minus-one-to-one/);
    renderer.dispose();
  });
});

describe("Renderer temporal view ownership", () => {
  it("retains unaffected view history on resize and reports renderer-owned object motion", async () => {
    const flags = resolveQrFlags({ options: { A3D_QR_POST: true } });
    const renderer = await Renderer.create({ backend: "mock", width: 80, height: 40, qrFlags: flags });
    renderer.device.presentLdrPostprocess = () => undefined;
    const history = (renderer as unknown as { temporalHistory: TemporalHistory }).temporalHistory;
    const prepare = vi.spyOn(history, "prepare");
    const dispose = vi.spyOn(history, "dispose");
    const object = { geometry: Geometry.triangle(), material: new UnlitMaterial(), label: "temporal" };
    const source = { renderItems: [object], cameraPolicy: "require" as const, postprocess: { execution: "auto" as const, toneMapping: { operator: "linear" as const }, temporal: {}, taa: { blend: 0.9 } } };
    const viewCamera = { viewProjectionMatrix: IDENTITY, projectionMetadata: { kind: "perspective" as const, mode: "standard" as const, clipRange: "minus-one-to-one" as const, near: 0.5, far: 100 } };
    const first = renderer.render({ source, views: [
      { id: "left", camera: viewCamera, viewport: rect(0, 0, 40, 40) },
      { id: "right", camera: viewCamera, viewport: rect(40, 0, 40, 40) }
    ] });
    // Each view owns its velocity/reactive surfaces. A camera given only as a
    // view-projection has no projection, so previous depth stays approximate.
    expect(first.temporalViews).toMatchObject([
      { viewId: "left", motionSource: "object", unsupportedMotion: ["previous-depth-approximation"] },
      { viewId: "right", motionSource: "object", unsupportedMotion: ["previous-depth-approximation"] }
    ]);
    expect(prepare.mock.calls.map((call) => call[5].motion)).toEqual(["renderer", "renderer"]);
    expect(prepare.mock.calls.map((call) => call[5].depthNear)).toEqual([0.5, 0.5]);
    const rightHistory = prepare.mock.results[1]!.value.history;
    renderer.resize(90, 40);
    expect(dispose).not.toHaveBeenCalled();
    const second = renderer.render({ source, views: [
      { id: "left", camera: viewCamera, viewport: rect(0, 0, 30, 40) },
      { id: "right", camera: viewCamera, viewport: rect(30, 0, 40, 40) }
    ] });
    expect(prepare.mock.results[3]!.value.history).toBe(rightHistory);
    expect(second.temporalViews?.map((view) => view.viewId)).toEqual(["left", "right"]);
    expect(renderer.getDiagnostics().temporalViews).toEqual(second.temporalViews);
    renderer.dispose();
  });
});

describe("Renderer target-owned temporal history", () => {
  it.each(["sync", "async"] as const)("isolates and retires histories for distinct explicit targets (%s)", async (mode) => {
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16 });
    renderer.device.presentLdrPostprocess = () => undefined;
    const history = (renderer as unknown as { temporalHistory: TemporalHistory }).temporalHistory;
    const prepare = vi.spyOn(history, "prepare");
    const releaseView = vi.spyOn(history, "disposeView");
    const device = renderer.device as MockRenderDevice;
    const releasePostView = vi.fn();
    Object.assign(device, { releaseNativePostEffectView: releasePostView });
    const a = device.createRenderTarget({ width: 16, height: 16, label: "a" });
    const b = device.createRenderTarget({ width: 8, height: 8, label: "b" });
    const object = { geometry: Geometry.triangle(), material: new UnlitMaterial(), label: "target-temporal" };
    const source = { renderItems: [object], cameraPolicy: "identity" as const, postprocess: { execution: "auto" as const, toneMapping: { operator: "linear" as const }, temporal: {}, taa: { blend: 0.9 } } };
    const run = async (target: RenderTarget) => { if (mode === "sync") renderer.render({ source, target }); else await renderer.renderAsync({ source, target }); };
    await run(a);
    const firstId = prepare.mock.calls[0]![5].viewId;
    await run(b);
    const secondId = prepare.mock.calls[1]![5].viewId;
    expect(secondId).not.toEqual(firstId);
    expect(prepare.mock.results[1]!.value.historyValid).toBe(false);
    await run(a);
    expect(prepare.mock.results[2]!.value.historyValid).toBe(true);
    a.dispose();
    await run(b);
    expect(releaseView).toHaveBeenCalledWith(firstId);
    expect(releasePostView).toHaveBeenCalledWith(expect.any(Object), firstId);
    expect(prepare.mock.results[3]!.value.historyValid).toBe(true);
    renderer.dispose();
  });
});

describe("Renderer frame inspection", () => {
  it.each(["sync", "async"] as const)("reports actual graph passes and whole-frame CPU time for a fully observed frame (%s)", async (mode) => {
    const renderer = await Renderer.create({ backend: "mock", width: 20, height: 20 });
    expect(renderer.getFrameInspection()).toBeNull();
    const item = { geometry: Geometry.triangle(), material: new UnlitMaterial(), label: "inspected" };
    const input = { renderItems: [item], cameraPolicy: "identity" as const };
    const diagnostics = mode === "sync" ? renderer.render(input) : await renderer.renderAsync(input);
    const capture = renderer.getFrameInspection()!;
    expect(capture.frameNumber).toBe(1);
    // Shadow, contributor, post, output and native-device phases are now
    // recorded when they run; this frame runs only the forward graph pass.
    expect(capture.complete).toBe(true);
    expect(capture.passes).toHaveLength(1);
    expect(capture.passes[0]).toMatchObject({ name: "forward", status: "completed", drawCalls: 1, gpuTimeMs: null });
    expect(capture.passes[0]!.reads).toEqual([]);
    expect(capture.passes[0]!.writes.length).toBeGreaterThan(0);
    expect(capture.passes[0]!.cpuTimeMs).toBeGreaterThanOrEqual(0);
    expect(capture.diagnostics).toEqual(diagnostics);
    expect(capture.cpuTimeMs).toBeGreaterThanOrEqual(capture.passes[0]!.cpuTimeMs!);
    expect(capture.gpuTimeMs).toBeNull();
    renderer.dispose();
    expect(renderer.getFrameInspection()).toBeNull();
  });

  it("records a failed pass without claiming a submitted frame", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 20, height: 20 });
    const input = { renderItems: [{ geometry: Geometry.triangle(), material: new UnlitMaterial(), onBeforeRender: () => { throw new Error("draw failed"); } }], cameraPolicy: "identity" as const };
    expect(() => renderer.render(input)).toThrow("draw failed");
    expect(renderer.getFrameInspection()).toMatchObject({ frameNumber: 1, complete: false, passes: [{ name: "forward", status: "failed" }] });
    expect(renderer.info.render.frame).toBe(0);
    renderer.dispose();
  });
});

describe("Renderer resource teardown", () => {
  it("continues releasing device resources after a disposer throws and remains idempotent", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 40, height: 20, qrFlags: resolveQrFlags({ options: { A3D_QR_CORE: true } }) });
    renderer.render({ renderItems: [{ geometry: Geometry.triangle(), material: new UnlitMaterial() }], cameraPolicy: "identity" });
    const cache = rendererProgramCache(renderer.device, resolveQrFlags({ options: { A3D_QR_CORE: true } }));
    const original = cache.dispose.bind(cache);
    const dispose = vi.spyOn(cache, "dispose").mockImplementation(() => { original(); throw new Error("cache cleanup failed"); });
    expect(() => renderer.dispose()).toThrowError(AggregateError);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(renderer.device.disposed).toBe(true);
    expect(() => renderer.dispose()).not.toThrow();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe("Renderer recovery after device loss", () => {
  it("retires view surfaces and composite resources and recreates them after restoration", () => {
    const device = new MockRenderDevice();
    let lose: (() => void) | undefined;
    Object.assign(device, { onDeviceLost(listener: () => void) { lose = listener; return () => { lose = undefined; }; } });
    const seen = instrumentRecovery(device);
    const renderer = new Renderer(device, { backend: "mock", width: 40, height: 20, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    const input = { source: { renderItems: [{ geometry: Geometry.triangle(), material: new UnlitMaterial(), label: "recovery" }], cameraPolicy: "require" as const }, views: [
      { id: "left", camera: { viewProjectionMatrix: IDENTITY }, viewport: rect(0, 0, 20, 20) },
      { id: "right", camera: { viewProjectionMatrix: IDENTITY }, viewport: rect(20, 0, 20, 20) }
    ] };
    renderer.render(input);
    const first = [...seen.targets];
    const firstComposite = seen.compositeShaders[0]!;
    expect(first).toHaveLength(2);
    lose!();
    expect(first.every((target) => target.disposed)).toBe(true);
    expect(firstComposite.disposed).toBe(true);
    renderer.render(input);
    expect(seen.targets).toHaveLength(4);
    expect(seen.targets.slice(2).every((target) => !target.disposed)).toBe(true);
    expect(seen.compositeShaders).toHaveLength(2);
    expect(seen.compositeShaders[1]).not.toBe(firstComposite);
    renderer.dispose();
  });
});

function instrumentRecovery(device: MockRenderDevice) {
  const targets: RenderTarget[] = [];
  const compositeShaders: ReturnType<MockRenderDevice["createShaderProgram"]>[] = [];
  const createTarget = device.createRenderTarget.bind(device);
  const createShader = device.createShaderProgram.bind(device);
  device.createRenderTarget = (descriptor) => { const target = createTarget(descriptor); targets.push(target); return target; };
  device.createShaderProgram = (source) => { const shader = createShader(source); if (source.label === "renderer-view-composite") compositeShaders.push(shader); return shader; };
  return { targets, compositeShaders };
}

describe("Renderer repeated authored temporal frames", () => {
  it.each(["sync", "async"] as const)("keeps camera-cut state stable across repeated passes (%s)", async (mode) => {
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16, qrFlags: resolveQrFlags({ options: { A3D_QR_POST: true } }) });
    renderer.device.presentLdrPostprocess = () => undefined;
    const history = (renderer as unknown as { temporalHistory: TemporalHistory }).temporalHistory;
    const prepare = vi.spyOn(history, "prepare");
    // This mock device does not run a v2 output stage. Keep the prepared frame
    // alive so repeated passes exercise its real same-frame validation.
    vi.spyOn(renderer as unknown as { commitTemporalHistory: () => void }, "commitTemporalHistory").mockImplementation(() => undefined);
    const object = { geometry: Geometry.triangle(), material: new UnlitMaterial(), label: "temporal-cut" };
    const base = { renderItems: [object], cameraPolicy: "require" as const, postprocess: { execution: "auto" as const, toneMapping: { operator: "linear" as const }, temporal: {}, taa: { blend: 0.9 } } };
    const run = async (frameId: number, x: number) => {
      const input = { source: { ...base, cameraPosition: [x, 0, 0] as const }, camera: { viewProjectionMatrix: IDENTITY }, frameId };
      if (mode === "sync") renderer.render(input); else await renderer.renderAsync(input);
    };
    await run(1, 0);
    await run(2, 10);
    await run(2, 10);
    expect(prepare.mock.calls.map((call) => Boolean(call[5].reset))).toEqual([false, true, true]);
    renderer.dispose();
  });
});

describe("Renderer native drawing-path integration", () => {
  const makeNative = () => {
    const passes: Record<string, unknown>[] = [];
    const pipelines: Record<string, unknown>[] = [];
    const submissions: unknown[] = [];
    const uploads: Uint8Array[] = [];
    const native = {
      limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxStorageBuffersPerShaderStage: 8 },
      queue: {
        writeBuffer(_buffer: unknown, _offset: number, data: ArrayBufferView) { uploads.push(new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))); },
        submit(commands: readonly unknown[]) { submissions.push(commands); },
        onSubmittedWorkDone: () => Promise.resolve()
      },
      createBuffer() { return { destroy() {} }; },
      createTexture() { return { destroy() {}, createView: () => ({}) }; },
      createShaderModule({ code }: { code: string }) { return { code }; },
      createRenderPipeline(descriptor: Record<string, unknown>) { pipelines.push(descriptor); return { getBindGroupLayout: () => ({}) }; },
      createComputePipeline(descriptor: Record<string, unknown>) { pipelines.push(descriptor); return { getBindGroupLayout: () => ({}) }; },
      createBindGroup(descriptor: Record<string, unknown>) { return descriptor; },
      createCommandEncoder() {
        return {
          beginComputePass() { return { setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} }; },
          beginRenderPass(descriptor: Record<string, unknown>) {
            passes.push(descriptor);
            return { setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() {}, drawIndirect() {}, end() {} };
          },
          finish: () => ({})
        };
      }
    };
    return { native, passes, pipelines, submissions, uploads };
  };

  const attachNative = (device: MockRenderDevice, fake: ReturnType<typeof makeNative>) => {
    let generation = 1;
    let viewOverride = false;
    const surfaces: Array<{ target: RenderTarget | null; frameActive: unknown }> = [];
    const written: Array<RenderTarget | null> = [];
    Object.defineProperty(device, "kind", { value: "webgpu" });
    Object.defineProperty(device, "generation", { get: () => generation });
    Object.assign(device, {
      nativeGpuDevice: fake.native,
      getNativeRenderSurface(target: RenderTarget | null) {
        const state = device.captureState();
        surfaces.push({ target, frameActive: state.get("frameActive") });
        return { view: { target }, width: target?.width ?? Number(state.get("viewportWidth")), height: target?.height ?? Number(state.get("viewportHeight")), format: "rgba8unorm", generation, sampleCount: 1 };
      },
      markNativeRenderSurfaceWritten(target: RenderTarget | null) { written.push(target); },
      hasNativeSurfaceViewOverride() { return viewOverride; }
    });
    return { surfaces, written, setGeneration(value: number) { generation = value; }, setViewOverride(value: boolean) { viewOverride = value; } };
  };
  const triangle = () => ({ geometry: Geometry.triangle(), material: new UnlitMaterial(), label: "triangle" });

  it.each(["deferred", "meshlet", "visibility"] as const)("submits the %s path into the frame-scoped native surface", async (mode) => {
    const renderer = await Renderer.create({ backend: "mock", width: 80, height: 40, drawingPath: { mode } });
    const device = renderer.device as MockRenderDevice;
    const fake = makeNative();
    const attachment = attachNative(device, fake);
    const result = renderer.render({ source: { renderItems: [triangle()], cameraPolicy: "identity" } });
    expect(fake.submissions).toHaveLength(1);
    expect(attachment.surfaces).toEqual([{ target: null, frameActive: true }]);
    expect(attachment.written).toEqual([null]);
    expect(result.drawingPath).toMatchObject({ requested: mode, active: mode, triangles: 1 });
    expect(renderer.drawingPathDiagnostics).toEqual(result.drawingPath);
    expect(renderer.getDiagnostics().drawingPath).toEqual(result.drawingPath);
    expect(fake.uploads.some((bytes) => bytes.byteLength > 0)).toBe(true);
    expect(fake.passes.length).toBeGreaterThan(0);
    renderer.dispose();
  });

  it.each(["sync", "async"] as const)("fails closed or draws the full forward fallback when unavailable (%s)", async (mode) => {
    const strict = await Renderer.create({ backend: "mock", width: 80, height: 40, drawingPath: { mode: "deferred" } });
    const source = { renderItems: [triangle()], cameraPolicy: "identity" as const };
    if (mode === "sync") expect(() => strict.render(source)).toThrowError(/native WebGPU/);
    else await expect(strict.renderAsync(source)).rejects.toThrowError(/native WebGPU/);
    expect((strict.device as MockRenderDevice).drawCommands).toHaveLength(0);
    expect(strict.drawingPathDiagnostics).toBeNull();
    strict.dispose();
    const renderer = await Renderer.create({ backend: "mock", width: 80, height: 40, drawingPath: { mode: "deferred", allowFallback: true } });
    const result = mode === "sync" ? renderer.render(source) : await renderer.renderAsync(source);
    expect(result.drawingPath).toMatchObject({ requested: "deferred", active: "forward", fallbackReason: expect.stringContaining("native WebGPU") });
    expect((renderer.device as MockRenderDevice).drawCommands.map((draw) => draw.label)).toEqual(["triangle"]);
    renderer.dispose();
  });

  it("rejects unsupported frame features and preserves one-shot input in allowed fallback", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 80, height: 40, drawingPath: { mode: "visibility", allowFallback: true } });
    const device = renderer.device as MockRenderDevice;
    const fake = makeNative();
    attachNative(device, fake);
    const iterator = [{ ...triangle(), modelViewProjectionMatrix: IDENTITY }][Symbol.iterator]();
    const result = renderer.render({ renderItems: iterator, cameraPolicy: "identity" });
    expect(fake.submissions).toHaveLength(0);
    expect(result.drawingPath).toMatchObject({ active: "forward", fallbackReason: expect.stringContaining("authored") });
    expect(device.drawCommands.map((draw) => draw.label)).toEqual(["triangle"]);
    renderer.dispose();
  });

  it("keeps view rendering and postprocessing in the full forward path when fallback is allowed", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 80, height: 40, drawingPath: { mode: "deferred", allowFallback: true } });
    const device = renderer.device as MockRenderDevice;
    const fake = makeNative();
    attachNative(device, fake);
    const labels: (string | undefined)[] = [];
    const draw = device.draw.bind(device);
    device.draw = (command) => { labels.push(command.label); draw(command); };
    const source = { renderItems: [triangle()], cameraPolicy: "identity" as const };
    const result = await renderer.renderAsync({ source, views: [
      { camera: { viewProjectionMatrix: IDENTITY }, viewport: rect(0, 0, 40, 40) },
      { camera: { viewProjectionMatrix: IDENTITY }, viewport: rect(40, 0, 40, 40) }
    ] });
    expect(result.drawingPath).toMatchObject({ requested: "deferred", active: "forward", fallbackReason: expect.stringContaining("multiple views") });
    expect(fake.submissions).toHaveLength(0);
    expect(labels.filter((label) => label === "triangle")).toHaveLength(2);
    renderer.dispose();

    const strict = await Renderer.create({ backend: "mock", width: 80, height: 40, drawingPath: { mode: "deferred" } });
    attachNative(strict.device as MockRenderDevice, makeNative());
    expect(() => strict.render({ ...source, postprocess: true })).toThrowError(/postprocessing/);
    strict.dispose();
  });

  it("preserves reflected-object winding through the full forward path", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 80, height: 40, drawingPath: { mode: "deferred", allowFallback: true } });
    const device = renderer.device as MockRenderDevice;
    const fake = makeNative();
    attachNative(device, fake);
    const reflected = IDENTITY.slice();
    reflected[0] = -1;
    const result = renderer.render({ renderItems: [{ ...triangle(), modelMatrix: reflected }], cameraPolicy: "identity" });
    expect(result.drawingPath).toMatchObject({ active: "forward", fallbackReason: expect.stringContaining("winding") });
    expect(fake.submissions).toHaveLength(0);
    expect(device.drawCommands[0]!.renderState?.cullMode).toBe("front");
    renderer.dispose();
  });

  it("keeps explicit offscreen color and depth together in the forward path", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 80, height: 40, drawingPath: { mode: "deferred", allowFallback: true } });
    const device = renderer.device as MockRenderDevice;
    const fake = makeNative();
    attachNative(device, fake);
    const target = device.createRenderTarget({ width: 17, height: 11, depth: "texture", label: "path-depth" });
    const result = renderer.render({ source: { renderItems: [triangle()], cameraPolicy: "identity" }, target });
    expect(result.drawingPath).toMatchObject({ active: "forward", fallbackReason: expect.stringContaining("depth attachments") });
    expect(fake.submissions).toHaveLength(0);
    expect(device.getDrawViewStates()[0]!.destination).toBe("render-target");
    renderer.dispose();
  });

  it("falls back for retained canvas viewport state without submitting native work", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 80, height: 40, drawingPath: { mode: "meshlet", allowFallback: true } });
    const device = renderer.device as MockRenderDevice;
    const fake = makeNative();
    const attachment = attachNative(device, fake);
    device.setViewport(10, 0, 30, 40, { persistent: true });
    attachment.setViewOverride(true);
    const result = renderer.render({ renderItems: [triangle()], cameraPolicy: "identity" });
    expect(result.drawingPath).toMatchObject({ requested: "meshlet", active: "forward", fallbackReason: expect.stringContaining("retained viewport") });
    expect(fake.submissions).toHaveLength(0);
    expect(device.getDrawViewStates()[0]!.viewport).toEqual(rect(10, 0, 30, 40));
    renderer.dispose();
  });

  it("uses the asynchronous render entry point for a supported native frame", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 80, height: 40, drawingPath: { mode: "visibility" } });
    const fake = makeNative();
    attachNative(renderer.device as MockRenderDevice, fake);
    const result = await renderer.renderAsync({ renderItems: [triangle()], cameraPolicy: "identity" });
    expect(result.drawingPath).toMatchObject({ requested: "visibility", active: "visibility", triangles: 1 });
    expect(fake.submissions).toHaveLength(1);
    renderer.dispose();
  });

  it("recreates the pipeline when the native generation or output size changes and disposes it", async () => {
    const dispose = vi.spyOn(DeferredPipeline.prototype, "dispose");
    try {
      const renderer = await Renderer.create({ backend: "mock", width: 80, height: 40, drawingPath: { mode: "deferred" } });
      const device = renderer.device as MockRenderDevice;
      const fake = makeNative();
      const attachment = attachNative(device, fake);
      const source = { renderItems: [triangle()], cameraPolicy: "identity" as const };
      renderer.render(source);
      const firstCount = fake.pipelines.length;
      renderer.render(source);
      expect(fake.pipelines).toHaveLength(firstCount);
      attachment.setGeneration(2);
      renderer.render(source);
      expect(fake.pipelines).toHaveLength(firstCount * 2);
      expect(dispose).toHaveBeenCalledTimes(1);
      renderer.resize(81, 40);
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(renderer.drawingPathDiagnostics).toBeNull();
      renderer.render(source);
      expect(fake.pipelines).toHaveLength(firstCount * 3);
      renderer.dispose();
      expect(dispose).toHaveBeenCalledTimes(3);
    } finally {
      dispose.mockRestore();
    }
  });
});
