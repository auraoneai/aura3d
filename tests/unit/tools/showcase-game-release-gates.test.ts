import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

interface GameReleaseGateModule {
  validateReleaseGameAssetPairEvidence(input: {
    readonly route: {
      readonly id: string;
      readonly primaryAssets: readonly string[];
      readonly gameTemplateStatus?: {
        readonly category?: string;
        readonly publicTemplateReady?: boolean;
        readonly evidence?: readonly string[];
      };
    };
    readonly routeHealth: {
      readonly blockers?: readonly string[];
      readonly gameAssetPairEvidence?: unknown;
    };
    readonly root?: string;
  }): readonly string[];
}

describe("showcase game release gate", () => {
  it("accepts compiler-authored overlay-validated racing geometry with retained proof files", async () => {
    const root = mkdtempSync(join(tmpdir(), "aura3d-game-release-gate-"));
    const routeId = "showcase-racing-game-layer-proof";
    const screenshotPath = `tests/reports/showcase-route-primary-probes/${routeId}.png`;
    const reportPath = `tests/reports/showcase-spec-compiler/${routeId}/game-template/${routeId}-racing-track-topology.json`;
    const primaryAssets = ["certifiedRaceCar", "certifiedRaceTrack"] as const;
    const carHash = "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const trackHash = "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const screenshot = onePixelPng();
    const screenshotSha256 = sha256ForBytes(screenshot);
    const retainedCarEvidence = {
      routePrimaryScreenshot: screenshotPath,
      routePrimaryScreenshotSha256: screenshotSha256,
      geometryReport: reportPath,
      manifestHash: carHash,
      visualReview: "pass",
      assetPairPass: true,
      blockers: []
    } as const;
    const retainedTrackEvidence = {
      routePrimaryScreenshot: screenshotPath,
      routePrimaryScreenshotSha256: screenshotSha256,
      geometryReport: reportPath,
      manifestHash: trackHash,
      visualReview: "pass",
      assetPairPass: true,
      blockers: []
    } as const;
    const module: GameReleaseGateModule = await import(
      pathToFileURL(join(process.cwd(), "tools/showcase-library/showcase-game-release-gates.mjs")).href
    );

    try {
      mkdirSync(join(root, "tests/reports/showcase-route-primary-probes"), { recursive: true });
      mkdirSync(join(root, "tests/reports/showcase-spec-compiler", routeId, "game-template"), { recursive: true });
      writeFileSync(join(root, screenshotPath), screenshot);
      writeFileSync(join(root, "aura.assets.json"), `${JSON.stringify({
        schema: "aura3d.assets/1.0",
        assets: [
          { id: primaryAssets[0], hash: carHash },
          { id: primaryAssets[1], hash: trackHash }
        ]
      }, null, 2)}\n`);
      writeFileSync(join(root, reportPath), `${JSON.stringify({
        schema: "aura3d-racing-track-topology/1.0",
        routeId,
        pass: true,
        failures: [],
        topology: {
          assetId: primaryAssets[1],
          assetHash: trackHash,
          source: "compiler-authored-overlay-validated",
          evidence: {
            routeOverlay: screenshotPath
          }
        },
        meshExtraction: {
          status: "overlay-validated",
          reasons: ["compiler-authored game circuit retained against route-primary screenshot"],
          blockers: []
        }
      }, null, 2)}\n`);

      const releaseInput = {
        route: {
          id: routeId,
          primaryAssets,
          gameTemplateStatus: {
            category: "racing",
            publicTemplateReady: true,
            evidence: [reportPath, screenshotPath]
          }
        },
        routeHealth: {
          blockers: [],
          gameAssetPairEvidence: {
            category: "racing",
            assets: primaryAssets,
            screenshotEvidence: screenshotPath,
            verdict: "pass",
            blockers: [],
            geometryEvidence: {
              category: "racing",
              kind: "racing-track-topology",
              source: "compiler-authored-overlay-validated",
              report: reportPath,
              screenshotEvidence: screenshotPath,
              routePrimaryScreenshotSha256: screenshotSha256,
              assets: [
                { id: primaryAssets[0], hash: carHash },
                { id: primaryAssets[1], hash: trackHash }
              ]
            }
          }
        },
        root
      };

      expect(module.validateReleaseGameAssetPairEvidence(releaseInput)).toEqual(expect.arrayContaining([
        "release-game-geometry-asset-certification:certifiedRaceCar:missing",
        "release-game-geometry-asset-certification:certifiedRaceTrack:missing"
      ]));

      writeFileSync(join(root, "aura.assets.json"), `${JSON.stringify({
        schema: "aura3d.assets/1.0",
        assets: [
          {
            id: primaryAssets[0],
            hash: carHash,
            gameGeometry: { certification: "certified-racing-vehicle" }
          },
          {
            id: primaryAssets[1],
            hash: trackHash,
            gameGeometry: { certification: "certified-generated-game-world" }
          }
        ]
      }, null, 2)}\n`);

      expect(module.validateReleaseGameAssetPairEvidence(releaseInput)).toEqual(expect.arrayContaining([
        "release-game-geometry-asset-evidence-missing:certifiedRaceCar",
        "release-game-geometry-asset-evidence-missing:certifiedRaceTrack"
      ]));

      writeFileSync(join(root, "aura.assets.json"), `${JSON.stringify({
        schema: "aura3d.assets/1.0",
        assets: [
          {
            id: primaryAssets[0],
            hash: carHash,
            gameGeometry: {
              certification: "certified-racing-vehicle",
              evidence: retainedCarEvidence
            }
          },
          {
            id: primaryAssets[1],
            hash: trackHash,
            gameGeometry: {
              certification: "certified-generated-game-world",
              evidence: retainedTrackEvidence
            }
          }
        ]
      }, null, 2)}\n`);

      expect(module.validateReleaseGameAssetPairEvidence(releaseInput)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects diagnostic game-layer visual blockers as public release evidence", async () => {
    const module: GameReleaseGateModule = await import(
      pathToFileURL(join(process.cwd(), "tools/showcase-library/showcase-game-release-gates.mjs")).href
    );
    const routeId = "showcase-platformer-game-layer-proof";
    const blockers = [
      "visual:platformer-proof-reads-as-diagnostic-harness",
      "visual:character-not-visibly-grounded-on-platform",
      "visual:debug-surface-guides-visible",
      "visual:character-world-composition-not-public-quality"
    ];

    expect(module.validateReleaseGameAssetPairEvidence({
      route: {
        id: routeId,
        primaryAssets: ["diagnosticCharacter", "diagnosticWorld"],
        gameTemplateStatus: {
          category: "platformer",
          publicTemplateReady: false,
          evidence: ["tests/reports/showcase-route-primary-probes/showcase-platformer-game-layer-proof.png"]
        }
      },
      routeHealth: {
        blockers: [
          "evidence:platformer-asset-pair:verdict-not-pass:fail",
          ...blockers.map((blocker) => `evidence:platformer-asset-pair:blocker:${blocker}`)
        ],
        gameAssetPairEvidence: {
          category: "platformer",
          assets: ["diagnosticCharacter", "diagnosticWorld"],
          screenshotEvidence: `tests/reports/showcase-route-primary-probes/${routeId}.png`,
          verdict: "fail",
          blockers,
          geometryEvidence: {
            category: "platformer",
            kind: "platformer-playable-surface-map",
            source: "compiler-authored-overlay-validated",
            report: "tests/reports/showcase-spec-compiler/platformer-game-layer-proof/game-template/showcase-platformer-game-layer-proof-platformer-playable-surfaces.json",
            screenshotEvidence: `tests/reports/showcase-route-primary-probes/${routeId}.png`,
            routePrimaryScreenshotSha256: `sha256-${"c".repeat(64)}`,
            assets: [
              { id: "diagnosticCharacter", hash: `sha256-${"d".repeat(64)}` },
              { id: "diagnosticWorld", hash: `sha256-${"e".repeat(64)}` }
            ]
          }
        }
      }
    })).toEqual(expect.arrayContaining([
      "release-game-template-ready:false",
      "release-game-asset-pair-verdict:fail",
      `release-game-asset-pair-blockers:${blockers.join(",")}`,
      expect.stringMatching(/^release-game-asset-pair-route-health-blockers:.*visual:debug-surface-guides-visible/),
      "release-game-geometry-root-required"
    ]));
  });
});

function onePixelPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
}

function sha256ForBytes(bytes: Buffer): string {
  return `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
}
