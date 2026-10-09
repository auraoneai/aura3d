import type { GameScenario } from "@aura3d/engine";
import { turboDrive } from "../scenario-drive";

export const turboScenarios: GameScenario[] = [
  { description: "Default playable boot (grid + start lights, no staging).", setup() {} },
  {
    description: "Rival-pass milestone: live overtake frame mid-race (acceptance milestone).",
    setup(): void {
      void turboDrive().advanceTo("rival-pass");
    }
  },
  {
    description: "Held live drift: two-car race frame mid-corner (replaces ?capture=overview).",
    setup(): void {
      void turboDrive().advanceTo("drift");
    }
  }
];
