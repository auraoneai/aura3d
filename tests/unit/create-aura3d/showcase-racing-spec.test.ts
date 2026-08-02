import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compileShowcaseSpec,
  compileShowcaseSpecFile,
  type ShowcaseSpec
} from "../../../packages/create-aura3d/src/showcase-spec-compiler";
import { expectStrictGeneratedSource } from "./generated-source-assertions";

const SHOWCASE_SPEC_COMPILER_TEST_TIMEOUT_MS = 15000;

describe("showcase racing spec compiler", () => {
  it("requires racing specs to declare different typed vehicle and track assets", () => {
    const baseSpec = readTurboSpec();
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-racing-spec-"));

    try {
      expect(() => compileShowcaseSpec({
        ...baseSpec,
        racing: {
          ...baseSpec.racing,
          vehicleAsset: "showcaseMissingCar"
        }
      }, { outputDir })).toThrow(/racing.vehicleAsset/);

      expect(() => compileShowcaseSpec({
        ...baseSpec,
        racing: {
          ...baseSpec.racing,
          trackAsset: baseSpec.racing.vehicleAsset
        },
        primaryAssets: baseSpec.primaryAssets.filter((asset) => asset.id !== baseSpec.racing.trackAsset)
      }, { outputDir })).toThrow(/racing.vehicleAsset and racing.trackAsset/);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("keeps current Turbo prototype-blocked when racing design is too shallow", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-racing-spec-"));

    try {
      const report = compileShowcaseSpecFile({
        specPath: "tests/fixtures/showcase-spec/turbo-drift-racing.json",
        outputDir
      });

      expect(report.ok).toBe(false);
      expect(report.finalStatus).toBe("prototype-blocked");
      expect(report.blockers).toEqual(expect.arrayContaining([
        "racing:design:min-lap-seconds-too-low:8",
        "racing:design:route-not-aligned-to-track-asset",
        "racing:design:missing-release-safe-track-topology:authored-route-over-visible-track",
        "evidence:racing-track-topology:topology-not-release-safe:authored-route-over-visible-track",
        "evidence:racing-track-topology:not-passing",
        "evidence:racing-track-topology:route-not-aligned"
      ]));
      expect(report.blockers).not.toEqual(expect.arrayContaining([
        "evidence:route-primary-not-passed",
        "evidence:gameplay-not-passed",
        "evidence:deploy-not-passed"
      ]));
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("generates a racing route from typed assets and public root imports only when the race design is coherent", () => {
    const baseSpec = readTurboCircuitSpec();
    const primaryAssets = baseSpec.primaryAssets.map((asset) => asset.id === baseSpec.racing.trackAsset
      ? omitAssetPolicy(asset)
      : asset);
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-racing-spec-"));
    const proofDir = `tests/reports/showcase-racing-spec-unit-${process.pid}-${Date.now()}`;
    mkdirSync(proofDir, { recursive: true });
    const gameplayProofPath = join(proofDir, "gameplay.json");
    const routePrimaryProbePath = join(proofDir, "route-primary.json");
    const routePrimaryScreenshotPath = join(proofDir, "route-primary.png");
    const trackTopologyEvidencePath = join(proofDir, "track-topology.json");
    const compositionReportPath = join(proofDir, "asset-pair-composition.json");
    const screenshotBytes = onePixelPng();
    const screenshotSha256 = sha256ForBytes(screenshotBytes);
    const geometryEvidence = createPassingRacingGeometryEvidence(
      trackTopologyEvidencePath,
      routePrimaryScreenshotPath,
      screenshotSha256
    );
    writeFileSync(routePrimaryScreenshotPath, screenshotBytes);
    writeFileSync(
      trackTopologyEvidencePath,
      `${JSON.stringify(createPassingRacingTrackTopologyEvidence(routePrimaryScreenshotPath), null, 2)}\n`
    );
    writeFileSync(gameplayProofPath, `${JSON.stringify(createPassingRacingGameplayProof(routePrimaryScreenshotPath), null, 2)}\n`);
    writeFileSync(routePrimaryProbePath, `${JSON.stringify(createPassingRoutePrimaryProbe("turboRaceCar", routePrimaryScreenshotPath, screenshotSha256), null, 2)}\n`);
    writeFileSync(compositionReportPath, `${JSON.stringify(createPassingCompositionReport({
      routeId: "showcase-turbo-drift-circuit",
      category: "racing",
      screenshotPath: routePrimaryScreenshotPath,
      screenshotSha256,
      geometryReport: trackTopologyEvidencePath,
      geometrySource: "asset-mesh-extracted",
      geometryAssetId: "showcaseTsukubaCircuit",
      geometryAssetHash: geometryEvidence.assets[1].hash,
      assets: geometryEvidence.assets
    }), null, 2)}\n`);

    try {
      const report = compileShowcaseSpec({
        ...baseSpec,
        primaryAssets,
        racing: {
          ...baseSpec.racing,
          raceDesign: {
            ...baseSpec.racing.raceDesign,
            visibleTrackTopology: "mesh-road-topology",
            trackTopologyEvidence: trackTopologyEvidencePath,
            assetPairEvidence: createPassingAssetPairEvidence("racing", [
              "turboRaceCar",
              "showcaseTsukubaCircuit"
            ], routePrimaryScreenshotPath, routePrimaryProbePath, screenshotSha256, geometryEvidence)
          }
        },
        evidence: {
          ...baseSpec.evidence,
          routePrimaryProbe: routePrimaryProbePath,
          gameplayProof: gameplayProofPath,
          routePrimaryScreenshot: routePrimaryScreenshotPath,
          assetPairCompositionReport: compositionReportPath
        }
      }, { outputDir });

      expect(report.ok).toBe(true);
      expect(report.finalStatus).toBe("release-ready candidate");
      expect(report.blockers).toEqual([]);

      const source = readFileSync(join(outputDir, "src", "main.ts"), "utf8");
      expect(source).toContain("import { createAuraApp, game, lights, model, scene } from \"@aura3d/engine\";");
      expect(source).toContain("model(assets.turboRaceCar");
      expect(source).toContain("model(assets.showcaseTsukubaCircuit");
      expect(source).toContain("name: \"racing-bound-track-asset\"");
      expect(source).toContain("targetMaxDimension: racingScene.trackModel.targetMaxDimension");
      expect(source).toContain(".position(...racingScene.trackModel.position).rotate(...racingScene.trackModel.rotation)");
      expect(source).toContain("mode: \"asset-overlay\"");
      expect(source).toContain("guideVisibility: \"public\"");
      expect(source).toContain("targetMaxDimension: 0.9");
      expect(source).toContain("mode: \"chase\"");
      expect(source).toContain("targetNode: \"racing-player-car\"");
      expect(source).toContain("distance: 4.28");
      expect(source).toContain("game.assetBoundRacingRoute");
      expect(source).toContain("game.racingSceneBinding");
      expect(source).not.toContain("trackModelPresentationOffset");
      expect(source).toContain("game.racingCameraRig");
      expect(source).toContain("cameraReadabilityVerdict: \"pass\"");
      expect(source).toContain("route.assetBinding.speedModel.certifiedSpeed");
      expect(source).not.toContain("camera.follow");
      expect(source).toContain('import { gameGeometryContract } from "./generated/game-geometry";');
      expect(source).toContain("const trackTopology = gameGeometryContract.topology;");
      expect(source).not.toContain("sha256-8c139a570143ce20a415803d67a46e92d65e2c711a310ad3891f71a69f8ce031");
      const geometryContract = readFileSync(join(outputDir, "src", "generated", "game-geometry.ts"), "utf8");
      expect(geometryContract).toContain('\"schema\": \"aura3d-game-geometry-contract/1.0\"');
      expect(geometryContract).toContain("sha256-8c139a570143ce20a415803d67a46e92d65e2c711a310ad3891f71a69f8ce031");
      expect(report.generatedFiles).toContain("src/generated/game-geometry.ts");
      expect(report.geometryContract).toMatchObject({
        module: "src/generated/game-geometry.ts",
        sourceReport: trackTopologyEvidencePath
      });
      expect(report.geometryContract?.contentHash).toMatch(/^sha256-[a-f0-9]{64}$/);
      expect(report.geometryContract?.sourceReportHash).toMatch(/^sha256-[a-f0-9]{64}$/);
      expect(source).toContain("topology: trackTopology");
      expect(source).toContain("sceneBinding: racingScene.evidence");
      expect(source).toContain("checkpointScenePoints: racingScene.checkpointScenePoints");
      expect(source).toContain("racingScene.toScenePose");
      expect(source).toContain("game.racing");
      expect(source).toContain("ghostState.placeAtProgress");
      expect(source).toContain("authoredLapSeconds");
      expect(source).toContain("assetBinding: route.assetBinding");
      expect(source).toContain("routeAlignedToVisibleTrack: true");
      expect(source).toContain("noDebugLocatorDisk: true");
      expect(source).toContain("visibleGameGeometrySource: \"topology-bound-game-circuit\"");
      expect(source).toContain("trackAssetUsedForTopologyEvidence: \"showcaseTsukubaCircuit\"");
      expect(source).toContain("Object.defineProperty(window, \"__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__\"");
      expect(source).toContain("controls: {");
      expect(source).toContain("systems: {");
      expect(source).toContain("claimBoundary: ");
      expect(source).not.toContain("racing-topology-source-track");
      expect(source).not.toContain("visible: false");
      expect(source).not.toContain("primitives.");
      expect(source).not.toContain("unsafeModelUrl");
      expect(source).not.toContain("from \"three\"");
      expect(source).not.toContain("playerCar.setPosition(raceSnapshot.position.x");
      expect(source).not.toContain("ghostCar.setPosition(ghost.position.x");
      expectStrictGeneratedSource(source);

      const routeHealth = JSON.parse(readFileSync(join(outputDir, "route-health.json"), "utf8"));
      expect(routeHealth.racing).toMatchObject({
        vehicleAsset: "turboRaceCar",
        trackAsset: "showcaseTsukubaCircuit",
        gameplayRequirements: ["throttle", "steering", "reset", "checkpoint", "lap", "multi-lap"],
        raceDesign: {
          minCheckpoints: 6,
          minLaps: 3,
          minLapSeconds: 30,
          trackTopologyEvidence: trackTopologyEvidencePath,
          routeAlignedToTrackAsset: true,
          visibleTrackTopology: "mesh-road-topology",
          carTrackScaleCompatible: true,
          noDebugLocatorDisk: true
        }
      });
      expect(routeHealth.gameAssetPairEvidence?.geometryEvidence).toEqual(geometryEvidence);
      expect(routeHealth.gameAssetPairEvidence?.compositionReport).toBe(compositionReportPath);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
      rmSync(proofDir, { recursive: true, force: true });
    }
  }, 30_000);

  it("refuses release-ready racing output when gameplay proof is missing", () => {
    const baseSpec = readTurboSpec();
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-racing-spec-"));

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
  });

  it("does not require authored anchor pairs for mesh-extracted racing topology evidence", () => {
    const baseSpec = readTurboCircuitSpec();
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-racing-spec-"));
    const proofDir = `tests/reports/showcase-racing-spec-unit-${process.pid}-${Date.now()}-single-anchor`;
    mkdirSync(proofDir, { recursive: true });
    const routePrimaryScreenshotPath = join(proofDir, "route-primary.png");
    const topologyEvidencePath = join(proofDir, "track-topology.json");
    writeFileSync(routePrimaryScreenshotPath, onePixelPng());
    writeFileSync(
      topologyEvidencePath,
      `${JSON.stringify(withoutRacingAnchorPairs(createPassingRacingTrackTopologyEvidence(routePrimaryScreenshotPath)), null, 2)}\n`
    );

    try {
      const report = compileShowcaseSpec({
        ...baseSpec,
        racing: {
          ...baseSpec.racing,
          raceDesign: {
            ...baseSpec.racing.raceDesign,
            visibleTrackTopology: "mesh-road-topology",
            trackTopologyEvidence: topologyEvidencePath
          }
        },
        evidence: {
          ...baseSpec.evidence,
          routePrimaryScreenshot: routePrimaryScreenshotPath
        }
      }, { outputDir });

      expect(report.ok).toBe(false);
      expect(report.finalStatus).toBe("prototype-blocked");
      expect(report.blockers).not.toContain("evidence:racing-track-topology:model-alignment:anchor-pairs-missing");

      const providedEvidence = JSON.parse(readFileSync(topologyEvidencePath, "utf8"));
      expect(providedEvidence).toMatchObject({
        pass: true,
        topologySource: "mesh-road-topology",
        topology: {
          assetId: "showcaseTsukubaCircuit",
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
  }, 30_000);

  it("marks current racing output release-ready after asset-pair automation and visual review pass", () => {
    const baseSpec = readTurboCircuitSpec();
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-racing-spec-"));

    try {
      const report = compileShowcaseSpec(baseSpec, { outputDir });

      expect(report.ok).toBe(true);
      expect(report.finalStatus).toBe("release-ready candidate");
      expect(report.blockers).toEqual([]);
      expect(report.blockers).not.toContain("evidence:racing-asset-pair:verdict-not-pass:fail");
      expect(report.assetPairComposition).toMatchObject({
        verdict: "pass",
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "binding-overlap", verdict: "pass" }),
          expect.objectContaining({ id: "contact", verdict: "pass" }),
          expect.objectContaining({ id: "camera-readability", verdict: "pass" }),
          expect.objectContaining({ id: "scale-contract", verdict: "pass" })
        ])
      });
      expect(report.rejectedAssets).toEqual([]);
      expect(report.selectedReplacement).toBeUndefined();
      expect(report.replacementCandidates).toEqual([]);
      expect(report.blockers).not.toContain("replacement:showcaseTsukubaCircuit:no-suitable-candidate");
      const generatedTopologyEvidence = JSON.parse(readFileSync(join(outputDir, "game-template", "showcase-turbo-drift-circuit-racing-track-topology.json"), "utf8"));
      expect(generatedTopologyEvidence.topology.evidence.routeOverlay).toBe(baseSpec.evidence.routePrimaryScreenshot);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, SHOWCASE_SPEC_COMPILER_TEST_TIMEOUT_MS);

  it("selects a replacement track with hash-bound overlay-validated racing topology", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-racing-spec-"));
    const projectDir = mkdtempSync(join(tmpdir(), "aura3d-racing-project-"));
    const routePrimaryScreenshot = "tests/fixtures/showcase-spec/evidence/showcase-route-primary-probes/showcase-turbo-drift-circuit.png";
    const currentTopology = createPassingRacingTrackTopologyEvidence(routePrimaryScreenshot).topology;
    const topology = {
      ...currentTopology,
      assetId: "showcaseTsukubaCircuit",
      assetHash: "sha256-8c139a570143ce20a415803d67a46e92d65e2c711a310ad3891f71a69f8ce031",
      source: "manifest-authored-overlay-validated" as const,
      modelAlignment: {
        ...createPassingRacingTrackTopologyEvidence(routePrimaryScreenshot).topology.modelAlignment,
        source: "manifest-authored-overlay-validated" as const
      }
    };

    try {
      writeFileSync(join(projectDir, "aura.assets.json"), `${JSON.stringify({
        schema: "aura3d.assets/1.0",
        assets: [
          {
            id: "showcaseTinyDebugTrack",
            type: "model",
            format: "glb",
            url: "/aura-assets/showcaseTinyDebugTrack.glb",
            role: "track",
            quality: "release",
            hash: "sha256-1111111111111111111111111111111111111111111111111111111111111111"
          },
          {
            id: "showcaseTsukubaCircuit",
            type: "model",
            format: "glb",
            url: "/aura-assets/showcaseTsukubaCircuit.glb",
            role: "track",
            quality: "release",
            // Real catalog asset carries 22 textures; modelled so the
            // surface-detail gate sees representative data.
            textures: [{ uri: "showcaseTsukubaCircuit-texture-0.png" }, { uri: "showcaseTsukubaCircuit-texture-1.png" }, { uri: "showcaseTsukubaCircuit-texture-2.png" }],
            hash: topology.assetHash,
            provenance: {
              sourcePage: "https://huggingface.co/datasets/aura3d/fixture-tsukuba",
              downloadUrl: "/aura-assets/showcaseTsukubaCircuit.glb",
              license: "CC-BY-4.0",
              licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
              author: "Linnaeus"
            },
            suitabilityReason: "Track replacement includes a retained hash-bound road topology map for racing demos.",
            renderedProbe: {
              url: "tests/fixtures/showcase-spec/evidence/showcase-release-asset-probes/showcaseTsukubaCircuit.png",
              foregroundBounds: { x: 42, y: 38, width: 612, height: 482 }
            },
            orientation: {
              forwardAxis: "-Z",
              evidence: routePrimaryScreenshot
            },
            gameGeometry: {
              racingTopology: topology
            }
          }
        ]
      }, null, 2)}\n`);

      const report = compileShowcaseSpec(createUnboundTurboTrackReplacementSpec(readTurboCircuitSpec()), {
        outputDir,
        projectDir
      });

      expect(report.selectedReplacement).toMatchObject({
        id: "showcaseTsukubaCircuit",
        replaces: "showcaseTinyDebugTrack",
        role: "track",
        reasons: expect.arrayContaining([
          "overlay-validated racing topology evidence matches candidate",
          "mesh extraction did not produce a candidate; retained hash-bound topology evidence accepted"
        ])
      });
      expect(report.blockers).not.toContain("replacement:showcaseTinyDebugTrack:no-suitable-candidate");
      expect(report.replacementCandidates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "showcaseTsukubaCircuit",
          accepted: true,
          selected: true,
          reasons: expect.arrayContaining([
            "overlay-validated racing topology evidence matches candidate",
            "mesh extraction did not produce a candidate; retained hash-bound topology evidence accepted"
          ]),
          penalties: []
        })
      ]));
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("blocks public racing output when the composition report is not bound to the current route-primary screenshot hash", () => {
    const baseSpec = readTurboCircuitSpec();
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-racing-spec-"));
    const proofDir = `tests/reports/showcase-racing-spec-unit-${process.pid}-${Date.now()}-stale-composition`;
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
      expect(report.blockers).toContain("evidence:racing-asset-pair:screenshot-sha256-mismatch");
      expect(report.blockers).toContain("evidence:racing-asset-pair:screenshot:file-sha256-mismatch");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
      rmSync(proofDir, { recursive: true, force: true });
    }
  });

  it("blocks public racing output when only a tiny proof loop is declared", () => {
    const baseSpec = readTurboCircuitSpec();
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-racing-spec-"));

    try {
      const report = compileShowcaseSpec({
        ...baseSpec,
        primaryAssets: baseSpec.primaryAssets.map(omitAssetPolicy),
        racing: {
          ...baseSpec.racing,
          raceDesign: {
            ...baseSpec.racing.raceDesign,
            minCheckpoints: 2,
            minLaps: 1,
            minLapSeconds: 5,
            routeAlignedToTrackAsset: false,
            visibleTrackTopology: "authored-route-over-visible-track",
            noDebugLocatorDisk: false
          }
        }
      }, { outputDir });

      expect(report.ok).toBe(false);
      expect(report.finalStatus).toBe("prototype-blocked");
      expect(report.blockers).toEqual(expect.arrayContaining([
        "racing:design:min-checkpoints-too-low:2",
        "racing:design:min-laps-too-low:1",
        "racing:design:min-lap-seconds-too-low:5",
        "racing:design:route-not-aligned-to-track-asset",
        "racing:design:missing-release-safe-track-topology:authored-route-over-visible-track",
        "racing:visual:debug-locator-disk-not-rejected",
        "evidence:racing-track-topology:topology-not-release-safe:authored-route-over-visible-track",
        "evidence:racing-track-topology:not-passing",
        "evidence:racing-track-topology:route-not-aligned",
        "evidence:racing-track-topology:debug-locator-disk-present"
      ]));
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, SHOWCASE_SPEC_COMPILER_TEST_TIMEOUT_MS);
});

function readTurboSpec(): ShowcaseSpec & { readonly racing: NonNullable<ShowcaseSpec["racing"]> } {
  return JSON.parse(readFileSync("tests/fixtures/showcase-spec/turbo-drift-racing.json", "utf8")) as ShowcaseSpec & {
    readonly racing: NonNullable<ShowcaseSpec["racing"]>;
  };
}

function createUnboundTurboTrackReplacementSpec(
  baseSpec: ShowcaseSpec & { readonly racing: NonNullable<ShowcaseSpec["racing"]> }
): ShowcaseSpec & { readonly racing: NonNullable<ShowcaseSpec["racing"]> } {
  const vehicleAsset = baseSpec.primaryAssets.find((asset) => asset.id === baseSpec.racing.vehicleAsset);
  if (vehicleAsset === undefined) {
    throw new Error("Turbo fixture is missing its racing vehicle primary asset");
  }
  const rejectedTrackAsset: ShowcaseSpec["primaryAssets"][number] = {
    id: "showcaseTinyDebugTrack",
    typedRef: "assets.showcaseTinyDebugTrack",
    role: "track",
    quality: "release",
    hasDurableProvenance: true,
    hasRenderedProbe: true,
    hasOrientationEvidence: true,
    hasForegroundBounds: true,
    assetPolicy: {
      allowReplacement: true,
      replacementQuery: "tsukuba circuit race track road topology",
      requiredRole: "track",
      minQuality: "release",
      requireRenderedProbe: true,
      requireDeployPass: true
    }
  };

  const { trackTopology: _trackTopology, trackTopologyEvidence: _trackTopologyEvidence, assetPairEvidence: _assetPairEvidence, ...raceDesign } = baseSpec.racing.raceDesign;

  return {
    ...baseSpec,
    primaryAssets: [vehicleAsset, rejectedTrackAsset],
    racing: {
      ...baseSpec.racing,
      trackAsset: rejectedTrackAsset.id,
      raceDesign: {
        ...raceDesign,
        routeAlignedToTrackAsset: false,
        visibleTrackTopology: "authored-route-over-visible-track",
        carTrackScaleCompatible: false
      }
    },
    evidence: {
      ...baseSpec.evidence,
      deployCommand: replaceAssetToken(baseSpec.evidence.deployCommand, baseSpec.racing.trackAsset, rejectedTrackAsset.id),
      releaseAssetProbes: {
        ...baseSpec.evidence.releaseAssetProbes,
        [rejectedTrackAsset.id]: `tests/reports/showcase-release-asset-probes/${rejectedTrackAsset.id}.json`
      }
    }
  };
}

function replaceAssetToken(command: string, fromAssetId: string, toAssetId: string): string {
  return command.split(" ").map((token) => token === fromAssetId ? toAssetId : token).join(" ");
}

function omitAssetPolicy(asset: ShowcaseSpec["primaryAssets"][number]): ShowcaseSpec["primaryAssets"][number] {
  const { assetPolicy: _assetPolicy, ...assetWithoutPolicy } = asset;
  return assetWithoutPolicy;
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
  category: "racing",
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

function createPassingRacingGeometryEvidence(
  report: string,
  screenshotEvidence: string,
  routePrimaryScreenshotSha256: string
) {
  return {
    category: "racing",
    kind: "racing-track-topology",
    source: "asset-mesh-extracted",
    report,
    screenshotEvidence,
    routePrimaryScreenshotSha256,
    assets: [
      {
        id: "turboRaceCar",
        hash: "sha256-2cb94499492c96cbe6414206c292871cdf8b6c883b5389a4f4c96a05c2ebc935"
      },
      {
        id: "showcaseTsukubaCircuit",
        hash: "sha256-8c139a570143ce20a415803d67a46e92d65e2c711a310ad3891f71a69f8ce031"
      }
    ]
  } as const;
}

function createPassingRacingTrackTopologyEvidence(routePrimaryScreenshotPath: string) {
  return {
    schema: "aura3d-racing-track-topology/1.0",
    routeId: "showcase-turbo-drift-circuit",
    generatedBy: "showcase-spec-compiler",
    topologySource: "mesh-road-topology",
    templateCapabilityStatus: "mesh-road-topology-proven",
    vehicleAsset: "turboRaceCar",
    trackAsset: "showcaseTsukubaCircuit",
    assetHash: "sha256-8c139a570143ce20a415803d67a46e92d65e2c711a310ad3891f71a69f8ce031",
    topology: {
      assetId: "showcaseTsukubaCircuit",
      assetHash: "sha256-8c139a570143ce20a415803d67a46e92d65e2c711a310ad3891f71a69f8ce031",
      source: "asset-mesh-extracted",
      roadCenterline: [
        { x: -1.72, z: 0.76, width: 0.18 },
        { x: -1.28, z: 1.18, width: 0.18 },
        { x: -0.42, z: 1.08, width: 0.18 },
        { x: 0.14, z: 0.52, width: 0.18 },
        { x: 0.02, z: -0.12, width: 0.18 },
        { x: -0.72, z: -0.4, width: 0.18 },
        { x: -1.12, z: -0.02, width: 0.18 },
        { x: -0.68, z: 0.5, width: 0.18 },
        { x: 0.18, z: 0.36, width: 0.18 },
        { x: 0.92, z: 0.78, width: 0.18 },
        { x: 1.54, z: 0.42, width: 0.18 },
        { x: 1.32, z: -0.34, width: 0.18 },
        { x: 0.58, z: -0.74, width: 0.18 },
        { x: -0.26, z: -0.88, width: 0.18 },
        { x: -1.18, z: -0.56, width: 0.18 },
        { x: -1.74, z: 0.04, width: 0.18 },
        { x: -1.72, z: 0.76, width: 0.18 }
      ],
      checkpoints: [
        { progress: 0.167, width: 0.18 },
        { progress: 0.333, width: 0.18 },
        { progress: 0.5, width: 0.18 },
        { progress: 0.667, width: 0.18 },
        { progress: 0.833, width: 0.18 },
        { progress: 1, width: 0.18 }
      ],
      lapLengthMeters: 8.742,
      estimatedLapSeconds: 36,
      confidence: 0.74,
      modelAlignment: {
        source: "asset-mesh-extracted",
        modelBounds: {
          min: [-9.676, -1, -22.391],
          max: [25.773, 3.054, 11.481]
        },
        modelPoint: [8.0485, -1, -5.455],
        gamePoint: { x: -0.1, z: 0.15 },
        anchorPairs: [
          {
            id: "track-start",
            modelPoint: [8.0485, -1, -5.455],
            gamePoint: { x: -0.1, z: 0.15 }
          },
          {
            id: "track-far-bend",
            modelPoint: [20.2, -1, 6.5],
            gamePoint: { x: 1.54, z: 0.42 }
          }
        ],
        evidence: {
          routeOverlay: routePrimaryScreenshotPath,
          notes: "Unit fixture for hash-bound track model alignment."
        }
      },
      evidence: {
        sourceAsset: "assets.showcaseTsukubaCircuit",
        renderedProbe: "tests/fixtures/showcase-spec/evidence/showcase-release-asset-probes/showcaseTsukubaCircuit.png",
        routeOverlay: routePrimaryScreenshotPath,
        notes: "Unit fixture for hash-bound topology validation."
      }
    },
    assetBinding: {
      kind: "aura-game-asset-bound-racing-route",
      layoutContractVersion: "1.0",
      generatedFrom: "mesh-derived-track-topology",
      vehicleAsset: "turboRaceCar",
      trackAsset: "showcaseTsukubaCircuit",
      trackAssetHash: "sha256-8c139a570143ce20a415803d67a46e92d65e2c711a310ad3891f71a69f8ce031",
      topologySource: "asset-mesh-extracted",
      confidence: 0.74,
      routeLength: 8.742,
      authoredLapSeconds: 36,
      pointCount: 17,
      checkpointCount: 6
    },
    meshExtraction: {
      status: "pass",
      reasons: ["mesh-derived racing topology from 7 road primitive(s)"],
      blockers: []
    },
    route: {
      width: 0.18,
      routeLength: 8.6,
      points: [
        { x: -1.72, y: 0.76 },
        { x: -1.28, y: 1.18 },
        { x: -0.42, y: 1.08 },
        { x: 0.14, y: 0.52 },
        { x: 0.02, y: -0.12 },
        { x: -0.72, y: -0.4 },
        { x: -1.12, y: -0.02 },
        { x: -0.68, y: 0.5 },
        { x: 0.18, y: 0.36 },
        { x: 0.92, y: 0.78 },
        { x: 1.54, y: 0.42 },
        { x: 1.32, y: -0.34 },
        { x: 0.58, y: -0.74 },
        { x: -0.26, y: -0.88 },
        { x: -1.18, y: -0.56 },
        { x: -1.74, y: 0.04 },
        { x: -1.72, y: 0.76 }
      ],
      checkpoints: [0.167, 0.333, 0.5, 0.667, 0.833, 1]
    },
    minLapSeconds: 30,
    authoredLapSeconds: 36,
    minCheckpoints: 6,
    minLaps: 3,
    routeAlignedToTrackAsset: true,
    carTrackScaleCompatible: true,
    noDebugLocatorDisk: true,
    pass: true,
    failures: []
  };
}

function withoutRacingAnchorPairs(evidence: ReturnType<typeof createPassingRacingTrackTopologyEvidence>) {
  const { anchorPairs: _anchorPairs, ...modelAlignment } = evidence.topology.modelAlignment;
  return {
    ...evidence,
    topology: {
      ...evidence.topology,
      modelAlignment
    }
  };
}

function createPassingRacingGameplayProof(routePrimaryScreenshotPath: string) {
  return {
    schema: "aura3d-showcase-gameplay-proof",
    appId: "showcase-turbo-drift-circuit",
    pass: true,
    screenshots: {
      beforeInput: {
        bytes: 128,
        sha256: "a".repeat(64)
      },
      afterInput: {
        bytes: 256,
        sha256: "b".repeat(64)
      }
    },
    categoryProof: {
      racing: {
        inputChangesSpeed: true,
        inputChangesHeading: true,
        checkpointOrLapProgression: true,
        resetWorks: true,
        authoredLapSeconds: 30,
        routeAlignedToVisibleTrack: true,
        noDebugLocatorDisk: true,
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

function createPassingRoutePrimaryProbe(heroAssetId: string, screenshotPath: string, screenshotSha256: string) {
  return {
    schema: "aura3d-route-primary-probe/1.0",
    routeId: "showcase-turbo-drift-circuit",
    routePrimaryHeroAsset: heroAssetId,
    primaryAssets: [{
      id: heroAssetId,
      role: "vehicle",
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

function readTurboCircuitSpec(): ShowcaseSpec & { readonly racing: NonNullable<ShowcaseSpec["racing"]> } {
  return JSON.parse(readFileSync("tests/fixtures/showcase-spec/turbo-drift-circuit.json", "utf8")) as ShowcaseSpec & {
    readonly racing: NonNullable<ShowcaseSpec["racing"]>;
  };
}
