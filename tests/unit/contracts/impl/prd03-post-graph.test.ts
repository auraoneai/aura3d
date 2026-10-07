import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import {
  postPipelineSlot,
  resolvePostGraph,
  planPostGraph,
  PostGraph,
  POST_STAGE_DESCRIPTORS
} from "@aura3d/rendering";
import { registerPostPass } from "@aura3d/rendering/contracts";
import type { PostPipelineOptions } from "@aura3d/rendering/contracts";

const flagsOn = () => resolveQrFlags({ options: ["post"] });
const flagsOff = () => resolveQrFlags({ options: [] });

const baseOptions: PostPipelineOptions = {
  antiAliasing: "fxaa",
  depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1,
  toneMapping: "aces",
  dither: true
};

describe("C-13 postPipelineSlot (impl: prd03)", () => {
  it("slot identity is frozen (C-13, prd03, A3D_QR_POST)", () => {
    expect(postPipelineSlot.id).toBe("C-13");
    expect(postPipelineSlot.owner).toBe("prd03");
    expect(postPipelineSlot.flag).toBe("A3D_QR_POST");
  });

  it("lane barrel provided the real; flag-off still resolves the legacy stub", () => {
    expect(postPipelineSlot.provided).toBe(true);
    expect(resolvePostGraph(flagsOff()).kind).toBe("legacy");
    expect(resolvePostGraph(flagsOn()).kind).toBe("v2");
  });

  it("stub plan reports registered custom passes as skipped", () => {
    const release = registerPostPass({
      id: "prd03.test-custom",
      owner: "prd03",
      flag: "A3D_QR_POST",
      insertAt: "after-tonemap",
      space: "display",
      inputs: ["color"],
      fragment: { glsl: "void main() {}" },
      gpuOnly: true
    });
    const plan = postPipelineSlot.stub.plan(baseOptions, { width: 64, height: 64 });
    expect(plan.stages).toEqual([]);
    expect(plan.skipped.some((s) => s.name === "prd03.test-custom")).toBe(true);
    release();
  });

  it("real plan orders stages per the §6.1 graph and defers unimplemented stages with a phase reason", () => {
    const options: PostPipelineOptions = {
      ...baseOptions,
      ao: { radius: 1 },
      ssr: {},
      godRays: {},
      dof: {},
      motionBlur: {},
      taa: {},
      bloom: {},
      grade: {},
      lut: {}
    };
    const report = planPostGraph(options, { width: 128, height: 72 });
    const names = [...report.stages.map((s) => s.name), ...report.skipped.map((s) => s.name)];
    // §6.1 order: depth prep → GTAO → SSR → god rays → TAA → DOF → MB →
    // auto-exposure → bloom → composite → OUT → display grade → post-AA → finalize.
    expect(names.indexOf("S1-depth-prep")).toBeLessThan(names.indexOf("S2-gtao"));
    expect(names.indexOf("S2-gtao")).toBeLessThan(names.indexOf("S3-ssr"));
    expect(names.indexOf("S3-ssr")).toBeLessThan(names.indexOf("S5-taa"));
    expect(names.indexOf("S5-taa")).toBeLessThan(names.indexOf("S9-bloom"));
    expect(names.indexOf("S9-bloom")).toBeLessThan(names.indexOf("S10-composite"));
    expect(names.indexOf("S10-composite")).toBeLessThan(names.indexOf("OUT-output-pass"));
    expect(names.indexOf("OUT-output-pass")).toBeLessThan(names.indexOf("S10b-display-grade"));
    expect(names.indexOf("S10b-display-grade")).toBeLessThan(names.indexOf("S11-post-aa"));
    expect(names.indexOf("S11-post-aa")).toBeLessThan(names.indexOf("S12-finalize"));
    expect(report.skipped.every((s) => s.reason.startsWith("post-v2-deferred") || s.reason === "disabled")).toBe(true);
  });

  it("no depth consumer → S1 is not planned", () => {
    const report = planPostGraph({ ...baseOptions, bloom: {} }, { width: 64, height: 64 });
    const names = report.stages.map((s) => s.name);
    expect(names).not.toContain("S1-depth-prep");
    expect(names).not.toContain("S2-gtao");
  });

  it("real execute() fails closed until the GPU chain lands", () => {
    const graph = new PostGraph();
    expect(() => graph.execute?.(baseOptions, { width: 64, height: 64 })).toThrowError(/POST_GRAPH_V2_PENDING/);
  });

  it("duplicate custom pass id throws REGISTRY_DUPLICATE", () => {
    const pass = {
      id: "prd03.dup",
      owner: "prd03" as const,
      flag: "A3D_QR_POST" as const,
      insertAt: "after-tonemap" as const,
      space: "display" as const,
      inputs: ["color" as const],
      fragment: { glsl: "void main() {}" },
      gpuOnly: true as const
    };
    const release = registerPostPass(pass);
    expect(() => registerPostPass(pass)).toThrowError(/REGISTRY_DUPLICATE/);
    release();
  });
});
