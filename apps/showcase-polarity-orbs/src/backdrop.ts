/**
 * Polarity Orbs Meshy backdrop (Meshy-07, presentation only): typed `model(assets.x)` pieces drifting past beyond the
 * road edges, each matching its half of the world. The warm red pole (left, x < 0) gets the red charge coil, the red
 * crystal cluster and the red crystal island; the cool blue pole (right) gets the blue-tinted crystal plinth, crystal
 * island and horseshoe magnet (hue baked into their base-colour textures at admission).
 *
 * Every pose is a pure function of the shown distance, the elapsed time and the polarity blend, so nothing here reads
 * or advances the simulation. On a flip the dominant half's pieces rise and swell slightly, the other half settles.
 */
import { model, type AuraApp, type AuraSceneBuilder } from "@aura3d/engine";
import { assets } from "./aura-model-assets";

type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;

export interface BackdropPiece {
  readonly id: string;
  readonly kind: keyof typeof assets;
  /** -1 = warm red pole (left), 1 = cool blue pole (right). */
  readonly side: -1 | 1;
  readonly offset: number;
  readonly y: number;
  readonly z0: number;
  readonly size: number;
  readonly spin: number;
}

const SPAN = 230;
const NEAR = 16;
const FAR = NEAR - SPAN;
/** Scroll rate relative to the road (reads as a little further away than the road edge). */
const PARALLAX = 0.6;

const ISLANDS = new Set<keyof typeof assets>(["poCrystalIslandB", "poCrystalIsland"]);

export const BACKDROP_PIECES: readonly BackdropPiece[] = (() => {
  const red: (keyof typeof assets)[] = ["poCrystalIslandB", "poChargeCoil", "poCrystalRed", "poCrystalIslandB", "poCrystalRed", "poChargeCoil"];
  const blue: (keyof typeof assets)[] = ["poCrystalBlue", "poCrystalIsland", "poMagnet", "poCrystalBlue", "poCrystalIsland", "poMagnet"];
  const kinds: { kind: keyof typeof assets; side: -1 | 1 }[] = [];
  for (let i = 0; i < red.length; i++) kinds.push({ kind: red[i]!, side: -1 }, { kind: blue[i]!, side: 1 });
  return kinds.map(({ kind, side }, i): BackdropPiece => {
    const island = ISLANDS.has(kind);
    return {
      id: `meshy-${i}`, kind, side,
      offset: (island ? 17 : 15) + ((i * 7) % 5) * 2.6,
      y: island ? -4.5 + ((i * 3) % 4) * 1.1 : -0.5 + ((i * 5) % 4) * 0.9,
      z0: (i / kinds.length) * SPAN + ((i * 11) % 7) * 1.5,
      size: island ? 10 : kind === "poCrystalRed" ? 7 : 7.5,
      spin: i % 3 === 0 ? 0.08 : -0.06
    };
  });
})();

const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/**
 * Piece pose: scrolls at PARALLAX x the road, grows in at the far end and out near the camera; `mix` is the world's
 * polarity blend (0 = warm/red dominant, 1 = cool/blue dominant).
 */
export function backdropPose(p: BackdropPiece, distance: number, elapsed: number, mix: number, reduced: boolean) {
  const z = ((((p.z0 + distance * PARALLAX) % SPAN) + SPAN) % SPAN) + FAR;
  const fade = smooth((z - FAR) / 40) * smooth((NEAR - z) / 18);
  const t = reduced ? 0 : elapsed;
  const dominance = p.side < 0 ? 1 - mix : mix;
  const bob = Math.sin(t * 0.6 + p.z0) * 0.3;
  return {
    x: p.side * p.offset,
    y: p.y + bob + (dominance - 0.5) * 1.4,
    z,
    scale: fade * (0.9 + 0.1 * dominance),
    yaw: t * p.spin + p.z0
  };
}

export function addBackdrop(builder: AuraSceneBuilder): void {
  // Created visible and on-screen (never hidden at build), parked by scale in update.
  for (const p of BACKDROP_PIECES) {
    builder.add(model(assets[p.kind], { name: p.id, targetMaxDimension: p.size, castShadow: false, receiveShadow: false }).runtime({ id: p.id }));
  }
}

export function updateBackdrop(node: (id: string) => NodeHandle, distance: number, elapsed: number, mix: number, reduced: boolean): void {
  for (const p of BACKDROP_PIECES) {
    const pose = backdropPose(p, distance, elapsed, mix, reduced);
    node(p.id).setVisible(pose.scale > 0.02).setPosition(pose.x, pose.y, pose.z).setRotation(0, pose.yaw, 0).setScale(Math.max(0.001, pose.scale));
  }
}
