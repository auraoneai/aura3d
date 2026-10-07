// PRD-02 Phase 2 — `effects.contactShadows` (§7 builder surface, C-10).
// `effect: "contact-shadows"` is an additive AuraEffectType member (CCR-02-2);
// the runtime node carries it verbatim via a cast until the union ships.

import type { AuraEffectNode, AuraEffectType } from "../index.js";
import { AuraNodeBuilder } from "../index.js";

export interface AuraContactShadowOptions {
  readonly length?: number; // metres, default 0.25
  readonly thickness?: number; // metres, default 0.05
  readonly steps?: 8 | 12 | 16; // default 12 (Medium), 16 (High+)
  readonly intensity?: number; // default 1
  readonly lights?: "sun" | "shadowed"; // default "sun"
}

/** Extra fields ride on the effect node; consumed by the prd02 C-36 handler. */
export interface AuraContactShadowsNode extends AuraEffectNode {
  readonly contactShadows: Required<AuraContactShadowOptions>;
}

export const lightingEffectBuilders = {
  contactShadows: (options: AuraContactShadowOptions = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "contact-shadows" as AuraEffectType,
      contactShadows: {
        length: options.length ?? 0.25,
        thickness: options.thickness ?? 0.05,
        steps: options.steps ?? 12,
        intensity: options.intensity ?? 1,
        lights: options.lights ?? "sun"
      }
    } as AuraEffectNode)
} as const;
