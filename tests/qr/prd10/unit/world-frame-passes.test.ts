// T0-33 regression: the prd10 contributor must never make RenderGraph.compilePlan
// throw — unconditional terrain/water passes crashed every Path S frame
// ("color written by both" with an env background; "reads, but no pass writes"
// without). Covers no-world, terrain-only and terrain+water at low/high tiers.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { RenderGraph, type RenderPass } from "../../../../packages/rendering/src";
import { ENVIRONMENT_BACKGROUND_COLOR_RESOURCE } from "../../../../packages/rendering/src";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts";
import type { FrameContributorContext } from "../../../../packages/rendering/src/contracts";
import { registerWorldFramePasses } from "../../../../packages/engine/src/production-runtime/world/WorldFramePasses";
import { frameContributors } from "../../../../packages/rendering/src/contracts/frameGraph";
import { worldTerrain } from "../../../../packages/engine/src/agent-api/world/terrain";
import { worldWater, clearWaterRecords } from "../../../../packages/engine/src/agent-api/world/water";

const flagsOn = resolveQrFlags({ options: ["world"], env: {} });

function ctx(tier: "low" | "high"): FrameContributorContext {
  return {
    device: null,
    width: 1280,
    height: 720,
    frameIndex: 0,
    timeSeconds: 0,
    camera: null,
    source: null,
    items: [],
    tier: QUALITY_TIERS[tier] as FrameContributorContext["tier"],
    flags: flagsOn,
    sceneDepth: { texture: null, linearize: { near: 0.1, far: 100, orthographic: false }, available: false },
    blackboard: new Map()
  } as unknown as FrameContributorContext;
}

const writer = (name: string, reads: string[], writes: string[]): RenderPass => ({
  name,
  reads,
  writes,
  execute() {}
});

let disposeContributor: (() => void) | null = null;

function contributor(): { passes?: (phase: string, c: FrameContributorContext) => readonly RenderPass[] } {
  const con = frameContributors(flagsOn).find((c) => c.id === "prd10.world");
  if (!con) throw new Error("prd10.world contributor not registered");
  return con;
}

function graphFor(opts: { envBackground: boolean; tier: "low" | "high" }): RenderGraph {
  const graph = new RenderGraph();
  if (opts.envBackground) graph.addPass(writer("environment-background", [], [ENVIRONMENT_BACKGROUND_COLOR_RESOURCE]));
  const c = ctx(opts.tier);
  const con = contributor();
  if (opts.envBackground) {
    for (const p of con.passes!("background", c)) graph.addPass(p);
  }
  // prd01.opaque produces the scene color and depth resources the world
  // passes chain on (same writes the real ForwardPass declares on Path S).
  graph.addPass(
    writer(
      "prd01.opaque",
      opts.envBackground ? [ENVIRONMENT_BACKGROUND_COLOR_RESOURCE] : [],
      ["aura.scene.color.opaque", "aura.scene.depth", "aura.scene.color"]
    )
  );
  for (const p of con.passes!("after-opaque", c)) graph.addPass(p);
  for (const p of con.passes!("transparent", c)) graph.addPass(p);
  graph.addPass(writer("prd01.transparent", ["aura.scene.color"], ["aura.present"]));
  return graph;
}

describe("T0-33 world frame passes", () => {
  beforeEach(() => {
    disposeContributor = registerWorldFramePasses();
  });

  it("registers and compiles with no world nodes (env background on)", () => {
    expect(() => graphFor({ envBackground: true, tier: "high" }).compilePlan()).not.toThrow();
  });

  it("compiles terrain-only and terrain+water at low and high tiers", () => {
    worldTerrain({
      id: "t-t0-33",
      size: [8, 8],
      height: { kind: "array", columns: 2, rows: 2, heights: [0, 0.1, 0.1, 0.2] },
      layers: [{ name: "grass", albedo: [0.2, 0.5, 0.2, 1] }],
      collider: false
    });
    expect(() => graphFor({ envBackground: true, tier: "low" }).compilePlan()).not.toThrow();
    expect(() => graphFor({ envBackground: true, tier: "high" }).compilePlan()).not.toThrow();
    worldWater({ id: "w-t0-33", shape: { kind: "circle", center: [0, 0], radius: 5 }, waves: [{ wavelength: 2, steepness: 0.1, direction: [1, 0] }] });
    expect(() => graphFor({ envBackground: true, tier: "low" }).compilePlan()).not.toThrow();
    expect(() => graphFor({ envBackground: true, tier: "high" }).compilePlan()).not.toThrow();
    const plan = graphFor({ envBackground: true, tier: "high" }).compilePlan();
    const names = plan.passes.map((p) => p.name);
    expect(names).toContain("prd10.terrain");
    expect(names).toContain("prd10.water");
    expect(names.indexOf("prd10.terrain")).toBeLessThan(names.indexOf("prd10.water"));
    expect(names.indexOf("prd01.opaque")).toBeLessThan(names.indexOf("prd10.water"));
  });

  it("emits no water pass and no unproduced reads when water is absent", () => {
    const plan = graphFor({ envBackground: true, tier: "high" }).compilePlan();
    expect(plan.passes.map((p) => p.name)).not.toContain("prd10.water");
  });

  it("FIX-P0-tier: low/medium tiers emit no planar-reflection or scene-copy passes", () => {
    worldWater({ id: "w-t0-33-tier", shape: { kind: "circle", center: [0, 0], radius: 5 }, waves: "calm" });
    for (const tier of ["low", "medium"] as const) {
      const plan = graphFor({ envBackground: true, tier }).compilePlan();
      const names = plan.passes.map((p) => p.name);
      // planar reflection resolves to ibl below high tier — never emitted
      expect(names.some((n) => n.includes("reflection"))).toBe(false);
      // water surface still draws — only the expensive extras are gated
      expect(names).toContain("prd10.water");
    }
    // low additionally skips the scene copies (refraction off below medium)
    const lowNames = graphFor({ envBackground: true, tier: "low" }).compilePlan().passes.map((p) => p.name);
    expect(lowNames).not.toContain("prd10.sceneCopy");
  });

  afterEach(() => {
    clearWaterRecords();
    disposeContributor?.();
    disposeContributor = null;
  });
});
