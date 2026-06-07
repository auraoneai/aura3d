import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { CREATE_AURA3D_TEMPLATES, createA3DProject } from "../../../packages/create-aura3d/src";
import { createFightingRouteReadiness } from "../../../packages/create-aura3d/templates/fighting-game/src/game/stage";

describe("create-aura3d templates", () => {
  test("scaffolds every starter template with scripts and copy-paste tests", () => {
    for (const template of CREATE_AURA3D_TEMPLATES) {
      const targetDir = join(tmpdir(), `create-aura3d-${template}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const result = createA3DProject({ targetDir, template, rootDir: "packages/create-aura3d" });
      expect(result.template).toBe(template);
      expect(existsSync(join(targetDir, "package.json"))).toBe(true);
      expect(existsSync(join(targetDir, "tests", "route-health.spec.ts"))).toBe(true);
      expect(hasTemplateSmokeSpec(targetDir)).toBe(true);
      expect(existsSync(join(targetDir, "src", "main.ts"))).toBe(true);
    }
  });

  test("fighting-game readiness distinguishes placeholders from typed asset proof", () => {
    const placeholder = createFightingRouteReadiness({ missingFighterAssets: ["playerFighter", "rivalFighter"] });
    const typedAssets = createFightingRouteReadiness({ missingFighterAssets: [] });

    expect(placeholder.sourceOnly).toBe(true);
    expect(placeholder.placeholderMode).toBe(true);
    expect(placeholder.proofMode).toBe("source-placeholders");
    expect(placeholder.missingTypedAssets).toEqual(["playerFighter", "rivalFighter"]);
    expect(typedAssets.sourceOnly).toBe(false);
    expect(typedAssets.placeholderMode).toBe(false);
    expect(typedAssets.proofMode).toBe("typed-assets");
    expect(typedAssets.requiredTypedAssets).toEqual(["playerFighter", "rivalFighter"]);
    expect(typedAssets.publicEngineApis).toEqual(expect.arrayContaining(["createGameApp", "game.combatWorld", "games.fighting.stagePreset"]));
  });
});

function hasTemplateSmokeSpec(targetDir: string): boolean {
  return [
    "screenshot.spec.ts",
    "gameplay-smoke.spec.ts",
    "storyboard-playback.spec.ts"
  ].some((file) => existsSync(join(targetDir, "tests", file)));
}
