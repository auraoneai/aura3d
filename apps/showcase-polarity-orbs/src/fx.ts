/** Game event → screen flash mapping over the kit ScreenFx (DOM only; the sim never sees any of it). */
import { ScreenFx, flashStrength, REDUCED_FLASH_CAP } from "../../../examples/shared/runner-kit/screen-fx";
import type { PolaritySound } from "./audio";
import { LOOK } from "./look";

export { ScreenFx, flashStrength, REDUCED_FLASH_CAP };

export interface Flash {
  readonly color: string;
  readonly strength: number;
}

/** One flash per cue; `polarity` is +1 (red) or -1 (blue). Burst/gameover use the reveal, not a flash. */
export function flashFor(sound: PolaritySound, polarity: number): Flash | null {
  const own = polarity === 1 ? LOOK.red : LOOK.blue;
  switch (sound) {
    case "flip": return { color: own, strength: 0.18 };
    case "collect": return { color: own, strength: 0.1 };
    case "wrong": return { color: "#ff3b30", strength: 0.3 };
    case "block": return { color: LOOK.mint, strength: 0.16 };
    case "powerup": return { color: LOOK.gold, strength: 0.15 };
    case "milestone": return { color: LOOK.gold, strength: 0.22 };
    case "start":
    case "burst":
    case "gameover":
      return null;
  }
}