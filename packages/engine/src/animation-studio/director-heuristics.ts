/**
 * director-heuristics.ts — the DETERMINISTIC tier of the Director.
 *
 * Given a scene's shots + dialogue + cast + walkable bounds + available props, it
 * GENERATES the blocking / camera / performance / set-dressing / world-state of an
 * EpisodeDocument — the parts that used to be hand-authored constants. No LLM, no
 * randomness beyond a seeded scatter, fully deterministic.
 *
 * HONEST SCOPE (see docs/animation-studio/quality-and-limitations.md): these rules target
 * the constrained genre the MVP targets — **1–2 characters, dialogue-driven, single
 * walkable set**. They reliably stage conversation: characters at conversation distance
 * facing each other, establishing→two-shot→close-up framing, the speaker emphasised in
 * close-ups, props scattered over the walkable area, world-state ramped across the act.
 * They do NOT handle action, crowds, complex choreography, or non-dialogue beats — those
 * are the LLM director's job (and remain unproven). The output is always a *valid*
 * document; "valid" is not "well-directed" — that needs the human rubric (the watchability gate).
 */

import type { CameraPresetId } from "../agent-api/CameraPresetLibrary";
import type { CharacterBlocking, PropPlacement, ShotBlocking, ShotSpec, Vec3 } from "./episode-document";

export interface DirectorCharacter {
  readonly id: string;
  /** Where the character starts the scene (drives a walk-in on the opening shot). */
  readonly entersFrom?: "left" | "right" | "none";
}

export interface DirectorShot {
  readonly shotId: string;
  readonly startTime: number;
  readonly endTime: number;
}

export interface DirectorDialogueLine {
  readonly lineId: string;
  readonly speakerId: string;
  readonly startTime: number;
  readonly endTime: number;
}

export interface DirectorPropSpec {
  readonly propId: string;
  readonly count: number;
  readonly scaleRange: readonly [number, number];
  readonly feetOffset: number;
}

export interface DirectorSceneInput {
  readonly duration: number;
  readonly characters: readonly DirectorCharacter[];
  readonly shots: readonly DirectorShot[];
  readonly dialogue: readonly DirectorDialogueLine[];
  /** Walkable area characters and props stay inside. */
  readonly walkableBounds: { readonly min: Vec3; readonly max: Vec3 };
  readonly props: readonly DirectorPropSpec[];
  /** Default clips on the cast (resolved fuzzily by the player). */
  readonly clips?: { readonly idle?: string; readonly walk?: string; readonly gesture?: string };
}

export interface DirectedScene {
  readonly shots: readonly ShotSpec[];
  readonly blocking: readonly CharacterBlocking[];
  readonly setDressing: readonly PropPlacement[];
  readonly worldState: { readonly glowSpanSeconds: number };
}

// --- small deterministic helpers ---
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function yawFacing(from: Vec3, to: Vec3): number {
  return Math.atan2(to[0] - from[0], to[2] - from[2]);
}

/** The character who speaks most during a shot (the shot's focus), or the first cast member. */
function shotSpeaker(input: DirectorSceneInput, shot: DirectorShot): string {
  const tally = new Map<string, number>();
  for (const line of input.dialogue) {
    const overlap = Math.min(line.endTime, shot.endTime) - Math.max(line.startTime, shot.startTime);
    if (overlap > 0) tally.set(line.speakerId, (tally.get(line.speakerId) ?? 0) + overlap);
  }
  let best = input.characters[0]?.id ?? "";
  let bestV = -1;
  for (const [id, v] of tally) if (v > bestV) { bestV = v; best = id; }
  return best;
}

/**
 * Stage a 1–2 character dialogue scene. Characters take base marks at conversation
 * distance facing each other; cameras cycle establishing → two-shot → close-up (the
 * close-up frames the active speaker); props scatter over the walkable bounds.
 */
export function directScene(sceneId: string, input: DirectorSceneInput): DirectedScene {
  const cast = input.characters;
  const { min, max } = input.walkableBounds;
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const idle = input.clips?.idle ?? "idle";
  const walk = input.clips?.walk ?? "walk";

  // Base marks: spread the cast left→right across ~40% of the walkable width, facing center.
  const span = (max[0] - min[0]) * 0.4;
  const baseMark = (i: number): Vec3 => {
    if (cast.length === 1) return [cx, 0, cz];
    const t = cast.length === 1 ? 0.5 : i / (cast.length - 1);
    return [cx + (t - 0.5) * span, 0, cz];
  };
  const center: Vec3 = [cx, 0, cz];

  const presets: CameraPresetId[] = ["establishing", "two-shot", "close-up"];

  const shots: ShotSpec[] = input.shots.map((shot, index) => {
    const speaker = shotSpeaker(input, shot);
    const presetId = presets[Math.min(index, presets.length - 1)]!;
    let cameraSubject: Vec3;
    if (presetId === "close-up") {
      const i = Math.max(0, cast.findIndex((c) => c.id === speaker));
      const m = baseMark(i < 0 ? 0 : i);
      cameraSubject = [m[0], -0.2, m[2]]; // head-ish focus on the speaker
    } else {
      cameraSubject = [cx, 0.75, cz]; // frame the conversation midpoint
    }
    return { shotId: shot.shotId, presetId, startTime: shot.startTime, endTime: shot.endTime, cameraSubject };
  });

  const blocking: CharacterBlocking[] = cast.map((character, i) => {
    const mark = baseMark(i);
    const faceCenter = yawFacing(mark, center);
    const beats: ShotBlocking[] = input.shots.map((shot, index) => {
      // Opening shot: optional walk-in from the side the character enters from.
      if (index === 0 && character.entersFrom && character.entersFrom !== "none") {
        const offX = character.entersFrom === "left" ? min[0] - 0.5 : max[0] + 0.5;
        const enterDur = Math.min(shot.endTime - shot.startTime, (input.duration) * 0.12);
        return {
          shotId: shot.shotId,
          clip: walk,
          waypoints: [
            { time: shot.startTime, position: [offX, 0, mark[2]], yaw: yawFacing([offX, 0, mark[2]], mark) },
            { time: shot.startTime + enterDur, position: mark, yaw: faceCenter }
          ]
        };
      }
      // Middle beats TRAVERSE: walk from the mark toward the shared focus across the shot
      // (a real 2-waypoint path, so characters move instead of looping in place).
      const isMiddle = index > 0 && index < input.shots.length - 1;
      if (isMiddle) {
        const converge: Vec3 = [mark[0] + (cx - mark[0]) * (index === 1 ? 0.45 : 0.25), 0, mark[2] + 0.25];
        return {
          shotId: shot.shotId,
          clip: walk,
          sweeping: i === 0,
          waypoints: [
            { time: shot.startTime, position: mark, yaw: yawFacing(mark, converge) },
            { time: shot.endTime, position: converge, yaw: yawFacing(converge, center) }
          ]
        };
      }
      // First/last beats: hold the mark, but FACE the active speaker (look-at / reaction),
      // and the speaker GESTURES in the close-up — breadth beyond a static two-shot.
      const speaker = shotSpeaker(input, input.shots[index]!);
      const spkIdx = Math.max(0, cast.findIndex((c) => c.id === speaker));
      const spkMark = baseMark(spkIdx);
      const facing = i === spkIdx ? faceCenter : yawFacing(mark, spkMark);
      const isClose = index === input.shots.length - 1;
      const gesture = input.clips?.gesture ?? "wave";
      const beatClip = isClose && i === spkIdx ? gesture : idle;
      return { shotId: shot.shotId, clip: beatClip, waypoints: [{ time: shot.startTime, position: mark, yaw: facing }] };
    });
    return { characterId: character.id, shots: beats };
  });

  // Deterministic prop scatter over the walkable bounds (seeded by scene id).
  const rand = mulberry32(hashSeed(sceneId));
  const setDressing: PropPlacement[] = [];
  for (const prop of input.props) {
    for (let n = 0; n < prop.count; n += 1) {
      const x = min[0] + rand() * (max[0] - min[0]);
      const z = min[2] + rand() * (max[2] - min[2]);
      const scale = prop.scaleRange[0] + rand() * (prop.scaleRange[1] - prop.scaleRange[0]);
      setDressing.push({ propId: prop.propId, position: [x, 0, z], scale, feetOffset: prop.feetOffset });
    }
  }

  return { shots, blocking, setDressing, worldState: { glowSpanSeconds: input.duration } };
}
