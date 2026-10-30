/**
 * Duneglide art direction (GU47 WP-34, PRD §3.2 item 1; E-I compliance recipe in docs/prds/game-upgrades-47/lanes/ei.md).
 *
 * Builds every chapter's inked scene without the DOM, snapshots it with `snapshotForAudit` and audits it against
 * art/direction.ts (one shadowed key, environment fill and no hemisphere, at most six practicals, every mounted model in
 * the contract, no emissive fill). The boot chapter's record is written beside direction.ts as art/direction.audit.json
 * for the `art-direction` game-check.
 */
import { describe, expect, it } from "vitest";
import { auditArtDirection, snapshotForAudit, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../examples/silt-and-signal-port/art/direction";
import { SILT_VFX_KINDS } from "../../../examples/silt-and-signal-port/art/vfx";
import { buildWorld } from "../../../examples/silt-and-signal-port/world";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

const DIRECTION_FILE = "examples/silt-and-signal-port/art/direction.ts";

function chapterSnapshot(chapter: number): ArtDirectionSnapshot {
  const nodes = (buildWorld(chapter).scene as unknown as { toJSON(): { nodes: unknown[] } }).toJSON().nodes;
  return snapshotForAudit({ scene: { nodes } } as unknown as Parameters<typeof snapshotForAudit>[0], { assets: {} });
}

describe("Duneglide art direction (GU47 WP-34)", () => {
  it("defines the inked poster identity: sandstone, terracotta, bone and indigo with one jade accent; sky dome, IBL fill", () => {
    expect(direction.id).toBe("showcase-silt-and-signal-port");
    expect(direction.palette.primary).toHaveLength(4);
    expect(direction.palette.accent).toBe("#2fae86");
    expect(direction.lighting.fill).toBe("ibl");
    expect(direction.lighting.environment).toEqual({ hdri: "belfast_sunset_puresky", background: "sky" });
    expect(direction.signatureEffect).toMatch(/sand wake/i);
  });

  it("lists a VFX entry for every preset of the pack", () => {
    const kinds = new Set(direction.vfx.map((entry) => entry.kind));
    for (const kind of SILT_VFX_KINDS) expect(kinds.has(kind), kind).toBe(true);
  });

  for (let chapter = 0; chapter <= 6; chapter++) {
    it(`chapter ${chapter}: the inked scene audits clean`, () => {
      const snapshot = chapterSnapshot(chapter);
      expect(auditArtDirection(direction, snapshot)).toEqual([]);
      expect(snapshot.lights.filter((light) => light.shadow)).toHaveLength(1);
      expect(snapshot.lights.some((light) => light.type === "hemisphere")).toBe(false);
      expect(snapshot.environment.kind).not.toBe("none");
    });
  }

  it("writes the boot chapter's audit record for the art-direction game-check", () => {
    const snapshot = chapterSnapshot(0);
    const violations = auditArtDirection(direction, snapshot);
    const record = writeArtDirectionAudit(DIRECTION_FILE, { direction, snapshot, violations });
    expect(record.violations).toEqual([]);
    expect(record.signatureEffect).toBe(direction.signatureEffect);
  });
});
