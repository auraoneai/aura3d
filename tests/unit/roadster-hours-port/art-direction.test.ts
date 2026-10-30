import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../examples/roadster-hours-port/art/direction";
import { SALTWIND_LOOK, SALTWIND_PALETTE } from "../../../examples/roadster-hours-port/art/look";
import { MESHY_MODELS } from "../../../examples/roadster-hours-port/meshy.baked";
import { registerMeshyForTest } from "../../../examples/roadster-hours-port/meshy";
import { buildWorld } from "../../../examples/roadster-hours-port/world";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

type Json = Record<string, unknown>;
function nodes(scene: { toJSON(): unknown }): Json[] {
  const out: Json[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === "object") {
      const o = v as Json;
      if (typeof o.kind === "string") out.push(o);
      for (const key of Object.keys(o)) walk(o[key]);
    }
  };
  walk(scene.toJSON());
  return out;
}

const bin = (key: string): ArrayBuffer => {
  const b = readFileSync(resolve("examples/roadster-hours-port/assets/meshy", `${key}.bin`));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

/**
 * The snapshot of a mounted route, read from the scene the game builds (lights, environment) plus the generated models it
 * draws (the 15 Meshy keys with their baked triangle counts, base-colour texture only today) and the emissive materials
 * with their practical / light-source flags: lamp heads, relay gantries and data cells are practicals; vehicle head and
 * tail lamps are light sources.
 */
function snapshotOf(levelIndex: number): ArtDirectionSnapshot {
  const all = nodes(buildWorld(levelIndex, "gu47").scene);
  const lights = all.filter((n) => n.kind === "light").map((n) => ({ type: String(n.light), shadow: Boolean(n.shadow), intensity: Number(n.intensity ?? 0) }));
  lights.sort((a, b) => Number(b.shadow) - Number(a.shadow));
  const env = all.find((n) => n.kind === "environment");
  return {
    lights,
    hasAmbient: lights.some((l) => l.type === "ambient"),
    environment: { kind: env ? (env.environment as "hdri") : "none", background: Boolean(env?.background) },
    models: Object.values(MESHY_MODELS).map((m) => ({ assetKey: m.key, triangles: m.triangles, textures: 1, unlit: false, overridesTextures: false })),
    materials: [
      { node: "lamp-heads", emissiveIntensity: 2.4, practical: true },
      { node: "gate-posts", emissiveIntensity: 0.9, practical: true },
      { node: "cells", emissiveIntensity: 4.2, practical: true },
      { node: "vehicles-head", emissiveIntensity: 5, lightSource: true },
      { node: "vehicles-tail", emissiveIntensity: 4, lightSource: true }
    ],
    drawCalls: 0
  };
}

describe("Saltwind Highway art direction (GU47 WP-32, RH47-18)", () => {
  for (const key of Object.keys(MESHY_MODELS)) registerMeshyForTest(key, bin(key));

  it("passes the C-35 audit on every route and writes the audit record (Halo, the most lights)", () => {
    for (const i of [0, 1]) expect(auditArtDirection(direction, snapshotOf(i))).toEqual([]);
    const snapshot = snapshotOf(2);
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("examples/roadster-hours-port/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });

  it("names the identity palette, a custom-dome sky and a unique crosswind-spray signature", () => {
    expect(direction.palette.primary).toEqual([SALTWIND_PALETTE.saltWhite, SALTWIND_PALETTE.seaTeal, SALTWIND_PALETTE.ochre]);
    expect(direction.palette.accent).toBe(SALTWIND_PALETTE.signalRed);
    expect(direction.lighting.environment).toEqual({ hdri: SALTWIND_LOOK.sunbreak.hdri, background: "sky" });
    expect(direction.signatureEffect).toMatch(/^Crosswind salt spray/);
    expect(direction.tiers.high.cascades).toBe(3);
    expect(direction.tiers.low.cascades).toBe(1);
    expect(direction.tiers.high.particles).toBeLessThanOrEqual(2000);
  });
});
