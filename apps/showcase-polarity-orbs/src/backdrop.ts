/**
 * Polarity Orbs procedural multi-material Tokamak & Magnetic Lab backdrop (WP-17, presentation only):
 * 6 scrolling `group(g.id, ...).runtime({ id: g.id })` landmark & corridor assemblies flanking the
 * ferrofluid slate road. `poChargeCoil` (left, warm +) and `poMagnet` (right, cool −) stand close to
 * the track edges (`x = ±7.4..9.8 m`) alongside machined aluminum arena bezels, copper busbar gantries,
 * and cryo-manifolds, while borosilicate vacuum quartz pods and stratified Tokamak sky islands drift
 * in outer parallax lanes. Two tiled spans per group wrap seamlessly via `zShift = (distance * PARALLAX) % SPAN`.
 */
import type { AuraApp, AuraSceneBuilder } from "@aura3d/engine";
import { buildBackdropGroupNode, type BackdropAssetKind } from "./art/proceduralModels";

type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;
type AssetKind = BackdropAssetKind;

export interface BackdropPiece {
  readonly id: string;
  readonly kind: AssetKind;
  /** -1 = warm red pole (left), 1 = cool blue pole (right). */
  readonly side: -1 | 1;
  readonly offset: number;
  readonly y: number;
  readonly z0: number;
  readonly size: number;
  readonly spin: number;
}

export interface BackdropGroup {
  readonly id: string;
  readonly kind: AssetKind;
  readonly side: -1 | 1;
  readonly parallax: number;
  readonly size: number;
  readonly baseY: number;
  readonly transforms: readonly {
    readonly position: readonly [number, number, number];
    readonly rotation: readonly [number, number, number];
    readonly scale: number;
  }[];
}

const SPAN = 180;
const NEAR = 22;
const FAR = NEAR - SPAN;
const PARALLAX = 0.65;

const ISLANDS = new Set<AssetKind>(["poCrystalIslandB", "poCrystalIsland"]);
const PYLONS = new Set<AssetKind>(["poChargeCoil", "poMagnet"]);

export const BACKDROP_GROUPS: readonly BackdropGroup[] = (() => {
  const specs: readonly { kind: AssetKind; side: -1 | 1; size: number; baseY: number; parallax: number; slots: readonly [number, number, number, number, number][] }[] = [
    {
      kind: "poChargeCoil",
      side: -1,
      size: 5.8,
      baseY: -0.15,
      parallax: 1.0,
      slots: [
        [-7.8, 0.0, -18, 0.28, 0.96],
        [-9.0, 0.0, -78, -0.32, 1.04],
        [-8.0, 0.0, -138, 0.42, 0.94]
      ]
    },
    {
      kind: "poMagnet",
      side: 1,
      size: 6.0,
      baseY: -0.15,
      parallax: 1.0,
      slots: [
        [7.8, 0.0, -48, -0.32, 0.96],
        [9.1, 0.0, -108, 0.28, 1.04],
        [8.0, 0.0, -168, -0.44, 0.94]
      ]
    },
    {
      kind: "poCrystalRed",
      side: -1,
      size: 6.6,
      baseY: -0.5,
      parallax: 0.72,
      slots: [
        [-12.8, 0.2, -34, 0.6, 0.94],
        [-14.6, 0.9, -96, 1.9, 1.06],
        [-13.4, -0.2, -154, -0.8, 0.9]
      ]
    },
    {
      kind: "poCrystalBlue",
      side: 1,
      size: 7.0,
      baseY: -0.5,
      parallax: 0.72,
      slots: [
        [12.8, 0.25, -64, -0.55, 0.94],
        [14.8, 0.95, -124, -1.85, 1.06],
        [13.4, -0.15, -176, 0.75, 0.9]
      ]
    },
    {
      kind: "poCrystalIslandB",
      side: -1,
      size: 10.5,
      baseY: -3.6,
      parallax: PARALLAX,
      slots: [
        [-18.5, 0.0, -26, 0.4, 0.95],
        [-22.0, 1.8, -88, 1.7, 1.08],
        [-19.5, -0.9, -148, -1.1, 0.92]
      ]
    },
    {
      kind: "poCrystalIsland",
      side: 1,
      size: 10.5,
      baseY: -3.6,
      parallax: PARALLAX,
      slots: [
        [18.5, 0.1, -56, -0.45, 0.95],
        [22.0, 1.9, -118, -1.65, 1.08],
        [19.5, -0.8, -172, 1.15, 0.92]
      ]
    }
  ];

  return specs.map((spec): BackdropGroup => {
    const transforms: { position: [number, number, number]; rotation: [number, number, number]; scale: number }[] = [];
    // Double-span tiling `[0, -SPAN]` so scrolling `z` in `[0, SPAN)` never pops inside the camera frustum.
    for (const tileShift of [0, -SPAN]) {
      for (const [x, dy, z, yaw, scale] of spec.slots) {
        transforms.push({
          position: [x, dy, z + tileShift],
          rotation: [0, yaw, 0],
          scale
        });
      }
    }
    return {
      id: `backdrop-${spec.kind}`,
      kind: spec.kind,
      side: spec.side,
      parallax: spec.parallax,
      size: spec.size,
      baseY: spec.baseY,
      transforms
    };
  });
})();

export const BACKDROP_PIECES: readonly BackdropPiece[] = (() => {
  const red: AssetKind[] = ["poCrystalIslandB", "poChargeCoil", "poCrystalRed", "poCrystalIslandB", "poCrystalRed", "poChargeCoil"];
  const blue: AssetKind[] = ["poCrystalBlue", "poCrystalIsland", "poMagnet", "poCrystalBlue", "poCrystalIsland", "poMagnet"];
  const kinds: { kind: AssetKind; side: -1 | 1 }[] = [];
  for (let i = 0; i < red.length; i++) kinds.push({ kind: red[i]!, side: -1 }, { kind: blue[i]!, side: 1 });
  return kinds.map(({ kind, side }, i): BackdropPiece => {
    const island = ISLANDS.has(kind);
    const pylon = PYLONS.has(kind);
    return {
      id: `meshy-${i}`,
      kind,
      side,
      offset: pylon ? 7.6 + ((i * 3) % 3) * 0.9 : (island ? 18 : 13) + ((i * 7) % 4) * 2.2,
      y: island ? -3.8 + ((i * 3) % 4) * 0.9 : -0.4 + ((i * 5) % 3) * 0.45,
      z0: (i / kinds.length) * SPAN + ((i * 11) % 7) * 1.5,
      size: island ? 10.5 : pylon ? 5.9 : 6.8,
      spin: i % 3 === 0 ? 0.08 : -0.06
    };
  });
})();

const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

export function backdropPose(p: BackdropPiece, distance: number, elapsed: number, mix: number, reduced: boolean) {
  const z = ((((p.z0 + distance * PARALLAX) % SPAN) + SPAN) % SPAN) + FAR;
  const fade = smooth((z - FAR) / 40) * smooth((NEAR - z) / 18);
  const t = reduced ? 0 : elapsed;
  const dominance = p.side < 0 ? 1 - mix : mix;
  const bob = Math.sin(t * 0.6 + p.z0) * 0.3;
  return {
    x: p.side * p.offset,
    y: p.y + bob + (dominance - 0.5) * 1.1,
    z,
    scale: fade * (0.9 + 0.1 * dominance),
    yaw: t * p.spin + p.z0
  };
}

export function addBackdrop(builder: AuraSceneBuilder): void {
  for (const g of BACKDROP_GROUPS) {
    builder.add(buildBackdropGroupNode(g));
  }
}

export function updateBackdrop(node: (id: string) => NodeHandle, distance: number, elapsed: number, mix: number, reduced: boolean): void {
  const t = reduced ? 0 : elapsed;
  for (let i = 0; i < BACKDROP_GROUPS.length; i++) {
    const g = BACKDROP_GROUPS[i]!;
    const zScroll = (((distance * g.parallax) % SPAN) + SPAN) % SPAN;
    const dominance = g.side < 0 ? 1 - mix : mix;
    const isPylon = PYLONS.has(g.kind);
    const bob = isPylon ? 0 : Math.sin(t * 0.65 + i * 1.3) * 0.28;
    const y = g.baseY + bob + (isPylon ? 0 : (dominance - 0.5) * 1.1);
    node(g.id).setPosition(0, y, zScroll);
  }
}
