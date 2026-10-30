/**
 * GU47 WP-34 run-2 rows (DG-S2 horizon rings, and the rows added after it). Pure checks on the meshes and the scene the
 * inked look builds; pixels are phase 2 (E-I capture).
 */
import { describe, expect, it } from "vitest";
import { validatePostEffectNode } from "../../../packages/engine/src/agent-api/postBridge";
import { FAR_DUNE_RINGS, farDuneRings, farDunes } from "../../../examples/silt-and-signal-port/architecture";
import { GOD_RAY_DENSITY, buildWorld } from "../../../examples/silt-and-signal-port/world";

type Node = Record<string, any>;
const nodes = (chapter: number, options: Parameters<typeof buildWorld>[1] = {}): Node[] =>
  (buildWorld(chapter, options).scene as unknown as { toJSON(): { nodes: Node[] } }).toJSON().nodes;

describe("GU47 WP-34 DG-S2 horizon rings", () => {
  const haze = [0.85, 0.72, 0.58] as const;

  it("today's single ring is unchanged when no shape is passed", () => {
    expect(farDunes(0, -600, 1500, 2150, haze, {})).toEqual(farDunes(0, -600, 1500, 2150, haze));
  });

  it("three rings between 1500 and 2150 m, each taller and hazier than the one in front, merged into one mesh", () => {
    expect(FAR_DUNE_RINGS.length).toBe(3);
    expect(FAR_DUNE_RINGS[0]!.inner).toBe(1500);
    expect(FAR_DUNE_RINGS[2]!.outer).toBeLessThanOrEqual(2150);
    const per = FAR_DUNE_RINGS.map((r) => farDunes(0, 0, r.inner, r.outer, haze, r.shape));
    const peak = per.map((m) => Math.max(...m.positions.filter((_, i) => i % 3 === 1)));
    expect(peak[1]!).toBeGreaterThan(peak[0]!);
    expect(peak[2]!).toBeGreaterThan(peak[1]!);
    // each ring sits closer to the haze colour than the one in front: three distinct plateaus toward the fog
    const off = per.map((m) => { let s = 0, n = 0; for (let i = 0; i < m.colors.length; i += 4) { s += Math.hypot(m.colors[i]! - haze[0], m.colors[i + 1]! - haze[1], m.colors[i + 2]! - haze[2]); n++; } return s / n; });
    expect(off[1]!).toBeLessThan(off[0]! * 0.9);
    expect(off[2]!).toBeLessThan(off[1]! * 0.9);
    const merged = farDuneRings(0, 0, haze);
    expect(merged.positions.length).toBe(per.reduce((s, m) => s + m.positions.length, 0));
    expect(Math.max(...merged.indices)).toBe(merged.positions.length / 3 - 1);
  });

  it("the inked scene draws the rings as one node; ?look=original keeps today's ring", () => {
    const inked = nodes(0).filter((n) => n.name === "far-dunes");
    const original = nodes(0, { look: "original" }).filter((n) => n.name === "far-dunes");
    expect(inked.length).toBe(1);
    expect(original.length).toBe(1);
  });
});

describe("GU47 WP-34 DG-S4 god rays and DG-L5 contact shadows", () => {
  it("god rays only in ch0 and ch2, never on Low or in ?look=original", () => {
    const rays = (c: number, o: Parameters<typeof buildWorld>[1] = {}) => nodes(c, o).filter((n) => n.effect === "volumetric-fog");
    for (let c = 0; c < 7; c++) expect(rays(c).length, `ch${c}`).toBe(c === 0 || c === 2 ? 1 : 0);
    expect(rays(0)[0]!.godRayDensity).toBe(GOD_RAY_DENSITY);
    expect(validatePostEffectNode(rays(0)[0] as never) ?? []).toEqual([]);
    expect(rays(0, { low: true }).length).toBe(0);
    expect(rays(0, { look: "original" }).length).toBe(0);
  });

  it("contact shadows in every inked chapter except Low; none in ?look=original", () => {
    const cs = (c: number, o: Parameters<typeof buildWorld>[1] = {}) => nodes(c, o).filter((n) => n.effect === "contact-shadows").length;
    for (let c = 0; c < 7; c++) expect(cs(c)).toBe(1);
    expect(cs(3, { low: true })).toBe(0);
    expect(cs(3, { look: "original" })).toBe(0);
  });
});
