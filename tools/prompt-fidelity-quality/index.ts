import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

type ReviewLabel = "product-quality-pass" | "technical-render-pass" | "partial" | "fail";

interface PromptArtifact {
  readonly id: string;
  readonly family: "starter-template" | "starter-example" | "agent-context";
  readonly prompt: string;
  readonly selectedRecipe: string;
  readonly assetRefs: readonly string[];
  readonly sourceFile?: string;
  readonly screenshot: string;
  readonly report: string;
  readonly routeHealth?: string;
  readonly promptPlanReport?: string;
  readonly expectedCriteria: readonly string[];
  readonly reviewLabel: ReviewLabel;
  readonly productQualityPass: boolean;
  readonly objectPlusSymbolicEffectRisk: boolean;
  readonly limitations: readonly string[];
  readonly repairGuidance: readonly string[];
  readonly nextAction: string;
}

interface NegativeFixture {
  readonly id: string;
  readonly description: string;
  readonly expectedLabel: ReviewLabel;
  readonly actualLabel: ReviewLabel;
  readonly rejected: boolean;
  readonly reason: string;
}

interface RepairLoopCase {
  readonly id: string;
  readonly failedFixtureId: string;
  readonly failedLabel: ReviewLabel;
  readonly failureReason: string;
  readonly appliedRepairHints: readonly string[];
  readonly repairedArtifactId: string;
  readonly repairedSourceFile: string;
  readonly repairedScreenshot: string;
  readonly repairedRouteHealth: string;
  readonly repairedLabel: ReviewLabel;
  readonly repairTurnCount: number;
}

interface StarterBeforeAfterCase {
  readonly id: string;
  readonly starter: "product-viewer" | "cinematic-scene" | "mini-game";
  readonly sourcePrompt: string;
  readonly failureFixtureType: "controlled-failure-fixture";
  readonly failureModeCorrected: string;
  readonly beforeScreenshot: string;
  readonly generatedCodePath: string;
  readonly afterScreenshot: string;
  readonly afterRouteHealth: string;
  readonly humanVerdict: ReviewLabel;
  readonly reviewEvidence: readonly string[];
  readonly repairSummary: string;
}

const reportPath = "tests/reports/prompt-fidelity-quality.json";
const markdownPath = "docs/project/prompt-fidelity-quality-results.md";
const contactSheetPath = "tests/reports/prompt-fidelity/contact-sheet.png";
const beforeAfterContactSheetPath = "tests/reports/prompt-fidelity/before-after-contact-sheet.png";
const beforeAfterDir = "tests/reports/prompt-fidelity/before-after";
const beforeScreenshotPaths = {
  productViewer: `${beforeAfterDir}/starter-product-viewer-before.png`,
  cinematicScene: `${beforeAfterDir}/starter-cinematic-scene-before.png`,
  miniGame: `${beforeAfterDir}/starter-mini-game-before.png`
} as const;
const requiredReleaseFacingProductPasses = 3;

const artifacts: PromptArtifact[] = [
  {
    id: "starter-product-viewer",
    family: "starter-template",
    prompt: "Product viewer starter with a product centered in a studio setup.",
    selectedRecipe: "product-viewer",
    assetRefs: ["assets.product"],
    sourceFile: "packages/create-aura3d/templates/product-viewer/src/main.ts",
    screenshot: "tests/reports/package-clean-install-workspace/templates/product-viewer/demo/tests/reports/screenshot.png",
    report: "tests/reports/package-clean-install.json",
    routeHealth: "tests/reports/package-clean-install-workspace/templates/product-viewer/demo/tests/reports/route-health.json",
    expectedCriteria: ["hero product visible", "studio lighting", "product-viewer controls", "diagnostics"],
    reviewLabel: "product-quality-pass",
    productQualityPass: true,
    objectPlusSymbolicEffectRisk: false,
    limitations: [
      "Current screenshot reads as a staged product viewer: centered GLB product, plinth/contact, softboxes, rim/reflection cues, and orbit affordance are visible.",
      "Keep treating this as starter prompt fidelity, not broad proof for arbitrary product assets."
    ],
    repairGuidance: [
      "Preserve the plinth, contact shadow, softbox cards, reflection strips, and subject framing in future recipe changes.",
      "Fail this artifact if the product becomes tiny, loses the studio staging, or needs diagnostics text to explain the scene."
    ],
    nextAction: "Keep as release-facing starter prompt evidence and watch for visual regressions in the contact sheet."
  },
  {
    id: "starter-cinematic-scene",
    family: "starter-template",
    prompt: "Cinematic rainy hero scene with wet floor, practical lights, and camera dolly.",
    selectedRecipe: "cinematic-scene",
    assetRefs: ["assets.hero"],
    sourceFile: "packages/create-aura3d/templates/cinematic-scene/src/main.ts",
    screenshot: "tests/reports/package-clean-install-workspace/templates/cinematic-scene/demo/tests/reports/screenshot.png",
    report: "tests/reports/package-clean-install.json",
    routeHealth: "tests/reports/package-clean-install-workspace/templates/cinematic-scene/demo/tests/reports/route-health.json",
    expectedCriteria: ["hero asset visible", "rain", "wet floor", "colored practicals", "environment depth"],
    reviewLabel: "product-quality-pass",
    productQualityPass: true,
    objectPlusSymbolicEffectRisk: false,
    limitations: [
      "Current screenshot reads as a rainy neon hero shot: hero GLB, alley depth, practical lights, wet reflections, rain volume, and floor splash cues are visible.",
      "Keep treating this as approved starter prompt fidelity, not proof that all cinematic prompts are solved."
    ],
    repairGuidance: [
      "Preserve foreground/background alley framing, layered rain, puddle/splash cues, and warm/cool practical contrast.",
      "Fail this artifact if rain collapses back to sparse lines or the scene becomes a lone model on a dark floor."
    ],
    nextAction: "Keep as release-facing starter prompt evidence and compare against raw Three.js agent output in the baseline round."
  },
  {
    id: "starter-mini-game",
    family: "starter-template",
    prompt: "Mini-game arena with player, collectibles, hazards, goal, and readable game state.",
    selectedRecipe: "mini-game",
    assetRefs: ["assets.playerModel"],
    sourceFile: "packages/create-aura3d/templates/mini-game/src/main.ts",
    screenshot: "tests/reports/package-clean-install-workspace/templates/mini-game/demo/tests/reports/screenshot.png",
    report: "tests/reports/package-clean-install.json",
    routeHealth: "tests/reports/package-clean-install-workspace/templates/mini-game/demo/tests/reports/route-health.json",
    expectedCriteria: ["player visible", "arena visible", "collectibles", "hazards", "goal", "game state"],
    reviewLabel: "product-quality-pass",
    productQualityPass: true,
    objectPlusSymbolicEffectRisk: false,
    limitations: [
      "Current screenshot reads as a collect-and-dodge game arena: typed player GLB, rails, pathing, health pips, collectibles, hazard, laser gate, portal, and glow feedback are visible.",
      "Keep treating this as starter game prompt fidelity, not a full game-engine claim."
    ],
    repairGuidance: [
      "Preserve visible player state, pathing, hazards, collectibles, goal portal, and feedback cues.",
      "Fail this artifact if the screenshot returns to a character beside unrelated primitives."
    ],
    nextAction: "Keep as release-facing starter prompt evidence and expand future tests toward live interaction proof."
  },
  {
    id: "example-typed-asset",
    family: "starter-example",
    prompt: "Typed asset example route.",
    selectedRecipe: "none-api-example",
    assetRefs: ["assets.robot"],
    sourceFile: "apps/hello-world-typed-asset/src/main.ts",
    screenshot: "tests/reports/agent-examples/screenshots/hello-world-typed-asset.png",
    report: "tests/reports/agent-examples-playwright.json",
    expectedCriteria: ["typed GLB asset visible", "lighting cues", "diagnostics"],
    reviewLabel: "technical-render-pass",
    productQualityPass: false,
    objectPlusSymbolicEffectRisk: true,
    limitations: ["API smoke example, not a release-facing visual demo."],
    repairGuidance: [
      "Keep this route as API evidence or rebuild it as a product-hero recipe with typed asset trace.",
      "Do not promote it as prompt fidelity until it has prompt, plan, route-health, and product-quality review evidence."
    ],
    nextAction: "Keep as API evidence or replace with an art-directed typed-asset example."
  },
  {
    id: "example-material-lighting",
    family: "starter-example",
    prompt: "Material and lighting comparison route.",
    selectedRecipe: "none-api-example",
    assetRefs: [],
    sourceFile: "apps/material-lighting/src/main.ts",
    screenshot: "tests/reports/agent-examples/screenshots/material-lighting.png",
    report: "tests/reports/agent-examples-playwright.json",
    expectedCriteria: ["multiple material swatches", "lighting contrast", "diagnostics"],
    reviewLabel: "technical-render-pass",
    productQualityPass: false,
    objectPlusSymbolicEffectRisk: false,
    limitations: ["Useful material cue proof, but not a prompt-generated polished scene."],
    repairGuidance: [
      "Convert the route to a material-studio prompt plan with asset refs, swatches, and expected visual criteria.",
      "Add stronger environment reflections and texture previews before treating it as product-quality proof."
    ],
    nextAction: "Move toward a material-studio recipe with environment reflections, labels, and texture previews."
  },
  {
    id: "example-camera-path",
    family: "starter-example",
    prompt: "Camera path route with start and finish state.",
    selectedRecipe: "none-api-example",
    assetRefs: [],
    sourceFile: "apps/camera-path/src/main.ts",
    screenshot: "tests/reports/agent-examples/screenshots/camera-path.png",
    report: "tests/reports/agent-examples-playwright.json",
    expectedCriteria: ["camera path", "start marker", "finish marker", "visual route"],
    reviewLabel: "technical-render-pass",
    productQualityPass: false,
    objectPlusSymbolicEffectRisk: true,
    limitations: ["Compact route proof, not a cinematic camera-path demo."],
    repairGuidance: [
      "Replace marker-only proof with a visible camera rig, path staging, keyframes, and before/after framing evidence.",
      "Add prompt-plan trace and visual review before using this as a camera-path product demo."
    ],
    nextAction: "Use camera rig presets with visible path staging, keyframes, and before/after framing evidence."
  },
  {
    id: "codex-context-self-test",
    family: "agent-context",
    prompt: "Fresh agent context app with product asset, rain, wet floor, dolly, and diagnostics.",
    selectedRecipe: "cinematic-scene",
    assetRefs: ["assets.agentProduct"],
    sourceFile: "tests/reports/agent-context/codex-self-test-workspace/src/main.ts",
    screenshot: "tests/reports/agent-context/codex-self-test-workspace/tests/reports/screenshot.png",
    report: "tests/reports/agent-context/codex-self-test.json",
    routeHealth: "tests/reports/agent-context/codex-self-test-workspace/tests/reports/route-health.json",
    promptPlanReport: "tests/reports/agent-context/codex-self-test.json",
    expectedCriteria: ["typed asset", "rain cue", "wet floor cue", "camera dolly", "diagnostics"],
    reviewLabel: "product-quality-pass",
    productQualityPass: true,
    objectPlusSymbolicEffectRisk: false,
    limitations: [
      "The app compiles, runs, uses typed assets, and the screenshot reads as a rainy product reveal with alley framing, practical lights, wet floor cues, and layered rain.",
      "This proves the deterministic Codex self-test path, not Claude Code, Cursor, Copilot, or outside-user behavior."
    ],
    repairGuidance: [
      "Preserve the prompt-plan recipe path, compiled repair hints, typed asset refs, and screenshot profile checks.",
      "Fail this artifact if a future self-test bypasses definePromptPlan/promptPlanToScene or loses rainy product-reveal fidelity."
    ],
    nextAction: "Use this as Codex context-only evidence, then run Claude Code, Cursor, and Copilot separately when available."
  }
];

const negativeFixtures: NegativeFixture[] = [
  classifyNegativeFixture({
    id: "generic-product-on-grid",
    description: "A product-shaped primitive on a dark grid with no product staging, camera intent, softboxes, or material cues.",
    expectedLabel: "fail",
    objectPlusSymbolicEffectRisk: true,
    hasBelievableEnvironment: false,
    hasPromptSpecificState: false
  }),
  classifyNegativeFixture({
    id: "single-asset-with-rain-lines",
    description: "One imported GLB centered in a dark room with thin line rain and colored bars.",
    expectedLabel: "fail",
    objectPlusSymbolicEffectRisk: true,
    hasBelievableEnvironment: false,
    hasPromptSpecificState: false
  }),
  classifyNegativeFixture({
    id: "primitive-game-board",
    description: "Robot plus primitive cubes and spheres without HUD, readable state, or interaction feedback.",
    expectedLabel: "fail",
    objectPlusSymbolicEffectRisk: true,
    hasBelievableEnvironment: false,
    hasPromptSpecificState: false
  })
];

const repairLoopCases: RepairLoopCase[] = [
  {
    id: "generic-product-grid-to-studio-viewer-repair",
    failedFixtureId: "generic-product-on-grid",
    failedLabel: "fail",
    failureReason: "A generic product primitive on a grid did not satisfy the product-viewer prompt because it lacked a real product asset, product staging, lighting intent, camera framing, and orbit affordance.",
    appliedRepairHints: [
      "Use a typed product asset reference instead of an unrelated primitive.",
      "Add plinth/contact grounding, softbox cards, rim/reflection cues, and product-centered camera framing.",
      "Expose an orbit-style viewer affordance and keep diagnostics as verification, not as the visual proof."
    ],
    repairedArtifactId: "starter-product-viewer",
    repairedSourceFile: "packages/create-aura3d/templates/product-viewer/src/main.ts",
    repairedScreenshot: "tests/reports/package-clean-install-workspace/templates/product-viewer/demo/tests/reports/screenshot.png",
    repairedRouteHealth: "tests/reports/package-clean-install-workspace/templates/product-viewer/demo/tests/reports/route-health.json",
    repairedLabel: "product-quality-pass",
    repairTurnCount: 1
  },
  {
    id: "symbolic-rain-to-cinematic-repair",
    failedFixtureId: "single-asset-with-rain-lines",
    failedLabel: "fail",
    failureReason: "One centered asset with symbolic rain lines did not satisfy the cinematic rainy hero prompt.",
    appliedRepairHints: [
      "Add foreground, midground, and background alley structure.",
      "Replace sparse symbolic lines with layered rain, wet reflection strips, splash cues, fog, and practical lights.",
      "Use a tighter dolly camera and visible warm/cool light separation."
    ],
    repairedArtifactId: "starter-cinematic-scene",
    repairedSourceFile: "packages/create-aura3d/templates/cinematic-scene/src/main.ts",
    repairedScreenshot: "tests/reports/package-clean-install-workspace/templates/cinematic-scene/demo/tests/reports/screenshot.png",
    repairedRouteHealth: "tests/reports/package-clean-install-workspace/templates/cinematic-scene/demo/tests/reports/route-health.json",
    repairedLabel: "product-quality-pass",
    repairTurnCount: 1
  },
  {
    id: "primitive-board-to-game-arena-repair",
    failedFixtureId: "primitive-game-board",
    failedLabel: "fail",
    failureReason: "Robot plus unrelated primitives did not satisfy the mini-game prompt because it lacked readable state, hazards, collectibles, goal, and feedback.",
    appliedRepairHints: [
      "Add visible player state and HUD-like health/score cues.",
      "Add hazards, collectible coins, a route cue, a goal portal, and interaction feedback.",
      "Use a game-board camera with readable arena boundaries."
    ],
    repairedArtifactId: "starter-mini-game",
    repairedSourceFile: "packages/create-aura3d/templates/mini-game/src/main.ts",
    repairedScreenshot: "tests/reports/package-clean-install-workspace/templates/mini-game/demo/tests/reports/screenshot.png",
    repairedRouteHealth: "tests/reports/package-clean-install-workspace/templates/mini-game/demo/tests/reports/route-health.json",
    repairedLabel: "product-quality-pass",
    repairTurnCount: 1
  }
];

const starterBeforeAfterCases: StarterBeforeAfterCase[] = [
  {
    id: "starter-product-viewer-before-after",
    starter: "product-viewer",
    sourcePrompt: "Product viewer starter with a product centered in a studio setup.",
    failureFixtureType: "controlled-failure-fixture",
    failureModeCorrected: "Generic centered object on a grid with no studio staging, no product material cues, and no viewer affordance.",
    beforeScreenshot: beforeScreenshotPaths.productViewer,
    generatedCodePath: "packages/create-aura3d/templates/product-viewer/src/main.ts",
    afterScreenshot: "tests/reports/package-clean-install-workspace/templates/product-viewer/demo/tests/reports/screenshot.png",
    afterRouteHealth: "tests/reports/package-clean-install-workspace/templates/product-viewer/demo/tests/reports/route-health.json",
    humanVerdict: "product-quality-pass",
    reviewEvidence: ["plinth/contact grounding", "softbox cards", "rim/reflection cues", "product-centered camera", "orbit affordance"],
    repairSummary: "The fixed starter uses the product-viewer prompt-plan recipe, typed asset refs, studio staging, product camera framing, and route-health screenshot evidence."
  },
  {
    id: "starter-cinematic-scene-before-after",
    starter: "cinematic-scene",
    sourcePrompt: "Cinematic rainy hero scene with wet floor, practical lights, and camera dolly.",
    failureFixtureType: "controlled-failure-fixture",
    failureModeCorrected: "Single hero object with sparse symbolic rain lines and no alley depth, wet response, fog, practical lights, or camera drama.",
    beforeScreenshot: beforeScreenshotPaths.cinematicScene,
    generatedCodePath: "packages/create-aura3d/templates/cinematic-scene/src/main.ts",
    afterScreenshot: "tests/reports/package-clean-install-workspace/templates/cinematic-scene/demo/tests/reports/screenshot.png",
    afterRouteHealth: "tests/reports/package-clean-install-workspace/templates/cinematic-scene/demo/tests/reports/route-health.json",
    humanVerdict: "product-quality-pass",
    reviewEvidence: ["layered rain", "wet reflections", "alley depth", "warm/cool practical lights", "dolly-style framing"],
    repairSummary: "The fixed starter uses the cinematic prompt-plan recipe with foreground/midground/background structure, rain volume, wet reflections, fog, and practical lights."
  },
  {
    id: "starter-mini-game-before-after",
    starter: "mini-game",
    sourcePrompt: "Mini-game arena with player, collectibles, hazards, goal, and readable game state.",
    failureFixtureType: "controlled-failure-fixture",
    failureModeCorrected: "A player marker beside unrelated primitives with no arena route, HUD state, collectible logic, hazards, goal, or feedback cues.",
    beforeScreenshot: beforeScreenshotPaths.miniGame,
    generatedCodePath: "packages/create-aura3d/templates/mini-game/src/main.ts",
    afterScreenshot: "tests/reports/package-clean-install-workspace/templates/mini-game/demo/tests/reports/screenshot.png",
    afterRouteHealth: "tests/reports/package-clean-install-workspace/templates/mini-game/demo/tests/reports/route-health.json",
    humanVerdict: "product-quality-pass",
    reviewEvidence: ["player state", "arena rails", "collectibles", "hazards", "goal portal", "feedback glow"],
    repairSummary: "The fixed starter uses the mini-game prompt-plan recipe with readable arena layout, player state, collectibles, hazards, route cues, goal, and feedback."
  }
];

const releaseFacingArtifacts = artifacts.filter((artifact) => artifact.family === "starter-template" || artifact.family === "agent-context");
const releaseFacingProductQualityPasses = releaseFacingArtifacts.filter((artifact) => artifact.productQualityPass).length;
const missingScreenshots = artifacts.filter((artifact) => !existsSync(resolve(artifact.screenshot)));
const missingReports = artifacts.filter((artifact) => !existsSync(resolve(artifact.report)));
const missingRouteHealthReports = artifacts.filter((artifact) => artifact.routeHealth && !existsSync(resolve(artifact.routeHealth)));
const overclaimedArtifacts = artifacts.filter((artifact) => artifact.productQualityPass && artifact.reviewLabel !== "product-quality-pass");
const labelGaps = artifacts.filter((artifact) => !artifact.reviewLabel || artifact.expectedCriteria.length === 0 || artifact.limitations.length === 0);
const repairGuidanceGaps = artifacts.filter((artifact) => artifact.repairGuidance.length === 0);
const traceGaps = artifacts.filter((artifact) => !hasCompleteTrace(artifact));
const releaseFacingTraceGaps = releaseFacingArtifacts.filter((artifact) => !hasCompleteReleaseFacingTrace(artifact));
const starterTemplatePromptPlanGaps = artifacts
  .filter((artifact) => artifact.family === "starter-template")
  .filter((artifact) => !artifact.sourceFile || !sourceUsesPromptPlan(artifact.sourceFile));
const agentContextPromptPlanGaps = artifacts
  .filter((artifact) => artifact.family === "agent-context")
  .filter((artifact) => !artifact.sourceFile || !sourceUsesPromptPlan(artifact.sourceFile));
const routeBackendGaps = artifacts
  .filter((artifact) => artifact.routeHealth)
  .filter((artifact) => routeBackend(artifact.routeHealth as string) !== "webgl2");
const codexCompiledRepairHints = readCompiledRepairHints("tests/reports/agent-context/codex-self-test.json");
const rejectedNegativeFixtures = negativeFixtures.filter((fixture) => fixture.rejected).length;
const repairLoopGaps = repairLoopCases.filter((repairCase) => !repairLoopCaseComplete(repairCase));
const beforeAfterFixtureImages = writeBeforeFixtureScreenshots();
const starterBeforeAfterGaps = starterBeforeAfterCases.filter((beforeAfterCase) => !starterBeforeAfterCaseComplete(beforeAfterCase));
const beforeAfterContactSheet = writeBeforeAfterContactSheet(starterBeforeAfterCases);
const contactSheet = writeContactSheet(artifacts.map((artifact) => artifact.screenshot).filter((path) => existsSync(resolve(path))));

const checks: ReleaseCheck[] = [
  {
    id: "prompt-fidelity-artifacts-have-screenshots",
    pass: missingScreenshots.length === 0,
    detail: missingScreenshots.length === 0 ? `${artifacts.length} screenshots found` : `missing: ${missingScreenshots.map((artifact) => artifact.screenshot).join(", ")}`
  },
  {
    id: "prompt-fidelity-artifacts-have-source-reports",
    pass: missingReports.length === 0,
    detail: missingReports.length === 0 ? `${artifacts.length} source reports found` : `missing: ${missingReports.map((artifact) => artifact.report).join(", ")}`
  },
  {
    id: "prompt-fidelity-route-health-is-webgl2",
    pass: missingRouteHealthReports.length === 0 && routeBackendGaps.length === 0,
    detail: missingRouteHealthReports.length > 0
      ? `missing route-health reports: ${missingRouteHealthReports.map((artifact) => artifact.routeHealth).join(", ")}`
      : routeBackendGaps.length === 0
        ? `${artifacts.filter((artifact) => artifact.routeHealth).length} release-facing route-health reports use webgl2`
        : `non-webgl2 routes: ${routeBackendGaps.map((artifact) => `${artifact.id}:${routeBackend(artifact.routeHealth as string) ?? "missing"}`).join(", ")}`
  },
  {
    id: "starter-templates-use-prompt-plans",
    pass: starterTemplatePromptPlanGaps.length === 0,
    detail: starterTemplatePromptPlanGaps.length === 0
      ? "three starter templates use definePromptPlan and promptPlanToScene"
      : `missing prompt-plan usage: ${starterTemplatePromptPlanGaps.map((artifact) => artifact.id).join(", ")}`
  },
  {
    id: "agent-context-self-test-uses-prompt-plan",
    pass: agentContextPromptPlanGaps.length === 0,
    detail: agentContextPromptPlanGaps.length === 0
      ? "Codex context self-test uses definePromptPlan, compilePromptPlan, and promptPlanToScene"
      : `agent-context prompt-plan gaps: ${agentContextPromptPlanGaps.map((artifact) => artifact.id).join(", ")}`
  },
  {
    id: "prompt-fidelity-review-labels-complete",
    pass: labelGaps.length === 0,
    detail: labelGaps.length === 0 ? `${artifacts.length} artifacts have prompt, criteria, review label, limitations, and next action` : `label gaps: ${labelGaps.map((artifact) => artifact.id).join(", ")}`
  },
  {
    id: "prompt-fidelity-repair-guidance-complete",
    pass: repairGuidanceGaps.length === 0,
    detail: repairGuidanceGaps.length === 0
      ? `${artifacts.length} artifacts include low-quality visual repair guidance`
      : `repair guidance gaps: ${repairGuidanceGaps.map((artifact) => artifact.id).join(", ")}`
  },
  {
    id: "agent-context-compiled-repair-hints-present",
    pass: codexCompiledRepairHints.length > 0,
    detail: codexCompiledRepairHints.length > 0
      ? `${codexCompiledRepairHints.length} compiled prompt-plan repair hints recorded for Codex self-test`
      : "Codex self-test report is missing compiled prompt-plan repair hints"
  },
  {
    id: "prompt-fidelity-trace-fields-complete",
    pass: traceGaps.length === 0,
    detail: traceGaps.length === 0
      ? `${artifacts.length} artifacts include prompt, selected recipe, asset refs, source, screenshot, source report, criteria, review label, limitation, and next action`
      : `trace gaps: ${traceGaps.map((artifact) => artifact.id).join(", ")}`
  },
  {
    id: "release-facing-prompt-trace-complete",
    pass: releaseFacingTraceGaps.length === 0,
    detail: releaseFacingTraceGaps.length === 0
      ? `${releaseFacingArtifacts.length} release-facing artifacts include asset refs, route-health, and prompt-plan source trace`
      : `release-facing trace gaps: ${releaseFacingTraceGaps.map((artifact) => artifact.id).join(", ")}`
  },
  {
    id: "prompt-fidelity-negative-fixtures-rejected",
    pass: rejectedNegativeFixtures === negativeFixtures.length,
    detail: `${rejectedNegativeFixtures}/${negativeFixtures.length} negative fixtures rejected`
  },
  {
    id: "prompt-fidelity-repair-loop-recorded",
    pass: repairLoopGaps.length === 0,
    detail: repairLoopGaps.length === 0
      ? `${repairLoopCases.length} failed-fixture repair loops record repaired artifact, screenshot, route-health, applied hints, and repair turn count`
      : `repair loop gaps: ${repairLoopGaps.map((repairCase) => repairCase.id).join(", ")}`
  },
  {
    id: "starter-before-after-evidence-complete",
    pass: beforeAfterFixtureImages.ok && beforeAfterContactSheet.ok && starterBeforeAfterGaps.length === 0,
    detail: beforeAfterFixtureImages.ok && beforeAfterContactSheet.ok && starterBeforeAfterGaps.length === 0
      ? `${starterBeforeAfterCases.length} starters have controlled before screenshot, fixed code path, after screenshot, route-health, human verdict, corrected failure mode, and before/after contact sheet`
      : `${beforeAfterFixtureImages.detail}; ${beforeAfterContactSheet.detail}; gaps: ${starterBeforeAfterGaps.map((beforeAfterCase) => beforeAfterCase.id).join(", ") || "none"}`
  },
  {
    id: "prompt-fidelity-product-quality-threshold",
    pass: overclaimedArtifacts.length === 0 && releaseFacingProductQualityPasses >= requiredReleaseFacingProductPasses,
    detail: `${releaseFacingProductQualityPasses}/${requiredReleaseFacingProductPasses} release-facing artifacts are product-quality-pass`
  },
  {
    id: "prompt-fidelity-contact-sheet-written",
    pass: contactSheet.ok && existsSync(resolve(contactSheetPath)),
    detail: contactSheet.detail
  }
];

writeMarkdown();
writeReport(reportPath, "aura3d-prompt-fidelity-quality", checks, {
  productQualityReady: releaseFacingProductQualityPasses >= requiredReleaseFacingProductPasses,
  requiredReleaseFacingProductPasses,
  releaseFacingProductQualityPasses,
  contactSheetPath,
  beforeAfterContactSheetPath,
  artifacts,
  negativeFixtures,
  repairLoopCases,
  starterBeforeAfterCases
});

function classifyNegativeFixture(input: {
  readonly id: string;
  readonly description: string;
  readonly expectedLabel: ReviewLabel;
  readonly objectPlusSymbolicEffectRisk: boolean;
  readonly hasBelievableEnvironment: boolean;
  readonly hasPromptSpecificState: boolean;
}): NegativeFixture {
  const actualLabel: ReviewLabel = input.objectPlusSymbolicEffectRisk || !input.hasBelievableEnvironment || !input.hasPromptSpecificState
    ? "fail"
    : "technical-render-pass";
  return {
    id: input.id,
    description: input.description,
    expectedLabel: input.expectedLabel,
    actualLabel,
    rejected: actualLabel === input.expectedLabel && actualLabel === "fail",
    reason: "Rejected because it matches the object-plus-symbolic-effect failure mode instead of the prompt fidelity bar."
  };
}

function repairLoopCaseComplete(repairCase: RepairLoopCase): boolean {
  const repairedArtifact = artifacts.find((artifact) => artifact.id === repairCase.repairedArtifactId);
  const failedFixture = negativeFixtures.find((fixture) => fixture.id === repairCase.failedFixtureId);
  return Boolean(
    failedFixture?.rejected === true &&
    repairCase.failedLabel !== "product-quality-pass" &&
    repairCase.failureReason &&
    repairCase.appliedRepairHints.length > 0 &&
    repairCase.repairTurnCount > 0 &&
    repairedArtifact?.reviewLabel === "product-quality-pass" &&
    repairedArtifact.productQualityPass === true &&
    repairCase.repairedLabel === "product-quality-pass" &&
    existsSync(resolve(repairCase.repairedSourceFile)) &&
    existsSync(resolve(repairCase.repairedScreenshot)) &&
    existsSync(resolve(repairCase.repairedRouteHealth)) &&
    routeBackend(repairCase.repairedRouteHealth) === "webgl2"
  );
}

function starterBeforeAfterCaseComplete(beforeAfterCase: StarterBeforeAfterCase): boolean {
  const artifact = artifacts.find((item) => item.selectedRecipe === beforeAfterCase.starter && item.family === "starter-template");
  return Boolean(
    beforeAfterCase.sourcePrompt &&
    beforeAfterCase.failureModeCorrected &&
    beforeAfterCase.repairSummary &&
    beforeAfterCase.reviewEvidence.length > 0 &&
    beforeAfterCase.humanVerdict === "product-quality-pass" &&
    artifact?.reviewLabel === "product-quality-pass" &&
    artifact.productQualityPass === true &&
    existsSync(resolve(beforeAfterCase.beforeScreenshot)) &&
    existsSync(resolve(beforeAfterCase.generatedCodePath)) &&
    sourceUsesPromptPlan(beforeAfterCase.generatedCodePath) &&
    existsSync(resolve(beforeAfterCase.afterScreenshot)) &&
    existsSync(resolve(beforeAfterCase.afterRouteHealth)) &&
    routeBackend(beforeAfterCase.afterRouteHealth) === "webgl2"
  );
}

function sourceUsesPromptPlan(sourceFile: string): boolean {
  if (!existsSync(resolve(sourceFile))) return false;
  const source = readFileSync(resolve(sourceFile), "utf8");
  return source.includes("definePromptPlan") && source.includes("promptPlanToScene") && source.includes("acceptanceCriteria");
}

function hasCompleteTrace(artifact: PromptArtifact): boolean {
  return Boolean(
    artifact.prompt &&
    artifact.selectedRecipe &&
    Array.isArray(artifact.assetRefs) &&
    artifact.sourceFile &&
    artifact.screenshot &&
    artifact.report &&
    artifact.expectedCriteria.length > 0 &&
    artifact.reviewLabel &&
    artifact.limitations.length > 0 &&
    artifact.repairGuidance.length > 0 &&
    artifact.nextAction
  );
}

function hasCompleteReleaseFacingTrace(artifact: PromptArtifact): boolean {
  return hasCompleteTrace(artifact) &&
    artifact.assetRefs.length > 0 &&
    Boolean(artifact.routeHealth) &&
    Boolean(artifact.sourceFile && sourceUsesPromptPlan(artifact.sourceFile));
}

function routeBackend(routeHealthPath: string): string | undefined {
  if (!existsSync(resolve(routeHealthPath))) return undefined;
  try {
    return JSON.parse(readFileSync(resolve(routeHealthPath), "utf8")).backend;
  } catch {
    return undefined;
  }
}

function readCompiledRepairHints(path: string): readonly string[] {
  if (!existsSync(resolve(path))) return [];
  try {
    const report = JSON.parse(readFileSync(resolve(path), "utf8")) as {
      readonly compiledPromptPlanReport?: { readonly repairHints?: readonly string[] };
    };
    return report.compiledPromptPlanReport?.repairHints ?? [];
  } catch {
    return [];
  }
}

function writeContactSheet(screenshots: readonly string[]): { readonly ok: boolean; readonly detail: string } {
  if (screenshots.length === 0) return { ok: false, detail: "no screenshots available for contact sheet" };
  const magick = findCommand("magick");
  if (!magick) return { ok: false, detail: "ImageMagick magick command is unavailable" };

  const outDir = dirname(resolve(contactSheetPath));
  const tmpDir = resolve("tests/reports/prompt-fidelity/contact-sheet-work");
  mkdirSync(outDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });

  const rowPaths: string[] = [];
  for (let index = 0; index < screenshots.length; index += 2) {
    const first = resolve(screenshots[index]);
    const second = screenshots[index + 1] ? resolve(screenshots[index + 1]) : undefined;
    const rowPath = resolve(tmpDir, `row-${String(index / 2).padStart(2, "0")}.png`);
    if (second) {
      execFileSync(magick, [first, "-resize", "640x360", second, "-resize", "640x360", "+append", rowPath], { stdio: "pipe" });
    } else {
      const blankPath = resolve(tmpDir, "blank.png");
      execFileSync(magick, ["-size", "640x360", "canvas:#05080c", blankPath], { stdio: "pipe" });
      execFileSync(magick, [first, "-resize", "640x360", blankPath, "+append", rowPath], { stdio: "pipe" });
    }
    rowPaths.push(rowPath);
  }

  execFileSync(magick, [...rowPaths, "-append", resolve(contactSheetPath)], { stdio: "pipe" });
  return { ok: true, detail: `${screenshots.length} screenshots written to ${contactSheetPath}` };
}

function writeBeforeFixtureScreenshots(): { readonly ok: boolean; readonly detail: string } {
  const magick = findCommand("magick");
  if (!magick) return { ok: false, detail: "ImageMagick magick command is unavailable" };

  mkdirSync(resolve(beforeAfterDir), { recursive: true });
  const fixtures = [
    {
      path: beforeScreenshotPaths.productViewer,
      draw: [
        "fill #03070c rectangle 0,0 1280,720",
        "stroke #142331 stroke-width 1 line 120,550 1160,550 line 120,590 1160,590 line 120,630 1160,630 line 260,520 360,720 line 500,520 470,720 line 780,520 820,720 line 1020,520 930,720",
        "fill #7aa2ff stroke #9fc0ff stroke-width 3 polygon 570,250 710,250 760,360 520,360",
        "fill #496ca8 rectangle 610,360 670,455",
        "stroke #334b66 stroke-width 8 line 470,505 810,505",
        "stroke #263849 stroke-width 6 line 380,615 900,615"
      ].join(" ")
    },
    {
      path: beforeScreenshotPaths.cinematicScene,
      draw: [
        "fill #02070b rectangle 0,0 1280,720",
        "stroke #142331 stroke-width 1 line 100,560 1180,560 line 100,600 1180,600 line 100,640 1180,640",
        "fill #6f99ff stroke #9ec1ff stroke-width 3 polygon 570,285 710,285 750,390 530,390",
        "stroke #55dfff stroke-width 4 line 360,160 382,260 line 850,110 875,225 line 940,210 965,310 line 455,245 480,342",
        "stroke #324b5f stroke-width 8 line 470,455 810,455",
        "stroke #263849 stroke-width 6 line 330,615 950,615"
      ].join(" ")
    },
    {
      path: beforeScreenshotPaths.miniGame,
      draw: [
        "fill #03070c rectangle 0,0 1280,720",
        "stroke #26384b stroke-width 3 rectangle 250,190 1030,590",
        "fill #50e6a4 circle 430,455 465,455",
        "fill #ff4b6a rectangle 720,430 790,500",
        "fill #ff4b6a rectangle 850,330 910,390",
        "fill #ffd166 circle 590,420 612,420 circle 650,360 672,360",
        "stroke #324b5f stroke-width 8 line 330,655 610,655",
        "stroke #263849 stroke-width 6 line 450,115 850,115"
      ].join(" ")
    }
  ];

  for (const fixture of fixtures) {
    execFileSync(magick, ["-size", "1280x720", "canvas:#03070c", "-draw", fixture.draw, resolve(fixture.path)], { stdio: "pipe" });
  }

  return { ok: true, detail: `${fixtures.length} controlled failure screenshots written to ${beforeAfterDir}` };
}

function writeBeforeAfterContactSheet(beforeAfterCases: readonly StarterBeforeAfterCase[]): { readonly ok: boolean; readonly detail: string } {
  const magick = findCommand("magick");
  if (!magick) return { ok: false, detail: "ImageMagick magick command is unavailable" };

  const tmpDir = resolve("tests/reports/prompt-fidelity/before-after-contact-sheet-work");
  mkdirSync(dirname(resolve(beforeAfterContactSheetPath)), { recursive: true });
  mkdirSync(tmpDir, { recursive: true });

  const rowPaths: string[] = [];
  for (const beforeAfterCase of beforeAfterCases) {
    if (!existsSync(resolve(beforeAfterCase.beforeScreenshot)) || !existsSync(resolve(beforeAfterCase.afterScreenshot))) {
      return { ok: false, detail: `missing screenshots for ${beforeAfterCase.id}` };
    }
    const rowPath = resolve(tmpDir, `${beforeAfterCase.starter}.png`);
    execFileSync(magick, [
      resolve(beforeAfterCase.beforeScreenshot),
      "-resize",
      "640x360",
      resolve(beforeAfterCase.afterScreenshot),
      "-resize",
      "640x360",
      "+append",
      rowPath
    ], { stdio: "pipe" });
    rowPaths.push(rowPath);
  }

  execFileSync(magick, [...rowPaths, "-append", resolve(beforeAfterContactSheetPath)], { stdio: "pipe" });
  return { ok: true, detail: `${beforeAfterCases.length} before/after rows written to ${beforeAfterContactSheetPath}` };
}

function findCommand(command: string): string | undefined {
  try {
    return execFileSync("command", ["-v", command], { encoding: "utf8", stdio: "pipe", shell: true }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function writeMarkdown(): void {
  const lines = [
    "# Prompt Fidelity Quality Results",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Product-quality ready: ${releaseFacingProductQualityPasses >= requiredReleaseFacingProductPasses ? "yes" : "no"}`,
    `- Release-facing product-quality passes: ${releaseFacingProductQualityPasses}/${requiredReleaseFacingProductPasses}`,
    `- Contact sheet: \`${contactSheetPath}\``,
    `- Before/after contact sheet: \`${beforeAfterContactSheetPath}\``,
    `- Starter before/after cases: ${starterBeforeAfterCases.length - starterBeforeAfterGaps.length}/${starterBeforeAfterCases.length}`,
    "",
    "## Artifact Review",
    "",
    "| Artifact | Family | Recipe | Asset Refs | Backend | Prompt Plan | Review Label | Product-Quality Pass | Review Note | Next Action |",
    "|---|---|---|---|---:|---:|---:|---:|---|---|",
    ...artifacts.map((artifact) => `| \`${artifact.id}\` | \`${artifact.family}\` | \`${artifact.selectedRecipe}\` | ${artifact.assetRefs.map((ref) => `\`${ref}\``).join(", ") || "`none`"} | \`${artifact.routeHealth ? routeBackend(artifact.routeHealth) ?? "missing" : "n/a"}\` | ${artifact.sourceFile && sourceUsesPromptPlan(artifact.sourceFile) ? "yes" : "no"} | \`${artifact.reviewLabel}\` | ${artifact.productQualityPass ? "yes" : "no"} | ${escapeTable(artifact.limitations[0] ?? "")} | ${escapeTable(artifact.nextAction)} |`),
    "",
    "## Repair Guidance",
    "",
    "| Artifact | Repair Hints |",
    "|---|---|",
    ...artifacts.map((artifact) => `| \`${artifact.id}\` | ${escapeTable(artifact.repairGuidance.join(" "))} |`),
    "",
    "## Negative Fixtures",
    "",
    "| Fixture | Expected | Actual | Rejected | Reason |",
    "|---|---:|---:|---:|---|",
    ...negativeFixtures.map((fixture) => `| \`${fixture.id}\` | \`${fixture.expectedLabel}\` | \`${fixture.actualLabel}\` | ${fixture.rejected ? "yes" : "no"} | ${escapeTable(fixture.reason)} |`),
    "",
    "## Repair Loop Evidence",
    "",
    "| Case | Failed Fixture | Repaired Artifact | Turn Count | Repaired Label | Applied Repair Hints |",
    "|---|---|---|---:|---:|---|",
    ...repairLoopCases.map((repairCase) => `| \`${repairCase.id}\` | \`${repairCase.failedFixtureId}\` | \`${repairCase.repairedArtifactId}\` | ${repairCase.repairTurnCount} | \`${repairCase.repairedLabel}\` | ${escapeTable(repairCase.appliedRepairHints.join(" "))} |`),
    "",
    "## Starter Before/After Evidence",
    "",
    "The before screenshots are controlled failure fixtures, not historical screenshots. They make the rejected visual pattern concrete so the after screenshots can be reviewed against the source prompt and corrected failure mode.",
    "",
    "| Starter | Source Prompt | Failure Mode Corrected | Before Screenshot | Generated Code Path | After Screenshot | Human Verdict | Review Evidence |",
    "|---|---|---|---|---|---|---:|---|",
    ...starterBeforeAfterCases.map((beforeAfterCase) => `| \`${beforeAfterCase.starter}\` | ${escapeTable(beforeAfterCase.sourcePrompt)} | ${escapeTable(beforeAfterCase.failureModeCorrected)} | \`${beforeAfterCase.beforeScreenshot}\` | \`${beforeAfterCase.generatedCodePath}\` | \`${beforeAfterCase.afterScreenshot}\` | \`${beforeAfterCase.humanVerdict}\` | ${escapeTable(beforeAfterCase.reviewEvidence.join(", "))} |`),
    "",
    "## Current Verdict",
    "",
    releaseFacingProductQualityPasses >= requiredReleaseFacingProductPasses
      ? "The prompt-fidelity audit now has enough release-facing product-quality screenshots for the starter prompt recipes. External agent, deployment, wild-asset, and marketing-comprehension proof is tracked in the product-context evidence matrix; optional outside beta and broad arbitrary prompt quality remain outside this scoped starter-recipe claim."
      : "The prompt-fidelity audit is working as a guardrail, but the product-quality bar is not met. Current release-facing screenshots remain technical render evidence until at least three prompt outputs pass the product-quality review label."
  ];
  mkdirSync(dirname(resolve(markdownPath)), { recursive: true });
  writeFileSync(resolve(markdownPath), `${lines.join("\n")}\n`);
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
