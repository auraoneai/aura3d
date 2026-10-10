import type { GameScenario } from "@aura3d/engine";
import { clashDrive } from "../scenario-drive";

/** Ops the v2 shell supplies for `?scenario=` staging (PRD-09). */
export interface AuraClashScenarioContext {
  setActor(id: string, patch: Record<string, unknown>): void;
  placeFighter(id: string, x: number): void;
  setRound(n: number, t: number): void;
}

export const auraClashScenarios: GameScenario[] = [
  { description: "Default playable boot (fighters staged, round live).", setup() {} },
  {
    description: "Opening match frame: fresh round, both fighters grounded at start distance (replaces ?capture=match-start).",
    setup(): void {
      const drive = clashDrive();
      drive.reset();
      drive.setPositions(-1.35, 1.35);
      drive.pumpFrames(30);
    }
  },
  {
    description: "Live impact frame: queued light attack lands with hit spark and punch (replaces ?capture=combat-impact).",
    setup(): void {
      const drive = clashDrive();
      drive.reset();
      drive.setPositions(-0.9, 0.9);
      drive.queuePlayerAttack("light");
      drive.pumpFrames(40);
    }
  }
];

/** v2 `?scenario=<name>` staging — positions/facing/round state through the
 *  shell's ops (legacy path uses the drive-backed GameScenario array above). */
export function applyAuraClashScenario(name: string, ctx: AuraClashScenarioContext): void {
  switch (name) {
    case "default":
    case "boot":
      break;
    case "match-start":
      ctx.placeFighter("p1", -1.35);
      ctx.placeFighter("p2", 1.35);
      ctx.setRound(1, 60);
      break;
    case "combat-impact":
      ctx.placeFighter("p1", -0.9);
      ctx.placeFighter("p2", 0.9);
      ctx.setActor("p1", { facing: 1 });
      ctx.setActor("p2", { facing: -1 });
      break;
    default:
      console.warn(`[aura-clash] unknown scenario "${name}"`);
  }
}
