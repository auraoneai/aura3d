import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * Animation Studio SUBTITLE TIMING gate — PRD Phase H (H1) + C1.
 *
 * Reads the REAL render artifact `render-live-summary.json` and checks that each
 * caption's ON-SCREEN duration (`captionProofs[].end - .start`) ≈ the estimated
 * time it would take to SPEAK that caption's text. Fails the exact defect the user
 * saw: subtitles that linger long after the line would have finished (fixed-window
 * timing), and the inverse (a long line flashed too briefly to read).
 *
 * Estimation: words-per-minute model (~160 wpm) with min/max bounds, a small
 * per-sentence punctuation pause, and short-interjection handling. The gate
 * tolerates a generous band around the estimate (captions legitimately hold a
 * beat past the last word) but FAILS on lingering (duration ≫ words/wpm + slack)
 * or starvation (duration ≪ estimate).
 *
 * Never hard-codes a pass; fails on missing/malformed input.
 */

export interface SubtitleTimingReport {
  readonly schema: "animation-studio-subtitle-timing/v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly summaryPath: string;
  readonly summaryExists: boolean;
  readonly thresholds: SubtitleThresholds;
  readonly captions: readonly CaptionTiming[];
  readonly blockers: readonly string[];
}

export interface SubtitleThresholds {
  readonly wordsPerMinute: number;
  readonly minDurationSeconds: number;
  /** Absolute slack (seconds) added to the estimate before "lingering". */
  readonly lingerSlackSeconds: number;
  /** Multiplicative ceiling: duration may be up to estimate*ceil + slack. */
  readonly lingerCeilingFactor: number;
  /** Duration may be no less than estimate*floor (starvation guard). */
  readonly starvationFloorFactor: number;
}

export interface CaptionTiming {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly onScreenSeconds: number;
  readonly wordCount: number;
  readonly estimatedSpeechSeconds: number;
  readonly lingers: boolean;
  readonly starved: boolean;
  readonly ok: boolean;
  readonly blockers: readonly string[];
}

export interface SubtitleTimingOptions {
  readonly summaryPath?: string;
  readonly packageDir?: string;
  readonly out?: string;
  readonly generatedAt?: string;
  readonly wordsPerMinute?: number;
  readonly minDurationSeconds?: number;
  readonly lingerSlackSeconds?: number;
  readonly lingerCeilingFactor?: number;
  readonly starvationFloorFactor?: number;
}

const defaultSummaryPath =
  "packages/create-aura3d/templates/animation-studio/dist/episodes/live-3d/render-live-summary.json";
const defaultOut = "tests/reports/animation-studio/subtitle-timing.json";

interface CaptionProof {
  readonly text?: string;
  readonly start?: number;
  readonly end?: number;
  readonly time?: number;
}
interface RenderLiveSummary {
  readonly captionProofs?: readonly CaptionProof[];
}

function resolveSummaryPath(options: SubtitleTimingOptions): string {
  if (options.summaryPath) return options.summaryPath;
  if (options.packageDir) return join(options.packageDir, "render-live-summary.json");
  return defaultSummaryPath;
}

/**
 * Estimate how long `text` would take to speak. Shared model:
 *  - words / wpm, then
 *  - + ~0.35s per sentence-ending punctuation (natural pause), then
 *  - clamped to [minDuration, ...]; single-word interjections get a small floor.
 */
export function estimateSpeechSeconds(
  text: string,
  wordsPerMinute = 160,
  minDurationSeconds = 0.8
): number {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return 0;
  const words = clean.split(" ").filter((w) => /[a-z0-9]/i.test(w)).length || 1;
  const base = (words / wordsPerMinute) * 60;
  const pauses = (clean.match(/[.!?]/g)?.length ?? 0) * 0.35;
  const commas = (clean.match(/[,;:]/g)?.length ?? 0) * 0.15;
  return Math.max(minDurationSeconds, base + pauses + commas);
}

export function countWords(text: string): number {
  return text.replace(/\s+/g, " ").trim().split(" ").filter((w) => /[a-z0-9]/i.test(w)).length;
}

export function createSubtitleTimingReport(
  root = process.cwd(),
  options: SubtitleTimingOptions = {}
): SubtitleTimingReport {
  const summaryRel = resolveSummaryPath(options);
  const absoluteSummary = join(root, summaryRel);
  const summaryExists = existsSync(absoluteSummary);
  const summary = summaryExists ? (readJson(absoluteSummary) as RenderLiveSummary | null) : null;

  const thresholds: SubtitleThresholds = {
    wordsPerMinute: options.wordsPerMinute ?? 160,
    minDurationSeconds: options.minDurationSeconds ?? 0.8,
    lingerSlackSeconds: options.lingerSlackSeconds ?? 1.5,
    lingerCeilingFactor: options.lingerCeilingFactor ?? 1.8,
    starvationFloorFactor: options.starvationFloorFactor ?? 0.55
  };

  const blockers: string[] = [];
  if (!summaryExists) {
    blockers.push(`${summaryRel} is missing — run scripts/render-live.ts to produce a real render.`);
  } else if (!summary) {
    blockers.push(`${summaryRel} is not valid JSON.`);
  }

  const captions: CaptionTiming[] = [];
  if (summary) {
    const proofs = summary.captionProofs ?? [];
    if (proofs.length === 0) {
      blockers.push("No caption proofs in the render summary — cannot verify subtitle timing.");
    }
    let missingWindows = 0;
    for (const p of proofs) {
      const text = typeof p.text === "string" ? p.text : "";
      const hasWindow = typeof p.start === "number" && typeof p.end === "number";
      if (!hasWindow) {
        missingWindows += 1;
        continue;
      }
      const start = p.start!;
      const end = p.end!;
      const onScreen = Math.max(0, end - start);
      const wordCount = countWords(text);
      const est = estimateSpeechSeconds(text, thresholds.wordsPerMinute, thresholds.minDurationSeconds);
      const lingerCeiling = est * thresholds.lingerCeilingFactor + thresholds.lingerSlackSeconds;
      const starvationFloor = est * thresholds.starvationFloorFactor;
      const lingers = onScreen > lingerCeiling;
      const starved = onScreen < starvationFloor && onScreen < est - thresholds.lingerSlackSeconds;
      const capBlockers: string[] = [];
      if (end <= start) {
        capBlockers.push(`caption "${snippet(text)}" has a non-positive on-screen window (start ${start} ≥ end ${end}).`);
      }
      if (lingers) {
        capBlockers.push(
          `caption "${snippet(text)}" lingers ${round(onScreen)}s on screen for ~${wordCount} word(s) ` +
            `(estimated ${round(est)}s, ceiling ${round(lingerCeiling)}s).`
        );
      }
      if (starved) {
        capBlockers.push(
          `caption "${snippet(text)}" is on screen only ${round(onScreen)}s for ~${wordCount} word(s) ` +
            `(estimated ${round(est)}s) — too brief to read.`
        );
      }
      captions.push({
        text,
        start,
        end,
        onScreenSeconds: round(onScreen),
        wordCount,
        estimatedSpeechSeconds: round(est),
        lingers,
        starved,
        ok: capBlockers.length === 0,
        blockers: capBlockers
      });
    }
    if (missingWindows > 0) {
      blockers.push(
        `${missingWindows} caption(s) lack start/end timing windows — render summary must emit captionProofs[].start/.end.`
      );
    }
    blockers.push(...captions.flatMap((c) => c.blockers));
  }

  return {
    schema: "animation-studio-subtitle-timing/v1",
    ok: blockers.length === 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    summaryPath: summaryRel,
    summaryExists,
    thresholds,
    captions,
    blockers
  };
}

function snippet(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 48 ? `${clean.slice(0, 45)}…` : clean;
}

export function writeSubtitleTimingReport(
  root: string,
  report: SubtitleTimingReport,
  out = defaultOut
): void {
  const absoluteOut = join(root, out);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function readJson(path: string): unknown | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
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
  currentScript.endsWith("tools/animation-studio-subtitle-timing-gate/index.ts") ||
  currentScript.endsWith("tools/animation-studio-subtitle-timing-gate/index.js")
) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = createSubtitleTimingReport(root, {
    summaryPath: typeof args.summary === "string" ? args.summary : undefined,
    packageDir: typeof args["package-dir"] === "string" ? args["package-dir"] : undefined
  });
  writeSubtitleTimingReport(root, report, typeof args.out === "string" ? args.out : defaultOut);
  for (const c of report.captions) {
    console.log(
      `caption "${snippet(c.text)}": onScreen=${c.onScreenSeconds}s est=${c.estimatedSpeechSeconds}s ` +
        `words=${c.wordCount} ${c.ok ? "OK" : c.lingers ? "LINGERS" : c.starved ? "STARVED" : "BAD"}`
    );
  }
  if (!report.ok) {
    console.error(report.blockers.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("PASS: caption on-screen durations match estimated speech duration.");
  }
}
