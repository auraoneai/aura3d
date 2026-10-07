import { afterEach, describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import {
  webgpuColorGradeFragment,
  webgpuFxaaFragment,
  normalizeWebGPUColorGradeOptions,
  webgpuSoftKneeWeight,
} from "../../../../packages/rendering/src/webgpu/WebGPUPostShaders";

const POST_ON = resolveQrFlags({ options: { A3D_QR_POST: true } });
const FLAGS_OFF = resolveQrFlags({});

afterEach(() => setRendererQrFlags(FLAGS_OFF));

describe("PRD-03 Phase 7 — WebGPU post-program gate (§8.18, Q-11-2)", () => {
  it("flag-off emits the J2 WGSL byte-for-byte (exp2 exposure, 2-tap FXAA)", () => {
    setRendererQrFlags(FLAGS_OFF);
    const grade = webgpuColorGradeFragment();
    expect(grade).toContain("color = color * exp2(u_grade.exposure);");
    expect(webgpuFxaaFragment()).toContain("fs_fxaa");
    expect(webgpuSoftKneeWeight(0.5, 0.4, 0)).toBe(1);
    expect(webgpuSoftKneeWeight(0.3, 0.4, 0)).toBe(0);
    expect(normalizeWebGPUColorGradeOptions({}).exposure).toBe(0);
  });

  it("flag-on exposure is a linear multiplier (§6.4, same as toneMappingExposure)", () => {
    setRendererQrFlags(POST_ON);
    expect(webgpuColorGradeFragment()).toContain("color = color * u_grade.exposure;");
    expect(webgpuColorGradeFragment()).not.toContain("exp2");
    // Linear identity is 1.0, not the flag-off 0.0 stops.
    expect(normalizeWebGPUColorGradeOptions({}).exposure).toBe(1);
    expect(normalizeWebGPUColorGradeOptions({ exposure: 2.5 }).exposure).toBe(2.5);
  });

  it("flag-on deletes the 2-tap FXAA and uncapped soft-knee mirrors (r185 twins replace them)", () => {
    setRendererQrFlags(POST_ON);
    expect(() => webgpuFxaaFragment()).toThrow(/POST_WGSL_LEGACY_REMOVED/);
    expect(() => webgpuSoftKneeWeight(0.5, 0.4, 0)).toThrow(/POST_WGSL_LEGACY_REMOVED/);
    expect(() => webgpuFxaaFragment()).toThrow(/webgpuFxaaFragment/);
    expect(() => webgpuSoftKneeWeight(0.5, 0.4, 0)).toThrow(/webgpuSoftKneeWeight/);
  });
});
