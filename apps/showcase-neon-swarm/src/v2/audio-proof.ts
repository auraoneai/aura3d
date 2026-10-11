// apps/showcase-neon-swarm/src/v2/audio-proof.ts — S11 route audio proof (PRD-14 §16.1).
// Published as `evidence.audio.{synthCues,voicesPlayed,cuesPlayed}` inside the
// route's existing `audio` evidence section. Until C-25 game-sfx is real
// (#70, R-14-09) the route voices cues through its legacy audio module;
// `instrumentAudio` wraps that module so the proof counts only cue calls the
// module resolved:
//   voicesPlayed — cue plays the audio module resolved without error
//   synthCues    — of those, plays not backed by a licensed sample. Every route
//                  sfx in aura.assets.json is `author: "Aura3D synthesis"`
//                  (scripts/build-sfx.mjs), so SAMPLE_CUES is empty today
//   cuesPlayed   — art/direction.ts `audio[]` events voiced at least once
// C-25 `game.sound.proof()` replaces this file when the route adopts it.

export interface RouteAudioProof {
  readonly synthCues: number;
  readonly voicesPlayed: number;
  readonly cuesPlayed: readonly string[];
}

export interface RouteAudioProofRecorder {
  played(cue: string): void;
  snapshot(): RouteAudioProof;
}

export function createRouteAudioProof(
  directionEvent: Readonly<Record<string, string>>,
  sampleCues: ReadonlySet<string>
): RouteAudioProofRecorder {
  let voicesPlayed = 0;
  let synthCues = 0;
  const events = new Set<string>();
  return {
    played(cue) {
      voicesPlayed += 1;
      if (!sampleCues.has(cue)) synthCues += 1;
      const event = directionEvent[cue];
      if (event !== undefined) events.add(event);
    },
    snapshot: () => ({ synthCues, voicesPlayed, cuesPlayed: [...events] })
  };
}

/**
 * Wraps the listed controller methods: `null` = the first argument is the cue,
 * a string = the fixed cue that method voices. A play is recorded only once
 * the method's result resolves; the caller still receives the original result.
 */
export function instrumentAudio<T extends object>(
  controller: T,
  methods: Readonly<Record<string, string | null>>,
  proof: RouteAudioProofRecorder = audioProof
): T {
  return new Proxy(controller, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(methods, key)) return value.bind(target);
      const fixed = methods[key];
      return (...args: unknown[]) => {
        const result: unknown = value.apply(target, args);
        const cue = fixed ?? String(args[0]);
        void Promise.resolve(result).then(() => proof.played(cue), () => undefined);
        return result;
      };
    }
  });
}

/** Route cue → the art/direction.ts `audio[]` event it voices. */
const DIRECTION_EVENT: Readonly<Record<string, string>> = {
  "pulse-fire": "fire",
  "drone-hit": "hit",
  "drone-die": "explosion",
  "pickup": "pickup"
};

/** Route cues backed by a licensed sample (`provenance: "sample"`); none yet. */
const SAMPLE_CUES: ReadonlySet<string> = new Set<string>();

export const audioProof = createRouteAudioProof(DIRECTION_EVENT, SAMPLE_CUES);
