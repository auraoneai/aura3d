// examples/ninja-runner-port/art/direction.ts — GU47 WP-30 art direction (PRD §3.2, NR-21).
// Fantasy: a woodblock-print gauntlet whose time of day moves with distance, from golden afternoon to sunset afterglow.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-ninja-runner-port",
  genre: "rhythm-runner",
  fantasy: "A woodblock-print gauntlet run through one evening: golden village, warm rooftops, golden-hour river, sunset forest, afterglow gate.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "references/woodblock-evening.json",
      source: "generic reference: ukiyo-e landscape prints of a town at sunset (flat colour fields, indigo key lines)",
      licence: "reference-only",
      why: "Indigo key-line outline over flat persimmon and mist-paper colour fields; the ink line is the game's signature"
    },
    {
      file: "references/evening-colour-script.json",
      source: "generic reference: animated-film colour scripts that move one evening across sequences",
      licence: "reference-only",
      why: "Time of day advancing with distance: golden afternoon to golden hour to sunset to afterglow with the first stars"
    },
    {
      file: "references/lantern-town-runner.json",
      source: "shipped comparable: lane runners through lantern-lit rooftop towns at dusk",
      licence: "reference-only",
      why: "Warm lantern pools lighting the path once the sun sets, cyan spirit pickups reading against indigo shadow"
    }
  ],
  palette: {
    primary: ["#2b3550", "#d4553a", "#e8e2d4"],
    accent: "#ffb45e",
    reservedObjective: "#51dfff"
  },
  lighting: {
    // One shadowed key: the sun, sinking from 32 to 10 degrees behind the chase camera's shoulder (GU47 phase 3).
    key: { type: "directional", colorTemperatureK: 3200, shadow: true },
    fill: "ibl",
    // Pooled lantern and spirit-flame points (NR-03): 4 amber + 2 cyan on High, 2 + 1 on Low.
    practicals: 6,
    environment: { hdri: "belfast_sunset_puresky", background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "chase", subjectHeightFraction: [0.14, 0.3], fovDeg: [57, 62], mobile: "both" },
  assets: [
    { role: "hero", assetKey: "ninja-hero", maxTriangles: 15000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 2048, animated: { clips: ["run", "idle", "jump", "slide", "punch", "sword", "hit", "death"] } },
    { role: "enemy", assetKey: "ninja-soldier", maxTriangles: 15000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 2048, animated: { clips: ["run", "idle", "jab", "sword", "block", "hit"] } },
    { role: "enemy", assetKey: "ninja-brute", maxTriangles: 15000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 2048, animated: { clips: ["run", "idle", "punch", "hit"] } },
    { role: "character", assetKey: "ninja-sage", maxTriangles: 15000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 2048, animated: { clips: ["run", "idle", "jump", "slide", "punch"] } },
    { role: "world", assetKey: "houseA", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "world", assetKey: "houseB", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "world", assetKey: "houseC", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "world", assetKey: "houseD", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "world", assetKey: "teahouse", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "world", assetKey: "tower", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "world", assetKey: "gate", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "prop", assetKey: "marketStall", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "prop", assetKey: "lantern", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "prop", assetKey: "fenceRail", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "pine", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "oak", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "bush", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "boulder", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "cliffA", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "cliffB", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "ridge", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "kill", kind: "burst" },
    { event: "kill-heavy", kind: "burst" },
    { event: "crate-break", kind: "burst" },
    { event: "pickup", kind: "burst" },
    { event: "land", kind: "burst" },
    { event: "damage", kind: "burst" },
    { event: "form", kind: "burst" },
    { event: "dash", kind: "burst" },
    { event: "wind-impact", kind: "burst" },
    { event: "district-ambient", kind: "burst" },
    { event: "scarf", kind: "trail" }
  ],
  audio: [
    { event: "footstep", cue: "footstep-stone", variants: 3 },
    { event: "kill", cue: "strike-hit", variants: 3 },
    { event: "pickup", cue: "spirit-chime", variants: 2 },
    { event: "form", cue: "form-shift", variants: 2 },
    { event: "wind", cue: "run-wind-bed", variants: 1 }
  ],
  signatureEffect: "scarf-trail: a vermilion scarf ribbon streaming from the runner's upper spine under an indigo woodblock ink outline, the evening sinking with distance.",
  criticalCategories: ["lighting", "atmospheric_effects", "vfx", "postprocessing"],
  tiers: {
    low: { particles: 240, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 480, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    high: { particles: 720, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 960, shadowMap: 4096, cascades: 3, textureMax: 2048 }
  }
});
