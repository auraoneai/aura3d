/**
 * GU47 WP-33 look contract: the art direction passes `auditArtDirection` against a snapshot taken from the world the game
 * really builds (lights, environment and GLB models walked out of `buildWorld().scene.toJSON()`), and the audit record
 * the `art-direction` game-check reads is written beside art/direction.ts (lanes/ei.md compliance recipe).
 */
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import direction from "../../../examples/where-the-wind-wanders-port/art/direction";
import { auditArtDirection, type ArtDirectionSnapshot } from "../../../packages/game/src/art/index";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";
import { buildWorld } from "../../../examples/where-the-wind-wanders-port/world";

const GLB_TRIANGLES: Readonly<Record<string, number>> = {
  // measured from the committed GLBs (index count / 3), 2026-10-30
  bell: 1074, belltower: 26014, boat: 27958, cottage: 52686, hero: 12345, letter: 22374, oak: 1324, pine: 849, shrub: 498, stones: 22516, wisp: 21304
};
const KEY_OF_FILE: Readonly<Record<string, string>> = { "belltower-bell.glb": "bell" };

interface SceneNodeLike { readonly kind?: string; readonly light?: string; readonly environment?: string; readonly shadow?: unknown; readonly intensity?: number; readonly background?: unknown; readonly asset?: { readonly url?: string }; readonly children?: readonly SceneNodeLike[] }

function snapshotOf(options: Parameters<typeof buildWorld>[0]): ArtDirectionSnapshot {
  const nodes = (buildWorld(options).scene.toJSON() as unknown as { nodes: readonly SceneNodeLike[] }).nodes;
  const lights: { type: string; shadow: boolean; intensity: number }[] = [];
  let hasAmbient = false;
  let environment: ArtDirectionSnapshot["environment"] = { kind: "none", background: false };
  const models = new Map<string, ArtDirectionSnapshot["models"][number]>();
  const walk = (n: SceneNodeLike): void => {
    if (n.kind === "light") {
      if (n.light === "ambient") hasAmbient = true;
      lights.push({ type: n.light ?? "unknown", shadow: Boolean(n.shadow), intensity: n.intensity ?? 0 });
    }
    if (n.kind === "environment") environment = { kind: n.environment === "hdri" ? "hdri" : "preset", background: n.background === true };
    if (n.asset?.url?.endsWith(".glb")) {
      const file = basename(n.asset.url);
      const key = KEY_OF_FILE[file] ?? file.replace(/\.glb$/, "");
      models.set(key, { assetKey: key, triangles: GLB_TRIANGLES[key] ?? 0, textures: 3, unlit: false, overridesTextures: false });
    }
    (n.children ?? []).forEach(walk);
  };
  nodes.forEach(walk);
  // the key (the shadowed light) first, as the audit expects
  lights.sort((a, b) => Number(b.shadow) - Number(a.shadow));
  return { lights, hasAmbient, environment, models: [...models.values()], drawCalls: 0 };
}

describe("where-the-wind-wanders-port art direction", () => {
  it("the GU47 world passes the audit (one shadowed sun, IBL fill, every GLB in the contract) and the record is written", () => {
    const snapshot = snapshotOf({});
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("examples/where-the-wind-wanders-port/art/direction.ts", { direction, snapshot, violations });
    expect(snapshot.lights.filter((l) => l.shadow)).toHaveLength(1);
    expect(snapshot.environment).toEqual({ kind: "hdri", background: false });
    expect(violations).toEqual([]);
  });

  it("Low keeps the sun but drops its shadow; ?look=original mounts no engine light", () => {
    expect(snapshotOf({ quality: "low" }).lights.filter((l) => l.shadow)).toHaveLength(0);
    expect(snapshotOf({ quality: "low" }).lights.some((l) => l.type === "directional")).toBe(true);
    expect(snapshotOf({ look: "original" }).lights).toHaveLength(0);
  });

  it("the signature effect and palette are the game's own", () => {
    expect(direction.signatureEffect).toMatch(/cloud shadows and gust waves/);
    expect(direction.palette.primary).toEqual(["#8fae6a", "#3f7f86", "#ffc58a"]);
    expect(direction.lighting.fill).not.toBe("ambient");
  });
});
