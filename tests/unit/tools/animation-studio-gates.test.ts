import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createAura3D11ReleaseReadinessReport,
  writeAura3D11ReleaseReadinessReport
} from "../../../tools/aura3d11-release-readiness/index";
import { createAnimationStudioDocsClaimsReport } from "../../../tools/animation-studio-docs-claims/index";
import { createAnimationStudioMotionQualityReport } from "../../../tools/animation-studio-motion-quality-gate/index";
import { createAnimationStudioPackageProofReport } from "../../../tools/animation-studio-package-proof/index";
import { createAnimationStudioTemplateSmokeReport } from "../../../tools/animation-studio-template-smoke/index";
import { createAnimationStudioVisualQualityReport } from "../../../tools/animation-studio-visual-quality-gate/index";
import { createPerformanceBudgetReport } from "../../../tools/animation-studio-performance-budget-gate/index";
import { createAnimationStudioBodyMotionReport } from "../../../tools/animation-studio-body-motion-gate/index";
import { createLipSyncTimingReport } from "../../../tools/animation-studio-lip-sync-timing-gate/index";
import { createSubtitleTimingReport } from "../../../tools/animation-studio-subtitle-timing-gate/index";
import { createPromptSpecificityReport } from "../../../tools/animation-studio-prompt-specificity-gate/index";
import { createNoFakeProofReport } from "../../../tools/animation-studio-no-fake-proof-gate/index";

describe("animation studio 1.1 release gates", () => {
  it("validates a complete episode package", () => {
    const root = fixtureRoot();
    writeCompleteEpisodePackage(root);

    const report = createAnimationStudioPackageProofReport(root, { generatedAt: "2026-06-06T00:00:00.000Z" });

    expect(report.ok).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.artifacts.map((artifact) => artifact.id)).toContain("episode-webm");
  });

  it("rejects source-only, notTrue3D, and image-puppet package evidence", () => {
    const root = fixtureRoot();
    writeCompleteEpisodePackage(root, {
      "prompt-animation-evidence.json": {
        ok: true,
        sourceOnly: true,
        route: "/?view=image-puppet",
        artifact: "tests/reports/prompt-animation/animation-image-puppet-animation.webm"
      },
      "route-proof.json": {
        ok: true,
        notTrue3D: true
      }
    });

    const report = createAnimationStudioPackageProofReport(root);

    expect(report.ok).toBe(false);
    expect(report.sourceIntegrity.forbiddenEvidence.map((entry) => entry.reason)).toEqual(expect.arrayContaining([
      "sourceOnly",
      "notTrue3D",
      "image-puppet"
    ]));
  });

  // ---- MOTION QUALITY (PRD 2.8 + 6.1): measured from the REAL render summary ----

  it("passes when characters take >1 staged pose and mouths move during dialogue", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root);

    const report = createAnimationStudioMotionQualityReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.metrics.movingCharacterCount).toBeGreaterThanOrEqual(2);
    expect(report.metrics.speakingMouthCount).toBeGreaterThanOrEqual(1);
    const miko = report.characters.find((c) => c.id === "miko");
    expect(miko?.distinctPositions).toBeGreaterThan(1);
    expect(miko?.mouthMovesDuringDialogue).toBe(true);
  });

  it("FAILS when a character is static (single pose, no mouth motion)", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root, {
      mutate: (summary) => {
        // Pin every sample for miko to the SAME pose + a constant closed mouth.
        for (const seek of summary.seekProofs) {
          for (const c of seek.characters) {
            if (c.id === "miko") {
              c.position = [-0.95, 0, 0];
              c.mouthOpenness = 0;
            }
          }
        }
        for (const beat of summary.stagedPerformance) {
          for (const c of beat.characters) if (c.id === "miko") c.position = [-0.95, 0, 0];
        }
      }
    });

    const report = createAnimationStudioMotionQualityReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/static|static mouth|more than one staged pose/i);
    const miko = report.characters.find((c) => c.id === "miko");
    expect(miko?.moves).toBe(false);
  });

  it("FAILS the motion gate when the render summary is missing", () => {
    const root = fixtureRoot();
    const report = createAnimationStudioMotionQualityReport(root, { summaryPath: liveSummaryRel });
    expect(report.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/missing|render-live/);
  });

  // ---- VISUAL QUALITY (6.1): real frames + toon applied + readable captions ----

  it("passes visual quality when frames exist, toon is applied, captions readable", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root);

    const report = createAnimationStudioVisualQualityReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.toon?.bands).toBeGreaterThanOrEqual(2);
    expect(report.captionCueCount).toBeGreaterThan(0);
    expect(report.frames.every((f) => f.exists && f.ok)).toBe(true);
  });

  it("FAILS visual quality when toon was not applied or captions are unreadable", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root, {
      mutate: (summary) => {
        summary.toon = { bands: 1, outline: false, colorGrade: false };
        for (const c of summary.captionProofs) c.contrastRatio = 1.2;
      }
    });

    const report = createAnimationStudioVisualQualityReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/Toon treatment|contrast/i);
  });

  it("FAILS visual quality when a representative frame PNG is empty/missing", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root, { skipFrame: "action" });

    const report = createAnimationStudioVisualQualityReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/action\.png is missing/);
  });

  // ---- PERFORMANCE BUDGET (6.1): measured from the REAL render summary ----

  it("passes the performance budget from a real render summary", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root);

    const report = createPerformanceBudgetReport(root, { manifestPath: null, summaryPath: liveSummaryRel });

    expect(report.ok).toBe(true);
    const ids = report.metrics.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining([
      "draw-calls-per-frame",
      "summary-total-encoded-bytes",
      "summary-encoded-bytes-per-second",
      "summary-frame-count-matches-duration"
    ]));
  });

  it("FAILS the performance budget when frame count drifts from duration*fps", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root, {
      mutate: (summary) => {
        summary.frameCount = 5; // expected 60s * 12fps = 720
      }
    });

    const report = createPerformanceBudgetReport(root, { manifestPath: null, summaryPath: liveSummaryRel });

    expect(report.ok).toBe(false);
    expect(report.breaches.join("\n")).toMatch(/frame count|frames-delta|differ from expected/i);
  });

  // ---- BODY MOTION (Phase H/B1/B2): body bones excl. mouth/caption/camera ----

  it("passes body motion when ≥2 characters move bodies above threshold (mouth excluded)", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root);

    const report = createAnimationStudioBodyMotionReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.metrics.movingBodyCount).toBeGreaterThanOrEqual(2);
    expect(report.metrics.idleTalkFallbackOnly).toBe(false);
    const miko = report.characters.find((c) => c.id === "miko");
    // The biggest mouth/jaw morph (0.65) must NOT be what carries the verdict.
    expect(miko?.topBone).not.toMatch(/jaw|mouth/i);
    expect(miko?.maxBodyBoneRotationRangeRad).toBeGreaterThanOrEqual(0.1);
  });

  it("FAILS body motion when a speaking character only moves its mouth (lip-flap only)", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root, {
      mutate: (summary) => {
        // Zero out every BODY bone, pin positions, keep only jaw/mouth moving.
        for (const seek of summary.seekProofs) {
          for (const c of seek.characters) {
            c.boneRotationRanges = { jaw: 0.65, mouth: 0.5 };
            c.position = c.id === "miko" ? [-0.95, 0, 0] : [1, 0, 0];
            c.clipSource = "talk";
          }
        }
        for (const beat of summary.stagedPerformance) {
          for (const c of beat.characters) c.position = c.id === "miko" ? [-0.95, 0, 0] : [1, 0, 0];
        }
        // The authoritative bodyMotion[] summary must reflect the same lip-flap-only render: no body
        // bone clears the threshold, hips static, only the talk clip plays.
        for (const b of summary.bodyMotion) {
          b.clipSource = "talk";
          b.maxRootTranslation = 0;
          b.bodyBoneRanges = { jaw: { rangeRad: 0.65 } };
        }
      }
    });

    const report = createAnimationStudioBodyMotionReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/only move their mouth|stiff body|idle\/talk fallback only/i);
  });

  it("FAILS body motion when the whole scene is idle/talk fallback only", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root, {
      mutate: (summary) => {
        for (const seek of summary.seekProofs) {
          for (const c of seek.characters) {
            c.clipSource = c.id === "miko" ? "idle" : "talk";
            c.boneRotationRanges = { jaw: 0.6 };
            c.position = c.id === "miko" ? [-0.95, 0, 0] : [1, 0, 0];
          }
        }
        for (const beat of summary.stagedPerformance) {
          for (const c of beat.characters) c.position = c.id === "miko" ? [-0.95, 0, 0] : [1, 0, 0];
        }
        // The authoritative bodyMotion[] summary must agree: every character only played the
        // idle/talk fallback, no body bone moved.
        for (const b of summary.bodyMotion) {
          b.clipSource = b.characterId === "miko" ? "idle" : "talk";
          b.maxRootTranslation = 0;
          b.bodyBoneRanges = { jaw: { rangeRad: 0.6 } };
        }
      }
    });

    const report = createAnimationStudioBodyMotionReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(false);
    expect(report.metrics.idleTalkFallbackOnly).toBe(true);
    expect(report.blockers.join("\n")).toMatch(/idle\/talk fallback only/i);
  });

  it("FAILS body motion when the render summary is missing", () => {
    const root = fixtureRoot();
    const report = createAnimationStudioBodyMotionReport(root, { summaryPath: liveSummaryRel });
    expect(report.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/missing|render-live/);
  });

  it("reads the REAL bodyMotion[] field contract (bodyBoneRanges + maxRootTranslation) and passes", () => {
    const root = fixtureRoot();
    // Strip the synthetic per-seek bone/clip fields so the verdict can ONLY come from the real
    // top-level bodyMotion[] summary the render emits — proving the gate reads the real contract.
    writeRealishRenderSummary(root, {
      mutate: (summary) => {
        for (const seek of summary.seekProofs) {
          for (const c of seek.characters) {
            delete (c as { boneRotationRanges?: unknown }).boneRotationRanges;
            delete (c as { clipSource?: unknown }).clipSource;
          }
        }
      }
    });

    const report = createAnimationStudioBodyMotionReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.metrics.movingBodyCount).toBeGreaterThanOrEqual(2);
    expect(report.metrics.displacedBodyCount).toBe(0);
    const miko = report.characters.find((c) => c.id === "miko");
    // The body-bone range + clip source came from bodyMotion[], not the (now-removed) seek fields.
    expect(miko?.topBone).toMatch(/shoulder/i);
    expect(miko?.clipSources).toContain("extracted");
    expect(miko?.rootTranslationMagnitude).toBeCloseTo(0.42, 2);
  });

  it("FAILS body motion when a character is displaced/contorted (lies on the floor)", () => {
    const root = fixtureRoot();
    // A broken render: miko's hips are flung 32m by an un-normalized raw-unit clip — the character
    // is displaced off-stage / collapsed to the floor. This MUST fail even though bones "move".
    writeRealishRenderSummary(root, {
      mutate: (summary) => {
        const miko = summary.bodyMotion.find((b) => b.characterId === "miko")!;
        miko.maxRootTranslation = 32.5; // raw-unit displacement (cm authored as metres)
        miko.bodyBoneRanges = { rightShoulder: { rangeRad: 0.4 }, spine: { rangeRad: 0.2 } };
        // Also reflect it in the per-frame clip decision shape the real render writes.
        for (const seek of summary.seekProofs) {
          for (const c of seek.characters) {
            if (c.id !== "miko") continue;
            delete (c as { boneRotationRanges?: unknown }).boneRotationRanges;
            (c as { clipDecision?: unknown }).clipDecision = {
              source: "extracted",
              rootTranslation: 32.5,
              bodyBoneRotationRad: { rightShoulder: 0.4, spine: 0.2 }
            };
          }
        }
      }
    });

    const report = createAnimationStudioBodyMotionReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(false);
    expect(report.metrics.displacedBodyCount).toBe(1);
    expect(report.blockers.join("\n")).toMatch(/displaced|flung off-stage|collapsed/i);
    const miko = report.characters.find((c) => c.id === "miko");
    expect(miko?.displaced).toBe(true);
    expect(miko?.bodyMoves).toBe(false); // a displaced character is broken, not "moving"
  });

  it("passes clean motion right at the plausible-displacement boundary (≲1m hips)", () => {
    const root = fixtureRoot();
    // A character that walks ~0.9m — real locomotion, NOT displacement — must still pass.
    writeRealishRenderSummary(root, {
      mutate: (summary) => {
        const miko = summary.bodyMotion.find((b) => b.characterId === "miko")!;
        miko.maxRootTranslation = 0.9;
      }
    });

    const report = createAnimationStudioBodyMotionReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(true);
    expect(report.metrics.displacedBodyCount).toBe(0);
    expect(report.characters.find((c) => c.id === "miko")?.displaced).toBe(false);
  });

  // ---- LIP-SYNC TIMING (Phase H/B7): mouth moves during dialogue, no holds ----

  it("passes lip-sync timing when mouths cycle during dialogue with no long holds", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root);

    const report = createLipSyncTimingReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.characters.some((c) => c.speaks && c.mouthMovesDuringDialogue)).toBe(true);
  });

  it("FAILS lip-sync timing on a long static mouth-open hold", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root, {
      mutate: (summary) => {
        // Mouth frozen open at a single value across the whole episode.
        for (const seek of summary.seekProofs) {
          for (const c of seek.characters) c.mouthOpenness = 0.8;
        }
      }
    });

    const report = createLipSyncTimingReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/static mouth|static mouth-open hold|frozen open/i);
  });

  it("FAILS lip-sync timing when the render summary is missing", () => {
    const root = fixtureRoot();
    const report = createLipSyncTimingReport(root, { summaryPath: liveSummaryRel });
    expect(report.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/missing|render-live/);
  });

  // ---- SUBTITLE TIMING (Phase H/C1): on-screen duration ≈ speech duration ----

  it("passes subtitle timing when caption windows match estimated speech duration", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root);

    const report = createSubtitleTimingReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.captions.every((c) => c.ok)).toBe(true);
  });

  it("FAILS subtitle timing when a short caption lingers far past its speech duration", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root, {
      mutate: (summary) => {
        // 8-word line held on screen for 30s (fixed-window lingering defect).
        summary.captionProofs[0]!.start = 0;
        summary.captionProofs[0]!.end = 30;
      }
    });

    const report = createSubtitleTimingReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/lingers/i);
  });

  it("FAILS subtitle timing when caption windows are missing (no start/end)", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root, {
      mutate: (summary) => {
        for (const c of summary.captionProofs) {
          delete c.start;
          delete c.end;
        }
      }
    });

    const report = createSubtitleTimingReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/lack start\/end|start\/end timing windows/i);
  });

  // ---- PROMPT SPECIFICITY (Phase H/D1): no moon-garden fixture leakage ----

  it("passes prompt specificity for a prompt-driven render with matching cast/captions", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root, {
      mutate: (summary) => {
        // A genuine "two robots in a garage" render — no moon markers, robot cast.
        summary.promptText = "two robots arguing in a garage";
        for (const beat of summary.stagedPerformance) {
          beat.characters = [
            { id: "rust", position: [-1, 0, 0], clip: "Loops" },
            { id: "bolt", position: [1, 0, 0], clip: "Loops" }
          ];
        }
        for (const seek of summary.seekProofs) {
          seek.caption = { text: "Hand me that wrench from the garage bench.", speakerId: "rust" };
          seek.characters = [
            { id: "rust", position: [-1, 0, 0], mouthOpenness: 0.4, clipSource: "extracted", boneRotationRanges: { arm: 0.3 } },
            { id: "bolt", position: [1, 0, 0], mouthOpenness: 0, clipSource: "procedural", boneRotationRanges: { spine: 0.2 } }
          ];
        }
        for (const c of summary.captionProofs) c.text = "Hand me that wrench from the garage bench.";
      }
    });

    const report = createPromptSpecificityReport(root, {
      summaryPath: liveSummaryRel,
      prompt: "two robots arguing in a garage"
    });

    expect(report.ok).toBe(true);
    expect(report.moonGardenMarkersFound).toEqual([]);
    expect(report.promptTermsMatched.length).toBeGreaterThan(0);
  });

  it("FAILS prompt specificity when a non-moon prompt leaks the Moon-Garden fixture", () => {
    const root = fixtureRoot();
    // The realish fixture IS the moon-garden cast (miko/luma + moon-lily captions).
    writeRealishRenderSummary(root);

    const report = createPromptSpecificityReport(root, {
      summaryPath: liveSummaryRel,
      prompt: "two robots arguing in a garage"
    });

    expect(report.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/Moon-Garden fixture/i);
    expect(report.moonGardenMarkersFound).toEqual(expect.arrayContaining(["miko cast", "luma cast"]));
  });

  // ---- NO FAKE PROOF (Phase H): reject self-reported pass flags ----

  it("passes the no-fake-proof rule for a measured render summary", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root);

    const report = createNoFakeProofReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(true);
    expect(report.violations).toEqual([]);
  });

  it("FAILS the no-fake-proof rule when the summary hard-codes a pass flag", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root, {
      mutate: (summary) => {
        (summary as unknown as Record<string, unknown>).passed = true;
        (summary as unknown as Record<string, unknown>).verified = true;
      }
    });

    const report = createNoFakeProofReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/hard-coded "passed"|hard-coded "verified"/);
  });

  it("FAILS the no-fake-proof rule when the summary carries no measured signals", () => {
    const root = fixtureRoot();
    writeJson(root, liveSummaryRel, { ok: true });

    const report = createNoFakeProofReport(root, { summaryPath: liveSummaryRel });

    expect(report.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/no measured signals|hard-coded "ok"/);
  });

  it("blocks animation overclaims while allowing negative claim-boundary wording", () => {
    const root = fixtureRoot();
    writeText(root, "README.md", "Aura3D is not Pixar-quality automatic animation and not a magic image-to-video engine.\n");
    writeText(root, "llms.txt", "Never call image-puppet release-ready.\n");
    writeText(root, "docs/project/claim-guidelines.md", "Aura3D 1.1 is Pixar-quality automatic animation for any 2D image.\n");

    const report = createAnimationStudioDocsClaimsReport(root, { paths: ["README.md", "llms.txt", "docs"] });

    expect(report.ok).toBe(false);
    expect(report.blockers).toHaveLength(1);
    expect(report.blockers[0]).toContain("Pixar-quality");
  });

  it("checks animation-studio template scripts and release-facing image-puppet references", () => {
    const badRoot = fixtureRoot();
    writeTemplateFixture(badRoot, {
      scripts: { build: "vite build", test: "playwright test" },
      channelPackage: { scripts: { "record:image-puppet": "playwright test tests/image-puppet-animation.spec.ts" } },
      channelReadme: "Run /?view=image-puppet and use animation-image-puppet-animation.webm."
    });

    const bad = createAnimationStudioTemplateSmokeReport(badRoot);

    expect(bad.ok).toBe(false);
    expect(bad.blockers.join("\n")).toMatch(/episode:render|image-puppet/);

    const goodRoot = fixtureRoot();
    writeTemplateFixture(goodRoot, {
      scripts: {
        build: "vite build",
        test: "playwright test",
        "episode:plan": "node scripts/episode-plan.mjs",
        "episode:preview": "vite --host 0.0.0.0",
        "episode:render": "node scripts/episode-render.mjs",
        "episode:package": "node scripts/episode-package.mjs",
        "episode:review": "node scripts/episode-review.mjs",
        "episode:verify": "npm run episode:render && npm run episode:package && npm run episode:review && pnpm animation-studio:motion-quality"
      },
      channelPackage: { scripts: { test: "playwright test tests/route-health.spec.ts" } },
      channelReadme: "Animation channel is source-level example documentation."
    });

    const good = createAnimationStudioTemplateSmokeReport(goodRoot);

    expect(good.ok).toBe(true);
  });

  it("aggregates package, visual, motion, docs, and template gates into readiness", () => {
    const root = fixtureRoot();
    writeCompleteEpisodePackage(root);
    // The visual + motion gates now read the REAL render summary, which the
    // readiness aggregator resolves relative to the package dir.
    writeRealishRenderSummary(root, { summaryPath: "dist/episodes/moon-garden-001/render-live-summary.json", framesUnderPackage: true });
    writeText(root, "README.md", "Aura3D 1.1 is not Pixar-quality automatic animation.\n");
    writeText(root, "llms.txt", "Do not use image-puppet as release proof.\n");
    writeTemplateFixture(root, {
      scripts: {
        build: "vite build",
        test: "playwright test",
        "episode:plan": "node scripts/episode-plan.mjs",
        "episode:preview": "vite --host 0.0.0.0",
        "episode:render": "node scripts/episode-render.mjs",
        "episode:package": "node scripts/episode-package.mjs",
        "episode:review": "node scripts/episode-review.mjs",
        "episode:verify": "npm run episode:render && npm run episode:package && npm run episode:review && pnpm animation-studio:visual-quality"
      },
      channelPackage: { scripts: { test: "playwright test tests/route-health.spec.ts" } },
      channelReadme: "Historical source-only example. Not publish-ready."
    });

    const report = createAura3D11ReleaseReadinessReport(root, { generatedAt: "2026-06-06T00:00:00.000Z" });
    writeAura3D11ReleaseReadinessReport(root, report);

    expect(report.gates.map((gate) => gate.id)).toEqual([
      "animation-package",
      "visual-quality",
      "motion-quality",
      "docs-claims",
      "template-smoke"
    ]);
    expect(report.ok).toBe(true);
    expect(existsSync(join(root, "tests/reports/aura3d11/readiness.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(root, "tests/reports/aura3d11/readiness.json"), "utf8")).schema).toBe("aura3d11-release-readiness/v1");
  });
});

const liveSummaryRel =
  "packages/create-aura3d/templates/animation-studio/dist/episodes/live-3d/render-live-summary.json";

function fixtureRoot(): string {
  return mkdtempSync(join(tmpdir(), "aura3d11-animation-gates-"));
}

interface RealishSummary {
  kind: string;
  route: string;
  framesDir: string;
  video: string;
  videoBytes: number;
  frameRate: number;
  episodeDuration: number;
  frameCount: number;
  toon: { bands: number; outline: boolean; colorGrade: boolean };
  promptText?: string;
  stagedPerformance: { shotId: string; time: number; characters: { id: string; position: number[]; clip: string }[] }[];
  captionProofs: { time: number; shotId: string; text: string; contrastRatio?: number; start?: number; end?: number }[];
  seekProofs: {
    time: number;
    drawCalls: number;
    caption?: { text: string; speakerId?: string };
    shot?: { shotId: string; presetId: string };
    characters: {
      id: string;
      position: number[];
      mouthOpenness: number;
      clipSource?: string;
      boneRotationRanges?: Record<string, number>;
    }[];
  }[];
  // Real render top-level body-motion summary (the authoritative field contract the body-motion
  // gate reads): per character {clipSource, maxRootTranslation, bodyBoneRanges{bone:{rangeRad}}}.
  bodyMotion: {
    characterId: string;
    clipSource: string;
    maxRootTranslation: number;
    bodyBoneRanges: Record<string, { rangeRad: number }>;
  }[];
  mouthProof: { changedPixels: number; meanRgbDiff: number };
}

/**
 * Build a realistically-shaped `render-live-summary.json` (the artifact
 * scripts/render-live.ts actually writes) plus the representative frame PNGs.
 * Two characters across three beats, each moving and lip-syncing during dialogue.
 */
function buildRealishSummary(framesDir: string): RealishSummary {
  // Two speaking characters across three beats. Each takes a different staged pose
  // (root translation), plays a real (non-fallback) clip with body bones above the
  // motion threshold, and lip-syncs while its own caption is on screen. Captions
  // carry start/end windows sized to their estimated speech duration.
  const beats = [
    {
      shotId: "shot-open",
      time: 0,
      miko: [-0.95, 0, 0],
      luma: [1, 0, 0],
      speaker: "miko",
      text: "Luma, the moon lilies are losing their sparkle.", // ~8 words
      start: 0,
      end: 3.4
    },
    {
      shotId: "shot-mid",
      time: 20,
      miko: [-0.65, 0, 0],
      luma: [0.68, 0, 0],
      speaker: "luma",
      text: "I noticed the same dimming near the old well.", // ~9 words
      start: 3.6,
      end: 7.2
    },
    {
      shotId: "shot-finish",
      time: 40,
      miko: [-0.3, 0, 0],
      luma: [0.4, 0, 0],
      speaker: "miko",
      text: "Then we follow the dimming back to its source.", // ~9 words
      start: 7.4,
      end: 11.0
    }
  ];
  // Body bones above the 0.1-rad threshold (jaw/mouth deliberately included to
  // prove the gate EXCLUDES them when judging body motion).
  const mikoBones = { rightShoulder: 0.42, spine: 0.21, head: 0.16, jaw: 0.65, mouth: 0.5 };
  const lumaBones = { leftArm: 0.38, chest: 0.24, neck: 0.18, jaw: 0.6 };
  const seekProofs: RealishSummary["seekProofs"] = [];
  for (let s = 0; s < 60; s += 1) {
    const beat = beats[Math.min(beats.length - 1, Math.floor(s / 20))]!;
    // Mouth openness cycles with syllable cadence while a caption is on screen.
    const speaking = [0, 0.522, 0.098, 0.8, 0.2][s % 5]!;
    const mikoMouth = beat.speaker === "miko" ? speaking : 0;
    const lumaMouth = beat.speaker === "luma" ? speaking : 0;
    seekProofs.push({
      time: s,
      drawCalls: 63,
      caption: { text: beat.text, speakerId: beat.speaker },
      shot: { shotId: beat.shotId, presetId: "two-shot" },
      characters: [
        {
          id: "miko",
          position: beat.miko,
          mouthOpenness: mikoMouth,
          clipSource: beat.speaker === "miko" ? "extracted" : "procedural",
          boneRotationRanges: mikoBones
        },
        {
          id: "luma",
          position: beat.luma,
          mouthOpenness: lumaMouth,
          clipSource: beat.speaker === "luma" ? "extracted" : "procedural",
          boneRotationRanges: lumaBones
        }
      ]
    });
  }
  return {
    kind: "animation-studio-live-3d-render",
    route: "live-route.html",
    framesDir,
    video: `${framesDir.replace(/\/frames$/, "")}/episode-3d.webm`,
    videoBytes: 1_663_498,
    frameRate: 12,
    episodeDuration: 60,
    frameCount: 720,
    promptText: "miko and luma tend the moon garden",
    toon: { bands: 6, outline: true, colorGrade: true },
    stagedPerformance: beats.map((b) => ({
      shotId: b.shotId,
      time: b.time,
      characters: [
        { id: "miko", position: b.miko, clip: "Loops" },
        { id: "luma", position: b.luma, clip: "Armature|Armature.001Action" }
      ]
    })),
    captionProofs: beats.map((b) => ({
      time: b.time,
      shotId: b.shotId,
      text: b.text,
      contrastRatio: 12.4,
      start: b.start,
      end: b.end
    })),
    seekProofs,
    // The real render's authoritative per-character body-motion summary. Body bones clear the
    // 0.1-rad threshold; hips translation is plausible (≲1m) — a clean, non-displaced render.
    bodyMotion: [
      {
        characterId: "miko",
        clipSource: "extracted",
        maxRootTranslation: 0.42,
        bodyBoneRanges: { rightShoulder: { rangeRad: 0.42 }, spine: { rangeRad: 0.21 }, head: { rangeRad: 0.16 }, hips: { rangeRad: 0.05 } }
      },
      {
        characterId: "luma",
        clipSource: "procedural",
        maxRootTranslation: 0.31,
        bodyBoneRanges: { leftUpperArm: { rangeRad: 0.38 }, chest: { rangeRad: 0.24 }, neck: { rangeRad: 0.18 } }
      }
    ],
    mouthProof: { changedPixels: 0, meanRgbDiff: 0 }
  };
}

function writeRealishRenderSummary(
  root: string,
  options: {
    readonly summaryPath?: string;
    readonly framesUnderPackage?: boolean;
    readonly skipFrame?: "first" | "dialogue" | "action" | "final";
    readonly mutate?: (summary: RealishSummary) => void;
  } = {}
): void {
  const summaryRel = options.summaryPath ?? liveSummaryRel;
  // frames live next to the summary by default (the gate's default resolution).
  const framesRel = options.framesUnderPackage
    ? "dist/episodes/moon-garden-001/frames"
    : "packages/create-aura3d/templates/animation-studio/dist/episodes/live-3d/frames";
  const summary = buildRealishSummary(framesRel);
  if (options.mutate) options.mutate(summary);
  writeJson(root, summaryRel, summary);
  for (const id of ["first", "dialogue", "action", "final"] as const) {
    if (options.skipFrame === id) continue;
    writeBytes(root, `${framesRel}/${id}.png`, 2_000);
  }
}

function writeCompleteEpisodePackage(root: string, overrides: Record<string, unknown> = {}): void {
  const packageDir = "dist/episodes/moon-garden-001";
  writeBytes(root, `${packageDir}/episode.webm`, 40_000);
  writeBytes(root, `${packageDir}/thumbnail.png`, 2_000);
  writeBytes(root, `${packageDir}/frames/first.png`, 2_000);
  writeBytes(root, `${packageDir}/frames/dialogue.png`, 2_000);
  writeBytes(root, `${packageDir}/frames/action.png`, 2_000);
  writeBytes(root, `${packageDir}/frames/final.png`, 2_000);
  writeText(root, `${packageDir}/captions.vtt`, "WEBVTT\n\n00:00.000 --> 00:02.000\nThe garden glows.\n");
  writeText(root, `${packageDir}/captions.srt`, "1\n00:00:00,000 --> 00:00:02,000\nThe garden glows.\n");
  writeText(root, `${packageDir}/review-package.md`, "# Moon Garden Review\n\nRepresentative frames and motion report are ready.\n");
  const jsonDefaults: Record<string, unknown> = {
    "metadata.json": { ok: true, episodeId: "moon-garden-001", duration: 50, frameRate: 30 },
    "prompt-animation-evidence.json": { ok: true, publishReady: true, sourceOnly: false },
    "route-proof.json": { ok: true, shots: 5, notTrue3D: false },
    "asset-provenance.json": { ok: true, assets: [{ id: "miko", license: "CC0-1.0", checksum: "sha256:abc" }] },
    "render-manifest.json": { ok: true, frameHashChanges: 24, frameCount: 1500, cameraMotionDeclared: true },
    "visual-acceptance.json": { ok: true, note: "Derived from the live render summary; no self-reported pass flags." }
  };
  for (const [file, value] of Object.entries({ ...jsonDefaults, ...overrides })) {
    writeJson(root, `${packageDir}/${file}`, value);
  }
}

function writeTemplateFixture(
  root: string,
  options: {
    readonly scripts: Record<string, string>;
    readonly channelPackage: { readonly scripts: Record<string, string> };
    readonly channelReadme: string;
  }
): void {
  writeJson(root, "packages/create-aura3d/templates/animation-studio/package.json", {
    name: "aura3d-animation-studio",
    scripts: options.scripts
  });
  writeText(
    root,
    "packages/create-aura3d/templates/animation-studio/src/main.ts",
    `import { createAuraApp, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";
createAuraApp("#app", { scene: scene().add(model(assets.miko)).add(model(assets.luma)).add(model(assets.moonGarden)) });
`
  );
  writeText(root, "packages/create-aura3d/templates/animation-studio/src/render-plan.ts", "export const renderPlan = { publishReady: true, sourceOnly: false };\n");
  writeText(root, "packages/create-aura3d/templates/animation-studio/README.md", "Use typed miko, luma, and moonGarden assets.\n");
  writeJson(root, "packages/create-aura3d/templates/animation-studio/aura.assets.json", {
    schema: "aura3d.assets/1.0",
    assetBasePath: "/aura-assets/",
    outputDir: "public/aura-assets",
    typegen: "src/aura-assets.ts",
    assets: []
  });
  writeJson(root, "packages/create-aura3d/templates/animation-channel/package.json", options.channelPackage);
  writeText(root, "packages/create-aura3d/templates/animation-channel/README.md", options.channelReadme);
}

function writeJson(root: string, path: string, value: unknown): void {
  writeText(root, path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(root: string, path: string, value: string): void {
  const absolute = join(root, path);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, value, "utf8");
}

function writeBytes(root: string, path: string, bytes: number): void {
  const absolute = join(root, path);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, Buffer.alloc(bytes, 1));
}
