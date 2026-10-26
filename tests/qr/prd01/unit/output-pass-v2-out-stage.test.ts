/**
 * PostGraph v2 OUT stage on the OutputPass: the linear-light vignette and the
 * full-coverage mode a chain frame needs. MockRenderDevice: GLSL content and
 * draw sequencing are asserted; rasterization is the browser lane's job.
 */

import { describe, expect, it } from "vitest";

import { MockRenderDevice, OutputPass, createHdrTarget, outputFragmentGlsl } from "@aura3d/rendering";

const base = { toneMapping: "aces", backgroundCoverage: false, overlay: false } as const;

describe("OutputPass OUT-stage variants", () => {
  it("compiles the vignette out unless asked and keeps the earlier variants byte-identical", () => {
    const plain = outputFragmentGlsl(base);
    expect(plain).not.toContain("#define OUTPUT_VIGNETTE");
    expect(plain).not.toContain("#define OUTPUT_FULL_COVERAGE");
    expect(outputFragmentGlsl({ ...base, vignette: false, fullCoverage: false })).toBe(plain);
  });

  it("multiplies the vignette into linear light before exposure and the tone operator", () => {
    const source = outputFragmentGlsl({ ...base, vignette: true });
    expect(source).toContain("#define OUTPUT_VIGNETTE");
    const vignetteAt = source.indexOf("hdr = a3dLinearVignette(hdr, v_uv);");
    const toneAt = source.indexOf("TONE_MAP(hdr * u_exposure)");
    expect(vignetteAt).toBeGreaterThan(0);
    expect(toneAt).toBeGreaterThan(vignetteAt);
  });

  it("full coverage tone-maps every pixel; a coverage attachment still wins", () => {
    expect(outputFragmentGlsl({ ...base, fullCoverage: true })).toContain("float a3dCoverage = 1.0;");
    const withAttachment = outputFragmentGlsl({ ...base, backgroundCoverage: true, fullCoverage: true });
    expect(withAttachment).toContain("texture(u_coverage, v_uv).r");
    expect(withAttachment).not.toContain("#define OUTPUT_FULL_COVERAGE");
  });

  it("executes with a vignette: vignette uniforms set, variant cached apart from the plain one", () => {
    const device = new MockRenderDevice();
    const pass = new OutputPass(device);
    const input = createHdrTarget(device, { width: 32, height: 16 });
    const options = { toneMapping: "aces", exposure: 1, dithering: false, backgroundCoverage: false } as const;
    device.beginFrame(32, 16);
    pass.execute(input, null, { ...options, fullCoverage: true, vignette: { intensity: 0.2, smoothness: 0.65, roundness: 1, color: [0, 0, 0] } }, "canvas");
    const vignetted = device.drawCommands.at(-1) as { uniforms?: Map<string, unknown> };
    pass.execute(input, null, options, "canvas");
    const plain = device.drawCommands.at(-1) as { uniforms?: Map<string, unknown> };
    device.endFrame();
    expect(vignetted.uniforms?.get("u_vignette")).toEqual([0.2, 0.65, 1, 2]);
    expect(vignetted.uniforms?.get("u_vignetteColor")).toEqual([0, 0, 0]);
    expect(plain.uniforms?.has("u_vignette")).toBe(false);
    input.dispose();
    pass.dispose();
  });

  it("a zero-intensity vignette selects the plain variant", () => {
    const device = new MockRenderDevice();
    const pass = new OutputPass(device);
    const input = createHdrTarget(device, { width: 8, height: 8 });
    device.beginFrame(8, 8);
    pass.execute(input, null, { toneMapping: "aces", exposure: 1, dithering: false, backgroundCoverage: false, vignette: { intensity: 0, smoothness: 1, roundness: 1, color: [0, 0, 0] } }, "canvas");
    device.endFrame();
    expect((device.drawCommands.at(-1) as { uniforms?: Map<string, unknown> }).uniforms?.has("u_vignette")).toBe(false);
    input.dispose();
    pass.dispose();
  });
});
