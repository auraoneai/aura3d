/// <reference types="node" />
// Sightline gate: plays every story and every show segment through the real (headless) stage and director, the
// way the app does (stage actions, then the beat's focus), and checks each beat once its actions have settled:
//
//   1. every subject (named, counted, pointed at or tap target) keeps >= 90% of its silhouette visible;
//   2. members of a counted set overlap each other by <= 10%;
//   3. featured characters (subjects and the speaker) face the camera within 60 degrees unless walking.
//
// Each unit plays twice: once silently (every wait times out) and once tapping the first target of every invite
// (so tap-specific responses and "more" rounds play). Positions are measured with the camera preset the beat uses,
// on a 16:9 desktop and a 390x844 phone screen. Beats marked `deliberateHiding` are skipped.
//
//   ./node_modules/.bin/tsx tools/sightline-gate.ts [--before] [--json] [--id <story or show id>]
//
// `--before` turns the stage's sightline staging off to measure what the content looked like without it.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { segmentToEpisodeSpec } from "../src/app.js";
import { AUDIO_MANIFEST } from "../src/audio-manifest.js";
import { STORIES } from "../src/content/catalog.js";
import { estimateLineMs } from "../src/content/schema.js";
import { SHOWS } from "../src/content/shows/index.js";
import { en } from "../src/localization/en/index.js";
import { createEpisodeDirector } from "../src/runtime/episode-director.js";
import { FACE_MAX_RAD, SIGHT_ASPECTS, beatForSnapshot, focusForSnapshot, subjectFramedPose } from "../src/scenes/sightlines.js";
import { yawToCamera } from "../src/scenes/spots.js";
import { createStage, type WonderStage } from "../src/scenes/stage.js";
import { ASSET_TRAITS } from "../src/scenes/stand-ins.js";
import type { DirectorEffect, StorySpec } from "../src/types.js";

export interface SightlineGateProblem {
  readonly unit: string;
  readonly beat: string;
  readonly line: string;
  readonly run: "silent" | "tap";
  readonly rule: "covered" | "counted-overlap" | "out-of-frame" | "facing";
  readonly subject: string;
  readonly by: string;
  readonly amount: number;
  readonly screen: string;
}

export interface SightlineGateUnit {
  readonly id: string;
  readonly story: StorySpec;
}

const TICK_MS = 50;
const MAX_STEPS = 60_000;
/** Facing is judged with a little slack for turn easing and per-frame noise. */
const FACE_TOLERANCE_RAD = (6 * Math.PI) / 180;

const lineMs = (key: string): number => AUDIO_MANIFEST.lines[key]?.durationMs ?? estimateLineMs(en.lines[key] ?? key);

/** Every story plus every show segment (as the app plays it). */
export function sightlineUnits(filter?: string): SightlineGateUnit[] {
  const units: SightlineGateUnit[] = STORIES.map((story) => ({ id: story.id, story }));
  for (const show of SHOWS) {
    for (const seg of show.segments) units.push({ id: `${show.id}/${seg.id}`, story: segmentToEpisodeSpec(show, seg) });
  }
  if (!filter) return units;
  return units.filter((u) => u.id === filter || u.id.startsWith(`${filter}/`) || u.story.id === filter);
}

function wrap(a: number): number {
  let d = a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

async function playUnit(stage: WonderStage, unit: SightlineGateUnit, run: "silent" | "tap", out: SightlineGateProblem[]): Promise<void> {
  const story = unit.story;
  await stage.load(story);
  const director = createEpisodeDirector(story, { lineMs });
  const seen = new Set<string>();
  let speaker: string | null = null;
  const tapQueue: { target: string; inMs: number }[] = [];

  // The beat whose focus is on stage (the director's snapshot moves on before its next actions are applied).
  let label: { readonly beatId: string | null; readonly round: number } = { beatId: null, round: 0 };
  const measure = (settled = true): void => {
    const snap = label;
    const beat = beatForSnapshot(story, snap.beatId, snap.round);
    if (!beat) return;
    const focus = focusForSnapshot(story, snap);
    if (focus.deliberateHiding) return;
    const line = beat.lines[0]?.key ?? beat.response?.lines[0]?.key ?? "";
    const where = `${unit.id}|${snap.round}|${beat.id}`;
    const push = (p: Omit<SightlineGateProblem, "unit" | "beat" | "line" | "run">): void => {
      const key = `${where}|${p.rule}|${p.subject}|${p.by}|${p.screen}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (process.env.SIGHT_DEBUG && (p.rule !== "facing")) {
        const state = stage.sightlineStates().map((n) => ({ ...n, asset: "", moving: false, carriedBy: n.carriedBy ?? null }));
        const dbgPreset = stage.snapshot().camera;
        const fits = SIGHT_ASPECTS.map(({ name, aspect }) => {
          const fitted = subjectFramedPose(stage.sightlineStates(), focus, dbgPreset, aspect);
          return `${name}:cam=${fitted.position.map((v) => v.toFixed(2)).join(",")}`;
        }).join(" ");
        console.error(`DEBUG ${where} ${p.rule} ${p.subject}<-${p.by} preset=${dbgPreset} subjects=${focus.subjects.join(",")} ${fits}`);
        for (const n of state) console.error(`   ${n.id.padEnd(14)} ${n.asset.padEnd(14)} @ ${n.position.map((v) => v.toFixed(2)).join(",")} size ${n.size.map((v) => v.toFixed(2)).join(",")}${n.carriedBy ? ` carriedBy ${n.carriedBy}` : ""}${n.moving ? " moving" : ""}`);
      }
      out.push({ unit: unit.id, beat: snap.round > 0 ? `${beat.id}#${snap.round}` : beat.id, line, run, ...p });
    };
    for (const v of stage.sightlineViolations()) {
      push({ rule: v.kind, subject: v.subject, by: v.by, amount: v.amount, screen: v.screen });
    }
    if (!settled) return;
    // Facing: subjects and the speaker who are characters, standing still, looking at a node.
    const preset = stage.snapshot().camera;
    const featured = new Set([...focus.subjects, ...(speaker ? [speaker] : [])]);
    for (const n of stage.spatialState()) {
      if (!n.visible || n.moving || n.role !== "actor" || !featured.has(n.id)) continue;
      // Vehicles (GoGo the train) face along their rails; only characters that can turn are judged.
      if (ASSET_TRAITS[n.asset].turns !== "partial") continue;
      // Riders (Momo in a carriage) face along the ride.
      if (n.carriedBy !== null) continue;
      // The stage turns characters toward the camera of the screen it draws on; a headless stage draws 16:9, so facing is
      // judged on that screen (a phone stage clamps toward the phone camera the same way; see the unit tests).
      for (const { name, aspect } of SIGHT_ASPECTS.filter((a) => a.name === "desktop")) {
        const off = Math.abs(wrap(n.yaw - yawToCamera(n.position, subjectFramedPose(stage.sightlineStates(), focus, preset, aspect))));
        if (off > FACE_MAX_RAD + FACE_TOLERANCE_RAD) push({ rule: "facing", subject: n.id, by: "camera", amount: off, screen: name });
      }
    }
  };

  const route = (effects: readonly DirectorEffect[]): void => {
    for (const eff of effects) {
      if (eff.type === "stage") {
        measure(); // the previous part has settled: judge it before the next actions start
        stage.apply(eff.actions);
        const snap = director.snapshot();
        label = { beatId: snap.beatId, round: snap.round };
        stage.setFocus(focusForSnapshot(story, snap));
      } else if (eff.type === "speak") {
        speaker = eff.line.speaker;
      } else if (eff.type === "targets") {
        stage.setTargets(eff.targets);
        if (run === "tap" && eff.targets && eff.targets.length > 0) tapQueue.splice(0, tapQueue.length, { target: eff.targets[0]!, inMs: 900 });
      }
    }
  };

  route(director.send({ type: "START", mode: "play-together" }));
  for (let i = 0; i < MAX_STEPS && director.snapshot().phase !== "finished"; i += 1) {
    route(director.send({ type: "TICK", dtMs: TICK_MS }));
    stage.update(TICK_MS / 1000);
    const tap = tapQueue[0];
    if (tap) {
      tap.inMs -= TICK_MS;
      if (tap.inMs <= 0) {
        tapQueue.shift();
        route(director.send({ type: "TAP", target: tap.target }));
      }
    }
    // Judge each part once it has settled: just before its hold ends is when the picture reads longest.
    if (i % 20 === 19) measure(false);
  }
  measure();
}

export async function runSightlineGate(
  options: { readonly before?: boolean; readonly filter?: string; readonly units?: readonly SightlineGateUnit[] } = {}
): Promise<{
  readonly problems: readonly SightlineGateProblem[];
  readonly units: number;
}> {
  const units = options.units ?? sightlineUnits(options.filter);
  const stage = await createStage({ target: null, reducedMotion: false, mountTimeoutMs: 50, sightlines: options.before !== true });
  const problems: SightlineGateProblem[] = [];
  try {
    for (const unit of units) {
      await playUnit(stage, unit, "silent", problems);
      await playUnit(stage, unit, "tap", problems);
    }
  } finally {
    stage.dispose();
  }
  return { problems, units: units.length };
}

export function formatSightlineProblem(p: SightlineGateProblem): string {
  const amount = p.rule === "facing" ? `${Math.round((p.amount * 180) / Math.PI)}° from the camera` : `${Math.round(p.amount * 100)}%`;
  const what =
    p.rule === "covered"
      ? `"${p.subject}" is ${amount} hidden by "${p.by}"`
      : p.rule === "counted-overlap"
        ? `counted "${p.subject}" and "${p.by}" overlap ${amount}`
        : p.rule === "out-of-frame"
          ? `"${p.subject}" is ${amount} off the screen edge`
        : `"${p.subject}" faces ${amount}`;
  const text = en.lines[p.line];
  return `${p.unit} / ${p.beat} [${p.screen}, ${p.run}]: ${what}${p.line ? ` — line ${p.line}${text ? ` "${text}"` : ""}` : ""}`;
}

async function runCli(args: readonly string[]): Promise<number> {
  const before = args.includes("--before");
  const json = args.includes("--json");
  const idIndex = args.indexOf("--id");
  const filter = idIndex >= 0 ? args[idIndex + 1] : undefined;
  const result = await runSightlineGate({ before, ...(filter !== undefined ? { filter } : {}) });
  if (json) {
    console.log(JSON.stringify(result, null, 1));
  } else {
    for (const p of result.problems) console.log(formatSightlineProblem(p));
    console.log(`sightline gate${before ? " (staging off)" : ""}: ${result.problems.length} problem(s) across ${result.units} stories and show segments`);
  }
  return before || result.problems.length === 0 ? 0 : 1;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  runCli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    }
  );
}
