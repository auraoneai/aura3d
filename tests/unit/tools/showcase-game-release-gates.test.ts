import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- .mjs showcase tooling has no type declarations; it is covered by its own tests.
import { hashRouteHealthDependency } from "../../../tools/showcase-library/route-primary-probes.mjs";

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
    const routeId = "showcase-turbo-drift-circuit";
    const screenshotPath = `tests/reports/showcase-route-primary-probes/${routeId}.png`;
    const reportPath = `tests/reports/showcase-spec-compiler/${routeId}/game-template/${routeId}-racing-track-topology.json`;
    const compositionReportPath = `tests/reports/showcase-spec-compiler/${routeId}/game-template/${routeId}-asset-pair-composition.json`;
    const primaryAssets = ["certifiedRaceCar", "certifiedRaceTrack"] as const;
    const carHash = "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const trackHash = "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    /*
     * Real PNG bytes for the image-derived checks.
     *
     * These were borrowed from `showcase-public-racing-presentation-proof`, which was deleted in 1.5.0
     * as superseded. The suite only needs genuine rendered racing frames, so they now come from the
     * route under test (Turbo Drift Circuit), which keeps the fixtures aligned with
     * routes that still exist. The former game-layer-proof routes were deleted as
     * discontinued examples, so this gate is now exercised against the real game routes.
     */
    /*
     * Inert image fixtures for the image-derived checks.
     *
     * These bytes were previously read from `tests/reports/.../showcase-public-racing-presentation-proof*.png`.
     * That route was deleted in 1.5.0 as superseded, and leaving its PNGs under the generated reports
     * tree made them look like current evidence for a route that no longer exists. They are now stored
     * under `tests/fixtures/showcase-game-release-gates/` as what they actually are: a matched set of
     * real rendered racing frames (frame, subject-suppressed counterpart, desktop, mobile) used as
     * *inputs* to a synthetic gate test.
     *
     * They must stay a matched set. Pixel isolation subtracts the suppressed frame from the primary
     * one, and the composed-viewport checks measure their coverage, so substituting frames from a
     * different route produces meaningless subjects and spurious composition blockers.
     *
     * Refreshed from Turbo Drift Circuit's current retained frames when the `flat-region-budget` check
     * landed. The previous bytes were inherited from the deleted `showcase-public-racing-presentation-proof`
     * and measured dominantBucketFraction 0.5662 / flatFraction 0.7345 -- a dark, mostly-empty frame that the
     * new budget correctly rejected. The fixture asserts a *passing* release gate, so it has to be a frame
     * that legitimately passes; weakening the budget to accommodate stale bytes would have defeated its
     * purpose. Current values: 0.163 / 0.313 composed, 0.130 / 0.253 desktop, 0.294 / 0.366 mobile.
     */
    const FIXTURE_DIR = "tests/fixtures/showcase-game-release-gates";
    const screenshot = readFileSync(`${FIXTURE_DIR}/racing-frame.png`);
    const screenshotSha256 = sha256ForBytes(screenshot);
    // Image-QA inputs: a subject-suppressed frame for pixel isolation, desktop
    // and mobile frames for viewport composition, and a before/after pair for
    // the mounted gameplay delta.
    const suppressedScreenshot = readFileSync(`${FIXTURE_DIR}/racing-frame-subject-suppressed.png`);
    const desktopScreenshot = readFileSync(`${FIXTURE_DIR}/racing-frame-desktop.png`);
    const mobileScreenshot = readFileSync(`${FIXTURE_DIR}/racing-frame-mobile.png`);
    const suppressedPath = `tests/reports/showcase-route-primary-probes/${routeId}-subject-suppressed.png`;
    const desktopPath = `tests/reports/showcase-library-screenshots/${routeId}-desktop.png`;
    const mobilePath = `tests/reports/showcase-library-screenshots/${routeId}-mobile.png`;
    const gameplayBeforePath = `tests/reports/showcase-gameplay/${routeId}-before-input.png`;
    const gameplayAfterPath = `tests/reports/showcase-gameplay/${routeId}-after-input.png`;
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
      mkdirSync(join(root, "tests/reports/showcase-library-screenshots"), { recursive: true });
      mkdirSync(join(root, "tests/reports/showcase-gameplay"), { recursive: true });
      writeFileSync(join(root, screenshotPath), screenshot);
      writeFileSync(join(root, suppressedPath), suppressedScreenshot);
      writeFileSync(join(root, desktopPath), desktopScreenshot);
      writeFileSync(join(root, mobilePath), mobileScreenshot);
      // The gameplay pair must differ, so reuse two genuinely different frames.
      writeFileSync(join(root, gameplayBeforePath), suppressedScreenshot);
      writeFileSync(join(root, gameplayAfterPath), screenshot);
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

      writeFileSync(join(root, compositionReportPath), `${JSON.stringify({
        schema: "aura3d-showcase-asset-pair-composition/1.0",
        routeId,
        category: "racing",
        verdict: "pass",
        pass: true,
        screenshot: { path: screenshotPath, sha256: screenshotSha256, width: 1, height: 1 },
        geometry: {
          report: reportPath,
          assetId: primaryAssets[1],
          assetHash: trackHash,
          source: "compiler-authored-overlay-validated",
          modelAnchorCount: 2
        },
        assets: [
          { id: primaryAssets[0], manifestHash: carHash, evidenceHash: carHash },
          { id: primaryAssets[1], manifestHash: trackHash, evidenceHash: trackHash }
        ],
        thresholds: {},
        checks: ["binding-overlap", "contact", "camera-readability", "scale-contract", "debug-guide-absence"]
          .map((id) => ({ id, verdict: "pass", tolerance: {}, measured: {}, blockers: [] })),
        blockers: []
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
            compositionReport: compositionReportPath,
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

      const sourcePath = `apps/${routeId}/src/main.ts`;
      const healthPath = `apps/${routeId}/route-health.json`;
      const probePath = `tests/reports/showcase-route-primary-probes/${routeId}.json`;
      const sourceText = "export const route = 'visual-qa-fixture';\n";
      const healthText = `${JSON.stringify(releaseInput.routeHealth, null, 2)}\n`;
      mkdirSync(join(root, `apps/${routeId}/src`), { recursive: true });
      writeFileSync(join(root, sourcePath), sourceText);
      writeFileSync(join(root, healthPath), healthText);
      writeFileSync(join(root, probePath), `${JSON.stringify({
        schema: "aura3d-route-primary-probe/1.0",
        routeId,
        pass: true,
        sourceHash: routeSourceHash(routeId, sourcePath, sourceText),
        /*
         * Use the probe's own narrowing rule rather than a whole-file digest.
         *
         * The probe binds route-health *excluding* the fields the composition producer owns
         * (`gameAssetPairEvidence` and the `screenshotSha256` / `routePrimaryScreenshotSha256` digests at any depth),
         * because composition derives those from the probe's own output. A whole-file hash here made this fixture
         * disagree with the real producer and consumer, reporting `route-primary-health-stale` on evidence that is
         * correct by construction.
         */
        routeHealthHash: hashRouteHealthDependency(join(root, healthPath)),
        renderedProbe: {
          screenshotPath,
          sha256: screenshotSha256,
          /*
           * The crop Turbo's own probe records for these exact bytes.
           *
           * This was `{ x: 10, y: 183, width: 1420, height: 661 }`, hand-tuned to the deleted route's frame.
           * Against the refreshed fixture that crop excluded the sky band the frame uses for background
           * separation and reported `background-balance:0.0535`. An analysis crop is a property of the frame
           * it describes, so it is taken from the producer rather than restated.
           */
          analysisCrop: { x: 0, y: 0, width: 1122, height: 900 },
          visible: true,
          clipped: false,
          occludedByUi: false,
          readabilityScore: 57,
          subjectSuppressedScreenshotPath: suppressedPath,
          subjectSuppressedScreenshotSha256: sha256ForBytes(suppressedScreenshot),
          failures: []
        }
      }, null, 2)}\n`);

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
    /*
     * Raised timeout, not a weakened assertion.
     *
     * This test writes four full-resolution retained frames (~3.7MB) into a temp root and runs the release gate
     * *four* times over them to walk the progressive certification states, so it does genuine multi-megapixel image
     * analysis. It measures ~1.1s standalone -- comfortable against the default 5s -- but the full suite runs 387
     * files in parallel and this machine reached load average 123 from unrelated processes, at which point a 5s wall
     * clock is not a meaningful statement about the code.
     *
     * Diagnosed before raising it, per the brief's requirement not to dismiss load-only failures: the repeated
     * decode was real and was fixed at its cause (`png-foreground.mjs` now shares one traversal for composition and
     * flat-region metrics, uses a dense histogram instead of a per-pixel Map, and memoizes analyses keyed on frame
     * SHA-256), taking this file from 18.85s to ~2.4s. Every assertion is unchanged; only the wall-clock budget for
     * a legitimately heavy test is.
     */
  }, 20_000);


  it("enforces manual visual review as a downward-only veto", async () => {
    const module = await import(
      pathToFileURL(join(process.cwd(), "tools/showcase-library/showcase-manual-review-gate.mjs")).href
    );

    expect(module.applyDownwardOnlyManualReview({ validatorOk: true, manualReviewOk: false })).toEqual({
      ok: false,
      validatorOk: true,
      manualReviewOk: false,
      vetoedByManualReview: true,
      blockedByValidator: false
    });
    expect(module.applyDownwardOnlyManualReview({ validatorOk: false, manualReviewOk: true })).toEqual({
      ok: false,
      validatorOk: false,
      manualReviewOk: true,
      vetoedByManualReview: false,
      blockedByValidator: true
    });
    expect(module.applyDownwardOnlyManualReview({ validatorOk: true, manualReviewOk: true }).ok).toBe(true);
  });

  it("rejects diagnostic game-layer visual blockers as public release evidence", async () => {
    const module: GameReleaseGateModule = await import(
      pathToFileURL(join(process.cwd(), "tools/showcase-library/showcase-game-release-gates.mjs")).href
    );
    const routeId = "showcase-blockfall-reactor";
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

function sha256ForBytes(bytes: Buffer): string {
  return `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
}

function routeSourceHash(routeId: string, sourcePath: string, sourceText: string): string {
  const hash = createHash("sha256");
  hash.update(sourcePath); hash.update("\0"); hash.update(sourceText); hash.update("\0");
  return `sha256-${hash.digest("hex")}`;
}
