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
      source: "route-local CC0 mechanism assembly (vaultBreakersMechanisms) staged in aura.assets.json",
      licence: "reference-only",
      why: "The mechanism/bumper/lane language the fresh single-path scene renders over the physics box"
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
  // The rebuilt single-path scene (src/scene.ts) renders from exactly the
  // four admitted typed assets in apps/showcase-vault-breakers/aura.assets.json:
  // the mechanism assembly over the physics box, the chrome ball, the real
  // flipper bats, and the vault door. The trashed scene's cabinet/room/
  // playfield-art roles are gone (the shell is authored geometry in
  // src/scene.ts). No asset is staged in a shared kit yet, so no `kit` is
  // claimed: S10's kit half stays failing until a human look-dev review
  // accepts a staged kit file (verdicts are never authored here). Triangle
  // budgets bound the measured GLBs (mechanisms 5,436 tris, flipper 1,084,
  // ball 960, vault door 386).
  assets: [
    { role: "world", assetKey: "vaultBreakersMechanisms", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "prop", assetKey: "vaultBreakersFlipperReal", maxTriangles: 2000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "prop", assetKey: "vaultBreakersBall", maxTriangles: 2000, textureSet: "BC", maxTextureSize: 512 },
    { role: "prop", assetKey: "vaultBreakersVaultDoor", maxTriangles: 1000, textureSet: "BC+N", maxTextureSize: 512 }
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
    { feature: "rect area key over playfield (single spot key stands in)", file: "src/scene.ts", request: "R-14-14", removeWhen: "PRD 02 area-light integrator real" },
    { feature: "plastics transmission (opaque PBR inserts stand in)", file: "src/scene.ts", request: "R-14-14", removeWhen: "PRD 04 transmission real" },
    { feature: "4k playfield art (mechanisms GLB + authored felt stand in)", file: "src/scene.ts", request: "R-14-07", removeWhen: "K4 playfield texture authored + admitted" },
    { feature: "DMD backglass (HUD score/objective widgets stand in)", file: "src/main.ts", request: "R-14-15", removeWhen: "text3D dot-matrix material (§6.9.5 HUD) real" },
    { feature: "recorded pinball cue set (sfx-pack cues stand in)", file: "src/main.ts", request: "R-14-09", removeWhen: "route-recorded pinball cues admitted as typed audio assets" }
  ],
  criticalCategories: ["material_quality", "lighting", "modeling_assets"],
  tiers: {
    low: { particles: 150, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 250, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    high: { particles: 400, shadowMap: 2048, cascades: 2, textureMax: 4096 },
    ultra: { particles: 600, shadowMap: 4096, cascades: 2, textureMax: 4096 }
  }
});
