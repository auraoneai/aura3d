// apps/showcase-aura-hoops-3d/art/direction.ts: C-35 art direction for Aura Hoops 3D (GU47 WP-17 "Blacktop World Tour").
// Summer-league streetball shot like a late-night mixtape broadcast: asphalt and acrylic, chain-link, sodium floods,
// spray paint and rain, a low long-lens sideline camera. The per-court look table is src/courtRigs.ts; the runtime VFX
// pack is src/fxPack.ts. Audited by tests/unit/aura-hoops/art-direction.test.ts, which writes art/direction.audit.json.
import { defineArtDirection } from "@aura3d/engine/game/art";

export default defineArtDirection({
  id: "showcase-aura-hoops-3d",
  genre: "basketball",
  fantasy: "Summer-league streetball shot like a late-night mixtape broadcast: asphalt, chain-link, sodium floods, spray paint, rain.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "references/references.json#mixtape-broadcast",
      source: "generic genre reference: late-night summer-league streetball mixtape broadcasts (low long-lens sideline footage)",
      licence: "reference-only",
      why: "Low long-lens sideline framing at 30-34 degrees, a stencil score bug and replay language for dunks (H47-C1, H47-H1)"
    },
    {
      file: "references/references.json#sodium-courts",
      source: "generic photographic genre: public outdoor courts at blue hour under sodium-vapour floods behind chain-link",
      licence: "reference-only",
      why: "Sodium pools against a cobalt sky, chain-link silhouettes and long flood shadows on charcoal asphalt (H47-L1, H47-L2, H47-E1)"
    },
    {
      file: "references/references.json#wet-asphalt",
      source: "generic photographic genre: rain on painted asphalt and acrylic courts at night (puddle mirrors, spray-paint murals)",
      licence: "reference-only",
      why: "Wet ground near roughness 0.12 with a puddle mask, neon reflections and rain streaks on the rain courts only (H47-E2, H47-M1)"
    }
  ],
  palette: {
    // Charcoal asphalt, sodium flood, chain-link steel (PRD WP-17 identity).
    primary: ["#23262b", "#ffb347", "#8a9199"],
    // One squad accent: the boot squad's (Harlem Flyers); it follows the squad the player picks.
    accent: "#ff7a1a",
    // The shot meter's release window and the Jam-ready read.
    reservedObjective: "#ffd257"
  },
  lighting: {
    // One shadowed key per court (a low sun or the dome's Earth-shine), the court's HDRI as the only fill.
    key: { type: "directional", colorTemperatureK: 3800, shadow: true },
    fill: "ibl",
    // Sodium spots (Rucker), tungsten bulb clusters (Manila), sign and rib rect lights (Shanghai, Orbit): <= 6 per court.
    practicals: 6,
    // Primary visible environment of the boot court (Rucker, blue hour); every court's HDRI is in src/courtRigs.ts.
    environment: { hdri: "belfast_sunset_puresky", background: "hdri" },
    exposureEV: 0.16
  },
  framing: { rig: "chase", subjectHeightFraction: [0.22, 0.5], fovDeg: [30, 44], mobile: "both" },
  assets: [
    { role: "character", assetKey: "hoopsAthleteGuardKit", maxTriangles: 40000, minTriangles: 20000, textureSet: "BC+N", maxTextureSize: 1024, animated: { clips: ["Crouch_Idle_Loop", "Run", "Sprint_Loop", "Shoot", "Jump_Loop", "Contest"] } },
    { role: "character", assetKey: "hoopsAthleteBigKit", maxTriangles: 40000, minTriangles: 20000, textureSet: "BC+N", maxTextureSize: 1024, animated: { clips: ["Crouch_Idle_Loop", "Run", "Sprint_Loop", "Shoot", "Jump_Loop", "Contest"] } },
    { role: "hero", assetKey: "hoopsBall", maxTriangles: 20000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "hoopsHoopRig", maxTriangles: 30000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "hoopsBackboard", maxTriangles: 30000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "hoopsRim", maxTriangles: 30000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "world", assetKey: "hoopsCourtShell", maxTriangles: 30000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "set-dressing", assetKey: "hoopsScoreboard", maxTriangles: 25000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "hoopsFloodlight", maxTriangles: 25000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "hoopsBallCart", maxTriangles: 20000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "hoopsTrophy", maxTriangles: 25000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "hoopsLamp", maxTriangles: 25000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "hoopsPalm", maxTriangles: 20000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "hoopsCanopy", maxTriangles: 20000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "hoopsSkyline", maxTriangles: 20000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "hoopsTower", maxTriangles: 25000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "hoopsEarth", maxTriangles: 25000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "hoopsOrbitArena", maxTriangles: 20000, textureSet: "BC+N+ORM", maxTextureSize: 1024 }
  ],
  // Every juice event that draws maps to one kind of the src/fxPack.ts pack (H47-V1); the spray tag is H47-V3.
  vfx: [
    { event: "swish", kind: "net-flick" },
    { event: "rim", kind: "net-flick" },
    { event: "bank", kind: "sweat-fleck" },
    { event: "block", kind: "sweat-fleck" },
    { event: "brick", kind: "blacktop-dust" },
    { event: "steal", kind: "blacktop-dust" },
    { event: "juke", kind: "blacktop-dust" },
    { event: "gate", kind: "blacktop-dust" },
    { event: "dunk", kind: "spray-burst" },
    { event: "jam", kind: "spray-burst" },
    { event: "win", kind: "spray-burst" },
    { event: "crown", kind: "spray-burst" },
    { event: "ground-contact-in-rain", kind: "rain-splash" },
    { event: "ball-flight", kind: "ribbon-trail" },
    { event: "jam-dunk-finish", kind: "spray-tag-decal" }
  ],
  audio: [
    { event: "swish", cue: "swish", variants: 1 },
    { event: "rim", cue: "rimClank", variants: 1 },
    { event: "bank", cue: "boardThud", variants: 1 },
    { event: "brick", cue: "brickMiss", variants: 1 },
    { event: "dunk", cue: "slam", variants: 1 },
    { event: "jam", cue: "fireIgnite", variants: 1 },
    { event: "steal", cue: "steal", variants: 1 },
    { event: "block", cue: "block", variants: 1 },
    { event: "dribble", cue: "dribble", variants: 1 },
    { event: "win", cue: "fanfare", variants: 1 },
    { event: "buzzer", cue: "buzzerFail", variants: 1 },
    { event: "court-bed", cue: "ambient", variants: 1 },
    { event: "crowd-bed", cue: "crowd", variants: 1 }
  ],
  signatureEffect: "Spray-tag decal stencilled on the blacktop under the rim after a Jam dunk, fading over 20 s, at most 8 live, on every tier.",
  criticalCategories: ["lighting", "environment_world", "atmospheric_effects", "camera", "polish_juice"],
  tiers: {
    low: { particles: 400, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 1200, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    high: { particles: 2400, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 4000, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
