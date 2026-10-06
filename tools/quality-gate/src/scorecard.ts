/**
 * tools/quality-gate/src/scorecard.ts — PRD-14 T1.6 (§7.3).
 *
 * `buildScorecard({ runReport, panel, humanForms, round, ... })` assembles a
 * GameScorecard (schema `aura3d.game-scorecard/1`) from a capture run report,
 * a C-32 PanelRoundRecord (or a lane fixture of the same shape), and exported
 * human-review forms. `verdict(scorecard, acceptance)` implements the §6.3
 * integrated gate — it can only run on a G-PANEL round (IC-4, IC-8, IC-12, …;
 * vision-only IC-k rounds are screening and refuse).
 *
 * CLI:
 *   pnpm exec tsx --tsconfig tsconfig.base.json tools/quality-gate/src/scorecard.ts \
 *     --game <id> --run <runId> --round <IC-k> \
 *     [--report <report.json>] [--panel <file.panel.json>] [--human <export.json> ...]
 *     [--prior-counted <n>] [--integrated-critical C-24,C-25] [--out <dir>] [--dry-run]
 *
 * The root script `quality:scorecard` is a separate root-manifest request
 * (R-14-04); this direct command works without it.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GameJudgement, PanelRoundRecord } from "./contracts";
import { GAME_NONVISUAL_CATEGORIES, GAME_VISUAL_CATEGORIES } from "./contracts";
import { canvasBlankCheck } from "@aura3d/game/art";
import { decodePng } from "./png";

/* ---------------------------------- types --------------------------------- */

/** §7.3 — the committed per-game per-round judgement file. */
export interface GameScorecard {
  readonly schema: "aura3d.game-scorecard/1";
  readonly gameId: string;
  readonly commit: string;
  readonly round: string;
  readonly countedRound: 0 | 1 | 2;
  readonly qrFlags: readonly string[];
  readonly enginePending: readonly string[];
  readonly captureRunId: string;
  readonly env: { readonly runner: string; readonly gpu: string; readonly browser: string };
  readonly vision: readonly GameJudgement[];
  readonly human: readonly HumanReviewEntry[];
  readonly perf: readonly PerfRow[];
  readonly verdict: "accepted" | "rejected" | "withdrawn";
  readonly findings: readonly string[];
}

/** §7.3 human[] entry — the human-review form export's `human` field. */
export interface HumanReviewEntry {
  readonly judge: { readonly kind: "human"; readonly id: string; readonly model?: string };
  readonly device: string;
  readonly tier: "low" | "medium" | "high" | "ultra";
  readonly playedMinutes: number;
  readonly visual: GameJudgement["scores"];
  readonly nonVisual: Readonly<Record<"sound_audio" | "controls" | "physics_feel" | "game_feel" | "loading_transitions", number>>;
  readonly measuredFps: { readonly p50: number; readonly p95: number };
  readonly competitiveWithModernThree: boolean;
  readonly notes: string;
}

export interface HumanReviewDoc {
  readonly schema: "aura3d.human-review/1";
  readonly gameId: string;
  readonly round: string;
  readonly human: HumanReviewEntry;
}

export interface PerfRow {
  readonly viewport: string;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly draws: number;
}

/** C-35 acceptance record (games.json `acceptance`). */
export interface ScorecardAcceptance {
  readonly minOverall: number;
  readonly minVisualCategory: number;
  readonly critical: Readonly<Record<string, number>>;
  readonly minNonVisual: Readonly<Record<string, number>>;
}

/** Subset of tools/quality-rebuild-capture report.json consumed here. */
export interface CaptureRunReport {
  readonly generatedAt?: string;
  readonly environment?: {
    readonly runner?: string | null;
    readonly probeRenderer?: string | null;
    readonly browserVersion?: string | null;
    readonly sha?: string | null;
  };
  readonly games?: readonly {
    readonly id: string;
    readonly runs?: readonly {
      readonly run?: string;
      readonly shots?: readonly { readonly name?: string; readonly file?: string; readonly path?: string }[];
      readonly fps?: { readonly fps?: number; readonly p50?: number; readonly p95?: number; readonly p99?: number };
      readonly diagnostics?: { readonly qrFlags?: readonly string[]; readonly degradations?: readonly string[]; readonly frame?: unknown };
      readonly evidence?: { readonly degradations?: readonly string[]; readonly qrFlags?: readonly string[] };
      readonly consoleErrors?: readonly unknown[];
      readonly pageErrors?: readonly unknown[];
    }[];
  }[];
}

/* ------------------------------- round rules ------------------------------ */

/**
 * G-PANEL rounds are every fourth checkpoint (IC-4, IC-8, IC-12, …, §6.3);
 * "vision-only rounds (IC-1..3, 5..7, …) are screening and cannot accept"
 * (§16.2). A baseline round (like `baseline-c08d8acb`) is not a G-PANEL round.
 */
export function isGPanelRound(round: string): boolean {
  const m = /^IC-(\d+)$/.exec(round);
  return m !== null && Number(m[1]) > 0 && Number(m[1]) % 4 === 0;
}

/* ------------------------------- statistics ------------------------------- */

function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/* --------------------------------- builder -------------------------------- */

export interface BuildScorecardOptions {
  readonly gameId: string;
  readonly commit: string;
  readonly round: string;
  readonly captureRunId: string;
  readonly runReport?: CaptureRunReport;
  readonly panel?: PanelRoundRecord & { readonly games?: readonly (GameJudgement & { readonly nonVisual?: Readonly<Record<string, number>> })[] };
  readonly humanForms?: readonly HumanReviewDoc[];
  /** Counted rejected rounds already on file for this game (§6.3 loop). */
  readonly priorCountedRejections?: number;
  /** C-35 acceptance record for the game (games.json `acceptance`); defaults to the §6.3 constants. */
  readonly acceptance?: ScorecardAcceptance;
  /** §12.3 integrated-critical contract ids for this game (e.g. ["C-24","C-25"]). */
  readonly integratedCritical?: readonly string[];
  /** §17/canvasBlankCheck thresholds from games.json (blank-check limits). */
  readonly blankCheck?: { readonly maxDarkFraction?: number; readonly minDistinctColors?: number };
  /** Directory the run report's shot PNG paths resolve against (for blank checks). */
  readonly reportDir?: string;
}

export function buildScorecard(opts: BuildScorecardOptions): GameScorecard {
  const gameId = opts.gameId;
  const vision = (opts.panel?.games ?? []).filter((j) => j.gameId === gameId);
  const human: HumanReviewEntry[] = (opts.humanForms ?? [])
    .filter((f) => f.gameId === gameId)
    .map((f) => f.human);
  for (const h of human) {
    if (typeof h.notes !== "string" || h.notes.trim().length < 200) {
      throw new Error(`human review from ${h.judge?.id ?? "?"} for ${gameId} is missing notes (≥ 200 chars required)`);
    }
    if (!(h.playedMinutes >= 5)) {
      throw new Error(`human review from ${h.judge?.id ?? "?"} for ${gameId} played ${h.playedMinutes} min (< 5)`);
    }
  }

  const gameRun = opts.runReport?.games?.find((g) => g.id === gameId);
  const degradations = new Set<string>();
  const qrFlags = new Set<string>();
  const perf: PerfRow[] = [];
  const findings: string[] = [];
  for (const run of gameRun?.runs ?? []) {
    const degs = run.diagnostics?.degradations ?? run.evidence?.degradations ?? [];
    for (const d of degs) degradations.add(String(d));
    for (const f of run.diagnostics?.qrFlags ?? run.evidence?.qrFlags ?? []) qrFlags.add(String(f));
    const fps = run.fps;
    if (fps && (fps.p50 != null || fps.p95 != null)) {
      perf.push({
        viewport: run.run ?? "unknown",
        p50Ms: fps.p50 ?? NaN,
        p95Ms: fps.p95 ?? NaN,
        p99Ms: fps.p99 ?? NaN,
        draws: 0
      });
    }
    if ((run.pageErrors?.length ?? 0) > 0) findings.push(`run ${run.run}: ${run.pageErrors!.length} page error(s)`);
    if ((run.consoleErrors?.length ?? 0) > 0) findings.push(`run ${run.run}: ${run.consoleErrors!.length} console error(s)`);
  }

  // §7.3: canvasBlankCheck on shot PNGs (hud-masked rects are the runner's job
  // to annotate; here we check the raw pixels when files resolve locally).
  if (opts.reportDir) {
    const limits = {
      maxDarkFraction: opts.blankCheck?.maxDarkFraction ?? 0.9,
      minDistinctColors: opts.blankCheck?.minDistinctColors ?? 2000
    };
    for (const run of gameRun?.runs ?? []) {
      for (const shot of run.shots ?? []) {
        const rel = shot.file ?? shot.path;
        if (!rel) continue;
        const pngPath = resolve(opts.reportDir, rel);
        if (!existsSync(pngPath)) continue;
        try {
          const { rgba, width, height } = decodePng(readFileSync(pngPath));
          const res = canvasBlankCheck(rgba as unknown as Uint8ClampedArray, width, height, [], limits);
          if (!res.pass) {
            findings.push(`shot ${run.run}/${shot.name ?? basename(rel)}: canvasBlankCheck failed (darkFraction ${res.darkFraction.toFixed(3)}, ${res.distinctColors} distinct colours)`);
          }
        } catch (err) {
          findings.push(`shot ${run.run}/${shot.name ?? basename(rel)}: could not decode PNG (${String(err)})`);
        }
      }
    }
  }

  const integratedCritical = opts.integratedCritical ?? [];
  const enginePending = integratedCritical.filter((c) => degradations.has(c));

  const env = opts.runReport?.environment ?? {};
  const card = {
    schema: "aura3d.game-scorecard/1",
    gameId,
    commit: opts.commit,
    round: opts.round,
    qrFlags: [...qrFlags],
    enginePending,
    captureRunId: opts.captureRunId,
    env: {
      runner: env.runner ?? "unknown",
      gpu: env.probeRenderer ?? "unknown",
      browser: env.browserVersion ?? "unknown"
    },
    vision,
    human,
    perf,
    findings
  } satisfies Omit<GameScorecard, "verdict" | "countedRound">;
  // Screening rounds are evaluated but the refusal lives in verdictDetailed —
  // non-G-PANEL builds throw there, which is the §7.3 "refuses to write" path.
  const v = verdictDetailed(card, opts.acceptance ?? DEFAULT_ACCEPTANCE);
  const rejected = v.verdict === "rejected";
  const countedRound: 0 | 1 | 2 = rejected
    ? (enginePending.length > 0 ? 0 : (Math.min((opts.priorCountedRejections ?? 0) + 1, 2) as 0 | 1 | 2))
    : 0;
  return { ...card, verdict: v.verdict, countedRound, findings: [...findings, ...v.reasons] };
}

const DEFAULT_ACCEPTANCE: ScorecardAcceptance = {
  minOverall: 7,
  minVisualCategory: 5,
  critical: {},
  minNonVisual: { sound_audio: 6, controls: 7, game_feel: 6.5, loading_transitions: 6 }
};

/* --------------------------------- verdict --------------------------------- */

export interface VerdictResult {
  readonly verdict: "accepted" | "rejected";
  readonly reasons: readonly string[];
}

/**
 * §6.3 integrated acceptance: `verdict(scorecard, acceptance, integratedCritical)`.
 * Throws (refuses) on non-G-PANEL rounds — screening rounds cannot accept, so a
 * verdict on one is meaningless. `integratedCritical` is accepted for the §7.3
 * signature; pending contracts already landed on the card as `enginePending`.
 */
export function verdict(
  scorecard: Omit<GameScorecard, "verdict" | "countedRound"> | GameScorecard,
  acceptance: ScorecardAcceptance = DEFAULT_ACCEPTANCE,
  integratedCritical?: readonly string[]
): "accepted" | "rejected" {
  const r = verdictDetailed(scorecard, acceptance);
  if (integratedCritical?.length && r.verdict === "rejected" && scorecard.enginePending.length > 0) {
    return "rejected"; // countedRound (0) is what the pending flag changes
  }
  return r.verdict;
}

export function verdictDetailed(
  scorecard: Omit<GameScorecard, "verdict" | "countedRound"> | GameScorecard,
  acceptance: ScorecardAcceptance = DEFAULT_ACCEPTANCE
): VerdictResult {
  if (!isGPanelRound(scorecard.round)) {
    throw new Error(`round "${scorecard.round}" is not a G-PANEL round (IC-k, k ≡ 0 mod 4); screening rounds cannot accept`);
  }
  const reasons: string[] = [];

  // 1. Vision judge medians across the card's judgements.
  if (scorecard.vision.length === 0) {
    reasons.push("no vision judgements recorded");
  } else {
    const medByCat = new Map<string, number>();
    for (const cat of GAME_VISUAL_CATEGORIES) {
      const vals = scorecard.vision.map((j) => j.scores?.[cat]).filter((v): v is number => typeof v === "number");
      if (vals.length) medByCat.set(cat, median(vals));
    }
    const overall = medByCat.get("overall_visual_quality") ?? NaN;
    if (!(overall >= acceptance.minOverall)) reasons.push(`vision overall ${overall.toFixed(2)} < ${acceptance.minOverall}`);
    for (const cat of GAME_VISUAL_CATEGORIES) {
      const m = medByCat.get(cat);
      if (m === undefined) { reasons.push(`vision category ${cat} missing`); continue; }
      if (m < acceptance.minVisualCategory) reasons.push(`vision ${cat} ${m} < ${acceptance.minVisualCategory}`);
    }
    for (const [cat, target] of Object.entries(acceptance.critical)) {
      const m = medByCat.get(cat);
      if (m === undefined || m < target) reasons.push(`critical ${cat} ${m?.toFixed(2) ?? "missing"} < ${target}`);
    }
    const comp = scorecard.vision.map((j) => (j as unknown as Record<string, unknown>).competitiveWithModernThree);
    if (comp.some((c) => c === false)) reasons.push("vision judge answered 'competitive with modern three.js': No");
  }

  // 2. Human panel: ≥ 3 humans, median overall ≥ 7, nobody below 6.
  if (scorecard.human.length < 3) {
    reasons.push(`only ${scorecard.human.length} human review(s) — §6.3 needs ≥ 3`);
  } else {
    const ids = new Set(scorecard.human.map((h) => h.judge.id));
    if (ids.size < scorecard.human.length) reasons.push("duplicate human judge ids");
    const overalls = scorecard.human.map((h) => h.visual?.overall_visual_quality).filter((v): v is number => typeof v === "number");
    const med = median(overalls);
    if (!(med >= acceptance.minOverall)) reasons.push(`human median overall ${med.toFixed(2)} < ${acceptance.minOverall}`);
    if (Math.min(...overalls) < 6) reasons.push(`a human reviewer scored overall ${Math.min(...overalls)} < 6`);
    // 3. Non-visual thresholds against acceptance.minNonVisual.
    for (const cat of GAME_NONVISUAL_CATEGORIES) {
      const need = acceptance.minNonVisual[cat];
      if (need === undefined) continue;
      const vals = scorecard.human.map((h) => (h.nonVisual as Record<string, number>)[cat]).filter((v): v is number => typeof v === "number");
      if (vals.length === 0) { reasons.push(`nonVisual ${cat} missing from every human review`); continue; }
      const m = median(vals);
      if (m < need) reasons.push(`nonVisual ${cat} median ${m} < ${need}`);
    }
    if (scorecard.human.some((h) => h.competitiveWithModernThree === false)) {
      reasons.push("a human reviewer answered 'competitive with modern three.js': No");
    }
  }

  // 5. Production health findings collected at build time fail the round.
  reasons.push(...scorecard.findings);

  return { verdict: reasons.length === 0 ? "accepted" : "rejected", reasons };
}

/* ----------------------------------- CLI ---------------------------------- */

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function argValues(args: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) if (args[i] === name && args[i + 1]) out.push(args[i + 1]);
  return out;
}

function main(argv: string[]): number {
  const gameId = argValue(argv, "--game");
  const runId = argValue(argv, "--run");
  const round = argValue(argv, "--round");
  if (!gameId || !runId || !round) {
    console.error("usage: scorecard.ts --game <id> --run <runId> --round <IC-k> [--report f] [--panel f] [--human f ...] [--prior-counted n] [--integrated-critical C-24,C-25] [--out dir] [--dry-run]");
    return 2;
  }
  const reportPath = argValue(argv, "--report")
    ?? `docs/project/aura3d-quality-rebuild/evidence/prd14/${runId}/report.json`;
  const reportDir = existsSync(reportPath) ? resolve(reportPath, "..") : undefined;
  const runReport = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) as CaptureRunReport : undefined;
  if (!runReport) console.error(`warning: no capture report at ${reportPath}`);

  const panelPath = argValue(argv, "--panel")
    ?? `benchmarks/quality-rebuild/history/rounds/${round}.json`;
  const panel = existsSync(panelPath) ? JSON.parse(readFileSync(panelPath, "utf8")) as PanelRoundRecord : undefined;
  if (!panel) console.error(`warning: no panel record at ${panelPath}`);

  const humanForms = argValues(argv, "--human")
    .flatMap((p) => existsSync(p) ? [p] : existsSync(`${p}/index.json`) ? [] : readdirSync(p).filter((f) => f.endsWith(".json")).map((f) => join(p, f)))
    .map((p) => JSON.parse(readFileSync(p, "utf8")) as HumanReviewDoc);

  const critical = argValue(argv, "--integrated-critical")?.split(",").filter(Boolean) ?? [];
  const prior = Number(argValue(argv, "--prior-counted") ?? "0");

  const card = buildScorecard({
    gameId,
    commit: runReport?.environment?.sha ?? "unknown",
    round,
    captureRunId: runId,
    runReport,
    panel,
    humanForms,
    priorCountedRejections: prior,
    integratedCritical: critical,
    reportDir
  });

  if (!isGPanelRound(round)) {
    console.error(`refusing to write: round ${round} is a screening round (§6.3 verdicts only on G-PANEL rounds)`);
    return 1;
  }
  if (card.verdict === "accepted" && (card.vision.length === 0 || card.human.length === 0)) {
    console.error("refusing to write accepted: required judgement fields missing");
    return 1;
  }

  if (argv.includes("--dry-run")) {
    console.log(JSON.stringify(card, null, 2));
    return card.verdict === "accepted" ? 0 : 1;
  }
  const outDir = argValue(argv, "--out") ?? `apps/${gameId}/art/scorecards`;
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${round}-${(card.commit ?? "unknown").slice(0, 8)}.json`);
  writeFileSync(file, JSON.stringify(card, null, 2) + "\n");
  console.log(`wrote ${file} (verdict: ${card.verdict}, countedRound: ${card.countedRound}, enginePending: ${card.enginePending.join(",") || "none"})`);
  return card.verdict === "accepted" ? 0 : 1;
}

const invokedAs = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedAs === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
