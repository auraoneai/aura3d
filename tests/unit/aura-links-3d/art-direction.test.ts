import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { auditArtDirection, snapshotForAudit, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../apps/showcase-aura-links-3d/art/direction";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";
import { COURSES, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import { COURSE_LOOKS } from "../../../apps/showcase-aura-links-3d/src/game/lighting";
import { buildCourseRig } from "../../../apps/showcase-aura-links-3d/src/game/lookRig";
import { buildGolferNodes } from "../../../apps/showcase-aura-links-3d/src/game/rig";
import { LINKS_VFX_IDS } from "../../../apps/showcase-aura-links-3d/src/game/vfx";
import type { CourseId } from "../../../apps/showcase-aura-links-3d/src/game/types";

const app = resolve(__dirname, "../../../apps/showcase-aura-links-3d");
const IDS = Object.keys(COURSES) as CourseId[];

/** Model asset keys of the app's asset subset (`src/aura-assets.ts` types every entry). */
function modelKeys(): Set<string> {
  const src = readFileSync(resolve(app, "src/aura-assets.ts"), "utf8");
  return new Set([...src.matchAll(/readonly "([A-Za-z0-9]+)": AuraAssetDefinition & \{ readonly type: "model"/g)].map((m) => m[1]!));
}

/** Every model asset the scene builders mount (main.ts dressing + rig.ts golfer group). */
function mountedModelKeys(): string[] {
  const models = modelKeys();
  const used = new Set<string>();
  for (const file of ["src/main.ts", "src/game/rig.ts"]) {
    const src = readFileSync(resolve(app, file), "utf8");
    for (const m of src.matchAll(/assets\.([A-Za-z0-9]+)/g)) if (models.has(m[1]!)) used.add(m[1]!);
  }
  return [...used].sort();
}

const toJSON = (n: any) => (typeof n?.toJSON === "function" ? n.toJSON() : n);

/** The mounted scene of a course's first hole, as the audit sees it: the course look rig, the golfer group's models and the dressing models. */
function courseSnapshot(id: CourseId, tier: "low" | "high"): ArtDirectionSnapshot {
  const course = COURSES[id];
  const hole = course.holes[0]!;
  const rig = buildCourseRig(course, hole, buildHoleTerrain(course, hole), { tier });
  const golfer = buildGolferNodes({ polo: "#2f6ea3", cap: "#14200f", skin: "#c68a5a", trail: "#ffd257" } as any).map(toJSON).filter((n: any) => n?.kind === "model");
  const dressing = mountedModelKeys().map((key) => ({ kind: "model", name: key, asset: { id: key } }));
  const nodes = [...rig.before, rig.look, ...rig.nodes, ...golfer, ...dressing];
  const fakeApp = { scene: { nodes }, diagnostics: () => ({ drawCalls: 0 }) } as any;
  return snapshotForAudit(fakeApp, { assets: {} });
}

describe("Aura Links art direction (GU47 WP-20, PRD §3.2)", () => {
  it("is a valid defineArtDirection contract with a unique signature effect and the boot course's HDRI", () => {
    expect(direction.id).toBe("showcase-aura-links-3d");
    expect(direction.genre).toBe("golf-physics");
    expect(direction.lighting.fill).toBe("ibl");
    expect(direction.lighting.environment).toEqual({ hdri: COURSE_LOOKS.stAuroras.hdri.id, background: "hdri" });
    expect(direction.signatureEffect).toMatch(/flyover/);
    expect(direction.palette.primary.length).toBeGreaterThanOrEqual(3);
  });

  it("names every mounted model asset and every Links VFX preset", () => {
    const contracted = new Set(direction.assets.map((a) => a.assetKey));
    for (const key of mountedModelKeys()) expect(contracted.has(key), key).toBe(true);
    const kinds = new Set(direction.vfx.map((v) => v.kind));
    for (const id of LINKS_VFX_IDS) expect(kinds.has(id), id).toBe(true);
  });

  it("auditArtDirection passes on all six courses at High and Low (one shadowed key, IBL fill, no ambient)", () => {
    for (const id of IDS) {
      for (const tier of ["high", "low"] as const) {
        const snapshot = courseSnapshot(id, tier);
        expect(snapshot.environment.kind, `${id} ${tier}`).toBe("hdri");
        expect(auditArtDirection(direction, snapshot), `${id} ${tier}`).toEqual([]);
      }
    }
  });

  it("writes art/direction.audit.json for the art-direction and look-identity game-checks (boot course, High)", () => {
    const snapshot = courseSnapshot("stAuroras", "high");
    const violations = auditArtDirection(direction, snapshot);
    const record = writeArtDirectionAudit(resolve(app, "art/direction.ts"), { direction, snapshot, violations });
    expect(record.violations).toEqual([]);
    expect(record.signatureEffect).toBe(direction.signatureEffect);
  });
});
