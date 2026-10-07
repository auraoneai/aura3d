// C-36 real (PRD-15 T3.11) — the node-kind handler table and flag resolution.
// `nodeHandlers` is exhaustive over the C-36 AuraNodeKindMap keys: removing a
// key is a compile error (asserted by tests/qr/prd15/compiler/handlers.test.ts).
// Default entries mark "this kind is compiled by the legacy bridge"; a lane
// handler registered via `registerNodeHandler` wins for that kind whenever its
// flag is on (CONTRACTS C-36: "Existing kinds keep the legacy path unless a
// handler for that kind is registered and its flag is on").

import type { AnyNodeHandler, AuraNodeKindMap, NodeHandler } from "../../contracts/compiler.js";
import { nodeHandlerFor } from "../../contracts/compiler.js";
import type { QrFlags } from "@aura3d/rendering/contracts";

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
  grass: bridgeCompiled("grass")
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
