import { describe, expect, it } from "vitest";
import direction from "../../../examples/drift-and-deliver-port/art/direction";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";
import { PHASES } from "../../../examples/drift-and-deliver-port/phases";
import { SODIUM_POOL } from "../../../examples/drift-and-deliver-port/lamps";

// WP-22 procedural overhaul: zero static single-mesh Meshy GLBs mounted in the shift scene (`models: []`).
const snapshot: ArtDirectionSnapshot = {
  lights: [
    { type: "directional", shadow: true, intensity: PHASES[0]!.key.intensity },
    ...Array.from({ length: SODIUM_POOL }, () => ({ type: "point", shadow: false, intensity: 0 })),
    { type: "spot", shadow: false, intensity: 0 }
  ],
  hasAmbient: false,
  environment: { kind: "hdri", background: false },
  models: [],
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
