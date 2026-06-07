import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { CREATE_AURA3D_TEMPLATES, createA3DProject } from "../../../packages/create-aura3d/src";
import { createFightingRouteReadiness } from "../../../packages/create-aura3d/templates/fighting-game/src/game/stage";
import {
  cartoonStudioOptionalAudioAssetKeys,
  cartoonStudioRequiredAssetKeys
} from "../../../packages/create-aura3d/templates/cartoon-studio/src/aura-assets";
import { characters, validateCartoonStudioCharacters } from "../../../packages/create-aura3d/templates/cartoon-studio/src/characters";
import { createCartoonEpisodePackage } from "../../../packages/create-aura3d/templates/cartoon-studio/src/episode-renderer";
import {
  alternateLanguageDubMetadata,
  cartoonStudioShowBibleBatchRenderPlan,
  spanishDubCaptionMetadata
} from "../../../packages/create-aura3d/templates/cartoon-studio/src/render-plan";

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

  test("cartoon-studio template exposes episode scripts, typed asset keys, and character readiness", () => {
    const packageJson = JSON.parse(readFileSync("packages/create-aura3d/templates/cartoon-studio/package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(Object.keys(packageJson.scripts)).toEqual(expect.arrayContaining([
      "episode:plan",
      "episode:preview",
      "episode:render",
      "episode:package",
      "episode:review",
      "episode:verify"
    ]));
    expect(cartoonStudioRequiredAssetKeys).toEqual(["miko", "luma", "moonGarden"]);
    expect(cartoonStudioOptionalAudioAssetKeys).toEqual(expect.arrayContaining([
      "mikoDialogueStem",
      "lumaDialogueStem",
      "moonGardenMusic",
      "moonGardenChimeSfx"
    ]));
    expect(validateCartoonStudioCharacters(characters).every((entry) => entry.ok)).toBe(true);
    const broken = validateCartoonStudioCharacters([{
      ...characters[0],
      primitiveMouthNodeId: "",
      clipRequirements: ["Idle"]
    } as unknown as typeof characters[number]], { requiredClips: ["Idle", "Talk"] })[0];
    expect(broken).toMatchObject({
      ok: false,
      mouthReady: false,
      missingClips: ["Talk"]
    });
  });

  test("cartoon-studio template proves alternate-language dub metadata without inventing assets", () => {
    const spanishDub = alternateLanguageDubMetadata.alternateLanguages[0];
    expect(alternateLanguageDubMetadata.sourceLanguage).toBe("en");
    expect(alternateLanguageDubMetadata.alternateLanguageCount).toBe(1);
    expect(spanishDub.language).toBe("es");
    expect(spanishDub.lineCount).toBeGreaterThan(0);
    expect(spanishDub.captionCueCount).toBe(spanishDub.lineCount);
    expect(spanishDub.stableIds).toMatchObject({
      shotIds: true,
      storyboardIds: true,
      sceneIds: true,
      lineIds: true,
      captionIds: true,
      characterIds: true
    });
    expect(spanishDub.audioStemSlots).toHaveLength(spanishDub.lineCount);
    expect(spanishDub.audioStemSlots.every((slot) => slot.assetRequiredBeforePublish)).toBe(true);
    expect(alternateLanguageDubMetadata.assetPolicy).toMatchObject({
      inventsAudioAssets: false,
      inventsModelAssets: false,
      typedAssetSource: "./src/aura-assets"
    });
    expect(spanishDub.captionMetadata.cues).toEqual(spanishDubCaptionMetadata.cues);
    expect(spanishDub.captionMetadata.cues.every((cue) => cue.language === "es")).toBe(true);
    expect(spanishDub.captionMetadata.cues.some((cue) => cue.text !== cue.sourceText)).toBe(true);
    expect(spanishDub.publishBoundary).toContain("Metadata-only");
  });

  test("cartoon-studio template defines batch rendering from one show bible", () => {
    expect(cartoonStudioShowBibleBatchRenderPlan.guarantees).toMatchObject({
      oneShowBible: true,
      multipleEpisodes: true,
      noInventedAssets: true,
      stableCharacterIds: true,
      stableLocationIds: true,
      stablePropIds: true
    });
    expect(cartoonStudioShowBibleBatchRenderPlan.renderJobs.length).toBeGreaterThanOrEqual(2);
    const sourceStoryBibleId = cartoonStudioShowBibleBatchRenderPlan.sourceStoryBible.episodeId;
    expect(sourceStoryBibleId).toBeTruthy();
    expect(cartoonStudioShowBibleBatchRenderPlan.renderJobs.every((job) => job.sourceStoryBibleEpisodeId === sourceStoryBibleId)).toBe(true);
    expect(new Set(cartoonStudioShowBibleBatchRenderPlan.renderJobs.map((job) => job.episodeId)).size).toBe(
      cartoonStudioShowBibleBatchRenderPlan.renderJobs.length
    );
    expect(cartoonStudioShowBibleBatchRenderPlan.sourceStoryBible.characterIds).toEqual(expect.arrayContaining(["miko", "luma"]));
    expect(cartoonStudioShowBibleBatchRenderPlan.sourceStoryBible.locationIds).toContain("moon-garden");
    expect(cartoonStudioShowBibleBatchRenderPlan.renderJobs.every((job) => job.requiredTypedAssetKeys.includes("miko"))).toBe(true);
    expect(cartoonStudioShowBibleBatchRenderPlan.renderJobs.every((job) => job.requiredTypedAssetKeys.includes("luma"))).toBe(true);
    const packageFilePaths = createCartoonEpisodePackage("package").files.map((file) => file.path);
    expect(packageFilePaths).toEqual(expect.arrayContaining(["dub-metadata.json", "batch-render-plan.json"]));
  });

  test("cartoon-channel still-image puppet experiments are not release-facing routes", () => {
    const main = readFileSync("packages/create-aura3d/templates/cartoon-channel/src/main.ts", "utf8");
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
