import { describe, expect, it } from "vitest";
import { createAuraApp } from "@aura3d/engine";
import { auditArtDirection, snapshotForAudit, type ArtDirectionSnapshot } from "@aura3d/game/art";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";
import direction from "../../../apps/showcase-teleoperator/src/art/direction";
import { BOOT_SKY, SKY_LOOKS, SKY_ORDER } from "../../../apps/showcase-teleoperator/src/look";
import { buildGridDispatchScene } from "../../../apps/showcase-teleoperator/src/scene";
import { GRID_VFX_PRESETS } from "../../../apps/showcase-teleoperator/src/vfx";

const manifest = { assets: {} };

function snapshotFor(sky: (typeof SKY_ORDER)[number]): ArtDirectionSnapshot {
  const app = createAuraApp(undefined, { scene: buildGridDispatchScene(sky), autoStart: false });
  try {
    return snapshotForAudit(app as never, manifest);
  } finally {
    app.dispose?.();
  }
}

describe("grid dispatch art direction (GU47 WP-14, C-35)", () => {
  it("is a valid defineArtDirection contract with the WP-14 identity and zero GLBs mounted (100% @aura3d/engine procedural)", () => {
    expect(direction.id).toBe("showcase-teleoperator");
    expect(direction.genre).toBe("racing");
    expect(direction.palette.primary).toEqual(["#5f7f8c", "#2b3a55", "#ffb15a", "#b3262b"]);
    expect(direction.palette.reservedObjective).toBe("#3fd6c6");
    expect(direction.lighting.fill).toBe("ibl");
    expect(direction.lighting.environment.background).toBe("sky");
    expect(direction.signatureEffect).toMatch(/marine-layer/i);
    expect(direction.signatureEffect).toMatch(/LiDAR scan pulse/);
    expect(direction.assets).toEqual([]);
    const bootSnap = snapshotFor(BOOT_SKY);
    expect(bootSnap.models).toEqual([]);
  });

  it("names a VFX entry for every registered preset of the pack", () => {
    const kinds = new Set(direction.vfx.map((v) => v.kind));
    for (const kind of Object.keys(GRID_VFX_PRESETS)) expect(kinds.has(kind), kind).toBe(true);
  });

  for (const sky of SKY_ORDER) {
    it(`${sky} (${SKY_LOOKS[sky].label}): the mounted scene passes auditArtDirection`, () => {
      const snapshot = snapshotFor(sky);
      expect(snapshot.environment.kind).not.toBe("none");
      expect(snapshot.lights.filter((l) => l.shadow)).toHaveLength(1);
      expect(auditArtDirection(direction, snapshot)).toEqual([]);
    });
  }

  it("writes art/direction.audit.json from the boot sky (Marine dusk)", () => {
    const snapshot = snapshotFor(BOOT_SKY);
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("apps/showcase-teleoperator/src/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });
});
