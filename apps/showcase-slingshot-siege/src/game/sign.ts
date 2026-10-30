/**
 * Slingshot Siege — the wooden level sign (GU47 WP-22 SS47-H1): a painted driftwood board on a post at the beach edge,
 * left of the sling and clear of the flight lane, carrying the chapter name in SDF text. One text node per chapter is
 * built (the look is chosen at boot, but play can cross chapters); main.ts shows the current chapter's text in
 * loadLevel and parks the others under the island. Presentation only: nothing collides, nothing moves.
 *
 * Draws: board + post + one visible text = +3 (the parked texts are hidden). Static, so reduced motion is unaffected.
 */
import { material, primitives, text3D, type AuraNodeBuilder, type AuraSceneNode } from "@aura3d/engine";
import { CHAPTERS } from "./levels";
import { SIEGE_PALETTE } from "./look";

/** Board centre on the turf, left foreground of the sling, >= 1.2 m off the lane (z = 0). */
export const SIGN_CENTER: readonly [number, number, number] = [-5.6, 1.05, 3.2];
/** Board faces the default aim camera (-2.5, 4, 15.5). */
export const SIGN_YAW = Math.atan2(-2.5 - SIGN_CENTER[0], 15.5 - SIGN_CENTER[2]);
export const SIGN_BOARD: readonly [number, number, number] = [2.0, 0.52, 0.08];
/** Text never wider than this (metres), so "Greenhouse Perch" fits the board. */
const TEXT_MAX_WIDTH = 1.76;
const TEXT_MAX_SIZE = 0.24;
/** Where parked (hidden) chapter texts wait. */
export const SIGN_PARK: readonly [number, number, number] = [0, -120, 0];

export const signTextNodeId = (chapter: number): string => `siege-level-sign-${chapter}`;

/** The sign keep-out for the beach dressing: [x, z, radius]. */
export const SIGN_KEEP_OUT: readonly [number, number, number] = [SIGN_CENTER[0], SIGN_CENTER[2], 1.2];

interface TextPlacement { readonly position: [number, number, number]; readonly size: number }

/** Text size and left-baseline position that centres a chapter name on the board's front face. */
export function signTextPlacement(name: string): TextPlacement {
  // The engine glyph advance is ~ size * (5/7 + 0.14) per character (RootGeometry: 5-cell glyphs, 0.14 spacing).
  const perChar = 5 / 7 + 0.14;
  const size = Math.min(TEXT_MAX_SIZE, TEXT_MAX_WIDTH / Math.max(1, name.length * perChar));
  const width = name.length * perChar * size - 0.14 * size;
  const c = Math.cos(SIGN_YAW);
  const s = Math.sin(SIGN_YAW);
  const along = -width / 2;
  const out = SIGN_BOARD[2] / 2 + 0.012;
  return {
    position: [SIGN_CENTER[0] + along * c + out * s, SIGN_CENTER[1] - size / 2, SIGN_CENTER[2] - along * s + out * c],
    size
  };
}

export function levelSignNodes(bootChapter: number): AuraNodeBuilder<AuraSceneNode>[] {
  const wood = material.pbr({ color: SIEGE_PALETTE.driftwood, roughness: 0.82, metallic: 0 });
  const post = material.pbr({ color: "#6b5440", roughness: 0.88, metallic: 0 });
  const ink = material.pbr({ color: "#3a2a1c", roughness: 0.7, metallic: 0 });
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [
    primitives.box({ name: "siege-level-sign-board", material: wood, castShadow: true, receiveShadow: true })
      .position(...SIGN_CENTER).rotate(0, SIGN_YAW, 0).scale([...SIGN_BOARD]) as AuraNodeBuilder<AuraSceneNode>,
    primitives.box({ name: "siege-level-sign-post", material: post, castShadow: true, receiveShadow: true })
      .position(SIGN_CENTER[0], SIGN_CENTER[1] / 2 - 0.06, SIGN_CENTER[2] - 0.06).rotate(0, SIGN_YAW, 0).scale([0.1, SIGN_CENTER[1] + 0.1, 0.08]) as AuraNodeBuilder<AuraSceneNode>
  ];
  for (const ch of CHAPTERS) {
    const name = ch.name.toUpperCase();
    const place = signTextPlacement(name);
    const at = ch.id === bootChapter ? place.position : ([...SIGN_PARK] as [number, number, number]);
    nodes.push(
      text3D(name, { name: signTextNodeId(ch.id), size: place.size, depth: place.size * 0.12, material: ink, backend: "sdf", castShadow: false })
        .position(...at).rotate(0, SIGN_YAW, 0).runtime({ id: signTextNodeId(ch.id), tags: ["sign"] }) as AuraNodeBuilder<AuraSceneNode>
    );
  }
  return nodes;
}
