import type { AuraEffectNode, AuraSceneNode } from "../nodes/types.js";

/**
 * A look emits its own `color-grade` node (marked `lookGrade`, looks.ts). Both post paths read the first grade node, which
 * is the look's when the look comes first, so a grade the scene authors next to a look was ignored (Cumulus Dash CR-4:
 * contrast 1.07, saturation 1.16 and exposure 1.02 never applied). This folds the look grade into the first authored
 * grade: fields the author wrote win, fields the author left at the factory default keep the look's value (so the look's
 * `exposureEv` override survives a grade that only sets contrast). The merged node sits where the authored node was and
 * the look node is removed. With no authored grade the list is returned unchanged.
 */
const isGrade = (node: AuraSceneNode): node is AuraEffectNode => node.kind === "effect" && node.effect === "color-grade";

export const isLookGrade = (node: AuraSceneNode): boolean => isGrade(node) && (node as { lookGrade?: boolean }).lookGrade === true;

function authoredKeys(node: AuraEffectNode): readonly string[] {
  return node.postAuthored ?? Object.keys(node).filter((key) => key !== "kind" && key !== "effect");
}

export function mergeLookColorGrade<T extends AuraSceneNode>(nodes: readonly T[]): readonly T[] {
  const look = nodes.find((node) => isLookGrade(node));
  const authored = nodes.find((node) => isGrade(node) && !isLookGrade(node)) as AuraEffectNode | undefined;
  if (!look || !authored) return nodes;
  const lookFields = look as unknown as Record<string, unknown>;
  const authoredFields = authored as unknown as Record<string, unknown>;
  const written = authoredKeys(authored);
  const merged: Record<string, unknown> = { ...lookFields };
  delete merged.lookGrade;
  for (const key of Object.keys(authoredFields)) {
    if (key === "postAuthored") continue;
    if (written.includes(key) || !(key in lookFields)) merged[key] = authoredFields[key];
  }
  // The look's grade fields count as authored on the merged node, so the v2 bridge reads them.
  const lookWritten = (look as unknown as AuraEffectNode).postAuthored ?? [];
  merged.postAuthored = [...new Set([...written, ...lookWritten])];
  const out: T[] = [];
  for (const node of nodes) {
    if (node === look) continue;
    out.push(node === (authored as unknown) ? (merged as unknown as T) : node);
  }
  return out;
}
