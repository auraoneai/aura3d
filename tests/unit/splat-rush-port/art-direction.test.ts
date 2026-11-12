import { describe, expect, it } from "vitest";
import { scene } from "@aura3d/engine";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../examples/splat-rush-port/art/direction";
import { addBackdrop } from "../../../examples/splat-rush-port/backdrop";
import { addPickups } from "../../../examples/splat-rush-port/pickups";
import { LOOKS } from "../../../examples/splat-rush-port/look";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

/** Expected in-play draws of the carnival look (lane report, CR-PF1): measured numbers are phase 2. */
const CARNIVAL_DRAWS_ESTIMATE = 38;

function flattenSceneNodes(nodes: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (n: Record<string, unknown>): void => {
    out.push(n);
    if (Array.isArray(n.children)) {
      for (const child of n.children as Record<string, unknown>[]) visit(child);
    }
  };
  for (const n of nodes) visit(n);
  return out;
}

describe("GU47 WP-26 art direction (splat-rush-port)", () => {
  it("the carnival scene's procedural multi-material rig passes auditArtDirection and writes the audit record", () => {
    const builder = scene();
    addBackdrop(builder, LOOKS.carnival);
    addPickups(builder);
    const rootNodes = builder.toJSON().nodes as unknown as Record<string, unknown>[];
    const allNodes = flattenSceneNodes(rootNodes);
    const lights = rootNodes.filter((n) => n.kind === "light").map((n) => ({ type: String(n.light), shadow: Boolean(n.shadow), intensity: Number(n.intensity ?? 1) }));
    const env = rootNodes.find((n) => n.kind === "environment");
    const models = allNodes.filter((n) => n.kind === "model");
    const materials = allNodes
      .filter((n) => n.kind === "primitive" && n.material && typeof n.material === "object")
      .map((n) => {
        const mat = n.material as Record<string, unknown>;
        return {
          node: String(n.name ?? "unnamed"),
          ...(typeof mat.name === "string" ? { name: mat.name } : {}),
          ...(typeof mat.emissiveIntensity === "number" ? { emissiveIntensity: mat.emissiveIntensity } : {}),
          ...(typeof mat.practical === "boolean" ? { practical: mat.practical } : {}),
          ...(typeof mat.lightSource === "boolean" ? { lightSource: mat.lightSource } : {})
        };
      });
    const snapshot: ArtDirectionSnapshot = {
      lights,
      hasAmbient: lights.some((l) => l.type === "ambient"),
      environment: { kind: env?.environment === "hdri" ? "hdri" : env ? "preset" : "none", background: env?.background === true },
      models: [],
      materials,
      drawCalls: CARNIVAL_DRAWS_ESTIMATE
    };
    expect(models).toHaveLength(0);
    expect(direction.assets).toEqual([]);
    expect(lights.filter((l) => l.shadow)).toHaveLength(1);
    expect(snapshot.environment.kind).toBe("hdri");
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
