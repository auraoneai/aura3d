import type { BenchSceneRegistration } from "../../shared/registry";
import { tierLadderSpec } from "./tier-ladder";
import { drawCallStressSpec } from "./draw-call-stress";
import { instancing100kSpec } from "./instancing-100k";

export const scenes: readonly BenchSceneRegistration[] = [
  { id: "prd11-tier-ladder", spec: tierLadderSpec },
  { id: "prd11-draw-call-stress", spec: drawCallStressSpec },
  { id: "prd11-instancing-100k", spec: instancing100kSpec }
];
