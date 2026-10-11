/**
 * C-39 `aura3d prd08 motion-report` (PRD-08 S9). Reads the capture
 * `report.json` written by `benchmarks/quality-rebuild/capture.mjs` for the six
 * `prd08-motion-*` scenes and writes:
 *
 *   <out>/motion-report.md     per-scene, per-engine trajectory metrics + strips
 *   <out>/motion-report.json   the same summary, machine-readable
 *   <out>/strips/<scene>.<engine>.strip.png   12-tile strips from extra.motion
 *
 * Fails closed (exit 1) when the evidence is incomplete: report missing, an
 * expected scene or engine absent, a capture not `ready`, `extra.motion`
 * missing, fewer strip tiles than the spec asks for, or a blank strip tile.
 * Criterion checks (no inside-geometry frames, hit energy, FOV widening,
 * interpolated pacing) are reported per engine for the review rubric; they are
 * not a gate here — the motion review (review-rubric.md) judges them.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { AuraCliCommand } from "../../contracts/commands.js";

export const MOTION_SCENE_IDS = [
  "prd08-motion-chase-speed",
  "prd08-motion-impact-shake",
  "prd08-motion-flight-bank",
  "prd08-motion-collision",
  "prd08-motion-rail-shot",
  "prd08-motion-pacing-120"
] as const;

const DEFAULT_REPORT = "benchmarks/quality-rebuild/out/prd08-motion/report.json";
const EXPECTED_STRIP_FRAMES = 12;
const BLANK_VARIANCE = 2;

interface MotionMetricsShape {
  readonly samples: number;
  readonly maxEyeStep: number;
  readonly meanEyeSpeed: number;
  readonly hitchRatio: number;
  readonly fovRange: readonly [number, number];
  readonly rollRangeDeg: readonly [number, number];
  readonly eyeToSubject: { readonly min: number; readonly mean: number; readonly max: number };
  readonly insideColliderSteps: number;
  readonly energyPeak: number;
  readonly energyEnd: number;
  readonly subjectStepCv: number;
}

interface MotionExtraShape {
  readonly driver: string;
  readonly rig: string;
  readonly cameraLive?: boolean;
  readonly dt: number;
  readonly metrics: MotionMetricsShape;
  readonly strip?: { readonly frames: number; readonly lumaVariance: readonly number[]; readonly dataUrl: string };
}

interface EngineResultShape {
  readonly status: string;
  readonly error?: string;
  readonly screenshot?: string | null;
  readonly payload?: {
    readonly engineVersion?: string;
    readonly qrFlags?: readonly string[];
    readonly capabilityLog?: readonly { readonly feature: string; readonly status: string; readonly detail: string }[];
    readonly extra?: { readonly motion?: MotionExtraShape };
  };
}

interface CaptureReportShape {
  readonly environment?: { readonly gpu?: { readonly renderer?: string } | null; readonly githubRunId?: string | null; readonly browserVersion?: string };
  readonly scenes?: readonly { readonly scene: string; readonly engines: Readonly<Record<string, EngineResultShape>> }[];
}

export interface MotionCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

export interface MotionEngineRow {
  readonly scene: string;
  readonly engine: string;
  readonly status: string;
  readonly rig: string;
  readonly cameraLive: boolean | null;
  readonly metrics: MotionMetricsShape | null;
  readonly stripFrames: number;
  readonly blankTiles: number;
  readonly checks: readonly MotionCheck[];
  readonly gaps: readonly string[];
  readonly stripDataUrl?: string;
}

export interface MotionReportResult {
  readonly ok: boolean;
  readonly failures: readonly string[];
  readonly rows: readonly MotionEngineRow[];
  readonly gpu: string;
  readonly runId: string | null;
}

function criterionChecks(scene: string, m: MotionMetricsShape): MotionCheck[] {
  const checks: MotionCheck[] = [];
  if (scene.endsWith("chase-speed")) {
    checks.push({ name: "speed FOV widens", pass: m.fovRange[1] - m.fovRange[0] > 1, detail: `fov ${m.fovRange[0]}–${m.fovRange[1]}°` });
    checks.push({ name: "no lag oscillation (hitch < 1)", pass: m.hitchRatio < 1, detail: `hitch ${m.hitchRatio}` });
  } else if (scene.endsWith("impact-shake")) {
    checks.push({ name: "hit reaches the camera", pass: m.energyPeak > 0.05, detail: `energy peak ${m.energyPeak}` });
    checks.push({ name: "shake decays", pass: m.energyEnd < m.energyPeak, detail: `end ${m.energyEnd} < peak ${m.energyPeak}` });
  } else if (scene.endsWith("flight-bank")) {
    checks.push({ name: "camera banks", pass: Math.max(Math.abs(m.rollRangeDeg[0]), Math.abs(m.rollRangeDeg[1])) > 0.5, detail: `roll ${m.rollRangeDeg[0]}…${m.rollRangeDeg[1]}°` });
  } else if (scene.endsWith("collision")) {
    checks.push({ name: "no inside-geometry frames", pass: m.insideColliderSteps === 0, detail: `${m.insideColliderSteps} steps inside a column` });
    checks.push({ name: "probe pulled the eye in", pass: m.eyeToSubject.min < m.eyeToSubject.max - 0.25, detail: `eye→subject ${m.eyeToSubject.min}–${m.eyeToSubject.max}` });
  } else if (scene.endsWith("rail-shot")) {
    checks.push({ name: "no knot hitch (hitch < 0.25)", pass: m.hitchRatio < 0.25, detail: `hitch ${m.hitchRatio}` });
  } else if (scene.endsWith("pacing-120")) {
    checks.push({ name: "120 Hz presents evenly spaced (step CV < 0.35)", pass: m.subjectStepCv < 0.35, detail: `subject step CV ${m.subjectStepCv}` });
  }
  return checks;
}

export function buildMotionReport(report: CaptureReportShape, opts: { readonly scenes?: readonly string[]; readonly engines?: readonly string[] } = {}): MotionReportResult {
  const scenes = opts.scenes ?? MOTION_SCENE_IDS;
  const engines = opts.engines ?? ["aura3d", "three"];
  const failures: string[] = [];
  const rows: MotionEngineRow[] = [];
  for (const scene of scenes) {
    const entry = report.scenes?.find((candidate) => candidate.scene === scene);
    if (!entry) {
      failures.push(`${scene}: not in report.json`);
      continue;
    }
    for (const engine of engines) {
      const result = entry.engines[engine];
      if (!result) {
        failures.push(`${scene}/${engine}: no capture`);
        continue;
      }
      const motion = result.payload?.extra?.motion;
      const variances = motion?.strip?.lumaVariance ?? [];
      const blankTiles = variances.filter((v) => v <= BLANK_VARIANCE).length;
      const gaps = (result.payload?.capabilityLog ?? []).filter((c) => c.status === "missing" || c.status === "partial").map((c) => `${c.feature} (${c.status}): ${c.detail}`);
      if (result.status !== "ready") failures.push(`${scene}/${engine}: status ${result.status}${result.error ? ` — ${result.error.split("\n")[0]}` : ""}`);
      if (!motion) failures.push(`${scene}/${engine}: payload.extra.motion missing`);
      else {
        if ((motion.strip?.frames ?? 0) < EXPECTED_STRIP_FRAMES) failures.push(`${scene}/${engine}: strip has ${motion.strip?.frames ?? 0}/${EXPECTED_STRIP_FRAMES} tiles`);
        if (blankTiles > 0) failures.push(`${scene}/${engine}: ${blankTiles} blank strip tile(s)`);
        if (engine === "aura3d" && motion.cameraLive !== true) failures.push(`${scene}/${engine}: app.camera is the stub — capture without --flags camera?`);
      }
      rows.push({
        scene,
        engine,
        status: result.status,
        rig: motion?.rig ?? "-",
        cameraLive: motion?.cameraLive ?? null,
        metrics: motion?.metrics ?? null,
        stripFrames: motion?.strip?.frames ?? 0,
        blankTiles,
        checks: motion ? criterionChecks(scene, motion.metrics) : [],
        gaps,
        ...(motion?.strip?.dataUrl ? { stripDataUrl: motion.strip.dataUrl } : {})
      });
    }
  }
  return { ok: failures.length === 0, failures, rows, gpu: String(report.environment?.gpu?.renderer ?? "unknown"), runId: report.environment?.githubRunId ?? null };
}

const fmt = (x: number | undefined) => (x === undefined ? "-" : String(x));

export function renderMotionMarkdown(result: MotionReportResult, stripPaths: Readonly<Record<string, string>> = {}): string {
  const lines: string[] = [];
  lines.push("# PRD-08 S9 motion report");
  lines.push("");
  lines.push(`- GPU: ${result.gpu}`);
  lines.push(`- GitHub run: ${result.runId ?? "local"}`);
  lines.push(`- Evidence: ${result.ok ? "complete" : "INCOMPLETE"} (${result.rows.length} engine captures)`);
  lines.push("- three.js r0.185.1 rows are C-30 `admittedAsReference` behavioural references on identical scripted inputs — no parity claim.");
  lines.push("- Criterion checks below are review aids for `benchmarks/quality-rebuild/motion/review-rubric.md`, not gates.");
  lines.push("");
  if (result.failures.length > 0) {
    lines.push("## Evidence failures");
    lines.push("");
    for (const failure of result.failures) lines.push(`- ${failure}`);
    lines.push("");
  }
  lines.push("## Summary");
  lines.push("");
  lines.push("| scene | engine | status | rig | strip | max eye step | mean eye speed | hitch | fov range | roll range ° | eye→subject min/mean/max | inside steps | energy peak/end | subject step CV |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const row of result.rows) {
    const m = row.metrics;
    lines.push(
      `| ${row.scene} | ${row.engine} | ${row.status} | ${row.rig} | ${row.stripFrames} (${row.blankTiles} blank) | ${fmt(m?.maxEyeStep)} | ${fmt(m?.meanEyeSpeed)} | ${fmt(m?.hitchRatio)} | ${m ? `${m.fovRange[0]}–${m.fovRange[1]}` : "-"} | ${m ? `${m.rollRangeDeg[0]}…${m.rollRangeDeg[1]}` : "-"} | ${m ? `${m.eyeToSubject.min}/${m.eyeToSubject.mean}/${m.eyeToSubject.max}` : "-"} | ${fmt(m?.insideColliderSteps)} | ${m ? `${m.energyPeak}/${m.energyEnd}` : "-"} | ${fmt(m?.subjectStepCv)} |`
    );
  }
  lines.push("");
  for (const scene of [...new Set(result.rows.map((row) => row.scene))]) {
    lines.push(`## ${scene}`);
    lines.push("");
    for (const row of result.rows.filter((candidate) => candidate.scene === scene)) {
      lines.push(`### ${row.engine}`);
      lines.push("");
      const strip = stripPaths[`${row.scene}.${row.engine}`];
      if (strip) lines.push(`![${row.scene} ${row.engine} strip](${strip})`, "");
      for (const check of row.checks) lines.push(`- [${check.pass ? "x" : " "}] ${check.name} — ${check.detail}`);
      for (const gap of row.gaps) lines.push(`- gap: ${gap}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function readFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

export const motionReportCommand: AuraCliCommand = {
  name: "prd08 motion-report",
  owner: "prd08",
  summary: "Render the PRD-08 S9 motion-scene capture report (strips + trajectory metrics) as markdown; fails on incomplete evidence.",
  usage: "aura3d prd08 motion-report [--report <report.json>] [--out <dir>] [--scenes <id,id>] [--engines aura3d,three]",
  async run(argv, io) {
    const reportPath = resolve(io.cwd, readFlag(argv, "--report") ?? DEFAULT_REPORT);
    const outDir = resolve(io.cwd, readFlag(argv, "--out") ?? join(dirname(reportPath), "motion-report"));
    if (!existsSync(reportPath)) {
      io.stderr(`prd08 motion-report: ${reportPath} not found (run capture.mjs for the prd08-motion-* scenes first)`);
      return 1;
    }
    let report: CaptureReportShape;
    try {
      report = JSON.parse(readFileSync(reportPath, "utf8")) as CaptureReportShape;
    } catch (error) {
      io.stderr(`prd08 motion-report: cannot parse ${reportPath}: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
    const scenes = readFlag(argv, "--scenes")?.split(",").filter(Boolean);
    const engines = readFlag(argv, "--engines")?.split(",").filter(Boolean);
    const result = buildMotionReport(report, { ...(scenes ? { scenes } : {}), ...(engines ? { engines } : {}) });
    mkdirSync(join(outDir, "strips"), { recursive: true });
    const stripPaths: Record<string, string> = {};
    for (const row of result.rows) {
      const match = row.stripDataUrl?.match(/^data:image\/png;base64,(.+)$/);
      if (!match) continue;
      const file = join(outDir, "strips", `${row.scene}.${row.engine}.strip.png`);
      writeFileSync(file, Buffer.from(match[1]!, "base64"));
      stripPaths[`${row.scene}.${row.engine}`] = relative(outDir, file);
    }
    writeFileSync(join(outDir, "motion-report.md"), renderMotionMarkdown(result, stripPaths));
    const summary = { ...result, rows: result.rows.map(({ stripDataUrl: _strip, ...rest }) => rest) };
    writeFileSync(join(outDir, "motion-report.json"), JSON.stringify(summary, null, 2));
    io.stdout(`prd08 motion-report: ${result.rows.length} captures → ${join(outDir, "motion-report.md")}`);
    for (const failure of result.failures) io.stderr(`prd08 motion-report: ${failure}`);
    return result.ok ? 0 : 1;
  }
};
