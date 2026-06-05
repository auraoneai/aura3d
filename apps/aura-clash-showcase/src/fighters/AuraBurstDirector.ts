import type { FighterRuntimeState } from "../state/GameTypes";
import type { HitSparkFrame } from "../rendering/HitSparkVfx";
import { getHitSparkFrame } from "../rendering/HitSparkVfx";

export interface AuraBurstBeat {
  atMs: number;
  label: string;
  cameraCue: "windup" | "impact" | "recover";
  vfx: HitSparkFrame;
  caption: string;
}

export interface AuraBurstSequence {
  fighterId: string;
  moveName: string;
  durationMs: number;
  beats: AuraBurstBeat[];
  meterCost: number;
  accessibilitySummary: string;
}

export function createAuraBurstSequence(
  fighter: FighterRuntimeState,
  moveName: string,
  options?: { reducedMotion?: boolean; reducedFlash?: boolean },
): AuraBurstSequence {
  return {
    fighterId: fighter.fighterId,
    moveName,
    durationMs: 900,
    meterCost: 50,
    accessibilitySummary:
      "Aura Burst has text captions, meter state, and reduced-motion/reduced-flash alternatives so it is not communicated by flash alone.",
    beats: [
      {
        atMs: 0,
        label: "windup",
        cameraCue: "windup",
        vfx: getHitSparkFrame("guard", options),
        caption: `${moveName} charging`,
      },
      {
        atMs: 360,
        label: "impact",
        cameraCue: "impact",
        vfx: getHitSparkFrame("special", options),
        caption: `${moveName} impact`,
      },
      {
        atMs: 720,
        label: "recover",
        cameraCue: "recover",
        vfx: getHitSparkFrame("ko", options),
        caption: `${moveName} recovery`,
      },
    ],
  };
}
