// apps/showcase-vault-breakers/src/v2/scene/lighting.ts — one-key arcade light.
// §6.9.5: a single 3800 K `lights.spot({ shadow: true })` above the playfield
// is the ONLY shadow caster — the "lit table in a dark arcade" fiction. Two
// dim practicals dress the machine row; the vendored evening HDRI at 0.3 feeds
// chrome/cabinet reflections only. No ambient, no fills, no bounce points.
import { environments, lights, type AuraSceneNode } from "@aura3d/engine";
import { envAssets } from "../env-assets";

export function lightingNodes(): AuraSceneNode[] {
  return [
    // The one shadowed key: 3800 K playfield spot, angle covers the felt.
    lights.spot({
      name: "playfield key spot",
      color: "#ffe2b8",
      intensity: 520,
      position: [0, 6.2, 0.6],
      target: [0, 0, -0.4],
      angle: 0.82,
      penumbra: 0.55,
      decay: 1.7,
      shadow: true
    }).toJSON(),
    // Two dim practicals at the neighbouring machines — dressing, not fill.
    lights.point({
      name: "machine row practical",
      color: "#7a5ab8",
      intensity: 1.8,
      position: [-4.6, 1.4, -1.0]
    }).toJSON(),
    lights.point({
      name: "marquee practical",
      color: "#ff4bd8",
      intensity: 1.2,
      position: [0, 3.5, -5.6]
    }).toJSON(),
    // K1-class HDRI at 0.3 — reflections only (vendored 1k evening fixture).
    environments.hdri({
      name: "arcade evening hdri reflections",
      texture: envAssets.arcadeEveningHdr,
      intensity: 0.3
    }).toJSON()
  ];
}
