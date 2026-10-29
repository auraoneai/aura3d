import type { AuraSceneNode } from "../nodes/types.js";

/**
 * The procedural fill of a no-HDRI look (`AuraLookV0Expansion.fill`) stands in for the implicit neutral-room fill those
 * looks were lit by on 4.3.7. On 4.3.7 that fill was withheld from any scene that authors an ambient light (the scene was
 * lit by its authored ambient alone: lookLint `look/ambient-kills-ibl`). Aura Glint Courier (`neon-arcade` plus
 * `lights.ambient` 0.92 and `lights.hemisphere` 0.85) measured mean luma 25 on 4.3.7 and 77 with the fill stacked on top
 * of its ambient, so the fill yields to authored ambient lights the same way. A fill the author asked for explicitly
 * (`environments.*`) carries no `lookFill` mark and is never dropped.
 */
type Container = AuraSceneNode & { readonly children?: readonly AuraSceneNode[] };

const isLookFill = (node: AuraSceneNode): boolean => node.kind === "environment" && (node as { lookFill?: boolean }).lookFill === true;

function scan(nodes: readonly AuraSceneNode[], found: { ambient: boolean; fill: boolean }): void {
  for (const node of nodes) {
    if (node.kind === "light" && node.light === "ambient" && (node.intensity ?? 0) > 0) found.ambient = true;
    if (isLookFill(node)) found.fill = true;
    const children = (node as Container).children;
    if (Array.isArray(children)) scan(children, found);
  }
}

function strip(nodes: readonly AuraSceneNode[]): readonly AuraSceneNode[] {
  const out: AuraSceneNode[] = [];
  for (const node of nodes) {
    if (isLookFill(node)) continue;
    const children = (node as Container).children;
    out.push(Array.isArray(children) ? ({ ...node, children: strip(children) } as AuraSceneNode) : node);
  }
  return out;
}

/** Returns `nodes` itself unless a look fill and an authored ambient light are both present. */
export function dropShadowedLookFill(nodes: readonly AuraSceneNode[]): readonly AuraSceneNode[] {
  const found = { ambient: false, fill: false };
  scan(nodes, found);
  return found.ambient && found.fill ? strip(nodes) : nodes;
}
