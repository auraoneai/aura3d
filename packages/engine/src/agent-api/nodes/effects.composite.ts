// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import { lightingEffectBuilders } from "./effects.lighting.js";
import { postEffectBuilders } from "./effects.post.js";
import { vfxEffectBuilders } from "./effects.js";
import { lazyNamespace } from "../lazyNamespace.js";


export const effects = lazyNamespace(() => ({
  ...vfxEffectBuilders,
  ...postEffectBuilders,
  ...lightingEffectBuilders
} as const));
