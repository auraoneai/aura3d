import { describe, expect, it } from "vitest";
import direction from "../../../examples/drift-and-deliver-port/art/direction";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";
import { PHASES } from "../../../examples/drift-and-deliver-port/phases";
import { SODIUM_POOL } from "../../../examples/drift-and-deliver-port/lamps";

// GU47 WP-28 GC-H3: the art direction audited against a literal mirror of the shift look's authored scene
// (look.ts buildLook with look "shift" plus main.ts buildScene). Triangle counts are the GLBs' index counts / 3.
const TRIANGLES: Record<string, number> = {
  courier: 37470, sedan: 6920, hatch: 7065, van: 7055, truck: 8589, lamp: 5507, signal: 3941, tree: 1844, palm: 2695,
  shelter: 5141, hydrant: 4150, clocktower: 19196, lighthouse: 19987, watertank: 5838
};

const snapshot: ArtDirectionSnapshot = {
  lights: [
    { type: "directional", shadow: true, intensity: PHASES[0]!.key.intensity },
    ...Array.from({ length: SODIUM_POOL }, () => ({ type: "point", shadow: false, intensity: 0 })),
    { type: "spot", shadow: false, intensity: 0 }
  ],
  hasAmbient: false,
  environment: { kind: "hdri", background: false },
  models: Object.entries(TRIANGLES).map(([assetKey, triangles]) => ({ assetKey, triangles, textures: 2, unlit: false, overridesTextures: false })),
  materials: [
    // lit windows and shopfronts are the town's practicals; the beacon, pad and pickups are light sources by design
    { node: "city-*-facade", emissiveIntensity: PHASES[2]!.windows, practical: true },
    { node: "city-*-shop", emissiveIntensity: 0.7, practical: true },
    { node: "dropoff-beacon", emissiveIntensity: PHASES[2]!.beacon, lightSource: true },
    { node: "dropoff-pad", emissiveIntensity: 1.4, lightSource: true },
    { node: "pickups", emissiveIntensity: 1.2, lightSource: true },
    { node: "car-tail", emissiveIntensity: 1.6, practical: true },
    { node: "road-tiles", emissiveIntensity: 0 }
  ],
  drawCalls: 130
};

describe("gridlock courier art direction (GU47 WP-28)", () => {
  it("passes the audit and writes art/direction.audit.json", () => {
    const violations = auditArtDirection(direction, snapshot, { drawCallsBudget: 130 });
    writeArtDirectionAudit("examples/drift-and-deliver-port/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });

  it("reserves courier teal and names the delivery beacon as the signature", () => {
    expect(direction.palette.reservedObjective).toBe("#22c3c9");
    expect(direction.palette.primary).toEqual(["#2b2f36", "#d9765f", "#9fd8c4", "#efe3cf"]);
    expect(direction.signatureEffect).toBe("delivery-beacon");
    expect(direction.lighting.environment.hdri).toBe("venice_sunset");
    expect(snapshot.lights.length - 1).toBeLessThanOrEqual(direction.lighting.practicals);
  });
});
