// GU47 E-E (WP-5): `effects.outline({ targets })` — engine half. The option field lives in `effects.ts` (lane E-F);
// this file turns the authored node names into the renderer's `postprocess.outline.targets` match keys. The renderer
// (`packages/rendering/src/renderer/OutlineTargets.ts`) matches them against render-item labels: a primitive item ends
// with its node name, a model mesh starts with its model id (the node's runtime id, else its asset id).

import type { AuraEffectNode } from "./types.js";

/** The authored target names of an outline node (read through a local type: `AuraEffectNode` has no `targets`). */
export function outlineTargetsOfNode(node: AuraEffectNode | undefined): readonly string[] | undefined {
  const targets = (node as (AuraEffectNode & { readonly targets?: unknown }) | undefined)?.targets;
  if (!Array.isArray(targets)) return undefined;
  return targets.filter((name): name is string => typeof name === "string" && name.length > 0);
}

interface NamedSceneNode {
  readonly kind?: string;
  readonly name?: string;
  readonly runtime?: { readonly id?: string };
  readonly asset?: { readonly id?: string };
}

/**
 * Renderer match keys for target names: every name itself, plus for each scene node named (or runtime-addressed) by a
 * target its node name and, for a model, its model id. Order follows `targets`; duplicates are dropped.
 */
export function outlineTargetKeys(targets: readonly string[], nodes: Iterable<unknown> = []): string[] {
  const keys = new Set<string>();
  const wanted = new Set(targets);
  for (const name of targets) keys.add(name);
  for (const raw of nodes) {
    if (raw === null || typeof raw !== "object") continue;
    const node = raw as NamedSceneNode;
    const runtimeId = typeof node.runtime?.id === "string" ? node.runtime.id : undefined;
    if (!(node.name !== undefined && wanted.has(node.name)) && !(runtimeId !== undefined && wanted.has(runtimeId))) continue;
    if (typeof node.name === "string" && node.name.length > 0) keys.add(node.name);
    if (node.kind === "model") {
      const modelId = runtimeId ?? node.asset?.id;
      if (typeof modelId === "string" && modelId.length > 0) keys.add(modelId);
    }
  }
  return [...keys];
}

/**
 * Spread into the compiled outline options (`createProductionRuntimePostprocess`): `{ targets }` when the node names
 * targets (an empty list inks nothing), `{}` otherwise so an outline without targets compiles exactly as before.
 */
export function outlineTargetsField(node: AuraEffectNode | undefined, nodes: Iterable<unknown> = []): { readonly targets?: readonly string[] } {
  const targets = outlineTargetsOfNode(node);
  return targets === undefined ? {} : { targets: outlineTargetKeys(targets, nodes) };
}
