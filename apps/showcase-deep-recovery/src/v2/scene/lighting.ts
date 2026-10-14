// apps/showcase-deep-recovery/src/v2/scene/lighting.ts — §6.9.14 lighting.
// Direction: 5600K shadowed spot key cutting the murk, "ibl" fill, 3
// practicals, EV -0.1. The spot sits over the descent corridor aimed into
// the wreck basin — the sub's runtime lamp beams do the moving-searchlight
// read. Practical count = exactly 3 (direction.lighting.practicals).
import { lights, environments } from "@aura3d/engine";

export function lightingNodes() {
  return [
    // Key: 5600K shadowed searchlight over the descent corridor.
    lights.spot({
      name: "descent corridor searchlight key",
      position: [4, -4.5, 6],
      target: [-3, -14, -11],
      angle: 0.52,
      penumbra: 0.5,
      distance: 46,
      decay: 1.6,
      intensity: 9.0,
      color: "#ffedc4",
      shadow: true
    }).toJSON(),
    // Practical 1/3: recovery buoy beacon at the surface station.
    lights.point({
      name: "buoy beacon practical",
      color: "#ffb454",
      intensity: 2.4,
      position: [0, 2.4, 0]
    }).toJSON(),
    // Practical 2/3: cyan light pool inside the sonar-reveal wreck basin.
    lights.point({
      name: "wreck basin cyan pool practical",
      color: "#4fd8c8",
      intensity: 2.0,
      position: [-6.4, -10.5, -11.6]
    }).toJSON(),
    // Practical 3/3: hydrothermal vent glow on the abyssal floor.
    lights.point({
      name: "hydrothermal vent practical",
      color: "#38c8b4",
      intensity: 1.6,
      position: [8, -58.5, -38]
    }).toJSON(),
    // IBL fill: cool low-key cinematic map tinted toward the turquoise
    // shallows palette (k1-turquoise-shallows stand-in until T3.x lands).
    environments.nightCinematic({
      name: "turquoise shallows ibl floor",
      intensity: 0.5,
      color: "#3fb8ae"
    }).toJSON()
  ];
}
