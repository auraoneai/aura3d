// C-36 real (PRD-15 T3.11) — the node-kind handler table and flag resolution.
// `nodeHandlers` is exhaustive over the C-36 AuraNodeKindMap keys: removing a
// key is a compile error (asserted by tests/qr/prd15/compiler/handlers.test.ts).
// Default entries mark "this kind is compiled by the legacy bridge"; a lane
// handler registered via `registerNodeHandler` wins for that kind whenever its
// flag is on (CONTRACTS C-36: "Existing kinds keep the legacy path unless a
// handler for that kind is registered and its flag is on").

import type { AnyNodeHandler, AuraNodeKindMap, NodeHandler } from "../../contracts/compiler.js";
import { nodeHandlerFor } from "../../contracts/compiler.js";
import type { QrFlagName, QrFlags } from "@aura3d/rendering/contracts";
import { AuraRuntimeError } from "./errors.js";
import { lineNodeHandler, pointsNodeHandler, spriteNodeHandler } from "./lines.js";

export type NodeKindHandlers = {
  readonly [K in keyof AuraNodeKindMap]: NodeHandler<{ readonly kind: K & string }>;
};

function bridgeCompiled<K extends string>(kind: K): NodeHandler<{ readonly kind: K }> {
  return {
    kind: kind as { readonly kind: K }["kind"],
    owner: "prd15",
    // No contributions: the legacy bridge consumes this node kind directly;
    // the entry exists so the table is exhaustive and resolution is explicit.
    compile(): void {}
  };
}

/**
 * threejs-parity (docs/workflows/threejs-parity-gaps.md §5.0): a parity node
 * kind whose lane has not landed fails closed — the default catalog entry for
 * the kind throws a `parity-not-implemented` validate error. The lane's real
 * handler, registered via `registerNodeHandler` with its `A3D_PARITY_*` flag,
 * wins resolution once the flag is on (resolveNodeHandler).
 */
function parityPending<K extends string>(kind: K, flag: QrFlagName): NodeHandler<{ readonly kind: K }> {
  return {
    kind: kind as { readonly kind: K }["kind"],
    owner: "prd15",
    // Marker for the compileScene gate: pending entries are NOT bridge
    // defaults — their compile throws `parity-not-implemented` and must run
    // whenever resolution selects them (i.e. the real handler's flag is off).
    flag,
    compile(): never {
      throw new AuraRuntimeError(
        "parity-not-implemented",
        `Aura3D scene node kind "${kind}" is not yet implemented (${flag}). See docs/workflows/threejs-parity-gaps.md.`
      );
    }
  };
}

export const nodeHandlers: NodeKindHandlers = {
  model: bridgeCompiled("model"),
  primitive: bridgeCompiled("primitive"),
  group: bridgeCompiled("group"),
  light: bridgeCompiled("light"),
  effect: bridgeCompiled("effect"),
  interaction: bridgeCompiled("interaction"),
  label: bridgeCompiled("label"),
  environment: bridgeCompiled("environment"),
  sky: bridgeCompiled("sky"),
  look: bridgeCompiled("look"),
  probe: bridgeCompiled("probe"),
  biome: bridgeCompiled("biome"),
  "time-of-day": bridgeCompiled("time-of-day"),
  wind: bridgeCompiled("wind"),
  terrain: bridgeCompiled("terrain"),
  water: bridgeCompiled("water"),
  scatter: bridgeCompiled("scatter"),
  grass: bridgeCompiled("grass"),
  // threejs-parity L6 (§5.6): real handlers landed for lines/points/sprites.
  // They are typed for the concrete node kinds (cast inside) and keep the
  // fail-closed contract themselves — compile() re-asserts A3D_PARITY_LINES
  // and throws the same `parity-not-implemented` error when the flag is off.
  line: lineNodeHandler as NodeHandler<{ readonly kind: "line" }>,
  points: pointsNodeHandler as NodeHandler<{ readonly kind: "points" }>,
  sprite: spriteNodeHandler as NodeHandler<{ readonly kind: "sprite" }>,
  batched: parityPending("batched", "A3D_PARITY_BATCHING")
};

/** True when `kind` is a declared node kind (a key of the C-36 AuraNodeKindMap). */
export function isKnownNodeKind(kind: string): boolean {
  return Object.prototype.hasOwnProperty.call(nodeHandlers, kind);
}

/**
 * C-36 resolution: a lane handler registered through `registerNodeHandler`
 * wins over the legacy-bridge default for its kind when it declares no flag
 * (always active) or when its flag is on. Otherwise the default wins.
 */
export function resolveNodeHandler(kind: string, flags: QrFlags): AnyNodeHandler | undefined {
  const registered = nodeHandlerFor(kind);
  if (registered && registered !== nodeHandlers[kind as keyof AuraNodeKindMap]) {
    if (!registered.flag || flags.on(registered.flag)) return registered;
  }
  return nodeHandlers[kind as keyof AuraNodeKindMap] as AnyNodeHandler | undefined;
}
