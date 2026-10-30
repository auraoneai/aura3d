// GU47 WP-22 (lane g12): the slingshot-siege art direction, audited against every chapter's authored scene.
// Writes apps/showcase-slingshot-siege/src/art/direction.audit.json (the `art-direction` game-check reads it).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AuraApp } from "@aura3d/engine";
import { auditArtDirection, snapshotForAudit, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../apps/showcase-slingshot-siege/src/art/direction";
import { CHAPTERS } from "../../../apps/showcase-slingshot-siege/src/game/levels";
import { buildStage } from "../../../apps/showcase-slingshot-siege/src/game/stage";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

type Json = { toJSON?: () => unknown };
const manifest = JSON.parse(readFileSync(new URL("../../../aura.assets.json", import.meta.url), "utf8")) as unknown;

function chapterSnapshot(chapterIndex: number): ArtDirectionSnapshot {
  const { nodes } = buildStage(CHAPTERS[chapterIndex]!, { reducedMotion: false });
  const json = nodes.map((n) => (typeof (n as Json).toJSON === "function" ? (n as Json).toJSON!() : n));
  const app = { scene: { nodes: json }, diagnostics: () => ({ drawCalls: 0 }) } as unknown as AuraApp;
  return snapshotForAudit(app, manifest as never);
}

describe("slingshot-siege art direction (GU47 WP-22, PRD §3.2)", () => {
  const snapshots = CHAPTERS.map((c) => chapterSnapshot(c.id));
  const violations = snapshots.flatMap((s, i) => auditArtDirection(direction, s).map((v) => ({ ...v, message: `ch${i}: ${v.message}` })));

  it("audits clean on all six chapters and writes the audit record", () => {
    writeArtDirectionAudit("apps/showcase-slingshot-siege/src/art/direction.ts", { direction, snapshot: snapshots[0]!, violations });
    expect(violations).toEqual([]);
  });

  it("every chapter mounts one shadowed sun, no ambient, an image-lit environment and only its practicals", () => {
    snapshots.forEach((s, i) => {
      expect(s.hasAmbient, `ch${i}`).toBe(false);
      expect(s.lights.filter((l) => l.shadow), `ch${i}`).toHaveLength(1);
      expect(s.lights.some((l) => l.type === "hemisphere"), `ch${i}`).toBe(false);
      expect(s.environment.kind, `ch${i}`).toBe("hdri");
    });
    expect(snapshots.map((s) => s.lights.length - 1)).toEqual([0, 0, 0, 0, 2, 4]);
  });

  it("keeps a unique signature, the WP-22 palette and a sky (not an HDRI) as the visible background", () => {
    expect(direction.signatureEffect).toMatch(/tilt-shift/i);
    expect(direction.palette.primary).toEqual(["#ece7da", "#2f8f9d", "#e9d6a8", "#a08466"]);
    expect(direction.palette.accent).toBe("#e2483d");
    expect(direction.lighting.environment.background).toBe("sky");
  });
});
