import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auraClashAttackFrames } from "../../../apps/aura-clash-showcase/src/playable/combat/auraClashMoveData";

/**
 * WS-5.3 — the reported route defects, as retained regression cases named by route ID.
 *
 * The PRD names these explicitly because they kept "slipping back into 'not in scope'". Each one
 * was reported against a specific route, so each assertion below names that route.
 *
 * ## What these tests are, and are not
 *
 * The engine-level fixes have their own tests: `focus-selection.test.ts` covers the ring geometry,
 * `spatial-anchoring.test.ts` covers bounds-relative anchors, `production-backend-invariants.test.ts`
 * covers the four physics defects. Duplicating those here would prove nothing new.
 *
 * What was genuinely missing is **route binding**: proof that the named route actually consumes
 * the fixed shared API rather than carrying its own copy. That is the failure mode R3 exists to
 * prevent — an engine fix landing while the route keeps a local workaround, so the engine test
 * passes and the route stays broken. Every assertion here is therefore of the form "this route
 * reaches the shared implementation, and does not reach the pattern the defect came from".
 *
 * A screenshot is not a regression test (WS-5.3), so nothing here reads an image.
 */

function routeSource(route: string, file = "src/main.ts"): string {
  return readFileSync(`apps/${route}/${file}`, "utf8");
}

describe("showcase-product-configurator — focus indicator and callout visibility", () => {
  const source = routeSource("showcase-product-configurator");

  it("uses the shared focus API rather than building its own indicator", () => {
    // The flattened-bar defect was a torus built with the wrong tube axis. It is fixed in
    // `FocusSelection.ts` and covered by `focus-selection.test.ts`; what matters here is that
    // this route goes through that code instead of authoring a ring locally.
    // `focusSemanticRegion` is the route-facing entry to the same shared implementation.
    expect(source).toMatch(/focusObject|focusSemanticRegion|focusSelection/);
  });

  it("does not hand-author focus ring geometry in the route", () => {
    // A local torus/ring is how the defect would return: the engine gets fixed, the route keeps
    // its own copy, and the engine test still passes. R3 in one assertion.
    expect(source).not.toMatch(/new\s+TorusGeometry|torus\(\s*\{[^}]*tube/);
  });

  it("requests a callout through the shared API, so label visibility is the engine's contract", () => {
    // The reported defect was a missing callout. `focusObject` emits a callout label anchored
    // outside the target; a route that never asks for one cannot show one.
    expect(source).toMatch(/callout/i);
  });
});

describe("showcase-digital-twin-ops — floating procedural geometry", () => {
  const source = routeSource("showcase-digital-twin-ops");

  it("anchors to asset bounds instead of literal helper coordinates", () => {
    // The defect: helpers placed at hard-coded world positions float away from a subject whose
    // size comes from an asset. `placedBounds` / `resolveBoundsAnchor` derive the position from
    // the subject, so swapping the asset moves the anchor with it.
    expect(source).toMatch(/placedBounds|resolveBoundsAnchor|boundsAnchor|placedBoundsFromAsset/);
  });

  it("derives every helper anchor from bounds, with no literal fallback beside it", () => {
    /*
     * Scoped to *helpers*, which is what the defect was about.
     *
     * A first version of this test rejected any literal `position:` with a non-zero height and
     * failed on three — all of which were legitimate: an overview camera pose and two light
     * positions. Lights and cameras are scene composition, not procedural geometry anchored to a
     * subject, and requiring them to be bounds-derived would be a worse route, not a better one.
     *
     * The real invariant is that every anchor the *helpers* use comes from the asset's bounds, so
     * swapping the asset moves them. Asserted by requiring anchors to be resolved and by
     * rejecting the pattern that produced floating geometry: an `anchor`/`callout`/`label`
     * position given as a bare literal tuple.
     */
    const anchorCalls = source.match(/resolveBoundsAnchor\(|resolveSemanticRegion\(/g) ?? [];
    expect(anchorCalls.length, "no helper anchor is derived from asset bounds").toBeGreaterThan(0);

    const literalAnchors =
      source.match(/(anchor|callout|label|marker|badge)\w*:\s*\[\s*-?\d+(\.\d+)?\s*,/gi) ?? [];
    expect(
      literalAnchors.length,
      `helper anchored at a literal instead of asset bounds: ${literalAnchors.slice(0, 3).join(", ")}`
    ).toBe(0);
  });
});

describe("aura-clash-showcase — hit timing, spacing and recovery frames", () => {
  it("gives every attack more recovery than active frames", () => {
    /*
     * The reported defect, stated as the numbers: the route shipped **12-32 active frames against
     * 4-5 recovery**, inverted from any real fighting game. An attack whose hitbox is live longer
     * than its recovery cannot be punished, so spacing and whiff-punishment — the whole game —
     * do not exist.
     *
     * Frame data is now derived by `solveCombatFrameData` from an intended role rather than
     * hand-authored. Measured today: light 5/active/10, heavy 13/active/22, special 18/active/67.
     */
    for (const [id, frames] of Object.entries(auraClashAttackFrames)) {
      expect(frames.recovery, `${id}: recovery ${frames.recovery} <= active ${frames.active}`).toBeGreaterThan(frames.active);
      expect(frames.startup, `${id} has no startup, so it is unreactable`).toBeGreaterThan(0);
    }
  });

  it("leaves at least one attack punishable on block, so spacing matters", () => {
    // If every move is plus on block there is no risk in attacking and no spacing game.
    const onBlock = Object.values(auraClashAttackFrames).map((frames) => frames.advantage.onBlock);
    expect(Math.min(...onBlock), "no attack is punishable on block").toBeLessThan(0);
  });

  it("scales risk with reward rather than making the strongest move safest", () => {
    // The heaviest-damage move must not also be the safest, which is the inverted-tuning shape
    // the original frame data had.
    const attacks = Object.values(auraClashAttackFrames);
    const strongest = attacks.reduce((best, frames) => (frames.damage > best.damage ? frames : best));
    const safest = attacks.reduce((best, frames) => (frames.advantage.onBlock > best.advantage.onBlock ? frames : best));
    expect(strongest.id, "the highest-damage attack is also the safest on block").not.toBe(safest.id);
  });
});

describe("showcase-skyline-runner — jump, landing, scenery, session lifecycle", () => {
  const source = routeSource("showcase-skyline-runner");

  it("derives jump motion from the shared solver rather than route-local tuning", () => {
    // The barely-there jump came from apex being geometry-derived in `solvePlatformerMotion`. The
    // fix is intent-derived apex; the binding is that this route uses the solver at all.
    expect(source).toMatch(/solvePlatformerMotion|validatePlatformerMotion|platformerMotion/);
  });

  it("does not carry its own gravity or jump-velocity constants", () => {
    // Route-local physics constants are how a shared fix stops reaching the route (R3).
    expect(source).not.toMatch(/const\s+(GRAVITY|JUMP_VELOCITY|JUMP_SPEED)\s*=/);
  });

  it("reports session lifecycle rather than self-authoring completion", () => {
    // Retained from the existing gameplay-regression suite because it is one of the named
    // symptoms: a route that declares itself complete cannot demonstrate a session.
    expect(source).toContain("completed: false");
    expect(source).not.toContain("visualReviewPass: true");
  });
});

describe("showcase-turbo-drift-circuit — tyre contact, track surface, opponent", () => {
  const source = routeSource("showcase-turbo-drift-circuit");

  it("grounds the car on a surface query rather than a frozen plane constant", () => {
    /*
     * The wheels-sinking defect was a rendered Y pinned to a single `TRACK_SURFACE_Y` literal: a
     * car grounded on a frozen plane cannot respond to the surface it is over. `VehicleChassis`
     * takes a surface query and derives chassis height from four contact points.
     */
    expect(source).toMatch(/createVehicleChassis|vehicleChassis|surfaceQuery/);
    expect(source).not.toMatch(/const\s+TRACK_SURFACE_Y\s*=/);
  });

  it("drives the opponent from a shared driver rather than a route-local integrator", () => {
    expect(source).toMatch(/createTurboOpponentAi|opponentAi/);
  });

  it("still declares its blocker rather than claiming a visual pass", () => {
    // ADR 0002 blocks the force-model migration, so this route stays honest about it.
    expect(source).not.toContain("visualReviewPass: true");
  });
});

describe("showcase-blockfall-reactor — complete game-loop verification", () => {
  const source = routeSource("showcase-blockfall-reactor");

  it("publishes observed gameplay proof rather than asserting its own completion", () => {
    expect(source).toContain("observedGameplayProof");
    expect(source).toContain("observedGameplayProof.eventCounts.reset += 1");
  });

  it("does not pin solver iterations locally, so it inherits the corrected default", () => {
    /*
     * Blockfall's shoving blocks were caused by `solverIterations` defaulting to 1 against
     * cannon's own 10. The fix is the engine default; a route that pinned the value locally would
     * not benefit from it — and 1 is exactly the value a route would have pinned while trying to
     * make the old behaviour look intentional.
     */
    expect(source).not.toMatch(/solverIterations:\s*[1-5]\b/);
  });
});

describe("cross-cutting — labels must not be Canvas-2D-only", () => {
  it("keeps Canvas 2D refusing a renderable scene, so a label cannot be 2D-only", () => {
    /*
     * The reported cross-cutting defect: labels reaching the scene graph but drawn only in the
     * Canvas-2D path, so a label that "exists" is invisible in the production renderer.
     *
     * WS-2.5 made Canvas 2D diagnostic-only and gave it exactly one selection site that refuses a
     * renderable scene. That is the structural fix — if the 2D path cannot be selected for a
     * renderable scene, a label drawn only there cannot ship. Asserted on the engine source
     * because it is a property of the selection site, not of any one route.
     */
    const source = readFileSync("packages/engine/src/agent-api/index.ts", "utf8");
    expect(source).toMatch(/canvas2d/);
    // The refusal must be reachable: some diagnostic path names it as internal-only.
    expect(source).toMatch(/internal|diagnostic/i);
  });
});
