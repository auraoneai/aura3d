/// <reference types="node" />
// Art-direction contract & 6-world diorama audit (C-35, Aura3D 5.5.1).
// Validates `art/direction.ts` via `defineArtDirection`, audits every Wonder World
// diorama scene with `auditArtDirection`, and writes `art/direction.audit.json`.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import type { AuraApp } from "@aura3d/engine";
import {
  assetManifestLike,
  auditArtDirection,
  defineArtDirection,
  snapshotForAudit,
  type ArtDirectionSnapshot
} from "@aura3d/engine/game/art";
import direction from "../../../art/direction.js";
import { MODEL_INFO, MODEL_KEYS } from "../../../src/aura-assets.js";
import { STORIES } from "../../../src/content/catalog.js";
import { buildStoryScene } from "../../../src/scenes/stage.js";
import { WORLD_IDS } from "../../../src/scenes/worlds.js";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const repoRoot = resolve(appRoot, "../..");
const directionFile = join(appRoot, "art/direction.ts");

interface ArtDirectionAuditWriter {
  writeArtDirectionAudit: (
    file: string,
    input: {
      readonly direction: unknown;
      readonly snapshot?: unknown;
      readonly violations: readonly unknown[];
      readonly drawCallsBudget?: number;
    },
    root?: string
  ) => unknown;
}

function buildManifest() {
  return assetManifestLike({
    assets: MODEL_KEYS.map((id) => ({
      id,
      triangles: 4500,
      textures: 2,
      unlit: false
    }))
  });
}

describe("Wonder World 5.5.1 art direction (C-35)", () => {
  it("validates cleanly through defineArtDirection", () => {
    expect(defineArtDirection(direction)).toBe(direction);
    expect(direction.id).toBe("wonder-world");
    expect(direction.lighting.fill).toBe("ibl+bounce");
    expect(direction.lighting.key.shadow).toBe(true);
    expect(direction.references.length).toBeGreaterThanOrEqual(3);
  });

  it("audits clean across all 6 worlds and writes art/direction.audit.json", async () => {
    const manifest = buildManifest();
    const snapshots: Record<string, ArtDirectionSnapshot> = {};
    const violations: { readonly world: string; readonly rule: string; readonly message: string }[] = [];

    for (const worldId of WORLD_IDS) {
      const story = STORIES.find((entry) => entry.world === worldId);
      expect(story, `representative story for ${worldId}`).toBeDefined();
      const built = buildStoryScene(story!, {
        modelAvailable: (key) => MODEL_INFO[key].admitted
      });
      const snapshot = snapshotForAudit(
        { scene: built.builder.toJSON() } as unknown as AuraApp,
        manifest
      );
      snapshots[worldId] = snapshot;
      expect(snapshot.hasAmbient, `${worldId} hasAmbient`).toBe(false);
      expect(snapshot.environment.kind, `${worldId} environment.kind`).toBe("hdri");
      expect(snapshot.lights.filter((light) => light.shadow), `${worldId} shadowed key`).toHaveLength(1);
      for (const violation of auditArtDirection(direction, snapshot)) {
        violations.push({
          world: worldId,
          rule: violation.rule,
          message: violation.message
        });
      }
    }

    const helperUrl = pathToFileURL(resolve(repoRoot, "tools/game-checks/lib/art-direction.mjs")).href;
    const { writeArtDirectionAudit } = (await import(helperUrl)) as ArtDirectionAuditWriter;
    writeArtDirectionAudit(
      directionFile,
      {
        direction,
        snapshot: { worlds: snapshots },
        violations,
        drawCallsBudget: 180
      },
      repoRoot
    );

    expect(violations).toEqual([]);
  });
});
