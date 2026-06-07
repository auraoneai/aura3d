import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateVersionedSourceNames,
  writeVersionedSourceNameReport,
  type VersionedSourceNameReport
} from "../versioned-source-name-check/index.js";

export type Aura3D109GateStatus = "pass" | "fail" | "not-implemented";

export interface Aura3D109GateResult {
  readonly id: string;
  readonly title: string;
  readonly status: Aura3D109GateStatus;
  readonly ok: boolean;
  readonly summary: string;
  readonly evidencePaths: readonly string[];
  readonly blockers: readonly string[];
}

export interface Aura3D109ReleaseReadinessReport {
  readonly schema: "aura3d109-release-readiness";
  readonly ok: boolean;
  readonly status: "prepublish-ready" | "release-ready" | "release-blocked";
  readonly phase: Aura3D109ReadinessPhase;
  readonly generatedAt: string;
  readonly claimBoundary: string;
  readonly gates: readonly Aura3D109GateResult[];
  readonly blockers: readonly string[];
  readonly versionedSourceNames: VersionedSourceNameReport;
}

const defaultReportPath = "tests/reports/aura3d109/readiness.json";
const versionedSourceNameReportPath = "tests/reports/aura3d109/versioned-source-names.json";

export type Aura3D109ReadinessPhase = "prepublish" | "final";

export interface Aura3D109ReadinessOptions {
  readonly phase?: Aura3D109ReadinessPhase;
}

export function createAura3D109ReleaseReadinessReport(root = process.cwd(), options: Aura3D109ReadinessOptions = {}): Aura3D109ReleaseReadinessReport {
  const phase = options.phase ?? "final";
  const releaseVersion = readReleaseVersion(root);
  const releaseDigits = releaseTrackId(releaseVersion);
  const releaseReport = (name: string) => `tests/reports/aura3d${releaseDigits}/${name}.json`;
  const releaseGateDoc = existsSync(join(root, `docs/project/aura3d-${releaseDigits}-release-gates.md`))
    ? `docs/project/aura3d-${releaseDigits}-release-gates.md`
    : "docs/project/aura3d-109-release-gates.md";
  const versionedSourceNames = validateVersionedSourceNames({ root });
  const gates: Aura3D109GateResult[] = [
    {
      id: "versioned-source-names",
      title: "No active v1/v2/v3/v4/v5/v6/v7 implementation names",
      status: versionedSourceNames.ok ? "pass" : "fail",
      ok: versionedSourceNames.ok,
      summary: versionedSourceNames.ok
        ? "Active source, docs, marketing, tests, and launch evidence do not expose version-attempt implementation names."
        : `${versionedSourceNames.violations.length} version-attempt naming violation(s) remain.`,
      evidencePaths: [releaseReport("versioned-source-names")],
      blockers: versionedSourceNames.violations.map((violation) =>
        `${violation.path}${violation.line ? `:${violation.line}` : ""} ${violation.rule} ${JSON.stringify(violation.match)}`
      )
    },
    sourceEvidenceGate({
      root,
      id: "game-runtime-lifecycle",
      title: "Public game app lifecycle API source and unit evidence",
      passSummary:
        "GameAppRuntime/createGameApp lifecycle source exists and focused tests cover start, pause, resume, deterministic step, resize, dispose, evidence, and owned input cleanup.",
      failSummary: "GameAppRuntime/createGameApp lifecycle evidence is incomplete.",
      evidencePaths: [
        "packages/engine/src/agent-api/GameAppRuntime.ts",
        "packages/engine/src/agent-api/index.ts",
        "tests/unit/agent-api/game-app-runtime.test.ts"
      ],
      requiredSnippets: [
        ["packages/engine/src/agent-api/GameAppRuntime.ts", ["export interface GameAppRuntime", "export function createGameAppRuntime"]],
        ["packages/engine/src/agent-api/index.ts", ["export function createGameApp", "createGameAppRuntime"]],
        [
          "tests/unit/agent-api/game-app-runtime.test.ts",
          [
            "owns start, pause, resume, step, resize, dispose, and evidence",
            "keeps start and resume idempotent",
            "disposes owned input listeners"
          ]
        ]
      ]
    }),
    sourceEvidenceGate({
      root,
      id: "animation-state-graph",
      title: "AnimationStateGraph one-shot, terminal, and snapshot behavior",
      passSummary:
        "AnimationStateGraph source and focused tests prove consumed triggers, one-shot completion, terminal KO states, completed parameters, and graph snapshots.",
      failSummary: "AnimationStateGraph source/test evidence is incomplete.",
      evidencePaths: [
        "packages/animation/src/AnimationStateGraph.ts",
        "packages/animation/src/AnimationStateMachine.ts",
        "tests/unit/animation/animation-state-graph.test.ts"
      ],
      requiredSnippets: [
        ["packages/animation/src/AnimationStateGraph.ts", ["AnimationStateGraph"]],
        ["packages/animation/src/AnimationStateMachine.ts", ["oneShot", "terminal", "completedParameter", "graphSnapshot"]],
        [
          "tests/unit/animation/animation-state-graph.test.ts",
          [
            "consumes trigger parameters",
            "keeps KO terminal",
            "rejects invalid one-shot completion targets"
          ]
        ]
      ]
    }),
    sourceEvidenceGate({
      root,
      id: "game-runtime-lifecycle-adoption",
      title: "GameAppRuntime adopted by Aura Clash and fighting-game template",
      passSummary:
        "Aura Clash Arena and the fighting-game template both use the public createGameApp/GameAppRuntime lifecycle path and publish runtime evidence.",
      failSummary: "Aura Clash Arena or the fighting-game template has not adopted the public GameAppRuntime lifecycle path.",
      evidencePaths: [
        "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts",
        "apps/aura-clash-showcase/tests/playable-smoke.spec.ts",
        "apps/aura-clash-showcase/tests/reports/flagship-gates.json",
        "packages/create-aura3d/templates/fighting-game/src/main.ts",
        "packages/create-aura3d/templates/fighting-game/tests/gameplay-smoke.spec.ts",
        "tests/unit/game-runtime/game-runtime-source-gates.test.ts"
      ],
      requiredSnippets: [
        [
          "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts",
          ["createGameApp(null", "gameApp.onFrame", "gameApp.start()", "__AURA3D_GAME_RUNTIME__", "runtimeInput"]
        ],
        ["apps/aura-clash-showcase/tests/playable-smoke.spec.ts", ["AuraClash boots Aura3D runtime", "__AURA_CLASH_ARENA_PROOF__"]],
        [
          "packages/create-aura3d/templates/fighting-game/src/main.ts",
          ["createGameApp(\"#app\"", "gameApp.onFrame", "gameApp.pause()", "gameApp.resume()", "__AURA3D_GAME_RUNTIME__"]
        ],
        [
          "packages/create-aura3d/templates/fighting-game/tests/gameplay-smoke.spec.ts",
          ["__AURA3D_GAME_RUNTIME__", "expect(runtime.frame).toBeGreaterThan(0)", "expect(runtime.loop.frame).toBeGreaterThan(0)"]
        ],
        [
          "tests/unit/game-runtime/game-runtime-source-gates.test.ts",
          ["proves public GameAppRuntime lifecycle methods", "createGameApp(null", "runtime.evidence"]
        ]
      ]
    }),
    combinedEvidenceGate({
      root,
      id: "typed-glb-animation",
      title: "Public typed GLB actor animation, state graph, and renderer-side skinning proof",
      passSummary:
        "Animation runtime browser evidence, engine source, and Aura Clash proof cover named skinned clip playback, restart, blend, event hooks, morph/viseme sync, imported runtime binding, and renderer-side skinning palette updates.",
      failSummary: "Typed GLB animation runtime evidence is incomplete.",
      reportPaths: ["tests/reports/animation-runtime/evidence.json"],
      evidencePaths: [
        "tests/reports/animation-runtime/evidence.json",
        "tests/reports/animation-runtime/named-clip-playback.png",
        "tests/reports/animation-runtime/clip-restart.png",
        "tests/reports/animation-runtime/clip-blend.png",
        "tests/reports/animation-runtime/animation-event-hitbox.png",
        "tests/reports/animation-runtime/viseme-blendshape-sync.png",
        "tests/browser/animation-runtime-105.spec.ts",
        "packages/engine/src/agent-api/AnimationController.ts",
        "packages/engine/src/production-runtime/TypedGLBActor.ts",
        "packages/engine/src/production-runtime/index.ts",
        "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts",
        "apps/aura-clash-showcase/tests/playable-smoke.spec.ts"
      ],
      requiredSnippets: [
        [
          "tests/browser/animation-runtime-105.spec.ts",
          ["proves named skinned clip playback", "restartedFromFrameZero", "openedHitbox", "viseme", "clip-blend.png"]
        ],
        [
          "packages/engine/src/agent-api/AnimationController.ts",
          ["importedRuntime", "applyImportedAnimationRuntime", "applyClipByName"]
        ],
        [
          "packages/engine/src/production-runtime/index.ts",
          ["createImportedAnimationRuntime", "loadProductionGLTFRenderPipeline", "GLTFSceneAnimationRuntimeSnapshot", "createTypedGLBActor"]
        ],
        [
          "packages/engine/src/production-runtime/TypedGLBActor.ts",
          ["export interface TypedGLBActor", "createTypedGLBActor", "loadProductionGLTFRenderPipeline", "createGLTFSceneAnimationRuntime", "playClip", "skinningPalettesUpdated"]
        ],
        [
          "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts",
          ["createTypedGLBActor", "playClip", "visibleSkinnedGlb", "playerLastSkinningPalettes"]
        ],
        [
          "apps/aura-clash-showcase/tests/playable-smoke.spec.ts",
          ["visibleSkinnedGlb", "playerLastSkinningPalettes", "rivalLastSkinningPalettes"]
        ]
      ]
    }),
    sourceEvidenceGate({
      root,
      id: "hitbox-world-ko-reset",
      title: "HitboxWorld KO lock, post-KO inert hitboxes, and reset evidence",
      passSummary:
        "HitboxWorld source and focused tests prove knockout events, round lock, active hitbox clearing, post-KO inert hitboxes, reset events, and restored combatants.",
      failSummary: "HitboxWorld KO/reset source/test evidence is incomplete.",
      evidencePaths: ["packages/physics/src/HitboxWorld.ts", "tests/unit/physics/hitbox-world-ko-reset.test.ts"],
      requiredSnippets: [
        ["packages/physics/src/HitboxWorld.ts", ["roundLocked", "knockedOut", "round-reset", "lockOnKnockout"]],
        [
          "tests/unit/physics/hitbox-world-ko-reset.test.ts",
          ["locks combat after knockout", "prevents post-KO hit spam", "reset restores baseline health"]
        ]
      ]
    }),
    sourceEvidenceGate({
      root,
      id: "engine-combat-simulation",
      title: "Engine combat-world driven deterministic fighting simulation",
      passSummary:
        "Aura Clash live combat uses the public engine combat world for hit windows, guard, damage, knockback, snapshots, and proof; unit evidence covers deterministic replay into combat.",
      failSummary: "Aura Clash live combat is not yet proven to use the public engine combat world.",
      evidencePaths: [
        "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts",
        "apps/aura-clash-showcase/tests/playable-smoke.spec.ts",
        "apps/aura-clash-showcase/tests/flagship-readiness.spec.ts",
        "apps/aura-clash-showcase/tests/reports/flagship-gates.json",
        "tests/unit/game-runtime/game-runtime-source-gates.test.ts"
      ],
      requiredSnippets: [
        [
          "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts",
          ["game.combatWorld", "resolveEngineCombat", "combatWorld.beginAttack", "GameCombatWorldSnapshot", "engineCombatProof"]
        ],
        [
          "apps/aura-clash-showcase/tests/playable-smoke.spec.ts",
          ["AuraClash resolves a hit", "locks combat after KO and reset clears the round"]
        ],
        [
          "apps/aura-clash-showcase/tests/flagship-readiness.spec.ts",
          ["KO state locks combat until reset", "all shipped controls produce explicit gameplay proof"]
        ],
        [
          "tests/unit/game-runtime/game-runtime-source-gates.test.ts",
          ["replays recorded attack input into combat hit resolution", "game.combatWorld()"]
        ]
      ]
    }),
    sourceEvidenceGate({
      root,
      id: "cli-game-asset-profiles",
      title: "CLI game-asset profiles reject unsuitable prompt/catalog assets",
      passSummary:
        "Asset-index and CLI pull-bridge source/tests prove the fighting-character profile, animated redistributable GLB constraints, suitability ranking, and concrete rejection reasons.",
      failSummary: "CLI fighting-character profile source/test evidence is incomplete.",
      evidencePaths: [
        "packages/asset-index/src/game-profile.ts",
        "packages/aura3d-cli/src/pull-bridge.ts",
        "tests/unit/asset-index/game-profile.test.ts",
        "tests/unit/asset-index/cli-pull-bridge.test.ts",
        "tests/unit/aura3d-cli/assets.test.ts"
      ],
      requiredSnippets: [
        ["packages/asset-index/src/game-profile.ts", ["fighting-character", "rejectionReasons", "scoreBonus"]],
        ["packages/aura3d-cli/src/pull-bridge.ts", ["fighting-character", "evaluateGameAssetProfile", "rejectionReasons"]],
        [
          "tests/unit/asset-index/game-profile.test.ts",
          ["accepts animated humanoid GLB", "rejects static non-character", "missing animation metadata"]
        ],
        [
          "tests/unit/asset-index/cli-pull-bridge.test.ts",
          ["refuses profile-unsuitable downloads", "annotates fighting-character candidates"]
        ],
        ["tests/unit/aura3d-cli/assets.test.ts", ["gameProfile: \"fighting-character\"", "rejects static non-rigged candidates with reasons"]]
      ]
    }),
    jsonReportGate({
      root,
      id: "local-cli-catalog-pack-proof",
      title: "Packed local CLI/catalog proof before npm publish",
      reportPaths: [releaseReport("local-cli-catalog-pack-proof")],
      passSummary:
        "Packed local @aura3d/cli and @aura3d/asset-index tarballs install in a clean app, expose publishable dependency metadata, filter fighting-character search candidates, and reject unsuitable static aircraft resolution.",
      failSummary: "Packed local CLI/catalog proof is missing or failing.",
      additionalEvidencePaths: ["tools/aura3d106-local-cli-pack-proof/index.ts"]
    }),
    ...(phase === "final" ? [jsonReportGate({
      root,
      id: "published-cli-catalog-proof",
      title: "Published npx prompt/catalog CLI proof",
      reportPaths: [releaseReport("published-cli-catalog-proof")],
      passSummary:
        "Published `npx @aura3d/cli@latest` proves fighting-character search profile metadata and rejects unsuitable static aircraft resolution.",
      failSummary: "Published `npx @aura3d/cli@latest` prompt/catalog profile proof is missing or failing.",
      additionalEvidencePaths: ["tools/aura3d106-published-cli-proof/index.ts"]
    }),
    jsonReportGate({
      root,
      id: "published-engine-package-proof",
      title: "Published @aura3d/engine tarball includes runtime files",
      reportPaths: [releaseReport("published-engine-proof")],
      passSummary:
        "Published @aura3d/engine tarball contains TypedGLBActor and GameAppRuntime runtime files.",
      failSummary:
        "Published @aura3d/engine tarball is missing required runtime files or cannot be packed from npm.",
      additionalEvidencePaths: ["tools/aura3d109-published-engine-proof/index.ts"]
    }),
    jsonReportGate({
      root,
      id: "published-create-aura3d-template-proof",
      title: "Published create-aura3d scaffolds current engine templates",
      reportPaths: [releaseReport("published-create-aura3d-proof")],
      passSummary:
        `Published \`npx create-aura3d@latest\` scaffolds, installs, builds, and tests the fighting-game template with @aura3d/engine ${releaseVersion}.`,
      failSummary:
        "Published create-aura3d scaffold proof is missing, produces stale @aura3d/engine template dependencies, or fails install/build/test.",
      additionalEvidencePaths: [
        "tools/aura3d109-published-create-aura3d-proof/index.ts",
        "packages/create-aura3d/src/index.ts",
        "packages/create-aura3d/templates/fighting-game/package.json"
      ]
    })] : []),
    jsonReportGate({
      root,
      id: "aura-clash-arena-flagship",
      title: "Aura Clash Arena local flagship control/gameplay/performance/audio gates",
      reportPaths: ["apps/aura-clash-showcase/tests/reports/flagship-readiness.json", "apps/aura-clash-showcase/tests/reports/flagship-gates.json"],
      passSummary:
        "Local Aura Clash flagship readiness and Playwright gate reports are green for controls, KO/reset, no debug cube hit VFX, performance proof, audio proof, and script wiring.",
      failSummary: "Aura Clash local flagship readiness reports are missing or failing.",
      additionalEvidencePaths: [
        "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts",
        "apps/aura-clash-showcase/tests/playable-smoke.spec.ts"
      ]
    }),
    jsonReportGate({
      root,
      id: "aura-clash-deployed-visual-proof",
      title: "Deployed Aura Clash route parity, assets, screenshots, and visual quality proof",
      reportPaths: [releaseReport("deployed-visual-proof")],
      passSummary:
        "Deployed Aura Clash routes return 200, load JS/CSS/GLB/texture/audio assets, expose current runtime proof, respond to controls, render nonblank screenshots, and match the current Aura Clash contract.",
      failSummary:
        "Deployed Aura Clash route proof is missing or failing for 200 responses, assets, console errors, canvas, controls, screenshots, or current-contract parity.",
      additionalEvidencePaths: [
        "tools/aura3d106-deployed-visual-proof/index.ts",
        "apps/aura-clash-showcase/tests/reports/flagship-gates.json",
        "apps/aura-clash-showcase/launch-evidence/evidence-wiring.json",
        "apps/aura-clash-showcase/launch-evidence/prd-evidence-coverage.json"
      ]
    }),
    jsonReportGate({
      root,
      id: "peer-grade-performance",
      title: "Renderer, profiler, resource manager, and performance budgets",
      reportPaths: [releaseReport("performance-budget")],
      passSummary:
        `Aura Clash and ${releaseVersion} release evidence enforce unclamped frame-time/FPS/draw-call budgets plus built JS/CSS/GLB route payload budgets.`,
      failSummary: `Aura3D ${releaseVersion} performance budget evidence is missing or failing.`,
      additionalEvidencePaths: [
        "tools/aura3d106-performance-budget/index.ts",
        "apps/aura-clash-showcase/tests/reports/flagship-gates.json",
        "apps/aura-clash-showcase/tests/flagship-readiness.spec.ts",
        "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts"
      ]
    }),
    jsonReportGate({
      root,
      id: "docs-marketing-claims",
      title: "Docs, README, llms, marketing, npm, and GitHub claims match evidence",
      reportPaths: [releaseReport("docs-claims")],
      passSummary:
        `README, llms, docs, marketing, header labels, package versions, and scoped ${releaseVersion} claims are aligned with current evidence.`,
      failSummary: `Docs, README, llms, marketing, package versions, or public claims are not aligned with current ${releaseVersion} evidence.`,
      additionalEvidencePaths: [
        "tools/aura3d106-docs-claims/index.ts",
        "README.md",
        "llms.txt",
        "docs/project/claim-guidelines.md",
        releaseGateDoc,
        "marketing/index.html",
        "marketing/src/styles.css"
      ]
    })
  ];

  const blockers = gates.flatMap((gate) => gate.blockers.map((blocker) => `${gate.id}: ${blocker}`));
  const ok = gates.every((gate) => gate.ok);
  return {
    schema: "aura3d109-release-readiness",
    ok,
    status: ok ? (phase === "prepublish" ? "prepublish-ready" : "release-ready") : "release-blocked",
    phase,
    generatedAt: new Date().toISOString(),
    claimBoundary:
      `Aura3D ${releaseVersion} is not release-ready until every release gate has concrete command, test, screenshot, asset, docs, package, and deployed evidence. Not-implemented gates are blockers, not TODO notes.`,
    gates,
    blockers,
    versionedSourceNames
  };
}

function readReleaseVersion(root: string): string {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { readonly version?: string };
  if (!pkg.version) throw new Error("Root package.json has no version.");
  return pkg.version;
}

function releaseTrackId(version: string): string {
  const [major = "", minor = "", patch = ""] = version.split(".");
  if (minor === "0" && patch.length > 1) return `${major}${patch}`;
  return `${major}${minor}${patch}`;
}

export function writeAura3D109ReleaseReadinessReport(
  report: Aura3D109ReleaseReadinessReport,
  root = process.cwd(),
  reportPath = defaultReportPath
): void {
  const absolute = join(root, reportPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

interface SourceEvidenceGateOptions {
  readonly root: string;
  readonly id: string;
  readonly title: string;
  readonly passSummary: string;
  readonly failSummary: string;
  readonly evidencePaths: readonly string[];
  readonly requiredSnippets: readonly (readonly [path: string, snippets: readonly string[]])[];
}

function sourceEvidenceGate(options: SourceEvidenceGateOptions): Aura3D109GateResult {
  const blockers: string[] = [];
  for (const path of options.evidencePaths) {
    if (!existsSync(join(options.root, path))) blockers.push(`Missing evidence file: ${path}`);
  }

  for (const [path, snippets] of options.requiredSnippets) {
    const absolute = join(options.root, path);
    if (!existsSync(absolute)) continue;
    const text = readFileSync(absolute, "utf8");
    for (const snippet of snippets) {
      if (!text.includes(snippet)) blockers.push(`${path} does not contain required evidence snippet: ${JSON.stringify(snippet)}`);
    }
  }

  const ok = blockers.length === 0;
  return {
    id: options.id,
    title: options.title,
    status: ok ? "pass" : "fail",
    ok,
    summary: ok ? options.passSummary : options.failSummary,
    evidencePaths: options.evidencePaths,
    blockers
  };
}

interface JsonReportGateOptions {
  readonly root: string;
  readonly id: string;
  readonly title: string;
  readonly reportPaths: readonly string[];
  readonly passSummary: string;
  readonly failSummary: string;
  readonly additionalEvidencePaths?: readonly string[];
}

interface CombinedEvidenceGateOptions extends SourceEvidenceGateOptions {
  readonly reportPaths: readonly string[];
}

function combinedEvidenceGate(options: CombinedEvidenceGateOptions): Aura3D109GateResult {
  const sourceGate = sourceEvidenceGate(options);
  const reportGate = jsonReportGate({
    root: options.root,
    id: options.id,
    title: options.title,
    reportPaths: options.reportPaths,
    passSummary: options.passSummary,
    failSummary: options.failSummary,
    additionalEvidencePaths: options.evidencePaths.filter((path) => !options.reportPaths.includes(path))
  });
  const blockers = [...sourceGate.blockers, ...reportGate.blockers];
  const evidencePaths = [...new Set([...options.reportPaths, ...options.evidencePaths])];
  const ok = blockers.length === 0;
  return {
    id: options.id,
    title: options.title,
    status: ok ? "pass" : "fail",
    ok,
    summary: ok ? options.passSummary : options.failSummary,
    evidencePaths,
    blockers
  };
}

function jsonReportGate(options: JsonReportGateOptions): Aura3D109GateResult {
  const blockers: string[] = [];
  for (const path of options.reportPaths) {
    const report = readJsonReport(join(options.root, path));
    if (!report.exists) {
      blockers.push(`Missing report: ${path}`);
      continue;
    }
    if (!report.ok) {
      blockers.push(`${path} is not ok: ${report.reason}`);
    }
  }
  for (const path of options.additionalEvidencePaths ?? []) {
    if (!existsSync(join(options.root, path))) blockers.push(`Missing supporting evidence file: ${path}`);
  }

  const ok = blockers.length === 0;
  return {
    id: options.id,
    title: options.title,
    status: ok ? "pass" : "fail",
    ok,
    summary: ok ? options.passSummary : options.failSummary,
    evidencePaths: [...options.reportPaths, ...(options.additionalEvidencePaths ?? [])],
    blockers
  };
}

function readJsonReport(path: string): { readonly exists: boolean; readonly ok: boolean; readonly reason: string } {
  if (!existsSync(path)) return { exists: false, ok: false, reason: "missing" };
  try {
    const report = JSON.parse(readFileSync(path, "utf8")) as { readonly ok?: unknown; readonly status?: unknown; readonly failedCount?: unknown };
    if (report.ok === true) return { exists: true, ok: true, reason: "ok true" };
    if (report.failedCount === 0 && report.status === "flagship-ready") return { exists: true, ok: true, reason: "flagship-ready" };
    return {
      exists: true,
      ok: false,
      reason: `ok=${String(report.ok)} status=${String(report.status)} failedCount=${String(report.failedCount)}`
    };
  } catch (error) {
    return { exists: true, ok: false, reason: error instanceof Error ? error.message : "invalid JSON" };
  }
}

function notImplementedGate(id: string, title: string, blocker: string): Aura3D109GateResult {
  return {
    id,
    title,
    status: "not-implemented",
    ok: false,
    summary: "This current-release gate has not been implemented or wired to authoritative evidence yet.",
    evidencePaths: [],
    blockers: [blocker]
  };
}

function failedGate(id: string, title: string, blocker: string, evidencePaths: readonly string[]): Aura3D109GateResult {
  return {
    id,
    title,
    status: "fail",
    ok: false,
    summary: "This current-release gate has partial implementation evidence but remains release-blocking.",
    evidencePaths,
    blockers: [blocker]
  };
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const phase = readOption("--phase") === "prepublish" ? "prepublish" : "final";
  const report = createAura3D109ReleaseReadinessReport(process.cwd(), { phase });
  const reportPath = readOption("--out") ?? defaultReportPath;
  const sourceNameReportPath = dirname(reportPath) === "."
    ? versionedSourceNameReportPath
    : join(dirname(reportPath), "versioned-source-names.json");
  writeVersionedSourceNameReport(report.versionedSourceNames, sourceNameReportPath);
  writeAura3D109ReleaseReadinessReport(report, process.cwd(), reportPath);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
