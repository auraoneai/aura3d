// apps/showcase-bank-shot/src/v2/scene/lighting.ts — one-lamp lighting (T2.2).
// §6.9.1: a single pendant `lights.spot({ shadow: true })` is the ONLY shadow
// caster (3000 K warm, angle 0.75, penumbra 0.5 — the "one warm lamp over
// felt" fiction); two dim practicals dress the bar; K1/vendored HDRI at 0.35
// for reflections only. No ambient, no rim directionals, no bounce points.
import { environments, lights, type AuraSceneNode } from "@aura3d/engine";
import { envAssets } from "../env-assets";

export function lightingNodes(): AuraSceneNode[] {
  return [
    // The one shadowed key: a 3000 K pendant spot over the table centre.
    lights.spot({
      name: "pendant spot",
      color: "#ffd9a0",
      intensity: 420,
      position: [0, 2.3, 0],
      target: [0, 0, 0],
      angle: 0.75,
      penumbra: 0.5,
      decay: 1.6,
      shadow: true
    }).toJSON(),
    // Two dim practicals (bar shelf + sconce) — dressing, not fill.
    lights.point({
      name: "bar shelf practical",
      color: "#c88a4a",
      intensity: 2.2,
      position: [-4.5, 1.7, 1.6]
    }).toJSON(),
    lights.point({
      name: "sconce practical",
      color: "#b5763a",
      intensity: 1.4,
      position: [5.1, 2.1, -0.2]
    }).toJSON(),
    // K1-class HDRI at 0.35 for reflections only (vendored 1k fixture).
    environments.hdri({
      name: "pool-hall hdri reflections",
      texture: envAssets.poolHallHdr,
      intensity: 0.35
    }).toJSON()
  ];
}
