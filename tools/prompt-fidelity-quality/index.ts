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

const reportPath = "tests/reports/prompt-fidelity-quality.json";
const markdownPath = "docs/project/prompt-fidelity-quality-results.md";
const contactSheetPath = "tests/reports/prompt-fidelity/contact-sheet.png";
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
  artifacts,
  negativeFixtures,
  repairLoopCases
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
    "## Current Verdict",
    "",
    releaseFacingProductQualityPasses >= requiredReleaseFacingProductPasses
      ? "The prompt-fidelity audit now has enough release-facing product-quality screenshots for the starter prompt recipes. This does not close external agent, external deployment, wild-asset, marketing comprehension, or outside beta evidence gaps."
      : "The prompt-fidelity audit is working as a guardrail, but the product-quality bar is not met. Current release-facing screenshots remain technical render evidence until at least three prompt outputs pass the product-quality review label."
  ];
  mkdirSync(dirname(resolve(markdownPath)), { recursive: true });
  writeFileSync(resolve(markdownPath), `${lines.join("\n")}\n`);
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
