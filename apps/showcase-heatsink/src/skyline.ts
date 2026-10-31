/**
 * Parallax skyline (GU47 WP-13 HS-04): three silhouette layers at 180 / 300 / 450 m per circuit (`CircuitSpec.skyline`
 * in data.ts), each one instanced silhouette node plus one instanced node of glowing seams: 6 draws, no shadows.
 *
 * The sky (HDRI), the key and the skyline stay fixed in the view frame, as the old backdrop did (the world scrolls past
 * a drone that always faces -Z); the layers separate through the chase camera's lateral travel, and the fog turns the
 * far layers into aerial-perspective silhouettes against the HDRI. The pieces are boxes until lane wp36 delivers the
 * HS-09 skyline set (cooling towers, smokestacks, crystal spires); the far-layer impostor is baked on the runner
 * (phase 2).
 */
import { game, instances, material, type AuraNodeBuilder, type AuraSceneNode, type AuraTransformSpec } from "@aura3d/engine";
import type { CircuitSpec, SkylineLayerSpec } from "./data";
import type { CircuitLook } from "./look";
import { skylineFacadeMaterial } from "./shaders";

/** Window bay size per layer (metres; wider far away so a bay stays a few pixels wide). */
export const SKYLINE_WINDOW_CELLS: readonly (readonly [number, number])[] = [[3.2, 3.6], [4.6, 5.2], [6.4, 7.2]];

/** Ground level of the plain below the elevated road (the abyss floor's top). */
export const SKYLINE_BASE_Y = -8.5;
/** No piece of the nearest layer stands within this angle of the road ahead (it would sit on the far road). */
export const SKYLINE_ROAD_GAP_DEG = 9;

export interface SkylinePiece {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly spire: boolean;
}

/** Deterministic PRNG (mulberry32), so a layer is the same on every boot. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pieces of one layer, spread over the arc in front of the road with jitter. */
export function skylineLayout(layer: SkylineLayerSpec, nearest: boolean): SkylinePiece[] {
  const next = rng(layer.seed);
  const out: SkylinePiece[] = [];
  const arc = layer.arcDeg;
  for (let i = 0; i < layer.count; i += 1) {
    const slot = layer.count === 1 ? 0.5 : i / (layer.count - 1);
    let angle = -arc + slot * 2 * arc + (next() - 0.5) * ((2 * arc) / layer.count) * 0.8;
    if (nearest && Math.abs(angle) < SKYLINE_ROAD_GAP_DEG) angle = Math.sign(angle || 1) * (SKYLINE_ROAD_GAP_DEG + next() * 4);
    const spire = next() < layer.spires;
    const [hMin, hMax] = layer.height;
    const [wMin, wMax] = layer.width;
    const height = spire ? hMin + (hMax - hMin) * (0.6 + 0.4 * next()) : hMin + (hMax - hMin) * next() * 0.85;
    const width = spire ? Math.max(3, wMin * (0.25 + 0.2 * next())) : wMin + (wMax - wMin) * next();
    const distance = layer.distance * (0.94 + 0.12 * next());
    const rad = (angle * Math.PI) / 180;
    out.push({ x: Math.sin(rad) * distance, z: -Math.cos(rad) * distance, yaw: -rad, width, height, depth: spire ? width : width * (0.6 + 0.5 * next()), spire });
  }
  return out;
}

const box = (piece: SkylinePiece, y: number, height: number, inflate = 1): AuraTransformSpec => ({
  position: [piece.x, y, piece.z],
  rotation: [0, piece.yaw, 0],
  scale: [piece.width * inflate, height, piece.depth * inflate]
});

/** Silhouette and seam transforms for a layer: two seams per block, a beacon cap on each spire. */
export function skylineTransforms(pieces: readonly SkylinePiece[]): { readonly bodies: AuraTransformSpec[]; readonly seams: AuraTransformSpec[] } {
  const bodies: AuraTransformSpec[] = [];
  const seams: AuraTransformSpec[] = [];
  for (const piece of pieces) {
    bodies.push(box(piece, SKYLINE_BASE_Y + piece.height / 2, piece.height));
    if (piece.spire) {
      seams.push(box(piece, SKYLINE_BASE_Y + piece.height + 1.2, 2.4, 0.9));
      seams.push(box(piece, SKYLINE_BASE_Y + piece.height * 0.55, 1.4, 1.04));
    } else {
      seams.push(box(piece, SKYLINE_BASE_Y + piece.height * 0.38, 1.6, 1.02));
      seams.push(box(piece, SKYLINE_BASE_Y + piece.height * 0.74, 1.6, 1.02));
    }
  }
  return { bodies, seams };
}

/** The skyline nodes of a circuit: per layer one silhouette node and one seam node (6 draws, unshadowed). */
export function skylineNodes(circuit: CircuitSpec, look: CircuitLook): AuraNodeBuilder<AuraSceneNode>[] {
  const out: AuraNodeBuilder<AuraSceneNode>[] = [];
  circuit.skyline.forEach((layer, index) => {
    const { bodies, seams } = skylineTransforms(skylineLayout(layer, index === 0));
    const flat = { castShadow: false, receiveShadow: false, frustumCulled: false } as const;
    out.push(
      instances.box({ name: `td skyline ${index} bodies`, size: [1, 1, 1], material: skylineFacadeMaterial({ body: look.skyline.color, foot: look.skyline.foot, window: look.skyline.windows[0], window2: look.skyline.windows[1], cell: SKYLINE_WINDOW_CELLS[Math.min(index, SKYLINE_WINDOW_CELLS.length - 1)]!, lit: look.skyline.lit, glow: look.skyline.windowGlow - index * 0.5 }), transforms: bodies, ...flat })
        .runtime(game.runtimeNode(`td-skyline-${index}-bodies`)),
      instances.box({ name: `td skyline ${index} seams`, size: [1, 1, 1], material: material.emissive({ color: look.skyline.glow, emissive: look.skyline.glow, emissiveIntensity: 1.3 - index * 0.25 }), transforms: seams, ...flat })
        .runtime(game.runtimeNode(`td-skyline-${index}-seams`))
    );
  });
  return out;
}
