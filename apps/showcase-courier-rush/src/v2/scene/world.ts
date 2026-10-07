// apps/showcase-courier-rush/src/v2/scene/world.ts — dawn city world (T2.2).
// §6.9.7 "early-rain delivery run through a wet dawn city": the authored
// `legacy/city.ts` world builder at `timeOfDay: "day"` (kit day palette under
// our dawn light — parked-car boxes stripped for live traffic), the typed
// courier van + 8 lane-loop traffic bodies, movable pickup/drop zone rigs,
// and the impact feedback nodes. No emissive fill.
import { game, model, primitives, type AuraNodeInput } from "@aura3d/engine";
import { assets } from "../../../../../src/aura-assets";
import { buildCityDressing } from "../../legacy/city";
import {
  IMPACT_RING, IMPACT_SLASH, PARCEL_BEACON, PICKUP_BURST, VAN_BUMPER, VAN_TRIM
} from "./materials";

export interface CourierWorldNodes {
  readonly nodes: AuraNodeInput[];
  readonly trafficCarNames: readonly string[];
}

/** Whole static + runtime world: kit dressing, zone rigs, van, traffic, fx nodes. */
export function courierWorldNodes(): CourierWorldNodes {
  const dressing = buildCityDressing(assets, false, "day");
  const nodes: AuraNodeInput[] = [...dressing.staticNodes, ...dressing.pickupZone, ...dressing.dropZone];

  // Hero van: typed Meshy body fit to the delivery footprint; the sim pose
  // drives it every frame. Livery trim + bumper accents attach to the pose.
  nodes.push(
    model(assets.courierVanMeshyV2Decimated, {
      name: "courier-van-body",
      role: "primaryCharacter",
      scaleMode: "fit",
      targetMaxDimension: 2.7,
      castShadow: true,
      receiveShadow: true
    })
      .position(-0.45, 0, 18.6)
      .runtime(game.runtimeNode("courier-van-body", { tags: ["vehicle", "physics-synced"] }))
      .toJSON(),
    primitives.box({ name: "van trim left", material: VAN_TRIM, castShadow: false })
      .position(0, -5, 0).scale([0.06, 0.05, 1.9])
      .runtime(game.runtimeNode("van-trim-left", { tags: ["vehicle-livery", "renderer-owned"] }))
      .toJSON(),
    primitives.box({ name: "van trim right", material: VAN_TRIM, castShadow: false })
      .position(0, -5, 0).scale([0.06, 0.05, 1.9])
      .runtime(game.runtimeNode("van-trim-right", { tags: ["vehicle-livery", "renderer-owned"] }))
      .toJSON(),
    primitives.box({ name: "van rear bumper", material: VAN_BUMPER, castShadow: false })
      .position(0, -5, 0).scale([1.15, 0.12, 0.12])
      .runtime(game.runtimeNode("van-rear-bumper", { tags: ["vehicle-livery", "renderer-owned"] }))
      .toJSON(),
    primitives.box({ name: "parcel bed beacon", material: PARCEL_BEACON, castShadow: false })
      .position(0, -5, 0).scale([0.3, 0.3, 0.3])
      .runtime(game.runtimeNode("parcel-beacon", { tags: ["delivery-state", "renderer-owned"] }))
      .toJSON()
  );

  // Carried parcel: visible in the bed while phase === "carrying".
  nodes.push(
    model(assets.courierParcel, {
      name: "parcel-carried",
      role: "primaryCharacter",
      scaleMode: "fit",
      targetMaxDimension: 0.5,
      castShadow: true
    })
      .position(0, -5, 0)
      .runtime(game.runtimeNode("parcel-carried", { tags: ["delivery-state", "renderer-owned"] }))
      .toJSON()
  );

  // Lane-loop traffic: 8 typed bodies on runtime nodes driven by the sim.
  const trafficCarNames: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    const name = `traffic-car-${index + 1}`;
    trafficCarNames.push(name);
    nodes.push(
      model(index % 2 === 0 ? assets.courierTrafficSedan : assets.courierTrafficHatch, {
        name,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 2.4,
        castShadow: true
      })
        .position(0, -5, 0)
        .runtime(game.runtimeNode(name, { tags: ["traffic", "physics-synced"] }))
        .toJSON()
    );
  }

  // Strike feedback: contact ring + slash at the real collider boundary.
  nodes.push(
    primitives.torus({ name: "strike impact ring", material: IMPACT_RING })
      .position(0, -5, 0).rotate(Math.PI / 2, 0, 0).scale(0.001)
      .runtime(game.runtimeNode("impact-ring", { tags: ["contact-feedback", "renderer-owned"] }))
      .toJSON(),
    primitives.box({ name: "strike impact slash", material: IMPACT_SLASH })
      .position(0, -5, 0).scale([0.001, 0.001, 0.001])
      .runtime(game.runtimeNode("impact-slash", { tags: ["contact-feedback", "renderer-owned"] }))
      .toJSON(),
    primitives.sphere({ name: "zone confirm burst", material: PICKUP_BURST })
      .position(0, -5, 0).scale(0.001)
      .runtime(game.runtimeNode("contact-burst", { tags: ["contact-feedback", "renderer-owned"] }))
      .toJSON()
  );

  return { nodes, trafficCarNames };
}
