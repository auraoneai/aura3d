import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * Animation Studio BODY-MOTION gate — PRD Phase H (H1) + B1/B2.
 *
 * This gate fails on the EXACT defect the user reported: characters that "barely
 * move" — a speaking character whose only visible motion is its mouth, or a whole
 * scene that is nothing but the idle/talk fallback. It computes its verdict from
 * the REAL render artifact `render-live-summary.json` written by
 * `scripts/render-live.ts` (this gate never re-renders and never hard-codes a
 * pass).
 *
 * It measures BODY motion only, deliberately EXCLUDING:
 *  - mouth morph / viseme activity (`mouthOpenness`, mouth/jaw/lip bones),
 *  - caption pixels (captions are pixel overlays, never counted as body motion),
 *  - camera motion (`shot.cameraPosition` is ignored here).
 *
 * Real body-motion signals (all per character, all from the live render):
 *  - `bodyMotion[]` (the AUTHORITATIVE top-level summary scripts/render-live.ts writes):
 *    `bodyBoneRanges[bone].rangeRad` gives the body-bone rotation range over the shot, and
 *    `maxRootTranslation` the peak hips displacement (metres). This is the real field contract.
 *  - `seekProofs[].characters[].clipDecision.{bodyBoneRotationRad, rootTranslation, source}` — the
 *    actor's per-frame clip decision (same data, per sampled frame). Also accepts the synthetic-test
 *    shape `seekProofs[].characters[].boneRotationRanges` = {bone: rangeRad}. Mouth/jaw/lip/tongue/
 *    teeth bones are filtered out; at least one core body bone (shoulder/arm/spine/chest/head/hip/
 *    neck) must exceed the rotation threshold.
 *  - `seekProofs[].characters[].position` + `stagedPerformance` poses — root
 *    translation range over the shot (a character that walks/repositions passes
 *    on translation even with a sparse rig).
 *  - BROKEN-POSE detection: a character whose hips translation is IMPLAUSIBLE (clip magnitude or
 *    staged span > ~1.5m) is displaced/contorted — flung off-stage or collapsed to the floor — and
 *    FAILS (it is not counted as "moving"). This catches un-normalized raw-unit clips.
 *  - `seekProofs[].characters[].clipSource` — the clip the runtime actually played
 *    (embedded | extracted | procedural | fallback | idle | talk). A scene whose
 *    EVERY character only ever played `idle`/`talk`/`fallback` fails as "idle/talk
 *    fallback only".
 *  - dialogue windows (a character that speaks — has a caption attributed to it —
 *    must gesture with its BODY, not just move its mouth).
 *
 * Fails on missing / malformed / fake input rather than passing blindly.
 */

export interface AnimationStudioBodyMotionReport {
  readonly schema: "animation-studio-body-motion/v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly summaryPath: string;
  readonly summaryExists: boolean;
  readonly thresholds: BodyMotionThresholds;
  readonly metrics: BodyMotionMetrics;
  readonly characters: readonly CharacterBodyMotion[];
  readonly blockers: readonly string[];
}

export interface BodyMotionThresholds {
  /** Minimum (max-min) local rotation range, radians, for a core body bone. */
  readonly minBoneRotationRangeRad: number;
  /** Minimum root translation range (world units) to count as "moved by walking". */
  readonly minRootTranslationRange: number;
  /** Minimum characters that must show real body motion. */
  readonly minMovingBodies: number;
  /**
   * Maximum plausible sustained root (hips) translation magnitude, metres. A character whose hips
   * are displaced beyond this is broken/contorted (un-normalized raw-unit clip, or a pose that flung
   * the character off the stage / onto the floor) — that FAILS, it is not "moved by walking".
   */
  readonly maxPlausibleRootTranslation: number;
}

export interface BodyMotionMetrics {
  readonly characterCount: number;
  readonly movingBodyCount: number;
  /** Characters that speak (have a caption attributed) yet only move their mouth. */
  readonly mouthOnlySpeakerCount: number;
  /** Distinct clip sources seen across the whole scene. */
  readonly clipSources: readonly string[];
  /** True when every character's only clip source was idle/talk/fallback. */
  readonly idleTalkFallbackOnly: boolean;
  /** Characters whose pose is broken/displaced (implausible root translation / collapsed offset). */
  readonly displacedBodyCount: number;
}

export interface CharacterBodyMotion {
  readonly id: string;
  readonly speaks: boolean;
  /** Largest (max-min) rotation range across non-mouth body bones, radians. */
  readonly maxBodyBoneRotationRangeRad: number;
  /** Which bone produced that max range (for the per-character report). */
  readonly topBone: string | null;
  /** Per-bone rotation ranges that cleared the threshold (the "what moved" list). */
  readonly movingBones: readonly { readonly bone: string; readonly rangeRad: number }[];
  /** Root translation range (world units) over the shot. */
  readonly rootTranslationRange: number;
  /**
   * Peak root (hips) translation MAGNITUDE the actor's clip applied (metres), from the real render's
   * `bodyMotion[].maxRootTranslation`. Distinct from `rootTranslationRange`: this catches a character
   * the clip itself displaced/flung (un-normalized raw units), even when its staged position is static.
   */
  readonly rootTranslationMagnitude: number;
  /** Clip sources this character actually played. */
  readonly clipSources: readonly string[];
  /** Mouth openness range during this character's dialogue windows. */
  readonly mouthOpennessRange: number;
  readonly bodyMoves: boolean;
  readonly mouthOnlyWhileSpeaking: boolean;
  /** True when the pose is broken/displaced (implausible root translation / collapsed offset). */
  readonly displaced: boolean;
  readonly blockers: readonly string[];
}

export interface AnimationStudioBodyMotionOptions {
  readonly summaryPath?: string;
  readonly packageDir?: string;
  readonly out?: string;
  readonly generatedAt?: string;
  readonly minBoneRotationRangeRad?: number;
  readonly minRootTranslationRange?: number;
  readonly minMovingBodies?: number;
  readonly maxPlausibleRootTranslation?: number;
}

const defaultSummaryPath =
  "packages/create-aura3d/templates/animation-studio/dist/episodes/live-3d/render-live-summary.json";
const defaultOut = "tests/reports/animation-studio/body-motion.json";

/** Bones whose motion is mouth/face-only and MUST NOT count as body motion. */
const MOUTH_BONE = /mouth|jaw|lip|tongue|teeth|viseme|tooth|chin/i;
/** Core body bones we expect a real gesture/pose to touch. */
const CORE_BODY_BONE =
  /shoulder|arm|elbow|fore?arm|hand|wrist|spine|chest|torso|back|head|neck|hip|pelvis|root|clavicle|thigh|leg|knee|foot|ankle|finger/i;
/** Clip sources that are NOT real acting — only these mean "idle/talk fallback". */
const FALLBACK_CLIP_SOURCE = /^(idle|talk|fallback)$/i;

interface SeekCharacterClipDecision {
  readonly source?: string;
  readonly rootTranslation?: number;
  readonly bodyBoneRotationRad?: Readonly<Record<string, number>>;
}
interface SeekCharacter {
  readonly id?: string;
  readonly position?: readonly number[];
  readonly mouthOpenness?: number;
  readonly clipSource?: string;
  readonly clip?: string;
  /** Synthetic-fixture shape: collapsed per-bone rotation RANGE (max-min) over the shot, radians. */
  readonly boneRotationRanges?: Readonly<Record<string, number>>;
  /** Real render shape: the actor's per-frame clip decision (body-bone amplitudes + root translation). */
  readonly clipDecision?: SeekCharacterClipDecision;
}
interface SeekProof {
  readonly time?: number;
  readonly caption?: { readonly text?: string; readonly speakerId?: string } | null;
  readonly characters?: readonly SeekCharacter[];
}
interface StagedBeat {
  readonly characters?: readonly { readonly id?: string; readonly position?: readonly number[] }[];
}
/** A per-bone rotation range cell from the real render's top-level `bodyMotion[].bodyBoneRanges`. */
interface BodyBoneRangeCell {
  readonly minRad?: number;
  readonly maxRad?: number;
  readonly rangeRad?: number;
  readonly meanRad?: number;
}
/**
 * The REAL per-character body-motion summary scripts/render-live.ts writes at the TOP LEVEL of the
 * render summary (the authoritative field contract). `bodyBoneRanges` is `{bone: {rangeRad,…}}` and
 * `maxRootTranslation` is the peak hips-translation magnitude (metres) the actor applied.
 */
interface BodyMotionSummaryEntry {
  readonly characterId?: string;
  readonly clipSource?: string;
  readonly clipSourceCounts?: Readonly<Record<string, number>>;
  readonly maxRootTranslation?: number;
  readonly bodyBoneRanges?: Readonly<Record<string, BodyBoneRangeCell>>;
}
interface RenderLiveSummary {
  readonly stagedPerformance?: readonly StagedBeat[];
  readonly seekProofs?: readonly SeekProof[];
  readonly bodyMotion?: readonly BodyMotionSummaryEntry[];
}

function resolveSummaryPath(options: AnimationStudioBodyMotionOptions): string {
  if (options.summaryPath) return options.summaryPath;
  if (options.packageDir) return join(options.packageDir, "render-live-summary.json");
  return defaultSummaryPath;
}

export function createAnimationStudioBodyMotionReport(
  root = process.cwd(),
  options: AnimationStudioBodyMotionOptions = {}
): AnimationStudioBodyMotionReport {
  const summaryRel = resolveSummaryPath(options);
  const absoluteSummary = join(root, summaryRel);
  const summaryExists = existsSync(absoluteSummary);
  const summary = summaryExists ? (readJson(absoluteSummary) as RenderLiveSummary | null) : null;

  const thresholds: BodyMotionThresholds = {
    // ~5.7°: below this a "gesture" is invisible. The user's stiff output never
    // cleared this on any body bone.
    minBoneRotationRangeRad: options.minBoneRotationRangeRad ?? 0.1,
    minRootTranslationRange: options.minRootTranslationRange ?? 0.15,
    minMovingBodies: options.minMovingBodies ?? 2,
    // A clean hips translation on the metre standard rig is ≲1m (a stride + weight shift). Beyond
    // ~1.5m the character is displaced/contorted (raw-unit clip or a collapsed pose flinging the
    // hips off-stage / to the floor) — matches the loader sanity gate in animation-performance.ts.
    maxPlausibleRootTranslation: options.maxPlausibleRootTranslation ?? 1.5
  };

  const blockers: string[] = [];
  if (!summaryExists) {
    blockers.push(`${summaryRel} is missing — run scripts/render-live.ts to produce a real render.`);
  } else if (!summary) {
    blockers.push(`${summaryRel} is not valid JSON.`);
  }

  const characters = summary ? analyzeBodies(summary, thresholds) : [];
  const movingBodyCount = characters.filter((c) => c.bodyMoves).length;
  const mouthOnlySpeakerCount = characters.filter((c) => c.mouthOnlyWhileSpeaking).length;
  const displacedBodyCount = characters.filter((c) => c.displaced).length;

  const clipSourceSet = new Set<string>();
  for (const c of characters) for (const s of c.clipSources) clipSourceSet.add(s);
  const clipSources = [...clipSourceSet].sort();
  // "idle/talk fallback only" = there is at least one character, every clip source
  // seen is in the fallback set, and no body actually moved.
  const idleTalkFallbackOnly =
    characters.length > 0 &&
    clipSources.length > 0 &&
    clipSources.every((s) => FALLBACK_CLIP_SOURCE.test(s)) &&
    movingBodyCount === 0;

  if (summary) {
    if (characters.length === 0) {
      blockers.push(
        "No per-character motion samples found (seekProofs[].characters empty) — cannot prove body motion."
      );
    }
    if (idleTalkFallbackOnly) {
      blockers.push(
        `Whole scene is idle/talk fallback only (clip sources: ${clipSources.join(", ")}); no character plays real acting motion.`
      );
    }
    if (movingBodyCount < thresholds.minMovingBodies) {
      blockers.push(
        `Only ${movingBodyCount} character(s) show real body motion above ${thresholds.minBoneRotationRangeRad} rad / ` +
          `${thresholds.minRootTranslationRange} units; expected at least ${thresholds.minMovingBodies} (bodies appear stiff).`
      );
    }
    if (mouthOnlySpeakerCount > 0) {
      const ids = characters.filter((c) => c.mouthOnlyWhileSpeaking).map((c) => c.id);
      blockers.push(
        `Speaking character(s) only move their mouth, no body gesture: ${ids.join(", ")}.`
      );
    }
    if (displacedBodyCount > 0) {
      const ids = characters.filter((c) => c.displaced).map((c) => c.id);
      blockers.push(
        `Broken/displaced pose — character(s) flung off-stage or collapsed (root translation > ` +
          `${thresholds.maxPlausibleRootTranslation}m): ${ids.join(", ")}.`
      );
    }
    blockers.push(...characters.flatMap((c) => c.blockers.map((b) => `${c.id}: ${b}`)));
  }

  return {
    schema: "animation-studio-body-motion/v1",
    ok: blockers.length === 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    summaryPath: summaryRel,
    summaryExists,
    thresholds,
    metrics: {
      characterCount: characters.length,
      movingBodyCount,
      mouthOnlySpeakerCount,
      clipSources,
      idleTalkFallbackOnly,
      displacedBodyCount
    },
    characters,
    blockers
  };
}

function analyzeBodies(
  summary: RenderLiveSummary,
  thresholds: BodyMotionThresholds
): CharacterBodyMotion[] {
  // Per character, collect the max body-bone rotation range observed, root
  // positions (for translation range), clip sources, mouth ranges, and whether
  // the character speaks.
  const bonePeak = new Map<string, Map<string, number>>();
  const positions = new Map<string, number[][]>();
  const clipSources = new Map<string, Set<string>>();
  const mouthDuringDialogue = new Map<string, number[]>();
  const speaks = new Set<string>();
  // Peak root (hips) translation MAGNITUDE the clip applied, per character (from the real render's
  // `bodyMotion[].maxRootTranslation` / per-frame `clipDecision.rootTranslation`). Drives broken-pose
  // detection independently of staged-position span.
  const rootMagnitude = new Map<string, number>();

  const ensure = <V>(map: Map<string, V>, id: string, make: () => V): V => {
    let v = map.get(id);
    if (v === undefined) {
      v = make();
      map.set(id, v);
    }
    return v;
  };

  for (const beat of summary.stagedPerformance ?? []) {
    for (const c of beat.characters ?? []) {
      if (!c.id) continue;
      if (Array.isArray(c.position) && c.position.length >= 1) {
        ensure(positions, c.id, () => []).push([...c.position!]);
      }
    }
  }

  for (const seek of summary.seekProofs ?? []) {
    const captionActive = typeof seek.caption?.text === "string" && seek.caption.text.trim().length > 0;
    const speakerId = typeof seek.caption?.speakerId === "string" ? seek.caption.speakerId : null;
    if (captionActive && speakerId) speaks.add(speakerId);
    for (const c of seek.characters ?? []) {
      if (!c.id) continue;
      if (Array.isArray(c.position) && c.position.length >= 1) {
        ensure(positions, c.id, () => []).push([...c.position!]);
      }
      // Clip source — from the synthetic-fixture `clipSource` field OR the real render's
      // per-frame `clipDecision.source`.
      const src =
        typeof c.clipSource === "string" && c.clipSource.length > 0
          ? c.clipSource
          : typeof c.clipDecision?.source === "string" && c.clipDecision.source.length > 0
            ? c.clipDecision.source
            : null;
      if (src) ensure(clipSources, c.id, () => new Set<string>()).add(src.toLowerCase());
      // Track the PEAK rotation range per bone for this character. Two field shapes:
      //  - synthetic fixtures: `boneRotationRanges` = {bone: rangeRad},
      //  - real render: `clipDecision.bodyBoneRotationRad` = {bone: per-frame amplitudeRad}.
      const peak = ensure(bonePeak, c.id, () => new Map<string, number>());
      if (c.boneRotationRanges && typeof c.boneRotationRanges === "object") {
        for (const [bone, range] of Object.entries(c.boneRotationRanges)) {
          if (typeof range !== "number" || !Number.isFinite(range)) continue;
          peak.set(bone, Math.max(peak.get(bone) ?? 0, range));
        }
      }
      if (c.clipDecision?.bodyBoneRotationRad && typeof c.clipDecision.bodyBoneRotationRad === "object") {
        for (const [bone, amp] of Object.entries(c.clipDecision.bodyBoneRotationRad)) {
          if (typeof amp !== "number" || !Number.isFinite(amp)) continue;
          peak.set(bone, Math.max(peak.get(bone) ?? 0, amp));
        }
      }
      if (typeof c.clipDecision?.rootTranslation === "number" && Number.isFinite(c.clipDecision.rootTranslation)) {
        rootMagnitude.set(c.id, Math.max(rootMagnitude.get(c.id) ?? 0, Math.abs(c.clipDecision.rootTranslation)));
      }
      // Mouth openness only counts toward "is this speaker mouth-only" when a
      // caption is on screen (i.e. the character would actually be talking).
      if (captionActive && typeof c.mouthOpenness === "number") {
        ensure(mouthDuringDialogue, c.id, () => []).push(c.mouthOpenness);
      }
    }
  }

  // AUTHORITATIVE per-character body data: the top-level `bodyMotion[]` summary the real render
  // emits. `bodyBoneRanges[bone].rangeRad` is the body-bone rotation range over the whole shot, and
  // `maxRootTranslation` is the peak hips displacement (metres). We fold it into the same per-character
  // peaks so the gate reads the REAL field contract (not just the synthetic seek-character shape).
  for (const entry of summary.bodyMotion ?? []) {
    const id = entry.characterId;
    if (!id) continue;
    if (entry.bodyBoneRanges && typeof entry.bodyBoneRanges === "object") {
      const peak = ensure(bonePeak, id, () => new Map<string, number>());
      for (const [bone, cell] of Object.entries(entry.bodyBoneRanges)) {
        const range = typeof cell?.rangeRad === "number" ? cell.rangeRad : cell?.maxRad;
        if (typeof range !== "number" || !Number.isFinite(range)) continue;
        peak.set(bone, Math.max(peak.get(bone) ?? 0, range));
      }
    }
    if (typeof entry.maxRootTranslation === "number" && Number.isFinite(entry.maxRootTranslation)) {
      rootMagnitude.set(id, Math.max(rootMagnitude.get(id) ?? 0, Math.abs(entry.maxRootTranslation)));
    }
    const src = typeof entry.clipSource === "string" && entry.clipSource.length > 0 ? entry.clipSource : null;
    if (src) ensure(clipSources, id, () => new Set<string>()).add(src.toLowerCase());
  }

  const ids = new Set<string>([
    ...bonePeak.keys(),
    ...positions.keys(),
    ...clipSources.keys(),
    ...mouthDuringDialogue.keys(),
    ...rootMagnitude.keys()
  ]);

  const result: CharacterBodyMotion[] = [];
  for (const id of ids) {
    const peak = bonePeak.get(id) ?? new Map<string, number>();
    // Body bones only: exclude mouth/face, then rank by range.
    const bodyBones = [...peak.entries()].filter(
      ([bone]) => !MOUTH_BONE.test(bone) && (CORE_BODY_BONE.test(bone) || !looksLikeFaceBone(bone))
    );
    const movingBones = bodyBones
      .filter(([, range]) => range >= thresholds.minBoneRotationRangeRad)
      .map(([bone, rangeRad]) => ({ bone, rangeRad: round(rangeRad) }))
      .sort((a, b) => b.rangeRad - a.rangeRad);
    const top = bodyBones.sort((a, b) => b[1] - a[1])[0] ?? null;
    const maxBodyBoneRotationRangeRad = round(top ? top[1] : 0);
    const topBone = top ? top[0] : null;

    const positionSpan = translationRange(positions.get(id) ?? []);
    // The peak clip-applied hips displacement (metres). A character can be displaced by its own clip
    // even with a static staged position, so fold BOTH the staged-position span and the clip magnitude
    // into the "how far did the hips travel" signal used for broken-pose detection.
    const rootMag = rootMagnitude.get(id) ?? 0;
    const rootTranslationRange = positionSpan;

    const sources = [...(clipSources.get(id) ?? new Set<string>())].sort();
    const playsRealClip = sources.some((s) => !FALLBACK_CLIP_SOURCE.test(s));

    const mouthValues = mouthDuringDialogue.get(id) ?? [];
    const mouthRange = mouthValues.length > 0 ? Math.max(...mouthValues) - Math.min(...mouthValues) : 0;

    // BROKEN/DISPLACED POSE: the CLIP itself flung/collapsed the hips (un-normalized raw-unit
    // translation, or a pose that drops the character to the floor) — `rootMag` is the per-clip hips
    // displacement and must stay small. A large STAGED span is NOT broken: it is the character walking
    // across the stage via its blocking waypoints (legitimate locomotion). Only an ABSURD staged span
    // (beyond the whole stage, > STAGE_BOUND) is a staging bug. This split is what lets a walking scene
    // pass while still catching the contorted/floor-collapsed clip.
    const STAGE_BOUND = 25;
    const displaced = rootMag > thresholds.maxPlausibleRootTranslation || positionSpan > STAGE_BOUND;

    const rotationMoves = maxBodyBoneRotationRangeRad >= thresholds.minBoneRotationRangeRad;
    // Staged walking counts as real motion: the bound is the stage, not the per-clip displacement cap.
    const translationMoves =
      rootTranslationRange >= thresholds.minRootTranslationRange && rootTranslationRange <= STAGE_BOUND;
    // A displaced character is broken, not "moving" — exclude it from the moving-body count.
    const bodyMoves = !displaced && (rotationMoves || translationMoves);

    const isSpeaker = speaks.has(id);
    // A speaker that moved its mouth (range present) but whose body never cleared
    // the thresholds is the exact "lip-flap only" defect.
    const mouthOnlyWhileSpeaking = isSpeaker && mouthRange > 0.05 && !bodyMoves && !displaced;

    const charBlockers: string[] = [];
    if (displaced) {
      const reason =
        rootMag > thresholds.maxPlausibleRootTranslation
          ? `the CLIP flung/collapsed the hips ${round(rootMag)}m (> ${thresholds.maxPlausibleRootTranslation}m) — un-normalized clip or floor-collapse`
          : `staged ${round(positionSpan)}m off-stage (> 25m) — a staging bug`;
      charBlockers.push(`broken/displaced pose: ${reason}.`);
    } else if (!bodyMoves) {
      charBlockers.push(
        `stiff body: max body-bone rotation ${maxBodyBoneRotationRangeRad} rad (top bone ${topBone ?? "none"}), ` +
          `root translation ${round(rootTranslationRange)} — both below threshold.`
      );
    }
    if (isSpeaker && !playsRealClip && sources.length > 0) {
      charBlockers.push(`speaks but only played fallback clip source(s): ${sources.join(", ")}.`);
    }

    result.push({
      id,
      speaks: isSpeaker,
      maxBodyBoneRotationRangeRad,
      topBone,
      movingBones,
      rootTranslationRange: round(rootTranslationRange),
      rootTranslationMagnitude: round(rootMag),
      clipSources: sources,
      mouthOpennessRange: round(mouthRange),
      bodyMoves,
      mouthOnlyWhileSpeaking,
      displaced,
      blockers: charBlockers
    });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

function looksLikeFaceBone(bone: string): boolean {
  return /eye|brow|cheek|nose|ear|face/i.test(bone);
}

function translationRange(positions: readonly number[][]): number {
  if (positions.length < 2) return 0;
  const dims = Math.max(...positions.map((p) => p.length));
  let maxSpan = 0;
  for (let d = 0; d < dims; d += 1) {
    const values = positions.map((p) => (typeof p[d] === "number" ? p[d]! : 0));
    maxSpan = Math.max(maxSpan, Math.max(...values) - Math.min(...values));
  }
  return maxSpan;
}

export function writeAnimationStudioBodyMotionReport(
  root: string,
  report: AnimationStudioBodyMotionReport,
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
  currentScript.endsWith("tools/animation-studio-body-motion-gate/index.ts") ||
  currentScript.endsWith("tools/animation-studio-body-motion-gate/index.js")
) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = createAnimationStudioBodyMotionReport(root, {
    summaryPath: typeof args.summary === "string" ? args.summary : undefined,
    packageDir: typeof args["package-dir"] === "string" ? args["package-dir"] : undefined
  });
  writeAnimationStudioBodyMotionReport(root, report, typeof args.out === "string" ? args.out : defaultOut);
  for (const c of report.characters) {
    console.log(
      `character ${c.id}: speaks=${c.speaks} bodyRot=${c.maxBodyBoneRotationRangeRad}rad(${c.topBone ?? "-"}) ` +
        `rootTransRange=${c.rootTranslationRange} rootTransMag=${c.rootTranslationMagnitude} ` +
        `clip=[${c.clipSources.join(",")}] bodyMoves=${c.bodyMoves} displaced=${c.displaced} ` +
        `mouthOnly=${c.mouthOnlyWhileSpeaking}`
    );
  }
  if (!report.ok) {
    console.error(report.blockers.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(
      `PASS: ${report.metrics.movingBodyCount} character(s) with real body motion; no mouth-only speakers; not idle/talk-only.`
    );
  }
}
