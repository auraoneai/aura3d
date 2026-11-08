/**
 * Game event → screen flash mapping over the kit `ScreenFx`. Neon night identity: cyan hop, mint duck, gold PERFECT,
 * teal GOOD, hot-pink MISS. Reduced motion caps every flash at 0.1 and drops the vignette.
 */
import { ScreenFx, flashStrength, type SoundEvent } from "../../../examples/shared/runner-kit/index";
import type { BeatSound } from "./audio";
import { LOOK } from "./look";

export { ScreenFx, flashStrength };

export interface Flash {
  readonly color: string;
  readonly strength: number;
}

export function flashFor(event: SoundEvent<BeatSound>): Flash | null {
  switch (event.sound) {
    case "perfect": return { color: LOOK.perfect, strength: 0.22 };
    case "good": return { color: LOOK.good, strength: 0.12 };
    case "miss": return { color: LOOK.miss, strength: 0.3 };
    case "milestone": return { color: LOOK.gold, strength: 0.26 };
    case "gameover": return { color: LOOK.miss, strength: 0.34 };
    case "hop": return { color: LOOK.player, strength: 0.06 };
    case "duck": return { color: LOOK.playerDuck, strength: 0.06 };
    default: return null;
  }
}