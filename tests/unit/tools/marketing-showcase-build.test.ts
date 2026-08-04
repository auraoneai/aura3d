import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const buildScript = readFileSync("marketing/scripts/build-showcase-routes.mjs", "utf8");
const engineSource = readFileSync("packages/engine/src/agent-api/index.ts", "utf8");
// `showcase-public-racing-presentation-proof` and `showcase-public-platformer-presentation-proof` were
// deleted in 1.5.0 as superseded by Turbo Drift Circuit and Skyline Runner, so the retained public game
// routes are the two current ones.
const publicGameRouteSources = [
  readFileSync("apps/showcase-turbo-drift-circuit/src/main.ts", "utf8"),
  readFileSync("apps/showcase-skyline-runner/src/main.ts", "utf8")
].join("\n");

/*
 * Helpers the **retained** public game routes actually call.
 *
 * The previous list named the eleven granular helpers (`racingRoadMesh`, `platformerGroundMesh`, ...),
 * which only the two deleted presentation proofs used. Turbo Drift Circuit and Skyline Runner call the
 * composed surfaces instead, so keeping the old list would have asserted against source that no longer
 * exists. Each entry below is verified present in the retained route sources, so this stays a real guard
 * rather than a list that happens to pass.
 */
const requiredPublicGameHelpers = [
  "racingPresentationTrack",
  "platformerPresentationSurfaces"
] as const;

/** Granular helpers that must remain exported for template and downstream use, even if unused here. */
const requiredEngineExportedGameHelpers = [
  "racingRoadMesh",
  "racingStartFinish",
  "publicRacingPresentation",
  "certifyRacingPresentation",
  "platformerGroundMesh",
  "platformerPlatformMesh",
  "platformerHazard",
  "platformerCheckpoint",
  "platformerFinish",
  "publicPlatformerPresentation",
  "certifyPlatformerPresentation"
] as const;

describe("marketing showcase route build", () => {
  it("bundles showcase routes against the current public agent-api source", () => {
    expect(buildScript).toContain("\"packages\", \"engine\", \"src\", \"agent-api\", \"index.ts\"");
    expect(buildScript).toContain("assertRequiredEngineSourceHelpers");
    expect(buildScript).not.toContain("\"node_modules\", \"@aura3d\", \"engine\", \"dist\", \"engine\", \"agent-api\", \"index.js\"");
  });

  it("guards every public game presentation helper used by the routes", () => {
    for (const helper of requiredPublicGameHelpers) {
      expect(publicGameRouteSources, `retained routes must call game.${helper}`).toContain(`game.${helper}`);
      expect(engineSource, `${helper} must stay exported`).toContain(`${helper}:`);
    }
  });

  it("keeps the granular public game helpers exported even where no retained route calls them", () => {
    // Deleting the two presentation proofs removed the only callers of these helpers. They remain part
    // of the published surface, so their removal from the engine must still be caught here.
    for (const helper of requiredEngineExportedGameHelpers) {
      expect(engineSource, `${helper} must stay exported`).toContain(`${helper}:`);
    }
  });
  it("publishes current game presentations, prunes deleted routes, and excludes diagnostic harnesses", () => {
    for (const route of ["showcase-turbo-drift-circuit", "showcase-skyline-runner"]) {
      expect(buildScript).toContain(`"${route}"`);
    }
    // The two deleted presentation proofs must stay in the prune list so a stale `dist/` from an older
    // build is still cleaned, even though their source no longer exists.
    for (const deleted of [
      "showcase-public-racing-presentation-proof",
      "showcase-public-platformer-presentation-proof"
    ]) {
      expect(buildScript).toContain(`"${deleted}"`);
    }
    expect(buildScript).toContain("release-ready game route must be published by marketing build");
    /*
     * The game-layer diagnostic publish guard was removed with its routes.
     *
     * showcase-racing-game-layer-proof and showcase-platformer-game-layer-proof were
     * deleted as discontinued examples, so a guard asserting they are not published had
     * nothing left to guard. The release-ready assertion above still proves the build
     * publishes the routes it must.
     */
    expect(buildScript).not.toContain("showcase-racing-game-layer-proof");
    expect(buildScript).not.toContain("showcase-platformer-game-layer-proof");
  });

});
