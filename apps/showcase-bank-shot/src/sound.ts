/**
 * Bank Shot sound — PRD-09 §10 step 5: a cues object over the shared
 * game-sfx-core pack, replacing billiards-audio.ts and the generated-WAV
 * pipeline (scripts/build-sfx.mjs). Every asset is a licensed pack id under
 * /packs/game-sfx-core/; {format} resolves to the probed encoding in the
 * C-25 engine path. Playback still unlocks on the first user gesture.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";

export type BankShotCue =
  | "cue-strike"
  | "cushion-hit"
  | "ball-hit"
  | "pocket-drop"
  | "rack-clear"
  | "foul-whistle"
  | "eight-win"
  | "rack-fail"
  | "combo-chime"
  | "ambient-hall";

const pk = (id: string) => ({
  url: `/packs/game-sfx-core/${id}.{format}`,
  license: "CC0",
});

const ids = (...stems: string[]) => stems.map(pk);

/** Route cue map → game-sfx-core ids (sports/table + shared UI/stingers/ambience). */
export const bankShotCues: Record<BankShotCue, { readonly bus: "sfx" | "ui" | "ambience"; readonly volume: number; readonly loop?: boolean; readonly asset: ReturnType<typeof ids> }> = {
  "cue-strike": { bus: "sfx", volume: 0.7, asset: ids("sports.ball-bounce-court.00", "sports.ball-bounce-court.01", "sports.ball-bounce-court.02") },
  "cushion-hit": { bus: "sfx", volume: 0.5, asset: ids("sports.cushion.00", "sports.cushion.01", "sports.cushion.02") },
  "ball-hit": { bus: "sfx", volume: 0.65, asset: ids("sports.billiard-clack.00", "sports.billiard-clack.01", "sports.billiard-clack.02") },
  "pocket-drop": { bus: "sfx", volume: 0.75, asset: ids("sports.pocket.00", "sports.pocket.01", "sports.pocket.02") },
  "rack-clear": { bus: "ui", volume: 0.8, asset: ids("stinger.checkpoint.00", "stinger.checkpoint.01") },
  "foul-whistle": { bus: "ui", volume: 0.75, asset: ids("ui.error.00", "ui.error.01") },
  "eight-win": { bus: "ui", volume: 0.85, asset: ids("stinger.win.00", "stinger.win.01") },
  "rack-fail": { bus: "ui", volume: 0.8, asset: ids("stinger.lose.00", "stinger.lose.01") },
  "combo-chime": { bus: "ui", volume: 0.6, asset: ids("ui.reward.00", "ui.reward.01") },
  "ambient-hall": { bus: "ambience", volume: 0.3, loop: true, asset: ids("ambience.interior-hum") }
};

export interface BankShotSoundController {
  readonly cue: (name: BankShotCue) => Promise<void>;
  readonly unlock: () => Promise<void>;
}

let cachedAudio: GameAudio<BankShotCue> | null = null;

export function createBankShotSound(): BankShotSoundController {
  if (!cachedAudio) {
    cachedAudio = createGameAudio({
      browserContext: true,
      buses: [
        { id: "sfx", volume: 0.85 },
        { id: "ui", volume: 0.6 },
        { id: "ambience", volume: 0.5 }
      ],
      cues: Object.fromEntries(
        Object.entries(bankShotCues).map(([cue, def]) => [cue, { id: cue, ...def }])
      ) as Parameters<typeof createGameAudio<BankShotCue>>[0]["cues"]
    });
  }
  const audio = cachedAudio;
  return {
    cue: (name) => audio.cue(name),
    unlock: () => audio.unlock()
  };
}
