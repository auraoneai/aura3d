import { describe, expect, it, vi } from "vitest";
import { Matrix4, Vector3 } from "@aura3d/math";
import { clipping, material, primitives } from "../../../packages/engine/src/public/index";
import { productionCameraProjectionMetadata } from "../../../packages/engine/src/agent-api/compiler/cameraDepth";
import { createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { DepthPreviewMaterial, depthPreviewValue } from "../../../packages/rendering/src/DepthPreviewMaterial";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import { encodeViewDepth, negotiateDepthConvention } from "../../../packages/rendering/src/DepthConvention";
import { ForwardPass } from "../../../packages/rendering/src/ForwardPass";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { ShaderModule } from "../../../packages/rendering/src/ShaderModule";
import { ShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

describe("native depth-preview shader contracts", () => {
  it("maps view distance independently of the camera's nonlinear perspective depth buffer", () => {
    const near = 2, far = 12;
    const convention = negotiateDepthConvention({}, { clipRange: "minus-one-to-one", reversed: false, logarithmic: false });
    const perspective = Matrix4.perspective(Math.PI / 3, 1, near, far);
    const ortho = Matrix4.orthographic(-2, 2, -2, 2, near, far);
    for (const [distance, expected] of [[0, 1], [2, 1], [4.5, 0.75], [7, 0.5], [9.5, 0.25], [12, 0], [20, 0]]) {
      expect(depthPreviewValue(distance!, { near, far })).toBeCloseTo(expected!, 7);
    }
    expect(encodeViewDepth(7, perspective.elements, convention)).not.toBeCloseTo(0.5, 2);
    expect(encodeViewDepth(7, ortho.elements, convention)).toBeCloseTo(0.5);
    for (const projection of [perspective, ortho]) {
      expect(projection.transformPoint(new Vector3(0, 0, -near)).z).toBeCloseTo(-1);
      expect(projection.transformPoint(new Vector3(0, 0, -far)).z).toBeCloseTo(1);
      expect(projection.transformPoint(new Vector3(0, 0, -(near - 0.1))).z).toBeLessThan(-1);
      expect(projection.transformPoint(new Vector3(0, 0, -(far + 0.1))).z).toBeGreaterThan(1);
    }
  });

  it("uses perspective-correct interpolation and orthographic linear interpolation", () => {
    const depths = [2, 4, 8], weights = [0.2, 0.3, 0.5];
    const perspectiveDepth = 1 / weights.reduce((sum, weight, i) => sum + weight / depths[i]!, 0);
    const orthographicDepth = weights.reduce((sum, weight, i) => sum + weight * depths[i]!, 0);
    expect(perspectiveDepth).toBeCloseTo(1 / (0.1 + 0.075 + 0.0625));
    expect(orthographicDepth).toBeCloseTo(5.6);
    expect(depthPreviewValue(perspectiveDepth, { near: 2, far: 12 })).toBeCloseTo(1 - (perspectiveDepth - 2) / 10);
    expect(depthPreviewValue(orthographicDepth, { near: 2, far: 12 })).toBeCloseTo(0.64);
  });

  it("submits the native GLSL and actual frame/model matrices to the real forward path", () => {
    const resource = createProductionRuntimePrimitiveEntries([
      primitives.box({ material: material.depth({ near: 2, far: 12 }) }).toJSON()
    ])[0]!.resources[0]!;
    const preview = resource.material as DepthPreviewMaterial;
    const device = new MockRenderDevice();
    const view: number[] = [...identity]; view[14] = -3;
    const projection = Matrix4.perspective(Math.PI / 3, 1.5, 1, 20).elements;
    const model: number[] = [...identity]; model[12] = 4;
    try {
      expect(preview.sources.glsl.vertex).toContain("u_viewMatrix * u_modelMatrix * vec4(a_position, 1.0)");
      expect(preview.sources.glsl.vertex).toContain("v_viewDepth = -viewPosition.z");
      expect(preview.sources.glsl.vertex).toContain("gl_Position = u_projectionMatrix * viewPosition");
      expect(preview.sources.glsl.vertex).not.toMatch(/\b(?:flat|noperspective)\s+out\s+float\s+v_viewDepth/);
      expect(preview.sources.glsl.fragment).toContain("1.0 - clamp((v_viewDepth - u_depthPreviewNear) / u_depthPreviewSpan");
      expect(preview.sources.wgsl?.vertex).toContain("aura.u_a3dClipRange");
      expect(preview.sources.wgsl?.fragment).toContain("aura.u_depthPreviewSpan");
      device.beginFrame(8, 8);
      new ForwardPass({
        items: [{ geometry: resource.geometry, material: preview, modelMatrix: model }],
        cameraViewMatrix: view,
        customFrameCamera: { viewMatrix: view, projectionMatrix: projection }
      }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(1);
      const draw = device.drawCommands[0]!;
      expect(Array.from(draw.uniforms!.get("u_modelMatrix") as Float32Array)).toEqual(model);
      expect(Array.from(draw.uniforms!.get("u_viewMatrix") as Float32Array)).toEqual(view);
      expect(Array.from(draw.uniforms!.get("u_projectionMatrix") as Float32Array))
        .toEqual(Array.from(new Float32Array(projection)));
      expect(draw.uniforms!.get("u_depthPreviewNear")).toBe(2);
      expect(draw.uniforms!.get("u_depthPreviewSpan")).toBe(10);
      expect(draw.renderState).toMatchObject({ blend: false, depthWrite: true, depthTest: true });
    } finally {
      resource.geometry.dispose();
      preview.dispose();
      device.dispose();
    }
  });

  it("shares the program while retaining independent preview ranges per draw", () => {
    const resources = createProductionRuntimePrimitiveEntries([
      primitives.box({ material: material.depth({ near: 1, far: 11 }) }).toJSON(),
      primitives.box({ material: material.depth({ near: 2, far: 22 }) }).toJSON()
    ]).map((entry) => entry.resources[0]!);
    const device = new MockRenderDevice();
    try {
      device.beginFrame(8, 8);
      new ForwardPass({
        items: resources.map((resource) => ({ geometry: resource.geometry, material: resource.material })),
        cameraViewMatrix: identity,
        customFrameCamera: { viewMatrix: identity, projectionMatrix: identity }
      }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(2);
      expect(device.drawCommands[0]!.shader).toBe(device.drawCommands[1]!.shader);
      expect(device.drawCommands.map((draw) => [draw.uniforms!.get("u_depthPreviewNear"), draw.uniforms!.get("u_depthPreviewSpan")]))
        .toEqual([[1, 10], [2, 20]]);
    } finally {
      for (const resource of resources) { resource.geometry.dispose(); resource.material.dispose(); }
      device.dispose();
    }
  });

  it("rejects material-instance overrides that could invalidate the preview range", () => {
    const resource = createProductionRuntimePrimitiveEntries([
      primitives.box({ material: material.depth({ near: 2, far: 12 }) }).toJSON()
    ])[0]!.resources[0]!;
    const instance = new MaterialInstance(resource.material);
    const device = new MockRenderDevice();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      instance.setOverride("u_depthPreviewSpan", 0);
      device.beginFrame(8, 8);
      new ForwardPass({ items: [{ geometry: resource.geometry, material: instance }] })
        .execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(0);
      expect(warning.mock.calls.flat().join(" ")).toMatch(/DEPTH_PREVIEW_RANGE_IMMUTABLE/);
    } finally {
      warning.mockRestore();
      resource.geometry.dispose();
      resource.material.dispose();
      device.dispose();
    }
  });

  it("rejects scene clipping instead of silently dropping the clipping planes", () => {
    const resource = createProductionRuntimePrimitiveEntries([
      primitives.box({ material: material.depth() }).toJSON()
    ])[0]!.resources[0]!;
    const group = clipping.global({ planes: [[1, 0, 0, 0]] });
    const device = new MockRenderDevice();
    try {
      device.beginFrame(8, 8);
      expect(() => new ForwardPass({ items: [{ geometry: resource.geometry, material: resource.material }], globalClipping: group })
        .execute({ device, width: 8, height: 8 })).toThrow(/clipping/i);
      expect(device.drawCommands).toHaveLength(0);
    } finally {
      group.dispose();
      resource.geometry.dispose();
      resource.material.dispose();
      device.dispose();
    }
  });

  it("keeps production reversed/logarithmic camera requests rejected", () => {
    for (const mode of ["reversed", "logarithmic"] as const) {
      expect(() => productionCameraProjectionMetadata({ mode: "perspective", depth: { mode } }))
        .toThrow(/standard minus-one-to-one/);
      expect(() => productionCameraProjectionMetadata({ mode: "perspective", depth: { mode, allowFallback: true } }))
        .toThrow(/standard minus-one-to-one/);
    }
    expect(() => productionCameraProjectionMetadata({ mode: "orthographic", depth: { clipRange: "zero-to-one" } } as never))
      .toThrow(/standard minus-one-to-one/);
  });

  it("creates the native WebGPU shader with the reflected clip-range binding", async () => {
    let moduleCount = 0;
    const native: WebGPUDeviceLike = {
      queue: { writeBuffer() {}, submit() {}, onSubmittedWorkDone: async () => {} },
      createBuffer({ size, usage }) { return { size, usage, destroy() {} }; },
      createShaderModule() { moduleCount += 1; return {}; },
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
    const preview = new DepthPreviewMaterial();
    const shader = ShaderModule.fromLibrary(new ShaderLibrary(), preview.shaderKey);
    try {
      expect(shader.compile(device).disposed).toBe(false);
      expect(shader.reflection.uniforms.has("u_a3dClipRange")).toBe(true);
      expect(moduleCount).toBe(2);
    } finally {
      shader.dispose();
      preview.dispose();
      device.dispose();
    }
  });
});
