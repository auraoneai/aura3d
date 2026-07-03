import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const buildScript = readFileSync("marketing/scripts/build-showcase-routes.mjs", "utf8");
const engineSource = readFileSync("packages/engine/src/agent-api/index.ts", "utf8");
const publicGameRouteSources = [
  readFileSync("apps/showcase-public-racing-presentation-proof/src/main.ts", "utf8"),
  readFileSync("apps/showcase-public-platformer-presentation-proof/src/main.ts", "utf8")
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
});
