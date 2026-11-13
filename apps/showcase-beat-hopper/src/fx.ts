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
    case "perfect": return { color: LOOK.perfect, strength: 0.16 };
    case "good": return { color: LOOK.good, strength: 0.10 };
    case "miss": return { color: LOOK.miss, strength: 0.18 };
    case "milestone": return { color: LOOK.gold, strength: 0.20 };
    case "gameover": return { color: "#120926", strength: 0.12 };
    case "hop": return { color: LOOK.player, strength: 0.05 };
    case "duck": return { color: LOOK.playerDuck, strength: 0.05 };
    default: return null;
  }
}