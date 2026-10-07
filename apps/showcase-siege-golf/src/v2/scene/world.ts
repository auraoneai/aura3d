// apps/showcase-siege-golf/src/v2/scene/world.ts — siege range (T2.2).
// §6.9.10: the typed siegeGolfCourseWorld garden lane plus every gameplay
// visual the nine hole sims can pose. The scene is built ONCE with the union
// of per-hole visual names — hole transitions re-pose/hide the same runtime
// nodes, so `loading.sceneSwaps` stays 0 for the whole round (§7.2.1).
import {
  game, material, model, primitives, type AuraNodeInput
} from "@aura3d/engine";
import { assets } from "../../../../../src/aura-assets";
import { SIEGE_GOLF_HOLES } from "../../gameplay/course";
import { createHoleSimulation, type PropVisual } from "../../gameplay/structures";
import {
  AIM_GUIDE, CHARGE_RING, CUP_HALO, EARTH_DARK, STRIKE_FLASH
} from "./materials";

// Static diagnostic surfaces the course-world GLB already covers (legacy kept
// them hidden for the same reason).
const HIDDEN_BODIES = new Set(["felt", "wall-left", "wall-right", "wall-tee", "wall-far"]);

export interface SiegeWorldNodes {
  readonly nodes: AuraNodeInput[];
  /** Every runtime node name a hole can pose (union over SIEGE_GOLF_HOLES). */
  readonly visualNames: readonly string[];
}

const MODEL_ASSETS = {
  siegeGolfBall: assets.siegeGolfBall,
  siegeWoodenCrate: assets.siegeWoodenCrate,
  siegeWoodenBarrel: assets.siegeWoodenBarrel,
  siegePlankSet: assets.siegePlankSet
} as const;

function nodeForVisual(v: PropVisual): AuraNodeInput {
  if (v.source === "model") {
    return model(MODEL_ASSETS[v.typedAsset!], {
      name: v.name,
      targetMaxDimension: v.targetMaxDimension ?? 1
    })
      .position(...v.position)
      .rotate(v.rotation.x, v.rotation.y, v.rotation.z)
      .runtime(game.runtimeNode(v.name, { tags: ["typed-asset", "physics-synced"] }))
      .toJSON();
  }
  const p = v.primitive!;
  const spec = {
    name: v.name,
    material: material.emissive({
      color: p.color,
      emissive: p.emissive ?? p.color,
      emissiveIntensity: p.emissive ? 0.9 : 0.4,
      ...(p.opacity !== undefined ? { opacity: p.opacity } : {})
    })
  };
  const builder =
    p.shape === "sphere" ? primitives.sphere(spec)
      : p.shape === "torus" ? primitives.torus(spec)
        : primitives.box(spec);
  return builder
    .position(...v.position)
    .rotate(v.rotation.x, v.rotation.y, v.rotation.z)
    .scale([p.size[0], p.size[1], p.size[2]])
    .runtime(game.runtimeNode(v.name, { tags: ["primitive", "physics-synced"] }))
    .toJSON();
}

/**
 * Union over all nine holes: instantiate each sim once to enumerate its visual
 * specs (Rapier worlds are dropped immediately), then emit one runtime node
 * per unique name. boot.ts re-poses from `flow.sim.poses()` each frame and
 * hides names the active hole doesn't own.
 */
export function siegeWorldNodes(): SiegeWorldNodes {
  const byName = new Map<string, PropVisual>();
  for (const hole of SIEGE_GOLF_HOLES) {
    const sim = createHoleSimulation(hole);
    for (const v of sim.visuals) {
      if (!byName.has(v.name) && !HIDDEN_BODIES.has(v.name)) byName.set(v.name, v);
    }
  }
  const visualNames = [...byName.keys()];

  const nodes: AuraNodeInput[] = [
    // The authored course world — static Rapier surface stays authoritative;
    // the GLB is the visible garden lane (shadow receiver for every body).
    model(assets.siegeGolfCourseWorld, {
      name: "siege-golf-course-world",
      targetMaxDimension: 17
    })
      .position(0, -0.11, 0)
      .toJSON(),
    // Earth skirt under the lane so the horizon never reads floating.
    primitives.box({ name: "siege range earth skirt", material: EARTH_DARK })
      .position(0, -0.95, -3)
      .scale([14, 0.7, 22])
      .toJSON(),
    // ---- aim + charge affordances (runtime, posed by boot) ------------------
    primitives.box({ name: "siege aim guide", material: AIM_GUIDE })
      .position(0, 0.06, 2)
      .scale([0.07, 0.02, 1.6])
      .runtime(game.runtimeNode("siege-aim-guide", {
        tags: ["aim-indicator", "renderer-owned"]
      })),
    primitives.torus({ name: "siege charge ring", material: CHARGE_RING })
      .position(0, 0.05, 2)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.5, 0.5, 0.5])
      .runtime(game.runtimeNode("siege-charge-ring", {
        tags: ["charge-indicator", "renderer-owned"]
      })),
    primitives.sphere({ name: "siege strike flash", material: STRIKE_FLASH })
      .position(0, -20, -20)
      .scale([0.3, 0.3, 0.3])
      .runtime(game.runtimeNode("siege-strike-flash", {
        tags: ["event-feedback", "renderer-owned"]
      })),
    primitives.torus({ name: "siege cup flash ring", material: CUP_HALO })
      .position(0, -20, -20)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.8, 0.8, 0.8])
      .runtime(game.runtimeNode("siege-cup-flash", {
        tags: ["event-feedback", "renderer-owned"]
      })),
    // ---- union gameplay visuals ----------------------------------------------
    ...visualNames.map((name) => nodeForVisual(byName.get(name)!))
  ];
  return { nodes, visualNames };
}
