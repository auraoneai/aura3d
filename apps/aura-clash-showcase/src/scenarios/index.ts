import type { GameScenario } from "@aura3d/engine";
import { clashDrive } from "../scenario-drive";

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
