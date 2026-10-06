// apps/showcase-mech-hangar/art/direction.ts — C-35 art direction (PRD-14 §6.9.17).
// Fantasy: workshop hangar where you configure a mech, then a floodlit pit
// where two mechs fight with weight.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-mech-hangar",
  genre: "fighting",
  fantasy: "Workshop hangar where you configure a mech, then a floodlit pit where two mechs fight with weight.",
  rebuildTier: "S-world",
  wave: 4,
  references: [
    {
      file: "references/hangar-set.json",
      source: "shipped comparable: industrial hangar dressing (MechWarrior 5 mech bay / Titanfall 2 assembly floors)",
      licence: "reference-only",
      why: "Catwalks, gantries, crates, cables and decals at workshop scale — the set dressing the hangar set targets"
    },
    {
      file: "references/fight-pit.json",
      source: "shipped comparable: floodlit fighting arena (Pacific Rim shatterdome floor / Real Steel ring pit)",
      licence: "reference-only",
      why: "Floodlit pit with overhead practicals framing two heavy fighters — the arena read the fighting rig protects"
    },
    {
      file: "references/rigged-mechs.json",
      source: "shipped comparable: rigged modular mechs (ZOIDS articulated kits / Armored Core VI assemblies)",
      licence: "reference-only",
      why: "5–20k-tri textured modular parts rigged at sockets, walk/strike/recoil/KO clips — replaces rigid-yaw MH-2M"
    }
  ],
  palette: {
    primary: ["#0b1016", "#1c2836", "#3a4c60", "#c9d8e4"],
    accent: "#ffb454",
    reservedObjective: "#62f8e7"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 6500, shadow: true },
    fill: "ibl",
    practicals: 3,
    environment: { hdri: "k1-hangar", background: "enclosed" },
    exposureEV: 0
  },
  framing: { rig: "fighting", subjectHeightFraction: [0.28, 0.42], fovDeg: [45, 55], mobile: "landscape" },
  assets: [
    { role: "character", assetKey: "mech-hero-rigged", kit: "K6", maxTriangles: 48000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 2048, animated: { clips: ["walk", "strike-light", "strike-heavy", "strike-special", "recoil", "hit", "ko"] } },
    { role: "character", assetKey: "rival-mech-rigged", kit: "K6", maxTriangles: 48000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 2048, animated: { clips: ["walk", "strike-light", "strike-heavy", "recoil", "hit", "ko"] } },
    { role: "world", assetKey: "hangar-kit", kit: "K4", maxTriangles: 160000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "pit-dressing", kit: "K2", maxTriangles: 60000, textureSet: "BC+N+ORM", maxTextureSize: 2048 }
  ],
  vfx: [
    { event: "impact-sparks", kind: "burst" },
    { event: "muzzle-flash", kind: "flash" },
    { event: "tracers", kind: "spark" },
    { event: "smoke-flipbooks", kind: "ambient" },
    { event: "impact-lights", kind: "flash" },
    { event: "footstep-dust", kind: "burst" }
  ],
  audio: [
    { event: "metal-impact", cue: "mech-hit-metal", variants: 5 },
    { event: "servo", cue: "mech-servo", variants: 4 },
    { event: "footstep", cue: "mech-footstep-thud", variants: 4 },
    { event: "hangar-bed", cue: "hangar-ambience", variants: 1 },
    { event: "pit-music", cue: "pit-fight-loop", variants: 1 }
  ],
  signatureEffect: "A hangar/pit scene split via game.setScene: an orbit-configurable workshop then a floodlit arena where two rigged mechs trade strikes under contact sparks and impact light.",
  standIns: [
    { feature: "k1-hangar HDRI", file: "src/v2/scene/lighting.ts", request: "R-14-13", removeWhen: "hangar HDRI admitted" },
    { feature: "K4 hangar kit + K2 pit dressing", file: "src/v2/scene/world.ts", request: "R-14-15", removeWhen: "hangar kit admitted" },
    { feature: "rigged mech + clip set", file: "src/v2/scene/world.ts", request: "R-14-15", removeWhen: "K6 mech rig admitted" },
    { feature: "K8 impact/servo samples", file: "src/v2/audio.ts", request: "R-14-15", removeWhen: "K8 sample set admitted" }
  ],
  criticalCategories: ["animation_quality", "env_framing"],
  tiers: {
    low: { particles: 300, shadowMap: 1024, cascades: 2, textureMax: 1024 },
    medium: { particles: 600, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    high: { particles: 1000, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 1600, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
