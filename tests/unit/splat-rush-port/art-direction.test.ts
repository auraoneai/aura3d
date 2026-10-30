import { describe, expect, it } from "vitest";
import { scene } from "@aura3d/engine";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../examples/splat-rush-port/art/direction";
import { addBackdrop } from "../../../examples/splat-rush-port/backdrop";
import { addPickups } from "../../../examples/splat-rush-port/pickups";
import { LOOKS } from "../../../examples/splat-rush-port/look";
import { MODELS } from "../../../examples/splat-rush-port/models";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

/** Expected in-play draws of the carnival look (lane report, CR-PF1): measured numbers are phase 2. */
const CARNIVAL_DRAWS_ESTIMATE = 38;

describe("GU47 WP-26 art direction (splat-rush-port)", () => {
  it("the carnival scene's GLB rig passes auditArtDirection and the audit record is written", () => {
    const builder = scene();
    addBackdrop(builder, LOOKS.carnival);
    addPickups(builder);
    const nodes = builder.toJSON().nodes as unknown as Record<string, unknown>[];
    const lights = nodes.filter((n) => n.kind === "light").map((n) => ({ type: String(n.light), shadow: Boolean(n.shadow), intensity: Number(n.intensity ?? 1) }));
    const env = nodes.find((n) => n.kind === "environment");
    const urlToKey = new Map(Object.entries(MODELS as unknown as Record<string, { url: string }>).map(([key, ref]) => [ref.url, key]));
    const models = nodes
      .filter((n) => n.kind === "model")
      .map((n) => {
        const text = JSON.stringify(n);
        const key = [...urlToKey.entries()].find(([url]) => text.includes(url))?.[1] ?? "unknown";
        return { assetKey: key, triangles: 0, textures: 1, unlit: false, overridesTextures: false };
      });
    const unique = [...new Map(models.map((m) => [m.assetKey, m])).values()];
    const snapshot: ArtDirectionSnapshot = {
      lights,
      hasAmbient: lights.some((l) => l.type === "ambient"),
      environment: { kind: env?.environment === "hdri" ? "hdri" : env ? "preset" : "none", background: env?.background === true },
      models: unique,
      drawCalls: CARNIVAL_DRAWS_ESTIMATE
    };
    expect(lights.filter((l) => l.shadow)).toHaveLength(1);
    expect(snapshot.environment.kind).toBe("hdri");
    expect(unique.map((m) => m.assetKey)).not.toContain("unknown");
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("examples/splat-rush-port/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });

  it("the signature effect and palette name the carnival identity", () => {
    expect(direction.signatureEffect).toMatch(/cel paint carnival/);
    expect(direction.palette.primary).toEqual(["#1f4a63", "#f3a96b", "#e8798a", "#a99bc9"]);
    expect(direction.lighting.environment.background).toBe("sky");
  });
});
