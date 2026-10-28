// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.
// Beat-three.js WP-S.2: every builder rejects an option it does not read (OPTION_IGNORED, naming the
// valid keys), and `orbit` takes a node name or a world point through typed overloads.

import type { AuraVec3, AuraInteractionNode } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";
import { assertKnownOptionKeys, optionIgnored } from "./optionDiagnostics.js";

type InteractionBuilder = AuraNodeBuilder<AuraInteractionNode>;

/**
 * `interactions.orbit` marks the scene as orbit-controlled and names the node it orbits (reported in scene
 * evidence): `orbit({ target: "cube" })` or the shorthand `orbit("cube")`. The orbit pivot, distance and eye
 * live on `camera.orbit({ target: [x, y, z], position, distance })`; options such as `position` or `autoRotate`
 * (and a point passed here) raise `OPTION_IGNORED` instead of being dropped.
 */
function orbit(options?: { readonly target?: string }): InteractionBuilder;
function orbit(target: string): InteractionBuilder;
function orbit(arg: { readonly target?: string } | string = {}): InteractionBuilder {
  if (Array.isArray(arg)) {
    throw optionIgnored(
      "interactions.orbit: a world point is not read here (it would be silently ignored). Name a node with `interactions.orbit({ target: \"<node name>\" })` " +
        "and set the pivot on the camera with `camera.orbit({ target: [x, y, z] })`."
    );
  }
  const options = typeof arg === "string" ? { target: arg } : arg;
  assertKnownOptionKeys("interactions.orbit", options, ["target"]);
  return new AuraNodeBuilder<AuraInteractionNode>({
    kind: "interaction",
    mode: "orbit",
    target: options.target
  });
}

const withKeys = (builder: string, options: unknown, valid: readonly string[]): void => assertKnownOptionKeys(`interactions.${builder}`, options, valid);

export const interactions = {
  orbit,
  pointer: (options: { readonly target?: string } = {}): InteractionBuilder => {
    withKeys("pointer", options, ["target"]);
    return new AuraNodeBuilder({
      kind: "interaction",
      mode: "pointer",
      target: options.target
    });
  },
  keyboard: (options: { readonly target?: string } = {}): InteractionBuilder => {
    withKeys("keyboard", options, ["target"]);
    return new AuraNodeBuilder({
      kind: "interaction",
      mode: "keyboard",
      target: options.target
    });
  },
  hover: (options: { readonly target?: string; readonly selected?: string } = {}): InteractionBuilder => {
    withKeys("hover", options, ["target", "selected"]);
    return new AuraNodeBuilder({
      kind: "interaction",
      mode: "hover",
      target: options.target,
      selected: options.selected
    });
  },
  raycastHover: (options: { readonly target?: string; readonly selected?: string } = {}): InteractionBuilder => {
    withKeys("raycastHover", options, ["target", "selected"]);
    return interactions.hover(options);
  },
  highlight: (options: { readonly target?: string; readonly selected?: string } = {}): InteractionBuilder => {
    withKeys("highlight", options, ["target", "selected"]);
    return interactions.hover({ target: options.target, selected: options.selected ?? options.target });
  },
  dragVector: (options: { readonly target?: string; readonly vector?: AuraVec3 } = {}): InteractionBuilder => {
    withKeys("dragVector", options, ["target", "vector"]);
    return new AuraNodeBuilder({
      kind: "interaction",
      mode: "drag-vector",
      target: options.target,
      vector: options.vector ?? [1, 0, 0]
    });
  },
  clickImpulse: (options: { readonly target?: string; readonly impulse?: number; readonly vector?: AuraVec3 } = {}): InteractionBuilder => {
    withKeys("clickImpulse", options, ["target", "impulse", "vector"]);
    return new AuraNodeBuilder({
      kind: "interaction",
      mode: "click-impulse",
      target: options.target,
      impulse: options.impulse ?? 1,
      vector: options.vector ?? [1, 0, 0]
    });
  }
} as const;
