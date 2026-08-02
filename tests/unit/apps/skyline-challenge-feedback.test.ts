import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Regression coverage for defect 42.
 *
 * FS-103 requires the flow/challenge system's state to be "visible through the game
 * presentation rather than only more HUD text". It was not: `challengeEvidence.flow` and
 * `.collectionChain` reached the player exclusively through `textContent` writes on HUD
 * elements, and the route declared only two runtime nodes (world and player), so no
 * rendered element responded to challenge state at all.
 *
 * These checks read the route source so the feedback cannot regress to DOM-only without
 * failing here.
 */
describe("Skyline challenge state is rendered, not only written to the HUD", () => {
  const source = readFileSync("apps/showcase-skyline-runner/src/main.ts", "utf8");

  it("declares renderer-owned feedback nodes for flow, chain and objective", () => {
    for (const nodeId of ["skyline-flow-ribbon", "skyline-chain-pips", "skyline-objective-pulse"]) {
      expect(source, `${nodeId} should be a runtime node`).toContain(`game.runtimeNode("${nodeId}"`);
      expect(source, `${nodeId} should be required as a handle`).toContain(`app.nodes.require("${nodeId}")`);
    }
  });

  it("drives those nodes from challenge evidence every frame", () => {
    // The feedback must be recomputed after the challenge steps, not set once at build time.
    const stepIndex = source.indexOf("challengeEvidence = runnerChallenge.step(");
    const renderIndex = source.indexOf("renderChallengeFeedback();", stepIndex);
    expect(stepIndex, "challenge step should exist").toBeGreaterThan(-1);
    expect(renderIndex, "feedback should render after the challenge step").toBeGreaterThan(stepIndex);
    expect(source).toContain("challengeEvidence.flow");
    expect(source).toContain("challengeEvidence.collectionChain");
    expect(source).toContain("challengeEvidence.objectiveMet");
  });

  it("publishes an observed-only feedback proof that starts false", () => {
    expect(source).toContain("const observedFeedbackProof = { flowRibbon: false, chainPips: false, objectivePulse: false }");
    // Each flag may only be raised where the node is actually made visible.
    for (const flag of ["flowRibbon", "chainPips", "objectivePulse"]) {
      expect(source).toContain(`observedFeedbackProof.${flag} = true`);
    }
    expect(source).toContain("challengeFeedback: observedFeedbackProof");
  });

  it("sizes every feedback node from hero height rather than absolute guesses", () => {
    // Absolute sizes are how the first attempt produced a hero-sized white panel and a
    // trail 1.5x hero height that crossed the platforms.
    expect(source).toContain("const heroHeight = platformerScene.evidence.playerTargetHeight");
    const block = source.slice(
      source.indexOf("function renderChallengeFeedback"),
      source.indexOf("function renderChallengeFeedback") + 2600
    );
    const setScales = [...block.matchAll(/setScale\(\[([^\]]+)\]\)/g)].map((m) => m[1] ?? "");
    const sized = setScales.filter((args) => args.includes("heroHeight"));
    expect(sized.length, "feedback scales should be expressed in hero-height units").toBeGreaterThanOrEqual(3);
    // No feedback element may approach hero height in two dimensions at once.
    expect(block).not.toContain("setScale([0.46, 0.46,");
  });

  it("offsets feedback upward from the grounded origin", () => {
    // `toScenePlayer` returns the hero's feet, so subtracting from `py` puts feedback
    // below the level -- that is how the ribbon ended up floating in the water.
    const block = source.slice(
      source.indexOf("function renderChallengeFeedback"),
      source.indexOf("function renderChallengeFeedback") + 2600
    );
    expect(block).toContain("grounded origin");
    expect(block).not.toMatch(/setPosition\([^)]*py - 0\.2/);
    expect(block).not.toMatch(/setPosition\([^)]*py - 0\.235/);
  });
});
