import type { GameScenario } from "@aura3d/engine";
import { pulseDrive } from "../scenario-drive";

const finale: GameScenario = {
  description: "Staged finale exchange: run begun, section driven to finale, scheduler seeked near the end of the chart.",
  async setup(): Promise<void> {
    const d = pulseDrive();
    await d.beginRun();
    d.applySection("finale", false);
    d.seekAhead(88);
  }
};

export const pulseScenarios: GameScenario[] = [
  { description: "Default playable boot (no staging).", setup() {} },
  finale
];
