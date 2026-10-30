import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "@aura3d/engine";
import { GRID_DISPATCH_FLAGS } from "../../../apps/showcase-teleoperator/src/scene";

describe("grid dispatch look: GD-00 record-form flags", () => {
  it("keeps A3D_QR_GAME and names the sky and fog node flags explicitly", () => {
    expect(GRID_DISPATCH_FLAGS).toEqual({ A3D_QR_GAME: true, A3D_QR_VFX_SKY: true, A3D_QR_VFX_FOG: true });
  });

  it("resolves to exactly the flag set of the old [\"game\"] list (same draws before the new nodes exist)", () => {
    const before = resolveQrFlags({ options: ["game"] });
    const after = resolveQrFlags({ options: GRID_DISPATCH_FLAGS });
    expect({ ...after.values }).toEqual({ ...before.values });
    for (const name of ["A3D_QR_GAME", "A3D_QR_VFX", "A3D_QR_VFX_SKY", "A3D_QR_VFX_FOG", "A3D_QR_LIGHTING", "A3D_QR_POST"] as const) {
      expect(after.on(name), name).toBe(before.on(name));
    }
    expect(after.on("A3D_QR_VFX_SKY")).toBe(true);
    expect(after.on("A3D_QR_VFX_FOG")).toBe(true);
  });
});
