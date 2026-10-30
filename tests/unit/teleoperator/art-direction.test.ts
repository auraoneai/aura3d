import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAuraApp } from "@aura3d/engine";
import { auditArtDirection, snapshotForAudit, type ArtDirectionSnapshot } from "@aura3d/game/art";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";
import direction from "../../../apps/showcase-teleoperator/src/art/direction";
import { assets } from "../../../apps/showcase-teleoperator/src/aura-assets";
import { BOOT_SKY, SKY_LOOKS, SKY_ORDER } from "../../../apps/showcase-teleoperator/src/look";
import { buildGridDispatchScene } from "../../../apps/showcase-teleoperator/src/scene";
import { GRID_VFX_PRESETS } from "../../../apps/showcase-teleoperator/src/vfx";

const ROOT = join(__dirname, "../../..");

/** Triangle and texture counts straight from each GLB's JSON chunk (the app manifest carries neither). */
function glbStats(url: string): { triangles: number; textures: number } {
  const bytes = readFileSync(join(ROOT, "public", url));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8")) as {
    meshes?: { primitives: { indices?: number; attributes: { POSITION: number } }[] }[];
    accessors: { count: number }[];
    images?: unknown[];
  };
  let triangles = 0;
  for (const mesh of json.meshes ?? []) for (const p of mesh.primitives) triangles += json.accessors[p.indices ?? p.attributes.POSITION]!.count / 3;
  return { triangles: Math.round(triangles), textures: json.images?.length ?? 0 };
}

const manifest = { assets: Object.fromEntries(Object.entries(assets).map(([key, ref]) => [key, glbStats(ref.url)])) };

function snapshotFor(sky: (typeof SKY_ORDER)[number]): ArtDirectionSnapshot {
  const app = createAuraApp(undefined, { scene: buildGridDispatchScene(sky), autoStart: false });
  try {
    return snapshotForAudit(app as never, manifest);
  } finally {
    app.dispose?.();
  }
}

describe("grid dispatch art direction (GU47 WP-14, C-35)", () => {
  it("is a valid defineArtDirection contract with the WP-14 identity", () => {
    expect(direction.id).toBe("showcase-teleoperator");
    expect(direction.genre).toBe("racing");
    expect(direction.palette.primary).toEqual(["#5f7f8c", "#2b3a55", "#ffb15a", "#b3262b"]);
    expect(direction.palette.reservedObjective).toBe("#3fd6c6");
    expect(direction.lighting.fill).toBe("ibl");
    expect(direction.lighting.environment.background).toBe("sky");
    expect(direction.signatureEffect).toMatch(/marine-layer/i);
    expect(direction.signatureEffect).toMatch(/LiDAR scan pulse/);
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
