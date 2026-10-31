import { describe, expect, it } from "vitest";
import { COURT_FLOOR_FINISH, courtBackdropLayout, courtBackdropNodes, courtRig, courtReflectionNodes } from "../../../apps/showcase-aura-hoops-3d/src/courtRigs";

describe("aura-hoops GU47 phase 4 backdrop and floor finish", () => {
  it("rings Rucker and Athens with walk-ups well outside the court and its stands", () => {
    for (const id of ["rucker", "athens"] as const) {
      const { blocks, windows } = courtBackdropLayout(id);
      expect(blocks.length).toBeGreaterThan(16);
      expect(blocks.length).toBeLessThan(60);
      expect(windows.length).toBeGreaterThan(60);
      expect(windows.length).toBeLessThan(1200);
      for (const b of blocks) expect(Math.hypot(b.position[0], b.position[2] - 4)).toBeGreaterThan(72);
      for (const w of windows) expect(Math.hypot(w.position[0], w.position[2] - 4)).toBeGreaterThan(70);
      expect(courtBackdropNodes(courtRig(id))).toHaveLength(2);
    }
    expect(courtBackdropNodes(courtRig("venice"))).toHaveLength(0);
    expect(courtBackdropLayout("rucker")).toEqual(courtBackdropLayout("rucker"));
  });

  it("adds floor reflections only where the floor is glossy enough", () => {
    for (const id of ["rucker", "venice", "athens", "manila", "shanghai", "orbit"] as const) {
      const ssr = courtReflectionNodes(courtRig(id));
      expect(ssr.length).toBe(COURT_FLOOR_FINISH[id].ssr > 0 ? 1 : 0);
      if (ssr.length) expect(COURT_FLOOR_FINISH[id].roughness).toBeLessThan(0.5);
    }
  });
});
