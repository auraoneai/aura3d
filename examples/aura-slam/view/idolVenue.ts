/**
 * Idol wow pass: the World Tour venue set pieces as image-to-3D GLBs (speridlabs/idol/max, tools/idol/specs/aura-slam.json).
 * Every model keeps the node name (and runtime id) of the procedural piece it replaces, its footprint and its facing; the
 * court surfaces, lines, net, boards, bleacher tiers, roof truss and crowd stay procedural. `?look=original` and `?idol=0`
 * keep the procedural pieces (view/scene.ts).
 */
import { game, geometry, group, material, model, type AuraCustomGeometrySpec, type AuraSceneNode } from "@aura3d/engine";
import { NET_POST_X } from "./constants";
import { hasIdolModel, idolModels, type IdolModelKey } from "./assets";
import { buildUmpireIdolNode, UMPIRE_CHAIR_X } from "./idolUmpire";
import { TV_CAMERAS } from "./idolVenueMotion";
import type { Vec3 } from "../contract/units";

/** `?idol=0` keeps every procedural model (side-by-side comparisons). */
export function idolEnabled(search?: string): boolean {
  const raw = search ?? (typeof location !== "undefined" ? location.search : "");
  return new URLSearchParams(raw).get("idol") !== "0";
}

/**
 * Ground heights the set pieces stand on (view/scene.ts): the court apron (19.8 x 26.8 m, top -0.004) and the outer ground
 * plane (-0.024) around it. Idol GLBs are grounded at their lowest vertex; their footprints sit within 2.5 cm of it (feet,
 * legs and bases measured per GLB), so every piece is sunk GROUND_EMBED below the surface it stands on: no visible gap.
 */
export const APRON_HALF: readonly [number, number] = [9.9, 13.4];
export const GROUND_EMBED = 0.025;
export function groundY(x: number, z: number): number {
  return Math.abs(x) <= APRON_HALF[0] && Math.abs(z) <= APRON_HALF[1] ? -0.004 : -0.024;
}
/** base height a set piece is placed at: just below the ground under it */
export const baseY = (x: number, z: number): number => groundY(x, z) - GROUND_EMBED;

/** The Idol scoreboard stands on the outer ground: the renderer places the gantry node at this height instead of GANTRY_POSITION[1]. */
export const IDOL_GANTRY_Y = -0.024 - GROUND_EMBED;
/** Grandstand facade: two arcade sections in front of the rear grandstand box (its court face is at z = -17.4; the arcade is ~1.8 m deep at 5.6 m tall). */
export const ARCADE_Z = -16.45;
export const ARCADE_HEIGHT = 5.6;

interface Placement {
  readonly key: IdolModelKey;
  readonly name: string;
  readonly position: Vec3;
  /** yaw (radians) turning the GLB's +Z front */
  readonly yaw?: number;
  /** on-scene size: the GLB's normalised height is kept unless given */
  readonly height?: number;
  readonly runtimeId?: string;
  readonly castShadow?: boolean;
}

/** `place` without a world transform: the model at a group's origin (the group carries position, yaw and runtime id). */
function placeLocal(key: IdolModelKey, name: string, height?: number, castShadow = false): AuraSceneNode {
  const asset = idolModels[key];
  const k = height ? height / asset.bounds[1] : 1;
  return model(asset, { name, role: "setDressing", scaleMode: "world", castShadow, receiveShadow: true }).scale([k, k, k]).toJSON() as AuraSceneNode;
}

/** Flat discs (radius r) facing +Z at the given centres, merged into one mesh (one draw). */
export function discsGeometry(centres: readonly Vec3[], r: number, segments = 18): AuraCustomGeometrySpec {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const c of centres) {
    const base = positions.length / 3;
    positions.push(c[0], c[1], c[2]); normals.push(0, 0, 1); uvs.push(0.5, 0.5);
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      positions.push(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2]); normals.push(0, 0, 1); uvs.push(0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2);
      indices.push(base, base + 1 + i, base + 1 + ((i + 1) % segments));
    }
  }
  return { kind: "aura-custom-geometry", positions, normals, uvs, indices } as unknown as AuraCustomGeometrySpec;
}

/** Axis-aligned slabs (size, centre) merged into one mesh. */
function slabsGeometry(parts: ReadonlyArray<{ size: Vec3; at: Vec3 }>): AuraCustomGeometrySpec {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const faces: Array<{ n: Vec3; u: Vec3; v: Vec3 }> = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] }
  ];
  for (const p of parts) {
    for (const f of faces) {
      const base = positions.length / 3;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        for (let k = 0; k < 3; k++) positions.push(p.at[k]! + 0.5 * p.size[k]! * (f.n[k]! + a * f.u[k]! + b * f.v[k]!));
        normals.push(...f.n); uvs.push((a + 1) / 2, (b + 1) / 2);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return { kind: "aura-custom-geometry", positions, normals, uvs, indices } as unknown as AuraCustomGeometrySpec;
}

/**
 * The procedural towers' lenses and the gantry's LED strips were emissive (`TOUR_MATS.floodLed`, `scoreAccentLed`); the Idol
 * GLBs bake their lamps and strips unlit, so the same emissive faces are laid over them (measured on the normalised GLBs).
 */
const FLOOD_LED = material.emissive({ color: "#fff6dc", emissive: "#fff3cc", emissiveIntensity: 1.35, practical: true });
const SCORE_LED = material.emissive({ color: "#d8ff3e", emissive: "#d8ff3e", emissiveIntensity: 0.85, practical: true });
/** lamp-face centres of slamFloodlightTower (two rows of four, facing +Z) and their lens radius, GLB metres */
export const FLOOD_LENSES: readonly Vec3[] = [7.92, 8.73].flatMap((y) => [-1.34, -0.44, 0.48, 1.38].map((x): Vec3 => [x, y, 0.43]));
export const FLOOD_LENS_RADIUS = 0.3;

function place(p: Placement): AuraSceneNode {
  const asset = idolModels[p.key];
  const k = p.height ? p.height / asset.bounds[1] : 1;
  let b = model(asset, { name: p.name, role: "setDressing", scaleMode: "world", castShadow: p.castShadow ?? true, receiveShadow: true })
    .position(p.position[0], p.position[1] + baseY(p.position[0], p.position[2]), p.position[2])
    .rotate(0, p.yaw ?? 0, 0)
    .scale([k, k, k]);
  if (p.runtimeId) b = b.runtime(game.runtimeNode(p.runtimeId));
  return b.toJSON() as AuraSceneNode;
}

/** two-seat Idol bench stood 0.97 m wide (its normalised GLB is 1.94 m wide x 1.66 m tall) */
const BENCH_HEIGHT = 0.83;

/** Facing the court from the left (-X) sideline: +Z front turned to +X. */
const FACE_COURT_FROM_LEFT = Math.PI / 2;

export function idolNetPostNodes(): AuraSceneNode[] {
  // The winder crank is on the GLB's right side (+X): the right post keeps it outboard, the left post turns half a revolution.
  return [
    place({ key: "slamNetPost", name: "net-post-left", position: [-NET_POST_X, 0, 0], yaw: Math.PI }),
    place({ key: "slamNetPost", name: "net-post-right", position: [NET_POST_X, 0, 0] })
  ];
}

export function idolUmpireNodes(): AuraSceneNode[] {
  return [
    place({ key: "slamUmpireChair", name: "wt-umpire-stand", position: [UMPIRE_CHAIR_X, 0, 0], yaw: FACE_COURT_FROM_LEFT }),
    buildUmpireIdolNode(baseY(UMPIRE_CHAIR_X, 0))
  ];
}

export function idolSidelineNodes(): AuraSceneNode[] {
  const out: AuraSceneNode[] = [];
  for (const sideZ of [-1, 1] as const) {
    const tag = sideZ < 0 ? "north" : "south";
    out.push(
      // the procedural bench was one 1.94 m three-seater; the Idol bench is a two-seater, so two stand end to end (0.97 m each)
      ...[-0.485, 0.485].map((dz, i) => place({ key: "slamPlayerBench", name: `wt-sideline-bench-${tag}${i ? "-b" : ""}`, position: [-7.35, 0, sideZ * 3.4 + dz], yaw: FACE_COURT_FROM_LEFT, height: BENCH_HEIGHT })),
      place({ key: "slamDrinksCooler", name: `wt-sideline-cooler-${tag}`, position: [-7.35, 0, sideZ * 1.85], yaw: FACE_COURT_FROM_LEFT, castShadow: false }),
      place({ key: "slamTowelRack", name: `wt-sideline-towels-${tag}`, position: [-7.35, 0, sideZ * 4.78], yaw: FACE_COURT_FROM_LEFT, castShadow: false })
    );
  }
  return out;
}

/** null when the floodlight GLB is not admitted (the scene keeps the procedural lattice towers). */
export function idolFloodlightNodes(): AuraSceneNode[] | null {
  const key: string = "slamFloodlightTower";
  if (!hasIdolModel(key)) return null;
  return ([-1, 1] as const).map((side) => {
    const name = `stadium-floodlight-${side < 0 ? "left" : "right"}`;
    return group(name, [
      placeLocal(key, `${name}-tower`),
      geometry.custom(discsGeometry(FLOOD_LENSES, FLOOD_LENS_RADIUS), { name: `${name}-lenses`, material: FLOOD_LED, castShadow: false, receiveShadow: false })
    ], { position: [side * 12.5, baseY(side * 12.5, -13.2), -13.2], rotation: [0, side * -0.2, 0] }).toJSON() as AuraSceneNode;
  });
}

/** The Idol scoreboard is as tall as it is wide (clock on top): stood at the procedural gantry's 4.3 m top, it is ~4.3 m wide. */
export const IDOL_SCOREBOARD_HEIGHT = 4.4;

/** LED accent strips along the top and bottom of the Idol board's screen (normalised GLB: screen y 2.95-4.8, x +-3.05, face z 0.57). */
const SCORE_STRIPS = [2.86, 4.9].map((y) => ({ size: [6.0, 0.06, 0.03] as Vec3, at: [0, y, 0.6] as Vec3 }));

export function idolScoreboardNode(position: Vec3): AuraSceneNode {
  const k = IDOL_SCOREBOARD_HEIGHT / idolModels.slamScoreboard.bounds[1];
  return group("stadium-scoreboard-gantry", [
    placeLocal("slamScoreboard", "stadium-scoreboard-board", IDOL_SCOREBOARD_HEIGHT),
    geometry.custom(slabsGeometry(SCORE_STRIPS.map((s) => ({ size: [s.size[0] * k, s.size[1] * k, s.size[2]], at: [s.at[0] * k, s.at[1] * k, s.at[2] * k] as Vec3 }))),
      { name: "stadium-scoreboard-leds", material: SCORE_LED, castShadow: false, receiveShadow: false })
  ], { position: [position[0], IDOL_GANTRY_Y + (position[1] < 0 ? position[1] : 0), position[2]] })
    .runtime(game.runtimeNode("stadium-scoreboard-gantry")).toJSON() as AuraSceneNode;
}

/** Grandstand arcade, boxwood urns at the far corners and the two courtside TV cameras (replacing the procedural bowl parts). */
export function idolBowlNodes(): AuraSceneNode[] {
  const arcadeW = idolModels.slamArcadeFacade.bounds[0] * (ARCADE_HEIGHT / idolModels.slamArcadeFacade.bounds[1]);
  const out: AuraSceneNode[] = [-0.5, 0.5].map((f, i) =>
    place({ key: "slamArcadeFacade", name: `wt-stadium-arcade-${i}`, position: [f * arcadeW, 0, ARCADE_Z], height: ARCADE_HEIGHT, castShadow: false })
  );
  for (const [i, px] of [-8.2, 8.2].entries()) {
    out.push(place({ key: "slamBoxwoodPlanter", name: `wt-boxwood-urn-${i}`, position: [px, 0, -11.35], yaw: i * 1.3, castShadow: false }));
  }
  for (const sx of [-1, 1] as const) {
    // the procedural tripod's lens looked along (-sin yaw, -cos yaw); the GLB's lens points along its +X, so it turns by yaw + PI/2
    // (it pans to follow the ball at runtime: view/idolVenueMotion.ts)
    out.push(place({ key: "slamTvCamera", name: TV_CAMERAS[sx < 0 ? 0 : 1]!.id, position: TV_CAMERAS[sx < 0 ? 0 : 1]!.position, yaw: TV_CAMERAS[sx < 0 ? 0 : 1]!.baseYaw, runtimeId: TV_CAMERAS[sx < 0 ? 0 : 1]!.id, castShadow: false }));
  }
  return out;
}
