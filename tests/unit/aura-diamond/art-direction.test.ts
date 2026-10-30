import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lights, looks } from "@aura3d/engine";
import { auditArtDirection, defineArtDirection, snapshotForAudit, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../apps/showcase-aura-diamond-3d/art/direction";
import { lookPlan, parkPracticals, PARK_LOOKS } from "../../../apps/showcase-aura-diamond-3d/art/look";
import { buildParkScene } from "../../../apps/showcase-aura-diamond-3d/src/scene";
import { PARKS, PARK_ORDER, type ParkId } from "../../../apps/showcase-aura-diamond-3d/src/rules";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

const ROOT = join(__dirname, "../../..");
const DIRECTION_FILE = "apps/showcase-aura-diamond-3d/art/direction.ts";

type SceneNode = { readonly kind: string; readonly children?: readonly SceneNode[]; readonly asset?: { readonly id?: string } };

/** The GU47 look of a park as `looks.preset` emits it, plus its practical lamps (DIA-L1, E1, L2). */
function lightingNodes(park: ParkId): SceneNode[] {
  const plan = lookPlan(park, "gu47", "high");
  const look = looks.preset(plan.baseLook, plan.overrides as never).toJSON() as unknown as SceneNode;
  const lamps = parkPracticals(PARKS[park], "high").map((p) =>
    (p.kind === "spot"
      ? lights.spot({ name: p.name, position: p.position, target: p.target, color: p.color, intensity: p.intensity, angle: p.angle, penumbra: p.penumbra, distance: p.distance })
      : lights.rect({ name: p.name, position: p.position, target: p.target, color: p.color, intensity: p.intensity, width: p.width, height: p.height })
    ).toJSON() as unknown as SceneNode
  );
  return [look, ...lamps];
}

/** Every model the park's scene mounts (the asset roles the direction must contract). */
function modelNodes(park: ParkId): SceneNode[] {
  const nodes = (buildParkScene(PARKS[park]).toJSON() as { nodes: SceneNode[] }).nodes;
  const out: SceneNode[] = [];
  const walk = (list: readonly SceneNode[]): void => {
    for (const n of list) {
      if (n.kind === "model") out.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/**
 * Triangle counts measured from the GLB index buffers (apps/showcase-aura-diamond-3d/route-health.json); the other models
 * have no count in the manifest yet, so their triangle floor is checked on the phase-2 capture.
 */
const KNOWN_TRIANGLES = { assets: { diamondAthlete: { triangles: 31758 }, diamondCrowdAthlete: { triangles: 3809 } } };

/** Audit snapshot of one park: a literal mirror of its lights, environment and models (the E-I recipe allows it). */
function parkSnapshot(park: ParkId): ArtDirectionSnapshot {
  const app = { scene: { nodes: [...lightingNodes(park), ...modelNodes(park)] } };
  const snap = snapshotForAudit(app as never, KNOWN_TRIANGLES);
  return { ...snap, materials: [] };
}

describe("aura-diamond art direction (DIA-X1)", () => {
  it("passes defineArtDirection and names the signature effect, palette and boot environment", () => {
    expect(defineArtDirection(direction)).toBe(direction);
    expect(direction.signatureEffect).toBe("bat-crack splinter flash");
    expect(direction.palette.reservedObjective).toBe("#f5f1e4");
    expect(direction.lighting.environment).toEqual({ hdri: PARK_LOOKS.sandlot.hdri.id, background: "sky" });
    expect(direction.lighting.fill).toBe("ibl");
  });

  it("audits every park's scene with zero violations and writes the audit record for the boot park", () => {
    const results = PARK_ORDER.map((park) => {
      const snapshot = parkSnapshot(park);
      return { park, snapshot, violations: auditArtDirection(direction, snapshot) };
    });
    for (const r of results) expect({ park: r.park, violations: r.violations }).toEqual({ park: r.park, violations: [] });
    const boot = results[0]!;
    expect(boot.park).toBe("sandlot");
    expect(boot.snapshot.environment.kind).toBe("hdri");
    expect(boot.snapshot.lights.filter((l) => l.shadow)).toHaveLength(1);
    writeArtDirectionAudit(DIRECTION_FILE, { direction, snapshot: boot.snapshot, violations: boot.violations });
    const record = JSON.parse(readFileSync(join(ROOT, "apps/showcase-aura-diamond-3d/art/direction.audit.json"), "utf8"));
    expect(record.schema).toBe("aura3d.art-direction-audit/1");
    expect(record.violations).toEqual([]);
    expect(record.signatureEffect).toBe("bat-crack splinter flash");
  });

  it("contracts every model asset key main.ts and scene.ts mount", () => {
    const keys = new Set<string>();
    for (const file of ["src/scene.ts", "src/main.ts"]) {
      const text = readFileSync(join(ROOT, "apps/showcase-aura-diamond-3d", file), "utf8");
      for (const m of text.matchAll(/\bmodel\(\s*assets\.([A-Za-z0-9]+)/g)) keys.add(m[1]!);
    }
    const contracted = new Set(direction.assets.map((a) => a.assetKey));
    expect([...keys].filter((k) => !contracted.has(k))).toEqual([]);
  });
});
