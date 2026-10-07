// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraVec3, AuraInteractionNode } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";

export const interactions = {
  orbit: (options: { readonly target?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "orbit",
      target: options.target
    }),
  pointer: (options: { readonly target?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "pointer",
      target: options.target
    }),
  keyboard: (options: { readonly target?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "keyboard",
      target: options.target
    }),
  hover: (options: { readonly target?: string; readonly selected?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "hover",
      target: options.target,
      selected: options.selected
    }),
  raycastHover: (options: { readonly target?: string; readonly selected?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    interactions.hover(options),
  highlight: (options: { readonly target?: string; readonly selected?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    interactions.hover({ target: options.target, selected: options.selected ?? options.target }),
  dragVector: (options: { readonly target?: string; readonly vector?: AuraVec3 } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "drag-vector",
      target: options.target,
      vector: options.vector ?? [1, 0, 0]
    }),
  clickImpulse: (options: { readonly target?: string; readonly impulse?: number; readonly vector?: AuraVec3 } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "click-impulse",
      target: options.target,
      impulse: options.impulse ?? 1,
      vector: options.vector ?? [1, 0, 0]
    })
} as const;
