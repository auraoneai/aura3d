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
import { game, geometry, material, type AuraAssetRef, type AuraCustomGeometrySpec, type AuraMaterialSpec, type AuraRuntimeNodeHandle } from "@aura3d/engine";
import { COURT_X, NET_POST_X } from "./constants";
import { slamTextureAssets } from "./assets";
import { netMeshShaderSpec } from "./shaders";
import { mergeBoxes } from "./statics";
import type { Vec3 } from "../contract/units";
import type { NodeInput } from "./rigPort";

export const NET_MESH_ID = "net-mesh";
export const NET_TAPE_ID = "net-tape";
/** Side of one net square (metres; WP-01 derivative-filtered 4.2 cm braided cord square). */
export const NET_CELL = 0.042;
/** Squares per side of the authored tile (`tools/gen-textures.mjs`). */
export const NET_TILE_CELLS = 4;
/** Mean alpha of the tile: what the net averages to once a square is smaller than a pixel. */
export const NET_TILE_MEAN_ALPHA = 0.3363;
/** Columns of the strip (the sag is sampled per column). */
export const NET_COLUMNS = 24;
/** Net colour (the 4.6.1 net green). */
export const NET_COLOR = "#1c2a26";
/** GU47 phase 4: material opacity of the World Tour net (multiplies the tile alpha where it applies). */
export const NET_OPACITY = 0.5;
/** Bottom edge and the gap under the tape (the 4.6.1 boxes ran from 0.02 m to the sag height minus 0.03 m). */
const NET_BOTTOM_Y = 0.02;
const TAPE_GAP = 0.03;

/** Net height at `t` in [-1, 1] across the court (centre 0.914 m, posts 1.07 m), the 4.6.1 sag. */
export function netTopHeight(t: number): number {
  return 0.914 + (1.07 - 0.914) * t * t;
}

/** The same ten boxes as the original tape and centre strap, merged into one draw. */
export function netTapeParts(): Array<{ size: Vec3; position: Vec3 }> {
  const parts: Array<{ size: Vec3; position: Vec3 }> = [
    { size: [0.055, 0.914, 0.034], position: [0, 0.457, 0] }
  ];
  for (let i = 0; i < 9; i++) {
    const t0 = -1 + (i / 9) * 2;
    const t1 = -1 + ((i + 1) / 9) * 2;
    const t = (t0 + t1) * 0.5;
    parts.push({
      size: [(t1 - t0) * NET_POST_X + 0.015, 0.062, 0.036],
      position: [t * NET_POST_X, netTopHeight(t) - 0.02, 0]
    });
  }
  return parts;
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
    // GU47 phase 4: the p3-r3 frames read the net as an opaque near-black band (pixels about 10/255 on the clay court), so
    // the tile alpha is not reaching the blend on the capture path; a material opacity keeps the net see-through either way.
    opacity: NET_OPACITY,
    alphaMode: "blend",
    depthWrite: true,
    doubleSided: true,
    sampling: { wrap: "repeat", filter: "trilinear", generateMipmaps: true }
  });
}

/** WP-01: Dual-backend (GLSL 3.00 + WGSL) derivative-antialiased 4.2 cm braided cord net shader material. */
export function netMeshCustomMaterial(): AuraMaterialSpec {
  return material.custom(netMeshShaderSpec({ cellCells: NET_TILE_CELLS }));
}

/** The World Tour net node (1 draw, no shadow: the 4.6.1 net cast none either). */
export function buildNetMeshNode(): NodeInput {
  return geometry
    .custom(netMeshGeometry(), { name: NET_MESH_ID, material: netMeshCustomMaterial(), castShadow: false })
    .runtime(game.runtimeNode(NET_MESH_ID)) as unknown as NodeInput;
}

/**
 * TT-AN2 + WP-01: deform the existing mesh and its merged tape together and drive the `uNetImpact` elastic
 * ripple uniform on the paired GLSL+WGSL net shader without adding draws or touching the simulation.
 */
export function createNetCordMotion(mesh: AuraRuntimeNodeHandle, tape: AuraRuntimeNodeHandle) {
  const meshBase = Float32Array.from((netMeshGeometry() as unknown as { positions: number[] }).positions);
  const tapeBase = Float32Array.from((mergeBoxes(netTapeParts()) as unknown as { positions: number[] }).positions);
  const meshPositions = meshBase.slice();
  const tapePositions = tapeBase.slice();
  const uniformSink = mesh as AuraRuntimeNodeHandle & { setUniform?: (name: string, value: unknown) => void };
  let touched = false;
  let elapsed = Infinity;
  let hitX = 0;
  let direction = 1;
  let displaced = false;

  function write(base: Float32Array, positions: Float32Array, amount: number): void {
    for (let i = 0; i < base.length; i += 3) {
      const x = base[i]!;
      const y = base[i + 1]!;
      const postWeight = Math.max(0, 1 - (x / NET_POST_X) ** 2);
      const localWeight = Math.exp(-(((x - hitX) / 2.8) ** 2));
      const heightWeight = Math.min(1, Math.max(0, y / 0.9));
      positions[i + 2] = base[i + 2]! + amount * postWeight * localWeight * heightWeight;
    }
  }

  return {
    step(ball: { readonly netTouched: boolean; readonly x: number; readonly lastHit: string | null }, dt: number, reducedMotion: boolean): void {
      if (ball.netTouched && !touched && !reducedMotion) {
        hitX = Math.max(-NET_POST_X, Math.min(NET_POST_X, ball.x * COURT_X));
        direction = ball.lastHit === "player" ? -1 : 1;
        elapsed = 0;
      }
      touched = ball.netTouched;
      if (reducedMotion) elapsed = Infinity;
      if (elapsed < 0.3) {
        elapsed = Math.min(0.3, elapsed + Math.max(0, Math.min(0.05, Number.isFinite(dt) ? dt : 1 / 60)));
        const amount = direction * 0.03 * Math.sin(Math.PI * elapsed / 0.3);
        write(meshBase, meshPositions, amount);
        write(tapeBase, tapePositions, amount);
        mesh.updateAttribute?.("position", { array: meshPositions });
        tape.updateAttribute?.("position", { array: tapePositions });
        uniformSink.setUniform?.("uNetImpact", [hitX, amount, elapsed, direction]);
        displaced = true;
      } else if (displaced) {
        mesh.updateAttribute?.("position", { array: meshBase });
        tape.updateAttribute?.("position", { array: tapeBase });
        uniformSink.setUniform?.("uNetImpact", [0, 0, 0, 0]);
        displaced = false;
      }
    }
  };
}
