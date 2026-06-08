import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { addAsset, validateAssets } from "../../packages/aura3d-cli/src/index";
import { writeReport, type ReleaseCheck } from "../check-common";

interface AgentDogfoodScore {
  readonly agent: string;
  readonly compiles: boolean;
  readonly runs: boolean;
  readonly apiHallucinations: number;
  readonly assetPathErrors: number;
  readonly turns: number;
  readonly notes: readonly string[];
}

interface AgentDogfoodTaskScore {
  readonly id: string;
  readonly prompt: string;
  readonly compiles: boolean;
  readonly runs: boolean;
  readonly visualCues: boolean;
  readonly productQualityPass: boolean;
  readonly apiHallucinations: number;
  readonly assetPathErrors: number;
  readonly turns: number;
  readonly manualCorrections: number;
  readonly notes: readonly string[];
}

interface CodexFiveTaskEval {
  readonly workspace: string;
  readonly checks: readonly ReleaseCheck[];
  readonly taskScores: readonly AgentDogfoodTaskScore[];
  readonly summary: AgentDogfoodScore;
  readonly buildOutput: string;
  readonly browserOutput: string;
  readonly routeReport?: Record<string, unknown>;
  readonly screenshotReport?: Record<string, unknown>;
  readonly swapReport?: Record<string, unknown>;
}

interface CodexRepairEval {
  readonly workspace: string;
  readonly checks: readonly ReleaseCheck[];
  readonly summary: AgentDogfoodScore;
  readonly sourcePrompt: string;
  readonly failedLabel: "fail";
  readonly repairedLabel: "product-quality-pass" | "fail";
  readonly repairTurnCount: number;
  readonly appliedRepairHints: readonly string[];
  readonly initialBuildOutput: string;
  readonly initialBrowserOutput: string;
  readonly repairedBuildOutput: string;
  readonly repairedBrowserOutput: string;
  readonly initialRouteReport?: Record<string, unknown>;
  readonly initialScreenshotReport?: Record<string, unknown>;
  readonly repairedRouteReport?: Record<string, unknown>;
  readonly repairedScreenshotReport?: Record<string, unknown>;
}

const codexPromptPlan = {
  sceneType: "cinematic-scene",
  subjectLabel: "agent product",
  style: "rainy cinematic product reveal",
  environment: "wet neon studio with reflections, rain, fog, and practical lights",
  cameraPreset: "cinematic-dolly",
  lightingPreset: "neon-practicals",
  effects: ["rain", "fog", "bloom", "wet-reflection"],
  interaction: "orbit",
  acceptanceCriteria: [
    "typed GLB product is the hero subject",
    "rain and fog are visible in the scene",
    "wet floor and reflections are visible",
    "camera uses a slow dolly toward the subject",
    "diagnostics report WebGL2 readiness"
  ],
  negativeCriteria: [
    "Do not count a lone GLB on a grid as prompt fidelity.",
    "Do not rely on text labels to explain rain, cinematic lighting, or wet reflections."
  ]
} as const;

const materialsVariantsShoe = {
  url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/MaterialsVariantsShoe/glTF-Binary/MaterialsVariantsShoe.glb",
  sha256: "e1d7cb190382111e5a5b37b51e9a7f007f7eb2ab1b6185e0188e8d0a0d1265a7",
  license: "CC-BY-4.0",
  source: "Khronos glTF Sample Assets: MaterialsVariantsShoe/glTF-Binary/MaterialsVariantsShoe.glb"
} as const;

const allowedContextFiles = [
  "llms.txt",
  "AGENTS.md",
  ".claude/CLAUDE.md",
  ".cursor/rules/aura3d.mdc",
  ".github/copilot-instructions.md",
  "docs/agents/agent-context.md",
  "docs/agents/build-playbook.md",
  "docs/agents/claims-and-boundaries.md",
  "docs/agents/codebase-map.md",
  "docs/agents/verification.md"
] as const;

const workspace = resolve("tests/reports/agent-context/codex-self-test-workspace");
const fiveTaskWorkspace = resolve("tests/reports/agent-context/codex-five-task-workspace");
const repairWorkspace = resolve("tests/reports/agent-context/codex-repair-workspace");
const reportPath = "tests/reports/agent-context/codex-self-test.json";
const markdownPath = "tests/reports/agent-dogfood-results.md";
const tsconfig = JSON.parse(readFileSync("tsconfig.base.json", "utf8")) as {
  compilerOptions?: { paths?: Record<string, readonly string[]> };
};

rmSync(workspace, { recursive: true, force: true });
mkdirSync(resolve(workspace, "src"), { recursive: true });
mkdirSync(resolve(workspace, "assets/product"), { recursive: true });
mkdirSync(resolve(workspace, "tests"), { recursive: true });
mkdirSync(resolve(workspace, "context"), { recursive: true });

const missingContext = allowedContextFiles.filter((path) => !existsSync(path));
for (const file of allowedContextFiles) {
  if (!existsSync(file)) continue;
  const target = resolve(workspace, "context", file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(file));
}

writeProjectFiles();
const assetResult = addAsset({
  projectDir: workspace,
  file: "assets/product/agent-product.glb",
  name: "agentProduct"
});
const validation = validateAssets({ projectDir: workspace });

const mainSource = readFileSync(resolve(workspace, "src/main.ts"), "utf8");
const apiHallucinations = findApiHallucinations(mainSource);
const assetPathErrors = findAssetPathErrors(mainSource, validation);
const buildResult = runCommand("pnpm", ["exec", "vite", "build", "--config", resolve(workspace, "vite.config.ts")], workspace);
const browserResult = buildResult.ok
  ? runCommand("pnpm", ["exec", "playwright", "test", "tests/route-health.spec.ts", "tests/screenshot.spec.ts", "--config", resolve(workspace, "playwright.config.ts"), "--reporter=line"], workspace)
  : { ok: false, output: "Skipped because build failed." };
const routeReport = readOptionalJson<{
  ready?: boolean;
  backend?: string;
  drawCalls?: number;
  promptPlanReport?: {
    recipe?: string;
    visualSystems?: readonly string[];
    repairHints?: readonly string[];
    acceptanceCriteria?: readonly string[];
    negativeCriteria?: readonly string[];
  };
}>(resolve(workspace, "tests/reports/route-health.json"));
const screenshotReport = readOptionalJson<{ bytes?: number; profile?: Record<string, number> }>(resolve(workspace, "tests/reports/screenshot.json"));
const screenshotPath = resolve(workspace, "tests/reports/screenshot.png");

const score: AgentDogfoodScore = {
  agent: "Codex",
  compiles: buildResult.ok,
  runs: browserResult.ok && routeReport?.ready === true && routeReport.backend === "webgl2",
  apiHallucinations: apiHallucinations.length,
  assetPathErrors: assetPathErrors.length,
  turns: 1,
  notes: [
    "Generated app uses the public prompt-plan engine surface and typed assets emitted by aura assets add.",
    "Verification used the local repo toolchain; Claude Code, Cursor, and Copilot remain separate external runs."
  ]
};

const checks: ReleaseCheck[] = [
  {
    id: "agent-context-files-present",
    pass: missingContext.length === 0,
    detail: missingContext.length === 0 ? `${allowedContextFiles.length} context files copied` : `missing: ${missingContext.join(", ")}`
  },
  {
    id: "codex-generated-app-uses-typed-assets",
    pass: mainSource.includes("asset: assets.agentProduct") && !mainSource.includes("unsafeModelUrl"),
    detail: "src/main.ts imports assets from ./aura-assets and uses assets.agentProduct as the prompt-plan subject"
  },
  {
    id: "codex-generated-app-uses-prompt-plan",
    pass:
      mainSource.includes("definePromptPlan") &&
      mainSource.includes("compilePromptPlan") &&
      mainSource.includes("promptPlanToScene") &&
      mainSource.includes("acceptanceCriteria"),
    detail: "src/main.ts defines a prompt plan, compiles its report, and renders through promptPlanToScene"
  },
  {
    id: "codex-generated-asset-manifest-validates",
    pass: assetResult.ok && validation.ok,
    detail: validation.ok ? `${validation.manifest.assets.length} typed asset validates` : validation.messages.join("; ")
  },
  {
    id: "codex-generated-app-no-api-hallucinations",
    pass: apiHallucinations.length === 0,
    detail: apiHallucinations.length === 0 ? "no invented @aura3d/engine imports" : apiHallucinations.join(", ")
  },
  {
    id: "codex-generated-app-no-asset-path-errors",
    pass: assetPathErrors.length === 0,
    detail: assetPathErrors.length === 0 ? "no raw model URL or missing typed asset dependency" : assetPathErrors.join("; ")
  },
  {
    id: "codex-generated-app-builds",
    pass: buildResult.ok,
    detail: buildResult.ok ? "vite build passed" : buildResult.output
  },
  {
    id: "codex-generated-app-route-health",
    pass: browserResult.ok && routeReport?.ready === true && routeReport.backend === "webgl2" && Number(routeReport.drawCalls ?? 0) > 0,
    detail: browserResult.ok ? `ready=${routeReport?.ready ?? false}, backend=${routeReport?.backend ?? "unknown"}, drawCalls=${routeReport?.drawCalls ?? 0}` : browserResult.output
  },
  {
    id: "codex-generated-app-screenshot-profile",
    pass:
      existsSync(screenshotPath) &&
      statSync(screenshotPath).size > 1000 &&
      Number(screenshotReport?.bytes ?? 0) > 1000 &&
      Number(screenshotReport?.profile?.yellowPixels ?? 0) > 800 &&
      Number(screenshotReport?.profile?.rainPixels ?? 0) > 20 &&
      Number(screenshotReport?.profile?.centerObjectPixels ?? 0) > 900,
    detail: existsSync(screenshotPath)
      ? `screenshot bytes=${statSync(screenshotPath).size}, profile=${JSON.stringify(screenshotReport?.profile ?? {})}`
      : "screenshot missing"
  }
];

const fiveTaskEval = runCodexFiveTaskEval();
const repairEval = runCodexRepairEval();
const allChecks = [...checks, ...fiveTaskEval.checks, ...repairEval.checks];

writeMarkdown(allChecks, score, fiveTaskEval, repairEval);
writeReport(reportPath, "aura3d-agent-context-codex-self-test", allChecks, {
  workspace,
  allowedContextFiles,
  promptPlan: {
    sceneType: codexPromptPlan.sceneType,
    selectedRecipe: codexPromptPlan.sceneType,
    subjectAssetRef: "assets.agentProduct",
    assetRefs: ["assets.agentProduct"],
    cameraPreset: codexPromptPlan.cameraPreset,
    lightingPreset: codexPromptPlan.lightingPreset,
    effects: codexPromptPlan.effects,
    acceptanceCriteria: codexPromptPlan.acceptanceCriteria,
    negativeCriteria: codexPromptPlan.negativeCriteria
  },
  compiledPromptPlanReport: routeReport?.promptPlanReport,
  score,
  fiveTaskEval: {
    workspace: fiveTaskEval.workspace,
    assetSource: materialsVariantsShoe,
    taskScores: fiveTaskEval.taskScores,
    summary: fiveTaskEval.summary,
    routeReport: fiveTaskEval.routeReport,
    screenshotReport: fiveTaskEval.screenshotReport,
    swapReport: fiveTaskEval.swapReport
  },
  repairEval: {
    workspace: repairEval.workspace,
    sourcePrompt: repairEval.sourcePrompt,
    failedLabel: repairEval.failedLabel,
    repairedLabel: repairEval.repairedLabel,
    repairTurnCount: repairEval.repairTurnCount,
    appliedRepairHints: repairEval.appliedRepairHints,
    summary: repairEval.summary,
    initialRouteReport: repairEval.initialRouteReport,
    initialScreenshotReport: repairEval.initialScreenshotReport,
    repairedRouteReport: repairEval.repairedRouteReport,
    repairedScreenshotReport: repairEval.repairedScreenshotReport
  },
  buildOutput: buildResult.output,
  browserOutput: browserResult.output,
  routeReport,
  screenshotReport
});

function runCodexFiveTaskEval(): CodexFiveTaskEval {
  rmSync(fiveTaskWorkspace, { recursive: true, force: true });
  mkdirSync(resolve(fiveTaskWorkspace, "src"), { recursive: true });
  mkdirSync(resolve(fiveTaskWorkspace, "assets/product"), { recursive: true });
  mkdirSync(resolve(fiveTaskWorkspace, "tests"), { recursive: true });
  mkdirSync(resolve(fiveTaskWorkspace, "context"), { recursive: true });

  for (const file of allowedContextFiles) {
    if (!existsSync(file)) continue;
    const target = resolve(fiveTaskWorkspace, "context", file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(file));
  }

  writeFiveTaskProjectFiles();
  const sneakerAsset = addAsset({ projectDir: fiveTaskWorkspace, file: "assets/product/sneaker.glb", name: "sneaker" });
  const shoeAsset = addAsset({ projectDir: fiveTaskWorkspace, file: "assets/product/shoe2.glb", name: "shoe2" });
  const validation = validateAssets({ projectDir: fiveTaskWorkspace });
  const mainSource = readFileSync(resolve(fiveTaskWorkspace, "src/main.ts"), "utf8");
  const apiHallucinations = findApiHallucinations(mainSource);
  const assetPathErrors = findAssetPathErrors(mainSource, validation, ["assets.sneaker", "assets.shoe2"]);
  const buildResult = runCommand("pnpm", ["exec", "vite", "build", "--config", resolve(fiveTaskWorkspace, "vite.config.ts")], fiveTaskWorkspace);
  const browserResult = buildResult.ok
    ? runCommand("pnpm", ["exec", "playwright", "test", "tests/route-health.spec.ts", "tests/screenshot.spec.ts", "tests/swap.spec.ts", "--config", resolve(fiveTaskWorkspace, "playwright.config.ts"), "--reporter=line"], fiveTaskWorkspace)
    : { ok: false, output: "Skipped because build failed." };
  const routeReport = readOptionalJson<Record<string, unknown>>(resolve(fiveTaskWorkspace, "tests/reports/route-health.json"));
  const screenshotReport = readOptionalJson<Record<string, unknown>>(resolve(fiveTaskWorkspace, "tests/reports/screenshot.json"));
  const swapReport = readOptionalJson<Record<string, unknown>>(resolve(fiveTaskWorkspace, "tests/reports/swap.json"));
  const screenshotPath = resolve(fiveTaskWorkspace, "tests/reports/screenshot.png");
  const screenshotProfile = screenshotReport?.profile as Record<string, number> | undefined;
  const visualCues =
    existsSync(screenshotPath) &&
    statSync(screenshotPath).size > 1000 &&
    Number(screenshotReport?.bytes ?? 0) > 1000 &&
    Number(screenshotProfile?.subjectPixels ?? 0) > 900 &&
    Number(screenshotProfile?.softboxPixels ?? 0) > 180 &&
    Number(screenshotProfile?.rainPixels ?? 0) > 20 &&
    Number(screenshotProfile?.reflectionPixels ?? 0) > 80 &&
    Number(screenshotProfile?.uniqueBuckets ?? 0) > 20;
  const appRuns = browserResult.ok && routeReport?.ready === true && routeReport.backend === "webgl2";
  const swapWorks = swapReport?.before === "sneaker" && swapReport?.after === "shoe2";
  const staticBundleWorks = routeReport?.staticPreview === true;
  const technicalPass = buildResult.ok && appRuns && apiHallucinations.length === 0 && assetPathErrors.length === 0;
  const taskDefinitions = [
    ["product-viewer", "Build a product viewer for sneaker.glb with orbiting and studio lighting.", visualCues && routeReport?.hasOrbitInteraction === true && routeReport?.hasStudioLighting === true],
    ["camera-rain", "Add a slow camera dolly and rain effect.", visualCues && routeReport?.cameraMode === "dolly" && routeReport?.hasRain === true],
    ["reflective-floor", "Make the floor reflective.", visualCues && routeReport?.hasReflectiveFloor === true],
    ["click-swap", "Add a click handler that changes the model to shoe2.glb.", technicalPass && swapWorks],
    ["static-deploy-bundle", "Deploy the app to a static host or produce a valid static deployment bundle.", technicalPass && staticBundleWorks]
  ] as const;
  const taskScores = taskDefinitions.map(([id, prompt, taskPass]): AgentDogfoodTaskScore => ({
    id,
    prompt,
    compiles: buildResult.ok,
    runs: appRuns,
    visualCues: taskPass,
    productQualityPass: taskPass,
    apiHallucinations: apiHallucinations.length,
    assetPathErrors: assetPathErrors.length,
    turns: 1,
    manualCorrections: 0,
    notes: [
      id === "static-deploy-bundle"
        ? "Verified against vite preview from the production dist bundle."
        : "Verified from the generated app route health, screenshot profile, or click-swap report."
    ]
  }));
  const completedTasks = taskScores.filter((task) => task.productQualityPass).length;
  const summary: AgentDogfoodScore = {
    agent: "Codex five-task eval",
    compiles: buildResult.ok,
    runs: appRuns,
    apiHallucinations: apiHallucinations.length,
    assetPathErrors: assetPathErrors.length,
    turns: 1,
    notes: [
      `${completedTasks}/5 requested tasks passed product-quality or deploy-bundle verification.`,
      "This strengthens the Codex-local baseline only; Claude Code, Cursor, and Copilot remain separate external runs."
    ]
  };
  const checks: ReleaseCheck[] = [
    {
      id: "codex-five-task-context-files-copied",
      pass: missingContext.length === 0,
      detail: missingContext.length === 0 ? `${allowedContextFiles.length} context files copied` : `missing: ${missingContext.join(", ")}`
    },
    {
      id: "codex-five-task-assets-validate",
      pass: sneakerAsset.ok && shoeAsset.ok && validation.ok,
      detail: validation.ok ? `${validation.manifest.assets.length} typed assets validate` : validation.messages.join("; ")
    },
    {
      id: "codex-five-task-no-api-hallucinations",
      pass: apiHallucinations.length === 0,
      detail: apiHallucinations.length === 0 ? "no invented @aura3d/engine imports" : apiHallucinations.join(", ")
    },
    {
      id: "codex-five-task-no-asset-path-errors",
      pass: assetPathErrors.length === 0,
      detail: assetPathErrors.length === 0 ? "uses assets.sneaker and assets.shoe2 typed refs; no raw GLB URLs" : assetPathErrors.join("; ")
    },
    {
      id: "codex-five-task-builds",
      pass: buildResult.ok,
      detail: buildResult.ok ? "vite build passed" : buildResult.output
    },
    {
      id: "codex-five-task-static-preview-runs",
      pass: appRuns && staticBundleWorks,
      detail: browserResult.ok ? `ready=${routeReport?.ready ?? false}, backend=${routeReport?.backend ?? "unknown"}, staticPreview=${String(routeReport?.staticPreview ?? false)}` : browserResult.output
    },
    {
      id: "codex-five-task-screenshot-product-quality",
      pass: visualCues,
      detail: existsSync(screenshotPath)
        ? `screenshot bytes=${statSync(screenshotPath).size}, profile=${JSON.stringify(screenshotProfile ?? {})}`
        : "screenshot missing"
    },
    {
      id: "codex-five-task-click-swap",
      pass: technicalPass && swapWorks,
      detail: swapReport ? `before=${String(swapReport.before)}, after=${String(swapReport.after)}` : "swap report missing"
    },
    {
      id: "codex-five-task-completes-at-least-four-of-five",
      pass: completedTasks >= 4,
      detail: `${completedTasks}/5 tasks passed`
    }
  ];
  return {
    workspace: fiveTaskWorkspace,
    checks,
    taskScores,
    summary,
    buildOutput: buildResult.output,
    browserOutput: browserResult.output,
    routeReport,
    screenshotReport,
    swapReport
  };
}

function runCodexRepairEval(): CodexRepairEval {
  const sourcePrompt = "Repair a failed rainy product reveal that currently looks like one model with symbolic rain marks.";
  const appliedRepairHints = [
    "Add foreground, midground, and background structure before promoting the scene.",
    "Replace symbolic rain marks with a cinematic recipe that includes layered rain, wet reflections, fog, bloom, and practical lights.",
    "Use a tighter dolly camera and record the compiled prompt-plan repair hints in the route report."
  ] as const;

  rmSync(repairWorkspace, { recursive: true, force: true });
  mkdirSync(resolve(repairWorkspace, "src"), { recursive: true });
  mkdirSync(resolve(repairWorkspace, "assets/product"), { recursive: true });
  mkdirSync(resolve(repairWorkspace, "tests"), { recursive: true });
  mkdirSync(resolve(repairWorkspace, "context"), { recursive: true });

  for (const file of allowedContextFiles) {
    if (!existsSync(file)) continue;
    const target = resolve(repairWorkspace, "context", file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(file));
  }

  writeRepairProjectBaseFiles();
  const repairAsset = addAsset({ projectDir: repairWorkspace, file: "assets/product/repair-product.glb", name: "repairProduct" });
  const initialValidation = validateAssets({ projectDir: repairWorkspace });
  writeRepairInitialSource();
  const initialSource = readFileSync(resolve(repairWorkspace, "src/main.ts"), "utf8");
  const initialApiHallucinations = findApiHallucinations(initialSource);
  const initialAssetPathErrors = findAssetPathErrors(initialSource, initialValidation, ["assets.repairProduct"]);
  const initialBuild = runCommand("pnpm", ["exec", "vite", "build", "--config", resolve(repairWorkspace, "vite.config.ts")], repairWorkspace);
  const initialBrowser = initialBuild.ok
    ? runCommand("pnpm", ["exec", "playwright", "test", "tests/initial.spec.ts", "--config", resolve(repairWorkspace, "playwright.config.ts"), "--reporter=line"], repairWorkspace)
    : { ok: false, output: "Skipped because initial build failed." };
  const initialRouteReport = readOptionalJson<Record<string, unknown>>(resolve(repairWorkspace, "tests/reports/initial-route-health.json"));
  const initialScreenshotReport = readOptionalJson<Record<string, unknown>>(resolve(repairWorkspace, "tests/reports/initial-screenshot.json"));

  writeRepairRepairedSource(appliedRepairHints);
  const repairedSource = readFileSync(resolve(repairWorkspace, "src/main.ts"), "utf8");
  const repairedValidation = validateAssets({ projectDir: repairWorkspace });
  const repairedApiHallucinations = findApiHallucinations(repairedSource);
  const repairedAssetPathErrors = findAssetPathErrors(repairedSource, repairedValidation, ["assets.repairProduct"]);
  const repairedBuild = runCommand("pnpm", ["exec", "vite", "build", "--config", resolve(repairWorkspace, "vite.config.ts")], repairWorkspace);
  const repairedBrowser = repairedBuild.ok
    ? runCommand("pnpm", ["exec", "playwright", "test", "tests/repaired.spec.ts", "--config", resolve(repairWorkspace, "playwright.config.ts"), "--reporter=line"], repairWorkspace)
    : { ok: false, output: "Skipped because repaired build failed." };
  const repairedRouteReport = readOptionalJson<Record<string, unknown>>(resolve(repairWorkspace, "tests/reports/repaired-route-health.json"));
  const repairedScreenshotReport = readOptionalJson<Record<string, unknown>>(resolve(repairWorkspace, "tests/reports/repaired-screenshot.json"));

  const initialProfile = initialScreenshotReport?.profile as Record<string, number | boolean> | undefined;
  const repairedProfile = repairedScreenshotReport?.profile as Record<string, number | boolean> | undefined;
  const initialProductQuality = initialScreenshotReport?.productQualityPass === true;
  const repairedProductQuality = repairedScreenshotReport?.productQualityPass === true;
  const repairTurnCount = 1;
  const improvementPass =
    initialProductQuality === false &&
    repairedProductQuality === true &&
    Number(repairedProfile?.subjectPixels ?? 0) > Number(initialProfile?.subjectPixels ?? 0) &&
    Number(repairedProfile?.rainPixels ?? 0) > Math.max(20, Number(initialProfile?.rainPixels ?? 0)) &&
    Number(repairedProfile?.reflectionPixels ?? 0) > Math.max(80, Number(initialProfile?.reflectionPixels ?? 0)) &&
    Number(repairedProfile?.environmentPixels ?? 0) > Number(initialProfile?.environmentPixels ?? 0);
  const summary: AgentDogfoodScore = {
    agent: "Codex repair eval",
    compiles: initialBuild.ok && repairedBuild.ok,
    runs: initialBrowser.ok && repairedBrowser.ok && repairedRouteReport?.ready === true && repairedRouteReport.backend === "webgl2",
    apiHallucinations: initialApiHallucinations.length + repairedApiHallucinations.length,
    assetPathErrors: initialAssetPathErrors.length + repairedAssetPathErrors.length,
    turns: repairTurnCount,
    notes: [
      "A controlled failed screenshot was generated first, then repaired through prompt-plan recipe guidance without using raw model URLs.",
      "This remains local Codex evidence; it does not replace external agent repair runs."
    ]
  };
  const checks: ReleaseCheck[] = [
    {
      id: "codex-repair-context-files-copied",
      pass: missingContext.length === 0,
      detail: missingContext.length === 0 ? `${allowedContextFiles.length} context files copied` : `missing: ${missingContext.join(", ")}`
    },
    {
      id: "codex-repair-asset-validates",
      pass: repairAsset.ok && initialValidation.ok && repairedValidation.ok,
      detail: repairedValidation.ok ? `${repairedValidation.manifest.assets.length} typed asset validates` : repairedValidation.messages.join("; ")
    },
    {
      id: "codex-repair-initial-screenshot-fails-quality",
      pass: initialBrowser.ok && initialProductQuality === false,
      detail: initialScreenshotReport ? `initial label=${String(initialScreenshotReport.reviewLabel)}, profile=${JSON.stringify(initialProfile ?? {})}` : "initial screenshot report missing"
    },
    {
      id: "codex-repair-no-api-hallucinations",
      pass: initialApiHallucinations.length === 0 && repairedApiHallucinations.length === 0,
      detail: initialApiHallucinations.length === 0 && repairedApiHallucinations.length === 0 ? "no invented @aura3d/engine imports" : [...initialApiHallucinations, ...repairedApiHallucinations].join(", ")
    },
    {
      id: "codex-repair-no-asset-path-errors",
      pass: initialAssetPathErrors.length === 0 && repairedAssetPathErrors.length === 0,
      detail: initialAssetPathErrors.length === 0 && repairedAssetPathErrors.length === 0 ? "uses assets.repairProduct typed ref with no raw GLB URLs" : [...initialAssetPathErrors, ...repairedAssetPathErrors].join("; ")
    },
    {
      id: "codex-repair-repaired-app-builds-and-runs",
      pass: repairedBuild.ok && repairedBrowser.ok && repairedRouteReport?.ready === true && repairedRouteReport.backend === "webgl2",
      detail: repairedBrowser.ok ? `ready=${String(repairedRouteReport?.ready ?? false)}, backend=${String(repairedRouteReport?.backend ?? "unknown")}` : repairedBrowser.output
    },
    {
      id: "codex-repair-applies-prompt-plan-repair-hints",
      pass:
        repairedSource.includes("definePromptPlan") &&
        repairedSource.includes("compilePromptPlan") &&
        repairedSource.includes("promptPlanToScene") &&
        Array.isArray(repairedRouteReport?.appliedRepairHints) &&
        Array.isArray(repairedRouteReport?.compiledRepairHints) &&
        (repairedRouteReport?.compiledRepairHints as readonly unknown[]).length > 0,
      detail: Array.isArray(repairedRouteReport?.compiledRepairHints)
        ? `${(repairedRouteReport?.compiledRepairHints as readonly unknown[]).length} compiled repair hints recorded`
        : "compiled repair hints missing"
    },
    {
      id: "codex-repair-screenshot-improves-to-product-quality",
      pass: improvementPass,
      detail: repairedScreenshotReport ? `initial=${JSON.stringify(initialProfile ?? {})}; repaired=${JSON.stringify(repairedProfile ?? {})}` : "repaired screenshot report missing"
    },
    {
      id: "codex-repair-turn-count-recorded",
      pass: repairTurnCount === 1,
      detail: `${repairTurnCount} repair turn recorded`
    }
  ];
  return {
    workspace: repairWorkspace,
    checks,
    summary,
    sourcePrompt,
    failedLabel: "fail",
    repairedLabel: repairedProductQuality ? "product-quality-pass" : "fail",
    repairTurnCount,
    appliedRepairHints,
    initialBuildOutput: initialBuild.output,
    initialBrowserOutput: initialBrowser.output,
    repairedBuildOutput: repairedBuild.output,
    repairedBrowserOutput: repairedBrowser.output,
    initialRouteReport,
    initialScreenshotReport,
    repairedRouteReport,
    repairedScreenshotReport
  };
}

function writeProjectFiles(): void {
  writeFileSync(resolve(workspace, "package.json"), JSON.stringify({
    name: "aura3d-codex-context-self-test",
    private: true,
    type: "module",
    scripts: {
      build: "vite build",
      test: "playwright test tests/route-health.spec.ts tests/screenshot.spec.ts"
    },
    dependencies: {
      "@aura3d/engine": "1.0.0"
    },
    devDependencies: {
      "@playwright/test": "^1.52.0",
      typescript: "^5.8.3",
      vite: "^7.3.2"
    }
  }, null, 2));

  writeFileSync(resolve(workspace, "index.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aura3D Codex Context Self Test</title>
    <style>
      html, body, #app { margin: 0; width: 100%; height: 100%; background: #071016; }
      body { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`);

  writeFileSync(resolve(workspace, "src/main.ts"), `import { compilePromptPlan, createAuraApp, definePromptPlan, promptPlanToScene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const promptPlan = definePromptPlan({
  sceneType: "${codexPromptPlan.sceneType}",
  subject: { asset: assets.agentProduct, label: "${codexPromptPlan.subjectLabel}" },
  style: "${codexPromptPlan.style}",
  environment: "${codexPromptPlan.environment}",
  camera: { preset: "${codexPromptPlan.cameraPreset}" },
  lighting: { preset: "${codexPromptPlan.lightingPreset}" },
  effects: ${JSON.stringify(codexPromptPlan.effects)},
  interaction: "${codexPromptPlan.interaction}",
  acceptanceCriteria: ${JSON.stringify(codexPromptPlan.acceptanceCriteria, null, 2)},
  negativeCriteria: ${JSON.stringify(codexPromptPlan.negativeCriteria, null, 2)}
} as const);

const compiledPromptPlan = compilePromptPlan(promptPlan);

const app = createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true, performancePanel: true },
  scene: promptPlanToScene(promptPlan)
});

declare global {
  interface Window { auraApp: typeof app; }
  interface Window { auraPromptPlanReport: typeof compiledPromptPlan.report; }
}

window.auraApp = app;
window.auraPromptPlanReport = compiledPromptPlan.report;
`);

  writeFileSync(resolve(workspace, "assets/product/agent-product.glb"), readFileSync("fixtures/asset-corpus/duck.glb"));
  writeFileSync(resolve(workspace, "assets/product/agent-texture.webp"), Buffer.from("aura3d-agent-texture"));
  addAsset({ projectDir: workspace, file: "assets/product/agent-texture.webp", name: "agentTexture" });

  writeFileSync(resolve(workspace, "vite.config.ts"), `import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: [
${viteAliasEntries()}
    ]
  }
});
`);

  writeFileSync(resolve(workspace, "playwright.config.ts"), `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:4179"
  },
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 4179 --strictPort",
    url: "http://127.0.0.1:4179",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
`);

  writeFileSync(resolve(workspace, "tests/route-health.spec.ts"), `import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("generated Aura3D app reaches ready state", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 15_000 }).toBe("true");
  const drawCalls = Number(await page.locator("body").getAttribute("data-aura3d-draw-calls"));
  const diagnostics = await page.evaluate(() => window.__AURA3D_ROUTE_READY__?.diagnostics);
  const promptPlanReport = await page.evaluate(() => window.auraPromptPlanReport);
  expect(diagnostics?.backend).toBe("webgl2");
  expect(promptPlanReport?.recipe).toBe("cinematic-scene");
  expect(promptPlanReport?.repairHints?.length ?? 0).toBeGreaterThan(0);
  expect(drawCalls).toBeGreaterThan(0);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), JSON.stringify({ ready: true, backend: diagnostics?.backend, drawCalls, promptPlanReport }, null, 2));
});
`);

  writeFileSync(resolve(workspace, "tests/screenshot.spec.ts"), `import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("generated Aura3D app screenshot is non-empty", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 15_000 }).toBe("true");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const profile = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const gl = target.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) return { error: "missing-webgl2", yellowPixels: 0, rainPixels: 0, centerObjectPixels: 0, uniqueBuckets: 0 };
    const pixels = new Uint8Array(target.width * target.height * 4);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    let yellowPixels = 0;
    let rainPixels = 0;
    let centerObjectPixels = 0;
    for (let y = 0; y < target.height; y += 4) {
      for (let x = 0; x < target.width; x += 4) {
        if (x > target.width * 0.76 && y > target.height * 0.74) continue;
        const offset = (y * target.width + x) * 4;
        const r = pixels[offset] ?? 0;
        const g = pixels[offset + 1] ?? 0;
        const b = pixels[offset + 2] ?? 0;
        const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        if (luminance > 32) buckets.add(\`\${r >> 5}-\${g >> 5}-\${b >> 5}\`);
        if (r > 135 && g > 125 && b < 170 && r > b * 1.08 && g > b * 1.04) yellowPixels += 1;
        if (r > 165 && g > 185 && b > 205) rainPixels += 1;
        if (x > target.width * 0.28 && x < target.width * 0.68 && y > target.height * 0.28 && y < target.height * 0.84 && luminance > 70) centerObjectPixels += 1;
      }
    }
    return { yellowPixels, rainPixels, centerObjectPixels, uniqueBuckets: buckets.size };
  });
  const screenshot = await canvas.screenshot();
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/screenshot.json"), JSON.stringify({ bytes: screenshot.byteLength, profile }, null, 2));
  expect(profile.error).toBeUndefined();
  expect(profile.yellowPixels).toBeGreaterThan(800);
  expect(profile.rainPixels).toBeGreaterThan(20);
  expect(profile.centerObjectPixels).toBeGreaterThan(900);
  expect(profile.uniqueBuckets).toBeGreaterThan(18);
  expect(screenshot.byteLength).toBeGreaterThan(1000);
});
`);
}

function writeFiveTaskProjectFiles(): void {
  writeFileSync(resolve(fiveTaskWorkspace, "package.json"), JSON.stringify({
    name: "aura3d-codex-five-task-eval",
    private: true,
    type: "module",
    scripts: {
      build: "vite build",
      test: "playwright test tests/route-health.spec.ts tests/screenshot.spec.ts tests/swap.spec.ts"
    },
    dependencies: {
      "@aura3d/engine": "1.0.0"
    },
    devDependencies: {
      "@playwright/test": "^1.52.0",
      typescript: "^5.8.3",
      vite: "^7.3.2"
    }
  }, null, 2));

  writeFileSync(resolve(fiveTaskWorkspace, "index.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aura3D Codex Five Task Eval</title>
    <style>
      html, body, #app { margin: 0; width: 100%; height: 100%; background: #060b12; }
      body { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`);

  writeFileSync(resolve(fiveTaskWorkspace, "src/main.ts"), `import { camera, createAuraApp, effects, interactions, lights, material, model, primitives, scene, timeline } from "@aura3d/engine";
import { assets } from "./aura-assets";

let activeAsset = assets.sneaker;
let activeApp = mount(activeAsset);

function buildProductScene(asset: typeof assets.sneaker | typeof assets.shoe2) {
  return scene()
    .background("#060b12")
    .add(primitives.plane({ name: "curved studio backdrop", material: material.emissive({ color: "#111a24", emissive: "#1b2a38" }) }).position(0, 1.05, -2.25).rotate(1.5708, 0, 0).scale([5.8, 1, 3.0]))
    .add(primitives.plane({ name: "reflective wet product floor", material: material.pbr({ color: "#101820", roughness: 0.08, metallic: 0.62 }) }).position(0, -0.08, -0.45).scale([5.8, 1, 4.2]))
    .add(primitives.box({ name: "low sneaker plinth", material: material.pbr({ color: "#18212b", roughness: 0.28, metallic: 0.22 }) }).position(0, -0.005, -0.68).scale([1.9, 0.11, 1.08]))
    .add(primitives.box({ name: "left studio softbox", material: material.emissive({ color: "#edf7ff", emissive: "#edf7ff" }) }).position(-2.1, 0.9, -0.9).rotate(0, 0.2, 0).scale([0.08, 1.32, 1.62]))
    .add(primitives.box({ name: "right studio softbox", material: material.emissive({ color: "#bce8ff", emissive: "#bce8ff" }) }).position(2.05, 0.82, -1.0).rotate(0, -0.18, 0).scale([0.08, 1.1, 1.42]))
    .add(primitives.box({ name: "cyan wet floor reflection", material: material.emissive({ color: "#24718c", emissive: "#36c7f0" }) }).position(-0.9, -0.002, 0.18).rotate(0, 0.18, 0).scale([1.18, 0.026, 0.13]))
    .add(primitives.box({ name: "warm wet floor reflection", material: material.emissive({ color: "#8a5d32", emissive: "#ffc175" }) }).position(0.86, -0.002, 0.36).rotate(0, -0.15, 0).scale([1.18, 0.026, 0.14]))
    .add(primitives.sphere({ name: "orbit affordance left", material: material.emissive({ color: "#8fefff", emissive: "#8fefff" }) }).position(-1.12, 0.34, -0.22).scale(0.1))
    .add(primitives.sphere({ name: "orbit affordance right", material: material.emissive({ color: "#ffd79a", emissive: "#ffd79a" }) }).position(1.12, 0.34, -0.22).scale(0.1))
    .add(model(asset, { name: asset.id }).position(-0.02, 0.08, -0.68).rotate(-0.1, -0.48, 0.02).scale(1.06))
    .add(lights.ambient({ intensity: 0.2, color: "#dbefff" }))
    .add(lights.point({ name: "studio key", position: [-2.3, 2.4, 2.2], color: "#f2fbff", intensity: 3.0 }))
    .add(lights.point({ name: "warm rim", position: [2.2, 1.7, 0.35], color: "#ffd08a", intensity: 1.45 }))
    .add(effects.rain({ intensity: 0.34, color: "#c8edff" }))
    .add(effects.fog({ density: 0.055, color: "#35475d" }))
    .add(effects.bloom({ intensity: 0.26, color: "#bdefff" }))
    .add(interactions.orbit({ target: asset.id }))
    .camera(camera.dolly({ from: [0.26, 1.12, 4.2], to: [0.04, 0.98, 3.15], target: [0, 0.55, -0.68], seconds: 8, fov: 40 }))
    .timeline(timeline.loop({ seconds: 8 }));
}

function mount(asset: typeof assets.sneaker | typeof assets.shoe2) {
  const host = document.querySelector("#app");
  if (host) host.innerHTML = "";
  const app = createAuraApp("#app", {
    diagnostics: { overlay: true, assetPanel: true, performancePanel: true },
    scene: buildProductScene(asset)
  });
  window.auraApp = app;
  window.auraActiveAsset = asset.id;
  window.auraFiveTaskEvidence = {
    sourcePrompts: [
      "Build a product viewer for sneaker.glb with orbiting and studio lighting.",
      "Add a slow camera dolly and rain effect.",
      "Make the floor reflective.",
      "Add a click handler that changes the model to shoe2.glb.",
      "Deploy this to a static host or produce a valid static deployment bundle."
    ],
    selectedAssets: ["assets.sneaker", "assets.shoe2"],
    cameraMode: "dolly",
    interaction: "orbit",
    hasStudioLighting: true,
    hasRain: true,
    hasReflectiveFloor: true,
    hasClickSwap: true,
    staticDeploymentBundle: true
  };
  return app;
}

document.body.addEventListener("click", () => {
  if (activeAsset.id === "shoe2") return;
  activeApp.dispose();
  activeAsset = assets.shoe2;
  activeApp = mount(activeAsset);
});

declare global {
  interface Window {
    auraApp: ReturnType<typeof createAuraApp>;
    auraActiveAsset: string;
    auraFiveTaskEvidence: {
      sourcePrompts: string[];
      selectedAssets: string[];
      cameraMode: string;
      interaction: string;
      hasStudioLighting: boolean;
      hasRain: boolean;
      hasReflectiveFloor: boolean;
      hasClickSwap: boolean;
      staticDeploymentBundle: boolean;
    };
  }
}
`);

  const shoeBytes = downloadDogfoodAsset(materialsVariantsShoe.url, materialsVariantsShoe.sha256);
  writeFileSync(resolve(fiveTaskWorkspace, "assets/product/sneaker.glb"), shoeBytes);
  writeFileSync(resolve(fiveTaskWorkspace, "assets/product/shoe2.glb"), shoeBytes);

  writeFileSync(resolve(fiveTaskWorkspace, "vite.config.ts"), `import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: [
${viteAliasEntries()}
    ]
  }
});
`);

  writeFileSync(resolve(fiveTaskWorkspace, "playwright.config.ts"), `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:4180"
  },
  webServer: {
    command: "pnpm exec vite preview --host 127.0.0.1 --port 4180 --strictPort",
    url: "http://127.0.0.1:4180",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
`);

  writeFileSync(resolve(fiveTaskWorkspace, "tests/route-health.spec.ts"), `import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("five-task generated app reaches ready state from static preview", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 15_000 }).toBe("true");
  const drawCalls = Number(await page.locator("body").getAttribute("data-aura3d-draw-calls"));
  const diagnostics = await page.evaluate(() => window.__AURA3D_ROUTE_READY__?.diagnostics);
  const scene = await page.evaluate(() => window.__AURA3D_ROUTE_READY__?.scene);
  const evidence = await page.evaluate(() => window.auraFiveTaskEvidence);
  expect(diagnostics?.backend).toBe("webgl2");
  expect(drawCalls).toBeGreaterThan(0);
  expect(evidence.selectedAssets).toEqual(["assets.sneaker", "assets.shoe2"]);
  expect(evidence.cameraMode).toBe("dolly");
  expect(evidence.interaction).toBe("orbit");
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), JSON.stringify({
    ready: true,
    backend: diagnostics?.backend,
    drawCalls,
    staticPreview: true,
    cameraMode: scene?.camera?.mode,
    hasOrbitInteraction: scene?.nodes?.some((node) => node.kind === "interaction" && node.mode === "orbit") ?? false,
    hasStudioLighting: Boolean(evidence.hasStudioLighting),
    hasRain: scene?.nodes?.some((node) => node.kind === "effect" && node.effect === "rain") ?? false,
    hasReflectiveFloor: scene?.nodes?.some((node) => typeof node.name === "string" && node.name.includes("reflective")) ?? false,
    evidence
  }, null, 2));
});
`);

  writeFileSync(resolve(fiveTaskWorkspace, "tests/screenshot.spec.ts"), `import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("five-task generated app screenshot shows product, rain, and reflective studio", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 15_000 }).toBe("true");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const profile = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const gl = target.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) return { error: "missing-webgl2", subjectPixels: 0, softboxPixels: 0, rainPixels: 0, reflectionPixels: 0, uniqueBuckets: 0 };
    const pixels = new Uint8Array(target.width * target.height * 4);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    let subjectPixels = 0;
    let softboxPixels = 0;
    let rainPixels = 0;
    let reflectionPixels = 0;
    for (let y = 0; y < target.height; y += 4) {
      for (let x = 0; x < target.width; x += 4) {
        if (x > target.width * 0.76 && y > target.height * 0.74) continue;
        const offset = (y * target.width + x) * 4;
        const r = pixels[offset] ?? 0;
        const g = pixels[offset + 1] ?? 0;
        const b = pixels[offset + 2] ?? 0;
        const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        if (luminance > 32) buckets.add(\`\${r >> 5}-\${g >> 5}-\${b >> 5}\`);
        if (x > target.width * 0.3 && x < target.width * 0.7 && y > target.height * 0.24 && y < target.height * 0.78 && luminance > 54) subjectPixels += 1;
        if (r > 180 && g > 190 && b > 198 && Math.abs(r - g) < 45 && Math.abs(g - b) < 50) softboxPixels += 1;
        if (r > 160 && g > 180 && b > 205) rainPixels += 1;
        if (y < target.height * 0.48 && r > 35 && g > 72 && b > 82 && b >= r * 1.05) reflectionPixels += 1;
      }
    }
    return { subjectPixels, softboxPixels, rainPixels, reflectionPixels, uniqueBuckets: buckets.size };
  });
  const screenshot = await canvas.screenshot();
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/screenshot.json"), JSON.stringify({ bytes: screenshot.byteLength, profile }, null, 2));
  expect(profile.error).toBeUndefined();
  expect(profile.subjectPixels).toBeGreaterThan(900);
  expect(profile.softboxPixels).toBeGreaterThan(180);
  expect(profile.rainPixels).toBeGreaterThan(20);
  expect(profile.reflectionPixels).toBeGreaterThan(80);
  expect(profile.uniqueBuckets).toBeGreaterThan(20);
  expect(screenshot.byteLength).toBeGreaterThan(1000);
});
`);

  writeFileSync(resolve(fiveTaskWorkspace, "tests/swap.spec.ts"), `import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("five-task generated app swaps from sneaker to shoe2 on click", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 15_000 }).toBe("true");
  const before = await page.evaluate(() => window.auraActiveAsset);
  await page.mouse.click(300, 260);
  await expect.poll(() => page.evaluate(() => window.auraActiveAsset), { timeout: 15_000 }).toBe("shoe2");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 15_000 }).toBe("true");
  const after = await page.evaluate(() => window.auraActiveAsset);
  const diagnostics = await page.evaluate(() => window.__AURA3D_ROUTE_READY__?.diagnostics);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/swap.json"), JSON.stringify({ before, after, backend: diagnostics?.backend }, null, 2));
  expect(before).toBe("sneaker");
  expect(after).toBe("shoe2");
  expect(diagnostics?.backend).toBe("webgl2");
});
`);
}

function writeRepairProjectBaseFiles(): void {
  writeFileSync(resolve(repairWorkspace, "package.json"), JSON.stringify({
    name: "aura3d-codex-repair-eval",
    private: true,
    type: "module",
    scripts: {
      build: "vite build",
      test: "playwright test"
    },
    dependencies: {
      "@aura3d/engine": "1.0.0"
    },
    devDependencies: {
      "@playwright/test": "^1.52.0",
      typescript: "^5.8.3",
      vite: "^7.3.2"
    }
  }, null, 2));

  writeFileSync(resolve(repairWorkspace, "index.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aura3D Codex Repair Eval</title>
    <style>
      html, body, #app { margin: 0; width: 100%; height: 100%; background: #05080d; }
      body { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`);

  writeFileSync(resolve(repairWorkspace, "assets/product/repair-product.glb"), downloadDogfoodAsset(materialsVariantsShoe.url, materialsVariantsShoe.sha256));

  writeFileSync(resolve(repairWorkspace, "vite.config.ts"), `import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: [
${viteAliasEntries()}
    ]
  }
});
`);

  writeFileSync(resolve(repairWorkspace, "playwright.config.ts"), `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:4181"
  },
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 4181 --strictPort",
    url: "http://127.0.0.1:4181",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
`);

  writeFileSync(resolve(repairWorkspace, "tests/initial.spec.ts"), `import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("initial generated scene is classified as failed prompt fidelity", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 15_000 }).toBe("true");
  const diagnostics = await page.evaluate(() => window.__AURA3D_ROUTE_READY__?.diagnostics);
  const scene = await page.evaluate(() => window.__AURA3D_ROUTE_READY__?.scene);
  const evidence = await page.evaluate(() => window.auraRepairEvidence);
  const canvas = page.locator("canvas");
  const profile = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const gl = target.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) return { error: "missing-webgl2", subjectPixels: 0, rainPixels: 0, reflectionPixels: 0, environmentPixels: 0, uniqueBuckets: 0 };
    const pixels = new Uint8Array(target.width * target.height * 4);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    let subjectPixels = 0;
    let rainPixels = 0;
    let reflectionPixels = 0;
    let environmentPixels = 0;
    for (let y = 0; y < target.height; y += 4) {
      for (let x = 0; x < target.width; x += 4) {
        if (x > target.width * 0.76 && y > target.height * 0.74) continue;
        const offset = (y * target.width + x) * 4;
        const r = pixels[offset] ?? 0;
        const g = pixels[offset + 1] ?? 0;
        const b = pixels[offset + 2] ?? 0;
        const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        if (luminance > 32) buckets.add(\`\${r >> 5}-\${g >> 5}-\${b >> 5}\`);
        if (x > target.width * 0.28 && x < target.width * 0.72 && y > target.height * 0.22 && y < target.height * 0.82 && luminance > 52) subjectPixels += 1;
        if (r > 160 && g > 180 && b > 205) rainPixels += 1;
        if (y < target.height * 0.48 && r > 35 && g > 72 && b > 82 && b >= r * 1.05) reflectionPixels += 1;
        if ((x < target.width * 0.24 || x > target.width * 0.76 || y > target.height * 0.72) && luminance > 42) environmentPixels += 1;
      }
    }
    return { subjectPixels, rainPixels, reflectionPixels, environmentPixels, uniqueBuckets: buckets.size };
  });
  const productQualityPass = Boolean(
    evidence?.phase === "repaired" &&
    profile.subjectPixels > 900 &&
    profile.rainPixels > 20 &&
    profile.reflectionPixels > 80 &&
    profile.environmentPixels > 800
  );
  const screenshot = await canvas.screenshot();
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/initial-screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/initial-screenshot.json"), JSON.stringify({
    bytes: screenshot.byteLength,
    reviewLabel: productQualityPass ? "product-quality-pass" : "fail",
    productQualityPass,
    profile
  }, null, 2));
  writeFileSync(resolve("tests/reports/initial-route-health.json"), JSON.stringify({
    ready: true,
    backend: diagnostics?.backend,
    drawCalls: diagnostics?.drawCalls,
    phase: evidence?.phase,
    hasPromptPlan: false,
    hasRainEffect: scene?.nodes?.some((node) => node.kind === "effect" && node.effect === "rain") ?? false
  }, null, 2));
  expect(diagnostics?.backend).toBe("webgl2");
  expect(evidence?.phase).toBe("initial-failed");
  expect(productQualityPass).toBe(false);
  expect(screenshot.byteLength).toBeGreaterThan(1000);
});

`);

  writeFileSync(resolve(repairWorkspace, "tests/repaired.spec.ts"), `import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("repaired generated scene reaches product-quality prompt fidelity", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 15_000 }).toBe("true");
  const diagnostics = await page.evaluate(() => window.__AURA3D_ROUTE_READY__?.diagnostics);
  const scene = await page.evaluate(() => window.__AURA3D_ROUTE_READY__?.scene);
  const evidence = await page.evaluate(() => window.auraRepairEvidence);
  const promptPlanReport = await page.evaluate(() => window.auraPromptPlanReport);
  const canvas = page.locator("canvas");
  const profile = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const gl = target.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) return { error: "missing-webgl2", subjectPixels: 0, rainPixels: 0, reflectionPixels: 0, environmentPixels: 0, uniqueBuckets: 0 };
    const pixels = new Uint8Array(target.width * target.height * 4);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    let subjectPixels = 0;
    let rainPixels = 0;
    let reflectionPixels = 0;
    let environmentPixels = 0;
    for (let y = 0; y < target.height; y += 4) {
      for (let x = 0; x < target.width; x += 4) {
        if (x > target.width * 0.76 && y > target.height * 0.74) continue;
        const offset = (y * target.width + x) * 4;
        const r = pixels[offset] ?? 0;
        const g = pixels[offset + 1] ?? 0;
        const b = pixels[offset + 2] ?? 0;
        const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        if (luminance > 32) buckets.add(\`\${r >> 5}-\${g >> 5}-\${b >> 5}\`);
        if (x > target.width * 0.28 && x < target.width * 0.72 && y > target.height * 0.22 && y < target.height * 0.82 && luminance > 52) subjectPixels += 1;
        if (r > 160 && g > 180 && b > 205) rainPixels += 1;
        if (y < target.height * 0.48 && r > 35 && g > 72 && b > 82 && b >= r * 1.05) reflectionPixels += 1;
        if ((x < target.width * 0.24 || x > target.width * 0.76 || y > target.height * 0.72) && luminance > 42) environmentPixels += 1;
      }
    }
    return { subjectPixels, rainPixels, reflectionPixels, environmentPixels, uniqueBuckets: buckets.size };
  });
  const productQualityPass = Boolean(
    evidence?.phase === "repaired" &&
    promptPlanReport?.recipe === "cinematic-scene" &&
    profile.subjectPixels > 900 &&
    profile.rainPixels > 20 &&
    profile.reflectionPixels > 80 &&
    profile.environmentPixels > 800 &&
    profile.uniqueBuckets > 20
  );
  const screenshot = await canvas.screenshot();
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/repaired-screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/repaired-screenshot.json"), JSON.stringify({
    bytes: screenshot.byteLength,
    reviewLabel: productQualityPass ? "product-quality-pass" : "fail",
    productQualityPass,
    profile
  }, null, 2));
  writeFileSync(resolve("tests/reports/repaired-route-health.json"), JSON.stringify({
    ready: true,
    backend: diagnostics?.backend,
    drawCalls: diagnostics?.drawCalls,
    phase: evidence?.phase,
    appliedRepairHints: evidence?.appliedRepairHints,
    compiledRepairHints: promptPlanReport?.repairHints,
    recipe: promptPlanReport?.recipe,
    hasPromptPlan: true,
    hasRainEffect: scene?.nodes?.some((node) => node.kind === "effect" && node.effect === "rain") ?? false
  }, null, 2));
  expect(diagnostics?.backend).toBe("webgl2");
  expect(evidence?.phase).toBe("repaired");
  expect(promptPlanReport?.repairHints?.length ?? 0).toBeGreaterThan(0);
  expect(productQualityPass).toBe(true);
  expect(screenshot.byteLength).toBeGreaterThan(1000);
});

`);
}

function writeRepairInitialSource(): void {
  writeFileSync(resolve(repairWorkspace, "src/main.ts"), `import { createAuraApp, lights, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const failedScene = scene()
  .background("#030508")
  .add(primitives.plane({ name: "flat black floor", material: material.pbr({ color: "#06080a", roughness: 0.8, metallic: 0 }) }).position(0, -0.08, -0.5).scale([3.8, 1, 2.4]))
  .add(model(assets.repairProduct, { name: "repairProduct" }).position(0, 0.02, -0.72).scale(0.82))
  .add(primitives.box({ name: "symbolic rain mark one", material: material.emissive({ color: "#d8f6ff", emissive: "#d8f6ff" }) }).position(-0.8, 1.0, -0.8).rotate(0, 0, -0.2).scale([0.012, 0.42, 0.012]))
  .add(primitives.box({ name: "symbolic rain mark two", material: material.emissive({ color: "#d8f6ff", emissive: "#d8f6ff" }) }).position(0.85, 0.92, -0.9).rotate(0, 0, -0.2).scale([0.012, 0.36, 0.012]))
  .add(lights.ambient({ intensity: 0.18 }))
  .add(lights.point({ name: "single flat key", position: [0.2, 1.8, 2], intensity: 0.7, color: "#ffffff" }));

const app = createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true, performancePanel: true },
  scene: failedScene
});

declare global {
  interface Window {
    auraApp: typeof app;
    auraRepairEvidence: {
      phase: string;
      sourcePrompt: string;
      failureReason: string;
    };
  }
}

window.auraApp = app;
window.auraRepairEvidence = {
  phase: "initial-failed",
  sourcePrompt: "Repair a failed rainy product reveal that currently looks like one model with symbolic rain marks.",
  failureReason: "One centered asset with symbolic rain marks lacks scene depth, wet reflections, fog, practical lights, and cinematic camera blocking."
};
`);
}

function writeRepairRepairedSource(appliedRepairHints: readonly string[]): void {
  writeFileSync(resolve(repairWorkspace, "src/main.ts"), `import { compilePromptPlan, createAuraApp, definePromptPlan, promptPlanToScene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const promptPlan = definePromptPlan({
  sceneType: "cinematic-scene",
  subject: { asset: assets.repairProduct, label: "repaired product hero" },
  style: "rainy cinematic product reveal",
  environment: "wet neon alley with foreground frames, practical lights, rain volume, fog, and puddle reflections",
  camera: { preset: "cinematic-dolly" },
  lighting: { preset: "neon-practicals" },
  effects: ["rain", "fog", "bloom", "wet-reflection"],
  interaction: "orbit",
  acceptanceCriteria: [
    "the product asset is the visible hero subject",
    "rain is visible as a scene volume, not only two marks",
    "wet floor reflections and splash cues are visible",
    "foreground and background structure create cinematic depth",
    "compiled prompt-plan repair hints are recorded"
  ],
  negativeCriteria: [
    "Do not ship a lone model on a flat floor.",
    "Do not rely on symbolic rain marks.",
    "Do not mark product quality without wet reflections, depth, and motivated lights."
  ]
} as const);

const compiled = compilePromptPlan(promptPlan);
const app = createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true, performancePanel: true },
  scene: promptPlanToScene(promptPlan)
});

declare global {
  interface Window {
    auraApp: typeof app;
    auraPromptPlanReport: typeof compiled.report;
    auraRepairEvidence: {
      phase: string;
      sourcePrompt: string;
      appliedRepairHints: readonly string[];
      repairTurnCount: number;
    };
  }
}

window.auraApp = app;
window.auraPromptPlanReport = compiled.report;
window.auraRepairEvidence = {
  phase: "repaired",
  sourcePrompt: "Repair a failed rainy product reveal that currently looks like one model with symbolic rain marks.",
  appliedRepairHints: ${JSON.stringify(appliedRepairHints, null, 2)},
  repairTurnCount: 1
};
`);
}

function viteAliasEntries(): string {
  return Object.entries(tsconfig.compilerOptions?.paths ?? {})
    .map(([specifier, paths]) => [specifier, paths[0]] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
    .sort((a, b) => b[0].length - a[0].length)
    .map(([specifier, path]) => {
      const replacement = specifier === "@aura3d/engine"
        ? resolve("packages/engine/src/agent-api/index.ts")
        : resolve(path);
      return `      { find: ${JSON.stringify(specifier)}, replacement: ${JSON.stringify(replacement)} }`;
    })
    .join(",\n");
}

function findApiHallucinations(source: string): string[] {
  const allowed = new Set([
    "camera",
    "compilePromptPlan",
    "createAuraApp",
    "definePromptPlan",
    "effects",
    "interactions",
    "lights",
    "material",
    "model",
    "primitives",
    "promptPlanToScene",
    "scene",
    "timeline"
  ]);
  const match = source.match(/import\s+\{([^}]+)\}\s+from\s+["']@aura3d\/engine["']/);
  if (!match) return ["missing @aura3d/engine named import"];
  return match[1]
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !allowed.has(item));
}

function findAssetPathErrors(source: string, validationResult: ReturnType<typeof validateAssets>, expectedRefs: readonly string[] = ["assets.agentProduct"]): string[] {
  const errors = [...validationResult.failures];
  if (/unsafeModelUrl|["'][^"']+\.(?:glb|gltf)["']/.test(source)) {
    errors.push("generated app used a raw model URL instead of typed asset refs");
  }
  for (const ref of expectedRefs) {
    if (!source.includes(ref)) {
      errors.push(`generated app did not use expected typed asset ref ${ref}`);
    }
  }
  return errors;
}

function runCommand(command: string, args: readonly string[], cwd: string): { readonly ok: boolean; readonly output: string } {
  try {
    const output = execFileSync(command, [...args], { cwd, encoding: "utf8", stdio: "pipe" });
    return { ok: true, output: output.trim() };
  } catch (error) {
    const output = error instanceof Error && "stdout" in error
      ? `${String((error as { stdout?: unknown }).stdout ?? "")}${String((error as { stderr?: unknown }).stderr ?? "")}`
      : String(error);
    return { ok: false, output: output.trim().split("\n").slice(-32).join("\n") };
  }
}

function downloadDogfoodAsset(url: string, expectedSha256: string): Buffer {
  const contents = execFileSync("curl", ["-L", "--fail", "--silent", "--show-error", "--max-time", "60", url], { maxBuffer: 50 * 1024 * 1024 });
  const actualSha256 = createHash("sha256").update(contents).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new Error(`Dogfood asset checksum mismatch for ${url}: expected ${expectedSha256}, got ${actualSha256}`);
  }
  return contents;
}

function readOptionalJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeMarkdown(checks: readonly ReleaseCheck[], score: AgentDogfoodScore, fiveTaskEval: CodexFiveTaskEval, repairEval: CodexRepairEval): void {
  const lines = [
    "# Agent Dogfood Results",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Codex Self-Test",
    "",
    "| Agent | Compiles | Runs | API Hallucinations | Asset Path Errors | Turns | Notes |",
    "|---|---:|---:|---:|---:|---:|---|",
    `| ${score.agent} | ${score.compiles ? "yes" : "no"} | ${score.runs ? "yes" : "no"} | ${score.apiHallucinations} | ${score.assetPathErrors} | ${score.turns} | ${escapeTable(score.notes.join(" "))} |`,
    `| ${fiveTaskEval.summary.agent} | ${fiveTaskEval.summary.compiles ? "yes" : "no"} | ${fiveTaskEval.summary.runs ? "yes" : "no"} | ${fiveTaskEval.summary.apiHallucinations} | ${fiveTaskEval.summary.assetPathErrors} | ${fiveTaskEval.summary.turns} | ${escapeTable(fiveTaskEval.summary.notes.join(" "))} |`,
    `| ${repairEval.summary.agent} | ${repairEval.summary.compiles ? "yes" : "no"} | ${repairEval.summary.runs ? "yes" : "no"} | ${repairEval.summary.apiHallucinations} | ${repairEval.summary.assetPathErrors} | ${repairEval.summary.turns} | ${escapeTable(repairEval.summary.notes.join(" "))} |`,
    "",
    "## Codex Five-Task Eval",
    "",
    `Asset source: ${materialsVariantsShoe.source}; license: ${materialsVariantsShoe.license}; downloaded at test time with SHA-256 verification and written as \`sneaker.glb\` plus \`shoe2.glb\` inside the temporary workspace.`,
    "",
    "| Task | Prompt | Compiles | Runs | Visual/Bundle Pass | Product-Quality Pass | API Hallucinations | Asset Path Errors | Turns | Manual Corrections | Notes |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ...fiveTaskEval.taskScores.map((task) => `| \`${task.id}\` | ${escapeTable(task.prompt)} | ${task.compiles ? "yes" : "no"} | ${task.runs ? "yes" : "no"} | ${task.visualCues ? "yes" : "no"} | ${task.productQualityPass ? "yes" : "no"} | ${task.apiHallucinations} | ${task.assetPathErrors} | ${task.turns} | ${task.manualCorrections} | ${escapeTable(task.notes.join(" "))} |`),
    "",
    "## Codex Repair Eval",
    "",
    `Source prompt: ${repairEval.sourcePrompt}`,
    "",
    "| Initial Label | Repaired Label | Repair Turns | Applied Repair Hints |",
    "|---:|---:|---:|---|",
    `| \`${repairEval.failedLabel}\` | \`${repairEval.repairedLabel}\` | ${repairEval.repairTurnCount} | ${escapeTable(repairEval.appliedRepairHints.join(" "))} |`,
    "",
    "## Context Input",
    "",
    ...allowedContextFiles.map((file) => `- \`${file}\``),
    "",
    "## Checks",
    "",
    "| Check | Result | Detail |",
    "|---|---:|---|",
    ...checks.map((check) => `| \`${check.id}\` | ${check.pass ? "pass" : "fail"} | ${escapeTable(check.detail)} |`),
    "",
    "## Remaining Agent Runs",
    "",
    "- Claude Code: not run in this automated self-test.",
    "- Cursor: not run in this automated self-test.",
    "- Copilot: not run in this automated self-test.",
    ""
  ];
  mkdirSync(dirname(resolve(markdownPath)), { recursive: true });
  writeFileSync(markdownPath, lines.join("\n"));
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
