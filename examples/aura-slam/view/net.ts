/**
 * GU47 WP-11 TT-M2 (net): the World Tour net is one textured strip instead of nine see-through boxes.
 *
 * - Geometry: a single vertical quad strip between the posts whose top edge follows the 4.6.1 sag (1.07 m at the posts,
 *   0.914 m at the centre strap), with UVs in metres so every net square is NET_CELL wide whatever the column width.
 * - Material: the authored net-alpha tile (`assets/textures/net-alpha.png`, 4 x 4 squares, strings 3/16 of a square) tints
 *   the 4.6.1 net green; depth write on, so the net sorts against the ball, trail and athletes like a solid surface.
 *   Decision (lane report): the alpha is blended, not cut at a mask threshold. At the broadcast distance a string is about
 *   0.2 px wide at 1280 x 720, so a mask cut-off would drop the whole net from the frame; blended, the mip chain averages
 *   the tile to its mean alpha (0.34) and the net reads as a translucent band, while the intro and replay close-ups
 *   (TT-C2 / TT-C3) resolve the squares.
 * - Draws: 1 (it replaces the 4.6.1 `static-netMesh` group, 1 draw). The tape stays the merged `static-netTape` group.
 * `?look=original` keeps the nine 4.6.1 boxes.
 */
import { game, geometry, material, type AuraAssetRef, type AuraCustomGeometrySpec, type AuraMaterialSpec } from "@aura3d/engine";
import { NET_POST_X } from "./constants";
import { slamTextureAssets } from "./assets";
import type { NodeInput } from "./rigPort";

export const NET_MESH_ID = "net-mesh";
/** Side of one net square (metres; a tennis net square is 3.5-4.5 cm). */
export const NET_CELL = 0.045;
/** Squares per side of the authored tile (`tools/gen-textures.mjs`). */
export const NET_TILE_CELLS = 4;
/** Mean alpha of the tile: what the net averages to once a square is smaller than a pixel. */
export const NET_TILE_MEAN_ALPHA = 0.3363;
/** Columns of the strip (the sag is sampled per column). */
export const NET_COLUMNS = 24;
/** Net colour (the 4.6.1 net green). */
export const NET_COLOR = "#1c2a26";
/** Bottom edge and the gap under the tape (the 4.6.1 boxes ran from 0.02 m to the sag height minus 0.03 m). */
const NET_BOTTOM_Y = 0.02;
const TAPE_GAP = 0.03;

/** Net height at `t` in [-1, 1] across the court (centre 0.914 m, posts 1.07 m), the 4.6.1 sag. */
export function netTopHeight(t: number): number {
  return 0.914 + (1.07 - 0.914) * t * t;
}

/** The strip: (NET_COLUMNS + 1) x 2 vertices, UVs in tile units (metres / tile side). */
export function netMeshGeometry(): AuraCustomGeometrySpec {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const tile = NET_CELL * NET_TILE_CELLS;
  for (let i = 0; i <= NET_COLUMNS; i++) {
    const t = -1 + (2 * i) / NET_COLUMNS;
    const x = t * NET_POST_X;
    const top = netTopHeight(t) - TAPE_GAP;
    const u = (x + NET_POST_X) / tile;
    positions.push(x, NET_BOTTOM_Y, 0, x, top, 0);
    normals.push(0, 0, 1, 0, 0, 1);
    uvs.push(u, NET_BOTTOM_Y / tile, u, top / tile);
  }
  for (let i = 0; i < NET_COLUMNS; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 3, a, a + 3, a + 1);
  }
  return { kind: "aura-custom-geometry", positions, normals, uvs, indices } as unknown as AuraCustomGeometrySpec;
}

/** The net material: the authored tile, blended, depth write on, both faces, tiling with a full mip chain. */
export function netMeshMaterial(texture: AuraAssetRef<"texture"> = slamTextureAssets.netAlpha as unknown as AuraAssetRef<"texture">): AuraMaterialSpec {
  return material.pbr({
    color: NET_COLOR,
    texture,
    roughness: 0.88,
    alphaMode: "blend",
    depthWrite: true,
    doubleSided: true,
    sampling: { wrap: "repeat", filter: "trilinear", generateMipmaps: true }
  });
}

/** The World Tour net node (1 draw, no shadow: the 4.6.1 net cast none either). */
export function buildNetMeshNode(): NodeInput {
  return geometry
    .custom(netMeshGeometry(), { name: NET_MESH_ID, material: netMeshMaterial(), castShadow: false })
    .runtime(game.runtimeNode(NET_MESH_ID)) as unknown as NodeInput;
}
