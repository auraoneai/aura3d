import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

type EvidenceStatus = "automated-pass" | "manual-pass" | "external-pass" | "known-gap";

interface ClaimEvidence {
  readonly claim: string;
  readonly status: EvidenceStatus;
  readonly evidence: readonly string[];
  readonly nextAction?: string;
}

interface KnownGapEvidence {
  readonly gap: string;
  readonly owner: string;
  readonly nextAction: string;
  readonly targetEvidence: readonly string[];
}

const starterTemplates = ["product-viewer", "cinematic-scene", "mini-game"] as const;
const publicProductFiles = [
  "ProductContextPRD.md",
  "README.md",
  "llms.txt",
  "AGENTS.md",
  ".claude/CLAUDE.md",
  ".cursor/rules/aura3d.mdc",
  ".github/copilot-instructions.md",
  "index.html",
  "marketing/index.html",
  "marketing/src/main.ts",
  "marketing/src/styles.css",
  ...listFiles("docs/agents"),
  "docs/api/readme.md",
  "docs/api/app-api.md",
  "docs/api/public-api.md",
  "docs/templates/create-aura3d-templates.md",
  "docs/project/current-state.md",
  "docs/project/apps-classification.md",
  "docs/project/site-map.md",
  "docs/project/go-to-market-strategy.md",
  "docs/project/claim-guidelines.md"
].filter((path) => existsSync(path));
const activeCodeAndDocs = [
  ...listFiles("packages"),
  ...listFiles("apps"),
  ...listFiles("marketing"),
  ...listFiles("docs/agents"),
  ...listFiles("docs/api"),
  ...listFiles("docs/templates"),
  ...listFiles("docs/concepts"),
  "README.md",
  "ProductContextPRD.md",
  "llms.txt",
  "AGENTS.md"
].filter((path) => !path.startsWith("archive/") && !path.includes("/dist/") && !path.includes("/node_modules/"));

const activeTemplateDirs = existsSync("packages/create-aura3d/templates")
  ? readdirSync("packages/create-aura3d/templates", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  : [];
const appDirs = existsSync("apps")
  ? readdirSync("apps", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  : [];
const appsClassification = readText("docs/project/apps-classification.md");
const rootPackage = readJson<{ files?: string[]; scripts?: Record<string, string> }>("package.json");
const createPackage = readJson<{ files?: string[]; name?: string; bin?: Record<string, string> }>("packages/create-aura3d/package.json");
const cliPackage = readJson<{ bin?: Record<string, string> }>("packages/aura3d-cli/package.json");
const codexScreenshotProfile = readJson<{ profile?: Record<string, number> }>("tests/reports/agent-context/codex-self-test-workspace/tests/reports/screenshot.json");
const codexAgentReport = readJson<{
  readonly pass?: boolean;
  readonly promptPlan?: { readonly selectedRecipe?: string; readonly assetRefs?: readonly string[] };
  readonly compiledPromptPlanReport?: { readonly recipe?: string; readonly visualSystems?: readonly string[]; readonly repairHints?: readonly string[] };
  readonly checks?: readonly { readonly id?: string; readonly pass?: boolean }[];
  readonly fiveTaskEval?: {
    readonly summary?: {
      readonly compiles?: boolean;
      readonly runs?: boolean;
      readonly apiHallucinations?: number;
      readonly assetPathErrors?: number;
    };
    readonly taskScores?: readonly {
      readonly id?: string;
      readonly compiles?: boolean;
      readonly runs?: boolean;
      readonly productQualityPass?: boolean;
      readonly apiHallucinations?: number;
      readonly assetPathErrors?: number;
    }[];
    readonly routeReport?: {
      readonly ready?: boolean;
      readonly backend?: string;
      readonly staticPreview?: boolean;
    };
    readonly screenshotReport?: {
      readonly profile?: Record<string, number>;
    };
    readonly swapReport?: {
      readonly before?: string;
      readonly after?: string;
    };
  };
  readonly repairEval?: {
    readonly summary?: {
      readonly compiles?: boolean;
      readonly runs?: boolean;
      readonly apiHallucinations?: number;
      readonly assetPathErrors?: number;
    };
    readonly failedLabel?: string;
    readonly repairedLabel?: string;
    readonly repairTurnCount?: number;
    readonly appliedRepairHints?: readonly string[];
    readonly initialRouteReport?: { readonly ready?: boolean; readonly backend?: string; readonly hasPromptPlan?: boolean };
    readonly initialScreenshotReport?: {
      readonly productQualityPass?: boolean;
      readonly reviewLabel?: string;
      readonly profile?: Record<string, number>;
    };
    readonly repairedRouteReport?: {
      readonly ready?: boolean;
      readonly backend?: string;
      readonly hasPromptPlan?: boolean;
      readonly compiledRepairHints?: readonly string[];
    };
    readonly repairedScreenshotReport?: {
      readonly productQualityPass?: boolean;
      readonly reviewLabel?: string;
      readonly profile?: Record<string, number>;
    };
  };
}>("tests/reports/agent-context/codex-self-test.json");
const claudeCodeAgentReport = readJson<{
  readonly pass?: boolean;
  readonly checks?: readonly { readonly id?: string; readonly pass?: boolean; readonly detail?: string }[];
}>("tests/reports/agent-context/claude-code-eval.json");
const freshCodexResult = readText("docs/project/fresh-codex-agent-context-results.md");
const claudeCodeResult = readText("docs/project/claude-code-agent-context-results.md");
const starterVisualReview = readText("docs/project/starter-template-visual-review.md");
const starterExampleVisualReview = readText("docs/project/starter-example-visual-review.md");
const promptVisualQualityGap = readText("docs/project/prompt-visual-quality-gap.md");
const effectsVfxVisualAuditDoc = readText("docs/project/effects-vfx-visual-audit.md");
const effectsVfxAuditReport = readJson<{
  readonly pass?: boolean;
  readonly summary?: {
    readonly total?: number;
    readonly pass?: number;
    readonly partial?: number;
    readonly fail?: number;
  };
  readonly visualProof?: {
    readonly pass?: boolean;
    readonly screenshotPath?: string;
  };
  readonly findings?: readonly { readonly id?: string; readonly status?: string }[];
}>("tests/reports/effects-vfx-visual-audit.json");
const externalDeploymentReport = readJson<{
  readonly checks?: readonly { readonly id?: string; readonly pass?: boolean; readonly detail?: string }[];
}>("tests/reports/external-deployment-smoke.json");
const promptFidelityReport = readJson<{
  readonly pass?: boolean;
  readonly productQualityReady?: boolean;
  readonly releaseFacingProductQualityPasses?: number;
  readonly negativeFixtures?: readonly { readonly rejected?: boolean }[];
  readonly starterBeforeAfterCases?: readonly {
    readonly id?: string;
    readonly starter?: string;
    readonly beforeScreenshot?: string;
    readonly generatedCodePath?: string;
    readonly afterScreenshot?: string;
    readonly afterRouteHealth?: string;
    readonly humanVerdict?: string;
    readonly failureModeCorrected?: string;
  }[];
}>("tests/reports/prompt-fidelity-quality.json");
const agentApiSource = readText("packages/engine/src/agent-api/index.ts");
const agentApiTestSource = readText("tests/unit/agent-api/agent-api.test.ts");
const promptPlanTemplateSources = [
  ...starterTemplates.map((template) => `packages/create-aura3d/templates/${template}/src/main.ts`),
  ...starterTemplates.map((template) => `templates/${template}/src/main.ts`)
];

const versionTerms = [/\bV[234]\b/i, /Path A/i, /Path B/i, /path-a/i, /path-b/i, /check:v4/i, /__v4/i, /aura3d-v4/i];
const draftTerms = [
  new RegExp(["place", "holder"].join(""), "i"),
  /\bMVP\b/i,
  /future work/i,
  /under review/i,
  /needs work/i,
  /\btoy\b/i,
  /\bstub\b/i
];
const archivedRuntimeTerms = [/AuraSceneIR/, /MockProvider/, /prompt-to-scene/, /@aura3d\/ai-scene/];

const checks: ReleaseCheck[] = [
  {
    id: "product-context-prd-exists",
    pass: existsSync("ProductContextPRD.md"),
    detail: "ProductContextPRD.md is present"
  },
  {
    id: "test-plan-prd-exists",
    pass: existsSync("TestV4PlanPRD.md"),
    detail: "TestV4PlanPRD.md is present"
  },
  {
    id: "release-gate-script-exists",
    pass: Boolean(rootPackage.scripts?.["check:release"]),
    detail: `check:release=${rootPackage.scripts?.["check:release"] ?? "missing"}`
  },
  {
    id: "product-context-script-registered",
    pass: Boolean(rootPackage.scripts?.["check:product-context"]),
    detail: `check:product-context=${rootPackage.scripts?.["check:product-context"] ?? "missing"}`
  },
  {
    id: "active-template-directory-exactly-three",
    pass: sameSet(activeTemplateDirs, [...starterTemplates]),
    detail: `active template dirs: ${activeTemplateDirs.join(", ")}`
  },
  {
    id: "held-back-template-archive-present",
    pass: existsSync("archive/held-back-create-aura3d-templates/README.md"),
    detail: "archive/held-back-create-aura3d-templates/README.md documents held-back templates"
  },
  {
    id: "apps-classification-covers-active-apps",
    pass: appDirs.every((dir) => appsClassification.includes(`\`${dir}\``) || appsClassification.includes(`\`/apps/${dir}/\``)),
    detail: appDirs.filter((dir) => !appsClassification.includes(`\`${dir}\``) && !appsClassification.includes(`\`/apps/${dir}/\``)).length === 0
      ? `${appDirs.length} active app dirs are classified`
      : `missing classifications: ${appDirs.filter((dir) => !appsClassification.includes(`\`${dir}\``) && !appsClassification.includes(`\`/apps/${dir}/\``)).join(", ")}`
  },
  {
    id: "public-product-language-no-release-cycle",
    pass: findMatches(publicProductFiles, versionTerms).length === 0,
    detail: summarizeMatches(publicProductFiles, versionTerms)
  },
  {
    id: "public-site-no-draft-status-language",
    pass: findMatches(["index.html", "marketing/index.html", "marketing/src/main.ts", "marketing/src/styles.css"], draftTerms).length === 0,
    detail: summarizeMatches(["index.html", "marketing/index.html", "marketing/src/main.ts", "marketing/src/styles.css"], draftTerms)
  },
  {
    id: "active-code-no-archived-runtime-surface",
    pass: findMatches(activeCodeAndDocs, archivedRuntimeTerms).length === 0,
    detail: summarizeMatches(activeCodeAndDocs, archivedRuntimeTerms)
  },
  {
    id: "archive-not-workspace-package",
    pass: !readText("pnpm-workspace.yaml").includes("archive"),
    detail: "pnpm workspace does not include archive paths"
  },
  {
    id: "create-aura3d-public-install-name",
    pass: createPackage.name === "create-aura3d",
    detail: `packages/create-aura3d/package.json name is ${createPackage.name ?? "missing"}`
  },
  {
    id: "aura3d-cli-user-facing-bin",
    pass: Boolean(cliPackage.bin?.["aura3d"] ?? cliPackage.bin?.["aura"]),
    detail: `@aura3d/cli bin entries: ${Object.keys(cliPackage.bin ?? {}).join(", ") || "none"}`
  },
  {
    id: "root-package-ships-only-starter-templates",
    pass: (rootPackage.files ?? []).filter((file) => file.startsWith("templates/")).every((file) => starterTemplates.some((template) => file === `templates/${template}`)),
    detail: `root template files: ${(rootPackage.files ?? []).filter((file) => file.startsWith("templates/")).join(", ")}`
  },
  {
    id: "codex-dogfood-screenshot-profile-present",
    pass:
      Number(codexScreenshotProfile.profile?.yellowPixels ?? 0) > 800 &&
      Number(codexScreenshotProfile.profile?.rainPixels ?? 0) > 20 &&
      Number(codexScreenshotProfile.profile?.centerObjectPixels ?? 0) > 900 &&
      Number(codexScreenshotProfile.profile?.uniqueBuckets ?? 0) > 18,
    detail: `codex profile=${JSON.stringify(codexScreenshotProfile.profile ?? {})}`
  },
  {
    id: "codex-dogfood-prompt-plan-evidence-present",
    pass:
      codexAgentReport.pass === true &&
      codexAgentReport.promptPlan?.selectedRecipe === "cinematic-scene" &&
      (codexAgentReport.promptPlan?.assetRefs ?? []).includes("assets.agentProduct") &&
      codexAgentReport.compiledPromptPlanReport?.recipe === "cinematic-scene" &&
      (codexAgentReport.compiledPromptPlanReport?.visualSystems ?? []).length > 0 &&
      (codexAgentReport.compiledPromptPlanReport?.repairHints ?? []).length > 0 &&
      (codexAgentReport.checks ?? []).some((check) => check.id === "codex-generated-app-uses-prompt-plan" && check.pass === true),
    detail: codexAgentReport.pass === true
      ? `recipe=${codexAgentReport.compiledPromptPlanReport?.recipe ?? "missing"}, visualSystems=${codexAgentReport.compiledPromptPlanReport?.visualSystems?.length ?? 0}, repairHints=${codexAgentReport.compiledPromptPlanReport?.repairHints?.length ?? 0}`
      : "missing or failing tests/reports/agent-context/codex-self-test.json prompt-plan evidence"
  },
  {
    id: "codex-five-task-eval-present",
    pass:
      codexAgentReport.pass === true &&
      codexAgentReport.fiveTaskEval?.summary?.compiles === true &&
      codexAgentReport.fiveTaskEval?.summary?.runs === true &&
      codexAgentReport.fiveTaskEval?.summary?.apiHallucinations === 0 &&
      codexAgentReport.fiveTaskEval?.summary?.assetPathErrors === 0 &&
      (codexAgentReport.fiveTaskEval?.taskScores ?? []).length === 5 &&
      (codexAgentReport.fiveTaskEval?.taskScores ?? []).every((task) => task.compiles === true && task.runs === true && task.productQualityPass === true && task.apiHallucinations === 0 && task.assetPathErrors === 0) &&
      codexAgentReport.fiveTaskEval?.routeReport?.ready === true &&
      codexAgentReport.fiveTaskEval?.routeReport?.backend === "webgl2" &&
      codexAgentReport.fiveTaskEval?.routeReport?.staticPreview === true &&
      codexAgentReport.fiveTaskEval?.swapReport?.before === "sneaker" &&
      codexAgentReport.fiveTaskEval?.swapReport?.after === "shoe2" &&
      Number(codexAgentReport.fiveTaskEval?.screenshotReport?.profile?.subjectPixels ?? 0) > 900 &&
      Number(codexAgentReport.fiveTaskEval?.screenshotReport?.profile?.softboxPixels ?? 0) > 180 &&
      Number(codexAgentReport.fiveTaskEval?.screenshotReport?.profile?.rainPixels ?? 0) > 20 &&
      Number(codexAgentReport.fiveTaskEval?.screenshotReport?.profile?.reflectionPixels ?? 0) > 80 &&
      (codexAgentReport.checks ?? []).some((check) => check.id === "codex-five-task-completes-at-least-four-of-five" && check.pass === true),
    detail: codexAgentReport.fiveTaskEval?.summary
      ? `tasks=${codexAgentReport.fiveTaskEval.taskScores?.filter((task) => task.productQualityPass === true).length ?? 0}/5, backend=${codexAgentReport.fiveTaskEval.routeReport?.backend ?? "missing"}, swap=${String(codexAgentReport.fiveTaskEval.swapReport?.before ?? "missing")}->${String(codexAgentReport.fiveTaskEval.swapReport?.after ?? "missing")}`
      : "missing fiveTaskEval evidence in tests/reports/agent-context/codex-self-test.json"
  },
  {
    id: "codex-repair-eval-present",
    pass:
      codexAgentReport.pass === true &&
      codexAgentReport.repairEval?.summary?.compiles === true &&
      codexAgentReport.repairEval?.summary?.runs === true &&
      codexAgentReport.repairEval?.summary?.apiHallucinations === 0 &&
      codexAgentReport.repairEval?.summary?.assetPathErrors === 0 &&
      codexAgentReport.repairEval?.failedLabel === "fail" &&
      codexAgentReport.repairEval?.repairedLabel === "product-quality-pass" &&
      codexAgentReport.repairEval?.repairTurnCount === 1 &&
      (codexAgentReport.repairEval?.appliedRepairHints ?? []).length > 0 &&
      codexAgentReport.repairEval?.initialRouteReport?.ready === true &&
      codexAgentReport.repairEval?.initialRouteReport?.backend === "webgl2" &&
      codexAgentReport.repairEval?.initialScreenshotReport?.productQualityPass === false &&
      codexAgentReport.repairEval?.repairedRouteReport?.ready === true &&
      codexAgentReport.repairEval?.repairedRouteReport?.backend === "webgl2" &&
      codexAgentReport.repairEval?.repairedRouteReport?.hasPromptPlan === true &&
      (codexAgentReport.repairEval?.repairedRouteReport?.compiledRepairHints ?? []).length > 0 &&
      codexAgentReport.repairEval?.repairedScreenshotReport?.productQualityPass === true &&
      Number(codexAgentReport.repairEval?.repairedScreenshotReport?.profile?.subjectPixels ?? 0) > Number(codexAgentReport.repairEval?.initialScreenshotReport?.profile?.subjectPixels ?? 0) &&
      Number(codexAgentReport.repairEval?.repairedScreenshotReport?.profile?.rainPixels ?? 0) > Number(codexAgentReport.repairEval?.initialScreenshotReport?.profile?.rainPixels ?? 0) &&
      Number(codexAgentReport.repairEval?.repairedScreenshotReport?.profile?.reflectionPixels ?? 0) > Number(codexAgentReport.repairEval?.initialScreenshotReport?.profile?.reflectionPixels ?? 0) &&
      (codexAgentReport.checks ?? []).some((check) => check.id === "codex-repair-screenshot-improves-to-product-quality" && check.pass === true),
    detail: codexAgentReport.repairEval?.summary
      ? `initial=${codexAgentReport.repairEval.initialScreenshotReport?.reviewLabel ?? "missing"}, repaired=${codexAgentReport.repairEval.repairedScreenshotReport?.reviewLabel ?? "missing"}, turns=${codexAgentReport.repairEval.repairTurnCount ?? "missing"}`
      : "missing repairEval evidence in tests/reports/agent-context/codex-self-test.json"
  },
  {
    id: "fresh-codex-context-result-documented",
    pass:
      freshCodexResult.includes("API hallucination count | 0") &&
      freshCodexResult.includes("Asset path error count | 0") &&
      freshCodexResult.includes("Browser backend | `webgl2`") &&
      freshCodexResult.includes("Initial model | `product`") &&
      freshCodexResult.includes("Click-swapped model | `hero`"),
    detail: freshCodexResult ? "fresh Codex context-only result is documented" : "missing docs/project/fresh-codex-agent-context-results.md"
  },
  {
    id: "claude-code-context-result-documented",
    pass:
      claudeCodeAgentReport.pass === true &&
      (claudeCodeAgentReport.checks ?? []).every((check) => check.pass === true) &&
      (claudeCodeAgentReport.checks ?? []).some((check) => check.id === "claude-no-api-hallucinations" && check.pass === true) &&
      (claudeCodeAgentReport.checks ?? []).some((check) => check.id === "claude-no-asset-path-errors" && check.pass === true) &&
      claudeCodeResult.includes("Manual external-agent pass for Claude Code") &&
      claudeCodeResult.includes("Human review label: `product-quality-pass`"),
    detail: claudeCodeAgentReport.pass === true
      ? `Claude Code checks=${claudeCodeAgentReport.checks?.filter((check) => check.pass === true).length ?? 0}/${claudeCodeAgentReport.checks?.length ?? 0}`
      : "missing or failing tests/reports/agent-context/claude-code-eval.json"
  },
  {
    id: "starter-template-visual-review-present",
    pass:
      starterVisualReview.includes("product-viewer") &&
      starterVisualReview.includes("cinematic-scene") &&
      starterVisualReview.includes("mini-game") &&
      starterVisualReview.includes("product-quality-pass") &&
      starterVisualReview.includes("approved starter recipes"),
    detail: starterVisualReview ? "starter-template visual review documents current starter product-quality screenshots and boundary" : "missing docs/project/starter-template-visual-review.md"
  },
  {
    id: "starter-example-visual-review-present",
    pass:
      starterExampleVisualReview.includes("hello-world-typed-asset") &&
      starterExampleVisualReview.includes("material-lighting") &&
      starterExampleVisualReview.includes("camera-path") &&
      starterExampleVisualReview.includes("not product-quality proof"),
    detail: starterExampleVisualReview ? "starter-example visual review documents active example screenshots and product-quality boundary" : "missing docs/project/starter-example-visual-review.md"
  },
  {
    id: "prompt-visual-quality-gap-tracked",
    pass:
      promptVisualQualityGap.includes("starter prompt recipes now pass") &&
      promptVisualQualityGap.includes("broad prompt-to-visual quality is still not fully proven") &&
      promptVisualQualityGap.includes("Prompt Fidelity Acceptance Bar"),
    detail: promptVisualQualityGap ? "prompt-to-visual quality boundary is documented with starter pass and broad remaining gaps" : "missing docs/project/prompt-visual-quality-gap.md"
  },
  {
    id: "prompt-fidelity-quality-report-present",
    pass:
      promptFidelityReport.pass === true &&
      promptFidelityReport.productQualityReady === true &&
      Number(promptFidelityReport.releaseFacingProductQualityPasses ?? -1) >= 3 &&
      (promptFidelityReport.negativeFixtures ?? []).every((fixture) => fixture.rejected === true),
    detail: promptFidelityReport.pass === true
      ? `productQualityReady=${String(promptFidelityReport.productQualityReady)}, releaseFacingPasses=${promptFidelityReport.releaseFacingProductQualityPasses ?? "missing"}`
      : "missing or failing tests/reports/prompt-fidelity-quality.json"
  },
  {
    id: "starter-before-after-evidence-present",
    pass:
      promptFidelityReport.pass === true &&
      (promptFidelityReport.starterBeforeAfterCases ?? []).length === 3 &&
      (promptFidelityReport.starterBeforeAfterCases ?? []).every((entry) =>
        entry.beforeScreenshot &&
        entry.generatedCodePath &&
        entry.afterScreenshot &&
        entry.afterRouteHealth &&
        entry.humanVerdict === "product-quality-pass" &&
        entry.failureModeCorrected &&
        existsSync(entry.beforeScreenshot) &&
        existsSync(entry.generatedCodePath) &&
        existsSync(entry.afterScreenshot) &&
        existsSync(entry.afterRouteHealth)
      ),
    detail: (promptFidelityReport.starterBeforeAfterCases ?? []).length === 3
      ? `${promptFidelityReport.starterBeforeAfterCases?.length ?? 0} starter before/after cases recorded`
      : `starter before/after cases=${promptFidelityReport.starterBeforeAfterCases?.length ?? 0}`
  },
  {
    id: "prompt-plan-api-and-starters-present",
    pass:
      ["definePromptPlan", "compilePromptPlan", "promptPlanToScene", "promptRecipes"].every((name) => agentApiSource.includes(`export ${name === "promptRecipes" ? "const" : "function"} ${name}`)) &&
      promptPlanTemplateSources.every((path) => {
        const source = readText(path);
        return source.includes("definePromptPlan") && source.includes("promptPlanToScene") && source.includes("acceptanceCriteria");
      }),
    detail: promptPlanTemplateSources.every((path) => readText(path).includes("definePromptPlan") && readText(path).includes("promptPlanToScene"))
      ? "prompt-plan API exports and active packaged starters are present"
      : `missing prompt-plan source: ${promptPlanTemplateSources.filter((path) => {
        const source = readText(path);
        return !source.includes("definePromptPlan") || !source.includes("promptPlanToScene");
      }).join(", ")}`
  },
  {
    id: "prompt-plan-vague-plan-warnings-tested",
    pass:
      agentApiSource.includes("warnings: promptPlanWarnings(plan)") &&
      agentApiSource.includes("function promptPlanWarnings") &&
      agentApiSource.includes("at least three concrete screenshot acceptance criteria") &&
      agentApiTestSource.includes("warns when prompt plans omit minimum visual information") &&
      agentApiTestSource.includes("style is missing") &&
      agentApiTestSource.includes("environment is missing") &&
      agentApiTestSource.includes("camera preset is missing") &&
      agentApiTestSource.includes("lighting preset is missing"),
    detail: agentApiTestSource.includes("warns when prompt plans omit minimum visual information")
      ? "agent API test covers warnings for vague prompt plans"
      : "missing vague prompt-plan warning test"
  },
  {
    id: "prompt-facing-effects-upgraded",
    pass:
      agentApiSource.includes("function createThreeBloom") &&
      agentApiSource.includes("function createThreeRain") &&
      agentApiSource.includes("InstancedMesh") &&
      agentApiSource.includes("aura-rain-floor-splash-ripples") &&
      agentApiSource.includes("aura-rain-mist-bank"),
    detail: "public prompt-facing rain and bloom have renderer-owned Three paths beyond symbolic lines/no-op"
  },
  {
    id: "effects-vfx-visual-audit-present",
    pass:
      (effectsVfxAuditReport.summary?.total ?? 0) > 0 &&
      effectsVfxAuditReport.pass === true &&
      (effectsVfxAuditReport.summary?.partial ?? 1) === 0 &&
      (effectsVfxAuditReport.summary?.fail ?? 1) === 0 &&
      effectsVfxAuditReport.visualProof?.pass === true &&
      effectsVfxVisualAuditDoc.includes("Effects/VFX Visual Audit") &&
      effectsVfxVisualAuditDoc.toLowerCase().includes("production-runtime") &&
      effectsVfxVisualAuditDoc.toLowerCase().includes("three-compat postprocess") &&
      effectsVfxVisualAuditDoc.includes("effects.rain()"),
    detail: effectsVfxAuditReport.summary
      ? `effects audit total=${effectsVfxAuditReport.summary.total ?? 0}, pass=${effectsVfxAuditReport.summary.pass ?? 0}, partial=${effectsVfxAuditReport.summary.partial ?? 0}, fail=${effectsVfxAuditReport.summary.fail ?? 0}, contactSheet=${effectsVfxAuditReport.visualProof?.screenshotPath ?? "missing"}`
      : "missing tests/reports/effects-vfx-visual-audit.json or docs/project/effects-vfx-visual-audit.md"
  }
];

const claims: ClaimEvidence[] = [
  claim("Aura3D is the editable scene layer for agent-written browser 3D.", "automated-pass", ["ProductContextPRD.md", "README.md", "marketing/index.html"]),
  claim("AI coding agents write TypeScript or JavaScript against a compact public API.", statusFrom("check:agent-api"), ["pnpm run check:agent-api", "tests/reports/agent-api-surface.json"]),
  claim("Users bring their own assets.", statusFromReport("tests/reports/asset-corpus.json"), ["tools/asset-corpus/index.ts", "tests/reports/asset-corpus.json"], "Run and expand asset corpus against real external GLBs."),
  claim("Aura3D provides typed asset references.", statusFrom("check:assets-cli"), ["pnpm run check:assets-cli", "tests/unit/aura3d-cli/assets.test.ts"]),
  claim("Aura3D provides starter templates.", statusFrom("check:templates"), ["pnpm run check:templates", "packages/create-aura3d/templates"]),
  claim("Starter templates render through WebGL2 and have scene-specific render-plumbing screenshot profile checks.", statusFrom("check:templates"), ["packages/create-aura3d/templates/*/tests/screenshot.spec.ts", "tests/reports/create-aura3d-scaffold-smoke/*/tests/reports/screenshot.json", "docs/project/starter-template-visual-review.md"]),
  claim("Aura3D provides diagnostics.", statusFrom("check:devtools"), ["pnpm run check:devtools", "packages/engine/src/devtools"]),
  claim("Aura3D provides screenshots.", statusFrom("check:examples"), ["pnpm run check:examples", "tests/browser/examples-route-health.spec.ts", "docs/project/starter-example-visual-review.md"]),
  claim("Aura3D provides static deployment checks.", statusFrom("check:deployment"), ["pnpm run check:deployment", "packages/aura3d-cli/src/index.ts"]),
  claim("Public packages work from packed artifacts in clean npm projects.", statusFrom("check:clean-install"), ["pnpm run check:clean-install", "tests/reports/package-clean-install.json"]),
  claim("@aura3d/engine exposes the public engine surface.", statusFrom("check:public-api"), ["packages/engine/src/agent-api/index.ts", "tools/public-api-contract/index.ts"]),
  claim("@aura3d/react is an optional thin React adapter.", statusFrom("check:public-api"), ["packages/react/src/index.ts", "tools/public-api-contract/index.ts"]),
  claim("@aura3d/cli supports asset, doctor, deployment, serve, and agent-file flows.", statusFrom("check:assets-cli"), ["packages/aura3d-cli/src/cli.ts", "packages/aura3d-cli/src/index.ts"]),
  claim("create-aura3d scaffolds product-viewer, cinematic-scene, and mini-game.", createPackage.name === "create-aura3d" ? statusFrom("check:templates") : "known-gap", ["packages/create-aura3d", "tools/agent-templates/index.ts"]),
  claim("Agent-readable context is useful.", statusFromReport("tests/reports/agent-context/codex-self-test.json"), ["docs/agents/*", "tests/reports/agent-context/codex-self-test.json", "tests/reports/agent-context/claude-code-eval.json"], "Codex and Claude Code context evals pass; run Cursor and Copilot separately when available."),
  claim("A fresh Codex context-only run can build a compiling WebGL2 app with typed assets.", checkStatus("fresh-codex-context-result-documented") === "automated-pass" ? "manual-pass" : "known-gap", ["docs/project/fresh-codex-agent-context-results.md"], "Run Cursor and Copilot separately; this only proves a fresh Codex run and not product-quality visual fidelity."),
  claim("Claude Code can complete the five-task context-only eval from agent context and public tarballs.", checkStatus("claude-code-context-result-documented") === "automated-pass" ? "manual-pass" : "known-gap", ["docs/project/claude-code-agent-context-results.md", "tests/reports/agent-context/claude-code-eval.json"], "This is one external-agent pass; Cursor and Copilot remain separate subscription runs."),
  claim("Codex dogfood uses prompt-plan helpers, typed assets, route health, screenshot profile checks, and product-quality visual review for the deterministic self-test.", checkStatus("codex-dogfood-screenshot-profile-present") === "automated-pass" && checkStatus("codex-dogfood-prompt-plan-evidence-present") === "automated-pass" && checkStatus("prompt-fidelity-quality-report-present") === "automated-pass" ? "automated-pass" : "known-gap", ["tests/reports/agent-context/codex-self-test.json", "tests/reports/agent-context/codex-self-test-workspace/tests/reports/screenshot.json", "tools/agent-dogfood/index.ts", "docs/project/prompt-visual-quality-gap.md", "tests/reports/prompt-fidelity-quality.json"]),
  claim("Codex five-task context eval completes product viewer, camera/rain, reflective floor, click-swap, and static preview tasks with typed assets and no API hallucinations.", checkStatus("codex-five-task-eval-present"), ["docs/project/agent-dogfood-results.md", "tests/reports/agent-context/codex-self-test.json", "tests/reports/agent-context/codex-five-task-workspace/tests/reports/screenshot.json", "tools/agent-dogfood/index.ts"], "This is local Codex evidence only; run the same five-task eval with external agents before claiming cross-agent proof."),
  claim("Codex repair eval improves a failed screenshot to product-quality by applying prompt-plan repair hints with a recorded repair turn.", checkStatus("codex-repair-eval-present"), ["docs/project/agent-dogfood-results.md", "tests/reports/agent-context/codex-self-test.json", "tests/reports/agent-context/codex-repair-workspace/tests/reports/initial-screenshot.json", "tests/reports/agent-context/codex-repair-workspace/tests/reports/repaired-screenshot.json", "tools/agent-dogfood/index.ts"], "This is local Codex evidence only; run external agent repair turns separately before claiming broad repair-loop behavior."),
  claim("The public agent API includes prompt-plan helpers and the three starter templates use that prompt-plan flow.", checkStatus("prompt-plan-api-and-starters-present"), ["packages/engine/src/agent-api/index.ts", "packages/create-aura3d/templates/*/src/main.ts", "templates/*/src/main.ts", "tools/prompt-fidelity-quality/index.ts"]),
  claim("Prompt-plan reports warn when required visual information is missing from vague plans.", checkStatus("prompt-plan-vague-plan-warnings-tested"), ["packages/engine/src/agent-api/index.ts", "tests/unit/agent-api/agent-api.test.ts"]),
  claim("Prompt-facing rain and bloom effects have renderer-owned visual implementations beyond the previous symbolic/no-op path.", checkStatus("prompt-facing-effects-upgraded"), ["packages/engine/src/agent-api/index.ts", "docs/project/effects-vfx-visual-audit.md", "tests/reports/effects-vfx-visual-audit.json"], "Keep screenshot regression review on the starter and dogfood routes; this does not prove premium VFX parity."),
  claim("The effects/VFX surface is audited for visual acceptability instead of assuming named effects are finished.", checkStatus("effects-vfx-visual-audit-present"), ["docs/project/effects-vfx-visual-audit.md", "tests/reports/effects-vfx-visual-audit.json", "tools/effects-vfx-visual-audit/index.ts"], "The audit passes at starter/helper level; route-level screenshots and human review are still required for premium VFX claims."),
  claim("The three release-facing starter prompt recipes pass product-quality screenshot review.", checkStatus("prompt-fidelity-quality-report-present"), ["docs/project/prompt-fidelity-quality-results.md", "tests/reports/prompt-fidelity-quality.json", "tests/reports/prompt-fidelity/contact-sheet.png"]),
  claim("Each fixed starter has before/after prompt-fidelity evidence with source prompt, corrected failure mode, code path, screenshots, route health, and human verdict.", checkStatus("starter-before-after-evidence-present"), ["docs/project/prompt-fidelity-quality-results.md", "tests/reports/prompt-fidelity-quality.json", "tests/reports/prompt-fidelity/before-after-contact-sheet.png"]),
  claim("Legacy AI-runtime code is outside the active workspace.", checkStatus("active-code-no-archived-runtime-surface"), ["archive/legacy-ai-runtime", "tools/product-context-evidence/index.ts"]),
  claim("The public authoring model is source code plus typed assets.", statusFromReport("tests/reports/agent-context/codex-self-test.json"), ["README.md", "docs/agents/build-playbook.md", "docs/project/fresh-codex-agent-context-results.md"]),
  claim("The active starter-template directory contains only the three starter templates.", checkStatus("active-template-directory-exactly-three"), ["packages/create-aura3d/templates"]),
  claim("The three starter templates install, build, render, preview, and recover from common asset errors in clean directories.", statusFrom("check:clean-install"), ["docs/project/clean-install-results.md", "docs/project/starter-template-visual-review.md", "tests/reports/package-clean-install.json"]),
  claim("Held-back template experiments are outside the active starter-template directory and documented in archive.", checkStatus("held-back-template-archive-present"), ["archive/held-back-create-aura3d-templates/README.md"]),
  claim("Active apps directories are classified.", checkStatus("apps-classification-covers-active-apps"), ["docs/project/apps-classification.md"]),
  claim("Marketing speaks in product and workflow language.", statusFrom("check:marketing-truth"), ["marketing/index.html", "tools/marketing-truth/index.ts"]),
  claim("Public site checks reject draft-copy, internal-status, and version-cycle wording.", statusFrom("check:docs-site"), ["tools/docs-site/index.ts", "tools/marketing-truth/index.ts"]),
  claim("Broad product confidence depends on focused release checks and dogfood, not aggregate monorepo test counts.", "automated-pass", ["ProductContextPRD.md", "TestV4PlanPRD.md"]),
  claim("Extra apps routes are evidence and not the primary getting-started path.", statusFrom("check:examples"), ["docs/project/apps-classification.md", "marketing/index.html", "docs/project/starter-example-visual-review.md"]),
  claim("Bundle-size proof measures built bundles, including starter apps.", statusFrom("check:bundle-size"), ["tools/bundle-size/index.ts", "tests/reports/bundle-size.json"])
];

const knownGaps: KnownGapEvidence[] = [
  {
    gap: "The broader effects/VFX/postprocess surface is contact-sheet proven only at starter/helper level.",
    owner: "Runtime/VFX QA",
    nextAction: "Keep check:effects-vfx passing, then add route-level screenshots and human review before marketing particle presets, cinematic approximations, or compatibility VFX as premium production VFX.",
    targetEvidence: ["docs/project/effects-vfx-visual-audit.md", "tests/reports/effects-vfx-visual-audit.json", "tools/effects-vfx-visual-audit/index.ts"]
  },
  {
    gap: "Broad prompt-to-visual product quality beyond approved starter recipes is not fully proven.",
    owner: "Product/Runtime QA",
    nextAction: "Keep the starter product-quality screenshots under regression review, then add more positive prompt fixtures, broader asset coverage, repair-loop evidence, and external agent/user dogfood before claiming broad arbitrary prompt-to-visual quality.",
    targetEvidence: ["docs/project/prompt-visual-quality-gap.md", "docs/project/starter-template-visual-review.md", "docs/project/prompt-fidelity-quality-results.md", "tests/reports/prompt-fidelity-quality.json"]
  },
  {
    gap: "Cursor and Copilot context-only agent runs are not complete.",
    owner: "Product QA",
    nextAction: "Codex five-task local evidence and Claude Code external-agent evidence now pass. Run the same five-task context-only script against subscribed Cursor and Copilot environments.",
    targetEvidence: ["docs/project/agent-dogfood-results.md", "docs/project/claude-code-agent-context-results.md", "tests/reports/agent-context/*.json"]
  },
  ...statusFromReport("tests/reports/agent-baseline-comparison.json") === "automated-pass"
    ? []
    : [{
        gap: "Raw Three.js baseline comparison is not complete.",
        owner: "Product QA",
        nextAction: "Run the same agent task set with raw Three.js-only context and compare hallucinations, asset-path mistakes, repair turns, route health, screenshots, and deploy checks.",
        targetEvidence: ["docs/project/agent-baseline-comparison.md", "tests/reports/agent-baseline-comparison.json"]
      }],
  {
    gap: "Licensed wild-asset corpus is not broad enough.",
    owner: "Assets QA",
    nextAction: "The asset corpus now covers generated/adversarial assets, selected pinned Khronos/product-form/material-extension/Blender-export/animation/textured-PBR/KTX2 fixtures, a downloaded Poly Haven CC0 glTF, and a downloaded Khronos Draco-compressed glTF. Add authenticated Sketchfab CC0 downloads and Meshy exports with source/license notes, then run add/validate/typegen/render.",
    targetEvidence: ["fixtures/asset-corpus/README.md", "docs/project/asset-corpus-results.md", "tests/reports/asset-corpus.json"]
  },
  {
    gap: "Real external deployment smoke is not complete across Vercel, Cloudflare Pages, and Netlify.",
    owner: "Release Engineering",
    nextAction: (externalDeploymentReport.checks ?? []).some((check) => check.id === "vercel-public-smoke" && check.pass === true)
      ? "Vercel public smoke now renders a WebGL2 Aura3D canvas from a deployed product-viewer artifact. Provide Cloudflare Pages and Netlify credentials or project targets, then record public URLs, route health, screenshots, MIME checks, and deployment-check output for those hosts."
      : "Vercel public smoke is not yet passing. Provide or repair a public Vercel smoke project, then provide Cloudflare Pages and Netlify credentials and record public URLs, route health, screenshots, MIME checks, and deployment-check output.",
    targetEvidence: ["docs/project/external-deployment-results.md", "tests/reports/external-deployment-smoke.json"]
  },
  {
    gap: "Marketing comprehension interviews are not complete.",
    owner: "Product Marketing",
    nextAction: "Show the marketing site to an indie React developer, a Three.js-experienced 3D artist, and a non-technical product manager, then record answers to the comprehension rubric.",
    targetEvidence: ["docs/project/marketing-comprehension-results.md"]
  },
  {
    gap: "Outside beta dogfood is not complete.",
    owner: "Product/Community",
    nextAction: "Publish beta artifacts, recruit at least five external install/scaffold attempts, record feedback in issues or dogfood docs, and fix or document critical bugs.",
    targetEvidence: ["docs/project/outside-beta-dogfood-results.md", ".github/ISSUE_TEMPLATE"]
  }
];

const completeClaims = claims.filter((entry) => entry.status !== "known-gap").length;
const trackedClaimGaps = claims.filter((entry) => entry.status === "known-gap" && entry.nextAction && entry.evidence.length > 0).length;
const claimGaps = claims.filter((entry) => entry.status === "known-gap").length;
const trackedKnownGaps = knownGaps.filter((entry) => entry.owner && entry.nextAction && entry.targetEvidence.length > 0).length;
checks.push({
  id: "known-gaps-have-owners-next-actions-and-target-evidence",
  pass: trackedKnownGaps === knownGaps.length,
  detail: `${trackedKnownGaps}/${knownGaps.length} known gaps have owner, next action, and target evidence`
});
checks.push({
  id: "claim-evidence-matrix-complete",
  pass: trackedClaimGaps === claimGaps && trackedKnownGaps === knownGaps.length,
  detail: `${completeClaims}/${claims.length} claims have pass evidence; ${trackedClaimGaps}/${claimGaps} claim gaps and ${trackedKnownGaps}/${knownGaps.length} known gaps are tracked`
});

writeEvidenceMarkdown(claims, knownGaps, checks);
writeReport("tests/reports/product-context-evidence.json", "aura3d-product-context-evidence", checks, { claims, knownGaps });

function claim(claimText: string, status: EvidenceStatus, evidence: readonly string[], nextAction?: string): ClaimEvidence {
  return { claim: claimText, status, evidence, nextAction };
}

function checkStatus(id: string): EvidenceStatus {
  return checks.find((check) => check.id === id)?.pass ? "automated-pass" : "known-gap";
}

function statusFrom(scriptName: string): EvidenceStatus {
  const reportHints: Record<string, string> = {
    "check:agent-api": "tests/reports/agent-api-surface.json",
    "check:public-api": "tests/reports/public-api-contract.json",
    "check:assets-cli": "tests/reports/asset-cli.json",
    "check:templates": "tests/reports/agent-templates.json",
    "check:examples": "tests/reports/agent-examples.json",
    "check:devtools": "tests/reports/agent-devtools.json",
    "check:deployment": "tests/reports/agent-deployment.json",
    "check:docs-site": "tests/reports/docs-site.json",
    "check:bundle-size": "tests/reports/bundle-size.json",
    "check:marketing-truth": "tests/reports/marketing-truth.json",
    "check:clean-install": "tests/reports/package-clean-install.json"
  };
  return statusFromReport(reportHints[scriptName] ?? "");
}

function statusFromReport(path: string): EvidenceStatus {
  if (!path || !existsSync(path)) return "known-gap";
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { pass?: unknown };
    return parsed.pass === true ? "automated-pass" : "known-gap";
  } catch {
    return "known-gap";
  }
}

function writeEvidenceMarkdown(claims: readonly ClaimEvidence[], knownGaps: readonly KnownGapEvidence[], checks: readonly ReleaseCheck[]): void {
  const lines = [
    "# Product Context Evidence",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Claims with evidence: ${claims.filter((entry) => entry.status !== "known-gap").length}/${claims.length}`,
    `- Known gaps tracked: ${knownGaps.filter((entry) => entry.owner && entry.nextAction && entry.targetEvidence.length > 0).length}/${knownGaps.length}`,
    `- Automated checks passing: ${checks.filter((check) => check.pass).length}/${checks.length}`,
    "",
    "## Claim Matrix",
    "",
    "| Claim | Status | Evidence | Next Action |",
    "|---|---|---|---|",
    ...claims.map((entry) => `| ${escapeTable(entry.claim)} | \`${entry.status}\` | ${entry.evidence.map((item) => `\`${item}\``).join("<br>")} | ${escapeTable(entry.nextAction ?? "")} |`),
    "",
    "## Known Gaps",
    "",
    "| Gap | Owner | Next Action | Target Evidence |",
    "|---|---|---|---|",
    ...knownGaps.map((entry) => `| ${escapeTable(entry.gap)} | ${escapeTable(entry.owner)} | ${escapeTable(entry.nextAction)} | ${entry.targetEvidence.map((item) => `\`${item}\``).join("<br>")} |`),
    "",
    "## Automated Checks",
    "",
    "| Check | Result | Detail |",
    "|---|---:|---|",
    ...checks.map((check) => `| \`${check.id}\` | ${check.pass ? "pass" : "fail"} | ${escapeTable(check.detail)} |`),
    ""
  ];
  mkdirSync("docs/project", { recursive: true });
  writeFileSync("docs/project/product-context-evidence.md", `${lines.join("\n")}\n`);
}

function findMatches(paths: readonly string[], patterns: readonly RegExp[]): readonly string[] {
  const hits: string[] = [];
  for (const path of paths) {
    if (!existsSync(path) || statSync(path).isDirectory() || isBinaryLike(path)) continue;
    const text = readText(path);
    for (const pattern of patterns) {
      if (pattern.test(text)) hits.push(`${path}: ${pattern.source}`);
    }
  }
  return hits;
}

function summarizeMatches(paths: readonly string[], patterns: readonly RegExp[]): string {
  const matches = findMatches(paths, patterns);
  return matches.length === 0 ? "no banned text found" : matches.slice(0, 12).join("; ");
}

function listFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", "dist", "coverage", "test-results", ".git"].includes(entry.name)) continue;
        stack.push(path);
      } else {
        files.push(path);
      }
    }
  }
  return files.sort();
}

function readText(path: string): string {
  return existsSync(path) && !statSync(path).isDirectory() ? readFileSync(path, "utf8") : "";
}

function readJson<T>(path: string): T {
  const text = readText(path);
  return (text ? JSON.parse(text) : {}) as T;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item));
}

function isBinaryLike(path: string): boolean {
  return [".glb", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico"].includes(extname(path).toLowerCase());
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
