import type { GameScenario } from "@aura3d/engine";
import { vaultDrive } from "../scenario-drive";

const stage = (id: string) => ({
  description: `Staged vault-breakers state: ${id}.`,
  setup(): void { vaultDrive().stage(id); }
});

export const vaultScenarios: GameScenario[] = [
  { description: "Default playable boot (attract table, no staging).", setup() {} },
  stage("bank-near-complete"),
  stage("vault-opening"),
  stage("multiball"),
  stage("tilt"),
  stage("game-over")
];
