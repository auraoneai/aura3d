// apps/showcase-deep-recovery/art/direction.ts — C-35 art direction (PRD-14 §6.9.14).
// Fantasy: salvage dive from turquoise shallows into a dark wreck basin; the
// sub's searchlight cuts the murk.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-deep-recovery",
  genre: "underwater-salvage",
  fantasy: "Salvage dive from turquoise shallows into a dark wreck basin; the sub's searchlight cuts the murk.",
  rebuildTier: "S-world",
  wave: 3,
  references: [
    {
      file: "references/underwater-depth.json",
      source: "shipped comparable: turquoise-to-abyss dives (ABZÛ basin runs / Subnautica depths)",
      licence: "reference-only",
      why: "Depth-keyed absorption from turquoise shallows to wreck-dark basin reads the §8.3 underwater stack"
    },
    {
      file: "references/wreck-basin.json",
      source: "shipped comparable: barnacled wreck sites (Soma wreck decks / dive-sim wrecks)",
      licence: "reference-only",
      why: "Rusted hull plates, barnacle decals and sand-claimed debris the salvage field is built from"
    },
    {
      file: "references/searchlight-sub.json",
      source: "admitted sub GLBs + the searchlight signature (spot attached to the hull)",
      licence: "reference-only",
      why: "A moving shadowed searchlight beam cutting suspended particulate is the signature look"
    }
  ],
  palette: {
    primary: ["#03171f", "#0a3542", "#0f6b74", "#38c8b4"],
    accent: "#4fd8c8",
    reservedObjective: "#59d7ff"
  },
  lighting: {
    key: { type: "spot", colorTemperatureK: 5600, shadow: true },
    fill: "ibl",
    practicals: 3,
    environment: { hdri: "k1-turquoise-shallows", background: "enclosed" },
    exposureEV: -0.1
  },
  framing: { rig: "chase", subjectHeightFraction: [0.15, 0.3], fovDeg: [55, 70], mobile: "landscape" },
  assets: [
    { role: "vehicle", assetKey: "salvage-sub", maxTriangles: 12000, minTriangles: 3000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "world", assetKey: "seabed-wreck-basin", kit: "K3", maxTriangles: 260000, textureSet: "BC+N", maxTextureSize: 2048 },
    { role: "prop", assetKey: "wreck-hull-debris", kit: "K3", maxTriangles: 90000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "salvage-crates", maxTriangles: 16000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "thrust-bubbles", kind: "burst" },
    { event: "silt-kick", kind: "burst" },
    { event: "sonar-ping", kind: "ring" },
    { event: "breach-flicker", kind: "strobe" },
    { event: "marine-snow", kind: "ambient" }
  ],
  audio: [
    { event: "thruster", cue: "prop-wash", variants: 2 },
    { event: "sonar", cue: "sonar-ping-return", variants: 2 },
    { event: "grapple", cue: "grapple-clamp", variants: 2 },
    { event: "lift", cue: "winch-strain", variants: 2 },
    { event: "bed", cue: "abyss-drone-bed", variants: 1 }
  ],
  signatureEffect: "The sub's shadowed searchlight cuts turquoise murk into a dark wreck basin — depth-keyed absorption swallows the shallows behind you.",
  standIns: [
    { feature: "§8.3 absorption fog + caustics/god-rays stack", file: "src/v2/scene/world.ts", request: "R-14-13", removeWhen: "underwater shader stack admitted" },
    { feature: "K3 seabed + wreck splat", file: "src/v2/scene/world.ts", request: "R-14-15", removeWhen: "K3 terrain/wreck kit admitted" },
    { feature: "textured sub + barnacle decals", file: "src/v2/scene/props.ts", request: "R-14-15", removeWhen: "sub GLB admitted" },
    { feature: "K8 underwater loop set", file: "src/v2/audio.ts", request: "R-14-15", removeWhen: "K8 loop clips admitted" }
  ],
  criticalCategories: ["lighting", "atmospheric_effects", "environment_world"],
  tiers: {
    low: { particles: 400, shadowMap: 1024, cascades: 2, textureMax: 1024 },
    medium: { particles: 800, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    high: { particles: 1400, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 2400, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
