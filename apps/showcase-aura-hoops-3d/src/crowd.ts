/**
 * H47-A1 (GU47 wave 2): the spectators. Two Meshy standing fans (`blacktopFanB`, `blacktopFanC`; the arms-out T-pose
 * fans A and D are not used) stand on the grounded bleachers of every court, one instanced draw per fan model, so the
 * crowd is at most 2 draws. Layout is pure and deterministic (a local LCG: no RNG draw from the sim or cosmetic
 * streams), nothing collides, and only the new look mounts it (`?look=original` keeps the 4.6 bleachers empty).
 */
import { instances, type AuraAssetRef, type AuraColor, type AuraNodeBuilder, type AuraSceneNode, type AuraVec3 } from "@aura3d/engine";
import { BLEACHER_ROWS, BLEACHER_STANDS } from "./courtRigs";

/** Fans per row across the 10 m riser (0.95 m apart), 3 stands x 5 rows = 150 slots. */
export const CROWD_SLOTS_PER_ROW = 10;
const SLOT_PITCH = 0.95;
/** Empty slots (spread by the LCG), so the crowd has gaps: 150 - 8 = 142 fans per court. */
const EMPTY_SLOTS = 8;
/** Standing fan height in metres (the fitted model height before the per-fan scale). */
export const FAN_HEIGHT = 1.7;

export interface FanTransform {
  readonly position: AuraVec3;
  readonly rotation: AuraVec3;
  readonly scale: number;
}
export interface CrowdLayout {
  readonly fanB: readonly FanTransform[];
  readonly fanC: readonly FanTransform[];
  readonly colorsB: readonly AuraColor[];
  readonly colorsC: readonly AuraColor[];
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Blend a #rrggbb colour toward white by `t` (0 = white, 1 = the colour). */
export function softTint(hex: string, t: number): AuraColor {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(255 - (255 - ((n >> shift) & 255)) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}` as AuraColor;
}

/** Fans on the five rows of the three stands. `seat` is the court's seat-plank colour (one fan in five wears a hint of it). */
export function crowdLayout(seat: string, seed: number): CrowdLayout {
  const rnd = lcg(seed);
  const empty = new Set<number>();
  while (empty.size < EMPTY_SLOTS) empty.add(Math.floor(rnd() * BLEACHER_STANDS.length * BLEACHER_ROWS * CROWD_SLOTS_PER_ROW));
  const accent = softTint(seat, 0.45);
  const neutrals: AuraColor[] = ["#ffffff", "#e6ecf5", "#f3e4d6", "#dfe9e0"];
  const fanB: FanTransform[] = [], fanC: FanTransform[] = [], colorsB: AuraColor[] = [], colorsC: AuraColor[] = [];
  let slot = 0;
  for (const [x, z, yaw] of BLEACHER_STANDS) {
    const bx = -Math.sin(yaw), bz = -Math.cos(yaw); // the stand's back, away from the court
    const lx = Math.cos(yaw), lz = -Math.sin(yaw); // along the riser
    for (let r = 0; r < BLEACHER_ROWS; r++) {
      const depth = 0.8 * r + 0.12; // the seat plank of row r
      const top = 0.45 * (r + 1) + 0.08;
      for (let i = 0; i < CROWD_SLOTS_PER_ROW; i++, slot++) {
        // every random draw is taken for every slot, so removing one slot never shifts the others
        const jx = (rnd() - 0.5) * 0.2, jy = (rnd() - 0.5) * 0.5, pickC = rnd() < 0.5, scale = 0.94 + rnd() * 0.12, tint = rnd(), neutral = Math.floor(rnd() * neutrals.length);
        if (empty.has(slot)) continue;
        const along = (i - (CROWD_SLOTS_PER_ROW - 1) / 2) * SLOT_PITCH + jx;
        const t: FanTransform = {
          position: [x + bx * depth + lx * along, top, z + bz * depth + lz * along],
          // face the court, a little turned toward the middle of the action
          rotation: [0, yaw + jy, 0],
          scale
        };
        const color = tint < 0.2 ? accent : neutrals[neutral]!;
        (pickC ? fanC : fanB).push(t);
        (pickC ? colorsC : colorsB).push(color);
      }
    }
  }
  return { fanB, fanC, colorsB, colorsC };
}

export interface CrowdAssets {
  readonly fanB: AuraAssetRef<"model">;
  readonly fanC: AuraAssetRef<"model">;
}

/** The crowd of one court: two instanced draws (one per fan model). */
export function courtCrowdNodes(courtId: string, seat: string, refs: CrowdAssets): AuraNodeBuilder<AuraSceneNode>[] {
  const layout = crowdLayout(seat, 0x6f4a ^ [...courtId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
  const group = (asset: AuraAssetRef<"model">, name: string, transforms: readonly FanTransform[], colors: readonly AuraColor[]) =>
    instances.model(asset, {
      name,
      targetHeight: FAN_HEIGHT,
      scaleMode: "fit",
      role: "setDressing",
      castShadow: false,
      receiveShadow: true,
      transforms: transforms.map((t) => ({ position: t.position, rotation: t.rotation, scale: t.scale })),
      colors
    }) as unknown as AuraNodeBuilder<AuraSceneNode>;
  return [group(refs.fanB, "crowd-fans-b", layout.fanB, layout.colorsB), group(refs.fanC, "crowd-fans-c", layout.fanC, layout.colorsC)];
}
