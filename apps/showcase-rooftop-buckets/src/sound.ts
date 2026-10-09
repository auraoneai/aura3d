/**
 * Rooftop Buckets sound — PRD-09 §10 step 5: a cues object over the shared
 * game-sfx-core pack, replacing buckets-audio.ts and the generated-WAV
 * pipeline (scripts/build-sfx.mjs). Every asset is a licensed pack id under
 * /packs/game-sfx-core/; {format} resolves to the probed encoding in the
 * C-25 engine path. Playback still unlocks on the first user gesture.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";

export type RooftopCue =
  | "chargeTick"
  | "rimClank"
  | "boardThud"
  | "swish"
  | "brickMiss"
  | "fireIgnite"
  | "goldBall"
  | "heatAdvance"
  | "buzzerFail"
  | "ambientRooftop";

const pk = (id: string) => ({
  url: `/packs/game-sfx-core/${id}.{format}`,
  license: "CC0",
});

const ids = (...stems: string[]) => stems.map(pk);

/** Route cue map → game-sfx-core ids (sports + shared UI/stingers/ambience). */
export const rooftopCues: Record<RooftopCue, { readonly bus: "sfx" | "ui" | "ambience"; readonly volume: number; readonly loop?: boolean; readonly asset: ReturnType<typeof ids> }> = {
  chargeTick: { bus: "ui", volume: 0.5, asset: ids("ui.score-tick.00", "ui.score-tick.01") },
  rimClank: { bus: "sfx", volume: 0.7, asset: ids("sports.rim.00", "sports.rim.01", "sports.rim.02") },
  boardThud: { bus: "sfx", volume: 0.65, asset: ids("sports.ball-bounce-hard.00", "sports.ball-bounce-hard.01", "sports.ball-bounce-hard.02") },
  swish: { bus: "sfx", volume: 0.8, asset: ids("sports.net-swish.00", "sports.net-swish.01", "sports.net-swish.02") },
  brickMiss: { bus: "sfx", volume: 0.7, asset: ids("sports.ball-bounce-court.00", "sports.ball-bounce-court.01", "sports.ball-bounce-court.02") },
  fireIgnite: { bus: "ui", volume: 0.85, asset: ids("stinger.level-start.00", "stinger.level-start.01") },
  goldBall: { bus: "ui", volume: 0.85, asset: ids("stinger.win.00", "stinger.win.01") },
  heatAdvance: { bus: "ui", volume: 0.8, asset: ids("stinger.checkpoint.00", "stinger.checkpoint.01") },
  buzzerFail: { bus: "ui", volume: 0.8, asset: ids("stinger.lose.00", "stinger.lose.01") },
  ambientRooftop: { bus: "ambience", volume: 0.35, loop: true, asset: ids("ambience.wind-high") }
};

export interface RooftopSoundController {
  readonly playCue: (name: RooftopCue, volume?: number) => void;
  readonly startAmbience: () => void;
  readonly stopAmbience: () => void;
  readonly unlock: () => Promise<void>;
  readonly audioCuesHeard: string[];
}

let cachedAudio: GameAudio<RooftopCue> | null = null;

export function createRooftopSound(): RooftopSoundController {
  if (!cachedAudio) {
    cachedAudio = createGameAudio({
      browserContext: true,
      buses: [
        { id: "sfx", volume: 0.85 },
        { id: "ui", volume: 0.6 },
        { id: "ambience", volume: 0.5 }
      ],
      cues: Object.fromEntries(
        Object.entries(rooftopCues).map(([cue, def]) => [cue, { id: cue, ...def }])
      ) as Parameters<typeof createGameAudio<RooftopCue>>[0]["cues"]
    });
  }
  const audio = cachedAudio;
  const heard: string[] = [];
  return {
    audioCuesHeard: heard,
    playCue: (name) => {
      heard.push(name);
      void audio.cue(name);
    },
    startAmbience: () => {
      void audio.unlock().then(() => audio.cue("ambientRooftop"));
    },
    stopAmbience: () => {
      void audio.stop?.("ambientRooftop");
    },
    unlock: () => audio.unlock()
  };
}
