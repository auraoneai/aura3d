import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { createAnimationStudioBodyMotionReport } from "../animation-studio-body-motion-gate/index.js";
import { createLipSyncTimingReport } from "../animation-studio-lip-sync-timing-gate/index.js";
import { createSubtitleTimingReport } from "../animation-studio-subtitle-timing-gate/index.js";
import { createPromptSpecificityReport } from "../animation-studio-prompt-specificity-gate/index.js";
import { createAnimationStudioMotionQualityReport } from "../animation-studio-motion-quality-gate/index.js";
import { createAnimationStudioVisualQualityReport } from "../animation-studio-visual-quality-gate/index.js";
import { createPerformanceBudgetReport } from "../animation-studio-performance-budget-gate/index.js";
import { createAnimationStudioReadinessReport } from "../animation-studio-readiness/index.js";
import { createNoFakeProofReport } from "../animation-studio-no-fake-proof-gate/index.js";

/**
 * Animation Studio GATE SUITE — PRD Phase H (H1).
 *
 * A single CI aggregator that runs EVERY user-visible-quality gate on one
 * rendered episode + its `render-live-summary.json`, and produces a combined
 * pass/fail verdict. This is the script CI runs on a real render so a single
 * green/red answers "is this episode shippable?".
 *
 * The gates it aggregates each measure ONE user-visible failure mode (the list
 * the PRD enumerates — H1):
 *  - rig validity                → readiness
 *  - clip usefulness / body motion (excl. mouth/caption/camera) → body-motion
 *  - lip-sync timing             → lip-sync-timing
 *  - subtitle timing             → subtitle-timing
 *  - prompt specificity          → prompt-specificity
 *  - framing                     → (scene-coherence CLI gate; run separately on the document)
 *  - determinism                 → (determinism CLI gate; run separately on the document)
 *  - motion quality              → motion-quality
 *  - visual quality / UI wiring  → visual-quality
 *  - performance / budget        → performance-budget
 *  - NO FAKE PROOF (the meta-rule) → no-fake-proof
 *
 * The "no fake proof" rule is enforced FIRST and is hard: the suite runs the
 * no-fake-proof gate over the render summary AND over every gate report it
 * itself produced. A render summary that self-reports `passed:true`, or a gate
 * report that hard-codes a pass, fails the whole suite. The suite NEVER
 * hard-codes a pass — its verdict is the AND of the gates it ran, and it fails
 * closed when the render artifact is missing.
 *
 * Framing + determinism are deliberately NOT folded in here: they are CLI gates
 * that take an EpisodeDocument (not the render summary) and spawn a render, so
 * they run as their own CI steps (`animation-studio:scene-coherence`,
 * `animation-studio:determinism`). This aggregator owns the summary-driven
 * gates; the package.json `animation-studio:gate-suite` script chains all of
 * them so CI runs prompt → document → render → measured output end-to-end.
 */

export interface GateSuiteReport {
  readonly schema: "animation-studio-gate-suite/v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly summaryPath: string;
  readonly summaryExists: boolean;
  readonly gates: readonly GateResult[];
  readonly blockers: readonly string[];
}

export interface GateResult {
  readonly id: string;
  /** The user-visible quality dimension this gate measures. */
  readonly measures: string;
  readonly ok: boolean;
  readonly blockers: readonly string[];
}

export interface GateSuiteOptions {
  readonly summaryPath?: string;
  readonly packageDir?: string;
  readonly out?: string;
  readonly generatedAt?: string;
  /** The prompt the episode was generated from (drives the prompt-specificity gate). */
  readonly prompt?: string;
  /** Set true only when the prompt legitimately requested moon-garden content. */
  readonly allowMoonGarden?: boolean;
}

const defaultSummaryPath =
  "packages/create-aura3d/templates/animation-studio/dist/episodes/live-3d/render-live-summary.json";
const defaultOut = "tests/reports/animation-studio/gate-suite.json";

function resolveSummaryPath(options: GateSuiteOptions): string {
  if (options.summaryPath) return options.summaryPath;
  if (options.packageDir) return join(options.packageDir, "render-live-summary.json");
  return defaultSummaryPath;
}

export function createGateSuiteReport(
  root = process.cwd(),
  options: GateSuiteOptions = {}
): GateSuiteReport {
  const summaryRel = resolveSummaryPath(options);
  const summaryExists = existsSync(join(root, summaryRel));
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  const gates: GateResult[] = [];

  // --- NO FAKE PROOF (meta-rule) runs FIRST on the render summary itself. ---
  const noFakeProof = createNoFakeProofReport(root, { summaryPath: summaryRel, generatedAt });
  gates.push({
    id: "no-fake-proof",
    measures: "no self-reported / hard-coded pass flags; summary carries measured signals",
    ok: noFakeProof.ok,
    blockers: noFakeProof.blockers
  });

  // --- rig validity (the cast's rigs can actually act). ---
  const readiness = createAnimationStudioReadinessReport(generatedAt);
  gates.push({
    id: "rig-validity",
    measures: "rig validity — locomotion clips mapped, state graph + blend tree + IK chains valid",
    ok: readiness.ok,
    blockers: readiness.blockers
  });

  // --- body motion (excl. mouth/caption/camera) + clip usefulness. ---
  const bodyMotion = createAnimationStudioBodyMotionReport(root, { summaryPath: summaryRel, generatedAt });
  gates.push({
    id: "body-motion",
    measures: "body motion above threshold (mouth/caption/camera excluded); not idle/talk fallback only",
    ok: bodyMotion.ok,
    blockers: bodyMotion.blockers
  });

  // --- motion quality (distinct staged poses + mouth motion during dialogue). ---
  const motionQuality = createAnimationStudioMotionQualityReport(root, { summaryPath: summaryRel, generatedAt });
  gates.push({
    id: "motion-quality",
    measures: "clip usefulness — characters take >1 staged pose and mouths move during dialogue",
    ok: motionQuality.ok,
    blockers: motionQuality.blockers
  });

  // --- lip-sync timing. ---
  const lipSync = createLipSyncTimingReport(root, { summaryPath: summaryRel, generatedAt });
  gates.push({
    id: "lip-sync-timing",
    measures: "lip-sync timing — mouths cycle during dialogue, no frozen mouth-open holds",
    ok: lipSync.ok,
    blockers: lipSync.blockers
  });

  // --- subtitle timing. ---
  const subtitle = createSubtitleTimingReport(root, { summaryPath: summaryRel, generatedAt });
  gates.push({
    id: "subtitle-timing",
    measures: "subtitle timing — caption on-screen window ≈ estimated speech duration, no lingering",
    ok: subtitle.ok,
    blockers: subtitle.blockers
  });

  // --- prompt specificity (no fixture leakage). ---
  const promptSpecificity = createPromptSpecificityReport(root, {
    summaryPath: summaryRel,
    generatedAt,
    prompt: options.prompt,
    allowMoonGarden: options.allowMoonGarden
  });
  gates.push({
    id: "prompt-specificity",
    measures: "prompt specificity — render matches the prompt; no Moon-Garden fixture fallback",
    ok: promptSpecificity.ok,
    blockers: promptSpecificity.blockers
  });

  // --- visual quality + UI wiring (real frames, toon applied, readable captions). ---
  const visualQuality = createAnimationStudioVisualQualityReport(root, { summaryPath: summaryRel, generatedAt });
  gates.push({
    id: "visual-quality",
    measures: "visual quality / UI wiring — real frame PNGs, toon applied, readable captions",
    ok: visualQuality.ok,
    blockers: visualQuality.blockers
  });

  // --- performance budget. ---
  const performance = createPerformanceBudgetReport(root, {
    manifestPath: null,
    summaryPath: summaryRel,
    generatedAt
  });
  gates.push({
    id: "performance-budget",
    measures: "performance budget — draw calls, encoded bytes, frame-count matches duration*fps",
    ok: performance.ok,
    // The performance gate reports breaches (not "blockers"); normalize to the suite's shape.
    blockers: performance.breaches
  });

  // --- NO FAKE PROOF, second pass: scan THIS suite's own gate reports for hard-coded passes. ---
  // We persist each report first so the no-fake-proof scan reads real files, never trusts memory.
  const reportFiles = persistGateInputs(root, generatedAt, {
    "body-motion": bodyMotion,
    "motion-quality": motionQuality,
    "lip-sync-timing": lipSync,
    "subtitle-timing": subtitle,
    "prompt-specificity": promptSpecificity,
    "visual-quality": visualQuality,
    "performance-budget": performance
  });
  const noFakeProofChain = createNoFakeProofReport(root, {
    summaryPath: summaryRel,
    extraInputs: reportFiles,
    generatedAt
  });
  gates.push({
    id: "no-fake-proof-chain",
    measures: "no gate report hard-codes a pass; the chain of gate inputs is honest",
    ok: noFakeProofChain.ok,
    blockers: noFakeProofChain.blockers.filter((b) => !b.includes(summaryRel)) // summary already covered above
  });

  const blockers: string[] = [];
  if (!summaryExists) {
    blockers.push(
      `${summaryRel} is missing — run scripts/render-live.ts first; the gate suite fails closed on a render that did not run.`
    );
  }
  for (const gate of gates) {
    if (!gate.ok) {
      for (const b of gate.blockers) blockers.push(`[${gate.id}] ${b}`);
    }
  }

  return {
    schema: "animation-studio-gate-suite/v1",
    ok: blockers.length === 0 && gates.every((g) => g.ok),
    generatedAt,
    summaryPath: summaryRel,
    summaryExists,
    gates,
    blockers
  };
}

/** Persist each gate report next to the suite output so no-fake-proof can re-scan real files. */
function persistGateInputs(
  root: string,
  generatedAt: string,
  reports: Record<string, { ok: boolean }>
): string[] {
  const dirRel = "tests/reports/animation-studio/gate-suite-inputs";
  const written: string[] = [];
  for (const [id, report] of Object.entries(reports)) {
    const rel = join(dirRel, `${id}.json`);
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `${JSON.stringify({ ...report, generatedAt }, null, 2)}\n`);
    written.push(rel);
  }
  return written;
}

export function writeGateSuiteReport(root: string, report: GateSuiteReport, out = defaultOut): void {
  const absoluteOut = join(root, out);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv: readonly string[]) {
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const currentScript = process.argv[1] ? relative(process.cwd(), process.argv[1]) : "";
if (
  currentScript.endsWith("tools/animation-studio-gate-suite/index.ts") ||
  currentScript.endsWith("tools/animation-studio-gate-suite/index.js")
) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = createGateSuiteReport(root, {
    summaryPath: typeof args.summary === "string" ? args.summary : undefined,
    packageDir: typeof args["package-dir"] === "string" ? args["package-dir"] : undefined,
    prompt: typeof args.prompt === "string" ? args.prompt : undefined,
    allowMoonGarden: args["allow-moon-garden"] === true
  });
  writeGateSuiteReport(root, report, typeof args.out === "string" ? args.out : defaultOut);
  for (const gate of report.gates) {
    console.log(`${gate.ok ? "PASS" : "FAIL"} ${gate.id} — ${gate.measures}`);
    if (!gate.ok) for (const b of gate.blockers) console.log(`     · ${b}`);
  }
  if (!report.ok) {
    console.error(`\nGATE SUITE FAILED (${report.gates.filter((g) => !g.ok).length} gate(s) red).`);
    process.exitCode = 1;
  } else {
    console.log(`\nGATE SUITE PASS — all ${report.gates.length} user-visible-quality gates green on a measured render.`);
  }
}
