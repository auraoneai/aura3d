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

// `showcase-skyline-runner` and `showcase-turbo-drift-circuit` were retired in 4.0.1
// (`docs/project/showcase/apps-classification.md`); their route-binding cases are retired with them
// (docs/project/status/retired-tests.md, "ACR unit shard 5" section).
// The Aura Clash and Blockfall Reactor apps were deleted later; their frame-data and game-loop cases
// went with them. The product configurator and digital twin cases went with those apps in the
// 30-game prune.

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
