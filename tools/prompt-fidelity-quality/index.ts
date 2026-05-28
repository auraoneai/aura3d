import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

type ReviewLabel = "product-quality-pass" | "technical-render-pass" | "partial" | "fail";

interface PromptArtifact {
  readonly id: string;
  readonly family: "starter-template" | "starter-example" | "agent-context";
  readonly prompt: string;
  readonly screenshot: string;
  readonly report: string;
  readonly expectedCriteria: readonly string[];
  readonly reviewLabel: ReviewLabel;
  readonly productQualityPass: boolean;
  readonly objectPlusSymbolicEffectRisk: boolean;
  readonly limitations: readonly string[];
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

const reportPath = "tests/reports/prompt-fidelity-quality.json";
const markdownPath = "docs/project/prompt-fidelity-quality-results.md";
const contactSheetPath = "tests/reports/prompt-fidelity/contact-sheet.png";
const requiredReleaseFacingProductPasses = 3;

const artifacts: PromptArtifact[] = [
  {
    id: "starter-product-viewer",
    family: "starter-template",
    prompt: "Product viewer starter with a product centered in a studio setup.",
    screenshot: "tests/reports/package-clean-install-workspace/templates/product-viewer/demo/tests/reports/screenshot.png",
    report: "tests/reports/package-clean-install.json",
    expectedCriteria: ["hero product visible", "studio lighting", "product-viewer controls", "diagnostics"],
    reviewLabel: "technical-render-pass",
    productQualityPass: false,
    objectPlusSymbolicEffectRisk: true,
    limitations: [
      "Starter shows a valid GLB product and studio cues, but not a polished product hero.",
      "Composition is useful as scaffold proof, not marketing-grade prompt output."
    ],
    nextAction: "Replace starter composition with product-hero recipe using auto-framing, real reflection cards, contact shadows, and stronger material presentation."
  },
  {
    id: "starter-cinematic-scene",
    family: "starter-template",
    prompt: "Cinematic rainy hero scene with wet floor, practical lights, and camera dolly.",
    screenshot: "tests/reports/package-clean-install-workspace/templates/cinematic-scene/demo/tests/reports/screenshot.png",
    report: "tests/reports/package-clean-install.json",
    expectedCriteria: ["hero asset visible", "rain", "wet floor", "colored practicals", "environment depth"],
    reviewLabel: "technical-render-pass",
    productQualityPass: false,
    objectPlusSymbolicEffectRisk: true,
    limitations: [
      "The scene has rain and lighting cues, but rain can still read as lines.",
      "The composition still depends on one imported asset plus symbolic effects."
    ],
    nextAction: "Build a cinematic recipe with volumetric rain layers, fog, spatial depth, believable reflections, and art-directed camera blocking."
  },
  {
    id: "starter-mini-game",
    family: "starter-template",
    prompt: "Mini-game arena with player, collectibles, hazards, goal, and readable game state.",
    screenshot: "tests/reports/package-clean-install-workspace/templates/mini-game/demo/tests/reports/screenshot.png",
    report: "tests/reports/package-clean-install.json",
    expectedCriteria: ["player visible", "arena visible", "collectibles", "hazards", "goal", "game state"],
    reviewLabel: "technical-render-pass",
    productQualityPass: false,
    objectPlusSymbolicEffectRisk: true,
    limitations: [
      "The arena is distinct and functional, but still reads as simple props around a robot.",
      "HUD, state, animation feedback, and play affordances are not strong enough for product-quality proof."
    ],
    nextAction: "Build a game-arena recipe with HUD, clear state, animated feedback, readable pathing, and interaction proof."
  },
  {
    id: "example-typed-asset",
    family: "starter-example",
    prompt: "Typed asset example route.",
    screenshot: "tests/reports/agent-examples/screenshots/hello-world-typed-asset.png",
    report: "tests/reports/agent-examples-playwright.json",
    expectedCriteria: ["typed GLB asset visible", "lighting cues", "diagnostics"],
    reviewLabel: "technical-render-pass",
    productQualityPass: false,
    objectPlusSymbolicEffectRisk: true,
    limitations: ["API smoke example, not a release-facing visual demo."],
    nextAction: "Keep as API evidence or replace with an art-directed typed-asset example."
  },
  {
    id: "example-material-lighting",
    family: "starter-example",
    prompt: "Material and lighting comparison route.",
    screenshot: "tests/reports/agent-examples/screenshots/material-lighting.png",
    report: "tests/reports/agent-examples-playwright.json",
    expectedCriteria: ["multiple material swatches", "lighting contrast", "diagnostics"],
    reviewLabel: "technical-render-pass",
    productQualityPass: false,
    objectPlusSymbolicEffectRisk: false,
    limitations: ["Useful material cue proof, but not a prompt-generated polished scene."],
    nextAction: "Move toward a material-studio recipe with environment reflections, labels, and texture previews."
  },
  {
    id: "example-camera-path",
    family: "starter-example",
    prompt: "Camera path route with start and finish state.",
    screenshot: "tests/reports/agent-examples/screenshots/camera-path.png",
    report: "tests/reports/agent-examples-playwright.json",
    expectedCriteria: ["camera path", "start marker", "finish marker", "visual route"],
    reviewLabel: "technical-render-pass",
    productQualityPass: false,
    objectPlusSymbolicEffectRisk: true,
    limitations: ["Compact route proof, not a cinematic camera-path demo."],
    nextAction: "Use camera rig presets with visible path staging, keyframes, and before/after framing evidence."
  },
  {
    id: "codex-context-self-test",
    family: "agent-context",
    prompt: "Fresh agent context app with product asset, rain, wet floor, dolly, and diagnostics.",
    screenshot: "tests/reports/agent-context/codex-self-test-workspace/tests/reports/screenshot.png",
    report: "tests/reports/agent-context/codex-self-test.json",
    expectedCriteria: ["typed asset", "rain cue", "wet floor cue", "camera dolly", "diagnostics"],
    reviewLabel: "partial",
    productQualityPass: false,
    objectPlusSymbolicEffectRisk: true,
    limitations: [
      "The app compiles, runs, and uses typed assets.",
      "Visual output still reads as object plus symbolic effects, so it is not product-quality prompt evidence."
    ],
    nextAction: "Rerun after visual recipes and prompt-fidelity repair guidance exist."
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

const releaseFacingArtifacts = artifacts.filter((artifact) => artifact.family === "starter-template" || artifact.family === "agent-context");
const releaseFacingProductQualityPasses = releaseFacingArtifacts.filter((artifact) => artifact.productQualityPass).length;
const missingScreenshots = artifacts.filter((artifact) => !existsSync(resolve(artifact.screenshot)));
const missingReports = artifacts.filter((artifact) => !existsSync(resolve(artifact.report)));
const overclaimedArtifacts = artifacts.filter((artifact) => artifact.productQualityPass && artifact.reviewLabel !== "product-quality-pass");
const labelGaps = artifacts.filter((artifact) => !artifact.reviewLabel || artifact.expectedCriteria.length === 0 || artifact.limitations.length === 0);
const rejectedNegativeFixtures = negativeFixtures.filter((fixture) => fixture.rejected).length;
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
    id: "prompt-fidelity-review-labels-complete",
    pass: labelGaps.length === 0,
    detail: labelGaps.length === 0 ? `${artifacts.length} artifacts have prompt, criteria, review label, limitations, and next action` : `label gaps: ${labelGaps.map((artifact) => artifact.id).join(", ")}`
  },
  {
    id: "prompt-fidelity-negative-fixtures-rejected",
    pass: rejectedNegativeFixtures === negativeFixtures.length,
    detail: `${rejectedNegativeFixtures}/${negativeFixtures.length} negative fixtures rejected`
  },
  {
    id: "prompt-fidelity-no-product-quality-overclaim",
    pass: overclaimedArtifacts.length === 0 && releaseFacingProductQualityPasses < requiredReleaseFacingProductPasses,
    detail: `${releaseFacingProductQualityPasses}/${requiredReleaseFacingProductPasses} release-facing artifacts are product-quality-pass; current state remains below marketing threshold`
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
  negativeFixtures
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
    "| Artifact | Family | Review Label | Product-Quality Pass | Main Limitation | Next Action |",
    "|---|---|---:|---:|---|---|",
    ...artifacts.map((artifact) => `| \`${artifact.id}\` | \`${artifact.family}\` | \`${artifact.reviewLabel}\` | ${artifact.productQualityPass ? "yes" : "no"} | ${escapeTable(artifact.limitations[0] ?? "")} | ${escapeTable(artifact.nextAction)} |`),
    "",
    "## Negative Fixtures",
    "",
    "| Fixture | Expected | Actual | Rejected | Reason |",
    "|---|---:|---:|---:|---|",
    ...negativeFixtures.map((fixture) => `| \`${fixture.id}\` | \`${fixture.expectedLabel}\` | \`${fixture.actualLabel}\` | ${fixture.rejected ? "yes" : "no"} | ${escapeTable(fixture.reason)} |`),
    "",
    "## Current Verdict",
    "",
    "The prompt-fidelity audit is working as a guardrail, but the product-quality bar is not met. Current release-facing screenshots remain technical render evidence until at least three prompt outputs pass the product-quality review label."
  ];
  mkdirSync(dirname(resolve(markdownPath)), { recursive: true });
  writeFileSync(resolve(markdownPath), `${lines.join("\n")}\n`);
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
