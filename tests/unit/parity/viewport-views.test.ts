/**
 * threejs-parity L7/SC-01 (docs/workflows/threejs-parity-gaps.md §5.7, L7-15):
 * viewport/scissor rendering, `cameras.array` (three's ArrayCamera),
 * `cameras.stereo` (three's StereoCamera), and the XR device hooks
 * (`setViewport({ persistent })`, `resetViewport`, `setExternalFramebuffer`).
 */

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice, RenderDeviceError, type MockDrawViewState } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { camera, cameras, primitives, scene } from "../../../packages/engine/src";
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

describe("Renderer views (ArrayCamera / StereoCamera semantics, SC-01)", () => {
  const item = () => ({
    geometry: Geometry.litCube(1),
    material: new PBRMaterial({ name: "cube" }),
    label: "cube",
    modelMatrix: IDENTITY,
    includeInAutoFrame: false
  });

  const instrument = (device: MockRenderDevice) => {
    const frames: Array<{ states: readonly MockDrawViewState[]; calls: ReturnType<MockRenderDevice["getViewportCalls"]> }> = [];
    let clears = 0;
    const endFrame = device.endFrame.bind(device);
    const clear = device.clear.bind(device);
    device.endFrame = () => {
      frames.push({ states: [...device.getDrawViewStates()], calls: [...device.getViewportCalls()] });
      endFrame();
    };
    device.clear = (color) => {
      clears += 1;
      clear(color);
    };
    return { frames, clears: () => clears };
  };

  const viewCamera = () => ({ viewProjectionMatrix: IDENTITY });

  it("renders one frame per view into its viewport; only the first clears", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const device = renderer.device as MockRenderDevice;
    const seen = instrument(device);
    const left = rect(0, 0, 50, 50);
    const right = rect(50, 0, 50, 50);
    renderer.render({
      source: { renderItems: [item()], cameraPolicy: "require", frustumCulling: false },
      views: [{ camera: viewCamera(), viewport: left }, { camera: viewCamera(), viewport: right }]
    });
    expect(seen.frames).toHaveLength(2);
    expect(seen.clears()).toBe(1);
    const draws = seen.frames.map((frame) => frame.states);
    expect(draws[0]!.length).toBeGreaterThan(0);
    expect(draws[1]!.length).toBeGreaterThan(0);
    expect(draws[0]!.every((s) => JSON.stringify(s.viewport) === JSON.stringify(left) && JSON.stringify(s.scissor) === JSON.stringify(left))).toBe(true);
    expect(draws[1]!.every((s) => JSON.stringify(s.viewport) === JSON.stringify(right) && JSON.stringify(s.scissor) === JSON.stringify(right))).toBe(true);
    // order within a frame: viewport, then scissor, then scissorTest(true)
    expect(seen.frames[0]!.calls.map((c) => c.call)).toEqual(["viewport", "scissor", "scissorTest"]);
    renderer.dispose();
  });

  it("an explicit scissor narrows the viewport clip; views also flow from source.views", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const device = renderer.device as MockRenderDevice;
    const seen = instrument(device);
    renderer.render({
      renderItems: [item()],
      cameraPolicy: "require",
      frustumCulling: false,
      views: [{ camera: viewCamera(), viewport: rect(0, 0, 100, 50), scissor: rect(10, 10, 20, 20) }]
    });
    expect(seen.frames).toHaveLength(1);
    expect(seen.frames[0]!.states[0]).toMatchObject({ viewport: rect(0, 0, 100, 50), scissor: rect(10, 10, 20, 20) });
    renderer.dispose();
  });

  it("a single `viewport` input restricts rasterization and does not leak into the next frame", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const device = renderer.device as MockRenderDevice;
    const seen = instrument(device);
    renderer.render({ source: { renderItems: [item()], cameraPolicy: "require", frustumCulling: false }, camera: viewCamera(), viewport: rect(20, 10, 40, 20) });
    renderer.render({ source: { renderItems: [item()], cameraPolicy: "require", frustumCulling: false }, camera: viewCamera() });
    expect(seen.frames[0]!.states[0]).toMatchObject({ viewport: rect(20, 10, 40, 20) });
    expect(seen.frames[1]!.states[0]).toMatchObject({ viewport: rect(0, 0, 100, 50), scissor: null });
    renderer.dispose();
  });

  it("sub-camera count equals frame count, including three views", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 90, height: 30 });
    const device = renderer.device as MockRenderDevice;
    const seen = instrument(device);
    renderer.render({
      source: { renderItems: [item()], cameraPolicy: "require", frustumCulling: false },
      views: [0, 30, 60].map((x) => ({ camera: viewCamera(), viewport: rect(x, 0, 30, 30) }))
    });
    expect(seen.frames).toHaveLength(3);
    renderer.dispose();
  });

  it("works through renderAsync", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const device = renderer.device as MockRenderDevice;
    const seen = instrument(device);
    await renderer.renderAsync({
      source: { renderItems: [item()], cameraPolicy: "require", frustumCulling: false },
      views: [{ camera: viewCamera(), viewport: rect(0, 0, 50, 50) }, { camera: viewCamera(), viewport: rect(50, 0, 50, 50) }]
    });
    expect(seen.frames).toHaveLength(2);
    expect(seen.clears()).toBe(1);
    renderer.dispose();
  });

  it("rejects views combined with postprocess", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    expect(() =>
      renderer.render({
        source: {
          renderItems: [item()],
          cameraPolicy: "require",
          postprocess: { toneMapping: { exposure: 1, gamma: 1, operator: "reinhard", outputColorSpace: "linear" } }
        },
        views: [{ camera: viewCamera(), viewport: rect(0, 0, 50, 50) }]
      })
    ).toThrowError(expect.objectContaining({ code: "VIEWPORT_POSTPROCESS_UNSUPPORTED" }));
    renderer.dispose();
  });

  it("rejects viewports outside the target, empty view lists and non-finite rects", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const source = { renderItems: [item()], cameraPolicy: "require" as const, frustumCulling: false };
    expect(() => renderer.render({ source, views: [{ camera: viewCamera(), viewport: rect(60, 0, 50, 50) }] })).toThrowError(expect.objectContaining({ code: "INVALID_VIEWPORT" }));
    expect(() => renderer.render({ source, views: [{ camera: viewCamera(), viewport: rect(0, 0, 0, 10) }] })).toThrowError(expect.objectContaining({ code: "INVALID_VIEWPORT" }));
    expect(() => renderer.render({ source, views: [{ camera: viewCamera(), viewport: rect(Number.NaN, 0, 10, 10) }] })).toThrowError(expect.objectContaining({ code: "INVALID_VIEWPORT" }));
    expect(() => renderer.render({ source, views: [] })).toThrowError(expect.objectContaining({ code: "INVALID_VIEWPORT" }));
    // a failed view frame must not leave pending view state behind for the next ordinary frame
    const seen = instrument(renderer.device as MockRenderDevice);
    renderer.render({ source, camera: viewCamera() });
    expect(seen.frames.at(-1)!.states[0]).toMatchObject({ viewport: rect(0, 0, 100, 50), scissor: null });
    renderer.dispose();
  });

  it("renders views into an explicit render target at the target's size", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const device = renderer.device as MockRenderDevice;
    const target = device.createRenderTarget({ width: 40, height: 20, label: "stereo-target" });
    const seen = instrument(device);
    renderer.render({
      source: { renderItems: [item()], cameraPolicy: "require", frustumCulling: false },
      target,
      views: [{ camera: viewCamera(), viewport: rect(0, 0, 20, 20) }, { camera: viewCamera(), viewport: rect(20, 0, 20, 20) }]
    });
    expect(seen.frames).toHaveLength(2);
    expect(seen.frames[1]!.states[0]).toMatchObject({ viewport: rect(20, 0, 20, 20), destination: "render-target" });
    expect(() =>
      renderer.render({
        source: { renderItems: [item()], cameraPolicy: "require", frustumCulling: false },
        target,
        views: [{ camera: viewCamera(), viewport: rect(30, 0, 20, 20) }]
      })
    ).toThrowError(expect.objectContaining({ code: "INVALID_VIEWPORT" }));
    renderer.dispose();
  });
});

type Mat16 = ArrayLike<number>;

function expectMatrixClose(actual: Mat16, expected: Mat16, label: string): void {
  expect(actual.length).toBe(16);
  for (let i = 0; i < 16; i += 1) {
    const tolerance = 1e-6 * Math.max(1, Math.abs(expected[i]!));
    if (Math.abs(actual[i]! - expected[i]!) > tolerance) {
      throw new Error(`${label}[${i}] ${actual[i]} != three ${expected[i]} (tol ${tolerance})`);
    }
  }
}

describe("computeStereoEyes matches three's StereoCamera.update (SC-01)", () => {
  const cases = [
    { fov: 50, aspect: 1.6, near: 0.1, far: 100, focus: 10, zoom: 1, eyeSeparation: 0.064, aspectScale: 0.5, position: [0, 1.5, 5], target: [0, 0, 0] },
    { fov: 75, aspect: 2, near: 0.5, far: 300, focus: 3, zoom: 1.5, eyeSeparation: 0.2, aspectScale: 1, position: [3, 2, -4], target: [0, 1, 0] },
    { fov: 30, aspect: 0.75, near: 0.05, far: 50, focus: 25, zoom: 0.8, eyeSeparation: 0.5, aspectScale: 2, position: [-6, 4, 9], target: [1, 0, -1] },
    { fov: 90, aspect: 1, near: 1, far: 1000, focus: 1.5, zoom: 1, eyeSeparation: 0.01, aspectScale: 0.5, position: [0, 0, 0.1], target: [0, 0, -5] }
  ] as const;

  for (const params of cases) {
    it(`fov ${params.fov} / focus ${params.focus} / sep ${params.eyeSeparation} / aspect scale ${params.aspectScale}`, () => {
      const cam = new THREE.PerspectiveCamera(params.fov, params.aspect, params.near, params.far);
      cam.zoom = params.zoom;
      cam.focus = params.focus;
      cam.position.set(params.position[0], params.position[1], params.position[2]);
      cam.lookAt(params.target[0], params.target[1], params.target[2]);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      const stereo = new THREE.StereoCamera();
      stereo.aspect = params.aspectScale;
      stereo.eyeSep = params.eyeSeparation;
      stereo.update(cam);

      const eyes = computeStereoEyes({
        viewMatrix: cam.matrixWorldInverse.elements,
        projectionMatrix: cam.projectionMatrix.elements,
        cameraPosition: params.position,
        fov: params.fov,
        aspect: params.aspect,
        near: params.near,
        focus: params.focus,
        zoom: params.zoom,
        eyeSeparation: params.eyeSeparation,
        aspectScale: params.aspectScale
      });

      for (const [name, mine, theirs] of [["left", eyes.left, stereo.cameraL], ["right", eyes.right, stereo.cameraR]] as const) {
        expectMatrixClose(mine.projectionMatrix, theirs.projectionMatrix.elements, `${name}.projection`);
        // three 0.185 writes the eye transform (`camera.matrixWorld * eyeOffset`) to the unparented eye camera's local `matrix`.
        const threeView = theirs.matrix.clone().invert();
        expectMatrixClose(mine.viewMatrix, threeView.elements, `${name}.view`);
        const world = theirs.matrix.elements;
        expect(mine.cameraPosition[0]).toBeCloseTo(world[12]!, 5);
        expect(mine.cameraPosition[1]).toBeCloseTo(world[13]!, 5);
        expect(mine.cameraPosition[2]).toBeCloseTo(world[14]!, 5);
        const vp = new THREE.Matrix4().multiplyMatrices(theirs.projectionMatrix, threeView);
        expectMatrixClose(mine.viewProjectionMatrix, vp.elements, `${name}.viewProjection`);
      }
    });
  }

  it("uses three's defaults (eyeSep 0.064, focus 10) when omitted", () => {
    const cam = new THREE.PerspectiveCamera(60, 1.5, 0.1, 100);
    cam.position.set(0, 0, 4);
    cam.updateMatrixWorld(true);
    const stereo = new THREE.StereoCamera();
    stereo.update(cam);
    const eyes = computeStereoEyes({
      viewMatrix: cam.matrixWorldInverse.elements,
      projectionMatrix: cam.projectionMatrix.elements,
      cameraPosition: [0, 0, 4],
      fov: 60,
      aspect: 1.5,
      near: 0.1
    });
    expect(eyes.eyeSeparation).toBe(0.064);
    expect(eyes.focus).toBe(10);
    expectMatrixClose(eyes.left.projectionMatrix, stereo.cameraL.projectionMatrix.elements, "left.projection");
    expectMatrixClose(eyes.right.projectionMatrix, stereo.cameraR.projectionMatrix.elements, "right.projection");
  });

  it("eyes are mirror images: shifted frustums with opposite sign and equal separation", () => {
    const eyes = computeStereoEyes({
      viewMatrix: IDENTITY,
      projectionMatrix: new THREE.PerspectiveCamera(50, 1, 0.1, 100).projectionMatrix.elements,
      cameraPosition: [0, 0, 0],
      fov: 50,
      aspect: 1,
      near: 0.1,
      eyeSeparation: 0.2
    });
    expect(eyes.left.projectionMatrix[8]).toBeGreaterThan(0);
    expect(eyes.right.projectionMatrix[8]).toBeCloseTo(-eyes.left.projectionMatrix[8]!, 6);
    expect(eyes.right.cameraPosition[0] - eyes.left.cameraPosition[0]).toBeCloseTo(0.2, 6);
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
  it("cameras.stereo applies three's defaults and emits a typed node", () => {
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

  it("an orthographic scene camera cannot be split into eyes and warns", async () => {
    const { renderer, surfaces, snapshot, warnings } = await build([cameras.stereo()], "orthographic");
    const source = baseSource();
    const prepared = surfaces.prepare(source, snapshot as never, undefined, 0, 2, { width: 100, height: 50 });
    expect(prepared.views).toBeUndefined();
    expect(warnings.some((w) => w.startsWith("CAMERA_STEREO_ORTHOGRAPHIC"))).toBe(true);
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

  it("only the first multi-view node is honoured, with a warning", async () => {
    const { renderer, surfaces, snapshot, warnings } = await build([cameras.stereo(), cameras.stereo({ name: "second" })]);
    const views = surfaces.prepare(baseSource(), snapshot as never, undefined, 0, 2, { width: 100, height: 50 }).views!;
    expect(views).toHaveLength(2);
    expect(warnings.some((w) => w.startsWith("CAMERA_VIEWS_MULTIPLE"))).toBe(true);
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
    expect(frames).toHaveLength(2);
    expect(frames[0]![0]!.viewport).toEqual(rect(0, 0, 50, 50));
    expect(frames[1]![0]!.viewport).toEqual(rect(50, 0, 50, 50));
    renderer.dispose();
  });
});
