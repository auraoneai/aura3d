import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const buildScript = readFileSync("marketing/scripts/build-showcase-routes.mjs", "utf8");
const engineSource = readFileSync("packages/engine/src/agent-api/index.ts", "utf8");
const publicGameRouteSources = [
  readFileSync("apps/showcase-public-racing-presentation-proof/src/main.ts", "utf8"),
  readFileSync("apps/showcase-public-platformer-presentation-proof/src/main.ts", "utf8"),
  readFileSync("apps/showcase-turbo-drift-circuit/src/main.ts", "utf8"),
  readFileSync("apps/showcase-skyline-runner/src/main.ts", "utf8")
].join("\n");

const requiredPublicGameHelpers = [
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
      expect(publicGameRouteSources).toContain(`game.${helper}`);
      expect(engineSource).toContain(`${helper}:`);
    }
  });
  it("publishes current game presentations plus retained historical routes and excludes diagnostic harnesses", () => {
    for (const route of [
      "showcase-public-racing-presentation-proof",
      "showcase-turbo-drift-circuit",
      "showcase-skyline-runner"
    ]) {
      expect(buildScript).toContain(`"${route}"`);
    }
    expect(buildScript).toContain('"showcase-public-platformer-presentation-proof"');
    expect(buildScript).toContain("release-ready game route must be published by marketing build");
    expect(buildScript).toContain("game-layer diagnostic route must not be published by marketing build");
  });

});
