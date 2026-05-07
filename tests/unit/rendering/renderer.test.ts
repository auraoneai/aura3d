import { describe, expect, it } from "vitest";
import {
  Bone,
  Skeleton,
  buildSkinningPalette
} from "../../../packages/animation/src";
import { Ray, Vector3 } from "../../../packages/math/src";
import {
  Geometry,
  InstancedPBRMaterial,
  InstancedUnlitMaterial,
  IndexBuffer,
  MaterialInstance,
  MockRenderBuffer,
  MockRenderDevice,
  MorphUnlitMaterial,
  PBRMaterial,
  Renderer,
  SkinnedUnlitMaterial,
  UnlitMaterial,
  VertexBuffer,
  VertexFormat,
  WebGPUDevice,
  createRenderDevice,
  pickSceneRenderables,
  type WebGPUAdapterLike,
  type WebGPUBufferDescriptorLike,
  type WebGPUBufferLike,
  type WebGPUDeviceLike,
  type WebGPULike,
  type UniformValue
} from "../../../packages/rendering/src";
import { Renderable, Scene } from "../../../packages/scene/src";

interface FakeWebGPUBuffer extends WebGPUBufferLike {
  data: Uint8Array;
  usage?: string;
}

describe("Renderer", () => {
  it("renders an empty scene without draw calls", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });

    const diagnostics = renderer.render([]);

    expect(diagnostics.drawCalls).toBe(0);
    renderer.dispose();
  });

  it("draws a triangle through the forward pass", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });

    const diagnostics = renderer.render([{ geometry: Geometry.triangle(), label: "triangle" }]);

    expect(diagnostics.drawCalls).toBe(1);
    renderer.dispose();
  });

  it("submits line segment geometry through the renderer line topology path", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = Geometry.lineSegments([
      [-0.8, 0, 0],
      [0.8, 0, 0]
    ]);

    const diagnostics = renderer.render([{
      geometry,
      material: new UnlitMaterial({ color: [1, 0.2, 0.05, 1], renderState: { depthTest: false, depthWrite: false, cullMode: "none" } }),
      label: "line-segment"
    }]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.topology).toBe("lines");
    expect(command?.vertexCount).toBe(2);
    expect(command?.indexBuffer).toBeUndefined();
    expect(command?.renderState?.cullMode).toBe("none");
    renderer.dispose();
  });

  it("submits point geometry through the renderer point topology path", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = Geometry.points([
      [-0.5, 0, 0],
      [0.5, 0, 0]
    ]);

    const diagnostics = renderer.render([{
      geometry,
      material: new UnlitMaterial({ color: [0.1, 0.8, 1, 1], renderState: { depthTest: false, depthWrite: false, cullMode: "none" } }),
      label: "point-cloud"
    }]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.topology).toBe("points");
    expect(command?.vertexCount).toBe(2);
    expect(command?.indexBuffer).toBeUndefined();
    expect(command?.renderState?.cullMode).toBe("none");
    renderer.dispose();
  });

  it("applies resized frame dimensions to the next render viewport", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });

    renderer.resize(16, 12);
    renderer.render([{ geometry: Geometry.triangle(), label: "resized-triangle" }]);

    expect(renderer.device.captureState().get("viewportWidth")).toBe(16);
    expect(renderer.device.captureState().get("viewportHeight")).toBe(12);
    renderer.dispose();
  });

  it("resizes canvas backing buffers from CSS display size and DPR", async () => {
    const canvas = {
      width: 1,
      height: 1,
      getBoundingClientRect: () => ({ width: 123.4, height: 56.2 })
    } as HTMLCanvasElement;
    const renderer = await Renderer.create({ backend: "mock", canvas, width: 1, height: 1 });

    const first = renderer.resizeToDisplay({ devicePixelRatio: 2 });
    const second = renderer.resizeToDisplay({ devicePixelRatio: 2 });

    expect(first).toEqual({
      resized: true,
      cssWidth: 123.4,
      cssHeight: 56.2,
      devicePixelRatio: 2,
      width: 247,
      height: 112
    });
    expect(second.resized).toBe(false);
    expect(canvas.width).toBe(247);
    expect(canvas.height).toBe(112);
    renderer.render([{ geometry: Geometry.triangle(), label: "dpr-triangle" }]);
    expect(renderer.device.captureState().get("viewportWidth")).toBe(247);
    expect(renderer.device.captureState().get("viewportHeight")).toBe(112);
    renderer.dispose();
  });

  it("owns and stops renderer animation loops on stop or disposal", async () => {
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    let nextId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number): void => {
      callbacks.delete(id);
    }) as typeof cancelAnimationFrame;

    try {
      const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
      let frames = 0;
      const loop = renderer.startAnimationLoop(() => {
        frames += 1;
      });

      callbacks.get(1)?.(16);
      callbacks.get(2)?.(32);
      expect(frames).toBe(2);
      expect(loop.running).toBe(true);
      loop.stop();
      expect(loop.running).toBe(false);
      expect(callbacks.has(3)).toBe(false);

      const disposedLoop = renderer.startAnimationLoop(() => {
        frames += 1;
      });
      renderer.dispose();
      expect(disposedLoop.running).toBe(false);
    } finally {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("submits instanced unlit geometry as one GPU instanced draw command", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const transforms = new Float32Array([
      ...translationMatrix(-0.5, 0, 0),
      ...translationMatrix(0.5, 0, 0)
    ]);

    const diagnostics = renderer.render([{
      geometry: Geometry.triangle(),
      material: new InstancedUnlitMaterial({ color: [0.2, 0.8, 0.3, 1] }),
      instanceTransforms: transforms,
      label: "instanced-triangles"
    }]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.instanceCount).toBe(2);
    expect(command?.uniforms?.get("u_instanceCount")).toBe(2);
    const matrices = command?.uniforms?.get("u_instanceMatrices");
    expect(matrices).toBeInstanceOf(Float32Array);
    expect(Array.from((matrices as Float32Array).slice(12, 16))).toEqual([-0.5, 0, 0, 1]);
    expect(Array.from((matrices as Float32Array).slice(28, 32))).toEqual([0.5, 0, 0, 1]);
    renderer.dispose();
  });

  it("submits instanced PBR geometry with normal and light uniforms", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const transforms = new Float32Array([
      ...translationMatrix(-0.4, 0, 0),
      ...translationMatrix(0.4, 0, 0)
    ]);

    const diagnostics = renderer.render([{
      geometry: Geometry.litTriangle(),
      material: new InstancedPBRMaterial({
        baseColor: [0.25, 0.7, 0.95, 1],
        roughness: 0.55,
        emissiveColor: [0.04, 0.08, 0.12]
      }),
      instanceTransforms: transforms,
      label: "instanced-pbr-triangles"
    }]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.instanceCount).toBe(2);
    expect(command?.uniforms?.get("u_instanceCount")).toBe(2);
    expect(command?.uniforms?.get("u_lightCount")).toBe(0);
    expect(command?.shader?.label).toBe("galileo3d/instanced-pbr");
    expect(command?.shader?.reflection.uniforms.has("u_lightData")).toBe(true);
    expect(command?.vertexFormat?.hasAttribute("normal")).toBe(true);
    const matrices = command?.uniforms?.get("u_instanceMatrices");
    expect(matrices).toBeInstanceOf(Float32Array);
    expect(Array.from((matrices as Float32Array).slice(12, 16)).map((value) => Number(value.toFixed(3)))).toEqual([-0.4, 0, 0, 1]);
    expect(Array.from((matrices as Float32Array).slice(28, 32)).map((value) => Number(value.toFixed(3)))).toEqual([0.4, 0, 0, 1]);
    renderer.dispose();
  });

  it("renders material instance overrides without mutating the shared base material", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const baseMaterial = new UnlitMaterial({ color: [0.1, 0.2, 0.3, 1] });
    const instance = new MaterialInstance(baseMaterial);
    instance.setOverride("u_baseColor", [0.9, 0.1, 0.2, 1]);

    const diagnostics = renderer.render([{
      geometry: Geometry.triangle(),
      material: instance,
      label: "material-instance-triangle"
    }]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.uniforms?.get("u_baseColor")).toEqual([0.9, 0.1, 0.2, 1]);
    expect(baseMaterial.getParameter("u_baseColor")).toEqual([0.1, 0.2, 0.3, 1]);
    expect(command?.renderState).toEqual(baseMaterial.renderState);
    expect(command?.shader?.label).toBe(baseMaterial.shaderKey);

    renderer.dispose();
  });

  it("resolves scene renderables through explicit resource libraries", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const scene = new Scene();
    const node = scene.createNode("scene-triangle");
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:triangle", material: "material:unlit", morphWeights: [0.25] }));
    const geometry = Geometry.litTriangle();
    const material = new UnlitMaterial();

    const diagnostics = renderer.render({
      scene,
      geometryLibrary: { "geometry:triangle": geometry },
      materialLibrary: new Map([["material:unlit", material]]),
      morphTargetLibrary: {
        "geometry:triangle": [{ positions: [[0, 0, 0], [0, 0, 1], [0, 0, 2]] }]
      }
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const buffer = command?.vertexBuffer as MockRenderBuffer;
    const floats = new Float32Array(buffer.bytes.buffer.slice(buffer.bytes.byteOffset, buffer.bytes.byteOffset + buffer.bytes.byteLength));
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.label).toBe("scene-triangle");
    expect(Array.from(floats.slice(0, 15)).map((value) => Number(value.toFixed(3)))).toEqual([
      -0.5, -0.5, 0, 0, 0, 1,
      0.5, -0.5, 0.25, 0, 0, 1,
      0, 0.5, 0.5
    ]);

    renderer.dispose();
    geometry.dispose();
  });

  it("carries scene renderable instance transforms into instanced draw commands", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const scene = new Scene();
    const node = scene.createNode("scene-instanced-triangle");
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({
      geometry: "geometry:triangle",
      material: "material:instanced",
      instanceTransforms: [
        ...translationMatrix(-0.25, 0, 0),
        ...translationMatrix(0.25, 0, 0)
      ]
    }));
    const geometry = Geometry.triangle();
    const material = new InstancedUnlitMaterial({ color: [0.4, 0.8, 0.2, 1] });

    const diagnostics = renderer.render({
      scene,
      geometryLibrary: { "geometry:triangle": geometry },
      materialLibrary: new Map([["material:instanced", material]])
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const matrices = command?.uniforms?.get("u_instanceMatrices");
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.instanceCount).toBe(2);
    expect(matrices).toBeInstanceOf(Float32Array);
    expect(Array.from((matrices as Float32Array).slice(12, 16))).toEqual([-0.25, 0, 0, 1]);
    expect(Array.from((matrices as Float32Array).slice(28, 32))).toEqual([0.25, 0, 0, 1]);

    renderer.dispose();
    geometry.dispose();
  });

  it("applies camera view-projection and scene node transforms to renderer matrix uniforms", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const scene = new Scene();
    const node = scene.createNode("scene-pbr-cube");
    node.transform.setPosition(2, 3, 4);
    node.transform.setScale(2, 4, 8);
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:lit", material: "material:pbr" }));
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();

    const diagnostics = renderer.render(
      {
        scene,
        geometryLibrary: { "geometry:lit": geometry },
        materialLibrary: new Map([["material:pbr", material]])
      },
      { viewProjectionMatrix: translationMatrix(1, 2, 3) }
    );

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const model = command?.uniforms?.get("u_modelMatrix") as Float32Array;
    const normal = command?.uniforms?.get("u_normalMatrix") as Float32Array;
    const mvp = command?.uniforms?.get("u_modelViewProjection") as Float32Array;
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.label).toBe("scene-pbr-cube");
    expect(Array.from(model.slice(0, 16)).map(round3)).toEqual([
      2, 0, 0, 0,
      0, 4, 0, 0,
      0, 0, 8, 0,
      2, 3, 4, 1
    ]);
    expect(Array.from(normal.slice(0, 16)).map(round3)).toEqual([
      0.5, 0, 0, -1,
      0, 0.25, 0, -0.75,
      0, 0, 0.125, -0.5,
      0, 0, 0, 1
    ]);
    expect(Array.from(mvp.slice(12, 16)).map(round3)).toEqual([3, 5, 7, 1]);

    renderer.dispose();
    geometry.dispose();
  });

  it("culls scene renderables against the active scene camera frustum by default", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera({ name: "main-camera", fovYRadians: Math.PI / 2, aspect: 1, near: 0.1, far: 20 });
    scene.root.addChild(camera);
    const visible = scene.createNode("visible-cube");
    visible.transform.setPosition(0, 0, -4);
    scene.root.addChild(visible);
    scene.addRenderable(visible, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const culled = scene.createNode("outside-frustum-cube");
    culled.transform.setPosition(30, 0, -4);
    scene.root.addChild(culled);
    scene.addRenderable(culled, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const geometry = Geometry.cube();
    const material = new UnlitMaterial();

    const diagnostics = renderer.render({
      scene,
      geometryLibrary: { "geometry:cube": geometry },
      materialLibrary: { "material:unlit": material }
    });

    expect(diagnostics.drawCalls).toBe(1);
    expect((renderer.device as MockRenderDevice).drawCommands.map((command) => command.label)).toEqual(["visible-cube"]);
    renderer.dispose();
    geometry.dispose();
  });

  it("can disable scene camera frustum culling for diagnostics and authoring tools", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera({ name: "main-camera", fovYRadians: Math.PI / 2, aspect: 1, near: 0.1, far: 20 });
    scene.root.addChild(camera);
    const visible = scene.createNode("visible-cube");
    visible.transform.setPosition(0, 0, -4);
    scene.root.addChild(visible);
    scene.addRenderable(visible, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const outside = scene.createNode("outside-frustum-cube");
    outside.transform.setPosition(30, 0, -4);
    scene.root.addChild(outside);
    scene.addRenderable(outside, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const geometry = Geometry.cube();
    const material = new UnlitMaterial();

    const diagnostics = renderer.render({
      scene,
      geometryLibrary: { "geometry:cube": geometry },
      materialLibrary: { "material:unlit": material },
      frustumCulling: false
    });

    expect(diagnostics.drawCalls).toBe(2);
    expect((renderer.device as MockRenderDevice).drawCommands.map((command) => command.label)).toEqual([
      "visible-cube",
      "outside-frustum-cube"
    ]);
    renderer.dispose();
    geometry.dispose();
  });

  it("picks the nearest scene renderable using transformed geometry bounds", () => {
    const scene = new Scene();
    const near = scene.createNode("near-cube");
    near.transform.setPosition(0, 0, 0);
    scene.root.addChild(near);
    scene.addRenderable(near, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const far = scene.createNode("far-cube");
    far.transform.setPosition(0, 0, -4);
    scene.root.addChild(far);
    scene.addRenderable(far, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const miss = scene.createNode("miss-cube");
    miss.transform.setPosition(4, 0, 0);
    scene.root.addChild(miss);
    scene.addRenderable(miss, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const geometry = Geometry.cube();

    const hit = pickSceneRenderables(
      { scene, geometryLibrary: { "geometry:cube": geometry } },
      new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1))
    );

    expect(hit?.node.name).toBe("near-cube");
    expect(hit?.geometry).toBe(geometry);
    expect(hit?.distance).toBeCloseTo(4.5);
    expect(hit?.bounds.min).toEqual([-0.5, -0.5, -0.5]);
    expect(hit?.bounds.max).toEqual([0.5, 0.5, 0.5]);
    expect(
      pickSceneRenderables({ scene, geometryLibrary: { "geometry:cube": geometry } }, new Ray(new Vector3(4, 4, 5), new Vector3(0, 0, -1)))
    ).toBeUndefined();
    geometry.dispose();
  });

  it("includes scene renderable instance transforms in pick bounds and rejects missing pick resources", () => {
    const scene = new Scene();
    const instanced = scene.createNode("instanced-cubes");
    scene.root.addChild(instanced);
    scene.addRenderable(instanced, new Renderable({
      geometry: "geometry:cube",
      material: "material:unlit",
      instanceTransforms: [
        ...translationMatrix(5, 0, 0),
        ...translationMatrix(0, 0, -2)
      ]
    }));
    const geometry = Geometry.cube();

    const hit = pickSceneRenderables(
      { scene, geometryLibrary: { "geometry:cube": geometry } },
      new Ray(new Vector3(5, 0, 5), new Vector3(0, 0, -1))
    );

    expect(hit?.node.name).toBe("instanced-cubes");
    expect(hit?.bounds.min).toEqual([-0.5, -0.5, -2.5]);
    expect(hit?.bounds.max).toEqual([5.5, 0.5, 0.5]);
    expect(() => pickSceneRenderables({ scene }, new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)))).toThrow(/geometryLibrary/);
    expect(() => pickSceneRenderables({ scene, geometryLibrary: {} }, new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)))).toThrow(
      /missing geometry/
    );
    geometry.dispose();
  });

  it("applies an explicit camera to direct render items without mutating the material", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const material = new UnlitMaterial();

    renderer.render(
      [{ geometry: Geometry.triangle(), material, label: "camera-space-triangle" }],
      { viewProjectionMatrix: translationMatrix(0.25, 0.5, 0.75) }
    );

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const mvp = command?.uniforms?.get("u_modelViewProjection") as Float32Array;
    expect(Array.from(mvp.slice(12, 16)).map(round3)).toEqual([0.25, 0.5, 0.75, 1]);
    expect(Array.from(material.getParameter("u_modelViewProjection") as Float32Array).slice(12, 16)).toEqual([0, 0, 0, 1]);

    renderer.dispose();
  });

  it("rejects unresolved scene render resources instead of silently skipping renderables", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const scene = new Scene();
    const node = scene.createNode("missing-scene-resource");
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:missing", material: "material:missing" }));

    expect(() => renderer.render(scene)).toThrow(/geometryLibrary and materialLibrary/);
    expect(() =>
      renderer.render({
        scene,
        geometryLibrary: {},
        materialLibrary: {}
      })
    ).toThrow(/missing geometry/);

    renderer.dispose();
  });

  it("rejects render after dispose", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    renderer.dispose();

    expect(() => renderer.render([])).toThrow(/disposed/);
  });

  it("routes backend requests through one RenderDevice abstraction and reports missing WebGPU runtime explicitly", async () => {
    const mock = await createRenderDevice({ backend: "mock" });
    expect(mock.kind).toBe("mock");
    expect(mock.getDiagnostics()).toMatchObject({ drawCalls: 0, contextLost: false });
    mock.dispose();

    await expect(createRenderDevice({ backend: "webgpu" })).rejects.toMatchObject({
      name: "RenderDeviceError",
      code: "WEBGPU_RUNTIME_MISSING"
    });

    await expect(createRenderDevice({ backend: "webgpu", webgpu: createAdapterlessWebGPU() })).rejects.toMatchObject({
      name: "RenderDeviceError",
      code: "WEBGPU_ADAPTER_MISSING"
    });
  });

  it("rejects malformed WebGPU devices during backend creation", async () => {
    await expect(createRenderDevice({ backend: "webgpu", webgpu: createRejectingWebGPU() })).rejects.toMatchObject({
      name: "RenderDeviceError",
      code: "WEBGPU_DEVICE_REQUEST_FAILED"
    });

    await expect(createRenderDevice({ backend: "webgpu", webgpu: createMalformedWebGPU() })).rejects.toMatchObject({
      name: "RenderDeviceError",
      code: "WEBGPU_DEVICE_INVALID",
      details: {
        missing: expect.arrayContaining(["queue.writeBuffer", "queue.submit"])
      }
    });
  });

  it("creates a WebGPU render device through an injected adapter and verifies resources, readback, and diagnostics", async () => {
    const fakeGpu = createFakeWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: fakeGpu });

    expect(device.kind).toBe("webgpu");
    expect(device.info.renderer).toBe("unit-webgpu-adapter");
    expect(device.info.capabilities).toEqual(expect.arrayContaining(["buffers", "buffer-readback", "draw-validation"]));
    expect(device.info.capabilities).toContain("rasterization");
    expect(device.info.limitations?.join(" ")).toContain("native WebGPU render-pipeline");

    const buffer = device.createBuffer("vertex", 8, new Uint8Array([1, 2, 3, 4]));
    device.updateBuffer(buffer, 4, new Uint8Array([5, 6, 7, 8]));
    expect(Array.from(device.readBuffer(buffer))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    const shader = device.createShaderProgram({
      label: "unit-shader",
      marker: "@galileo3d-shader:unit",
      vertex: "// @galileo3d-shader:unit\nin vec3 position; uniform mat4 modelViewProjection;",
      fragment: "// @galileo3d-shader:unit\nuniform vec4 color;"
    });
    expect(shader.reflection.attributes.has("position")).toBe(true);
    expect(shader.reflection.uniforms.has("modelViewProjection")).toBe(true);
    expect(shader.reflection.uniforms.has("color")).toBe(true);

    const target = device.createRenderTarget({ width: 2, height: 2, label: "offscreen" });
    device.setRenderTarget(target);
    device.beginFrame(2, 2);
    device.clear([0.2, 0.4, 0.6, 1]);
    device.draw({ label: "webgpu-triangle", topology: "triangles", vertexBuffer: buffer, vertexCount: 3, shader });
    device.endFrame();

    expect(Array.from(device.readPixels(0, 0, 1, 1))).toEqual([51, 102, 153, 255]);
    expect(device.captureState().get("renderTarget")).toBe("offscreen");
    expect(device.getDiagnostics()).toMatchObject({
      drawCalls: 1,
      buffers: 1,
      shaders: 1,
      renderTargets: 1,
      contextLost: false,
      lastError: null
    });

    target.dispose();
    expect(device.getDiagnostics().renderTargets).toBe(0);
    device.dispose();
    expect(device.disposed).toBe(true);
  });

  it("marks WebGPU diagnostics as context lost when the native device lost promise resolves", async () => {
    let resolveLost!: (info: { readonly reason: string; readonly message: string }) => void;
    const lost = new Promise<{ readonly reason: string; readonly message: string }>((resolve) => {
      resolveLost = resolve;
    });
    const nativeDevice = { ...createFakeWebGPUDevice(), lost };
    const device = await createRenderDevice({
      backend: "webgpu",
      webgpu: {
        async requestAdapter(): Promise<WebGPUAdapterLike> {
          return {
            name: "lost-webgpu-adapter",
            async requestDevice(): Promise<WebGPUDeviceLike> {
              return nativeDevice;
            }
          };
        }
      }
    });

    const buffer = device.createBuffer("vertex", 4, new Uint8Array([1, 2, 3, 4]));
    expect(device.getDiagnostics()).toMatchObject({ contextLost: false, lastError: null });

    resolveLost({ reason: "destroyed", message: "unit lost event" });
    await Promise.resolve();
    await Promise.resolve();

    expect(device.getDiagnostics()).toMatchObject({
      contextLost: true,
      lastError: "WebGPU device lost: destroyed: unit lost event"
    });
    expect(device.captureState().get("contextLost")).toBe(true);
    let thrown: unknown;
    try {
      device.readBuffer(buffer);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      name: "RenderDeviceError",
      code: "CONTEXT_LOST"
    });
  });

  it("rasterizes a WebGPU triangle into an offscreen render target for deterministic readback", async () => {
    const device = await createRenderDevice({ backend: "webgpu", webgpu: createFakeWebGPU() });
    const vertices = new Float32Array([
      -0.8, -0.8, 0,
      0.8, -0.8, 0,
      0, 0.8, 0
    ]);
    const buffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const shader = device.createShaderProgram({
      label: "raster-shader",
      marker: "@galileo3d-shader:raster",
      vertex: "// @galileo3d-shader:raster\nin vec3 position;",
      fragment: "// @galileo3d-shader:raster\nuniform vec4 u_color;"
    });
    const target = device.createRenderTarget({ width: 16, height: 16, label: "webgpu-raster-target" });
    device.setRenderTarget(target);
    device.beginFrame(16, 16);
    device.clear([0, 0, 0, 1]);
    device.draw({
      topology: "triangles",
      vertexBuffer: buffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      shader,
      uniforms: new Map([["u_color", [0.1, 0.8, 0.2, 1]]])
    });
    device.endFrame();

    expect(Array.from(device.readPixels(8, 8, 1, 1))).toEqual([26, 204, 51, 255]);
    device.dispose();
  });

  it("modulates WebGPU offscreen raster output with vertex colors", async () => {
    const device = await createRenderDevice({ backend: "webgpu", webgpu: createFakeWebGPU() });
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "color", components: 4, offset: 12 }
    ], 28);
    const vertices = new Float32Array([
      -0.8, -0.8, 0, 0.25, 0.5, 1, 0.5,
      0.8, -0.8, 0, 0.25, 0.5, 1, 0.5,
      0, 0.8, 0, 0.25, 0.5, 1, 0.5
    ]);
    const buffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const shader = device.createShaderProgram({
      label: "vertex-color-raster-shader",
      marker: "@galileo3d-shader:vertex-color-raster",
      vertex: "// @galileo3d-shader:vertex-color-raster\nin vec3 position; in vec4 a_color;",
      fragment: "// @galileo3d-shader:vertex-color-raster\nuniform vec4 u_color; in vec4 v_vertexColor;"
    });
    const target = device.createRenderTarget({ width: 16, height: 16, label: "webgpu-vertex-color-target" });
    device.setRenderTarget(target);
    device.beginFrame(16, 16);
    device.clear([0, 0, 0, 1]);
    device.draw({
      topology: "triangles",
      vertexBuffer: buffer,
      vertexFormat: format,
      vertexCount: 3,
      shader,
      uniforms: new Map([["u_color", [0.4, 0.4, 0.4, 1]]])
    });
    device.endFrame();

    expect(Array.from(device.readPixels(8, 8, 1, 1))).toEqual([26, 51, 102, 128]);
    device.dispose();
  });

  it("rasterizes WebGPU line and point topologies into deterministic offscreen readback", async () => {
    const device = await createRenderDevice({ backend: "webgpu", webgpu: createFakeWebGPU() });
    const lineVertices = new Float32Array([
      -0.75, 0, 0,
      0.75, 0, 0
    ]);
    const pointVertices = new Float32Array([
      0, 0.65, 0
    ]);
    const lineBuffer = device.createBuffer("vertex", lineVertices.byteLength, lineVertices);
    const pointBuffer = device.createBuffer("vertex", pointVertices.byteLength, pointVertices);
    const shader = device.createShaderProgram({
      label: "webgpu-line-point-raster-shader",
      marker: "@galileo3d-shader:webgpu-line-point-raster",
      vertex: "// @galileo3d-shader:webgpu-line-point-raster\nin vec3 position;",
      fragment: "// @galileo3d-shader:webgpu-line-point-raster\nuniform vec4 u_color;"
    });
    const target = device.createRenderTarget({ width: 32, height: 32, label: "webgpu-line-point-raster-target" });

    device.setRenderTarget(target);
    device.beginFrame(32, 32);
    device.clear([0, 0, 0, 1]);
    device.draw({
      label: "webgpu-line-raster",
      topology: "lines",
      vertexBuffer: lineBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 2,
      shader,
      uniforms: new Map([["u_color", [0.9, 0.2, 0.1, 1]]])
    });
    device.draw({
      label: "webgpu-point-raster",
      topology: "points",
      vertexBuffer: pointBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 1,
      shader,
      uniforms: new Map([["u_color", [0.1, 0.35, 1, 1]]])
    });
    device.endFrame();

    expect(Array.from(device.readPixels(16, 16, 1, 1))).toEqual([230, 51, 26, 255]);
    expect(Array.from(device.readPixels(16, 5, 1, 1))).toEqual([26, 89, 255, 255]);
    expect(device.getDiagnostics().drawCalls).toBe(2);
    device.dispose();
  });

  it("rasterizes WebGPU instanced triangles into deterministic offscreen readback", async () => {
    const device = await createRenderDevice({ backend: "webgpu", webgpu: createFakeWebGPU() });
    const vertices = new Float32Array([
      -0.25, -0.25, 0,
      0.25, -0.25, 0,
      0, 0.25, 0
    ]);
    const transforms = new Float32Array([
      ...translationMatrix(-0.45, 0, 0),
      ...translationMatrix(0.45, 0, 0)
    ]);
    const buffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const shader = device.createShaderProgram({
      label: "webgpu-instanced-raster-shader",
      marker: "@galileo3d-shader:webgpu-instanced-raster",
      vertex: "// @galileo3d-shader:webgpu-instanced-raster\nin vec3 position; uniform mat4 u_instanceMatrices[64]; uniform float u_instanceCount;",
      fragment: "// @galileo3d-shader:webgpu-instanced-raster\nuniform vec4 u_baseColor;"
    });
    const target = device.createRenderTarget({ width: 32, height: 32, label: "webgpu-instanced-raster-target" });

    device.setRenderTarget(target);
    device.beginFrame(32, 32);
    device.clear([0, 0, 0, 1]);
    device.draw({
      label: "webgpu-instanced-raster",
      topology: "triangles",
      vertexBuffer: buffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      shader,
      uniforms: new Map<string, UniformValue>([
        ["u_baseColor", [0.2, 0.8, 0.3, 1]],
        ["u_instanceMatrices", transforms],
        ["u_instanceCount", 2]
      ]),
      instanceCount: 2
    });
    device.endFrame();

    expect(device.getDiagnostics().drawCalls).toBe(1);
    expect(Array.from(device.readPixels(9, 17, 1, 1))).toEqual([51, 204, 77, 255]);
    expect(Array.from(device.readPixels(23, 17, 1, 1))).toEqual([51, 204, 77, 255]);
    expect(Array.from(device.readPixels(16, 17, 1, 1))).toEqual([0, 0, 0, 255]);
    device.dispose();
  });

  it("submits a native WebGPU render pass when the device exposes pipeline APIs", async () => {
    const native = createNativeFakeWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: native.gpu });
    const vertices = new Float32Array([
      -0.5, -0.5, 0,
      0.5, -0.5, 0,
      0, 0.5, 0
    ]);
    const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const shader = device.createShaderProgram({
      label: "native-webgpu",
      marker: "@galileo3d-shader:native-webgpu",
      vertex: "// @galileo3d-shader:native-webgpu\nin vec3 position;",
      fragment: "// @galileo3d-shader:native-webgpu\nuniform vec4 color;"
    });
    const target = device.createRenderTarget({ width: 8, height: 8, label: "native-target" });

    expect(device.info.capabilities).toContain("native-render-pipeline");
    expect(device.info.limitations?.join(" ")).not.toContain("requires createRenderPipeline");

    device.setRenderTarget(target);
    device.beginFrame(8, 8);
    device.clear([0, 0, 0, 1]);
    device.draw({
      label: "native-triangle",
      topology: "triangles",
      vertexBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      shader
    });
    device.endFrame();

    expect(device.getDiagnostics().nativeSubmissions).toBe(1);
    expect(native.device.shaderModules.map((module) => module.code)).toEqual([
      expect.stringContaining("@vertex"),
      expect.stringContaining("@group(0) @binding(0)")
    ]);
    expect(native.device.pipelines[0]).toMatchObject({
      label: "native-webgpu-pipeline",
      vertex: {
        entryPoint: "vs_main",
        buffers: [{
          arrayStride: 12,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }]
        }]
      },
      fragment: {
        entryPoint: "fs_main",
        targets: [{ format: "rgba8unorm" }]
      }
    });
    expect(native.device.renderPasses).toEqual([
      expect.objectContaining({
        label: "native-triangle-pass",
        pipeline: "native-webgpu-pipeline",
        vertexBuffers: [0],
        drawCalls: [{ kind: "draw", count: 3 }]
      })
    ]);
    expect(native.device.bindGroups).toHaveLength(1);
    expect(native.device.uniformWrites[0]).toEqual([1, 1, 1, 1]);
    expect(native.device.submissions.length).toBeGreaterThanOrEqual(1);
    device.dispose();
  });

  it("submits native WebGPU indexed draws only when indexed pass APIs are present", async () => {
    const native = createNativeFakeWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: native.gpu });
    const vertices = new Float32Array([
      -0.5, -0.5, 0,
      0.5, -0.5, 0,
      0, 0.5, 0
    ]);
    const indices = new Uint16Array([0, 1, 2]);
    const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const indexBuffer = device.createBuffer("index", indices.byteLength, indices);
    const shader = device.createShaderProgram({
      label: "native-webgpu-indexed",
      marker: "@galileo3d-shader:native-webgpu-indexed",
      vertex: "// @galileo3d-shader:native-webgpu-indexed\nin vec3 position;",
      fragment: "// @galileo3d-shader:native-webgpu-indexed\nuniform vec4 color;"
    });
    const target = device.createRenderTarget({ width: 8, height: 8, label: "native-indexed-target" });

    device.setRenderTarget(target);
    device.beginFrame(8, 8);
    device.clear([0, 0, 0, 1]);
    device.draw({
      label: "native-indexed-triangle",
      topology: "triangles",
      vertexBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      indexBuffer,
      indexType: "uint16",
      indexCount: 3,
      shader
    });
    device.endFrame();

    expect(device.getDiagnostics().nativeSubmissions).toBe(1);
    expect(native.device.renderPasses[0]).toMatchObject({
      label: "native-indexed-triangle-pass",
      indexBuffers: [{ slot: 0, indexFormat: "uint16" }],
      drawCalls: [{ kind: "drawIndexed", count: 3, instances: 1 }]
    });
    device.dispose();

    const limitedNative = createNativeFakeWebGPU({ indexedPassApi: false });
    const limitedDevice = await createRenderDevice({ backend: "webgpu", webgpu: limitedNative.gpu });
    const limitedVertexBuffer = limitedDevice.createBuffer("vertex", vertices.byteLength, vertices);
    const limitedIndexBuffer = limitedDevice.createBuffer("index", indices.byteLength, indices);
    const limitedShader = limitedDevice.createShaderProgram({
      label: "native-webgpu-indexed-limited",
      marker: "@galileo3d-shader:native-webgpu-indexed-limited",
      vertex: "// @galileo3d-shader:native-webgpu-indexed-limited\nin vec3 position;",
      fragment: "// @galileo3d-shader:native-webgpu-indexed-limited\nuniform vec4 color;"
    });
    const limitedTarget = limitedDevice.createRenderTarget({ width: 8, height: 8, label: "native-indexed-limited-target" });

    limitedDevice.setRenderTarget(limitedTarget);
    limitedDevice.beginFrame(8, 8);
    limitedDevice.draw({
      label: "native-indexed-limited",
      topology: "triangles",
      vertexBuffer: limitedVertexBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      indexBuffer: limitedIndexBuffer,
      indexType: "uint16",
      indexCount: 3,
      shader: limitedShader
    });
    limitedDevice.endFrame();

    expect(limitedDevice.getDiagnostics().nativeSubmissions).toBe(0);
    expect(limitedDevice.getDiagnostics().lastError).toMatch(/indexed draw skipped/);
    expect(limitedNative.device.submissions).toEqual([]);
    limitedDevice.dispose();
  });

  it("configures a WebGPU canvas surface and submits native render passes to the current texture", async () => {
    const native = createNativeFakeWebGPU();
    const canvas = createFakeWebGPUCanvas();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: native.gpu, canvas: canvas as unknown as OffscreenCanvas });
    const vertices = new Float32Array([
      -0.5, -0.5, 0,
      0.5, -0.5, 0,
      0, 0.5, 0
    ]);
    const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const shader = device.createShaderProgram({
      label: "native-webgpu-canvas",
      marker: "@galileo3d-shader:native-webgpu-canvas",
      vertex: "// @galileo3d-shader:native-webgpu-canvas\nin vec3 position;",
      fragment: "// @galileo3d-shader:native-webgpu-canvas\nuniform vec4 color;"
    });

    expect(device.info.capabilities).toEqual(expect.arrayContaining(["native-render-pipeline", "canvas-surface"]));
    expect(canvas.context.configurations).toHaveLength(1);
    expect(canvas.context.configurations[0]).toMatchObject({
      format: "bgra8unorm",
      alphaMode: "opaque"
    });

    device.beginFrame(16, 16);
    device.clear([0, 0, 0, 1]);
    device.draw({
      label: "native-canvas-triangle",
      topology: "triangles",
      vertexBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      shader
    });
    device.endFrame();

    expect(device.captureState().get("renderTarget")).toBe(null);
    expect(device.captureState().get("canvasSubmissions")).toBe(1);
    expect(device.getDiagnostics().nativeSubmissions).toBe(1);
    expect(native.device.pipelines[0]).toMatchObject({
      fragment: {
        targets: [{ format: "bgra8unorm" }]
      }
    });
    expect(native.device.bindGroups[0]).toMatchObject({
      label: "native-canvas-triangle-fragment-bind-group",
      entries: [{ binding: 0 }]
    });
    expect(canvas.context.currentTextureViews).toEqual([1]);
    expect(native.device.renderPasses).toEqual([
      expect.objectContaining({
        label: "native-canvas-triangle-pass",
        pipeline: "native-webgpu-canvas-pipeline",
        drawCalls: [{ kind: "draw", count: 3 }]
      })
    ]);

    device.dispose();
    expect(canvas.context.unconfigured).toBe(true);
  });

  it("validates WebGPU foreign and disposed resources", async () => {
    const first = await WebGPUDevice.create({ gpu: createFakeWebGPU() });
    const second = await WebGPUDevice.create({ gpu: createFakeWebGPU() });
    const firstBuffer = first.createBuffer("vertex", 4);
    const secondBuffer = second.createBuffer("vertex", 4);

    first.beginFrame(1, 1);
    expect(() => first.draw({ topology: "triangles", vertexBuffer: secondBuffer, vertexCount: 3 })).toThrow(/not created by this WebGPU device/);
    first.endFrame();

    firstBuffer.dispose();
    first.beginFrame(1, 1);
    expect(() => first.draw({ topology: "triangles", vertexBuffer: firstBuffer, vertexCount: 3 })).toThrow(/disposed/);
    first.endFrame();

    first.dispose();
    second.dispose();
  });

  it("binds animation skinning palettes into renderer draw uniforms", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const skeleton = new Skeleton([
      new Bone({ name: "root", parentIndex: -1, translation: [0, 0, 0] }),
      new Bone({ name: "child", parentIndex: 0, translation: [0.25, 0, 0] })
    ]);
    const skinning = buildSkinningPalette(skeleton);
    const geometry = createSkinnedTriangle();

    renderer.render([
      {
        geometry,
        material: new SkinnedUnlitMaterial({ color: [0.2, 0.8, 0.5, 1] }),
        skinning,
        label: "skinned-triangle"
      }
    ]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(command?.uniforms?.get("u_jointCount")).toBe(2);
    expect(command?.uniforms?.get("u_jointMatrices")).toBeInstanceOf(Float32Array);
    expect(Array.from((command?.uniforms?.get("u_jointMatrices") as Float32Array).slice(16, 20))).toEqual([1, 0, 0, 0]);
    expect((command?.uniforms?.get("u_jointMatrices") as Float32Array)[28]).toBe(0.25);
    expect(command?.vertexFormat?.hasAttribute("joints")).toBe(true);
    expect(command?.vertexFormat?.hasAttribute("weights")).toBe(true);

    renderer.dispose();
    geometry.dispose();
  });

  it("applies morph target weights before renderer draw submission", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = Geometry.litTriangle();

    renderer.render([
      {
        geometry,
        material: new UnlitMaterial(),
        morphTargets: [
          {
            positions: [[0, 0, 0], [0, 0, 1], [0, 0, 2]],
            normals: [[0, 0, 0], [0, 1, 0], [0, 2, 0]]
          }
        ],
        morphWeights: [0.5],
        label: "morphed-triangle"
      }
    ]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const buffer = command?.vertexBuffer as MockRenderBuffer;
    const floats = new Float32Array(buffer.bytes.buffer.slice(buffer.bytes.byteOffset, buffer.bytes.byteOffset + buffer.bytes.byteLength));
    expect(command?.label).toBe("morphed-triangle");
    expect(command?.vertexFormat?.hasAttribute("normal")).toBe(true);
    expect(Array.from(floats.slice(0, 18)).map((value) => Number(value.toFixed(3)))).toEqual([
      -0.5, -0.5, 0, 0, 0, 1,
      0.5, -0.5, 0.5, 0, 0.447, 0.894,
      0, 0.5, 1, 0, 0.707, 0.707
    ]);
    expect(buffer.disposed).toBe(true);

    renderer.dispose();
    geometry.dispose();
  });

  it("routes compatible blended morph render items through shader uniforms without CPU-deforming geometry", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = Geometry.triangle();

    renderer.render([
      {
        geometry,
        material: new MorphUnlitMaterial({ color: [0.2, 0.4, 0.8, 1] }),
        morphTargets: [
          {
            positions: [[0, 0, 0], [0, 0.25, 0], [0, 0.5, 0]]
          },
          {
            positions: [[0.1, 0, 0], [0.2, 0, 0], [0.3, 0, 0]]
          }
        ],
        morphWeights: [0.75, 0.5],
        label: "gpu-morphed-triangle"
      }
    ]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const buffer = command?.vertexBuffer as MockRenderBuffer;
    const packedMorph = command?.uniforms?.get("u_morphPositionDeltas") as Float32Array;
    const morphWeights = command?.uniforms?.get("u_morphWeights") as Float32Array;
    expect(command?.label).toBe("gpu-morphed-triangle");
    expect(command?.uniforms?.get("u_morphTargetCount")).toBe(2);
    expect(Array.from(morphWeights)).toEqual([0.75, 0.5, 0, 0]);
    expect(Array.from(packedMorph.slice(0, 12))).toEqual([
      0, 0, 0, 0,
      0, 0.25, 0, 0,
      0, 0.5, 0, 0
    ]);
    expect(Array.from(packedMorph.slice(64 * 4, 64 * 4 + 12))).toEqual([
      0.10000000149011612, 0, 0, 0,
      0.20000000298023224, 0, 0, 0,
      0.30000001192092896, 0, 0, 0
    ]);
    expect(buffer).toBe(geometry.vertexBuffer.uploadedBuffer);
    expect(buffer.disposed).toBe(false);

    renderer.dispose();
    geometry.dispose();
  });

  it("stress-binds non-toy skinning palettes and maximum GPU morph target uniforms", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const skinnedGeometry = createSkinnedStrip(24);
    const morphGeometry = createMorphStressGeometry(32);
    const bones = Array.from({ length: 12 }, (_, index) =>
      new Bone({ name: `joint-${index}`, parentIndex: index === 0 ? -1 : index - 1, translation: [index * 0.01, 0, 0] })
    );
    const skinning = buildSkinningPalette(new Skeleton(bones));
    const morphTargets = Array.from({ length: 4 }, (_, targetIndex) => ({
      positions: Array.from({ length: 32 }, (_, vertexIndex) => [0, targetIndex * 0.01, vertexIndex * 0.001] as const)
    }));

    renderer.render([
      {
        geometry: skinnedGeometry,
        material: new SkinnedUnlitMaterial({ color: [0.2, 0.8, 0.5, 1] }),
        skinning,
        label: "skinned-strip-24-verts-12-joints"
      },
      {
        geometry: morphGeometry,
        material: new MorphUnlitMaterial({ color: [0.2, 0.4, 0.8, 1] }),
        morphTargets,
        morphWeights: [0.1, 0.2, 0.3, 0.4],
        label: "gpu-morphed-strip-32-verts-4-targets"
      }
    ]);

    const [skinCommand, morphCommand] = (renderer.device as MockRenderDevice).drawCommands;
    expect(skinCommand?.uniforms?.get("u_jointCount")).toBe(12);
    expect((skinCommand?.uniforms?.get("u_jointMatrices") as Float32Array).length).toBe(12 * 16);
    expect(skinCommand?.vertexCount).toBe(24);
    expect(morphCommand?.uniforms?.get("u_morphTargetCount")).toBe(4);
    expect(Array.from(morphCommand?.uniforms?.get("u_morphWeights") as Float32Array).map(round3)).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect((morphCommand?.uniforms?.get("u_morphPositionDeltas") as Float32Array).length).toBe(4 * 64 * 4);
    expect(morphCommand?.vertexCount).toBe(32);

    renderer.dispose();
    skinnedGeometry.dispose();
    morphGeometry.dispose();
  });

  it("rejects skinning data on materials without the renderer skinning shader contract", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = createSkinnedTriangle();

    expect(() =>
      renderer.render([
        {
          geometry,
          material: new UnlitMaterial(),
          skinning: { jointCount: 1, matrices: new Float32Array(16) },
          label: "bad-skinned-triangle"
        }
      ])
    ).toThrow(/joint palette uniforms/);

    renderer.dispose();
    geometry.dispose();
  });
});

function createSkinnedTriangle(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3J4W4, 3);
  vertices.setAttribute(0, "position", [-0.4, -0.4, 0]);
  vertices.setAttribute(1, "position", [0.4, -0.4, 0]);
  vertices.setAttribute(2, "position", [0, 0.4, 0]);
  for (let index = 0; index < 3; index += 1) {
    vertices.setAttribute(index, "joints", [1, 0, 0, 0]);
    vertices.setAttribute(index, "weights", [1, 0, 0, 0]);
  }
  return new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
}

function createSkinnedStrip(vertexCount: number): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3J4W4, vertexCount);
  for (let index = 0; index < vertexCount; index += 1) {
    const x = -0.9 + (index / Math.max(1, vertexCount - 1)) * 1.8;
    vertices.setAttribute(index, "position", [x, index % 2 === 0 ? -0.25 : 0.25, 0]);
    vertices.setAttribute(index, "joints", [index % 12, (index + 1) % 12, 0, 0]);
    vertices.setAttribute(index, "weights", [0.75, 0.25, 0, 0]);
  }
  const indices = Array.from({ length: vertexCount }, (_, index) => index);
  return new Geometry(vertices, new IndexBuffer(indices, vertexCount), "points");
}

function createMorphStressGeometry(vertexCount: number): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3, vertexCount);
  for (let index = 0; index < vertexCount; index += 1) {
    const x = -0.9 + (index / Math.max(1, vertexCount - 1)) * 1.8;
    vertices.setAttribute(index, "position", [x, Math.sin(index) * 0.1, 0]);
  }
  const indices = Array.from({ length: vertexCount }, (_, index) => index);
  return new Geometry(vertices, new IndexBuffer(indices, vertexCount), "points");
}

function translationMatrix(x: number, y: number, z: number): readonly number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ];
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function createFakeWebGPU(): WebGPULike {
  const device = createFakeWebGPUDevice();
  return {
    async requestAdapter(): Promise<WebGPUAdapterLike> {
      return {
        name: "unit-webgpu-adapter",
        info: { vendor: "galileo3d-test" },
        async requestDevice() {
          return device;
        }
      };
    }
  };
}

function createAdapterlessWebGPU(): WebGPULike {
  return {
    async requestAdapter(): Promise<WebGPUAdapterLike | null> {
      return null;
    }
  };
}

function createRejectingWebGPU(): WebGPULike {
  return {
    async requestAdapter(): Promise<WebGPUAdapterLike> {
      return {
        name: "rejecting-webgpu-adapter",
        async requestDevice(): Promise<WebGPUDeviceLike> {
          throw new Error("device denied");
        }
      };
    }
  };
}

function createMalformedWebGPU(): WebGPULike {
  return {
    async requestAdapter(): Promise<WebGPUAdapterLike> {
      return {
        name: "malformed-webgpu-adapter",
        async requestDevice(): Promise<WebGPUDeviceLike> {
          return {
            queue: {},
            createBuffer() {
              return { destroy() {} };
            }
          } as unknown as WebGPUDeviceLike;
        }
      };
    }
  };
}

function createFakeWebGPUDevice(): WebGPUDeviceLike {
  return {
    queue: {
      writeBuffer(buffer: WebGPUBufferLike, offset: number, data: ArrayBuffer | ArrayBufferView) {
        const target = buffer as FakeWebGPUBuffer;
        const source = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        target.data.set(source, offset);
      },
      submit() {}
    },
    createBuffer(descriptor: WebGPUBufferDescriptorLike): FakeWebGPUBuffer {
      return {
        data: new Uint8Array(descriptor.size),
        destroy() {
          this.data = new Uint8Array(0);
        }
      };
    },
    createShaderModule(descriptor: { readonly label?: string; readonly code: string }) {
      return { label: descriptor.label, code: descriptor.code };
    },
    destroy() {}
  };
}

function createNativeFakeWebGPU(options: { readonly indexedPassApi?: boolean } = {}): { gpu: WebGPULike; device: ReturnType<typeof createNativeFakeWebGPUDevice> } {
  const device = createNativeFakeWebGPUDevice(options);
  return {
    device,
    gpu: {
      async requestAdapter(): Promise<WebGPUAdapterLike> {
        return {
          name: "native-unit-webgpu-adapter",
          info: { vendor: "galileo3d-native-test" },
          async requestDevice() {
            return device;
          }
        };
      }
    }
  };
}

function createNativeFakeWebGPUDevice(options: { readonly indexedPassApi?: boolean } = {}): WebGPUDeviceLike & {
  renderPasses: Array<{
    label?: string;
    pipeline?: string;
    vertexBuffers: number[];
    indexBuffers: Array<{ slot: number; indexFormat: "uint16" | "uint32" }>;
    bindGroups: number[];
    drawCalls: Array<{ kind: string; count: number; instances?: number }>;
  }>;
  shaderModules: Array<{ readonly label?: string; readonly code: string }>;
  pipelines: unknown[];
  bindGroups: unknown[];
  uniformWrites: number[][];
  submissions: unknown[];
} {
  let nextTextureId = 1;
  const indexedPassApi = options.indexedPassApi ?? true;
  const renderPasses: Array<{
    label?: string;
    pipeline?: string;
    vertexBuffers: number[];
    indexBuffers: Array<{ slot: number; indexFormat: "uint16" | "uint32" }>;
    bindGroups: number[];
    drawCalls: Array<{ kind: string; count: number; instances?: number }>;
  }> = [];
  const shaderModules: Array<{ readonly label?: string; readonly code: string }> = [];
  const pipelines: unknown[] = [];
  const bindGroups: unknown[] = [];
  const uniformWrites: number[][] = [];
  const submissions: unknown[] = [];
  return {
    renderPasses,
    shaderModules,
    pipelines,
    bindGroups,
    uniformWrites,
    submissions,
    queue: {
      writeBuffer(buffer: WebGPUBufferLike, offset: number, data: ArrayBuffer | ArrayBufferView) {
        const target = buffer as FakeWebGPUBuffer;
        const source = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        target.data.set(source, offset);
        if (target.usage === "uniform") {
          uniformWrites.push(Array.from(new Float32Array(source.buffer, source.byteOffset, source.byteLength / 4)));
        }
      },
      submit(commands: readonly unknown[]) {
        submissions.push(...commands);
      }
    },
    createBuffer(descriptor: WebGPUBufferDescriptorLike): FakeWebGPUBuffer {
      return {
        data: new Uint8Array(descriptor.size),
        usage: descriptor.usage & 0x0040 ? "uniform" : "buffer",
        destroy() {
          this.data = new Uint8Array(0);
        }
      } as FakeWebGPUBuffer;
    },
    createShaderModule(descriptor: { readonly label?: string; readonly code: string }) {
      const module = { label: descriptor.label, code: descriptor.code };
      shaderModules.push(module);
      return module;
    },
    createRenderPipeline(descriptor) {
      pipelines.push(descriptor);
      return {
        label: descriptor.label,
        getBindGroupLayout(index: number) {
          return { index, pipeline: descriptor.label };
        }
      };
    },
    createBindGroup(descriptor) {
      const bindGroup = {
        label: descriptor.label,
        layout: descriptor.layout,
        entries: descriptor.entries
      };
      bindGroups.push(bindGroup);
      return bindGroup;
    },
    createTexture() {
      const id = nextTextureId++;
      return {
        createView() {
          return { id };
        },
        destroy() {}
      };
    },
    createCommandEncoder(descriptor?: { readonly label?: string }) {
      const command = { label: descriptor?.label, passes: [] as unknown[] };
      return {
        beginRenderPass(renderPassDescriptor) {
          const pass = {
            label: renderPassDescriptor.label,
            vertexBuffers: [] as number[],
            indexBuffers: [] as Array<{ slot: number; indexFormat: "uint16" | "uint32" }>,
            drawCalls: [] as Array<{ kind: string; count: number; instances?: number }>,
            pipeline: undefined as string | undefined,
            bindGroups: [] as number[]
          };
          renderPasses.push(pass);
          const encoder = {
            setPipeline(pipeline: unknown) {
              pass.pipeline = (pipeline as { readonly label?: string }).label;
            },
            setVertexBuffer(slot: number) {
              pass.vertexBuffers.push(slot);
            },
            setBindGroup(index: number) {
              pass.bindGroups.push(index);
            },
            draw(count: number, instances?: number) {
              pass.drawCalls.push({ kind: "draw", count, ...(instances === undefined || instances === 1 ? {} : { instances }) });
            },
            end() {}
          };
          return indexedPassApi
            ? {
                ...encoder,
                setIndexBuffer(_buffer: WebGPUBufferLike, indexFormat: "uint16" | "uint32") {
                  pass.indexBuffers.push({ slot: 0, indexFormat });
                },
                drawIndexed(count: number, instances?: number) {
                  pass.drawCalls.push({ kind: "drawIndexed", count, ...(instances === undefined ? {} : { instances }) });
                }
              }
            : encoder;
        },
        finish() {
          return command;
        }
      };
    },
    destroy() {}
  };
}

function createFakeWebGPUCanvas(): {
  context: {
    configurations: unknown[];
    currentTextureViews: number[];
    unconfigured: boolean;
  };
  getContext(type: string): unknown;
} {
  const currentTextureViews: number[] = [];
  const context = {
    configurations: [] as unknown[],
    currentTextureViews,
    unconfigured: false,
    configure(configuration: unknown) {
      this.configurations.push(configuration);
    },
    getCurrentTexture() {
      return {
        createView() {
          const id = currentTextureViews.length + 1;
          currentTextureViews.push(id);
          return { id };
        },
        destroy() {}
      };
    },
    unconfigure() {
      this.unconfigured = true;
    }
  };
  return {
    context,
    getContext(type: string) {
      return type === "webgpu" ? context : null;
    }
  };
}
