import type { BenchSceneRegistration } from "../../shared/registry";
import { tierLadderSpec } from "./tier-ladder";

export const scenes: readonly BenchSceneRegistration[] = [
  { id: "prd11-tier-ladder", spec: tierLadderSpec }
];
