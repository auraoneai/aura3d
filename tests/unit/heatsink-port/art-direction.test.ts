import { describe, expect, it } from "vitest";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../examples/heatsink-port/art/direction";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";
import { Track } from "../../../examples/heatsink-port/track";
import { buildWorld } from "../../../examples/heatsink-port/world";

interface JsonNode {
  readonly kind?: string; readonly name?: string; readonly light?: string; readonly environment?: string; readonly intensity?: number;
  readonly shadow?: unknown; readonly background?: unknown; readonly asset?: { readonly id?: string }; readonly children?: readonly JsonNode[];
}

/** A literal mirror of `snapshotForAudit` on the authored scene JSON (no mounted app in a unit test). */
function snapshotOf(search: string): ArtDirectionSnapshot {
  const json = buildWorld(new Track(), "high", search).scene.toJSON() as unknown as { nodes?: JsonNode[] };
  const lights: { type: string; shadow: boolean; intensity: number }[] = [];
  const models: ArtDirectionSnapshot["models"][number][] = [];
  let environment: ArtDirectionSnapshot["environment"] = { kind: "none", background: false };
  const walk = (nodes: readonly JsonNode[]): void => {
    for (const n of nodes) {
      if (n.kind === "light") lights.push({ type: n.light ?? "", shadow: n.shadow === true || (typeof n.shadow === "object" && n.shadow !== null), intensity: n.intensity ?? 0 });
      else if (n.kind === "environment") environment = { kind: n.environment === "hdri" ? "hdri" : "preset", background: n.background === true };
      else if (n.kind === "model") models.push({ assetKey: n.asset?.id ?? "", triangles: 0, textures: 0, unlit: false, overridesTextures: false });
      if (n.children) walk(n.children);
    }
  };
  walk(json.nodes ?? []);
  /* the light order of the snapshot puts the shadowed key first (auditArtDirection counts lights after index 0 as practicals) */
  lights.sort((a, b) => Number(b.shadow) - Number(a.shadow));
  return { lights, hasAmbient: lights.some((l) => l.type === "ambient"), environment, models, materials: [], drawCalls: 0 };
}

describe("heatsink-port art direction (GU47 WP-29)", () => {
  it("passes auditArtDirection on the default twilight scene and writes the audit record", () => {
    const snapshot = snapshotOf("");
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("examples/heatsink-port/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });

  it("keeps the ion-wake signature and the identity palette", () => {
    expect(direction.signatureEffect.startsWith("ion-wake")).toBe(true);
    expect(direction.palette.primary).toEqual(["#0f3a40", "#9f8cff", "#ff5ab4", "#ffb02e"]);
    expect(direction.palette.reservedObjective).toBe("#40e0ff");
    expect(direction.lighting.environment.background).toBe("sky");
  });

  it("the ?look=original scene also passes the audit (one shadowed key, no ambient)", () => {
    expect(auditArtDirection(direction, snapshotOf("?look=original"))).toEqual([]);
  });
});
