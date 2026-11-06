import { describe, expect, it, vi } from "vitest";
import { DepthPass, depthAlphaVariantForItem } from "../../../packages/rendering/src/DepthPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MockRenderDevice, type DrawCommand } from "../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TexturedPBRMaterial } from "../../../packages/rendering/src/TexturedPBRMaterial";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { ShadowCasterVariantKey } from "../../../packages/rendering/src/contracts/shadows";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 2, -1, 1];

function deviceFor(kind: "webgpu" | "webgl2", strict = false): MockRenderDevice {
  const device = new MockRenderDevice();
  Object.defineProperty(device, "kind", { value: kind });
  const draw = device.draw.bind(device);
  (device as MockRenderDevice & { drawChecked: (command: DrawCommand) => void }).drawChecked = draw;
  setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, ...(strict ? { A3D_QR_STRICT: true } : {}) }), device);
  return device;
}

describe("single-instance masked depth coverage", () => {
  it("binds the member alpha with the logical transform and clipping for a native generated draw", () => {
    const geometry = Geometry.triangle();
    const material = new UnlitMaterial({ color: [1, 1, 1, 0.8], alphaTest: 0.5 });
    const device = deviceFor("webgpu");
    const item = { geometry, material, modelMatrix: transform, instanceTransforms: new Float32Array(identity),
      instanceColors: new Float32Array([0.25, 0.5, 1, 0.25]) };
    let callbackItem: unknown;
    const pass = new DepthPass({ checkedSubmission: true, clippingPass: "depth", casters: [item],
      materialClippingFor: (caster) => { callbackItem = caster; return { planes: [[1, 0, 0, 0]], space: "local" }; } });
    try {
      device.beginFrame(8, 8);
      const plan = pass.prepare({ device, width: 8, height: 8 });
      expect(callbackItem).toBe(item);
      pass.executePrepared({ device, width: 8, height: 8 }, plan);
      expect(device.drawCommands).toHaveLength(1);
      const command = device.drawCommands[0]!;
      expect(command.uniforms?.get("u_a3dPackedLoopColor")).toEqual([1, 1, 1, 0.25]);
      expect(command.uniforms?.get("u_baseColor")).toEqual([1, 1, 1, 0.8]);
      expect(command.uniforms?.get("u_alphaCutoff")).toBe(0.5);
      expect(Array.from(command.uniforms?.get("u_modelViewProjection") as Float32Array)).toEqual(transform);
      expect(Array.from(command.uniforms?.get("u_instanceMatrices") as Float32Array)).toEqual(identity);
      expect(command.uniforms?.get("u_a3dClipGroupCount")).toBe(1);
      expect(0.8 * 0.25).toBeLessThan(0.5);
      device.endFrame();
    } finally { material.dispose(); geometry.dispose(); device.dispose(); }
  });

  it("invalidates a prepared plan when its instance color changes", () => {
    const geometry = Geometry.triangle(), material = new UnlitMaterial({ alphaTest: 0.5 });
    const device = deviceFor("webgpu");
    const colors = new Float32Array([1, 1, 1, 0.25]);
    const pass = new DepthPass({ checkedSubmission: true, casters: [{ geometry, material,
      instanceTransforms: new Float32Array(identity), instanceColors: colors }] });
    const context = { device, width: 8, height: 8 };
    try {
      device.beginFrame(8, 8);
      const plan = pass.prepare(context);
      colors[3] = 0.75;
      expect(() => pass.executePrepared(context, plan)).toThrow(/stale/i);
      expect(device.drawCommands).toHaveLength(0);
      device.endFrame();
    } finally { material.dispose(); geometry.dispose(); device.dispose(); }
  });

  it("keeps vertex alpha in the same native masked draw as the instance alpha", () => {
    const format = new VertexFormat([{ semantic: "position", components: 3, offset: 0 },
      { semantic: "color", components: 4, offset: 12 }], 28);
    const vertices = new VertexBuffer(format, 3);
    for (let index = 0; index < 3; index += 1) {
      vertices.setAttribute(index, "position", [index === 1 ? 1 : 0, index === 2 ? 1 : 0, 0]);
      vertices.setAttribute(index, "color", [1, 1, 1, 0.5]);
    }
    const geometry = new Geometry(vertices), material = new UnlitMaterial({ vertexColors: true, alphaTest: 0.5 });
    const device = deviceFor("webgpu");
    try {
      device.beginFrame(8, 8);
      new DepthPass({ checkedSubmission: true, casters: [{ geometry, material,
        instanceTransforms: new Float32Array(identity), instanceColors: [1, 1, 1, 0.5] }] })
        .execute({ device, width: 8, height: 8 });
      const command = device.drawCommands[0]!;
      expect(command.shader?.reflection.attributes.has("a_color")).toBe(true);
      expect(command.uniforms?.get("u_a3dPackedLoopColor")).toEqual([1, 1, 1, 0.5]);
      expect(geometry.vertexBuffer.getDecodedAttribute(0, "color")[3]! * 0.5).toBeLessThan(0.5);
      device.endFrame();
    } finally { material.dispose(); geometry.dispose(); device.dispose(); }
  });

  it("does not submit if the variant resolver changes the member after transform capture", () => {
    const geometry = Geometry.triangle(), material = new UnlitMaterial({ alphaTest: 0.5 });
    const device = deviceFor("webgpu");
    const colors = new Float32Array([1, 1, 1, 0.25]);
    const key: ShadowCasterVariantKey = { skinning: 0, skinningTexture: false, morphTargets: false, instanced: true,
      batched: false, alphaTest: true, alphaHash: false, doubleSided: false, features: {} };
    const pass = new DepthPass({ checkedSubmission: true, casters: [{ geometry, material,
      instanceTransforms: new Float32Array(identity), instanceColors: colors }],
      variantResolver: () => { colors[3] = 0.75; return key; } });
    try {
      device.beginFrame(8, 8);
      expect(() => pass.execute({ device, width: 8, height: 8 })).toThrow(/inputs changed/i);
      expect(device.drawCommands).toHaveLength(0);
      device.endFrame();
    } finally { material.dispose(); geometry.dispose(); device.dispose(); }
  });

  it("rejects a variant resolver that omits the mask", () => {
    const geometry = Geometry.triangle(), material = new UnlitMaterial({ alphaTest: 0.5 });
    const device = deviceFor("webgpu");
    const pass = new DepthPass({ checkedSubmission: true, casters: [{ geometry, material,
      instanceTransforms: new Float32Array(identity), instanceColors: [1, 1, 1, 0.25] }],
      variantResolver: () => ({ skinning: 0, skinningTexture: false, morphTargets: false, instanced: true,
        batched: false, alphaTest: false, alphaHash: false, doubleSided: false, features: {} }) });
    try {
      device.beginFrame(8, 8);
      expect(() => pass.execute({ device, width: 8, height: 8 })).toThrow(/omits single-instance alpha coverage/);
      expect(device.drawCommands).toHaveLength(0);
      device.endFrame();
    } finally { material.dispose(); geometry.dispose(); device.dispose(); }
  });

  it("rejects a mirrored instance when culling would expand and lose its instance color", () => {
    const geometry = Geometry.triangle(), material = new UnlitMaterial({ alphaTest: 0.5 });
    const device = deviceFor("webgpu", true), relaxed = deviceFor("webgpu");
    const mirror = [...identity];
    mirror[0] = -1;
    const item = { geometry, material, modelMatrix: mirror,
      instanceTransforms: new Float32Array(identity), instanceColors: [1, 1, 1, 0.25] };
    try {
      device.beginFrame(8, 8);
      expect(() => new DepthPass({ checkedSubmission: true, casters: [item] }).execute({ device, width: 8, height: 8 }))
        .toThrow(/per-instance color alpha/);
      expect(device.drawCommands).toHaveLength(0);
      device.endFrame();
      // Non-strict: degrades to an opaque caster (one-time DEPTH_ALPHA_MASK_DEGRADED warning) instead of throwing.
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      try {
        relaxed.beginFrame(8, 8);
        expect(() => new DepthPass({ checkedSubmission: true, casters: [item] }).execute({ device: relaxed, width: 8, height: 8 })).not.toThrow();
        expect(() => new DepthPass({ checkedSubmission: true, casters: [item] }).execute({ device: relaxed, width: 8, height: 8 })).not.toThrow();
        expect(warn.mock.calls.filter((c) => String(c[0]).startsWith("DEPTH_ALPHA_MASK_DEGRADED")).length).toBeLessThanOrEqual(1);
        relaxed.endFrame();
      } finally { warn.mockRestore(); relaxed.dispose(); }
    } finally { material.dispose(); geometry.dispose(); device.dispose(); }
  });

  it("keeps multi-instance alpha, legacy forward programs and forged member flags closed", () => {
    const geometry = Geometry.triangle(), material = new UnlitMaterial({ alphaTest: 0.5 });
    const native = deviceFor("webgpu", true), legacy = deviceFor("webgl2", true);
    const single = { geometry, material, instanceTransforms: new Float32Array(identity), instanceColors: [1, 1, 1, 0.25] };
    const multiple = { ...single, instanceTransforms: new Float32Array([...identity, ...identity]),
      instanceColors: [1, 1, 1, 0.25, 1, 1, 1, 0.75] };
    const key: ShadowCasterVariantKey = { skinning: 0, skinningTexture: false, morphTargets: false, instanced: true,
      batched: false, alphaTest: true, alphaHash: false, doubleSided: false, features: { "prd02.depthAlphaMember": true } };
    try {
      native.beginFrame(8, 8);
      legacy.beginFrame(8, 8);
      expect(() => new DepthPass({ checkedSubmission: true, casters: [multiple] }).execute({ device: native, width: 8, height: 8 }))
        .toThrow(/per-instance color alpha/);
      expect(() => new DepthPass({ checkedSubmission: true, casters: [single] }).execute({ device: legacy, width: 8, height: 8 }))
        .toThrow(/native generated forward program/);
      expect(() => depthAlphaVariantForItem(single, key, native)).toThrow(/authenticated loop carrier/);
      expect(native.drawCommands).toHaveLength(0);
      expect(legacy.drawCommands).toHaveLength(0);
      native.endFrame(); legacy.endFrame();
    } finally { material.dispose(); geometry.dispose(); native.dispose(); legacy.dispose(); }
  });

  it("does not accept a base-color map until forward and depth use the same alpha operation order", () => {
    const geometry = Geometry.litPlane({ textured: true });
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 128]) });
    const material = new TexturedPBRMaterial({ baseColorTexture: texture });
    material.setParameter("u_alphaCutoff", 0.5);
    const device = deviceFor("webgpu", true);
    const item = { geometry, material, instanceTransforms: new Float32Array(identity), instanceColors: [1, 1, 1, 0.25] };
    try {
      device.beginFrame(8, 8);
      expect(() => new DepthPass({ checkedSubmission: true, casters: [item] }).execute({ device, width: 8, height: 8 }))
        .toThrow(/native generated forward program/);
      expect(device.drawCommands).toHaveLength(0);
      device.endFrame();
    } finally { material.dispose(); texture.dispose(); geometry.dispose(); device.dispose(); }
  });
});
