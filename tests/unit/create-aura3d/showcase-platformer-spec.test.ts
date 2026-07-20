import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileShowcaseSpec, compileShowcaseSpecFile } from "../../../packages/create-aura3d/src/showcase-spec-compiler";
import type { ShowcaseSpec, ShowcaseSpecAsset } from "../../../packages/create-aura3d/src/showcase-spec-compiler";
import { expectStrictGeneratedSource } from "./generated-source-assertions";

type SkylineSpec = ShowcaseSpec & { readonly platformer: NonNullable<ShowcaseSpec["platformer"]> };
const SHOWCASE_SPEC_COMPILER_TEST_TIMEOUT_MS = 15000;

describe("showcase platformer spec compiler", () => {
  it("requires platformer specs to declare a character hero and world or stage assets", () => {
    const baseSpec = readSkylineSpec();
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-platformer-spec-"));

    try {
      expect(() => compileShowcaseSpec({
        ...baseSpec,
        platformer: {
          ...baseSpec.platformer,
          characterAsset: "showcaseMissingRunner"
        }
      }, { outputDir })).toThrow(/platformer.characterAsset/);

      expect(() => compileShowcaseSpec({
        ...baseSpec,
        platformer: {
          ...baseSpec.platformer,
          worldAssets: []
        }
      }, { outputDir })).toThrow(/platformer.worldAssets/);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("generates a platformer route from typed assets and public root imports only", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-platformer-spec-"));

    try {
      const report = compileShowcaseSpecFile({
        specPath: "tests/fixtures/showcase-spec/skyline-runner.json",
        outputDir
      });

      expect(report.routeId).toBe("showcase-skyline-runner");
      expect(report.finalStatus).toBe("release-ready candidate");
      expect(report.ok).toBe(true);
      expect(report.rejectedAssets).toEqual([]);
      expect(report.selectedReplacement).toBeUndefined();
      expect(report.replacementCandidates).toEqual([]);
      expect(report.blockers).toEqual([]);
      expect(report.blockers).not.toContain("evidence:platformer-asset-pair:verdict-not-pass:fail");
      expect(report.assetPairComposition).toMatchObject({
        verdict: "pass",
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "binding-overlap", verdict: "pass" }),
          expect.objectContaining({ id: "contact", verdict: "pass" }),
          expect.objectContaining({ id: "camera-readability", verdict: "pass" }),
          expect.objectContaining({ id: "scale-contract", verdict: "pass" })
        ])
      });
      expect(report.generatedFiles).toContain("game-template/showcase-skyline-runner-platformer-playable-surfaces.json");
      const generatedSurfaceEvidence = JSON.parse(readFileSync(join(outputDir, "game-template", "showcase-skyline-runner-platformer-playable-surfaces.json"), "utf8"));
      expect(generatedSurfaceEvidence.surfaceMap.evidence.routeOverlay).toBe(baseFixtureRoutePrimaryScreenshot());
      expect(report.blockers).not.toContain("replacement:showcaseKenneyVerdantPlatformerWorld:no-suitable-candidate");
      expect(report.blockers).not.toEqual(expect.arrayContaining([
        "evidence:route-primary-probe:hero-mismatch",
        "evidence:route-primary-probe:missing-hero-asset",
        "evidence:deploy-artifact:command-mismatch",
        "platformer:design:missing-playable-surface-evidence",
        "evidence:platformer-playable-surface:missing"
      ]));
      expect(report.blockers).not.toContain("evidence:release-asset-probe:not-passing:showcasePlatformerWorldLevel");

      const source = readFileSync(join(outputDir, "src", "main.ts"), "utf8");
      expect(source).toContain("import { createAuraApp, game, lights, model, scene } from \"@aura3d/engine\";");
      expect(source).toContain("model(assets.showcaseKenneyOobiPlatformerHero");
      expect(source).toContain("model(assets.showcaseKenneyVerdantPlatformerWorld");
      expect(source).toContain("name: \"platformer-bound-world-asset\"");
      expect(source).toContain("targetMaxDimension: platformerScene.worldModel.targetMaxDimension");
      expect(source).toContain(".position(...platformerScene.worldModel.position).rotate(...platformerScene.worldModel.rotation)");
      expect(source).toContain("game.platformerPresentationSurfaces");
      expect(source).toContain("mode: \"asset-overlay\"");
      expect(source).toContain("guideVisibility: \"public\"");
      expect(source).toContain("targetHeight: 0.32");
      expect(source).toContain("mode: \"follow\"");
      expect(source).toContain("distance: 3.7");
      expect(source).not.toContain("showcasePlatformerWorldLevel");
      expect(source).toContain("game.input");
      expect(source).toContain("game.assetBoundPlatformerLevel");
      expect(source).toContain("game.platformerSceneBinding");
      expect(source).not.toContain("worldModelPresentationOffset");
      expect(source).toContain("game.platformerCameraRig");
      expect(source).not.toContain("camera.follow");
      expect(source).toContain("game.platformer");
      expect(source).toContain('import { gameGeometryContract } from "./generated/game-geometry";');
      expect(source).toContain("const playableSurfaceMap = gameGeometryContract.surfaceMap;");
      expect(source).not.toContain("sha256-9f7c2b49b14458be84aa5509b1c623466b8e468af4414f7ab76adc328d291bdd");
      const geometryContract = readFileSync(join(outputDir, "src", "generated", "game-geometry.ts"), "utf8");
      expect(geometryContract).toContain('\"schema\": \"aura3d-game-geometry-contract/1.0\"');
      expect(geometryContract).toContain("sha256-9f7c2b49b14458be84aa5509b1c623466b8e468af4414f7ab76adc328d291bdd");
      expect(report.generatedFiles).toContain("src/generated/game-geometry.ts");
      expect(report.geometryContract).toMatchObject({
        module: "src/generated/game-geometry.ts",
        sourceReport: "game-template/showcase-skyline-runner-platformer-playable-surfaces.json"
      });
      expect(report.geometryContract?.contentHash).toMatch(/^sha256-[a-f0-9]{64}$/);
      expect(report.geometryContract?.sourceReportHash).toMatch(/^sha256-[a-f0-9]{64}$/);
      expect(source).toContain("playableSurfaceMap,");
      expect(source).toContain("worldAssetBindings: gameGeometryContract.worldAssetBindings");
      expect(source).not.toContain("worldAssetHash");
      expect(source).not.toContain("surfaceSource");
      expect(geometryContract).toContain("worldAssetHash");
      expect(geometryContract).toContain("surfaceSource");
      expect(source).toContain("sceneBinding: platformerScene.evidence");
      expect(source).toContain("surfaceContact: platformerScene.contactPointForPlayer(state.player)");
      expect(source).toContain("platformerScene.toScenePlayer");
      expect(source).toContain("authoredPlayableSeconds");
      expect(source).toContain("assetBinding: level.assetBinding");
      expect(source).toContain("visibleGameGeometrySource: \"surface-map-bound-game-level\"");
      expect(source).toContain("worldAssetUsedForSurfaceEvidence: \"showcaseKenneyVerdantPlatformerWorld\"");
      expect(source).toContain("game.platformerCameraRig");
      expect(source).not.toContain("asset-finish-run");
      expect(source).not.toContain("asset-hazard-gap");
      expect(geometryContract).toContain("asset-finish-run");
      expect(geometryContract).toContain("asset-hazard-gap");
      expect(source).toContain("app.onFrame");
      expect(source).toContain("Object.defineProperty(window, \"__AURA3D_SHOWCASE_SKYLINE_RUNNER__\"");
      expect(source).toContain("controls: {");
      expect(source).toContain("systems: {");
      expect(source).toContain("claimBoundary: ");
      expect(source).not.toContain("platformer-surface-source-world");
      expect(source).not.toContain("visible: false");
      expect(source).not.toContain("primitives.");
      expect(source).not.toContain("unsafeModelUrl");
      expect(source).not.toContain("from \"three\"");
      expect(source).not.toContain("(state.player.x - 18) * 0.08");
      expectStrictGeneratedSource(source);

      const routeHealth = JSON.parse(readFileSync(join(outputDir, "route-health.json"), "utf8"));
      expect(routeHealth.platformer).toMatchObject({
        cameraIntent: "side-scroller",
        characterAsset: "showcaseKenneyOobiPlatformerHero",
        worldAssets: ["showcaseKenneyVerdantPlatformerWorld"],
        gameplayRequirements: ["movement", "jump", "checkpoint", "progression"],
        levelDesign: {
          minPlayableSeconds: 30,
          minCheckpoints: 6,
          requiresHazardRespawn: true,
          requiresFinish: true,
          authoredLevelFlow: true,
          playableSurfaceSource: "asset-derived-playable-surfaces",
          playableSurfaceLayoutValidated: true,
          characterWorldScaleCompatible: true,
          styleCompatible: true,
          primitivePrimaryWorldRejected: true,
          playableSurfaceEvidence: "game-template/showcase-skyline-runner-platformer-playable-surfaces.json"
        }
      });
      expect(routeHealth.evidence).toMatchObject({
        gameplayProof: "tests/reports/showcase-gameplay/showcase-skyline-runner.json",
        gameplayPassed: true
      });
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, SHOWCASE_SPEC_COMPILER_TEST_TIMEOUT_MS);

  it("refuses release-ready platformer output when gameplay proof is missing", () => {
    const baseSpec = readSkylineSpec();
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-platformer-spec-"));

    try {
      const report = compileShowcaseSpec({
        ...baseSpec,
        evidence: {
          ...baseSpec.evidence,
          gameplayPassed: false
        }
      }, { outputDir });

      expect(report.ok).toBe(false);
      expect(report.finalStatus).toBe("prototype-blocked");
      expect(report.blockers).toContain("evidence:gameplay-not-passed");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, SHOWCASE_SPEC_COMPILER_TEST_TIMEOUT_MS);

  it("keeps stale one-anchor evidence blocked while using current mesh-derived surfaces", () => {
    const baseSpec = readSkylineSpec();
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-platformer-spec-"));
    const proofDir = `tests/reports/showcase-platformer-spec-unit-${process.pid}-${Date.now()}-single-anchor`;
    mkdirSync(proofDir, { recursive: true });
    const routePrimaryScreenshotPath = join(proofDir, "route-primary.png");
    const playableSurfaceEvidencePath = join(proofDir, "playable-surfaces.json");
    writeFileSync(routePrimaryScreenshotPath, onePixelPng());
    writeFileSync(
      playableSurfaceEvidencePath,
      `${JSON.stringify(withoutPlatformerAnchorPairs(createPassingPlayableSurfaceEvidence(routePrimaryScreenshotPath)), null, 2)}\n`
    );

    try {
      const report = compileShowcaseSpec({
        ...baseSpec,
        primaryAssets: baseSpec.primaryAssets.map(omitAssetPolicy),
        platformer: {
          ...baseSpec.platformer,
          levelDesign: {
            ...baseSpec.platformer.levelDesign,
            playableSurfaceSource: "asset-derived-playable-surfaces",
            playableSurfaceEvidence: playableSurfaceEvidencePath
          }
        },
        evidence: {
          ...baseSpec.evidence,
          routePrimaryScreenshot: routePrimaryScreenshotPath
        }
      }, { outputDir });

      expect(report.ok).toBe(false);
      expect(report.finalStatus).toBe("prototype-blocked");
      expect(report.blockers).not.toContain("evidence:platformer-playable-surface:mesh-extraction-not-passing");
      expect(report.blockers).toContain("evidence:route-primary-probe:screenshot-mismatch");
      expect(report.blockers).toContain("evidence:platformer-asset-pair:composition-report-screenshot");

      const providedEvidence = JSON.parse(readFileSync(playableSurfaceEvidencePath, "utf8"));
      expect(providedEvidence).toMatchObject({
        pass: true,
        surfaceSource: "asset-derived-playable-surfaces",
        surfaceMap: {
          assetId: "showcaseSideScrollerWorld",
          source: "asset-mesh-extracted"
        },
        meshExtraction: {
          status: "pass"
        }
      });
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
      rmSync(proofDir, { recursive: true, force: true });
    }
  });

  it("rejects platformer public output when the character/world fit and playable length are not proven", () => {
    const baseSpec = readSkylineSpec();
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-platformer-spec-"));

    try {
      const report = compileShowcaseSpec({
        ...baseSpec,
        primaryAssets: baseSpec.primaryAssets.map(omitAssetPolicy),
        platformer: {
          ...baseSpec.platformer,
          levelDesign: {
            ...baseSpec.platformer.levelDesign,
            minPlayableSeconds: 8,
            minCheckpoints: 1,
            requiresHazardRespawn: false,
            requiresFinish: false,
            authoredLevelFlow: false,
            playableSurfaceSource: "authored-route-rectangles",
            playableSurfaceLayoutValidated: false,
            characterWorldScaleCompatible: false,
            styleCompatible: false,
            primitivePrimaryWorldRejected: false
          }
        }
      }, { outputDir });

      expect(report.ok).toBe(false);
      expect(report.finalStatus).toBe("prototype-blocked");
      expect(report.blockers).toEqual(expect.arrayContaining([
        "platformer:design:min-playable-seconds-too-low:8",
        "platformer:design:min-checkpoints-too-low:1",
        "platformer:design:hazard-respawn-not-required",
        "platformer:design:finish-not-required",
        "platformer:design:authored-level-flow-missing",
        "platformer:design:missing-release-safe-playable-surfaces:authored-route-rectangles",
        "platformer:design:playable-surface-layout-not-validated",
        "platformer:asset-fit:character-world-scale-incompatible",
        "platformer:asset-fit:style-incompatible",
        "platformer:visual:primitive-primary-world-not-rejected",
        "evidence:platformer-playable-surface:not-release-safe:authored-route-rectangles",
        "evidence:platformer-playable-surface:not-passing",
        "evidence:platformer-playable-surface:style-incompatible",
        "evidence:platformer-playable-surface:scale-incompatible",
        "evidence:platformer-playable-surface:primitive-primary-world-not-rejected"
      ]));
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("blocks public platformer output when the composition report is not bound to the current route-primary screenshot hash", () => {
    const baseSpec = readSkylineSpec();
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-platformer-spec-"));
    const proofDir = `tests/reports/showcase-platformer-spec-unit-${process.pid}-${Date.now()}-stale-composition`;
    mkdirSync(proofDir, { recursive: true });
    const compositionReportPath = join(proofDir, "asset-pair-composition.json");
    const retainedReport = JSON.parse(readFileSync(baseSpec.evidence.assetPairCompositionReport!, "utf8"));
    writeFileSync(compositionReportPath, `${JSON.stringify({
      ...retainedReport,
      verdict: "pass",
      pass: true,
      screenshot: {
        ...retainedReport.screenshot,
        sha256: "sha256-0000000000000000000000000000000000000000000000000000000000000000"
      },
      checks: retainedReport.checks.map((check: Record<string, unknown>) => ({ ...check, verdict: "pass", blockers: [] })),
      blockers: []
    }, null, 2)}\n`);

    try {
      const report = compileShowcaseSpec({
        ...baseSpec,
        primaryAssets: baseSpec.primaryAssets.map(omitAssetPolicy),
        evidence: {
          ...baseSpec.evidence,
          assetPairCompositionReport: compositionReportPath
        }
      }, { outputDir });

      expect(report.ok).toBe(false);
      expect(report.finalStatus).toBe("prototype-blocked");
      expect(report.blockers).toContain("evidence:platformer-asset-pair:screenshot-sha256-mismatch");
      expect(report.blockers).toContain("evidence:platformer-asset-pair:screenshot:file-sha256-mismatch");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
      rmSync(proofDir, { recursive: true, force: true });
    }
  });

  it("only marks Skyline release-ready when route-primary, gameplay, deploy, and release probes all pass", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-platformer-spec-"));
    const proofDir = `tests/reports/showcase-spec-compiler-unit-${process.pid}-${Date.now()}`;
    mkdirSync(proofDir, { recursive: true });
    const baseSpec = readSkylineSpec();
    const deployEvidencePath = join(proofDir, "deploy.json");
    const gameplayProofPath = join(proofDir, "gameplay.json");
    const playableSurfaceEvidencePath = join(proofDir, "playable-surfaces.json");
    const routePrimaryProbePath = join(proofDir, "route-primary.json");
    const routePrimaryScreenshotPath = join(proofDir, "route-primary.png");
    const compositionReportPath = join(proofDir, "asset-pair-composition.json");
    const screenshotBytes = onePixelPng();
    const screenshotSha256 = sha256ForBytes(screenshotBytes);
    const worldAssetId = "showcaseReadablePlatformLevel";
    const expectedAssetIds = [baseSpec.platformer.characterAsset, worldAssetId];
    const playableSurfaceEvidence = createPassingPlayableSurfaceEvidence(routePrimaryScreenshotPath, {
      characterAssetId: baseSpec.platformer.characterAsset,
      worldAssetId,
      worldAssetHash: "sha256-56edd8acc1a8c803bef3e5a13044a9ee4a903bafae4e80fc3a9e6e49697c0c68",
      meshReason: "mesh-derived platformer surfaces from 152 primitive(s)"
    });
    const surfaceMap = {
      ...playableSurfaceEvidence.surfaceMap,
      source: "manifest-authored-overlay-validated" as const,
      modelAlignment: {
        ...playableSurfaceEvidence.surfaceMap.modelAlignment,
        source: "manifest-authored-overlay-validated" as const
      }
    };
    const overlayValidatedSurfaceEvidence = {
      ...playableSurfaceEvidence,
      surfaceSource: "asset-bound-playable-surfaces",
      surfaceMap,
      meshExtraction: {
        status: "overlay-validated",
        reasons: [
          "hash-bound platformer surface map overlays the retained route-primary screenshot"
        ],
        blockers: []
      }
    };
    const geometryEvidence = createPassingPlatformerGeometryEvidence(
      playableSurfaceEvidencePath,
      routePrimaryScreenshotPath,
      screenshotSha256,
      [
        {
          id: baseSpec.platformer.characterAsset,
          hash: baseSpec.primaryAssets.find((asset) => asset.id === baseSpec.platformer.characterAsset)?.id === "showcaseKenneyOobiPlatformerHero"
            ? "sha256-3f82114135cdf4b627d463901308eb0dcf4bbbb10f1958f044eaa42160ad5df5"
            : "sha256-93872fc24240a071b6195d6f1339f40b09b3308dc998311252d21ebd9042d8c6"
        },
        {
          id: worldAssetId,
          hash: "sha256-56edd8acc1a8c803bef3e5a13044a9ee4a903bafae4e80fc3a9e6e49697c0c68"
        }
      ]
    );
    const releaseProbePaths = Object.fromEntries(expectedAssetIds.map((assetId) => {
      const path = join(proofDir, `${assetId}.json`);
      writeFileSync(path, `${JSON.stringify(createPassingReleaseProbe(assetId), null, 2)}\n`);
      return [assetId, path];
    }));
    const deployCommand = `pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/showcase-skyline-runner/dist --release --source apps/showcase-skyline-runner/src --asset ${baseSpec.platformer.characterAsset} --asset ${worldAssetId}`;
    writeFileSync(deployEvidencePath, `${JSON.stringify(createPassingDeployEvidence(deployCommand, expectedAssetIds), null, 2)}\n`);
    writeFileSync(routePrimaryScreenshotPath, screenshotBytes);
    writeFileSync(
      playableSurfaceEvidencePath,
      `${JSON.stringify(overlayValidatedSurfaceEvidence, null, 2)}\n`
    );
    writeFileSync(gameplayProofPath, `${JSON.stringify(createPassingPlatformerGameplayProof(routePrimaryScreenshotPath), null, 2)}\n`);
    writeFileSync(routePrimaryProbePath, `${JSON.stringify(createPassingRoutePrimaryProbe(baseSpec.platformer.characterAsset, routePrimaryScreenshotPath, screenshotSha256), null, 2)}\n`);
    writeFileSync(compositionReportPath, `${JSON.stringify(createPassingCompositionReport({
      routeId: "showcase-skyline-runner",
      category: "platformer",
      screenshotPath: routePrimaryScreenshotPath,
      screenshotSha256,
      geometryReport: playableSurfaceEvidencePath,
      geometrySource: "manifest-authored-overlay-validated",
      geometryAssetId: worldAssetId,
      geometryAssetHash: geometryEvidence.assets[1].hash,
      assets: geometryEvidence.assets
    }), null, 2)}\n`);

    try {
      const characterAsset = baseSpec.primaryAssets.find((asset) => asset.id === baseSpec.platformer.characterAsset);
      if (characterAsset === undefined) throw new Error("Skyline fixture is missing its platformer character primary asset");
      const worldAsset: ShowcaseSpecAsset = {
        id: worldAssetId,
        typedRef: `assets.${worldAssetId}`,
        role: "world",
        quality: "release",
        hasDurableProvenance: true,
        hasRenderedProbe: true,
        hasOrientationEvidence: true,
        hasForegroundBounds: true
      };

      const report = compileShowcaseSpec({
        ...baseSpec,
        primaryAssets: [
          {
            ...omitAssetPolicy(characterAsset),
            quality: "release",
            hasDurableProvenance: true,
            hasRenderedProbe: true,
            hasOrientationEvidence: true,
            hasForegroundBounds: true
          },
          worldAsset
        ],
        platformer: {
          ...baseSpec.platformer,
          worldAssets: [worldAssetId],
          levelDesign: {
            ...baseSpec.platformer?.levelDesign,
            playableSurfaceSource: "asset-bound-playable-surfaces",
            playableSurfaceMap: surfaceMap,
            playableSurfaceEvidence: playableSurfaceEvidencePath,
            assetPairEvidence: createPassingAssetPairEvidence(
              "platformer",
              expectedAssetIds,
              routePrimaryScreenshotPath,
              routePrimaryProbePath,
              screenshotSha256,
              geometryEvidence
            )
          }
        },
        evidence: {
          ...baseSpec.evidence,
          routePrimaryProbe: routePrimaryProbePath,
          routePrimaryScreenshot: routePrimaryScreenshotPath,
          gameplayProof: gameplayProofPath,
          deployCommand,
          deployEvidence: deployEvidencePath,
          deployPassed: true,
          routePrimaryPassed: true,
          gameplayPassed: true,
          releaseAssetProbes: releaseProbePaths,
          assetPairCompositionReport: compositionReportPath
        }
      }, { outputDir });

      expect(report.ok).toBe(true);
      expect(report.finalStatus).toBe("release-ready candidate");
      expect(report.blockers).toEqual([]);
      expect(report.selectedReplacement).toBeUndefined();
      const routeHealth = JSON.parse(readFileSync(join(outputDir, "route-health.json"), "utf8"));
      expect(routeHealth.gameAssetPairEvidence?.geometryEvidence).toEqual(geometryEvidence);
      expect(routeHealth.gameAssetPairEvidence?.compositionReport).toBe(compositionReportPath);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
      rmSync(proofDir, { recursive: true, force: true });
    }
  });

  it("keeps the active world blocked on catalog and visual evidence after mesh extraction passes", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-platformer-spec-"));

    try {
      const report = compileShowcaseSpec(createLegacySkylineReplacementSpec(readSkylineSpec()), { outputDir });

      expect(report.ok).toBe(false);
      expect(report.finalStatus).toBe("prototype-blocked");
      expect(report.rejectedAssets.map((asset) => asset.id)).toContain("showcasePlatformerWorldLevel");
      expect(report.rejectedAssets.map((asset) => asset.id)).not.toContain("showcaseSideScrollerWorld");
      expect(report.blockers).not.toContain("replacement:showcasePlatformerWorldLevel:no-suitable-candidate");
      expect(report.blockers).not.toEqual(expect.arrayContaining([
        expect.stringContaining("evidence:platformer-playable-surface:asset-extraction")
      ]));
      expect(report.blockers).not.toContain("evidence:platformer-asset-pair:verdict-not-pass:fail");
      expect(report.blockers).toContain("evidence:platformer-playable-surface:style-incompatible");
      expect(report.selectedReplacement).toEqual(expect.objectContaining({
        id: "showcaseSideScrollerWorld",
        replaces: "showcasePlatformerWorldLevel",
        reasons: expect.arrayContaining([
          "mesh-derived playable-surface evidence matches candidate"
        ])
      }));
      expect(report.replacementCandidates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "showcaseSideScrollerWorld",
          accepted: true,
          penalties: [],
          reasons: expect.arrayContaining(["mesh-derived playable-surface evidence matches candidate"])
        })
      ]));
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, SHOWCASE_SPEC_COMPILER_TEST_TIMEOUT_MS);

  it("selects a replacement world with hash-bound overlay-validated playable surfaces", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-platformer-spec-"));
    const projectDir = mkdtempSync(join(tmpdir(), "aura3d-platformer-project-"));
    const routePrimaryScreenshot = "tests/reports/showcase-route-primary-probes/showcase-skyline-runner.png";
    const passingSurfaceMap = createPassingPlayableSurfaceEvidence(routePrimaryScreenshot).surfaceMap;
    const surfaceMap = {
      ...passingSurfaceMap,
      source: "manifest-authored-overlay-validated" as const,
      modelAlignment: {
        ...passingSurfaceMap.modelAlignment,
        source: "manifest-authored-overlay-validated" as const
      }
    };

    try {
      writeFileSync(join(projectDir, "aura.assets.json"), `${JSON.stringify({
        schema: "aura3d.assets/1.0",
        assets: [
          {
            id: "showcasePlatformerWorldLevel",
            type: "model",
            format: "glb",
            url: "/aura-assets/showcasePlatformerWorldLevel.glb",
            role: "world",
            quality: "release",
            hash: "sha256-2fc1b7837a806baf57e497da880e1415908eaa85eee2795da0faf579fff1eeec"
          },
          {
            id: "showcaseSideScrollerWorld",
            type: "model",
            format: "glb",
            url: "/aura-assets/showcaseSideScrollerWorld.glb",
            role: "world",
            quality: "release",
            hash: surfaceMap.assetHash,
            provenance: {
              sourcePage: "https://huggingface.co/datasets/aura3d/fixture-side-scroller-world",
              downloadUrl: "/aura-assets/showcaseSideScrollerWorld.glb",
              license: "CC-BY-4.0",
              licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
              author: "Gold"
            },
            suitabilityReason: "Side-scroller world replacement includes a retained hash-bound playable surface map.",
            renderedProbe: {
              url: "tests/reports/showcase-release-asset-probes/showcaseSideScrollerWorld.png",
              foregroundBounds: { x: 64, y: 44, width: 578, height: 418 }
            },
            orientation: {
              forwardAxis: "-Z",
              evidence: routePrimaryScreenshot
            },
            gameGeometry: {
              playableSurfaceMap: surfaceMap
            }
          }
        ]
      }, null, 2)}\n`);

      const report = compileShowcaseSpec(createUnboundSkylineWorldReplacementSpec(readSkylineSpec()), {
        outputDir,
        projectDir
      });

      expect(report.selectedReplacement).toMatchObject({
        id: "showcaseSideScrollerWorld",
        replaces: "showcasePlatformerWorldLevel",
        role: "world",
        reasons: expect.arrayContaining([
          "overlay-validated playable-surface evidence matches candidate",
          "mesh extraction did not produce a candidate; retained hash-bound surface evidence accepted"
        ])
      });
      expect(report.blockers).not.toContain("replacement:showcasePlatformerWorldLevel:no-suitable-candidate");
      expect(report.replacementCandidates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "showcaseSideScrollerWorld",
          accepted: true,
          selected: true,
          reasons: expect.arrayContaining([
            "overlay-validated playable-surface evidence matches candidate",
            "mesh extraction did not produce a candidate; retained hash-bound surface evidence accepted"
          ]),
          penalties: []
        })
      ]));
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("keeps Skyline prototype-blocked when replacement ranking finds no durable candidate", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-platformer-spec-"));
    const projectDir = mkdtempSync(join(tmpdir(), "aura3d-platformer-project-"));
    const baseSpec = createLegacySkylineReplacementSpec(readSkylineSpec());

    try {
      writeFileSync(join(projectDir, "aura.assets.json"), `${JSON.stringify({
        schema: "aura3d.assets/1.0",
        assets: [
          {
            id: "showcasePlatformerWorldLevel",
            type: "model",
            format: "glb",
            url: "/aura-assets/rejected.glb",
            hash: "sha256-2fc1b7837a806baf57e497da880e1415908eaa85eee2795da0faf579fff1eeec"
          },
          {
            id: "unprovenReplacement",
            type: "model",
            format: "glb",
            url: "/aura-assets/unproven.glb",
            role: "world",
            quality: "release",
            hash: "sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
          }
        ]
      }, null, 2)}\n`);

      const report = compileShowcaseSpec(baseSpec, { outputDir, projectDir });

      expect(report.finalStatus).toBe("prototype-blocked");
      expect(report.rejectedAssets.map((asset) => asset.id)).toContain("showcasePlatformerWorldLevel");
      expect(report.selectedReplacement).toBeUndefined();
      expect(report.blockers).toContain("replacement:showcasePlatformerWorldLevel:no-suitable-candidate");
      expect(report.replacementCandidates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "unprovenReplacement",
          accepted: false,
          penalties: expect.arrayContaining([
            "missing durable provenance",
            "missing passing release probe"
          ])
        })
      ]));
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

function baseFixtureRoutePrimaryScreenshot(): string {
  return readSkylineSpec().evidence.routePrimaryScreenshot;
}

function readSkylineSpec(): SkylineSpec {
  return JSON.parse(readFileSync("tests/fixtures/showcase-spec/skyline-runner.json", "utf8")) as SkylineSpec;
}

function omitAssetPolicy(asset: ShowcaseSpecAsset): ShowcaseSpecAsset {
  const { assetPolicy: _assetPolicy, ...assetWithoutPolicy } = asset;
  return assetWithoutPolicy;
}

function createLegacySkylineReplacementSpec(baseSpec: SkylineSpec): SkylineSpec {
  const characterAsset = baseSpec.primaryAssets.find((asset) => asset.id === baseSpec.platformer.characterAsset);
  const currentWorldAsset = baseSpec.primaryAssets.find((asset) => asset.id === baseSpec.platformer.worldAssets[0]);
  const sideScrollerAsset = currentWorldAsset && {
    ...currentWorldAsset,
    id: "showcaseSideScrollerWorld",
    typedRef: "assets.showcaseSideScrollerWorld"
  };
  if (characterAsset === undefined) {
    throw new Error("Skyline fixture is missing its platformer character primary asset");
  }
  const worldLevelAsset: ShowcaseSpecAsset = {
    id: "showcasePlatformerWorldLevel",
    typedRef: "assets.showcasePlatformerWorldLevel",
    role: "world",
    quality: "release",
    hasDurableProvenance: true,
    hasRenderedProbe: true,
    hasOrientationEvidence: true,
    hasForegroundBounds: true,
    assetPolicy: {
      allowReplacement: true,
      replacementQuery: "platformer side-scroller world stage",
      requiredRole: "platformer-world",
      minQuality: "release",
      requireRenderedProbe: true,
      requireDeployPass: true
    }
  };

  return {
    ...baseSpec,
    primaryAssets: [
      characterAsset,
      worldLevelAsset,
      ...(sideScrollerAsset ? [sideScrollerAsset] : [])
    ],
    platformer: {
      ...baseSpec.platformer,
      worldAssets: ["showcasePlatformerWorldLevel", "showcaseSideScrollerWorld"],
      levelDesign: {
        ...baseSpec.platformer.levelDesign,
        ...(baseSpec.platformer.levelDesign.playableSurfaceMap
          ? {
              playableSurfaceMap: {
                ...baseSpec.platformer.levelDesign.playableSurfaceMap,
                assetId: "showcaseSideScrollerWorld",
                assetHash: "sha256-68e115700a600bb3cfee70d0e0f75083c07cb6e38f29379aa935d871681a59b4"
              }
            }
          : {}),
        ...(baseSpec.platformer.levelDesign.assetPairEvidence
          ? {
              assetPairEvidence: {
                ...baseSpec.platformer.levelDesign.assetPairEvidence,
                assets: [
                  baseSpec.platformer.characterAsset,
                  "showcasePlatformerWorldLevel",
                  "showcaseSideScrollerWorld"
                ]
              }
            }
          : {})
      }
    },
    evidence: {
      ...baseSpec.evidence,
      releaseAssetProbes: {
        ...baseSpec.evidence.releaseAssetProbes,
        showcasePlatformerWorldLevel: "tests/reports/showcase-release-asset-probes/showcasePlatformerWorldLevel.json"
      }
    }
  };
}

function createUnboundSkylineWorldReplacementSpec(baseSpec: SkylineSpec): SkylineSpec {
  const characterAsset = baseSpec.primaryAssets.find((asset) => asset.id === baseSpec.platformer.characterAsset);
  if (characterAsset === undefined) {
    throw new Error("Skyline fixture is missing its platformer character primary asset");
  }
  const rejectedWorldAsset: ShowcaseSpecAsset = {
    id: "showcasePlatformerWorldLevel",
    typedRef: "assets.showcasePlatformerWorldLevel",
    role: "world",
    quality: "release",
    hasDurableProvenance: true,
    hasRenderedProbe: true,
    hasOrientationEvidence: true,
    hasForegroundBounds: true,
    assetPolicy: {
      allowReplacement: true,
      replacementQuery: "platformer side-scroller world stage playable surfaces",
      requiredRole: "platformer-world",
      minQuality: "release",
      requireRenderedProbe: true,
      requireDeployPass: true
    }
  };
  const {
    playableSurfaceMap: _playableSurfaceMap,
    playableSurfaceEvidence: _playableSurfaceEvidence,
    assetPairEvidence: _assetPairEvidence,
    ...levelDesign
  } = baseSpec.platformer.levelDesign;

  return {
    ...baseSpec,
    primaryAssets: [characterAsset, rejectedWorldAsset],
    platformer: {
      ...baseSpec.platformer,
      worldAssets: [rejectedWorldAsset.id],
      levelDesign: {
        ...levelDesign,
        playableSurfaceSource: "authored-route-rectangles",
        playableSurfaceLayoutValidated: false,
        characterWorldScaleCompatible: false,
        styleCompatible: false
      }
    },
    evidence: {
      ...baseSpec.evidence,
      deployCommand: replaceAssetToken(baseSpec.evidence.deployCommand, baseSpec.platformer.worldAssets[0]!, rejectedWorldAsset.id),
      releaseAssetProbes: {
        ...baseSpec.evidence.releaseAssetProbes,
        [rejectedWorldAsset.id]: `tests/reports/showcase-release-asset-probes/${rejectedWorldAsset.id}.json`
      }
    }
  };
}

function replaceAssetToken(command: string, fromAssetId: string, toAssetId: string): string {
  return command.split(" ").map((token) => token === fromAssetId ? toAssetId : token).join(" ");
}

function createPassingCompositionReport(input: {
  readonly routeId: string;
  readonly category: "racing" | "platformer";
  readonly screenshotPath: string;
  readonly screenshotSha256: string;
  readonly geometryReport: string;
  readonly geometrySource: "asset-mesh-extracted" | "manifest-authored-overlay-validated";
  readonly geometryAssetId: string;
  readonly geometryAssetHash: string;
  readonly assets: readonly { readonly id: string; readonly hash: string }[];
}) {
  const checkIds = ["binding-overlap", "contact", "camera-readability", "scale-contract", "debug-guide-absence"] as const;
  return {
    schema: "aura3d-showcase-asset-pair-composition/1.0",
    routeId: input.routeId,
    category: input.category,
    verdict: "pass",
    pass: true,
    screenshot: { path: input.screenshotPath, sha256: input.screenshotSha256, width: 1, height: 1 },
    geometry: {
      report: input.geometryReport,
      assetId: input.geometryAssetId,
      assetHash: input.geometryAssetHash,
      source: input.geometrySource,
      modelAnchorCount: 2
    },
    assets: input.assets.map((asset) => ({ id: asset.id, manifestHash: asset.hash, evidenceHash: asset.hash })),
    thresholds: {},
    checks: checkIds.map((id) => ({ id, verdict: "pass", tolerance: {}, measured: {}, blockers: [] })),
    blockers: []
  } as const;
}

function createPassingAssetPairEvidence(
  category: "platformer",
  assets: readonly string[],
  screenshotEvidence: string,
  routePrimaryProbe: string,
  screenshotSha256: string,
  geometryEvidence?: unknown
) {
  return {
    category,
    assets,
    screenshotEvidence,
    routePrimaryProbe,
    screenshotSha256,
    ...(geometryEvidence === undefined ? {} : { geometryEvidence }),
    verdict: "pass",
    notes: "Unit fixture proving the retained screenshot visually accepts the public game asset pairing.",
    blockers: []
  } as const;
}

function createPassingPlatformerGeometryEvidence(
  report: string,
  screenshotEvidence: string,
  routePrimaryScreenshotSha256: string,
  assets: readonly { readonly id: string; readonly hash: string }[]
) {
  return {
    category: "platformer",
    kind: "platformer-playable-surface-map",
    source: "manifest-authored-overlay-validated",
    report,
    screenshotEvidence,
    routePrimaryScreenshotSha256,
    assets
  } as const;
}

function createPassingPlayableSurfaceEvidence(
  routePrimaryScreenshotPath: string,
  options: {
    readonly characterAssetId?: string;
    readonly worldAssetId?: string;
    readonly worldAssetHash?: string;
    readonly meshReason?: string;
  } = {}
) {
  const characterAssetId = options.characterAssetId ?? "showcaseWalkAnimatedGirl";
  const worldAssetId = options.worldAssetId ?? "showcaseSideScrollerWorld";
  const worldAssetHash = options.worldAssetHash ?? "sha256-68e115700a600bb3cfee70d0e0f75083c07cb6e38f29379aa935d871681a59b4";
  const meshReason = options.meshReason ?? "mesh-derived platformer surfaces from 16 primitive(s)";
  return {
    schema: "aura3d-platformer-playable-surfaces/1.0",
    routeId: "showcase-skyline-runner",
    generatedBy: "showcase-spec-compiler",
    surfaceSource: "asset-derived-playable-surfaces",
    templateCapabilityStatus: "asset-derived-playable-surfaces-proven",
    characterAsset: characterAssetId,
    worldAssets: [worldAssetId],
    assetHash: worldAssetHash,
    surfaceMap: {
      assetId: worldAssetId,
      assetHash: worldAssetHash,
      source: "asset-mesh-extracted",
      surfaces: [
        { id: "skyline-main-runway", x: 2.4, y: 0, width: 7.4, height: 0.34, kind: "ground" },
        { id: "skyline-lower-bridge", x: 8.7, y: 0.24, width: 5.6, height: 0.34, kind: "platform" },
        { id: "skyline-mid-span", x: 14.4, y: 0.52, width: 6.2, height: 0.34, kind: "platform" },
        { id: "skyline-gap-run", x: 21.2, y: 0.16, width: 6.8, height: 0.34, kind: "platform" },
        { id: "skyline-upper-run", x: 25.6, y: 0.48, width: 4.2, height: 0.34, kind: "platform" },
        { id: "skyline-finish-ledges", x: 29.6, y: 0.34, width: 7.8, height: 0.34, kind: "finish" },
        { id: "hazard-gap-01", x: 17.8, y: 0.58, width: 0.52, height: 0.28, kind: "hazard" },
        { id: "hazard-gap-02", x: 25.4, y: 0.74, width: 0.52, height: 0.28, kind: "hazard" },
        { id: "checkpoint-01", x: 5.6, y: 0.8, width: 1.1, height: 1.1, kind: "checkpoint" },
        { id: "checkpoint-02", x: 10.8, y: 1.02, width: 1.1, height: 1.1, kind: "checkpoint" },
        { id: "checkpoint-03", x: 16.2, y: 1.2, width: 1.1, height: 1.1, kind: "checkpoint" },
        { id: "checkpoint-04", x: 22.8, y: 1.0, width: 1.1, height: 1.1, kind: "checkpoint" },
        { id: "checkpoint-05", x: 29.6, y: 1.08, width: 1.1, height: 1.1, kind: "checkpoint" },
        { id: "checkpoint-finish", x: 33.2, y: 0.96, width: 1.1, height: 1.1, kind: "checkpoint" }
      ],
      levelLength: 37.2,
      estimatedCompletionSeconds: 36,
      characterScaleRatio: 0.42,
      confidence: 0.72,
      modelAlignment: {
        source: "asset-mesh-extracted",
        modelBounds: {
          min: [-192.317, -102.591, -85.575],
          max: [188.919, 206.984, 238.905]
        },
        modelPoint: [-1.699, -102.591, 76.665],
        gamePoint: { x: 16.1, y: 0 },
        anchorPairs: [
          {
            id: "skyline-main-runway-anchor",
            modelPoint: [-1.699, -102.591, 76.665],
            gamePoint: { x: 16.1, y: 0 }
          },
          {
            id: "skyline-finish-anchor",
            modelPoint: [120, -102, 145],
            gamePoint: { x: 29.6, y: 0.34 }
          }
        ],
        evidence: {
          routeOverlay: routePrimaryScreenshotPath,
          notes: "Unit fixture for hash-bound platformer model alignment."
        }
      },
      evidence: {
        sourceAsset: `assets.${worldAssetId}`,
        renderedProbe: `tests/reports/showcase-release-asset-probes/${worldAssetId}.png`,
        routeOverlay: routePrimaryScreenshotPath,
        notes: "Unit fixture for hash-bound playable-surface validation."
      }
    },
    assetBindings: [
      {
        kind: "aura-game-asset-bound-platformer-level",
        layoutContractVersion: "1.0",
        generatedFrom: "mesh-derived-playable-surface-map",
        characterAsset: characterAssetId,
        worldAsset: worldAssetId,
        worldAssetHash,
        surfaceSource: "asset-mesh-extracted",
        characterScaleRatio: 0.42,
        confidence: 0.72,
        surfaceIds: [
          "skyline-main-runway",
          "skyline-lower-bridge",
          "skyline-mid-span",
          "skyline-gap-run",
          "skyline-upper-run"
        ]
      }
    ],
    meshExtraction: {
      status: "pass",
      reasons: [meshReason],
      blockers: []
    },
    authoredPlayableSeconds: 36,
    minPlayableSeconds: 30,
    start: { x: -0.5, y: 0.36 },
    finish: { x: 33.5, y: 0.7 },
    surfaces: [
      { id: "skyline-main-runway", x: 2.4, y: 0, width: 7.4, height: 0.34, worldAsset: worldAssetId, evidenceRole: "playable-surface" },
      { id: "skyline-lower-bridge", x: 8.7, y: 0.24, width: 5.6, height: 0.34, worldAsset: worldAssetId, evidenceRole: "playable-surface" },
      { id: "skyline-mid-span", x: 14.4, y: 0.52, width: 6.2, height: 0.34, worldAsset: worldAssetId, evidenceRole: "playable-surface" },
      { id: "skyline-gap-run", x: 21.2, y: 0.16, width: 6.8, height: 0.34, worldAsset: worldAssetId, evidenceRole: "playable-surface" },
      { id: "skyline-upper-run", x: 25.6, y: 0.48, width: 4.2, height: 0.34, worldAsset: worldAssetId, evidenceRole: "playable-surface" },
      { id: "skyline-finish-ledges", x: 29.6, y: 0.34, width: 7.8, height: 0.34, worldAsset: worldAssetId, evidenceRole: "finish-run" }
    ],
    checkpoints: [
      { id: "checkpoint-01", x: 5.6, y: 0.8, radius: 0.9 },
      { id: "checkpoint-02", x: 10.8, y: 1.02, radius: 0.9 },
      { id: "checkpoint-03", x: 16.2, y: 1.2, radius: 0.9 },
      { id: "checkpoint-04", x: 22.8, y: 1.0, radius: 0.9 },
      { id: "checkpoint-05", x: 29.6, y: 1.08, radius: 0.9 },
      { id: "checkpoint-finish", x: 33.2, y: 0.96, radius: 0.9 }
    ],
    hazards: [
      { id: "hazard-gap-01", x: 17.8, y: 0.58, width: 0.52, height: 0.28, respawn: true },
      { id: "hazard-gap-02", x: 25.4, y: 0.74, width: 0.52, height: 0.28, respawn: true }
    ],
    styleCompatible: true,
    scaleCompatible: true,
    primitivePrimaryWorldRejected: true,
    pass: true,
    failures: []
  };
}

function withoutPlatformerAnchorPairs(evidence: ReturnType<typeof createPassingPlayableSurfaceEvidence>) {
  const { anchorPairs: _anchorPairs, ...modelAlignment } = evidence.surfaceMap.modelAlignment;
  return {
    ...evidence,
    surfaceMap: {
      ...evidence.surfaceMap,
      modelAlignment
    }
  };
}

function createPassingReleaseProbe(assetId: string) {
  return {
    schema: "aura3d-showcase-release-asset-probe/1.0",
    generatedAt: "2026-06-22T00:00:00.000Z",
    screenshotPath: `tests/reports/showcase-release-asset-probes/${assetId}.png`,
    renderedProbe: {
      url: `tests/reports/showcase-release-asset-probes/${assetId}.png`,
      kind: "browser-screenshot",
      renderer: "createAuraApp @aura3d/engine showcase release asset probe",
      route: `tests/browser/showcase-release-asset-probe-harness?asset=${assetId}`,
      width: 752,
      height: 600,
      checkedAt: "2026-06-22T00:00:00.000Z",
      sha256: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      assetHash: "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      nonBlankPixels: 42000,
      colorBuckets: 18,
      foregroundBounds: {
        x: 120,
        y: 96,
        width: 320,
        height: 240
      }
    },
    evidence: {
      asset: {
        id: assetId,
        typed: `assets.${assetId}`,
        hash: "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      },
      pass: true,
      failures: []
    }
  };
}

function createPassingRoutePrimaryProbe(heroAssetId: string, screenshotPath: string, screenshotSha256: string) {
  return {
    schema: "aura3d-route-primary-probe/1.0",
    routeId: "showcase-skyline-runner",
    routePrimaryHeroAsset: heroAssetId,
    primaryAssets: [{
      id: heroAssetId,
      role: "character",
      expectedTypedRef: `assets.${heroAssetId}`,
      renderedProbe: {
        screenshotPath,
        sha256: screenshotSha256,
        visible: true,
        clipped: false,
        nonBlankPixels: 42000,
        colorBuckets: 18,
        foregroundBounds: { x: 120, y: 96, width: 320, height: 240 },
        failures: []
      }
    }],
    pass: true,
    failures: []
  };
}

function onePixelPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
}

function sha256ForBytes(bytes: Buffer): string {
  return `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
}

function createPassingPlatformerGameplayProof(routePrimaryScreenshotPath: string) {
  return {
    schema: "aura3d-showcase-gameplay-proof",
    appId: "showcase-skyline-runner",
    pass: true,
    screenshots: {
      beforeInput: {
        bytes: 128,
        sha256: "c".repeat(64)
      },
      afterInput: {
        bytes: 256,
        sha256: "d".repeat(64)
      }
    },
    categoryProof: {
      platformer: {
        movementChangesPosition: true,
        jumpChangesState: true,
        checkpointProgression: true,
        hazardRespawn: true,
        finishProgression: true,
        authoredPlayableSeconds: 30,
        styleCompatible: true,
        scaleCompatible: true,
        visualReviewPass: true,
        visualReviewEvidence: {
          source: "docs/project/showcase-visual-review.json",
          verdict: "pass",
          screenshotEvidence: [routePrimaryScreenshotPath]
        }
      }
    }
  };
}

function createPassingDeployEvidence(deployCommand: string, assetIds: readonly string[]) {
  return {
    routes: [
      {
        deployCheckCommand: deployCommand,
        deployCheckOk: true,
        deployWarnings: [],
        deployFailures: [],
        primaryAssetEvidence: assetIds.map((id) => ({ id }))
      }
    ]
  };
}
