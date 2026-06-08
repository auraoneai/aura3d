import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * Animation Studio LIP-SYNC TIMING gate — PRD Phase H (H1) + B7/C.
 *
 * Reads the REAL render artifact `render-live-summary.json` and asserts that the
 * mouth ACTUALLY MOVES during dialogue and never holds a single open value for an
 * unnaturally long time. It never hard-codes a pass and fails on missing input.
 *
 * Defects this fails on (the user saw both):
 *  - a speaking character whose mouth is static while a caption is on screen
 *    (lip-sync absent), and
 *  - a long static "mouth-open hold" — the mouth opens once and stays open across
 *    many consecutive samples instead of cycling with syllable cadence.
 *
 * Signals (per character, from `seekProofs[].characters[].mouthOpenness` while a
 * caption is on screen for that character's dialogue window):
 *  - distinct openness values + range during dialogue (must vary),
 *  - longest run of consecutive samples held at the same (non-zero) openness
 *    (a "hold") — must be below `maxStaticOpenHoldSeconds`.
 */

export interface LipSyncTimingReport {
  readonly schema: "animation-studio-lip-sync-timing/v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly summaryPath: string;
  readonly summaryExists: boolean;
  readonly thresholds: LipSyncThresholds;
  readonly characters: readonly CharacterLipSync[];
  readonly blockers: readonly string[];
}

export interface LipSyncThresholds {
  readonly minMouthRange: number;
  readonly minDistinctOpenness: number;
  /** Longest allowed run (seconds) of the mouth held open at one value. */
  readonly maxStaticOpenHoldSeconds: number;
  readonly minSpeakingMouths: number;
}

export interface CharacterLipSync {
  readonly id: string;
  readonly speaks: boolean;
  readonly dialogueSampleCount: number;
  readonly mouthRange: number;
  readonly distinctOpenness: number;
  /** Longest consecutive run (seconds) held at one non-zero openness. */
  readonly longestStaticOpenHoldSeconds: number;
  readonly mouthMovesDuringDialogue: boolean;
  readonly blockers: readonly string[];
}

export interface LipSyncTimingOptions {
  readonly summaryPath?: string;
  readonly packageDir?: string;
  readonly out?: string;
  readonly generatedAt?: string;
  readonly minMouthRange?: number;
  readonly minDistinctOpenness?: number;
  readonly maxStaticOpenHoldSeconds?: number;
  readonly minSpeakingMouths?: number;
}

const defaultSummaryPath =
  "packages/create-aura3d/templates/animation-studio/dist/episodes/live-3d/render-live-summary.json";
const defaultOut = "tests/reports/animation-studio/lip-sync-timing.json";

interface SeekCharacter {
  readonly id?: string;
  readonly mouthOpenness?: number;
}
interface SeekProof {
  readonly time?: number;
  readonly caption?: { readonly text?: string; readonly speakerId?: string } | null;
  readonly characters?: readonly SeekCharacter[];
}
interface RenderLiveSummary {
  readonly seekProofs?: readonly SeekProof[];
  readonly frameRate?: number;
}

function resolveSummaryPath(options: LipSyncTimingOptions): string {
  if (options.summaryPath) return options.summaryPath;
  if (options.packageDir) return join(options.packageDir, "render-live-summary.json");
  return defaultSummaryPath;
}

export function createLipSyncTimingReport(
  root = process.cwd(),
  options: LipSyncTimingOptions = {}
): LipSyncTimingReport {
  const summaryRel = resolveSummaryPath(options);
  const absoluteSummary = join(root, summaryRel);
  const summaryExists = existsSync(absoluteSummary);
  const summary = summaryExists ? (readJson(absoluteSummary) as RenderLiveSummary | null) : null;

  const thresholds: LipSyncThresholds = {
    minMouthRange: options.minMouthRange ?? 0.15,
    minDistinctOpenness: options.minDistinctOpenness ?? 3,
    maxStaticOpenHoldSeconds: options.maxStaticOpenHoldSeconds ?? 2.5,
    minSpeakingMouths: options.minSpeakingMouths ?? 1
  };

  const blockers: string[] = [];
  if (!summaryExists) {
    blockers.push(`${summaryRel} is missing — run scripts/render-live.ts to produce a real render.`);
  } else if (!summary) {
    blockers.push(`${summaryRel} is not valid JSON.`);
  }

  const characters = summary ? analyze(summary, thresholds) : [];
  const speakingMouths = characters.filter((c) => c.speaks && c.mouthMovesDuringDialogue).length;

  if (summary) {
    if (characters.filter((c) => c.speaks).length === 0) {
      blockers.push("No speaking characters with mouth samples found during any caption window.");
    }
    if (speakingMouths < thresholds.minSpeakingMouths) {
      blockers.push(
        `Only ${speakingMouths} speaking character(s) show real mouth motion during dialogue; expected at least ${thresholds.minSpeakingMouths}.`
      );
    }
    blockers.push(...characters.flatMap((c) => c.blockers.map((b) => `${c.id}: ${b}`)));
  }

  return {
    schema: "animation-studio-lip-sync-timing/v1",
    ok: blockers.length === 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    summaryPath: summaryRel,
    summaryExists,
    thresholds,
    characters,
    blockers
  };
}

function analyze(summary: RenderLiveSummary, thresholds: LipSyncThresholds): CharacterLipSync[] {
  // Per character, the ordered list of mouthOpenness samples while a caption is on
  // screen, plus the sample times (for hold-duration), and whether they speak.
  const samples = new Map<string, { time: number; openness: number }[]>();
  const speaks = new Set<string>();
  const seeks = [...(summary.seekProofs ?? [])].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));

  for (const seek of seeks) {
    const captionActive = typeof seek.caption?.text === "string" && seek.caption.text.trim().length > 0;
    if (!captionActive) continue;
    const speakerId = typeof seek.caption?.speakerId === "string" ? seek.caption.speakerId : null;
    if (speakerId) speaks.add(speakerId);
    for (const c of seek.characters ?? []) {
      if (!c.id || typeof c.mouthOpenness !== "number") continue;
      const list = samples.get(c.id) ?? [];
      list.push({ time: typeof seek.time === "number" ? seek.time : list.length, openness: c.mouthOpenness });
      samples.set(c.id, list);
    }
  }

  const result: CharacterLipSync[] = [];
  for (const [id, list] of samples) {
    const opens = list.map((s) => s.openness);
    const range = opens.length > 0 ? Math.max(...opens) - Math.min(...opens) : 0;
    const distinct = new Set(opens.map((v) => round(v))).size;
    const hold = longestStaticOpenHold(list);
    // Treat a character as "speaks" when a caption was attributed to it; if the
    // summary omits speakerId we conservatively treat any character with mouth
    // samples during a caption as a potential speaker so the gate still bites.
    const isSpeaker = speaks.has(id) || speaks.size === 0;
    const moves = range >= thresholds.minMouthRange && distinct >= thresholds.minDistinctOpenness;

    const charBlockers: string[] = [];
    if (isSpeaker && !moves) {
      charBlockers.push(
        `static mouth during dialogue: range ${round(range)} (< ${thresholds.minMouthRange}), ` +
          `${distinct} distinct value(s) (< ${thresholds.minDistinctOpenness}).`
      );
    }
    if (hold > thresholds.maxStaticOpenHoldSeconds) {
      charBlockers.push(
        `long static mouth-open hold of ${round(hold)}s (> ${thresholds.maxStaticOpenHoldSeconds}s) — mouth frozen open.`
      );
    }

    result.push({
      id,
      speaks: isSpeaker,
      dialogueSampleCount: list.length,
      mouthRange: round(range),
      distinctOpenness: distinct,
      longestStaticOpenHoldSeconds: round(hold),
      mouthMovesDuringDialogue: moves,
      blockers: charBlockers
    });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Longest consecutive run (in seconds) where the mouth is held OPEN at the same
 * rounded openness value (> 0). Closed-mouth holds are fine (pauses between words).
 */
function longestStaticOpenHold(samples: readonly { time: number; openness: number }[]): number {
  let longest = 0;
  let runStart: number | null = null;
  let runValue: number | null = null;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i]!;
    const v = round(s.openness);
    const open = v > 0.05;
    if (open && runValue !== null && v === runValue) {
      // continue the run
    } else if (open) {
      runStart = s.time;
      runValue = v;
    } else {
      runStart = null;
      runValue = null;
    }
    if (open && runStart !== null) {
      longest = Math.max(longest, s.time - runStart);
    }
  }
  return longest;
}

export function writeLipSyncTimingReport(
  root: string,
  report: LipSyncTimingReport,
  out = defaultOut
): void {
  const absoluteOut = join(root, out);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
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
  currentScript.endsWith("tools/animation-studio-lip-sync-timing-gate/index.ts") ||
  currentScript.endsWith("tools/animation-studio-lip-sync-timing-gate/index.js")
) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = createLipSyncTimingReport(root, {
    summaryPath: typeof args.summary === "string" ? args.summary : undefined,
    packageDir: typeof args["package-dir"] === "string" ? args["package-dir"] : undefined
  });
  writeLipSyncTimingReport(root, report, typeof args.out === "string" ? args.out : defaultOut);
  for (const c of report.characters) {
    console.log(
      `character ${c.id}: speaks=${c.speaks} range=${c.mouthRange} distinct=${c.distinctOpenness} ` +
        `hold=${c.longestStaticOpenHoldSeconds}s moves=${c.mouthMovesDuringDialogue}`
    );
  }
  if (!report.ok) {
    console.error(report.blockers.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("PASS: mouths move during dialogue, no long static open holds.");
  }
}
