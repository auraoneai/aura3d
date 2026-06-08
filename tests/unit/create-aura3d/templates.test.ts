import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { CREATE_AURA3D_TEMPLATES, createA3DProject } from "../../../packages/create-aura3d/src";
import { createFightingRouteReadiness } from "../../../packages/create-aura3d/templates/fighting-game/src/game/stage";
import {
  animationStudioOptionalAudioAssetKeys,
  animationStudioRequiredAssetKeys
} from "../../../packages/create-aura3d/templates/animation-studio/src/aura-assets";

describe("create-aura3d templates", () => {
  test("scaffolds every starter template with scripts and copy-paste tests", () => {
    for (const template of CREATE_AURA3D_TEMPLATES) {
      const targetDir = join(tmpdir(), `create-aura3d-${template}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const result = createA3DProject({ targetDir, template, rootDir: "packages/create-aura3d" });
      expect(result.template).toBe(template);
      expect(existsSync(join(targetDir, "package.json"))).toBe(true);
      // animation-studio intentionally ships only the real live-3D render route
      // (live-route.html -> src/render-live-route.ts); the legacy SVG-puppet
      // index.html -> src/main.ts route and its specs were deleted (Phase 1).
      if (template === "animation-studio") {
        expect(existsSync(join(targetDir, "live-route.html"))).toBe(true);
        expect(existsSync(join(targetDir, "src", "render-live-route.ts"))).toBe(true);
        continue;
      }
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

  test("animation-studio template exposes typed asset keys and the real live-3D render route", () => {
    const packageJson = JSON.parse(readFileSync("packages/create-aura3d/templates/animation-studio/package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    // Phase 1 deleted the fabricated SVG-puppet episode pipeline (episode-renderer.ts
    // + scripts/episode.ts). The legacy episode:* scripts that drove it are gone; the
    // real live-3D render route is the only render entry point.
    const scriptNames = Object.keys(packageJson.scripts);
    expect(scriptNames).not.toContain("episode:plan");
    expect(scriptNames).not.toContain("episode:render");
    expect(scriptNames).not.toContain("episode:review");
    expect(scriptNames).not.toContain("episode:verify");
    expect(scriptNames).toEqual(expect.arrayContaining(["episode:render-3d", "scene"]));
    expect(existsSync("packages/create-aura3d/templates/animation-studio/live-route.html")).toBe(true);
    expect(existsSync("packages/create-aura3d/templates/animation-studio/src/render-live-route.ts")).toBe(true);
    expect(existsSync("packages/create-aura3d/templates/animation-studio/index.html")).toBe(false);
    expect(existsSync("packages/create-aura3d/templates/animation-studio/src/main.ts")).toBe(false);
    expect(animationStudioRequiredAssetKeys).toEqual(["miko", "luma", "moonGarden"]);
    expect(animationStudioOptionalAudioAssetKeys).toEqual(expect.arrayContaining([
      "mikoDialogueStem",
      "lumaDialogueStem",
      "moonGardenMusic",
      "moonGardenChimeSfx"
    ]));
  });

  test("animation-channel still-image puppet experiments are not release-facing routes", () => {
    const main = readFileSync("packages/create-aura3d/templates/animation-channel/src/main.ts", "utf8");
    expect(main).toContain("image-puppet");
    expect(main).toContain("release-facing");
    expect(main).not.toContain("mountImagePuppetEpisode(");
  });
});

function hasTemplateSmokeSpec(targetDir: string): boolean {
  return [
    "screenshot.spec.ts",
    "gameplay-smoke.spec.ts",
    "storyboard-playback.spec.ts"
  ].some((file) => existsSync(join(targetDir, "tests", file)));
}
