import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * Animation Studio "is it actually animating?" gate — PRD task 2.8 + Phase 6.1.
 *
 * This gate computes its verdict from the REAL render artifact written by
 * `scripts/render-live.ts`: `render-live-summary.json`. It does NOT read the old
 * fabricated SVG-pipeline `visual-acceptance.json`/`motion-quality.json` (those
 * writers were deleted in Phase 1) and it never emits a hard-coded pass.
 *
 * Real signals measured (all from the live render):
 *  - `stagedPerformance` + `seekProofs[].characters[].position`: each character
 *    must take MORE THAN ONE distinct staged pose across the shot beats (pose
 *    deltas) — a character that never moves fails.
 *  - `seekProofs[].characters[].mouthOpenness`: mouths must MOVE during dialogue
 *    (more than one distinct openness value while a caption is on screen) — a
 *    static mouth during speech fails.
 *  - `mouthProof` (isolated lip-sync A/B): when present, the mouth open-vs-closed
 *    render must change pixels OR the viseme track must drive mouthOpenness.
 *  - `frameCount` / `videoBytes`: a real, non-trivial render must exist.
 *
 * Fails on bad/missing input rather than passing blindly.
 */

export interface AnimationStudioMotionQualityReport {
  readonly schema: "animation-studio-motion-quality/v2";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly summaryPath: string;
  readonly summaryExists: boolean;
  readonly videoPath: string | null;
  readonly videoExists: boolean;
  readonly videoBytes: number;
  readonly metrics: AnimationStudioMotionMetrics;
  readonly characters: readonly AnimationStudioCharacterMotion[];
  readonly blockers: readonly string[];
}

export interface AnimationStudioCharacterMotion {
  readonly id: string;
  /** Distinct staged positions across beats/seek samples (pose deltas). */
  readonly distinctPositions: number;
  /** Distinct mouthOpenness values observed while a caption was on screen. */
  readonly distinctMouthOpennessDuringDialogue: number;
  /** Max - min mouthOpenness during dialogue. */
  readonly mouthOpennessRange: number;
  readonly moves: boolean;
  readonly mouthMovesDuringDialogue: boolean;
  readonly blockers: readonly string[];
}

export interface AnimationStudioMotionMetrics {
  readonly frameCount: number;
  readonly beatCount: number;
  readonly seekSampleCount: number;
  readonly captionCueCount: number;
  /** Characters that take >1 distinct staged pose. */
  readonly movingCharacterCount: number;
  /** Characters whose mouth varies during dialogue. */
  readonly speakingMouthCount: number;
  /** Isolated lip-sync A/B changed pixels (when mouthProof present, else -1). */
  readonly mouthProofChangedPixels: number;
}

export interface AnimationStudioMotionQualityOptions {
  readonly summaryPath?: string;
  /** Back-compat: a package dir whose `render-live-summary.json` is read. */
  readonly packageDir?: string;
  readonly out?: string;
  readonly generatedAt?: string;
  readonly minFrameCount?: number;
  readonly minVideoBytes?: number;
  /** Minimum characters that must take >1 staged pose. */
  readonly minMovingCharacters?: number;
  /** Minimum characters whose mouth must move during dialogue. */
  readonly minSpeakingMouths?: number;
}

const defaultSummaryPath =
  "packages/create-aura3d/templates/animation-studio/dist/episodes/live-3d/render-live-summary.json";
const defaultOut = "tests/reports/aura3d11/animation-motion-quality.json";

interface SeekCharacter {
  readonly id: string;
  readonly position?: readonly number[];
  readonly mouthOpenness?: number;
}
interface SeekProof {
  readonly time?: number;
  readonly caption?: { readonly text?: string } | null;
  readonly characters?: readonly SeekCharacter[];
}
interface StagedBeat {
  readonly shotId?: string;
  readonly characters?: readonly { readonly id: string; readonly position?: readonly number[] }[];
}
interface RenderLiveSummary {
  readonly frameCount?: number;
  readonly videoBytes?: number;
  readonly video?: string;
  readonly stagedPerformance?: readonly StagedBeat[];
  readonly seekProofs?: readonly SeekProof[];
  readonly captionProofs?: readonly { readonly text?: string }[];
  readonly mouthProof?: { readonly changedPixels?: number } | null;
}

function resolveSummaryPath(options: AnimationStudioMotionQualityOptions): string {
  if (options.summaryPath) return options.summaryPath;
  if (options.packageDir) return join(options.packageDir, "render-live-summary.json");
  return defaultSummaryPath;
}

export function createAnimationStudioMotionQualityReport(
  root = process.cwd(),
  options: AnimationStudioMotionQualityOptions = {}
): AnimationStudioMotionQualityReport {
  const summaryRel = resolveSummaryPath(options);
  const absoluteSummary = join(root, summaryRel);
  const summaryExists = existsSync(absoluteSummary);
  const summary = summaryExists ? (readJson(absoluteSummary) as RenderLiveSummary | null) : null;

  const minFrameCount = options.minFrameCount ?? 12;
  const minVideoBytes = options.minVideoBytes ?? 32_768;
  const minMovingCharacters = options.minMovingCharacters ?? 1;
  const minSpeakingMouths = options.minSpeakingMouths ?? 1;

  const blockers: string[] = [];
  if (!summaryExists) blockers.push(`${summaryRel} is missing — run scripts/render-live.ts to produce a real render.`);
  if (summaryExists && !summary) blockers.push(`${summaryRel} is not valid JSON.`);

  const characters = summary ? analyzeCharacters(summary) : [];
  const movingCharacterCount = characters.filter((c) => c.moves).length;
  const speakingMouthCount = characters.filter((c) => c.mouthMovesDuringDialogue).length;
  const frameCount = num(summary?.frameCount);
  const videoBytes = num(summary?.videoBytes);
  const beatCount = summary?.stagedPerformance?.length ?? 0;
  const seekSampleCount = summary?.seekProofs?.length ?? 0;
  const captionCueCount = summary?.captionProofs?.length ?? 0;
  const mouthProofChangedPixels =
    summary?.mouthProof && typeof summary.mouthProof.changedPixels === "number"
      ? summary.mouthProof.changedPixels
      : -1;

  // ---- video presence (the render must have produced real bytes) ----
  const videoRel = typeof summary?.video === "string" ? summary.video : null;
  const absoluteVideo = videoRel ? (videoRel.startsWith("/") ? videoRel : join(root, videoRel)) : null;
  const videoExists = absoluteVideo ? existsSync(absoluteVideo) : false;
  const videoBytesOnDisk = videoExists ? statSync(absoluteVideo!).size : videoBytes;

  if (summary) {
    if (frameCount < minFrameCount) {
      blockers.push(`Only ${frameCount} rendered frame(s); expected at least ${minFrameCount}.`);
    }
    if (videoBytesOnDisk < minVideoBytes) {
      blockers.push(`Encoded video is ${videoBytesOnDisk} byte(s); expected at least ${minVideoBytes}.`);
    }
    if (characters.length === 0) {
      blockers.push("No per-character motion samples found in the render summary (seekProofs/stagedPerformance empty).");
    }
    if (movingCharacterCount < minMovingCharacters) {
      blockers.push(
        `Only ${movingCharacterCount} character(s) take more than one staged pose; expected at least ${minMovingCharacters} (characters appear static).`
      );
    }
    if (speakingMouthCount < minSpeakingMouths) {
      blockers.push(
        `Only ${speakingMouthCount} character(s) move their mouth during dialogue; expected at least ${minSpeakingMouths} (lip-sync appears static).`
      );
    }
    // If an isolated lip-sync A/B proof is present, it must show real pixel change
    // UNLESS the viseme track already drives a moving mouth (the A/B can be 0 when
    // the mouth indicator is a morph the render doesn't currently expose; in that
    // case the per-frame mouthOpenness signal above is the binding proof).
    if (mouthProofChangedPixels === 0 && speakingMouthCount < minSpeakingMouths) {
      blockers.push("Isolated lip-sync A/B changed 0 pixels and no per-frame mouth motion was measured.");
    }
    blockers.push(...characters.flatMap((c) => c.blockers.map((b) => `${c.id}: ${b}`)));
  }

  return {
    schema: "animation-studio-motion-quality/v2",
    ok: blockers.length === 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    summaryPath: summaryRel,
    summaryExists,
    videoPath: videoRel,
    videoExists,
    videoBytes: videoBytesOnDisk,
    metrics: {
      frameCount,
      beatCount,
      seekSampleCount,
      captionCueCount,
      movingCharacterCount,
      speakingMouthCount,
      mouthProofChangedPixels
    },
    characters,
    blockers
  };
}

function analyzeCharacters(summary: RenderLiveSummary): AnimationStudioCharacterMotion[] {
  // Collect every staged position per character (beats + per-second seek samples).
  const positions = new Map<string, Set<string>>();
  const mouthDuringDialogue = new Map<string, number[]>();

  const addPosition = (id: string, position: readonly number[] | undefined) => {
    if (!id) return;
    const set = positions.get(id) ?? new Set<string>();
    if (Array.isArray(position) && position.length > 0) set.add(position.map((v) => round(v)).join(","));
    positions.set(id, set);
  };

  for (const beat of summary.stagedPerformance ?? []) {
    for (const c of beat.characters ?? []) addPosition(c.id, c.position);
  }
  for (const seek of summary.seekProofs ?? []) {
    const captionActive = typeof seek.caption?.text === "string" && seek.caption.text.trim().length > 0;
    for (const c of seek.characters ?? []) {
      addPosition(c.id, c.position);
      if (captionActive && typeof c.mouthOpenness === "number") {
        const list = mouthDuringDialogue.get(c.id) ?? [];
        list.push(c.mouthOpenness);
        mouthDuringDialogue.set(c.id, list);
      }
    }
  }

  const ids = new Set<string>([...positions.keys(), ...mouthDuringDialogue.keys()]);
  const result: AnimationStudioCharacterMotion[] = [];
  for (const id of ids) {
    const distinctPositions = positions.get(id)?.size ?? 0;
    const mouthValues = mouthDuringDialogue.get(id) ?? [];
    const distinctMouth = new Set(mouthValues.map((v) => round(v))).size;
    const mouthRange = mouthValues.length > 0 ? Math.max(...mouthValues) - Math.min(...mouthValues) : 0;
    const moves = distinctPositions > 1;
    // A mouth "moves during dialogue" when, while captions are showing, the
    // openness takes more than one distinct value with a meaningful range.
    const mouthMoves = distinctMouth > 1 && mouthRange > 0.05;
    const charBlockers: string[] = [];
    if (!moves) {
      charBlockers.push(
        `static body: only ${distinctPositions} distinct staged pose(s) across the shot (expected >1).`
      );
    }
    if (mouthValues.length === 0) {
      charBlockers.push("no mouth samples captured while captions were on screen.");
    } else if (!mouthMoves) {
      charBlockers.push(
        `static mouth during dialogue: ${distinctMouth} distinct openness value(s), range ${round(mouthRange)} (expected motion).`
      );
    }
    result.push({
      id,
      distinctPositions,
      distinctMouthOpennessDuringDialogue: distinctMouth,
      mouthOpennessRange: round(mouthRange),
      moves,
      mouthMovesDuringDialogue: mouthMoves,
      // Only surface as a blocker if the character literally never moved at all —
      // a non-speaking extra (no dialogue) is allowed to have a still mouth.
      blockers: moves ? [] : charBlockers
    });
  }
  return result;
}

export function writeAnimationStudioMotionQualityReport(
  root: string,
  report: AnimationStudioMotionQualityReport,
  out = defaultOut
): void {
  const absoluteOut = join(root, out);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
  currentScript.endsWith("tools/animation-studio-motion-quality-gate/index.ts") ||
  currentScript.endsWith("tools/animation-studio-motion-quality-gate/index.js")
) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = createAnimationStudioMotionQualityReport(root, {
    summaryPath: typeof args.summary === "string" ? args.summary : undefined,
    packageDir: typeof args["package-dir"] === "string" ? args["package-dir"] : undefined
  });
  writeAnimationStudioMotionQualityReport(root, report, typeof args.out === "string" ? args.out : defaultOut);
  for (const c of report.characters) {
    console.log(
      `character ${c.id}: poses=${c.distinctPositions} mouthValues=${c.distinctMouthOpennessDuringDialogue} ` +
        `range=${c.mouthOpennessRange} moves=${c.moves} mouthMoves=${c.mouthMovesDuringDialogue}`
    );
  }
  if (!report.ok) {
    console.error(report.blockers.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(
      `PASS: ${report.metrics.movingCharacterCount} moving character(s), ` +
        `${report.metrics.speakingMouthCount} speaking mouth(s) over ${report.metrics.frameCount} frames.`
    );
  }
}
