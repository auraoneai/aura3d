import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditArtDirection, snapshotForAudit, type ArtDirectionSnapshot } from "@aura3d/game/art";
import type { AuraApp } from "@aura3d/engine";
import direction from "../../../apps/showcase-last-train-port/art/direction";
import { BANDS, BAND_IDS, HDRI_URL, LAMPLIGHT_PALETTE } from "../../../examples/last-train-port/bands";
import { PRACTICAL_COUNT } from "../../../examples/last-train-port/lights";
import { buildWorld } from "../../../examples/last-train-port/world";
import type { RouteData, SimData, Tables } from "../../../examples/last-train-port/sim";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

const data: SimData = {
  route: JSON.parse(readFileSync("examples/last-train-port/data/route.json", "utf8")) as RouteData,
  tables: JSON.parse(readFileSync("examples/last-train-port/data/tables.json", "utf8")) as Tables
};

/**
 * GU47 WP-31 LT-19: the audit snapshot is read from the authored band scenes themselves (scene JSON through
 * `snapshotForAudit`), not a literal mirror. Triangle counts are 0 (no manifest rows in phase 1; the audit skips the floor).
 */
const world = buildWorld(data, "bands");
const snapshotOf = (band: (typeof BAND_IDS)[number]): ArtDirectionSnapshot => {
  const json = world.sceneFor(band).toJSON();
  return snapshotForAudit({ scene: json, diagnostics: () => ({ drawCalls: 0 }) } as unknown as AuraApp, { assets: {} });
};

describe("Lamplight Line art direction (GU47 WP-31 LT-19)", () => {
  it("passes the C-35 audit on every band scene and writes the audit record from band D (the most practicals)", () => {
    for (const band of BAND_IDS) expect(auditArtDirection(direction, snapshotOf(band)), band).toEqual([]);
    const snapshot = snapshotOf("D");
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("apps/showcase-last-train-port/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
    expect(snapshot.lights).toHaveLength(1 + PRACTICAL_COUNT);
    expect(snapshot.lights.filter((l) => l.shadow)).toHaveLength(1);
    expect(snapshot.hasAmbient).toBe(false);
    expect(snapshot.environment.kind).toBe("hdri");
  });

  it("names the identity palette, the band A HDRI and a unique signature", () => {
    expect(direction.palette.primary).toEqual([LAMPLIGHT_PALETTE.apricot, LAMPLIGHT_PALETTE.rose, LAMPLIGHT_PALETTE.cream, LAMPLIGHT_PALETTE.terracotta]);
    expect(direction.palette.accent).toBe("#ffc77a");
    expect(direction.palette.reservedObjective).toBe(LAMPLIGHT_PALETTE.cherry);
    expect(direction.lighting.environment.hdri).toBe(HDRI_URL(BANDS.A.hdri));
    expect(direction.signatureEffect).toMatch(/sky lanterns/i);
  });

  it("keeps ?look=original as today's two-scene day / night look", () => {
    const original = buildWorld(data, "original");
    const day = JSON.stringify(original.scene.toJSON()), night = JSON.stringify(original.nightScene.toJSON());
    expect(day).toContain('"sun"');
    expect(night).toContain('"moon"');
    expect(day).not.toContain(`"${"bounce"}"`);
    expect(day).toContain("sky.hdr");
  });

  it("band scenes share node names with each other (setScene swaps keep the runtime ids)", () => {
    const ids = (band: (typeof BAND_IDS)[number]) => new Set([...JSON.stringify(world.sceneFor(band).toJSON()).matchAll(/"runtime":\{(?:"mutable":true,)?"id":"([^"]+)"/g)].map((m) => m[1]!));
    const a = ids("A"), d = ids("D");
    expect(a.size).toBeGreaterThan(50);
    for (const id of a) if (id !== "sun-flare") expect(d.has(id), id).toBe(true);
    expect(d.has("headlamp")).toBe(true);
    expect(JSON.stringify(world.sceneFor("D").toJSON())).toContain("rooftop_night_1k.hdr");
    expect(JSON.stringify(world.sceneFor("C").toJSON())).toContain("industrial_sunset_puresky_1k.hdr");
    expect(JSON.stringify(world.sceneFor("B").toJSON())).toContain("god-rays");
    expect(JSON.stringify(world.sceneFor("A").toJSON())).not.toContain("god-rays");
  });
});
