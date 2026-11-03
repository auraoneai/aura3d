import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Matrix4 } from "@aura3d/math";
import { DepthPreviewMaterial, depthPreviewValue } from "../../../packages/rendering/src/DepthPreviewMaterial";
import { ForwardPass, registerForwardDrawHook } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { globalShaderSource } from "../../../packages/rendering/src/ShaderLibraryCore";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { createEngineBatchInstanceItem, rememberBatchMembers } from "../../../packages/rendering/src/batching/BatchMembers";

const identity: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const hasCommand = (name: string) => spawnSync(name, ["--version"], { stdio: "ignore" }).status === 0;

type BufferCapture = { readonly label: string; destroy(): void };
type WriteCapture = { readonly label: string; readonly bytes: Uint8Array };

/** Exercises the actual WebGPUDevice submission code, but does not compile or rasterize on a GPU. */
async function fakeWebGPU() {
  const modules: { readonly label?: string; readonly code: string }[] = [];
  const writes: WriteCapture[] = [];
  const groups: { readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] }[] = [];
  const boundGroups: { readonly index: number; readonly group: unknown }[] = [];
  const indexedDraws: number[][] = [];
  const native = {
    limits: { maxBufferSize: 1_000_000, maxVertexBuffers: 8 },
    queue: {
      writeBuffer(buffer: BufferCapture, _offset: number, data: ArrayBuffer | ArrayBufferView) {
        const bytes = data instanceof ArrayBuffer
          ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        writes.push({ label: buffer.label, bytes: bytes.slice() });
      },
      submit() {},
      onSubmittedWorkDone: async () => undefined
    },
    createBuffer(descriptor: { readonly label?: string }) {
      return { label: descriptor.label ?? "", destroy() {} };
    },
    createTexture: () => ({ createView: () => ({}), destroy() {} }),
    createSampler: () => ({}),
    createShaderModule(descriptor: { readonly label?: string; readonly code: string }) {
      modules.push(descriptor);
      return descriptor;
    },
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroup(descriptor: { readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] }) {
      groups.push(descriptor);
      return descriptor;
    },
    createCommandEncoder: () => ({
      beginRenderPass: () => ({
        setPipeline() {}, setBindGroup(index: number, group: unknown) { boundGroups.push({ index, group }); },
        setVertexBuffer() {}, setIndexBuffer() {},
        setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {},
        drawIndexed(...args: number[]) { indexedDraws.push(args); },
        draw() {},
        end() {}
      }),
      finish: () => ({})
    }),
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  const context = { configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) };
  const device = await WebGPUDevice.create({
    adapter: { requestDevice: async () => native }, device: native,
    canvas: { getContext: () => context } as unknown as HTMLCanvasElement
  });
  return { device, modules, writes, groups, boundGroups, indexedDraws };
}

function floatAt(write: WriteCapture, offset: number): number {
  return new DataView(write.bytes.buffer, write.bytes.byteOffset, write.bytes.byteLength).getFloat32(offset, true);
}

function matrixAt(write: WriteCapture, offset: number): number[] {
  return Array.from({ length: 16 }, (_, index) => floatAt(write, offset + index * 4));
}

function transform(matrix: ArrayLike<number>, vector: readonly number[]): number[] {
  return Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (_, column) => matrix[column * 4 + row]! * vector[column]!).reduce((a, b) => a + b, 0));
}

function zeroToOne(projection: ArrayLike<number>): number[] {
  const result = Array.from(projection);
  for (let column = 0; column < 4; column += 1) {
    result[column * 4 + 2] = (projection[column * 4 + 2]! + projection[column * 4 + 3]!) / 2;
  }
  return result;
}

describe("depth preview WebGPU portable program", () => {
  it("injects the real bindings and submits independent frame and material bytes for each draw", async () => {
    const gpu = await fakeWebGPU();
    const geometry = Geometry.triangle();
    const first = new DepthPreviewMaterial({ near: 2, far: 12 });
    const second = new DepthPreviewMaterial({ near: 3, far: 23, side: "double" });
    const view = [...identity]; view[14] = -3;
    const model = [...identity]; model[12] = 4;
    const perspective = Array.from(Matrix4.perspective(Math.PI / 3, 1.5, 1, 20).elements);
    const ortho = zeroToOne(Matrix4.orthographic(-2, 2, -2, 2, 1, 20).elements);
    try {
      const pair = globalShaderSource(first.shaderKey)!;
      expect(pair.webgpu).toBeDefined();
      expect(pair.portableBindings?.map(({ name, kind }) => [name, kind])).toEqual([
        ["u_modelViewProjection", "mat4"], ["u_modelMatrix", "mat4"], ["u_normalMatrix", "mat4"],
        ["u_viewMatrix", "mat4"], ["u_projectionMatrix", "mat4"], ["u_a3dClipRange", "float"],
        ["u_depthPreviewNear", "float"], ["u_depthPreviewSpan", "float"]
      ]);
      expect(first.shaderKey).toBe(second.shaderKey);
      gpu.device.beginFrame(32, 24);
      for (const [material, projection, range, label] of [
        [first, perspective, "minus-one-to-one", "preview-perspective"],
        [second, ortho, "zero-to-one", "preview-orthographic"]
      ] as const) {
        new ForwardPass({
          items: [{ geometry, material, modelMatrix: model, label }],
          cameraViewMatrix: view,
          customFrameCamera: { viewMatrix: view, projectionMatrix: projection },
          projectionClipRange: range
        }).execute({ device: gpu.device, width: 32, height: 24 });
      }
      expect(gpu.indexedDraws).toHaveLength(2);
      expect(gpu.indexedDraws.map((draw) => draw[0])).toEqual([3, 3]);
      // Each independently created ForwardPass owns its own program cache.
      expect(gpu.modules).toHaveLength(4);
      for (const module of gpu.modules) {
        expect(module.code).toContain("@group(0) @binding(0) var<uniform> aura:");
        expect(module.code).not.toContain("/* @aura3d-bindings */");
        for (const name of ["u_modelMatrix", "u_viewMatrix", "u_projectionMatrix", "u_a3dClipRange", "u_depthPreviewNear", "u_depthPreviewSpan"]) {
          expect(module.code).toContain(name);
        }
      }
      expect(gpu.modules[0]!.code).toContain("clip.z * 0.5 + clip.w * 0.5");
      expect(gpu.modules[0]!.code).toContain("output.viewDepth = -viewPosition.z");
      expect(gpu.modules[1]!.code).toContain("(viewDepth - aura.u_depthPreviewNear) / aura.u_depthPreviewSpan");
      expect(gpu.groups.filter((group) => group.entries.some((entry) => entry.binding === 0))).toHaveLength(2);
      expect(gpu.boundGroups.filter(({ index }) => index === 0).map(({ group }) => group)).toEqual(gpu.groups);
      const uniforms = gpu.writes.filter((write) => write.label.endsWith("-portable-uniforms"));
      expect(uniforms).toHaveLength(2);
      expect(uniforms.map((write) => write.bytes.byteLength)).toEqual([336, 336]);
      expect(matrixAt(uniforms[0]!, 64)).toEqual(model);
      expect(matrixAt(uniforms[0]!, 192)).toEqual(view);
      expect(matrixAt(uniforms[0]!, 256)).toEqual(Array.from(new Float32Array(perspective)));
      expect(matrixAt(uniforms[1]!, 256)).toEqual(Array.from(new Float32Array(ortho)));
      expect(uniforms.map((write) => [floatAt(write, 320), floatAt(write, 324), floatAt(write, 328)]))
        .toEqual([[0, 2, 10], [1, 3, 20]]);
    } finally {
      if (gpu.device.activeFrameToken) gpu.device.endFrame();
      geometry.dispose();
      first.dispose();
      second.dispose();
      gpu.device.dispose();
    }
  });

  it("reflects and binds the clip-range uniform without trusting material-instance overrides", () => {
    const geometry = Geometry.triangle();
    const material = new DepthPreviewMaterial({ near: 2, far: 12 });
    const instance = new MaterialInstance(material);
    const device = new MockRenderDevice();
    const view = [...identity]; view[14] = -4;
    const projection = zeroToOne(Matrix4.orthographic(-2, 2, -2, 2, 1, 20).elements);
    instance.setOverride("u_a3dClipRange", 99);
    instance.setOverride("u_viewMatrix", new Float32Array(identity));
    try {
      device.beginFrame(8, 8);
      new ForwardPass({
        items: [{ geometry, material: instance }], projectionClipRange: "zero-to-one",
        customFrameCamera: { viewMatrix: view, projectionMatrix: projection }
      }).execute({ device, width: 8, height: 8 });
      const draw = device.drawCommands[0]!;
      expect(draw.shader!.reflection.uniforms.has("u_a3dClipRange")).toBe(true);
      expect(draw.uniforms!.get("u_a3dClipRange")).toBe(1);
      expect(Array.from(draw.uniforms!.get("u_viewMatrix") as Float32Array)).toEqual(view);
      expect(material.sources.glsl.vertex).toContain("2.0 * gl_Position.z - gl_Position.w");
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("uses the verified raster projection instead of an unjittered custom projection", () => {
    const geometry = Geometry.triangle();
    const material = new DepthPreviewMaterial();
    const device = new MockRenderDevice();
    const rasterProjection = [...identity]; rasterProjection[8] = 0.125;
    try {
      device.beginFrame(8, 8);
      new ForwardPass({
        items: [{ geometry, material }], cameraViewMatrix: identity,
        cameraViewProjectionMatrix: rasterProjection,
        auraFrameCamera: { projectionMatrix: rasterProjection },
        customFrameCamera: { viewMatrix: identity, projectionMatrix: identity }
      }).execute({ device, width: 8, height: 8 });
      expect(Array.from(device.drawCommands[0]!.uniforms!.get("u_projectionMatrix") as Float32Array))
        .toEqual(rasterProjection);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rebinds camera and preview uniforms after per-draw hooks", () => {
    const geometry = Geometry.triangle();
    const material = new DepthPreviewMaterial({ near: 2, far: 12 });
    const device = new MockRenderDevice();
    const unregister = registerForwardDrawHook({
      id: "depth-preview-test-overrides",
      bind(_item, _shader, set) {
        set("u_a3dClipRange", 1);
        set("u_depthPreviewSpan", 0);
        set("u_viewMatrix", new Float32Array(16));
      }
    });
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [{ geometry, material }] }).execute({ device, width: 8, height: 8 });
      const uniforms = device.drawCommands[0]!.uniforms!;
      expect(uniforms.get("u_a3dClipRange")).toBe(0);
      expect(uniforms.get("u_depthPreviewSpan")).toBe(10);
      expect(Array.from(uniforms.get("u_viewMatrix") as Float32Array)).toEqual(identity);
    } finally { unregister(); geometry.dispose(); material.dispose(); device.dispose(); }
  });
});

describe("depth preview CPU clip and interpolation reference", () => {
  it.each(["perspective", "orthographic"] as const)("maps %s clip boundaries for either input convention", (kind) => {
    const near = 2, far = 12;
    const projection = kind === "perspective"
      ? Matrix4.perspective(Math.PI / 3, 1, near, far).elements
      : Matrix4.orthographic(-2, 2, -2, 2, near, far).elements;
    for (const distance of [near - 0.1, near, 4.5, 7, 9.5, far, far + 0.1]) {
      const gl = transform(projection, [0, 0, -distance, 1]);
      const native = transform(zeroToOne(projection), [0, 0, -distance, 1]);
      const convertedZ = (gl[2]! + gl[3]!) / 2;
      expect(convertedZ / gl[3]!).toBeCloseTo(native[2]! / native[3]!, 6);
      expect((native[2]! * 2 - native[3]!) / native[3]!).toBeCloseTo(gl[2]! / gl[3]!, 6);
      if (distance < near) expect(convertedZ).toBeLessThan(0);
      if (distance > far) expect(convertedZ).toBeGreaterThan(gl[3]!);
      if (distance === near) expect(convertedZ / gl[3]!).toBeCloseTo(0, 6);
      if (distance === far) expect(convertedZ / gl[3]!).toBeCloseTo(1, 6);
    }
    expect(depthPreviewValue(2, { near, far })).toBe(1);
    expect(depthPreviewValue(7, { near, far })).toBe(0.5);
    expect(depthPreviewValue(12, { near, far })).toBe(0);
    expect(depthPreviewValue(-1, { near, far })).toBe(1);
    expect(depthPreviewValue(30, { near, far })).toBe(0);
  });

  it("uses perspective-correct view-distance interpolation, with the orthographic case remaining linear", () => {
    const depths = [2, 4, 8], weights = [0.2, 0.3, 0.5];
    const interpolate = (clipW: readonly number[]) => {
      const denominator = weights.reduce((sum, weight, index) => sum + weight / clipW[index]!, 0);
      return weights.reduce((sum, weight, index) => sum + weight * depths[index]! / clipW[index]!, 0) / denominator;
    };
    const perspective = interpolate(depths);
    const orthographic = interpolate([1, 1, 1]);
    expect(perspective).toBeCloseTo(1 / (0.2 / 2 + 0.3 / 4 + 0.5 / 8), 9);
    expect(orthographic).toBeCloseTo(5.6, 9);
    expect(depthPreviewValue(perspective, { near: 2, far: 12 })).toBeCloseTo(1 - (perspective - 2) / 10);
    expect(depthPreviewValue(orthographic, { near: 2, far: 12 })).toBeCloseTo(0.64);
  });
});

describe("depth preview fail-closed boundaries", () => {
  it("rejects clipping, deformation, non-triangles, batch packets and nonstandard transforms", () => {
    const geometry = Geometry.triangle();
    const points = Geometry.points([[0, 0, 0]]);
    const material = new DepthPreviewMaterial();
    const device = new MockRenderDevice();
    const model = [...identity]; model[3] = 0.5;
    const geometryMatrix = [...identity]; geometryMatrix[12] = 1;
    try {
      device.beginFrame(8, 8);
      const cases = [
        { geometry, material, skinning: {} },
        { geometry, material, morphWeights: [1] },
        { geometry, material, instanceColors: [1, 0, 0, 1] },
        { geometry, material, multiDraw: [] },
        { geometry, material, geometryMatrix },
        { geometry, material, modelMatrix: model },
        { geometry: points, material }
      ];
      for (const item of cases) {
        expect(() => new ForwardPass({ items: [item as never] }).execute({ device, width: 8, height: 8 })).toThrow(/depth preview/i);
      }
      expect(() => new ForwardPass({
        items: [{ geometry, material }], globalClipping: { planes: [[1, 0, 0, 0]] }
      }).execute({ device, width: 8, height: 8 })).toThrow(/clipping/i);
      const carrier = createEngineBatchInstanceItem({ geometry, material });
      rememberBatchMembers(carrier, [{ geometry, material }]);
      expect(() => new ForwardPass({ items: [carrier] })
        .execute({ device, width: 8, height: 8 })).toThrow(/batched/i);
      expect(device.drawCommands).toHaveLength(0);
    } finally { points.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects clipping, skinning and batched draws on the WebGPU submission path", async () => {
    const gpu = await fakeWebGPU();
    const geometry = Geometry.triangle();
    const material = new DepthPreviewMaterial();
    try {
      gpu.device.beginFrame(8, 8);
      for (const item of [
        { geometry, material, skinning: {} },
        { geometry, material, multiDraw: [] },
        createEngineBatchInstanceItem({ geometry, material })
      ]) {
        expect(() => new ForwardPass({ items: [item as never] })
          .execute({ device: gpu.device, width: 8, height: 8 })).toThrow(/depth preview/i);
      }
      expect(() => new ForwardPass({
        items: [{ geometry, material }], materialClippingFor: () => ({ planes: [[0, 1, 0, 0]] })
      }).execute({ device: gpu.device, width: 8, height: 8 })).toThrow(/clipping/i);
      expect(gpu.indexedDraws).toHaveLength(0);
      expect(gpu.writes.filter((write) => write.label.endsWith("-portable-uniforms"))).toHaveLength(0);
    } finally {
      if (gpu.device.activeFrameToken) gpu.device.endFrame();
      geometry.dispose();
      material.dispose();
      gpu.device.dispose();
    }
  });

  it("rechecks deformation after a forward hook mutates the item", () => {
    const geometry = Geometry.triangle();
    const material = new DepthPreviewMaterial();
    const device = new MockRenderDevice();
    const item = { geometry, material };
    const unregister = registerForwardDrawHook({
      id: "depth-preview-test-mutating-hook",
      bind(current) { (current as { skinning?: unknown }).skinning = {}; }
    });
    try {
      device.beginFrame(8, 8);
      expect(() => new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 }))
        .toThrow(/rigid triangle/i);
      expect(device.drawCommands).toHaveLength(0);
    } finally { unregister(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects unsupported depth modes, invalid clip ranges, and unreconciled camera matrices", () => {
    const geometry = Geometry.triangle();
    const material = new DepthPreviewMaterial();
    const device = new MockRenderDevice();
    try {
      device.beginFrame(8, 8);
      expect(() => new ForwardPass({
        items: [{ geometry, material }], projectionClipRange: "unknown" as never
      }).execute({ device, width: 8, height: 8 })).toThrow(/clip range/i);
      expect(() => new ForwardPass({
        items: [{ geometry, material }], cameraViewProjectionMatrix: identity
      }).execute({ device, width: 8, height: 8 })).toThrow(/camera/i);
      const mismatch = [...identity]; mismatch[12] = 1;
      expect(() => new ForwardPass({
        items: [{ geometry, material }], cameraViewProjectionMatrix: mismatch,
        customFrameCamera: { viewMatrix: identity, projectionMatrix: identity }
      }).execute({ device, width: 8, height: 8 })).toThrow(/raster camera/i);
      Object.assign(device, { getDepthConvention: () => ({
        mode: "reversed", requestedMode: "reversed", clipRange: "minus-one-to-one",
        clearValue: 0, compare: "greater-equal", biasSign: -1
      }) });
      expect(() => new ForwardPass({ items: [{ geometry, material }] })
        .execute({ device, width: 8, height: 8 })).toThrow(/standard depth/i);
      expect(device.drawCommands).toHaveLength(0);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });
});

describe("depth preview offline source validation", () => {
  it.runIf(hasCommand("glslangValidator"))("links the actual GLSL and reflects its active frame uniforms", () => {
    const material = new DepthPreviewMaterial();
    const dir = mkdtempSync(join(tmpdir(), "aura3d-preview-glsl-"));
    try {
      const vertex = join(dir, "preview.vert");
      const fragment = join(dir, "preview.frag");
      writeFileSync(vertex, material.sources.glsl.vertex);
      writeFileSync(fragment, material.sources.glsl.fragment);
      const reflection = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
      for (const name of ["u_modelMatrix", "u_viewMatrix", "u_projectionMatrix", "u_a3dClipRange", "u_depthPreviewNear", "u_depthPreviewSpan"]) {
        expect(reflection).toContain(name);
      }
    } finally { material.dispose(); rmSync(dir, { recursive: true, force: true }); }
  });

  it.runIf(process.env.A3D_REQUIRE_NAGA === "1")("requires Naga when the source gate requests WGSL validation", () => {
    expect(hasCommand("naga")).toBe(true);
  });

  it.runIf(hasCommand("naga"))("validates both device-injected WGSL stages with Naga", async () => {
    const gpu = await fakeWebGPU();
    const material = new DepthPreviewMaterial();
    const dir = mkdtempSync(join(tmpdir(), "aura3d-preview-wgsl-"));
    try {
      expect(material.compile(gpu.device).ok).toBe(true);
      expect(gpu.modules).toHaveLength(2);
      for (const [index, module] of gpu.modules.entries()) {
        const file = join(dir, `preview-${index}.wgsl`);
        writeFileSync(file, module.code);
        expect(() => execFileSync("naga", [file], { encoding: "utf8" })).not.toThrow();
      }
    } finally { material.dispose(); gpu.device.dispose(); rmSync(dir, { recursive: true, force: true }); }
  });
});
