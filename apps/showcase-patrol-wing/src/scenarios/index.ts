import type { GameScenario } from "@aura3d/engine";
import { patrolDrive } from "../scenario-drive";

const stage = (id: string) => () => patrolDrive().stage(id);

export const patrolScenarios: GameScenario[] = [
  { description: "Preflight pad (default boot).", setup() {} },
  { description: "Airborne ring-run at the first gate.", setup: stage("ring-run") },
  { description: "Combat pass against the seeded drone wave.", setup: stage("drone-pass") },
  { description: "Cannon exchange + real hull damage.", setup: stage("drone-hit") }
];
