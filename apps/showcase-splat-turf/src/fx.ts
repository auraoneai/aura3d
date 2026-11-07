/**
 * Event → screen-effect mapping over the kit ScreenFx. The solvent wipe wash and eraser hit flash the
 * whole frame briefly; paint cans and stretch combos get gentle colour kicks. Reduced motion caps every
 * flash at the kit's REDUCED_FLASH_CAP and drops the vignette.
 */
import { ScreenFx, flashStrength } from "../../../examples/shared/runner-kit/index";
import { LOOK } from "./look";
import type { TurfCue } from "./audio";

export { ScreenFx, flashStrength };

export interface Flash { color: string; strength: number }

export function flashFor(cue: TurfCue): Flash | null {
  switch (cue) {
    case "can": return { color: LOOK.ball, strength: 0.2 };
    case "solvent": return { color: LOOK.wipeWash, strength: 0.35 };
    case "eraser": return { color: LOOK.eraser, strength: 0.3 };
    case "stretch": return { color: LOOK.can, strength: 0.16 };
    case "milestone": return { color: LOOK.can, strength: 0.28 };
    case "finish": return { color: LOOK.can, strength: 0.35 };
    case "burst": return { color: "#d92626", strength: 0.4 };
    case "start":
    case "gameover": return null;
  }
}