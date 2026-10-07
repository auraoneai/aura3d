import { describe, expect, it } from "vitest";
import { planPostGraph, POST_STAGE_DESCRIPTORS, validatePostPassSpace } from "@aura3d/rendering";
import type { PostPipelineOptions } from "@aura3d/rendering/contracts";

/**
 * PRD-03 Phase 2 / §6.1: the fixed stage table must hold for every option
 * combination — 2^10 enumerations of {ao, ssr, godRays, taa-aa, taa-bag,
 * dof, motionBlur, bloom, grade, autoExposure}. The assertions that matter:
 * stage order, no `rgba8` output before `OUT-output-pass`, and the space
 * rule (`display` before tonemap throws POSTPROCESS_SPACE_INVALID:<id>).
 */

const BASE: PostPipelineOptions = {
  antiAliasing: "off",
  depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1,
  toneMapping: "aces",
  dither: true
};

const ORDER = POST_STAGE_DESCRIPTORS.map((descriptor) => descriptor.id);
const rank = new Map(ORDER.map((id, index) => [id, index]));
const OUT_INDEX = rank.get("OUT-output-pass")!;

function optionsFor(mask: number): PostPipelineOptions {
  // Bit → toggle; keep values truthy (enabled()) so the stage is planned.
  return {
    ...BASE,
    ...(mask & 1 ? { ao: {} } : {}),
    ...(mask & 2 ? { ssr: {} } : {}),
    ...(mask & 4 ? { godRays: {} } : {}),
    ...(mask & 8 ? { antiAliasing: "taa" as const } : {}),
    ...(mask & 16 ? { taa: {} } : {}),
    ...(mask & 32 ? { dof: {} } : {}),
    ...(mask & 64 ? { motionBlur: {} } : {}),
    ...(mask & 128 ? { bloom: {} } : {}),
    ...(mask & 256 ? { grade: {} } : {}),
    ...(mask & 512 ? { autoExposure: {} } : {})
  };
}

describe("post-graph-order (PRD-03 §6.1)", () => {
  it("stage order + format rules hold for all 2^10 option combinations", () => {
    for (let mask = 0; mask < 1024; mask += 1) {
      const options = optionsFor(mask);
      const report = planPostGraph(options, { width: 320, height: 180 });
      const names = report.stages.map((stage) => stage.name);
      // Stages are a subsequence of the fixed table.
      for (let i = 1; i < names.length; i += 1) {
        expect(rank.get(names[i]!), `mask ${mask}: ${names[i - 1]} before ${names[i]}`).toBeGreaterThan(rank.get(names[i - 1]!)!);
      }
      // No rgba8 (display) output before OUT — the C-13 linear-HDR invariant.
      const outPos = names.indexOf("OUT-output-pass");
      expect(outPos, `mask ${mask}: OUT always planned`).toBeGreaterThanOrEqual(0);
      for (const stage of report.stages) {
        const stageRank = rank.get(stage.name)!;
        if (stageRank < OUT_INDEX) {
          expect(stage.format, `mask ${mask}: ${stage.name} is rgba8 before OUT`).not.toBe("rgba8");
        }
      }
      // OUT is the boundary: S10-composite precedes it, everything after is display.
      expect(names.indexOf("S10-composite")).toBeLessThan(outPos);
      expect(names.indexOf("S12-finalize")).toBeGreaterThan(outPos);
      // Depth prep only planned when a consumer exists.
      const wantsDepth = Boolean(
        options.ao || options.ssr || options.godRays || options.dof
          || options.motionBlur || options.taa || options.antiAliasing === "taa"
      );
      expect(names.includes("S1-depth-prep"), `mask ${mask}`).toBe(wantsDepth);
    }
  });

  it("display-space custom pass before tonemap throws POSTPROCESS_SPACE_INVALID:<id>", () => {
    expect(() =>
      validatePostPassSpace({ id: "bad.early", insertAt: "before-taa", space: "display" })
    ).toThrowError(/POSTPROCESS_SPACE_INVALID:bad\.early/);
    expect(() =>
      validatePostPassSpace({ id: "bad.mid", insertAt: "before-tonemap", space: "display" })
    ).toThrowError(/POSTPROCESS_SPACE_INVALID:bad\.mid/);
    // Valid combinations do not throw.
    expect(() =>
      validatePostPassSpace({ id: "ok.hdr", insertAt: "before-taa", space: "linear-hdr" })
    ).not.toThrow();
    expect(() =>
      validatePostPassSpace({ id: "ok.disp", insertAt: "after-tonemap", space: "display" })
    ).not.toThrow();
  });

  it("a display-space custom pass registered at a linear-hdr anchor throws in planPostGraph", () => {
    const options: PostPipelineOptions = {
      ...BASE,
      customPasses: [{
        id: "prd03.bad-space",
        owner: "prd03",
        flag: "A3D_QR_POST",
        insertAt: "after-taa",
        space: "display",
        inputs: ["color"],
        fragment: { glsl: "void main() {}" },
        gpuOnly: true
      }]
    };
    expect(() => planPostGraph(options, { width: 64, height: 64 })).toThrowError(/POSTPROCESS_SPACE_INVALID:prd03\.bad-space/);
  });
});
