/**
 * Drift & Deliver port: where the generated prop models stand. Near the start the city's lamps, signals and trees are
 * the generated models (instanced, one draw each); beyond `NEAR` metres the merged low-poly props of city.ts stay, so the
 * triangle count stays bounded. Landmarks (clock tower, lighthouse, rooftop water tanks), bus shelters and hydrants are
 * sparse static placements derived from the same deterministic layout data.
 */
import { instances } from "@aura3d/engine";
import type { PropSkip, Furniture } from "./city";
import type { Solid } from "./sim";
import { MODEL_ASSETS, propTransform, type PropKey } from "./models";
import type { Block, Building } from "./world";

/** radius (metres, from the start) inside which furniture is drawn from the generated models */
export const NEAR = { lamp: 180, signal: 170, tree: 230, hydrant: 190 } as const;

type Transform = ReturnType<typeof propTransform>;

export interface PropPlan {
  readonly skip: PropSkip;
  readonly placements: ReadonlyMap<PropKey, readonly Transform[]>;
  readonly landmarks: { clock: { x: number; z: number }; lighthouse: { x: number; z: number }; tanks: number };
  /** Collision solids for the hydrants (`prop`) and bus shelters (`prop`, long side along the kerb). */
  readonly solids: readonly Solid[];
}

const within = (start: { x: number; z: number }, r: number) => (x: number, z: number): boolean => Math.hypot(x - start.x, z - start.z) < r;

export function planProps(f: Furniture, blocks: readonly Block[], buildings: readonly Building[], start: { x: number; z: number }): PropPlan {
  const out = new Map<PropKey, Transform[]>();
  const solids: Solid[] = [];
  const add = (key: PropKey, t: Transform): void => {
    const list = out.get(key) ?? [];
    list.push(t);
    out.set(key, list);
  };
  const nearLamp = within(start, NEAR.lamp);
  const nearSignal = within(start, NEAR.signal);
  const nearTree = within(start, NEAR.tree);
  const nearHydrant = within(start, NEAR.hydrant);

  // the lamp arm points across the street along (sin yaw, cos yaw); the generated lamp's arm points along +x
  f.lamps.forEach((p, i) => {
    if (!nearLamp(p.x, p.z)) return;
    add("lamp", propTransform("lamp", p.x, p.z, p.yaw - Math.PI / 2, 5.6));
    // a hydrant beside every sixth lamp, a bus shelter beside every eightieth
    const along: [number, number] = [Math.cos(p.yaw), -Math.sin(p.yaw)];
    const across: [number, number] = [Math.sin(p.yaw), Math.cos(p.yaw)];
    if (i % 6 === 0 && nearHydrant(p.x, p.z)) {
      const hx = p.x + along[0] * 2.2 - across[0] * 0.5;
      const hz = p.z + along[1] * 2.2 - across[1] * 0.5;
      add("hydrant", propTransform("hydrant", hx, hz, p.yaw, 0.8));
      solids.push({ x: hx, z: hz, hw: 0.25, hd: 0.25, kind: "prop" });
    }
  });
  f.lamps.forEach((p, i) => {
    if (i % 80 !== 7) return;
    const along: [number, number] = [Math.cos(p.yaw), -Math.sin(p.yaw)];
    const across: [number, number] = [Math.sin(p.yaw), Math.cos(p.yaw)];
    // the shelter's long side runs along the kerb; its open side faces the street
    const sx = p.x + along[0] * 5 - across[0] * 0.6;
    const sz = p.z + along[1] * 5 - across[1] * 0.6;
    add("shelter", propTransform("shelter", sx, sz, Math.atan2(along[0], along[1]) + Math.PI / 2, 4.2));
    // lamps stand on axis-aligned streets, so the shelter's long side (4.2 m) runs along x or z
    const alongX = Math.abs(along[0]) > Math.abs(along[1]);
    solids.push({ x: sx, z: sz, hw: alongX ? 2.1 : 0.7, hd: alongX ? 0.7 : 2.1, kind: "prop" });
  });
  f.signals.forEach((p) => {
    if (nearSignal(p.x, p.z)) add("signal", propTransform("signal", p.x, p.z, p.yaw, 4.2));
  });
  const streetTree = (t: { x: number; z: number; yaw: number; seed: number }): void => {
    if (!nearTree(t.x, t.z)) return;
    if (Math.floor(t.seed * 7) % 2 === 0) add("palm", propTransform("palm", t.x, t.z, t.yaw, 6 + (t.seed % 4)));
    else add("tree", propTransform("tree", t.x, t.z, t.yaw, 3.4 + (t.seed % 5) * 0.35));
  };
  f.streetTrees.forEach(streetTree);
  for (const t of f.parkTrees) {
    if (!nearTree(t.x, t.z)) continue;
    if (t.palm) add("palm", propTransform("palm", t.x, t.z, t.yaw, 5.5 + t.h * 0.5));
    else add("tree", propTransform("tree", t.x, t.z, t.yaw, t.h));
  }

  // the clock tower stands in the plaza nearest the start that is at least 80 m away; the lighthouse on the harbour edge
  const plazas = blocks.filter((b) => b.plaza && Math.hypot(b.x - start.x, b.z - start.z) > 80).sort((a, b) => Math.hypot(a.x - start.x, a.z - start.z) - Math.hypot(b.x - start.x, b.z - start.z));
  const plaza = plazas[0] ?? { x: start.x + 100, z: start.z + 100 };
  add("clocktower", propTransform("clocktower", plaza.x, plaza.z, 0, 38));
  const lighthouse = { x: -90, z: 498 };
  add("lighthouse", propTransform("lighthouse", lighthouse.x, lighthouse.z, 0, 24));
  // rooftop water tanks on every sixth tall building (the tops are flat and the footprints are the collision solids)
  let tanks = 0;
  buildings.forEach((b, i) => {
    if (b.height < 40 || i % 6 !== 0 || tanks >= 24) return;
    add("watertank", propTransform("watertank", b.x + b.hw * 0.3, b.z - b.hd * 0.3, (i * 1.7) % 6.28, 3.4, b.height));
    tanks++;
  });

  return {
    skip: { lamp: nearLamp, signal: nearSignal, tree: nearTree },
    placements: out,
    landmarks: { clock: { x: plaza.x, z: plaza.z }, lighthouse, tanks },
    solids
  };
}

/** One instanced draw per prop kind. */
export function propNodes(plan: PropPlan) {
  const nodes = [];
  for (const [key, transforms] of plan.placements) {
    nodes.push(instances.model(MODEL_ASSETS[key], { name: `model-${key}`, transforms, castShadow: false, receiveShadow: false }));
  }
  return nodes;
}
