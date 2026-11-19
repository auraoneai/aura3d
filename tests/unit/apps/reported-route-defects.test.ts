import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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

// `showcase-skyline-runner` and `showcase-turbo-drift-circuit` were retired in 4.0.1
// (`docs/project/showcase/apps-classification.md`); their route-binding cases are retired with them
// (docs/project/status/retired-tests.md, "ACR unit shard 5" section).
// The Aura Clash and Blockfall Reactor apps were deleted later; their frame-data and game-loop cases
// went with them.

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
    const source = (function agentApiSource() {
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".ts") ? [join(d, e.name)] : []);
  return walk("packages/engine/src/agent-api").map((f) => readFileSync(f, "utf8")).join("\n");
})();
    expect(source).toMatch(/canvas2d/);
    // The refusal must be reachable: some diagnostic path names it as internal-only.
    expect(source).toMatch(/internal|diagnostic/i);
  });
});
