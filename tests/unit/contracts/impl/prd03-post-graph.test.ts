import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import {
  postPipelineSlot,
  resolvePostGraph,
  planPostGraph,
  PostGraph
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

  it("real plan orders stages per the v2 graph and withholds them with a named reason", () => {
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
    const names = report.skipped.map((s) => s.name);
    // Depth consumer present → linearize planned before its consumers.
    expect(names.indexOf("S1-linearize-depth")).toBeLessThan(names.indexOf("S2-gtao"));
    expect(names.indexOf("S2-gtao")).toBeLessThan(names.indexOf("S4-ssr"));
    expect(names.indexOf("S8-taa")).toBeLessThan(names.indexOf("S9-bloom"));
    expect(names.indexOf("S10a-output")).toBeLessThan(names.indexOf("S10b-grade"));
    expect(names.indexOf("S11-aa-fxaa")).toBeLessThan(names.indexOf("S12-dither"));
    expect(report.skipped.every((s) => s.reason.includes("post-graph-v2-pending"))).toBe(true);
  });

  it("no depth consumer → S1 is withheld with 'no depth consumer'", () => {
    const report = planPostGraph({ ...baseOptions, bloom: {} }, { width: 64, height: 64 });
    expect(report.skipped.some((s) => s.name === "S1-linearize-depth" && s.reason === "no depth consumer")).toBe(true);
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
