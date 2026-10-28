// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.
// Beat-three.js WP-S.2: every builder reports an option it does not read (an `OPTION_IGNORED` note on the node,
// surfaced as an `option-ignored` degradation at compile) and `orbit` takes a node name or a world point
// through typed overloads.

import type { AuraVec3, AuraInteractionNode } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";
import { ignoredOptionsNote } from "./optionDiagnostics.js";

type InteractionBuilder = AuraNodeBuilder<AuraInteractionNode>;

/** What `interactions.orbit` aims at: a node name (reported in scene evidence) or a world point to pivot around. */
export type AuraOrbitTarget = string | AuraVec3;

export interface AuraOrbitOptions {
  /** A node name, or a world point `[x, y, z]` the orbit camera pivots around. */
  readonly target?: AuraOrbitTarget;
  /** World-space eye of the orbit camera (otherwise `camera.orbit`'s own `position`, moved with a point `target`). */
  readonly position?: AuraVec3;
  /** Orbit speed around the pivot in radians per second; `true` is 0.5. */
  readonly autoRotate?: boolean | number;
}

/** Radians per second for `autoRotate: true`. */
export const ORBIT_AUTO_ROTATE_DEFAULT = 0.5;

const ORBIT_KEYS = ["target", "position", "autoRotate"] as const;

/**
 * `interactions.orbit` marks the scene as orbit-controlled.
 * - `orbit({ target: "cube" })` / `orbit("cube")`: names the node it orbits (reported in scene evidence).
 * - `orbit({ target: [0, 0.5, 0] })` / `orbit([0, 0.5, 0])`: the world point the orbit camera pivots around.
 * - `position` and `autoRotate` set the eye and an orbit speed.
 * The point, `position` and `autoRotate` are applied to the scene's orbit camera (`camera.orbit`) when the
 * snapshot is built; with any other camera mode they have no effect.
 */
function orbit(options?: AuraOrbitOptions): InteractionBuilder;
function orbit(target: AuraOrbitTarget): InteractionBuilder;
function orbit(arg: AuraOrbitOptions | AuraOrbitTarget = {}): InteractionBuilder {
  const options: AuraOrbitOptions = typeof arg === "string" || Array.isArray(arg) ? { target: arg as AuraOrbitTarget } : arg as AuraOrbitOptions;
  const { target, position, autoRotate } = options;
  const speed = autoRotate === true ? ORBIT_AUTO_ROTATE_DEFAULT : typeof autoRotate === "number" && Number.isFinite(autoRotate) ? autoRotate : undefined;
  return new AuraNodeBuilder<AuraInteractionNode>({
    kind: "interaction",
    mode: "orbit",
    target: typeof target === "string" ? target : undefined,
    ...(Array.isArray(target) ? { targetPoint: [target[0], target[1], target[2]] as const } : {}),
    ...(position !== undefined ? { orbitPosition: [position[0], position[1], position[2]] as const } : {}),
    ...(speed !== undefined && speed !== 0 ? { autoRotate: speed } : {}),
    ...ignoredOptionsNote("interactions.orbit", options, ORBIT_KEYS)
  });
}

const interaction = (builder: string, options: unknown, valid: readonly string[]) => ignoredOptionsNote(`interactions.${builder}`, options, valid);

export const interactions = {
  orbit,
  pointer: (options: { readonly target?: string } = {}): InteractionBuilder =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "pointer",
      target: options.target,
      ...interaction("pointer", options, ["target"])
    }),
  keyboard: (options: { readonly target?: string } = {}): InteractionBuilder =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "keyboard",
      target: options.target,
      ...interaction("keyboard", options, ["target"])
    }),
  hover: (options: { readonly target?: string; readonly selected?: string } = {}): InteractionBuilder =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "hover",
      target: options.target,
      selected: options.selected,
      ...interaction("hover", options, ["target", "selected"])
    }),
  raycastHover: (options: { readonly target?: string; readonly selected?: string } = {}): InteractionBuilder =>
    new AuraNodeBuilder({
      ...interactions.hover({ target: options.target, selected: options.selected }).toJSON(),
      ...interaction("raycastHover", options, ["target", "selected"])
    }),
  highlight: (options: { readonly target?: string; readonly selected?: string } = {}): InteractionBuilder =>
    new AuraNodeBuilder({
      ...interactions.hover({ target: options.target, selected: options.selected ?? options.target }).toJSON(),
      ...interaction("highlight", options, ["target", "selected"])
    }),
  dragVector: (options: { readonly target?: string; readonly vector?: AuraVec3 } = {}): InteractionBuilder =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "drag-vector",
      target: options.target,
      vector: options.vector ?? [1, 0, 0],
      ...interaction("dragVector", options, ["target", "vector"])
    }),
  clickImpulse: (options: { readonly target?: string; readonly impulse?: number; readonly vector?: AuraVec3 } = {}): InteractionBuilder =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "click-impulse",
      target: options.target,
      impulse: options.impulse ?? 1,
      vector: options.vector ?? [1, 0, 0],
      ...interaction("clickImpulse", options, ["target", "impulse", "vector"])
    })
} as const;
