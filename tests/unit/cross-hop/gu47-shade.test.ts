// GU47 phase 4 (4.7.2): sun-cast shadow decals, glossy vivid surfaces and the Meshy coin (presentation only).
import { describe, expect, it } from "vitest";
import { ORIGINAL_SUN, SHADOW_REACH_MAX, VIVID_LOOKS, sunShadowFootprint } from "../../../apps/showcase-cross-hop/src/game/look";
import { buildScene, setLookMode } from "../../../apps/showcase-cross-hop/src/game/core";

type Node = { kind?: string; name?: string; asset?: unknown; children?: Node[] };
const flat = (nodes: Node[]): Node[] => nodes.flatMap((n) => [n, ...flat(n.children ?? [])]);
const names = (mode: "vivid" | "original" | "diorama"): string[] => {
  setLookMode(mode);
  return flat((buildScene() as { nodes: Node[] }).nodes).map((n) => n.name ?? "");
};

describe("cross-hop shadow decals (GU47 phase 4)", () => {
  it("falls away from the sun and grows with caster height", () => {
    const sun = VIVID_LOOKS[1]!.sun; // azimuth -62: sun on the camera's left, shadows fall right
    const f = sunShadowFootprint(0, 0, 2, 1, 1, sun);
    expect(f.x).toBeGreaterThan(0);
    expect(f.len).toBeGreaterThan(2);
    expect(f.dep).toBeGreaterThan(1);
    const tall = sunShadowFootprint(0, 0, 2, 1, 2, sun);
    expect(tall.len).toBeGreaterThan(f.len);
  });

  it("caps the reach for low suns and keeps a zero-height caster at its footprint", () => {
    const low = sunShadowFootprint(0, 0, 1, 1, 1, { elevationDeg: 6, azimuthDeg: 90 });
    expect(Math.hypot(low.x, low.z)).toBeLessThanOrEqual(SHADOW_REACH_MAX * 0.5 + 1e-9);
    expect(sunShadowFootprint(3, 4, 1, 1, 0, ORIGINAL_SUN)).toEqual({ x: 3, z: 4, len: 1, dep: 1 });
  });

  it("mounts the decal pool in the vivid and 4.6 looks, not in the diorama", () => {
    expect(names("vivid")).toContain("sun-shade");
    expect(names("original")).toContain("sun-shade");
    expect(names("diorama")).not.toContain("sun-shade");
  });

  it("gives the vivid look glossy water and toy rafts", () => {
    const v = names("vivid");
    expect(v).toContain("v-water");
    expect(v).toContain("m-rafts");
    expect(names("original")).not.toContain("v-water");
  });
});

describe("cross-hop phase-4 dressing per view", () => {
  it("dresses the vivid look and the panel-won 4.6 views only", async () => {
    const { p4DressFor, P4_ORIGINAL_THEMES } = await import("../../../apps/showcase-cross-hop/src/game/look");
    expect(p4DressFor("vivid", 1)).toBe(true);
    expect(p4DressFor("diorama", 5)).toBe(false);
    for (let t = 0; t < 6; t++) expect(p4DressFor("original", t)).toBe(P4_ORIGINAL_THEMES.includes(t));
    expect(p4DressFor("original", null)).toBe(false);
  });
});

describe("cross-hop coin per view", () => {
  it("draws the Meshy coin only where the phase-4 dressing won the panel", async () => {
    const core = await import("../../../apps/showcase-cross-hop/src/game/core");
    type N = { name?: string; kind?: string; children?: N[] };
    const all = (ns: N[]): N[] => ns.flatMap((n) => [n, ...all(n.children ?? [])]);
    const coin = (dress: boolean) => {
      core.setLookMode("original"); core.setP4Dress(dress);
      return all((core.buildScene() as { nodes: N[] }).nodes).find((n) => n.name === "m-coins") as Record<string, unknown> | undefined;
    };
    expect(JSON.stringify(coin(true))).toContain("xhopCoin");
    expect(JSON.stringify(coin(false))).not.toContain("xhopCoin");
    core.setP4Dress(true);
  });
});
