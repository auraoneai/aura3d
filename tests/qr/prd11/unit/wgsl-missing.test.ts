import { describe, expect, it } from "vitest";

import { WebGPUDevice } from "../../../../packages/rendering/src/WebGPUDevice";
import type { ShaderSources } from "../../../../packages/rendering/src/RenderDevice";
import { RenderDeviceError } from "../../../../packages/rendering/src/RenderDevice";

function fakeDevice() {
  return WebGPUDevice.create({
    adapter: {
      info: { vendor: "test", architecture: "test" },
      requestDevice: () => Promise.resolve({
        queue: { writeBuffer() {}, submit() {} },
        createBuffer: () => ({ destroy() {} })
      })
    }
  });
}

function glsl(marker: string): Pick<ShaderSources, "vertex" | "fragment"> {
  return {
    vertex: `// ${marker}\nvoid main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }`,
    fragment: `// ${marker}\nvoid main() { }`
  };
}

const markersThatThrow = [
  "@aura3d-shader:skinned-lit",
  "@aura3d-shader:animation-toon",
  "@aura3d-shader:environment-background",
  "@aura3d-shader:screen-space-line"
] as const;

describe("WebGPU WGSL freeze (PRD 11 Phase 1)", () => {
  it.each(markersThatThrow)("throws WGSL_PROGRAM_MISSING for %s without a real WGSL program", async (marker) => {
    const device = await fakeDevice();
    const sources: ShaderSources = { label: marker, marker, ...glsl(marker) };
    try {
      expect(() => device.createShaderProgram(sources)).toThrowError(RenderDeviceError);
      expect(() => device.createShaderProgram(sources)).toThrowError(expect.objectContaining({ code: "WGSL_PROGRAM_MISSING" }));
    } finally {
      device.dispose();
    }
  });

  it("still returns a program for markers with generated WGSL (instanced-pbr)", async () => {
    const device = await fakeDevice();
    const marker = "@aura3d-shader:instanced-pbr";
    try {
      const shader = device.createShaderProgram({ label: "instanced-pbr", marker, ...glsl(marker) });
      expect(shader).toBeTruthy();
    } finally {
      device.dispose();
    }
  });

  it("passthrough real-WGSL sources still compile", async () => {
    const device = await fakeDevice();
    const marker = "@aura3d-shader:custom-probe";
    const sources: ShaderSources = {
      label: "custom-probe",
      marker,
      vertex: `// ${marker}\nstruct O { @builtin(position) p: vec4<f32> };\n@vertex fn vs_main() -> O { var o: O; o.p = vec4<f32>(0.0); return o; }`,
      fragment: `// ${marker}\n@fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }`
    };
    try {
      expect(() => device.createShaderProgram(sources)).not.toThrow();
    } finally {
      device.dispose();
    }
  });

  it("synchronous readPixels and readFloatPixels throw WEBGPU_SYNC_READBACK_UNSUPPORTED", async () => {
    const device = await fakeDevice();
    try {
      expect(() => device.readPixels(0, 0, 1, 1)).toThrowError(expect.objectContaining({ code: "WEBGPU_SYNC_READBACK_UNSUPPORTED" }));
      expect(() => device.readFloatPixels(0, 0, 1, 1)).toThrowError(expect.objectContaining({ code: "WEBGPU_SYNC_READBACK_UNSUPPORTED" }));
    } finally {
      device.dispose();
    }
  });
});
