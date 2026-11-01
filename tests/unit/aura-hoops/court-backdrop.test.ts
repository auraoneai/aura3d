import { describe, expect, it } from "vitest";
import { renderer, scene } from "../../../packages/engine/src";
import { ssrRoughnessGate } from "../../../packages/engine/src/agent-api/rendererDiagnostics";
import { COURT_FLOOR_FINISH, courtBackdropLayout, courtBackdropNodes, courtRig, courtReflectionNodes } from "../../../apps/showcase-aura-hoops-3d/src/courtRigs";

describe("aura-hoops GU47 phase 4 backdrop and floor finish", () => {
  it("rings Rucker and Athens with walk-ups well outside the court and its stands", () => {
    for (const id of ["rucker", "athens"] as const) {
      const { blocks, windows } = courtBackdropLayout(id);
      expect(blocks.length).toBeGreaterThan(16);
      expect(blocks.length).toBeLessThan(1500);
      expect(windows.length).toBeGreaterThan(60);
      expect(windows.length).toBeLessThan(1200);
      for (const b of blocks.filter((x) => x.scale[1] > 1)) expect(Math.hypot(b.position[0], b.position[2] - 4)).toBeGreaterThan(72);
      for (const w of windows) expect(Math.hypot(w.position[0], w.position[2] - 4)).toBeGreaterThan(70);
      expect(courtBackdropNodes(courtRig(id))).toHaveLength(id === "rucker" ? 3 : 2);
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

  it("keeps the S3 roughness gate fully open (phase 7: no SSR_ROUGHNESS_GATED)", () => {
    for (const id of ["manila", "shanghai", "orbit"] as const) {
      const [node] = courtReflectionNodes(courtRig(id));
      const built = (node as unknown as { readonly value: { readonly roughness?: number } }).value;
      expect(built.roughness).toBe(0.3);
      expect(ssrRoughnessGate(built.roughness)).toBe(1);
      const report = renderer.diagnostics(scene().add(node));
      expect(report.warnings.some((w) => w.startsWith("SSR_ROUGHNESS_GATED"))).toBe(false);
    }
  });
});
