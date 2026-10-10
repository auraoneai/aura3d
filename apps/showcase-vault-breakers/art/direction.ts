// apps/showcase-vault-breakers/art/direction.ts — C-35 art direction (PRD-14 §6.9.5).
// Fantasy: heist-themed pinball cabinet in a dark arcade — chrome ball, lit
// inserts, printed playfield.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-vault-breakers",
  genre: "pinball",
  fantasy: "Heist-themed pinball cabinet in a dark arcade: chrome ball, lit inserts, printed playfield.",
  rebuildTier: "S-world",
  wave: 2,
  references: [
    {
      file: "references/dark-arcade-hdri.json",
      source: "K1 dark-arcade / bar-interior HDRI set (CC0)",
      licence: "reference-only",
      why: "Dim arcade reflections the chrome ball and clearcoat playfield need to read metallic"
    },
    {
      file: "references/pinball-playfield-art.json",
      source: "shipped comparable: licensed pinball playfield boards (AFM/Medieval Madness era)",
      licence: "reference-only",
      why: "Printed playfield art density, lane markings and insert layout the 4k texture targets"
    },
    {
      file: "references/vault-breakers-cabinet.json",
      source: "admitted Sketchfab cabinet (vaultBreakersCabinet, 12 PBR maps) already in corpus",
      licence: "reference-only",
      why: "The cabinet to promote — its map set defines the shell material budget"
    }
  ],
  palette: {
    primary: ["#0c0a12", "#241a2e", "#3d2c1f", "#8a6b3f"],
    accent: "#ffd24d",
    reservedObjective: "#39d6ff"
  },
  lighting: {
    key: { type: "spot", colorTemperatureK: 3800, shadow: true },
    fill: "ibl",
    practicals: 4,
    environment: { hdri: "k1-dark-arcade", background: "enclosed" },
    exposureEV: -0.2
  },
  framing: { rig: "static", subjectHeightFraction: [0.55, 0.75], fovDeg: [38, 48], mobile: "landscape" },
  assets: [
    { role: "hero", assetKey: "vault-cabinet", kit: "K2", maxTriangles: 90000, minTriangles: 20000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "world", assetKey: "playfield-art", kit: "K4", maxTriangles: 4000, textureSet: "BC", maxTextureSize: 4096 },
    { role: "prop", assetKey: "flippers-real", maxTriangles: 12000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "chrome-ball", maxTriangles: 4000, textureSet: "BC", maxTextureSize: 512 },
    { role: "set-dressing", assetKey: "dark-arcade-room", kit: "K4", maxTriangles: 60000, textureSet: "BC+N", maxTextureSize: 2048 },
    { role: "prop", assetKey: "vault-door", kit: "K2", maxTriangles: 15000, textureSet: "BC+N+ORM", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "bumper-hit", kind: "ring", flipbook: "k9-flash" },
    { event: "slingshot", kind: "burst", flipbook: "k9-sparks" },
    { event: "mission-start", kind: "emissive-chase" },
    { event: "vault-open", kind: "burst", flipbook: "k9-light" },
    { event: "ball-speed", kind: "trail" }
  ],
  audio: [
    { event: "flipper", cue: "pinball-flipper", variants: 3 },
    { event: "bumper", cue: "pinball-bumper", variants: 4 },
    { event: "plunger", cue: "pinball-plunger", variants: 2 },
    { event: "ball-roll", cue: "rubber-ball-loop", variants: 1 },
    { event: "mission", cue: "vault-stinger", variants: 3 },
    { event: "bed", cue: "arcade-ambience", variants: 1 }
  ],
  signatureEffect: "Chrome ball on a printed clearcoat playfield under one soft key; lit inserts chase missions through a dark-arcade room.",
  standIns: [
    { feature: "rect area key over playfield", file: "src/v2/scene/lighting.ts", request: "R-14-14", removeWhen: "PRD 02 area-light integrator real" },
    { feature: "plastics transmission", file: "src/v2/scene/materials.ts", request: "R-14-14", removeWhen: "PRD 04 transmission real" },
    { feature: "4k playfield art", file: "src/v2/scene/world.ts", request: "R-14-07", removeWhen: "K4 playfield texture authored + admitted" },
    { feature: "DMD backglass", file: "src/v2/hud.ts", request: "R-14-15", removeWhen: "text3D dot-matrix material (§6.9.5 HUD) real" }
  ],
  criticalCategories: ["material_quality", "lighting", "modeling_assets"],
  tiers: {
    low: { particles: 150, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 250, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    high: { particles: 400, shadowMap: 2048, cascades: 2, textureMax: 4096 },
    ultra: { particles: 600, shadowMap: 4096, cascades: 2, textureMax: 4096 }
  }
});
