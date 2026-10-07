import tierLadder from "./tier-ladder";
import drawCallStress from "./draw-call-stress";
import instancing100k from "./instancing-100k";

export const adapters = {
  "prd11-tier-ladder": tierLadder,
  "prd11-draw-call-stress": drawCallStress,
  "prd11-instancing-100k": instancing100k
} as const;
