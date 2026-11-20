/**
 * Slingshot Siege far set pieces (presentation only: no collider, nothing feeds the sim, never in the flight lane).
 *
 * Idol wow pass (2026-11): the GU47 WP-36 GLBs these placements were authored for (sling_seaStackIsland and the
 * five wave-2 pieces, plus the phase-7 baked rock/tree sets) were never in the working tree, so the stage drew
 * procedural stand-ins. Each placement now draws an Idol image-to-3D toy-diorama island (speridlabs/idol/max, admitted
 * through tools/idol/admit.sh as `assets.siegeFar*`; spec tools/idol/specs/slingshot-siege.json). The GLBs are grounded
 * at y 0 and sized to the measured world height of the procedural landmark they replace, so `position` is now the
 * island's base, sunk by `seaBase` so its painted plinth is just under the sea.
 * Keys stay the WP-36 ids: node ids (`far-<key>`) and chapter routing are unchanged.
 */
import { assets } from "../aura-assets.route";

/**
 * Grounding pass: the height (m, from the GLB base) of each island's painted toy-water plinth, measured where the
 * island's radial extent steps in (artifacts/idol/slingshot-siege/_scratch/disc.mjs). Each island is sunk so that
 * plinth top sits 0.15 m under the sea (SEA_LEVEL -0.26): the real sea meets the island's sand, neither the painted
 * water nor a gap shows.
 */
export const FAR_PIECE_PLINTH = {
  sling_seaStackIsland: 0.72,
  sling_lighthouseIslet: 1.0,
  sling_quarryCrane: 0.7,
  sling_greenhouseFrame: 1.1,
  sling_curtainWall: 0.8,
  sling_crystalCrater: 1.0
} as const;
const SEA_SURFACE = -0.26;
export const FAR_PIECE_SINK = 0.15;
export function seaBase(key: keyof typeof FAR_PIECE_PLINTH): number {
  return Math.round((SEA_SURFACE - FAR_PIECE_SINK - FAR_PIECE_PLINTH[key]) * 100) / 100;
}

/** Idol asset per placement key. */
export const FAR_PIECE_ASSETS = {
  sling_seaStackIsland: assets.siegeFarSeaStack,
  sling_lighthouseIslet: assets.siegeFarLighthouseIslet,
  sling_quarryCrane: assets.siegeFarQuarryCrane,
  sling_greenhouseFrame: assets.siegeFarGreenhouse,
  sling_curtainWall: assets.siegeFarCurtainWall,
  sling_crystalCrater: assets.siegeFarCrystalCrater
} as const;

/**
 * Where the sea stack sits: on the far sea behind the arch (4.62 m tall, the procedural stand-in's measured height),
 * sunk so its painted toy-water plinth is 0.15 m under the sea and the sand ring, chalk stack and pennant rise out.
 */
export const SEA_STACK_PLACEMENT = { position: [3, seaBase("sling_seaStackIsland"), -22] as [number, number, number], rotationY: -0.6, scale: 1 } as const;

/**
 * Wave-2 far set pieces (presentation only). Each sits behind the island on the far sea, outside the flight lane, its
 * plinth 0.15 m under the sea (`seaBase`); heights from the stand-ins' tops. Rotations face the
 * default aim camera (-2.5, 4, 15.5). `scale` multiplies the Idol GLB's authored metres (1 = as generated).
 */
export interface FarSetPiece {
  readonly key: "sling_lighthouseIslet" | "sling_quarryCrane" | "sling_greenhouseFrame" | "sling_curtainWall" | "sling_crystalCrater";
  readonly chapters: readonly number[] | "all";
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
  readonly scale: number;
}
export const FAR_SET_PIECES: readonly FarSetPiece[] = [
  { key: "sling_lighthouseIslet", chapters: "all", position: [-16.5, seaBase("sling_lighthouseIslet"), -22.5], rotationY: 0.35, scale: 1 },
  { key: "sling_quarryCrane", chapters: [1], position: [22, seaBase("sling_quarryCrane"), -23.5], rotationY: -0.5, scale: 1 },
  { key: "sling_greenhouseFrame", chapters: [2], position: [16.5, seaBase("sling_greenhouseFrame"), -19.5], rotationY: -0.5, scale: 1 },
  { key: "sling_curtainWall", chapters: [4], position: [16.5, seaBase("sling_curtainWall"), -19.5], rotationY: -0.5, scale: 1 },
  { key: "sling_crystalCrater", chapters: [5], position: [16.5, seaBase("sling_crystalCrater"), -19.5], rotationY: -0.5, scale: 1 }
];

/** The far set pieces drawn in a chapter. */
export function farSetPiecesFor(chapterId: number): readonly FarSetPiece[] {
  return FAR_SET_PIECES.filter((p) => p.chapters === "all" || p.chapters.includes(chapterId));
}
