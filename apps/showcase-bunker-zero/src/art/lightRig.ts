/**
 * GU47 WP-21 BZ-01 / BZ-02: the practical light rig. All floors share the origin and only the active floor is drawn
 * (C18), so the rig is one set of mount-time light nodes that `applyFloor` re-aims, recolours and shows per floor
 * (E-B `setLight` / `setPosition` / `setVisible`). A light added at runtime would not render (E-B handoff on
 * compileScene.addSubtree), and per-floor copies would leak through the shared origin, so the rig never grows.
 *
 * Per floor: one shadowed key spot (PCSS, 1024; on F6 the moon through the hatch is the key instead), one unshadowed
 * fill spot (F5: a fluorescent rect tube; F6: a sweeping red alarm beacon), the player's carried lamp at 1.2, and a pool
 * of fixture points (distance 8) that follow the fixtures nearest the camera, weighted toward the ones it can see
 * (`rankFixtures`). Fog, IBL intensity and grade per floor are applied by main.ts from the same look row.
 *
 * Engine limits (digest E-B): local spot shadows render only when a forward program carries the PRD-02 lookup chunk
 * (the default bridge renders sun cascades only), so the key spot's shadow is authored now and draws once the E-B /
 * integration handoff lands; the F6 moon is a directional, so its hatch shaft shadows draw today.
 */
import type { AuraNodeBuilder, AuraSceneNode, lights as LightBuilders } from "@aura3d/engine";
import { CELL } from "../maps";
import {
  BZ_FIXTURE_LIGHTS, BZ_HATCH_CELLS, BZ_PLAYER_LIGHT, cellWorld, fixtureCells, floorDefOfSlot, lookOfSlot, wallHeightOfSlot,
  type BunkerLookRow, type BunkerSpotRow
} from "./look";

export const RIG_IDS = {
  key: "bz-key-spot",
  fill: "bz-fill-spot",
  moon: "bz-moon-key",
  tube: "bz-f5-tube",
  player: "bz-player-light"
} as const;
export const FIXTURE_POOL_SIZE = Math.max(...Object.values(BZ_FIXTURE_LIGHTS));
export const fixtureLightId = (i: number): string => `bz-fixture-light-${i}`;

/** F6 set piece (BZ-07): the hatch over the Warden arena and the moon key through it (the strongest directional). */
export const BZ_HATCH = { cells: BZ_HATCH_CELLS } as const;
export const BZ_MOON = { color: "#9fb4ff", intensity: 2.6, elevationDeg: 74, azimuthDeg: 200 } as const;

export type QualityTierName = keyof typeof BZ_FIXTURE_LIGHTS;

/** Rig lights shown on a floor slot (the per-floor visible set the art-direction audit mirrors). */
export function visibleRigLights(slot: number, tier: QualityTierName = "high"): readonly string[] {
  const ids: string[] = [];
  if (slot === 5) ids.push(RIG_IDS.moon); else ids.push(RIG_IDS.key);
  ids.push(slot === 4 ? RIG_IDS.tube : RIG_IDS.fill);
  ids.push(RIG_IDS.player);
  for (let i = 0; i < BZ_FIXTURE_LIGHTS[tier]; i++) ids.push(fixtureLightId(i));
  return ids;
}

function spotPose(spot: BunkerSpotRow, slot: number): { position: [number, number, number]; target: [number, number, number] } {
  const h = wallHeightOfSlot(slot);
  return { position: cellWorld(spot.cell, h - spot.drop), target: cellWorld(spot.target, 0) };
}

/** Unit direction of the moon (from the light toward the scene). */
export function moonDirection(): [number, number, number] {
  const el = (BZ_MOON.elevationDeg * Math.PI) / 180, az = (BZ_MOON.azimuthDeg * Math.PI) / 180;
  return [-Math.cos(el) * Math.sin(az), -Math.sin(el), -Math.cos(el) * Math.cos(az)];
}

/** Centre of the F6 hatch opening in world space at height `y`. */
export function hatchCentre(y: number): [number, number, number] {
  const { min, max } = BZ_HATCH.cells;
  return [((min[0] + max[0]) / 2 + 0.5) * CELL, y, ((min[1] + max[1]) / 2 + 0.5) * CELL];
}

/** The engine factories the rig is built with (main.ts passes `lights` and `game.runtimeNode`; tests pass the same builders). */
export interface RigFactories {
  readonly lights: Pick<typeof LightBuilders, "spot" | "point" | "directional" | "rect">;
  readonly runtimeNode: (id: string, options: { tags: string[] }) => Parameters<AuraNodeBuilder<AuraSceneNode>["runtime"]>[0];
}

/**
 * The rig's mount-time nodes, posed for `look` (main.ts builds them with the boot floor's row). Every node has a
 * runtime handle so `applyFloor` can move, retune and hide it.
 */
export function buildLightRig(factories: RigFactories, look: BunkerLookRow = lookOfSlot(0)): AuraNodeBuilder<AuraSceneNode>[] {
  const { lights } = factories;
  const game = { runtimeNode: factories.runtimeNode };
  const key = spotPose(look.key, look.slot);
  const fill = spotPose(look.fill, look.slot);
  const fixtures = fixtureCells(floorDefOfSlot(look.slot));
  const fixtureY = fixtureHeight(look);
  const moonDir = moonDirection();
  const moonTarget = hatchCentre(0);
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [
    lights.spot({
      name: "bunker key spot", position: key.position, target: key.target, color: look.lamp.color,
      intensity: look.key.intensity, distance: look.key.distance, decay: 2,
      angle: (look.key.angleDeg * Math.PI) / 180, penumbra: look.key.penumbra,
      shadow: { filter: "pcss", mapSize: 1024, lightSize: 0.35, bias: 0.0006, normalBias: 0.02 }
    }).runtime(game.runtimeNode(RIG_IDS.key, { tags: ["light"] })),
    // GU47(E-J): one shadowed light per floor until the audit admits shadowed practicals: then `shadow: { filter: "pcss", mapSize: 1024 }` here.
    lights.spot({
      name: "bunker fill spot", position: fill.position, target: fill.target, color: look.lamp.color,
      intensity: look.fill.intensity, distance: look.fill.distance, decay: 2,
      angle: (look.fill.angleDeg * Math.PI) / 180, penumbra: look.fill.penumbra
    }).runtime(game.runtimeNode(RIG_IDS.fill, { tags: ["light"] })),
    lights.directional({
      name: "bunker moon key", color: BZ_MOON.color, intensity: BZ_MOON.intensity,
      position: [moonTarget[0] - moonDir[0] * 40, -moonDir[1] * 40, moonTarget[2] - moonDir[2] * 40], target: moonTarget,
      shadow: { filter: "pcss", mapSize: 1024, cascades: 1, maxDistance: 40 }
    }).runtime(game.runtimeNode(RIG_IDS.moon, { tags: ["light"] })),
    lights.rect({
      name: "bunker fluorescent tube", position: fill.position, target: fill.target, color: lookOfSlot(4).lamp.color,
      intensity: 3.2, width: 1.6, height: 0.16
    }).runtime(game.runtimeNode(RIG_IDS.tube, { tags: ["light"] })),
    lights.point({
      name: "player carried lamp", color: BZ_PLAYER_LIGHT.color, intensity: BZ_PLAYER_LIGHT.intensity,
      distance: BZ_PLAYER_LIGHT.distance, decay: BZ_PLAYER_LIGHT.decay, position: [4.5, 1.85, 4.5]
    }).runtime(game.runtimeNode(RIG_IDS.player, { tags: ["light", "vfx"] }))
  ];
  for (let i = 0; i < FIXTURE_POOL_SIZE; i++) {
    const cell = fixtures[i] ?? fixtures[0] ?? ([1, 1] as const);
    nodes.push(lights.point({
      name: `bunker fixture light ${i}`, color: look.lamp.color, intensity: look.fixtures.intensity,
      distance: look.fixtures.distance, decay: 2, position: cellWorld(cell, fixtureY)
    }).runtime(game.runtimeNode(fixtureLightId(i), { tags: ["light"] })));
  }
  return nodes;
}

/** Height of a floor's fixture points: under the ceiling lamp, or at grate height on F3 (lit from below). */
export function fixtureHeight(look: BunkerLookRow): number {
  return look.fixtures.height === "grate" ? 0.35 : wallHeightOfSlot(look.slot) - 0.45;
}

// ---------------------------------------------------------------------------------------------------------------
// fixture pool: rank by distance, prefer what the camera faces and can see; stable slot assignment

export interface RankCamera { readonly x: number; readonly z: number; readonly fx: number; readonly fz: number }

/** Grid line of sight between two world points on a floor (true when every crossed cell is open). */
export function gridLineOfSight(isOpen: (cx: number, cz: number) => boolean, x0: number, z0: number, x1: number, z1: number): boolean {
  const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (CELL * 0.25));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!isOpen(Math.floor((x0 + (x1 - x0) * t) / CELL), Math.floor((z0 + (z1 - z0) * t) / CELL))) return false;
  }
  return true;
}

/** Score penalty (metres) of a fixture the camera cannot see, and of one behind it. */
export const RANK_HIDDEN_PENALTY = 12;
export const RANK_FACING_BONUS = 6;
export const RANK_MAX_DISTANCE = 36;

/** Indices of the `count` fixtures that most deserve a light: nearest first, facing and visible ones ahead. */
export function rankFixtures(
  cells: readonly (readonly [number, number])[], cam: RankCamera, count: number,
  isOpen?: (cx: number, cz: number) => boolean
): number[] {
  const scored: { i: number; s: number }[] = [];
  cells.forEach((cell, i) => {
    const wx = (cell[0] + 0.5) * CELL, wz = (cell[1] + 0.5) * CELL;
    const dx = wx - cam.x, dz = wz - cam.z, d = Math.hypot(dx, dz);
    if (d > RANK_MAX_DISTANCE) return;
    const facing = d > 1e-6 ? (dx * cam.fx + dz * cam.fz) / d : 1;
    let s = d - RANK_FACING_BONUS * Math.max(0, facing);
    if (isOpen && d > CELL * 0.75 && !gridLineOfSight(isOpen, cam.x, cam.z, wx, wz)) s += RANK_HIDDEN_PENALTY;
    scored.push({ i, s });
  });
  scored.sort((a, b) => a.s - b.s || a.i - b.i);
  return scored.slice(0, Math.max(0, count)).map((e) => e.i);
}

/** Keep every pool slot whose fixture is still ranked; give freed slots the ranked fixtures not yet held (-1 = idle). */
export function assignPool(current: readonly number[], ranked: readonly number[]): number[] {
  const wanted = new Set(ranked);
  const next = current.map((f) => (wanted.has(f) ? f : -1));
  const held = new Set(next.filter((f) => f >= 0));
  const queue = ranked.filter((f) => !held.has(f));
  for (let s = 0; s < next.length && queue.length > 0; s++) if (next[s]! < 0) next[s] = queue.shift()!;
  return next;
}

/**
 * Cosmetic lamp flicker in [1 - amount, 1] (F5 fluorescent stutter, F3 forge breathing). Deterministic in time and
 * fixture index, never the sim's RNG (C17); 1 under reduced motion.
 */
export function flickerAt(timeSeconds: number, index: number, amount: number, reducedMotion = false): number {
  if (reducedMotion || amount <= 0) return 1;
  const t = timeSeconds * 7.3 + index * 1.618;
  const slow = 0.5 + 0.5 * Math.sin(t) * Math.sin(t * 0.37 + 1.1);
  const step = Math.floor(timeSeconds * 11 + index * 3.7);
  const h = Math.sin(step * 12.9898 + index * 78.233) * 43758.5453;
  const drop = h - Math.floor(h) > 0.93 ? 1 : 0;
  return Math.max(0, Math.min(1, 1 - amount * (0.35 * slow + 0.65 * drop)));
}

/** F6 alarm beacon: a rotating red cone (radians of yaw at time t); frozen under reduced motion. */
export function beaconYaw(timeSeconds: number, reducedMotion = false): number {
  return reducedMotion ? 0 : (timeSeconds * Math.PI * 1.2) % (Math.PI * 2);
}

// ---------------------------------------------------------------------------------------------------------------
// runtime driver (main.ts): structural handle type so the module stays testable without a renderer

export interface RigLightHandle {
  setPosition(x: number, y: number, z: number): unknown;
  setVisible(visible: boolean): unknown;
  setLight?(patch: { color?: string; intensity?: number; distance?: number; direction?: readonly [number, number, number]; position?: readonly [number, number, number] }, opts?: { transitionSeconds?: number }): void;
}

export interface LightRigDriver {
  /** Re-aim, recolour and show the rig for a floor slot. */
  applyFloor(slot: number): void;
  /** Per frame: fixture pool, flicker, beacon, player lamp. */
  update(cam: RankCamera & { readonly y: number }, timeSeconds: number): void;
  /** Fixture indices held by the pool (QA). */
  pool(): readonly number[];
  readonly slot: number;
}

export function createLightRigDriver(
  get: (id: string) => RigLightHandle | null,
  options: { readonly tier: () => QualityTierName; readonly reducedMotion: () => boolean; readonly isOpen: (cx: number, cz: number) => boolean }
): LightRigDriver {
  let slot = 0;
  let look = lookOfSlot(0);
  let cells: readonly (readonly [number, number])[] = fixtureCells(floorDefOfSlot(0));
  let pool: number[] = Array.from({ length: FIXTURE_POOL_SIZE }, () => -1);
  let rankAt = -1;
  /** Pool slots moved last frame at intensity 0: they ramp up this frame (a patch blends from the value shown, E-B). */
  const rampNext = new Set<number>();
  const handle = (id: string) => get(id);
  const aimSpot = (id: string, spot: BunkerSpotRow, color: string, intensity: number) => {
    const h = handle(id);
    if (!h) return;
    const pose = spotPose(spot, slot);
    const d = [pose.target[0] - pose.position[0], pose.target[1] - pose.position[1], pose.target[2] - pose.position[2]] as const;
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    h.setPosition(pose.position[0], pose.position[1], pose.position[2]);
    h.setLight?.({ color, intensity, distance: spot.distance, direction: [d[0] / len, d[1] / len, d[2] / len] });
  };
  /** Spots, moon, tube and lamp per floor; every fixture light hidden until the pool assigns it a fixture. */
  const show = (visible: readonly string[]) => {
    for (const id of Object.values(RIG_IDS)) handle(id)?.setVisible(visible.includes(id));
    for (let i = 0; i < FIXTURE_POOL_SIZE; i++) handle(fixtureLightId(i))?.setVisible(false);
  };
  return {
    get slot() { return slot; },
    applyFloor(next: number) {
      slot = next;
      look = lookOfSlot(next);
      cells = fixtureCells(floorDefOfSlot(next));
      pool = Array.from({ length: FIXTURE_POOL_SIZE }, () => -1);
      rankAt = -1;
      rampNext.clear();
      aimSpot(RIG_IDS.key, look.key, look.lamp.color, look.key.intensity);
      aimSpot(RIG_IDS.fill, look.fill, look.lamp.color, look.fill.intensity);
      if (next === 4) {
        const tube = handle(RIG_IDS.tube);
        const pose = spotPose(look.fill, next);
        tube?.setPosition(pose.position[0], pose.position[1], pose.position[2]);
      }
      show(visibleRigLights(next, options.tier()));
    },
    update(cam, timeSeconds) {
      const reduced = options.reducedMotion();
      handle(RIG_IDS.player)?.setPosition(cam.x, cam.y + 0.4, cam.z);
      const live = BZ_FIXTURE_LIGHTS[options.tier()];
      for (const s of rampNext) handle(fixtureLightId(s))?.setLight?.({ intensity: look.fixtures.intensity }, { transitionSeconds: 0.25 });
      rampNext.clear();
      if (rankAt < 0 || timeSeconds - rankAt > 0.2 || timeSeconds < rankAt) {
        rankAt = timeSeconds;
        const next = assignPool(pool.slice(0, live), rankFixtures(cells, cam, live, options.isOpen));
        const y = fixtureHeight(look);
        for (let s = 0; s < FIXTURE_POOL_SIZE; s++) {
          const h = handle(fixtureLightId(s));
          if (!h) continue;
          const f = s < live ? (next[s] ?? -1) : -1;
          if (f !== pool[s]) {
            if (f >= 0) {
              const p = cellWorld(cells[f]!, y);
              h.setPosition(p[0], p[1], p[2]);
              // Reduced motion and flickering floors switch on at once; the others fade in over 0.25 s from the next frame.
              const fade = !reduced && look.fixtures.flicker <= 0;
              h.setLight?.({ color: look.lamp.color, intensity: fade ? 0 : look.fixtures.intensity });
              if (fade) rampNext.add(s);
            }
            h.setVisible(f >= 0);
          }
          pool[s] = f;
        }
      }
      if (look.fixtures.flicker > 0) {
        for (let s = 0; s < live; s++) {
          if (pool[s]! < 0) continue;
          handle(fixtureLightId(s))?.setLight?.({ intensity: look.fixtures.intensity * flickerAt(timeSeconds, pool[s]!, look.fixtures.flicker, reduced) });
        }
      }
      if (slot === 5) {
        // F6: the fill spot is the alarm beacon, sweeping a red cone round its post.
        const yaw = beaconYaw(timeSeconds, reduced);
        handle(RIG_IDS.fill)?.setLight?.({ direction: [Math.sin(yaw) * 0.8, -0.6, -Math.cos(yaw) * 0.8] });
      }
    },
    pool: () => pool.slice()
  };
}
