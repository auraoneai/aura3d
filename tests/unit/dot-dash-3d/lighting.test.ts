import { describe, expect, it } from "vitest";
import { buildScene } from "../../../apps/showcase-dot-dash-3d/src/game/world";

type LightNode = { kind: string; light?: string; intensity?: number };

/** The scene's own top-level lights (the look group is skipped: its fill yields to the authored ambient). */
function authoredLights(): Record<string, LightNode> {
  const { nodes } = buildScene() as { nodes: LightNode[] };
  return Object.fromEntries(nodes.filter((n) => n.kind === "light" && n.light).map((n) => [n.light!, n]));
}

describe("dot-dash-3d lighting (audit LIGHT-03)", () => {
  it("keeps the hemisphere at 0.5 so the per-normal hemisphere does not lift the board above the audited 4.5.0 luma", () => {
    const l = authoredLights();
    expect(Object.keys(l).sort()).toEqual(["ambient", "directional", "hemisphere"]);
    expect(l.hemisphere!.intensity).toBe(0.5);
    expect(l.ambient!.intensity).toBe(0.92);
    expect(l.directional!.intensity).toBe(1.25);
  });
});
