// tests/qr/prd14/gallery-shift/thief-facing.test.ts — §14.1 P0 (T1.12): the
// thief rig never turned and the thief slid sideways through every corridor.
// syncCharacterVisuals now blends a facing yaw toward the move direction
// (atan2(moveX, moveZ), 0.08 s halflife) and applies it to the thief node and
// the face-detail nodes so the face leads.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const legacyMain = readFileSync(
  fileURLToPath(new URL("../../../../apps/showcase-gallery-shift/src/legacy/main.ts", import.meta.url)),
  "utf8"
);

describe("gallery-shift thief facing (T1.12)", () => {
  it("tracks a facing yaw blended toward the move direction", () => {
    expect(legacyMain).toContain("let thiefFacingYaw");
    expect(legacyMain).toContain("Math.atan2(snap.moveX, snap.moveZ)");
    // halflife blend, not a snap assignment
    expect(legacyMain).toMatch(/thiefFacingYaw \+= shortest \* blend/);
  });

  it("applies the facing to the thief node and the visor/identity details", () => {
    // thief + infiltrator identity detail + infiltrator visor signal all yaw
    const rotations = legacyMain.match(/setRotation\(0, thiefFacingYaw, 0\)/g) ?? [];
    expect(rotations.length).toBeGreaterThanOrEqual(3);
    // visor offsets orbit the heading so the face leads
    expect(legacyMain).toContain("Math.sin(thiefFacingYaw) * 0.19");
  });
});
