import { describe, expect, it } from "vitest";
import { MockRenderBuffer, MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import {
  AURA_FRAME_BLOCK,
  frameUniformsSlot
} from "../../../../packages/rendering/src/contracts/frameUniforms";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import {
  FrameUniforms,
  layoutStd140,
  uniformBlockGlsl
} from "../../../../packages/rendering/src/resources/UniformBlock";
import "../../../../packages/rendering/src/lanes/prd01";

const camera = {
  viewMatrix: Float32Array.from({ length: 16 }, (_, i) => 100 + i),
  projectionMatrix: Float32Array.from({ length: 16 }, (_, i) => 200 + i),
  viewProjectionMatrix: Float32Array.from({ length: 16 }, (_, i) => 300 + i),
  previousViewProjectionMatrix: Float32Array.from({ length: 16 }, (_, i) => 400 + i),
  near: 0.5,
  far: 250,
  projection: "perspective" as const,
  position: [1, 2, 3] as const
};

describe("prd01 frame uniforms (C-08)", () => {
  it("layoutStd140 computes the frozen AuraFrame offsets", () => {
    const layout = layoutStd140(AURA_FRAME_BLOCK);
    // std140: 4×mat4 (64B) then 3×vec4 (16B) → 256+48 = 304 bytes.
    expect(layout.offsets.get("u_view")).toBe(0);
    expect(layout.offsets.get("u_projection")).toBe(64);
    expect(layout.offsets.get("u_viewProjection")).toBe(128);
    expect(layout.offsets.get("u_prevViewProjection")).toBe(192);
    expect(layout.offsets.get("u_cameraPositionNear")).toBe(256);
    expect(layout.offsets.get("u_resolutionFarTime")).toBe(272);
    expect(layout.offsets.get("u_exposureFlags")).toBe(288);
    expect(layout.byteSize).toBe(304);
  });

  it("vec3 fields align to 16 and unknown types throw", () => {
    const layout = layoutStd140([["a", "vec3"], ["b", "float"], ["c", "vec4"]]);
    expect(layout.offsets.get("a")).toBe(0);
    // vec3 align 16 but occupies 12B; a following scalar tail-packs the row.
    expect(layout.offsets.get("b")).toBe(12);
    expect(layout.offsets.get("c")).toBe(16); // vec4 must 16-align
    expect(layout.byteSize).toBe(32);
    try {
      layoutStd140([["x", "sampler2D"]]);
      expect.unreachable();
    } catch (error) {
      expect((error as { code: string }).code).toBe("UNSUPPORTED_UNIFORM_BLOCK_FIELD");
    }
  });

  it("packs camera, viewport, exposure and flags into the block once per update", () => {
    const device = new MockRenderDevice();
    const uniforms = new FrameUniforms(device);
    uniforms.viewport = { width: 1280, height: 720 };
    uniforms.update(camera, 2.5, 1.75, 0b10);

    const bytes = (uniforms.buffer as MockRenderBuffer).bytes;
    const data = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    // mat4 fields verbatim, column-major
    expect([...data.slice(0, 16)]).toEqual([...camera.viewMatrix]);
    expect([...data.slice(16, 32)]).toEqual([...camera.projectionMatrix]);
    expect([...data.slice(32, 48)]).toEqual([...camera.viewProjectionMatrix]);
    expect([...data.slice(48, 64)]).toEqual([...camera.previousViewProjectionMatrix]);
    // u_cameraPositionNear: xyz position, w near
    expect([...data.slice(64, 68)]).toEqual([1, 2, 3, 0.5]);
    // u_resolutionFarTime: xy render px, z far, w time
    expect([...data.slice(68, 72)]).toEqual([1280, 720, 250, 2.5]);
    // u_exposureFlags: x exposure; y bit0 ortho (0 here) | caller flags 0b10
    expect([...data.slice(72, 76)]).toEqual([1.75, 0b10, 0, 0]);
  });

  it("orthographic projection sets u_exposureFlags.y bit 0", () => {
    const device = new MockRenderDevice();
    const uniforms = new FrameUniforms(device);
    uniforms.update({ ...camera, projection: "orthographic" }, 0, 1, 0);
    const bytes = (uniforms.buffer as MockRenderBuffer).bytes;
    const data = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    expect(data[72 + 1]).toBe(1);
  });

  it("first frame reuses viewProjection when previousViewProjectionMatrix is null", () => {
    const device = new MockRenderDevice();
    const uniforms = new FrameUniforms(device);
    uniforms.update({ ...camera, previousViewProjectionMatrix: null }, 0, 1, 0);
    const bytes = (uniforms.buffer as MockRenderBuffer).bytes;
    const data = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    expect([...data.slice(48, 64)]).toEqual([...camera.viewProjectionMatrix]);
  });

  it("creates a 'uniform' buffer and binds at binding 0", () => {
    const device = new MockRenderDevice();
    const uniforms = new FrameUniforms(device);
    expect(uniforms.buffer).not.toBeNull();
    expect((uniforms.buffer as MockRenderBuffer).usage).toBe("uniform");
    expect((uniforms.buffer as MockRenderBuffer).byteLength).toBe(304);
    uniforms.bind();
    expect(device.uniformBufferBindings).toEqual([{ bufferId: uniforms.buffer!.id, binding: 0 }]);
  });

  it("emits the GLSL declaration from the same field list", () => {
    const glsl = uniformBlockGlsl("AuraFrame", AURA_FRAME_BLOCK);
    expect(glsl).toContain("layout(std140) uniform AuraFrame {");
    expect(glsl).not.toContain("binding");
    expect(glsl).toContain("  mat4 u_view;");
    expect(glsl).toContain("  vec4 u_exposureFlags;");
    for (const [name, type] of AURA_FRAME_BLOCK) {
      expect(glsl).toContain(`${type} ${name};`);
    }
  });

  it("frameUniformsSlot provides the stub off-flag and the real impl on-flag", () => {
    const off = frameUniformsSlot.get(resolveQrFlags({}));
    expect(off(new MockRenderDevice()).buffer).toBeNull(); // stub
    const on = frameUniformsSlot.get(resolveQrFlags({ env: { A3D_QR_CORE: "v2" } }));
    const uniforms = on(new MockRenderDevice());
    expect(uniforms.buffer).not.toBeNull();
    expect(uniforms).toBeInstanceOf(FrameUniforms);
  });
});
