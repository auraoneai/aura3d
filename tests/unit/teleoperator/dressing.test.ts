import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createAuraApp } from "@aura3d/engine";
import { DISTRICTS, PARKED, PARKED_X_EXTENT, SIGN_SLOTS, crossStreetName, districtAt, parkedLayout, signAssignments, signNodeId } from "../../../apps/showcase-teleoperator/src/dressing";
import { INTERSECTION_COUNT, buildGridDispatchScene } from "../../../apps/showcase-teleoperator/src/scene";
import { INTERSECTION_STRIDE_Z, PLAYER_X_LIMIT } from "../../../apps/showcase-teleoperator/src/rules";

describe("grid dispatch GD-19 street dressing", () => {
  it("sign text is the HUD cross street of the same district", () => {
    expect(crossStreetName(0)).toBe("Mason St");
    expect(crossStreetName(4)).toBe("Washington St");
    for (const z of [0, -159, -160, -999, -2400]) {
      const hud = DISTRICTS[districtAt(z)]![2];
      expect(hud.startsWith(`→ ${crossStreetName(districtAt(z))}`)).toBe(true);
    }
    // main.ts reads the district through the same helper as the signs
    const main = readFileSync(new URL("../../../apps/showcase-teleoperator/src/main.ts", import.meta.url), "utf8");
    expect(main).toContain("districtAt(p.z)");
    expect(main).not.toContain("const DISTRICTS");
  });

  it("every visible crossing gets its own sign node; two slots per district are enough", () => {
    for (let base = 0; base > -3000; base -= 37) {
      const zs = Array.from({ length: INTERSECTION_COUNT }, (_, i) => Math.floor(base / INTERSECTION_STRIDE_Z) * INTERSECTION_STRIDE_Z - i * INTERSECTION_STRIDE_Z);
      const signs = signAssignments(zs);
      expect(signs).toHaveLength(INTERSECTION_COUNT);
      expect(new Set(signs.map(([id]) => id)).size).toBe(INTERSECTION_COUNT);
      for (const [id, z] of signs) expect(id.startsWith(`sf-sign-${districtAt(z)}-`)).toBe(true);
    }
  });

  it("parked cars stand between the kerb and the building fronts, out of every drivable lane", () => {
    expect(PARKED_X_EXTENT[0]).toBeGreaterThan(10.8);
    expect(PARKED_X_EXTENT[0]).toBeGreaterThan(PLAYER_X_LIMIT + 1);
    expect(PARKED_X_EXTENT[1]).toBeLessThan(19.5);
    const cars = parkedLayout(0, [-100]);
    expect(cars).toHaveLength(PARKED[0]!.slots.length);
    for (const c of cars) expect(Math.abs(c.z - -100)).toBeLessThan(7);
  });

  it("mounts the dressing nodes on every sky", () => {
    for (const sky of ["golden", "noon", "fog", "night"] as const) {
      const app = createAuraApp(undefined, { scene: buildGridDispatchScene(sky), autoStart: false });
      for (const id of ["sf-catenary-wires", "sf-catenary-spans", "sf-sign-plates", ...PARKED.map((_, k) => `sf-parked-${k}`)]) expect(app.nodes.has(id)).toBe(true);
      for (let d = 0; d < DISTRICTS.length; d++) for (let s = 0; s < SIGN_SLOTS; s++) expect(app.nodes.has(signNodeId(d, s))).toBe(true);
      app.dispose?.();
    }
  });
});
