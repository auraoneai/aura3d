/**
 * GU47 WP-34 DG-W2: sand drifts, aqueduct water stains and lamp soot, merged into one transparent mesh. Pure checks on
 * the plan and the mesh; plaza stddev is phase 2 (E-I capture).
 */
import { describe, expect, it } from "vitest";
import { decals } from "../../../packages/engine/src/agent-api/Decals";
import { DECAL_CAPS, DECAL_GROUND_LIFT, DECAL_SEGMENTS, decalMesh, decalPlan } from "../../../examples/silt-and-signal-port/decals";
import { PLAZA, createTerrain } from "../../../examples/silt-and-signal-port/terrain";
import { buildWorld } from "../../../examples/silt-and-signal-port/world";

type Node = Record<string, any>;
const names = (chapter: number, options: Parameters<typeof buildWorld>[1] = {}): string[] =>
  (buildWorld(chapter, options).scene as unknown as { toJSON(): { nodes: Node[] } }).toJSON().nodes.map((n) => String(n.name));

const planFor = (chapter: number, options: Parameters<typeof decalPlan>[4] = {}) => {
  const terrain = createTerrain(chapter);
  const props = terrain.props();
  return { terrain, plan: decalPlan(chapter, terrain, props.walls, props.lamps, options) };
};

describe("GU47 WP-34 DG-W2 decals", () => {
  it("stays inside the engine's per-route decal budget and the per-kind caps in every chapter", () => {
    expect(DECAL_CAPS.drift + DECAL_CAPS.stain + DECAL_CAPS.soot).toBeLessThanOrEqual(decals.maxDecals);
    for (let c = 0; c < 7; c++) {
      const { plan } = planFor(c);
      expect(plan.length).toBeGreaterThan(0);
      expect(plan.length).toBeLessThanOrEqual(32);
      for (const kind of ["drift", "stain", "soot"] as const) expect(plan.filter((d) => d.kind === kind).length).toBeLessThanOrEqual(DECAL_CAPS[kind]);
    }
  });

  it("is deterministic per chapter and differs between chapters", () => {
    expect(planFor(2).plan).toEqual(planFor(2).plan);
    expect(planFor(2).plan).not.toEqual(planFor(3).plan);
  });

  it("dresses the plaza in the original-terrain chapters", () => {
    for (const c of [0, 6]) {
      const onPlaza = planFor(c).plan.filter((d) => d.kind === "drift" && d.centre[0] > PLAZA.x0 && d.centre[0] < PLAZA.x1 && d.centre[2] > PLAZA.z0 && d.centre[2] < PLAZA.z1);
      expect(onPlaza.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("ground decals float above the terrain and every face points along its decal normal", () => {
    for (const c of [0, 4]) {
      const { terrain, plan } = planFor(c, { wet: c === 4 });
      const m = decalMesh(plan, terrain, "#e9d2a8");
      expect(m.positions.length / 3).toBe(plan.length * (1 + 2 * DECAL_SEGMENTS));
      expect(m.indices.length / 3).toBe(plan.length * 3 * DECAL_SEGMENTS);
      expect(m.colors.length).toBe(m.positions.length);
      const per = 1 + 2 * DECAL_SEGMENTS;
      plan.forEach((d, k) => {
        if (d.normal[1] !== 0) {
          const x = m.positions[k * per * 3]!, y = m.positions[k * per * 3 + 1]!, z = m.positions[k * per * 3 + 2]!;
          expect(y).toBeCloseTo(Math.max(0, terrain.heightAt(x, z)) + DECAL_GROUND_LIFT, 5);
        }
        // first fan triangle of this decal
        const t = k * 3 * DECAL_SEGMENTS * 3;
        const p = (i: number) => [m.positions[m.indices[t + i]! * 3]!, m.positions[m.indices[t + i]! * 3 + 1]!, m.positions[m.indices[t + i]! * 3 + 2]!];
        const [a, b, cc] = [p(0), p(1), p(2)];
        const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], v = [cc[0]! - a[0]!, cc[1]! - a[1]!, cc[2]! - a[2]!];
        const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
        expect(n[0]! * d.normal[0] + n[1]! * d.normal[1] + n[2]! * d.normal[2]).toBeGreaterThan(0);
      });
    }
  });

  it("drifts are dark wet sand in the storm", () => {
    const dry = planFor(4).plan.find((d) => d.kind === "drift")!, wet = planFor(4, { wet: true }).plan.find((d) => d.kind === "drift")!;
    expect(wet.color).not.toBe(dry.color);
  });

  it("adds one node in the inked look, none on Low or in ?look=original, and nothing changes with reduced motion", () => {
    expect(names(0).filter((n) => n === "silt-decals")).toHaveLength(1);
    expect(names(0, { low: true })).not.toContain("silt-decals");
    expect(names(0, { look: "original" })).not.toContain("silt-decals");
    expect(planFor(0).plan).toEqual(planFor(0).plan);
    expect(names(0, { reducedMotion: true }).filter((n) => n === "silt-decals")).toHaveLength(1);
  });
});
