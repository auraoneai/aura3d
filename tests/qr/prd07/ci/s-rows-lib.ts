// 07 Phase D (FINISH-LANE-07, PRD-07 §17.1) — S1..S15 row evaluator, pure.
//
// Inputs are the artefacts one prd07-vfx.yml run produces (capture-vfx /
// capture-none report.json, games-vfx / games-none report.json), per-frame
// pixel measurements the CLI derives from the PNGs, optional C-32 judge
// records and optional human (H) sign-offs. Every §17 threshold maps to one
// check. Check classes:
//   engineering — the run itself is broken (non-ready, zero draws, missing
//                 flags, EFFECT_ZERO_PIXELS with vfx, readbacks ≠ 0). These
//                 fail the CI step.
//   evidence    — a measured threshold the PRD names (subjectPresence,
//                 skyVariance, fog reference, GPU particles, perf records).
//   judge       — C-32 vision-judge thresholds (two records per frame; a
//                 third breaks a > 1 point split).
//   human       — §17 **H** sign-off.
// A row is `pass` only when every check passes. `unmeasured` / `pending`
// never count as pass, so a row is never ticked without the evidence.

export type CheckClass = "engineering" | "evidence" | "judge" | "human";
export type CheckStatus = "pass" | "fail" | "pending" | "unmeasured";

export interface Check {
  readonly id: string;
  readonly cls: CheckClass;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface RowResult {
  readonly row: string;
  readonly status: "pass" | "fail" | "pending";
  readonly checks: readonly Check[];
}

export interface EngineResult {
  readonly status?: string;
  readonly payload?: {
    readonly drawCalls?: number;
    readonly errors?: readonly string[];
    readonly capabilityLog?: readonly { readonly feature: string; readonly status: string; readonly detail?: string }[];
    readonly extra?: { readonly qrFlags?: readonly string[]; readonly effects?: EffectsDiag | null };
  } | null;
}

export interface EffectsDiag {
  readonly nodes?: readonly { readonly id: string; readonly effect: string; readonly live?: number; readonly drawCalls?: number; readonly instancesDrawn?: number; readonly sim?: string; readonly zeroPixelFrames?: number }[];
  readonly liveParticles?: number;
  readonly batches?: number;
  readonly gpuMs?: number;
  readonly deviceReadbacks?: number;
  readonly errors?: readonly { readonly code: string; readonly nodeId: string; readonly message: string }[];
}

export interface CaptureReportLike {
  readonly environment?: { readonly githubRunId?: string | null; readonly ciProvider?: string; readonly runnerImage?: string | null };
  readonly scenes?: readonly { readonly scene: string; readonly engines?: Record<string, EngineResult | undefined> }[];
}

export interface GameRunLike {
  readonly run: string;
  readonly url?: string;
  readonly error?: string;
  readonly pageErrors?: readonly string[];
  readonly missingShots?: readonly string[];
  readonly blankShots?: readonly string[];
  readonly shots?: readonly { readonly name: string; readonly error?: string }[];
}

export interface GamesReportLike {
  readonly games?: readonly { readonly id: string; readonly error?: string; readonly runs?: readonly GameRunLike[] }[];
}

/** Per-frame pixel measurements (CLI-derived; null = not measurable). */
export interface FrameMeasure {
  readonly subjectPresence?: number | null;
  readonly skyVariance?: number | null;
  readonly skyVarianceSource?: "sky-mask" | "frame-top-region";
}

/**
 * C-32 judge record, normalised over the two C-32 shapes in
 * tools/quality-gate/src/types.ts: BenchmarkJudgementRecord (`scores.aura` /
 * `scores.reference`, category from `category`) and GameJudgementRecord
 * (`scores[category]`).
 */
export interface JudgeRecordLike {
  readonly itemId: string;
  readonly judge?: { readonly model?: string; readonly id?: string } | string;
  readonly category?: string;
  readonly scores: Readonly<Record<string, number | undefined>>;
  readonly flags?: readonly string[];
  readonly differences?: readonly { readonly text?: string; readonly cls?: string }[];
}

export interface HumanSignoff {
  readonly row: string;
  readonly by: string;
  readonly at: string;
  readonly verdict: "pass" | "fail";
  readonly note?: string;
}

export interface PhaseDInputs {
  readonly vfx: CaptureReportLike | null;
  readonly none: CaptureReportLike | null;
  readonly gamesVfx: GamesReportLike | null;
  readonly gamesNone: GamesReportLike | null;
  /** key: `<scene>` (vfx arm). */
  readonly frames: Readonly<Record<string, FrameMeasure>>;
  readonly judges: readonly JudgeRecordLike[];
  readonly signoffs: readonly HumanSignoff[];
}

export const S4_HOUR_SCENES = ["prd07-sky-h06", "prd07-sky-h09", "prd07-sky-h12", "prd07-sky-h18", "prd07-sky-h21"] as const;
export const S3_KIND_COUNT = 14;
export const S11_ELEMENTS = ["trail", "beam", "lightCone", "auroraRibbon"] as const;

// ---------------------------------------------------------------- helpers

export function sceneEngine(report: CaptureReportLike | null, scene: string, engine: "aura3d" | "three"): EngineResult | undefined {
  return report?.scenes?.find((s) => s.scene === scene)?.engines?.[engine];
}

function check(id: string, cls: CheckClass, ok: boolean | null, detail: string, whenNull: CheckStatus = "unmeasured"): Check {
  return { id, cls, status: ok === null ? whenNull : ok ? "pass" : "fail", detail };
}

/** Engineering basics for one scene in the vfx arm. */
export function sceneBasics(input: PhaseDInputs, scene: string, flags: readonly string[], needThree: boolean): Check[] {
  const aura = sceneEngine(input.vfx, scene, "aura3d");
  const out: Check[] = [];
  if (!aura) return [check(`${scene}:captured`, "engineering", false, "scene absent from the vfx capture report")];
  out.push(check(`${scene}:ready`, "engineering", aura.status === "ready", `aura3d status=${aura.status}`));
  out.push(check(`${scene}:draws`, "engineering", (aura.payload?.drawCalls ?? 0) > 0, `drawCalls=${aura.payload?.drawCalls ?? 0}`));
  const have = new Set(aura.payload?.extra?.qrFlags ?? []);
  const missing = flags.filter((f) => !have.has(f));
  out.push(check(`${scene}:flags`, "engineering", missing.length === 0, missing.length ? `qrFlags missing ${missing.join(",")}` : `qrFlags ⊇ ${flags.join(",")}`));
  const zero = (aura.payload?.extra?.effects?.errors ?? []).filter((e) => e.code === "EFFECT_ZERO_PIXELS");
  out.push(check(`${scene}:zero-pixels`, "engineering", zero.length === 0, zero.length ? `EFFECT_ZERO_PIXELS on ${zero.map((e) => e.nodeId).join(",")}` : "no EFFECT_ZERO_PIXELS with vfx"));
  if (needThree) {
    const three = sceneEngine(input.vfx, scene, "three");
    out.push(check(`${scene}:three-ready`, "engineering", three?.status === "ready", `three r185 reference status=${three?.status ?? "absent"}`));
  }
  return out;
}

export function liveParticles(input: PhaseDInputs, scene: string, min = 1): Check {
  const fx = sceneEngine(input.vfx, scene, "aura3d")?.payload?.extra?.effects;
  if (!fx) return check(`${scene}:particles-live`, "engineering", false, "diagnostics().effects absent with vfx on");
  return check(`${scene}:particles-live`, "engineering", (fx.liveParticles ?? 0) >= min, `liveParticles=${fx.liveParticles ?? 0} (≥ ${min})`);
}

export function capability(input: PhaseDInputs, scene: string, feature: string): Check {
  const log = sceneEngine(input.vfx, scene, "aura3d")?.payload?.capabilityLog ?? [];
  const entry = log.find((e) => e.feature === feature);
  return check(`${scene}:cap:${feature}`, "engineering", entry ? entry.status === "supported" : false, entry ? `${feature}: ${entry.status}${entry.detail ? ` — ${entry.detail}` : ""}` : `${feature}: not in capabilityLog`);
}

// ---------------------------------------------------------------- judges / H

/** One record's score for `category` on the aura (or reference) side. */
export function recordScore(r: JudgeRecordLike, category: string, side: "aura" | "reference"): number | null {
  if (side === "aura" && typeof r.scores[category] === "number") return r.scores[category]!;
  if (r.category !== undefined && r.category !== category) return null;
  const v = r.scores[side];
  return typeof v === "number" ? v : null;
}

/**
 * Panel score per §17: two judges; a > 1 point split needs a third, and the
 * median of three decides. Returns null (pending) below two records or on an
 * unbroken split.
 */
export function panelScore(records: readonly JudgeRecordLike[], category: string, side: "aura" | "reference"): { score: number | null; n: number; why: string } {
  const scores = records.map((r) => recordScore(r, category, side)).filter((v): v is number => v !== null);
  if (scores.length < 2) return { score: null, n: scores.length, why: `${scores.length}/2 judge records for ${category}/${side}` };
  if (scores.length === 2) {
    const [a, b] = scores as [number, number];
    if (Math.abs(a - b) > 1) return { score: null, n: 2, why: `judges split ${a} vs ${b} (> 1) — third judge needed` };
    return { score: (a + b) / 2, n: 2, why: `mean of ${a}, ${b}` };
  }
  const sorted = [...scores].sort((x, y) => x - y);
  const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  return { score: mid, n: scores.length, why: `median of ${scores.join(", ")}` };
}

export interface JudgeRule {
  readonly item: string;
  readonly category: string;
  /** absolute minimum on the aura side */
  readonly min?: number;
  /** aura ≥ reference(three r185, same record) − delta */
  readonly vsReferenceMinus?: number;
  /** aura ≥ panel(item `vsItem`) + delta (games: `<id>@vfx` vs `<id>@none`) */
  readonly vsItem?: { readonly item: string; readonly plus: number };
  /** any record carrying one of these flags fails the rule */
  readonly forbidFlags?: readonly string[];
  /** every record must carry each of these flags */
  readonly requireFlags?: readonly string[];
}

export function judgeCheck(input: PhaseDInputs, rule: JudgeRule): Check {
  const id = `judge:${rule.item}:${rule.category}`;
  const records = input.judges.filter((r) => r.itemId === rule.item);
  const aura = panelScore(records, rule.category, "aura");
  if (aura.score === null) return { id, cls: "judge", status: "pending", detail: aura.why };
  const parts = [`aura ${rule.category} ${aura.score} (${aura.why})`];
  let ok = true;
  if (rule.min !== undefined) { ok &&= aura.score >= rule.min; parts.push(`min ${rule.min}`); }
  if (rule.vsReferenceMinus !== undefined) {
    const ref = panelScore(records, rule.category, "reference");
    if (ref.score === null) return { id, cls: "judge", status: "pending", detail: `${parts.join("; ")}; reference ${ref.why}` };
    ok &&= aura.score >= ref.score - rule.vsReferenceMinus;
    parts.push(`≥ three ${ref.score} − ${rule.vsReferenceMinus}`);
  }
  if (rule.vsItem) {
    const base = panelScore(input.judges.filter((r) => r.itemId === rule.vsItem!.item), rule.category, "aura");
    if (base.score === null) return { id, cls: "judge", status: "pending", detail: `${parts.join("; ")}; baseline ${rule.vsItem.item} ${base.why}` };
    ok &&= aura.score >= base.score + rule.vsItem.plus;
    parts.push(`≥ ${rule.vsItem.item} ${base.score} + ${rule.vsItem.plus}`);
  }
  for (const flag of rule.forbidFlags ?? []) {
    const hit = records.filter((r) => (r.flags ?? []).includes(flag) || (r.differences ?? []).some((d) => (d.text ?? "").toLowerCase().includes(flag.replace(/-/g, " "))));
    if (hit.length) { ok = false; parts.push(`flagged "${flag}" by ${hit.length} judge(s)`); }
  }
  for (const flag of rule.requireFlags ?? []) {
    const missing = records.filter((r) => !(r.flags ?? []).includes(flag)).length;
    if (missing) { ok = false; parts.push(`"${flag}" not confirmed by ${missing} judge(s)`); }
  }
  return { id, cls: "judge", status: ok ? "pass" : "fail", detail: parts.join("; ") };
}

export function humanCheck(input: PhaseDInputs, row: string): Check {
  const s = input.signoffs.filter((x) => x.row === row);
  if (s.length === 0) return { id: `human:${row}`, cls: "human", status: "pending", detail: "§17 H sign-off not recorded" };
  const fail = s.find((x) => x.verdict === "fail");
  return { id: `human:${row}`, cls: "human", status: fail ? "fail" : "pass", detail: s.map((x) => `${x.by} ${x.verdict} ${x.at}${x.note ? ` (${x.note})` : ""}`).join("; ") };
}

export function rowResult(row: string, checks: readonly Check[]): RowResult {
  const status = checks.some((c) => c.status === "fail") ? "fail" : checks.length > 0 && checks.every((c) => c.status === "pass") ? "pass" : "pending";
  return { row, status, checks };
}

// ---------------------------------------------------------------- games

export function gameBasics(input: PhaseDInputs, game: string): Check[] {
  const out: Check[] = [];
  for (const [arm, report] of [["vfx", input.gamesVfx], ["none", input.gamesNone]] as const) {
    const g = report?.games?.find((x) => x.id === game);
    if (!g) { out.push(check(`${game}@${arm}:captured`, "engineering", false, `game absent from games-${arm} report`)); continue; }
    const runs = g.runs ?? [];
    const problems = [
      ...(g.error ? [`game error: ${g.error}`] : []),
      ...(runs.length === 0 ? ["no runs"] : []),
      ...runs.flatMap((r) => [
        ...(r.error ? [`${r.run}: ${r.error}`] : []),
        ...((r.missingShots ?? []).length ? [`${r.run}: missing ${r.missingShots!.join(",")}`] : []),
        ...((r.blankShots ?? []).length ? [`${r.run}: blank ${r.blankShots!.join(",")}`] : []),
        ...((r.pageErrors ?? []).length ? [`${r.run}: ${r.pageErrors!.length} page error(s)`] : [])
      ])
    ];
    out.push(check(`${game}@${arm}:healthy`, "engineering", problems.length === 0, problems.length ? problems.join("; ") : `${runs.length} run(s), all shots present and non-blank`));
    const url = runs[0]?.url ?? "";
    const armed = /[?&]a3d-qr=[^&]*\bvfx\b/.test(decodeURIComponent(url));
    out.push(check(`${game}@${arm}:flags`, "engineering", arm === "vfx" ? armed : !armed, `captured url ${arm === "vfx" ? "carries" : "omits"} vfx: ${armed}`));
  }
  return out;
}
