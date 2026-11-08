import { describe, expect, it, vi } from "vitest";
import { identityMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { shaderGraph } from "../../../packages/engine/src/agent-api/nodes/shaderGraph";
import { createClippingBinding, clippingRetainsPoint } from "../../../packages/rendering/src/ClippingPlanes";
import { assertDepthClippingSupported, DepthPass } from "../../../packages/rendering/src/DepthPass";
import { negotiateDepthConvention } from "../../../packages/rendering/src/DepthConvention";
import { ForwardPass, registerForwardDrawHook } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { PortableShaderMaterial } from "../../../packages/rendering/src/PortableShaderMaterial";
import { MockRenderDevice, type DrawCommand, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import { ScreenSpaceLineMaterial } from "../../../packages/rendering/src/ScreenSpaceLineMaterial";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { createLeanCoreShaderLibrary, globalShaderSource, registerGlobalShaderSource, unregisterGlobalShaderSource } from "../../../packages/rendering/src/ShaderLibraryCore";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import type { ShaderGraphDocument } from "../../../packages/rendering/src/program/ShaderGraphCompiler";
import { registerShaderChunk } from "../../../packages/rendering/src/contracts/program";
import type { DepthVariantFeature, ShadowCasterVariantKey } from "../../../packages/rendering/src/contracts/shadows";
import { buildMultiDrawBatch, synthesizeMultiDrawItems } from "../../../packages/rendering/src/batching/MultiDrawBatch";
import { createEngineBatchInstanceItem, createEnginePackedBatchItem } from "../../../packages/rendering/src/batching/BatchMembers";
import { composeDepthDeformVertex, PRD02_DEPTH_SHADER_NAME, prd02DepthVariantDefines, prd02DepthWgsl, registerPrd02DepthShader } from "../../../packages/rendering/src/shadows/Prd02DepthShaderLibrary";

const identity = identityMat4();
const model: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, -5, 1];
const instance: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, -3, 7, 1];
const geometryMatrix: Mat4 = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 1, 2, 3, 1];
const skin: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 0, 0, 1];
const viewProjection: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -2, 1];
const displacementGraph: ShaderGraphDocument = {
  version: 1, stage: "material",
  nodes: [
    { id: "base", op: "input", type: "vec3", name: "positionLocal" },
    { id: "offset", op: "constant", type: "vec3", value: [1, 0, 0] },
    { id: "position", op: "add", type: "vec3", inputs: ["base", "offset"] },
    { id: "color", op: "constant", type: "vec3", value: [1, 1, 1] }
  ],
  outputs: { position: "position", color: "color" }
};

function transform(matrix: ArrayLike<number>, point: readonly number[]): [number, number, number, number] {
  return [0, 1, 2, 3].map((row) =>
    matrix[row]! * point[0]! + matrix[row + 4]! * point[1]! + matrix[row + 8]! * point[2]! + matrix[row + 12]! * point[3]!
  ) as [number, number, number, number];
}

function checkedMock(kind: "mock" | "webgl2" | "webgpu" = "mock"): MockRenderDevice {
  const device = new MockRenderDevice();
  if (kind !== "mock") Object.defineProperty(device, "kind", { value: kind });
  const draw = device.draw.bind(device);
  const checked = device as MockRenderDevice & { drawChecked?: (command: DrawCommand) => void };
  checked.drawChecked = (command) => draw(command);
  device.draw = () => { throw new Error("unchecked depth submission"); };
  return device;
}

describe("prepared depth plans", () => {
  it("snapshots clipping once before a clear and consumes the plan only once", () => {
    const geometry = Geometry.triangle();
    const device = checkedMock();
    const plane: [number, number, number, number] = [1, 0, 0, -2];
    let callbacks = 0;
    const pass = new DepthPass({ checkedSubmission: true, clippingPass: "depth", casters: [{ geometry }],
      materialClippingFor: () => { callbacks += 1; return { planes: [plane], space: "local" }; } });
    const context = { device, width: 8, height: 8 };
    try {
      device.beginFrame(8, 8);
      const plan = pass.prepare(context);
      expect(callbacks).toBe(1);
      expect(device.drawCommands).toHaveLength(0);
      plane[3] = -99;
      pass.validatePrepared(context, plan);
      pass.executePrepared(context, plan);
      expect(callbacks).toBe(1);
      expect(Array.from(device.drawCommands[0]!.uniforms!.get("u_a3dClipPlanes") as Float32Array).slice(0, 4)).toEqual([1, 0, 0, -2]);
      expect(() => pass.executePrepared(context, plan)).toThrow(/already consumed or disposed/);
      plan.dispose();
      plan.dispose();
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });

  it("rejects wrong pass, dimensions or device and expires on a new frame or a newer plan", () => {
    const geometry = Geometry.triangle();
    const device = checkedMock();
    const other = checkedMock();
    const pass = new DepthPass({ casters: [{ geometry }], checkedSubmission: true });
    const unrelated = new DepthPass({ casters: [{ geometry }], checkedSubmission: true });
    const context = { device, width: 8, height: 8 };
    try {
      device.beginFrame(8, 8);
      other.beginFrame(8, 8);
      const plan = pass.prepare(context);
      expect(() => unrelated.validatePrepared(context, plan)).toThrow(/does not match/);
      expect(() => pass.validatePrepared({ ...context, width: 16 }, plan)).toThrow(/does not match/);
      expect(() => pass.validatePrepared({ ...context, device: other }, plan)).toThrow(/does not match/);
      pass.validatePrepared(context, plan);
      device.endFrame();
      device.beginFrame(8, 8);
      expect(() => pass.validatePrepared(context, plan)).toThrow(/stale/);
      expect(() => pass.executePrepared(context, plan)).toThrow(/already consumed or disposed/);
      const older = pass.prepare(context);
      const newer = pass.prepare(context);
      expect(() => pass.validatePrepared(context, older)).toThrow(/stale/);
      pass.executePrepared(context, newer);
      expect(device.drawCommands).toHaveLength(1);
      other.endFrame();
      device.endFrame();
    } finally { geometry.dispose(); other.dispose(); device.dispose(); }
  });

  it("rejects changed caster matrices, material overrides and vertex resources", () => {
    const geometry = Geometry.triangle();
    const base = new UnlitMaterial();
    const material = new MaterialInstance(base);
    const modelMatrix = new Float32Array(identity);
    const device = checkedMock();
    const context = { device, width: 8, height: 8 };
    const pass = new DepthPass({ checkedSubmission: true, casters: [{ geometry, material, modelMatrix }] });
    try {
      device.beginFrame(8, 8);
      const transformPlan = pass.prepare(context);
      modelMatrix[12] = 4;
      expect(() => pass.validatePrepared(context, transformPlan)).toThrow(/stale/);
      const materialPlan = pass.prepare(context);
      material.setOverride("u_pointSize", 9);
      expect(() => pass.validatePrepared(context, materialPlan)).toThrow(/stale/);
      const vertexPlan = pass.prepare(context);
      geometry.vertexBuffer.setAttribute(0, "position", [3, 0, 0]);
      expect(() => pass.validatePrepared(context, vertexPlan)).toThrow(/stale/);
      expect(device.drawCommands).toHaveLength(0);
      device.endFrame();
    } finally { geometry.dispose(); base.dispose(); device.dispose(); }
  });

  it.each(["clipping", "logarithmic"] as const)("rejects a later custom shader without the %s depth contract before submission", (mode) => {
    const geometry = Geometry.triangle();
    const material = createCustomShaderMaterial({
      glsl: { vertex: "void main() { gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }",
        fragment: "out vec4 outColor; void main() { outColor = vec4(1.0); }" },
      castShadow: true
    });
    const device = checkedMock();
    const convention = negotiateDepthConvention({ mode: "logarithmic" }, { clipRange: "zero-to-one", reversed: false, logarithmic: true });
    const options = mode === "clipping"
      ? { clippingPass: "shadow" as const, globalClipping: { planes: [[1, 0, 0, 0] as const], clipShadows: true } }
      : { depthConvention: convention, depthViewMatrix: identity, depthRange: { near: 0.1, far: 100 } };
    const pass = new DepthPass({ ...options, checkedSubmission: true, casters: [{ geometry }, { geometry, material }] });
    const context = { device, width: 8, height: 8 };
    try {
      device.beginFrame(8, 8);
      expect(() => pass.prepare(context)).toThrow(/requested clipping\/depth contract/);
      expect(() => pass.execute(context)).toThrow(/requested clipping\/depth contract/);
      expect(device.drawCommands).toHaveLength(0);
      expect(device.getDiagnostics().buffers).toBe(0);
      device.endFrame();
    } finally { material.dispose(); geometry.dispose(); device.dispose(); }
  });

  it("invalidates a plan when its custom shader source is replaced", () => {
    const geometry = Geometry.triangle();
    const material = createCustomShaderMaterial({
      glsl: { vertex: "void main() { gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }",
        fragment: "out vec4 outColor; void main() { outColor = vec4(1.0); }" },
      castShadow: true
    });
    const key = material.customDepthShaderKey!;
    const source = globalShaderSource(key)!;
    const device = checkedMock();
    const pass = new DepthPass({ checkedSubmission: true, casters: [{ geometry, material }] });
    const context = { device, width: 8, height: 8 };
    try {
      device.beginFrame(8, 8);
      const plan = pass.prepare(context);
      unregisterGlobalShaderSource(key);
      registerGlobalShaderSource({ ...source, vertex: `${source.vertex}\n// replaced` });
      expect(() => pass.validatePrepared(context, plan)).toThrow(/stale/);
      expect(device.drawCommands).toHaveLength(0);
      device.endFrame();
    } finally { material.dispose(); geometry.dispose(); device.dispose(); }
  });

  it("expires a prepared plan on device loss and allows empty logarithmic passes", () => {
    const geometry = Geometry.triangle();
    const device = checkedMock();
    const context = { device, width: 8, height: 8 };
    const pass = new DepthPass({ checkedSubmission: true, casters: [{ geometry }] });
    const convention = negotiateDepthConvention({ mode: "logarithmic" }, { clipRange: "zero-to-one", reversed: false, logarithmic: true });
    try {
      device.beginFrame(8, 8);
      const empty = new DepthPass({ checkedSubmission: true, casters: [], depthConvention: convention });
      empty.execute(context);
      empty.prepare(context).dispose();
      const plan = pass.prepare(context);
      device.contextLost = true;
      expect(() => pass.validatePrepared(context, plan)).toThrow(/stale/);
      expect(() => pass.executePrepared(context, plan)).toThrow(/already consumed or disposed/);
      expect(device.drawCommands).toHaveLength(0);
    } finally { geometry.dispose(); device.dispose(); }
  });

  it("retains callback-deformed morph geometry through execution and releases it on failure", () => {
    const geometry = Geometry.triangle();
    const device = checkedMock();
    const checked = device as MockRenderDevice & { drawChecked?: (command: DrawCommand) => void };
    const failure = new Error("checked morph failure");
    let observed: readonly number[] = [];
    let submitted: DrawCommand["vertexBuffer"] | undefined;
    let callbacks = 0;
    checked.drawChecked = (command) => {
      submitted = command.vertexBuffer;
      observed = Array.from(new Float32Array(device.readBuffer(command.vertexBuffer).buffer).slice(0, 3));
      throw failure;
    };
    const pass = new DepthPass({ checkedSubmission: true, clippingPass: "depth",
      casters: [{ geometry, morphTargets: [{ positions: [[2, 0, 0], [0, 0, 0], [0, 0, 0]] }], morphWeights: [0.5] }],
      materialClippingFor: (item) => {
        callbacks += 1;
        item.geometry.vertexBuffer.setAttribute(0, "position", [9, 2, 3]);
        return { planes: [[1, 0, 0, 0]], space: "local" };
      } });
    const context = { device, width: 8, height: 8 };
    try {
      device.beginFrame(8, 8);
      const plan = pass.prepare(context);
      pass.validatePrepared(context, plan);
      let caught: unknown;
      try { pass.executePrepared(context, plan); } catch (error) { caught = error; }
      expect(caught).toBe(failure);
      expect(callbacks).toBe(1);
      expect(observed).toEqual([9, 2, 3]);
      expect(submitted?.disposed).toBe(true);
      expect(geometry.vertexBuffer.getAttribute(0, "position")).toEqual([-0.5, -0.5, 0]);
      plan.dispose();
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });

  it("keeps independently prepared morph casters and a shared shader library stable across target draws", () => {
    const geometry = Geometry.triangle();
    const library = createLeanCoreShaderLibrary();
    const device = checkedMock();
    const checked = device as MockRenderDevice & { drawChecked?: (command: DrawCommand) => void };
    const draw = checked.drawChecked!;
    const observed: number[] = [];
    const buffers: DrawCommand["vertexBuffer"][] = [];
    checked.drawChecked = (command) => {
      buffers.push(command.vertexBuffer);
      observed.push(new Float32Array(device.readBuffer(command.vertexBuffer).buffer)[0]!);
      draw(command);
    };
    const targets = [{ positions: [[2, 0, 0], [0, 0, 0], [0, 0, 0]] as [number, number, number][] }];
    const passA = new DepthPass({ checkedSubmission: true, clippingPass: "depth", shaderLibrary: library,
      casters: [{ geometry, geometryMatrix, morphTargets: targets, morphWeights: [0.5] }],
      materialClippingFor: () => ({ planes: [[1, 0, 0, 0]], space: "local" }) });
    const passB = new DepthPass({ checkedSubmission: true, clippingPass: "depth", shaderLibrary: library,
      casters: [{ geometry, geometryMatrix, morphTargets: targets, morphWeights: [1] }],
      materialClippingFor: () => ({ planes: [[1, 0, 0, 0]], space: "local" }) });
    const context = { device, width: 8, height: 8 };
    try {
      device.beginFrame(8, 8);
      const first = passA.prepare(context);
      const second = passB.prepare(context);
      passA.executePrepared(context, first);
      passB.validatePrepared(context, second);
      passB.executePrepared(context, second);
      expect(observed).toEqual([0.5, 1.5]);
      expect(buffers.map((buffer) => buffer.disposed)).toEqual([true, true]);
      first.dispose(); second.dispose();
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });

  it("requires a real active frame token only for the prepared API", () => {
    const geometry = Geometry.triangle();
    const device = checkedMock();
    const context = { device, width: 8, height: 8 };
    const pass = new DepthPass({ checkedSubmission: true, casters: [{ geometry }] });
    try {
      expect(() => pass.prepare(context)).toThrow(/active frame identity/);
      device.beginFrame(8, 8);
      Object.defineProperty(device, "activeFrameToken", { value: undefined, configurable: true });
      expect(() => pass.prepare(context)).toThrow(/active frame identity/);
      pass.assertLegacyDepthFallback(context);
      pass.execute(context);
      expect(device.drawCommands).toHaveLength(1);
      expect(() => new DepthPass({ casters: [{ geometry }], clippingPass: "depth", globalClipping: { planes: [[1, 0, 0, 0]] } })
        .assertLegacyDepthFallback(context)).toThrow(/clipped casters/);
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });

  it.each(["item", "base material", "group", "plane", "pass"] as const)("rejects a %s clipping accessor without calling it on the legacy path", (kind) => {
    const geometry = Geometry.triangle();
    const material = new UnlitMaterial();
    const device = checkedMock();
    const plane: [number, number, number, number] = [1, 0, 0, 0];
    const group = { planes: [plane], clipShadows: true };
    const caster = { geometry, material };
    const options = { casters: [caster], checkedSubmission: true };
    let reads = 0;
    const getter = (value: unknown) => ({ configurable: true, get: () => { reads += 1; return value; } });
    if (kind === "item") Object.defineProperty(caster, "globalClipping", getter(group));
    if (kind === "base material") Object.defineProperty(material, "clipping", getter(group));
    if (kind === "group") {
      Object.defineProperty(group, "planes", getter([plane]));
      Object.defineProperty(caster, "globalClipping", { value: group });
    }
    if (kind === "plane") {
      Object.defineProperty(plane, "0", getter(1));
      Object.defineProperty(caster, "globalClipping", { value: group });
    }
    if (kind === "pass") Object.defineProperty(options, "globalClipping", getter(group));
    const pass = new DepthPass(options);
    try {
      device.beginFrame(8, 8);
      expect(() => pass.assertLegacyDepthFallback({ device, width: 8, height: 8 })).toThrow(/Clipping accessors/);
      expect(reads).toBe(0);
      expect(device.drawCommands).toHaveLength(0);
      expect(device.getDiagnostics().buffers).toBe(0);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects a batched-instance clipping callback before visiting an earlier caster", () => {
    const geometry = Geometry.triangle();
    const device = checkedMock();
    const bucket = createEngineBatchInstanceItem({ geometry, instanceTransforms: new Float32Array([...identity, ...instance]) });
    let calls = 0;
    const pass = new DepthPass({ checkedSubmission: true, clippingPass: "depth", casters: [{ geometry }, bucket],
      materialClippingFor: () => { calls += 1; return { planes: [[1, 0, 0, 0]] }; } });
    const context = { device, width: 8, height: 8 };
    try {
      device.beginFrame(8, 8);
      for (const run of [() => pass.prepare(context), () => pass.execute(context), () => pass.assertLegacyDepthFallback(context)]) {
        expect(run).toThrow(/Per-member materialClippingFor is unavailable/);
      }
      expect(calls).toBe(0);
      expect(device.drawCommands).toHaveLength(0);
      expect(device.getDiagnostics().buffers).toBe(0);
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });

  it("does not trust a packed carrier whose draw-row marker was removed", () => {
    const geometry = Geometry.triangle();
    const device = checkedMock();
    const packed = createEnginePackedBatchItem({ geometry, modelMatrix: identity });
    const pass = new DepthPass({ checkedSubmission: true, casters: [{ geometry }, packed] });
    const context = { device, width: 8, height: 8 };
    try {
      device.beginFrame(8, 8);
      expect(() => pass.prepare(context)).toThrow(/no per-member transform support/);
      expect(() => pass.execute(context)).toThrow(/no per-member transform support/);
      expect(() => pass.assertLegacyDepthFallback(context)).toThrow(/cannot submit a packed caster/);
      expect(device.drawCommands).toHaveLength(0);
      expect(device.getDiagnostics().buffers).toBe(0);
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });

  it("checks clipping support against a selected point shadow proxy before drawing", () => {
    const geometry = Geometry.triangle();
    const proxy = new Geometry(new VertexBuffer(VertexFormat.P3, 3), null, "points");
    const device = checkedMock();
    const pass = new DepthPass({ checkedSubmission: true, clippingPass: "shadow",
      globalClipping: { planes: [[1, 0, 0, 0]], clipShadows: true },
      casters: [{ geometry }, { geometry, shadowGeometry: proxy }] });
    const context = { device, width: 8, height: 8 };
    try {
      device.beginFrame(8, 8);
      expect(() => pass.prepare(context)).toThrow(/point, screen-space line and billboard/);
      expect(() => pass.execute(context)).toThrow(/point, screen-space line and billboard/);
      expect(device.drawCommands).toHaveLength(0);
      expect(device.getDiagnostics().buffers).toBe(0);
      device.endFrame();
    } finally { proxy.dispose(); geometry.dispose(); device.dispose(); }
  });

  it.each(["depth", "shadow"] as const)("strict: rejects unclipped WebGPU point %s and point proxies before any upload", (clippingPass) => {
    const triangles = Geometry.triangle();
    const points = new Geometry(new VertexBuffer(VertexFormat.P3, 3), null, "points");
    const device = checkedMock("webgpu");
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_STRICT: true }), device);
    const context = { device, width: 8, height: 8 };
    try {
      device.beginFrame(8, 8);
      for (const caster of [{ geometry: points }, { geometry: triangles, shadowGeometry: points }]) {
        expect(() => assertDepthClippingSupported(caster, createClippingBinding({ backend: "webgpu", pass: clippingPass }), device))
          .toThrow(/WebGPU point depth requires a scene-raster point quad program/);
        const pass = new DepthPass({ clippingPass, checkedSubmission: true, casters: [{ geometry: triangles }, caster] });
        for (const run of [() => pass.prepare(context), () => pass.execute(context), () => pass.assertLegacyDepthFallback(context)]) {
          expect(run).toThrow(/WebGPU point depth requires a scene-raster point quad program/);
        }
      }
      expect(device.drawCommands).toHaveLength(0);
      expect(device.getDiagnostics().buffers).toBe(0);
      expect(points.vertexBuffer.hasAttemptedUpload).toBe(false);
      expect(triangles.vertexBuffer.hasAttemptedUpload).toBe(false);
      device.endFrame();
    } finally { points.dispose(); triangles.dispose(); device.dispose(); }
  });

  it.each(["depth", "shadow"] as const)("leaves WebGPU point %s casters and point proxies out of the pass with one warning outside strict", (clippingPass) => {
    const triangles = Geometry.triangle();
    const points = new Geometry(new VertexBuffer(VertexFormat.P3, 3), null, "points");
    const device = checkedMock("webgpu");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const context = { device, width: 8, height: 8 };
    try {
      device.beginFrame(8, 8);
      const pass = new DepthPass({ clippingPass, checkedSubmission: true,
        casters: [{ geometry: triangles, label: "mesh" }, { geometry: points, label: "dust" }, { geometry: triangles, shadowGeometry: points, label: "proxy" }] });
      expect(() => pass.assertLegacyDepthFallback(context)).not.toThrow();
      pass.prepare(context).dispose();
      pass.execute(context);
      expect(device.drawCommands.map((command) => command.topology)).toEqual(["triangles"]);
      expect(points.vertexBuffer.hasAttemptedUpload).toBe(false);
      expect(warn.mock.calls.filter(([line]) => String(line).startsWith("WEBGPU_POINT_DEPTH_SKIPPED")).length).toBeLessThanOrEqual(1);
      device.endFrame();
    } finally { warn.mockRestore(); points.dispose(); triangles.dispose(); device.dispose(); }
  });

  it.each(["mock", "webgl2"] as const)("keeps unclipped %s point depth on its existing path", (backend) => {
    const points = new Geometry(new VertexBuffer(VertexFormat.P3, 1), null, "points");
    const device = checkedMock(backend);
    try {
      device.beginFrame(8, 8);
      const pass = new DepthPass({ checkedSubmission: true, casters: [{ geometry: points }] });
      const context = { device, width: 8, height: 8 };
      pass.assertLegacyDepthFallback(context);
      pass.execute(context);
      expect(device.drawCommands).toHaveLength(1);
      expect(device.drawCommands[0]?.topology).toBe("points");
      device.endFrame();
    } finally { points.dispose(); device.dispose(); }
  });
});

describe("depth alpha coverage", () => {
  it.each(["webgl2", "webgpu"] as const)("binds effective material, UV1, vertex alpha and map transforms on %s", (backend) => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "uv1", components: 2, offset: 12 },
      { semantic: "color", components: 4, offset: 20 }
    ], 36);
    const geometry = new Geometry(new VertexBuffer(format, 3));
    for (let index = 0; index < 3; index += 1) geometry.vertexBuffer.setAttribute(index, "color", [1, 1, 1, 0.8]);
    const material = new UnlitMaterial({ color: [1, 1, 1, 0.9], alphaTest: 0.5, vertexColors: true });
    const instance = new MaterialInstance(material);
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 128]) });
    const binding = new TextureBinding({ name: "u_baseColorTexture", texture, transform: { offset: [0.1, 0.2], scale: [2, 3], rotation: 0.25 } });
    instance.setOverride("u_baseColor", [0.5, 0.6, 0.7, 0.4]);
    instance.setOverride("u_baseColorTexture", binding);
    instance.setOverride("u_baseColorTextureTexCoord", 1);
    instance.setOverride("u_baseColorTextureOffset", [0.3, 0.4]);
    const device = checkedMock(backend);
    try {
      setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
      device.beginFrame(8, 8);
      const pass = new DepthPass({ checkedSubmission: true, casters: [{ geometry, material: instance }] });
      const context = { device, width: 8, height: 8 };
      const plan = pass.prepare(context);
      pass.executePrepared(context, plan);
      const draw = device.drawCommands[0]!;
      expect(draw.shader?.reflection.attributes.has("a_uv1")).toBe(true);
      expect(draw.shader?.reflection.attributes.has("a_color")).toBe(true);
      expect(draw.uniforms?.get("u_baseColor")).toEqual([0.5, 0.6, 0.7, 0.4]);
      expect(draw.uniforms?.get("u_alphaCutoff")).toBe(0.5);
      expect(draw.uniforms?.get("u_baseColorTexture")).toBe(binding);
      expect(draw.uniforms?.get("u_baseColorTextureOffset")).toEqual([0.3, 0.4]);
      expect(draw.uniforms?.get("u_baseColorTextureScale")).toEqual([2, 3]);
      expect(draw.uniforms?.get("u_baseColorTextureRotation")).toBe(0.25);
      const materialAlpha = (draw.uniforms!.get("u_baseColor") as readonly number[])[3]!;
      const vertexAlpha = geometry.vertexBuffer.getDecodedAttribute(0, "color")[3]!;
      expect(128 / 255).toBeGreaterThan(0.5);
      expect(materialAlpha * vertexAlpha * (128 / 255)).toBeLessThan(0.5);
      device.endFrame();
    } finally { texture.dispose(); material.dispose(); geometry.dispose(); device.dispose(); }
  });

  it("uses constant material alpha without a map or UV stream", () => {
    const geometry = Geometry.triangle();
    const material = new UnlitMaterial({ color: [1, 1, 1, 0.35], alphaTest: 0.4 });
    const device = checkedMock("webgpu");
    try {
      device.beginFrame(8, 8);
      new DepthPass({ checkedSubmission: true, casters: [{ geometry, material }] }).execute({ device, width: 8, height: 8 });
      const draw = device.drawCommands[0]!;
      expect(draw.uniforms?.get("u_baseColor")).toEqual([1, 1, 1, 0.35]);
      expect(draw.uniforms?.get("u_alphaCutoff")).toBe(0.4);
      expect(draw.uniforms?.get("u_baseColorTexture")).toBeInstanceOf(TextureBinding);
      expect(draw.shader?.reflection.attributes.has("a_uv")).toBe(false);
      device.endFrame();
    } finally { material.dispose(); geometry.dispose(); device.dispose(); }
  });

  it("matches generated physical vertex color and a live instance cutoff", () => {
    const format = new VertexFormat([{ semantic: "position", components: 3, offset: 0 }, { semantic: "color", components: 4, offset: 12 }], 28);
    const geometry = new Geometry(new VertexBuffer(format, 3));
    const material = new PBRMaterial({ baseColor: [1, 1, 1, 0.7] });
    const instance = new MaterialInstance(material);
    instance.setOverride("u_alphaCutoff", 0.6);
    const device = checkedMock("webgpu");
    try {
      setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
      device.beginFrame(8, 8);
      new DepthPass({ checkedSubmission: true, casters: [{ geometry, material: instance }] }).execute({ device, width: 8, height: 8 });
      const draw = device.drawCommands[0]!;
      expect(draw.shader?.reflection.attributes.has("a_color")).toBe(true);
      expect(draw.uniforms?.get("u_alphaCutoff")).toBe(0.6);
      expect(draw.uniforms?.get("u_baseColor")).toEqual([1, 1, 1, 0.7]);
      device.endFrame();
    } finally { material.dispose(); geometry.dispose(); device.dispose(); }
  });

  it("degrades alpha-to-coverage and blended shadow casters to plain depth outside strict mode", () => {
    const geometry = Geometry.triangle();
    const coverage = new UnlitMaterial({ alphaTest: 0.5, renderState: { alphaToCoverage: true } });
    const blend = new UnlitMaterial({ renderState: { blendMode: "additive" } });
    const device = checkedMock("webgpu");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      device.beginFrame(8, 8);
      for (const material of [coverage, blend]) {
        const pass = new DepthPass({ checkedSubmission: true, clippingPass: "shadow", casters: [{ geometry, material, castShadow: true }] });
        expect(() => pass.prepare({ device, width: 8, height: 8 })).not.toThrow();
      }
      expect(warn.mock.calls.some((call) => /DEPTH_ALPHA_(COVERAGE|HASH)_DEGRADED/.test(String(call[0])))).toBe(true);
    } finally { warn.mockRestore(); geometry.dispose(); coverage.dispose(); blend.dispose(); device.dispose(); }
  });

  it("rejects nontrivial instance alpha, alpha-to-coverage and blended shadow hashes before any draw", () => {
    const geometry = Geometry.triangle();
    const ordinary = new UnlitMaterial();
    const mask = new UnlitMaterial({ alphaTest: 0.5 });
    const coverage = new UnlitMaterial({ alphaTest: 0.5, renderState: { alphaToCoverage: true } });
    const blend = new UnlitMaterial({ renderState: { blendMode: "additive" } });
    const device = checkedMock("webgpu");
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_STRICT: true }), device);
    const context = { device, width: 8, height: 8 };
    try {
      device.beginFrame(8, 8);
      for (const [caster, code] of [
        [{ geometry, material: mask, instanceTransforms: new Float32Array([...identity, ...instance]), instanceColors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 0.5]) }, "DEPTH_INSTANCE_ALPHA_UNSUPPORTED"],
        [{ geometry, material: coverage }, "DEPTH_ALPHA_COVERAGE_UNSUPPORTED"],
        [{ geometry, material: blend, castShadow: true }, "DEPTH_ALPHA_HASH_UNSUPPORTED"]
      ] as const) {
        const pass = new DepthPass({ checkedSubmission: true, clippingPass: "shadow", casters: [{ geometry, material: ordinary }, caster] });
        for (const run of [() => pass.prepare(context), () => pass.execute(context)]) {
          let error: unknown;
          try { run(); } catch (caught) { error = caught; }
          expect(error).toMatchObject({ code });
        }
      }
      expect(device.drawCommands).toHaveLength(0);
      expect(device.getDiagnostics().buffers).toBe(0);
      new DepthPass({ checkedSubmission: true, clippingPass: "depth", casters: [{ geometry, material: mask,
        instanceTransforms: new Float32Array([...identity, ...instance]), instanceColors: new Float32Array([1, 0, 0, 1, 0, 1, 0, 1]) }] }).execute(context);
      expect(device.drawCommands).toHaveLength(1);
      device.endFrame();
    } finally { ordinary.dispose(); mask.dispose(); coverage.dispose(); blend.dispose(); geometry.dispose(); device.dispose(); }
  });

  it("rejects a newly registered forward alpha hook without invoking it after preparation", () => {
    const geometry = Geometry.triangle();
    const material = new UnlitMaterial({ alphaTest: 0.5 });
    const device = checkedMock();
    const pass = new DepthPass({ checkedSubmission: true, casters: [{ geometry, material }] });
    const context = { device, width: 8, height: 8 };
    let calls = 0;
    try {
      setRendererQrFlags(createTrustedQrFlags({ A3D_QR_STRICT: true }), device);
      device.beginFrame(8, 8);
      const plan = pass.prepare(context);
      const remove = registerForwardDrawHook({ id: "test-depth-alpha-late-hook", bind: () => { calls += 1; } });
      try {
        expect(() => pass.validatePrepared(context, plan)).toThrow(/stale/);
        expect(calls).toBe(0);
        expect(device.drawCommands).toHaveLength(0);
      } finally { remove(); }
      device.endFrame();
    } finally { material.dispose(); geometry.dispose(); device.dispose(); }
  });
});

describe("depth geometry transforms", () => {
  it("retains the lean shader and identical uniforms when geometryMatrix is absent or identity", () => {
    const geometry = Geometry.triangle();
    const device = checkedMock();
    try {
      device.beginFrame(8, 8);
      new DepthPass({ checkedSubmission: true, casters: [
        { geometry, modelMatrix: model, label: "unset" },
        { geometry, modelMatrix: model, geometryMatrix: identity, label: "identity" }
      ], viewProjectionMatrix: viewProjection }).execute({ device, width: 8, height: 8 });
      const [unset, explicit] = device.drawCommands;
      expect(unset?.shader).toBe(explicit?.shader);
      expect(unset?.shader?.marker).toContain("@aura3d-shader:depth");
      expect(unset?.uniforms?.get("u_modelViewProjection")).toEqual(explicit?.uniforms?.get("u_modelViewProjection"));
      expect(unset?.uniforms?.get("u_modelViewProjection")).toEqual(multiplyMat4(viewProjection, model));
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });

  it.each(["mock", "webgl2", "webgpu"] as const)("binds geometryMatrix for a plain %s depth caster", (backend) => {
    const geometry = Geometry.triangle();
    const device = checkedMock(backend);
    try {
      device.beginFrame(8, 8);
      new DepthPass({ casters: [{ geometry, geometryMatrix, modelMatrix: model }], viewProjectionMatrix: viewProjection, checkedSubmission: true })
        .execute({ device, width: 8, height: 8 });
      const command = device.drawCommands[0]!;
      expect(command.shader?.marker).toContain("prd02");
      expect(command.uniforms?.get("u_geometryMatrix")).toEqual(geometryMatrix);
      expect(command.uniforms?.get("u_modelViewProjection")).toEqual(multiplyMat4(viewProjection, model));
      expect(transform(command.uniforms!.get("u_modelViewProjection") as readonly number[], transform(command.uniforms!.get("u_geometryMatrix") as readonly number[], [1, 2, 3, 1])))
        .toEqual([13, 8, 8, 1]);
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });

  it("resets the WebGPU geometry uniform to identity for the next caster", () => {
    const geometry = Geometry.triangle();
    const device = checkedMock("webgpu");
    try {
      device.beginFrame(8, 8);
      new DepthPass({ checkedSubmission: true, casters: [
        { geometry, geometryMatrix }, { geometry }
      ] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands[0]?.uniforms?.get("u_geometryMatrix")).toEqual(geometryMatrix);
      expect(device.drawCommands[1]?.uniforms?.get("u_geometryMatrix")).toEqual(identity);
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });

  it.each([
    ["back", ["front", "back"]],
    ["front", ["back", "front"]],
    ["none", ["none"]]
  ] as const)("matches %s culling for mirrored geometry and instances", (cullMode, expected) => {
    const geometry = Geometry.triangle();
    const material = new UnlitMaterial({ renderState: { cullMode } });
    const device = checkedMock("webgpu");
    const mirroredGeometry: Mat4 = [-2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 1, 2, 3, 1];
    const mirroredInstance: Mat4 = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    try {
      device.beginFrame(8, 8);
      new DepthPass({ checkedSubmission: true, clippingPass: "shadow", globalClipping: { planes: [[1, 0, 0, 0]], clipShadows: true },
        casters: [{ geometry, material, geometryMatrix: mirroredGeometry, instanceTransforms: new Float32Array([...identity, ...mirroredInstance]) }] })
        .execute({ device, width: 8, height: 8 });
      expect(device.drawCommands.map((command) => command.renderState?.cullMode)).toEqual(expected);
      if (cullMode === "none") expect(device.drawCommands[0]?.instanceCount).toBe(2);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects unsplittable per-instance streams before drawing a mirrored clipped caster", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "custom:instanceValue", components: 4, offset: 0, bufferSlot: 1, shaderLocation: 4 }
    ], 12, [{ slot: 1, stride: 16, stepMode: "instance" }]);
    const geometry = new Geometry(new VertexBuffer(format, 3), null, "triangles", undefined, [new VertexBuffer(format, 2, 1)]);
    const ordinary = Geometry.triangle();
    const device = checkedMock();
    const mirrored: Mat4 = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    try {
      device.beginFrame(8, 8);
      let failure: unknown;
      try {
        new DepthPass({ checkedSubmission: true, clippingPass: "depth", globalClipping: { planes: [[1, 0, 0, 0]] },
          casters: [{ geometry: ordinary }, { geometry, instanceTransforms: new Float32Array([...identity, ...mirrored]) }] })
          .execute({ device, width: 8, height: 8 });
      } catch (error) { failure = error; }
      expect(failure).toMatchObject({ code: "INSTANCE_STREAM_EXPANSION_UNSUPPORTED" });
      expect(device.drawCommands).toHaveLength(0);
      expect(device.getDiagnostics().buffers).toBe(0);
      device.endFrame();
    } finally { geometry.dispose(); ordinary.dispose(); device.dispose(); }
  });

  it("binds geometry before the world and view transforms used for logarithmic depth", () => {
    const geometry = Geometry.triangle();
    const device = checkedMock("webgpu");
    const convention = negotiateDepthConvention({ mode: "logarithmic" }, { clipRange: "zero-to-one", reversed: false, logarithmic: true });
    try {
      device.beginFrame(8, 8);
      new DepthPass({
        checkedSubmission: true, casters: [{ geometry, geometryMatrix, modelMatrix: model }],
        depthConvention: convention, depthViewMatrix: viewProjection, depthRange: { near: 0.1, far: 100 }
      }).execute({ device, width: 8, height: 8 });
      const uniforms = device.drawCommands[0]!.uniforms!;
      expect(uniforms.get("u_geometryMatrix")).toEqual(geometryMatrix);
      expect(uniforms.get("u_a3dClipModel")).toEqual(model);
      expect(uniforms.get("u_a3dLogDepthView")).toEqual(viewProjection);
      expect(uniforms.get("u_a3dLogDepthRange")).toEqual([0.1, 100]);
      expect(uniforms.get("u_a3dClipRange")).toBe(1);
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });

  it("packs geometryMatrix into a checked native-shaped WebGPU depth draw", async () => {
    const writes: Uint8Array[] = [];
    const modules: string[] = [];
    let draws = 0;
    const native: WebGPUDeviceLike = {
      queue: {
        writeBuffer(_buffer, _offset, data) {
          const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          writes.push(bytes.slice());
        },
        submit() {}
      },
      createBuffer() { return { destroy() {} }; },
      createTexture() { return { createView: () => ({}), destroy() {} }; },
      createShaderModule({ code }) { modules.push(code); return {}; },
      createRenderPipeline() { return { getBindGroupLayout: () => ({}) }; },
      createBindGroup() { return {}; },
      createCommandEncoder() { return {
        beginRenderPass: () => ({ setPipeline() {}, setVertexBuffer() {}, setIndexBuffer() {}, setBindGroup() {}, draw() { draws += 1; }, drawIndexed() { draws += 1; }, end() {} }),
        finish: () => ({})
      }; },
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
    const geometry = Geometry.triangle();
    const target = device.createRenderTarget({ width: 8, height: 8, depth: true });
    try {
      device.beginFrame(8, 8);
      device.setRenderTarget(target);
      new DepthPass({ checkedSubmission: true, clippingPass: "depth", casters: [{
        geometry, geometryMatrix, modelMatrix: model,
        materialClipping: { space: "local", planes: [[1, 0, 0, -1]] }
      }] }).execute({ device, width: 8, height: 8 });
      expect(draws).toBe(1);
      expect(modules.some((source) => source.includes("let geometryLocal = aura.u_geometryMatrix * vec4<f32>(local.xyz, 1.0);"))).toBe(true);
      const floats = writes.filter((bytes) => bytes.byteLength % 4 === 0).map((bytes) => Array.from(new Float32Array(bytes.buffer)));
      expect(floats.some((values) => values.length >= 32 && values.slice(16, 32).every((value, index) => value === geometryMatrix[index]))).toBe(true);
      device.endFrame();
    } finally { geometry.dispose(); target.dispose(); device.dispose(); }
  });

  it.each(["depth", "shadow"] as const)("preserves morph → skin → geometry → instance → model in %s clipping", (clippingPass) => {
    const vertices = new VertexBuffer(VertexFormat.P3J4W4, 3);
    for (let i = 0; i < 3; i += 1) {
      vertices.setAttribute(i, "position", [1, 2, 3]);
      vertices.setAttribute(i, "weights", [1, 0, 0, 0]);
    }
    const geometry = new Geometry(vertices);
    const device = checkedMock("webgpu");
    const checked = device as MockRenderDevice & { drawChecked?: (command: DrawCommand) => void };
    const drawChecked = checked.drawChecked!;
    let uploaded: number[] = [];
    checked.drawChecked = (command) => {
      uploaded = Array.from(new Float32Array(device.readBuffer(command.vertexBuffer).buffer).slice(0, 3));
      drawChecked(command);
    };
    const global = { space: "world" as const, planes: [[1, 0, 0, -26] as const], clipShadows: true };
    const local = { space: "local" as const, planes: [[1, 0, 0, -11] as const], clipShadows: true };
    try {
      device.beginFrame(8, 8);
      new DepthPass({
        checkedSubmission: true, clippingPass, viewProjectionMatrix: viewProjection,
        casters: [{
          geometry, modelMatrix: model, geometryMatrix, instanceTransforms: new Float32Array(instance),
          skinning: { jointCount: 1, matrices: new Float32Array(skin) },
          morphTargets: [{ positions: [[1, 0, 0], [0, 0, 0], [0, 0, 0]] }], morphWeights: [0.5],
          globalClipping: global, materialClipping: local
        }]
      }).execute({ device, width: 8, height: 8 });
      const command = device.drawCommands[0]!;
      const uniforms = command.uniforms!;
      expect(uploaded).toEqual([1.5, 2, 3]);
      expect(uniforms.get("u_jointMatrices")).toEqual(new Float32Array(skin));
      expect(uniforms.get("u_geometryMatrix")).toEqual(geometryMatrix);
      expect(uniforms.get("u_a3dClipModel")).toEqual(model);
      expect(uniforms.get("u_instanceMatrices")).toEqual(new Float32Array(instance));
      expect(uniforms.get("u_a3dClipGroupCount")).toBe(2);
      expect(Array.from(uniforms.get("u_a3dClipGroups") as Float32Array)).toEqual([0, 1, 0, 0, 1, 1, 0, 1]);
      const skinned = transform(uniforms.get("u_jointMatrices") as Float32Array, [...uploaded, 1]);
      const geometryLocal = transform(uniforms.get("u_geometryMatrix") as readonly number[], skinned);
      const placed = transform(uniforms.get("u_instanceMatrices") as Float32Array, geometryLocal);
      const world = transform(uniforms.get("u_a3dClipModel") as readonly number[], placed);
      expect(geometryLocal).toEqual([12, 8, 15, 1]);
      expect(world).toEqual([27, 5, 17, 1]);
      expect(transform(uniforms.get("u_modelViewProjection") as readonly number[], placed)).toEqual([27, 5, 15, 1]);
      const clipping = createClippingBinding({ global, material: local, pass: clippingPass, backend: "webgpu" });
      expect(clippingRetainsPoint(clipping, [27, 5, 17], [12, 8, 15])).toBe(true);
      expect(clippingRetainsPoint(clipping, [27, 5, 17], [5.5, 2, 3])).toBe(false);
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });

  it.each(["webgl2", "webgpu"] as const)("binds geometry separately for expanded skinned graph instances on %s", (backend) => {
    const vertices = new VertexBuffer(VertexFormat.P3J4W4, 3);
    for (let i = 0; i < 3; i += 1) vertices.setAttribute(i, "weights", [1, 0, 0, 0]);
    const geometry = new Geometry(vertices);
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: displacementGraph }).custom!);
    const device = checkedMock(backend);
    const sources: ShaderSources[] = [];
    const createProgram = device.createShaderProgram.bind(device);
    device.createShaderProgram = (source) => { sources.push(source); return createProgram(source); };
    try {
      device.beginFrame(8, 8);
      new DepthPass({
        checkedSubmission: true, viewProjectionMatrix: viewProjection, clippingPass: "shadow",
        casters: [{
          geometry, material, geometryMatrix, modelMatrix: model,
          instanceTransforms: new Float32Array([...instance, ...identity]),
          skinning: { jointCount: 1, matrices: new Float32Array(skin) },
          globalClipping: { space: "world", planes: [[1, 0, 0, -26]], clipShadows: true },
          materialClipping: { space: "local", planes: [[1, 0, 0, -11]], clipShadows: true }
        }]
      }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(2);
      const first = device.drawCommands[0]!.uniforms!;
      const second = device.drawCommands[1]!.uniforms!;
      const firstModel = multiplyMat4(model, instance);
      expect(first.get("u_geometryMatrix")).toEqual(geometryMatrix);
      expect(second.get("u_geometryMatrix")).toEqual(geometryMatrix);
      expect(first.get("u_a3dClipModel")).toEqual(firstModel);
      expect(second.get("u_a3dClipModel")).toEqual(model);
      expect(first.get("u_modelViewProjection")).toEqual(multiplyMat4(viewProjection, firstModel));
      expect(first.get("u_jointMatrices")).toEqual(new Float32Array(skin));
      expect(first.get("u_a3dClipGroupCount")).toBe(2);
      expect(sources[0]?.vertex).toContain("v_a3dGraphDepthLocal = auraGraph_geometryLocal.xyz;");
      expect(sources[0]?.vertex).toContain("u_a3dClipModel * auraGraph_geometryLocal");
      expect(sources[0]?.webgpu?.vertex).toContain("output.graphDepthLocal = auraGraph_geometryLocal.xyz;");
      expect(sources[0]?.webgpu?.vertex).toContain("aura.u_a3dClipModel * auraGraph_geometryLocal");
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("matches graph normalWorld displacement for explicit and expanded-instance normal matrices", () => {
    const graph: ShaderGraphDocument = { version: 1, stage: "material", nodes: [
      { id: "position", op: "input", type: "vec3", name: "positionLocal" },
      { id: "normal", op: "input", type: "vec3", name: "normalWorld" },
      { id: "displaced", op: "add", type: "vec3", inputs: ["position", "normal"] },
      { id: "color", op: "constant", type: "vec3", value: [1, 1, 1] }
    ], outputs: { position: "displaced", color: "color" } };
    const vertices = new VertexBuffer(VertexFormat.P3N3, 3);
    for (let i = 0; i < 3; i += 1) vertices.setAttribute(i, "normal", [1, 0, 0]);
    const geometry = new Geometry(vertices);
    const material = createCustomShaderMaterial(shaderGraph.material({ graph }).custom!);
    const device = new MockRenderDevice();
    const checked = device as MockRenderDevice & { drawChecked?: (command: DrawCommand) => void };
    checked.drawChecked = device.draw.bind(device);
    const scaledModel: Mat4 = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 10, 0, -5, 1];
    const explicitNormal = new Float32Array([0, 2, 0, 0, 3, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1]);
    const item = { geometry, material, geometryMatrix, modelMatrix: scaledModel, normalMatrix: explicitNormal,
      modelViewProjectionMatrix: multiplyMat4(viewProjection, scaledModel) };
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 });
      new DepthPass({ checkedSubmission: true, casters: [item], viewProjectionMatrix: viewProjection }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands[0]?.uniforms?.get("u_normalMatrix")).toEqual(explicitNormal);
      expect(device.drawCommands[1]?.uniforms?.get("u_normalMatrix")).toEqual(explicitNormal);
      const mirroredInstance: Mat4 = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      const instanced = { ...item, instanceTransforms: new Float32Array([...instance, ...mirroredInstance]) };
      new ForwardPass({ items: [instanced] }).execute({ device, width: 8, height: 8 });
      new DepthPass({ checkedSubmission: true, casters: [instanced], viewProjectionMatrix: viewProjection }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(6);
      for (const [forward, depth] of [[2, 4], [3, 5]] as const) {
        const expected = device.drawCommands[forward]!.uniforms!.get("u_normalMatrix") as Float32Array;
        const actual = device.drawCommands[depth]!.uniforms!.get("u_normalMatrix") as Float32Array;
        for (let index = 0; index < 16; index += 1) expect(actual[index]).toBeCloseTo(expected[index]!);
      }
      expect(device.drawCommands[4]?.uniforms?.get("u_normalMatrix")).not.toEqual(explicitNormal);
      expect(() => new DepthPass({ checkedSubmission: true, casters: [{ ...item, normalMatrix: [1, 2] }] })
        .execute({ device, width: 8, height: 8 })).toThrow(/finite mat4/);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects a reloaded graph before drawing an earlier valid caster when clipping is active", () => {
    const geometry = Geometry.triangle();
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: displacementGraph }).custom!);
    const device = checkedMock();
    const global = { planes: [[1, 0, 0, 0] as const], clipShadows: true };
    try {
      material.hotReload(material.sources);
      device.beginFrame(8, 8);
      let failure: unknown;
      try {
        new DepthPass({ checkedSubmission: true, clippingPass: "shadow", globalClipping: global,
          casters: [{ geometry }, { geometry, material }] }).execute({ device, width: 8, height: 8 });
      } catch (error) { failure = error; }
      expect(failure).toMatchObject({ code: "DEPTH_CLIPPING_PROGRAM_UNSUPPORTED" });
      expect(device.drawCommands).toHaveLength(0);
      expect(device.getDiagnostics().buffers).toBe(0);
      new DepthPass({ checkedSubmission: true, clippingPass: "shadow", globalClipping: { ...global, clipShadows: false },
        casters: [{ geometry, material }] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(1);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("checks the selected typed graph depth variant and rejects altered global sources before any draw", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "joints", components: 4, offset: 12, type: "uint8", integer: true },
      { semantic: "weights", components: 4, offset: 16 }
    ], 32);
    const vertices = new VertexBuffer(format, 3);
    for (let i = 0; i < 3; i += 1) vertices.setAttribute(i, "weights", [1, 0, 0, 0]);
    const geometry = new Geometry(vertices);
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: displacementGraph }).custom!);
    const device = checkedMock("webgpu");
    const forwardKey = material.graphSkinningVariant(4, "uint", "float", "forward")!;
    const depthKey = material.graphSkinningVariant(4, "uint", "float", "depth")!;
    const originalSource = globalShaderSource(depthKey)!;
    const originalVariant = material.graphSkinningVariant.bind(material);
    const options = { checkedSubmission: true, clippingPass: "shadow" as const,
      globalClipping: { planes: [[1, 0, 0, 0] as const], clipShadows: true },
      casters: [{ geometry }, { geometry, material, skinning: { jointCount: 1, matrices: new Float32Array(skin) } }] };
    try {
      device.beginFrame(8, 8);
      material.graphSkinningVariant = (influences, first, second, pass) =>
        pass === "depth" ? forwardKey : originalVariant(influences, first, second, pass);
      let failure: unknown;
      try { new DepthPass(options).execute({ device, width: 8, height: 8 }); } catch (error) { failure = error; }
      expect(failure).toMatchObject({ code: "DEPTH_CLIPPING_PROGRAM_UNSUPPORTED" });
      expect(device.drawCommands).toHaveLength(0);
      Reflect.deleteProperty(material, "graphSkinningVariant");
      expect(PortableShaderMaterial.hasGraphClippingContract(material, depthKey, "depth")).toBe(true);
      unregisterGlobalShaderSource(depthKey);
      registerGlobalShaderSource({ ...originalSource, vertex: `${originalSource.vertex}\n// altered depth source` });
      expect(PortableShaderMaterial.hasGraphClippingContract(material)).toBe(false);
      failure = undefined;
      try { new DepthPass(options).execute({ device, width: 8, height: 8 }); } catch (error) { failure = error; }
      expect(failure).toMatchObject({ code: "DEPTH_CLIPPING_PROGRAM_UNSUPPORTED" });
      expect(device.drawCommands).toHaveLength(0);
      expect(device.getDiagnostics().buffers).toBe(0);
      device.endFrame();
    } finally {
      unregisterGlobalShaderSource(depthKey);
      registerGlobalShaderSource(originalSource);
      geometry.dispose(); material.dispose(); device.dispose();
    }
  });

  it("rejects malformed geometry matrices before allocating or submitting a caster", () => {
    const geometry = Geometry.triangle();
    const device = checkedMock();
    try {
      device.beginFrame(8, 8);
      const buffersBefore = device.getDiagnostics().buffers;
      for (const malformed of [[1, 2], [...identity.slice(0, 15), NaN]]) {
        expect(() => new DepthPass({ casters: [{ geometry, geometryMatrix: malformed }], checkedSubmission: true }).execute({ device, width: 8, height: 8 }))
          .toThrow(/16 finite numbers/);
      }
      expect(device.drawCommands).toHaveLength(0);
      expect(device.getDiagnostics().buffers).toBe(buffersBefore);
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });

  it.each(["sprite", "fat-line"] as const)("rejects active clipping for %s without its raster camera before allocating or submitting depth geometry", (kind) => {
    const geometry = kind === "fat-line"
      ? Geometry.screenSpaceLineSegments([{ start: [0, 0, 0], end: [1, 0, 0] }])
      : Geometry.triangle();
    const shadowGeometry: Geometry | undefined = undefined;
    const ordinaryGeometry = Geometry.triangle();
    const base = kind === "fat-line" ? new ScreenSpaceLineMaterial({ width: 7 }) : new UnlitMaterial({ pointSize: 7 });
    const material = new MaterialInstance(base);
    if (kind === "sprite") material.setOverride("u_spriteMode", 1);
    const device = checkedMock();
    const global = { planes: [[1, 0, 0, 0] as const], clipShadows: true };
    const local = { planes: [[0, 1, 0, 0] as const], space: "local" as const, clipShadows: true };
    try {
      device.beginFrame(8, 8);
      const buffersBefore = device.getDiagnostics().buffers;
      for (const clippingPass of ["depth", "shadow"] as const) {
        for (const source of ["global", "item", "callback"] as const) {
          let failure: unknown;
          try {
            new DepthPass({
              checkedSubmission: true, clippingPass,
              casters: [{ geometry: ordinaryGeometry }, { geometry, shadowGeometry, material, ...(source === "item" ? { materialClipping: local } : {}) }],
              ...(source === "global" ? { globalClipping: global } : {}),
              ...(source === "callback" ? { materialClippingFor: () => local } : {})
            }).execute({ device, width: 8, height: 8 });
          } catch (error) { failure = error; }
          expect(failure).toMatchObject({ code: "DEPTH_CLIPPING_RASTER_CAMERA_REQUIRED" });
        }
      }
      expect(device.getDiagnostics().buffers).toBe(buffersBefore);
      expect(device.drawCommands).toHaveLength(0);
      expect(() => new DepthPass({ checkedSubmission: true, clippingPass: "depth", casters: [{ geometry, shadowGeometry, material }],
        globalClipping: { ...global, clipShadows: false } }).execute({ device, width: 8, height: 8 }))
        .toThrow(/requires the raster camera that drew it/);
      // A group that has not opted into shadow clipping does not activate the guard.
      new DepthPass({ checkedSubmission: true, clippingPass: "shadow", casters: [{ geometry, shadowGeometry, material }],
        globalClipping: { ...global, clipShadows: false } }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(1);
      device.endFrame();
    } finally { geometry.dispose(); ordinaryGeometry.dispose(); base.dispose(); device.dispose(); }
  });

  it("clips point depth by source centres instead of the shadow proxy", () => {
    const vertices = new VertexBuffer(VertexFormat.P3, 2);
    vertices.setAttribute(0, "position", [-1, 0, 0]);
    vertices.setAttribute(1, "position", [1, 0, 0]);
    const geometry = new Geometry(vertices, null, "points");
    const shadowGeometry = Geometry.triangle();
    const base = new UnlitMaterial({ pointSize: 7 });
    const device = checkedMock();
    const global = { planes: [[1, 0, 0, 0] as const], clipShadows: true };
    try {
      device.beginFrame(8, 8);
      const buffersBefore = device.getDiagnostics().buffers;
      new DepthPass({ checkedSubmission: true, clippingPass: "shadow", globalClipping: global,
        casters: [{ geometry, shadowGeometry, material: base }] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(1);
      expect(device.drawCommands[0]).toMatchObject({ topology: "points", indexCount: 1 });
      // The transient retained-point geometry is released after the draw.
      expect(device.getDiagnostics().buffers).toBe(buffersBefore);
      // Without an active shadow group the coarse proxy remains the caster.
      new DepthPass({ checkedSubmission: true, clippingPass: "shadow", globalClipping: { ...global, clipShadows: false },
        casters: [{ geometry, shadowGeometry, material: base }] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands[1]!.topology).toBe("triangles");
      device.endFrame();
    } finally { geometry.dispose(); shadowGeometry.dispose(); base.dispose(); device.dispose(); }
  });

  it("rejects unhandled packed multi-draw markers while keeping ordinary instanced casters", () => {
    const first = Geometry.triangle();
    const second = Geometry.triangle();
    const material = new UnlitMaterial();
    const members = [{ geometry: first, material, modelMatrix: model }, { geometry: second, material, modelMatrix: instance }];
    const batch = buildMultiDrawBatch({ key: "geometry-depth", programKey: "program", vertexLayoutKey: "layout", members });
    const packed = synthesizeMultiDrawItems(batch);
    // A plain spread retains the marker but loses its identity-based
    // logical-member provenance.
    const direct = packed.map((item) => ({ ...item }));
    const device = checkedMock();
    const global = { planes: [[1, 0, 0, 0] as const], clipShadows: true };
    const local = { planes: [[0, 1, 0, 0] as const], space: "local" as const, clipShadows: true };
    try {
      device.beginFrame(8, 8);
      const buffersBefore = device.getDiagnostics().buffers;
      for (const clippingPass of ["depth", "shadow"] as const) {
        for (const useGlobal of [true, false]) {
          let failure: unknown;
          try {
            new DepthPass({ checkedSubmission: true, casters: [{ geometry: first, material }, ...direct], clippingPass,
              ...(useGlobal ? { globalClipping: global } : { materialClippingFor: () => local })
            }).execute({ device, width: 8, height: 8 });
          } catch (error) { failure = error; }
          expect(failure).toMatchObject({ code: "DEPTH_CLIPPING_BATCH_UNSUPPORTED" });
        }
      }
      expect(device.drawCommands).toHaveLength(0);
      expect(device.getDiagnostics().buffers).toBe(buffersBefore);
      let failure: unknown;
      try {
        new DepthPass({ checkedSubmission: true, clippingPass: "shadow", casters: [{ geometry: first, material }, ...direct],
          globalClipping: { ...global, clipShadows: false } }).execute({ device, width: 8, height: 8 });
      } catch (error) { failure = error; }
      expect(failure).toMatchObject({ code: "DEPTH_MULTIDRAW_PROGRAM_UNSUPPORTED" });
      expect(device.drawCommands).toHaveLength(0);
      new DepthPass({ checkedSubmission: true, clippingPass: "shadow", casters: packed, globalClipping: global })
        .execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(2);
      expect(device.drawCommands[0]?.uniforms?.get("u_modelViewProjection")).toEqual(model);
      expect(device.drawCommands[1]?.uniforms?.get("u_modelViewProjection")).toEqual(instance);
      new DepthPass({ checkedSubmission: true, clippingPass: "shadow", globalClipping: global,
        casters: [{ geometry: first, material, instanceTransforms: new Float32Array([...identity, ...instance]) }] })
        .execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(3);
      expect(device.drawCommands[2]?.instanceCount).toBe(2);
      expect(device.drawCommands[2]?.uniforms?.get("u_a3dClipGroupCount")).toBe(1);
      device.endFrame();
    } finally { batch.pool.dispose(); batch.drawData.dispose(); first.dispose(); second.dispose(); material.dispose(); device.dispose(); }
  });

  it("continues to clip ordinary thin line geometry", () => {
    const geometry = Geometry.lineSegments([[0, 0, 0], [1, 0, 0]]);
    const material = new UnlitMaterial();
    const device = checkedMock();
    try {
      device.beginFrame(8, 8);
      new DepthPass({ checkedSubmission: true, clippingPass: "shadow", casters: [{ geometry, material }],
        globalClipping: { planes: [[1, 0, 0, 0]], clipShadows: true } }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(1);
      expect(device.drawCommands[0]?.topology).toBe("lines");
      expect(device.drawCommands[0]?.uniforms?.get("u_a3dClipGroupCount")).toBe(1);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("snapshots each clipping callback once before submitting any caster", () => {
    const first = Geometry.triangle();
    const second = Geometry.triangle();
    const device = checkedMock();
    const plane: [number, number, number, number] = [1, 0, 0, 0];
    let calls = 0;
    try {
      device.beginFrame(8, 8);
      new DepthPass({
        checkedSubmission: true, clippingPass: "depth", casters: [{ geometry: first }, { geometry: second }],
        materialClippingFor: () => {
          expect(device.drawCommands).toHaveLength(0);
          plane[3] = calls === 0 ? 0 : -calls;
          calls += 1;
          return { planes: [plane], space: "local" };
        }
      }).execute({ device, width: 8, height: 8 });
      expect(calls).toBe(2);
      expect(Array.from(device.drawCommands[0]!.uniforms!.get("u_a3dClipPlanes") as Float32Array).slice(0, 4)).toEqual([1, 0, 0, 0]);
      expect(Array.from(device.drawCommands[1]!.uniforms!.get("u_a3dClipPlanes") as Float32Array).slice(0, 4)).toEqual([1, 0, 0, -1]);
      device.endFrame();
    } finally { first.dispose(); second.dispose(); device.dispose(); }
  });

  it("evaluates a morph caster's clipping callback once with its deformed geometry", () => {
    const geometry = Geometry.triangle();
    const device = checkedMock();
    let calls = 0;
    let callbackPosition: readonly number[] = [];
    try {
      device.beginFrame(8, 8);
      new DepthPass({
        checkedSubmission: true, clippingPass: "depth",
        casters: [{ geometry, morphTargets: [{ positions: [[2, 0, 0], [0, 0, 0], [0, 0, 0]] }], morphWeights: [0.5] }],
        materialClippingFor: (item) => {
          calls += 1;
          expect(item.geometry).not.toBe(geometry);
          callbackPosition = item.geometry.vertexBuffer.getAttribute(0, "position");
          return { planes: [[1, 0, 0, 0]], space: "local" };
        }
      }).execute({ device, width: 8, height: 8 });
      expect(calls).toBe(1);
      expect(callbackPosition).toEqual([0.5, -0.5, 0]);
      expect(geometry.vertexBuffer.getAttribute(0, "position")).toEqual([-0.5, -0.5, 0]);
      expect(device.drawCommands).toHaveLength(1);
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });

  it("generates both shader stages in deformation, geometry, instance, world order", () => {
    registerShaderChunk({
      name: "test_depth_geometry_matrix_deform", owner: "prd02", stage: "vertex",
      glsl: "void a3dDeform(inout vec4 p, inout vec3 n, inout vec4 t) { p.x += 1.0; }"
    });
    const deform: DepthVariantFeature = {
      id: "test.geometry.deform", owner: "prd02", flag: "A3D_QR_LIGHTING", order: 1,
      passes: ["depth"], select: () => 1, defines: () => ({}),
      chunks: ["test_depth_geometry_matrix_deform"], hooks: ["vertex:deform"]
    };
    const key: ShadowCasterVariantKey = {
      skinning: 4, skinningTexture: false, morphTargets: false, instanced: true, batched: false,
      alphaTest: false, alphaHash: false, doubleSided: false,
      features: { "a3d.clipping": true, "a3d.logarithmicDepth": true, "test.geometry.deform": 1 }
    };
    const library = createLeanCoreShaderLibrary();
    registerPrd02DepthShader(library);
    const raw = library.compileSource(PRD02_DEPTH_SHADER_NAME, { defines: prd02DepthVariantDefines(key) }).vertex;
    const glsl = composeDepthDeformVertex(raw, key, [deform]);
    const orderedGlsl = ["vec4 local = a3dWeightSum", "a3dDeform(local,", "vec4 a3dGeometryLocal =", "a3dDepthPosition = u_instanceMatrices[instanceIndex] * a3dGeometryLocal", "vec4 a3dDepthWorld ="];
    const glslPositions = orderedGlsl.map((part) => glsl.indexOf(part));
    expect(glslPositions.every((index) => index >= 0), JSON.stringify(Object.fromEntries(orderedGlsl.map((part, index) => [part, glslPositions[index]])))).toBe(true);
    expect(glslPositions).toEqual([...glslPositions].sort((a, b) => a - b));
    expect(glsl).toContain("v_a3dClipLocal = a3dGeometryLocal.xyz;");
    expect(glsl).toContain("v_a3dClipWorld = a3dDepthWorld.xyz;");
    expect(glsl).toContain("v_a3dViewDistance = -(u_a3dLogDepthView * a3dDepthWorld).z;");
    const { webgpu, portableBindings } = prd02DepthWgsl({ ...key, features: { "a3d.clipping": true, "a3d.logarithmicDepth": true } });
    const orderedWgsl = ["local = skin * local", "let geometryLocal =", "placed = instance * geometryLocal", "let worldPosition ="];
    const wgslPositions = orderedWgsl.map((part) => webgpu.vertex.indexOf(part));
    expect(wgslPositions.every((index) => index >= 0)).toBe(true);
    expect(wgslPositions).toEqual([...wgslPositions].sort((a, b) => a - b));
    expect(webgpu.vertex).toContain("output.localPosition = geometryLocal.xyz;");
    expect(webgpu.vertex).toContain("output.worldPosition = worldPosition.xyz;");
    expect(webgpu.vertex).toContain("output.viewDistance = -(aura.u_a3dLogDepthView * worldPosition).z;");
    expect(portableBindings).toEqual(expect.arrayContaining([{ name: "u_geometryMatrix", kind: "mat4" }]));
  });
});
