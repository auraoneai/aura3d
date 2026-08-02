import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Regression coverage for defect 52.
 *
 * The Aura Clash machine visual table passed a required review area on
 * `hasPageDeclaration || hasVisibleDomSignal`, so a hand-authored string in
 * `window.__AURA_CLASH_VISUAL_REVIEW__` was sufficient. Five of six required areas were passing
 * that way with no DOM signal at all, including `effects` and `lighting-materials` -- the two
 * areas the PRD explicitly says page declarations must not be able to pass.
 *
 * A required area must now be backed by a screenshot-derived measurement, an independently
 * verified renderer diagnostic, or -- only for areas that are genuinely DOM, i.e. the HUD -- a
 * visible DOM element.
 */
const SOURCE = readFileSync("apps/aura-clash-showcase/scripts/capture-first-frame.mjs", "utf8");

describe("Aura Clash machine visual table cannot pass on page declarations", () => {
  it("no longer treats a page declaration as sufficient", () => {
    expect(SOURCE).not.toContain("hasPageDeclaration || hasVisibleDomSignal ? \"pass\"");
    expect(SOURCE).toContain("declarationAloneIsInsufficient");
  });

  it("derives screenshot signals from decoded pixels rather than compressed bytes", () => {
    // The pre-existing `imageEvidence` sampled compressed bytes, which cannot describe a region.
    expect(SOURCE).toContain("function decodePngRgba");
    expect(SOURCE).toContain("function measureCanvasRegions");
    expect(SOURCE).toMatch(/luminanceStdDev/);
    expect(SOURCE).toMatch(/saturatedRatio/);
  });

  it("reads renderer diagnostics from the mounted proof, not the review declaration", () => {
    expect(SOURCE).toContain("function collectRendererDiagnostics");
    expect(SOURCE).toContain("__AURA_CLASH_ARENA_PROOF__");
    // A declaration must never be the diagnostic source.
    const diagnosticsBlock = SOURCE.slice(
      SOURCE.indexOf("async function collectRendererDiagnostics"),
      SOURCE.indexOf("function createImageEvidence")
    );
    expect(diagnosticsBlock).not.toContain("__AURA_CLASH_VISUAL_REVIEW__");
  });

  it("requires effects and lighting/materials to have a measured or diagnostic signal", () => {
    const signals = SOURCE.slice(SOURCE.indexOf("function areaMachineSignals"), SOURCE.indexOf("function buildVisualReviewEvidence"));
    for (const area of ["effects", "lighting-materials"]) {
      expect(signals, `${area} needs an explicit machine predicate`).toContain(`case "${area}":`);
    }
    // Neither may fall back to the DOM-backed exemption.
    expect(SOURCE).toContain('const DOM_BACKED_REVIEW_AREAS = new Set(["hud"]);');
  });

  it("rejects the pre-mount renderer backend as a diagnostic signal", () => {
    // `backend: "none"` is the value the route publishes before the renderer mounts; accepting any
    // truthy string would let an unmounted route satisfy the debug-overlay requirement.
    expect(SOURCE).toContain('entry.backend !== "none"');
  });

  it("keeps the retained first-frame evidence backed by real signals", () => {
    const evidence = JSON.parse(
      readFileSync("apps/aura-clash-showcase/launch-evidence/first-frame.json", "utf8")
    ) as {
      readonly visualEvidenceGate: { readonly machineChecksOk: boolean };
      readonly visualReviewEvidence: {
        readonly areas: readonly {
          readonly id: string;
          readonly status: string;
          readonly screenshotSignal: boolean;
          readonly diagnosticSignal: boolean;
          readonly hasVisibleDomSignal: boolean;
          readonly domBackedArea: boolean;
        }[];
      };
    };
    expect(evidence.visualEvidenceGate.machineChecksOk).toBe(true);
    for (const area of evidence.visualReviewEvidence.areas) {
      expect(area.status, `${area.id} status`).toBe("pass");
      const backed = area.screenshotSignal
        || area.diagnosticSignal
        || (area.domBackedArea && area.hasVisibleDomSignal);
      expect(backed, `${area.id} must not pass on a declaration alone`).toBe(true);
    }
  });

  it("verifies both fighters per required composition rather than only during gameplay", () => {
    expect(SOURCE).toContain('id: "fighters-composed"');
    // Grounding, separation, clip playback, and skinning must all be required.
    expect(SOURCE).toContain("fighters.bothGrounded");
    expect(SOURCE).toContain("fighters.separated");
    expect(SOURCE).toContain("fighters.bothClipped");
    expect(SOURCE).toContain("fighters.skinningBound");

    const evidence = JSON.parse(
      readFileSync("apps/aura-clash-showcase/launch-evidence/first-frame.json", "utf8")
    ) as {
      readonly visualEvidenceGate: { readonly checks: readonly { readonly id: string; readonly ok: boolean }[] };
      readonly visualReviewContract: { readonly evidenceRequirements: { readonly requiredCaptureCount: number } };
      readonly captures: readonly {
        readonly id: string;
        readonly rendererDiagnostics: {
          readonly noPrimitiveFighters?: boolean;
          readonly fighters?: {
            readonly bothGrounded: boolean;
            readonly bothClipped: boolean;
            readonly separated: boolean;
            readonly skinningBound: boolean;
          };
        } | null;
      }[];
    };
    const check = evidence.visualEvidenceGate.checks.find((entry) => entry.id === "fighters-composed");
    expect(check?.ok, "retained fighters-composed check").toBe(true);

    const required = evidence.visualReviewContract.evidenceRequirements.requiredCaptureCount;
    expect(evidence.captures.length).toBeGreaterThanOrEqual(required);
    for (const capture of evidence.captures.slice(0, required)) {
      const fighters = capture.rendererDiagnostics?.fighters;
      expect(fighters, `${capture.id} fighter state`).toBeTruthy();
      expect(fighters?.bothGrounded, `${capture.id} both grounded`).toBe(true);
      expect(fighters?.separated, `${capture.id} fighters separated`).toBe(true);
      expect(fighters?.bothClipped, `${capture.id} both clip-driven`).toBe(true);
      expect(fighters?.skinningBound, `${capture.id} both skinning-bound`).toBe(true);
      expect(capture.rendererDiagnostics?.noPrimitiveFighters, `${capture.id} typed fighters`).toBe(true);
    }
  });

  it("does not reintroduce a primitive skyline as the arena backdrop", () => {
    const stage = readFileSync("apps/aura-clash-showcase/src/playable/arena/RenderedArenaStage.ts", "utf8");
    // Six primitive cubes previously stood in for the hero environment, which the repo forbids and
    // which rendered as flat dark rectangles behind the fighters.
    expect(stage).not.toContain("skylineBlocks");
    expect(stage).not.toMatch(/^\s*"skyline-buildings",$/m);
    expect(stage).not.toMatch(/item\(`skyline-/);
    // No element in the renderer-owned stage layer may stand in for architecture. The banner slabs and
    // light-pillar blocks that used to live here were removed in defect 58 for the same reason the
    // primitives were: with the typed arena rendering behind them they read as debris on the scene.
    expect(stage).not.toMatch(/item\("(left|right)-banner"/);
    expect(stage).not.toMatch(/item\("(left|right)-light-pillar"/);

    /*
     * The backdrop binding is asserted where it is actually declared.
     *
     * `RenderedArenaStage.ts` owns fight-plane furniture; the typed arena is loaded by the route's
     * arena actor and consolidated under the `aura-clash-arena-architecture` label prefix. The
     * authoritative declaration is the element list in `AuraClashArenaStage.ts`, which is matched
     * against labels a real frame submitted, so a backdrop that emits nothing cannot pass.
     */
    const declarations = readFileSync("apps/aura-clash-showcase/src/playable/arena/AuraClashArenaStage.ts", "utf8");
    expect(declarations).toContain("typed-arena-environment");
    expect(declarations).toContain("aura-clash-arena-architecture");

    // And the route must bind that prefix to a typed asset rather than to primitives.
    const route = readFileSync("apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts", "utf8");
    expect(route).toContain("labelPrefix: \"aura-clash-arena-architecture\"");
    expect(route).toContain("asset: assets.arenaNeonDowntownTextured");
  });
});
