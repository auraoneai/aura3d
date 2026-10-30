// examples/kid-goku-beyond-the-clouds-port/art/direction.ts: C-35 art direction for Cumulus Dash (GU47 WP-35
// "Storm-washed sky plateau"). The look table is art/look.ts, the effect pack art/vfx.ts; the audit record
// (direction.audit.json beside this file) is written by tests/unit/kid-goku-beyond-the-clouds-port/art-direction.test.ts,
// which audits a mirror of the mounted scene built from the look table.
import { defineArtDirection } from "@aura3d/game/art";
import { CUMULUS_LOOK, CUMULUS_PALETTE } from "./look";

const STORM = CUMULUS_LOOK[0];

export default defineArtDirection({
  id: "showcase-cloud-runner-port",
  genre: "platformer",
  fantasy: "Sprint a wet sandstone ridge above a sea of clouds just after a squall, under a rainbow arching over storm towers.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "references/post-storm-mountain-light.json",
      source: "photographic genre: mountain ridges minutes after a passing squall (low side sun, wet rock, washed cobalt sky)",
      licence: "reference-only",
      why: "A low 28-degree side sun rakes wet terracotta sandstone, puddles mirror the sky and the air is rain-washed and saturated"
    },
    {
      file: "references/rainbow-over-storm-towers.json",
      source: "photographic genre: a primary rainbow in the antisolar sky in front of silver-lined cumulonimbus towers and rain shafts",
      licence: "reference-only",
      why: "The 40-42 degree bow sits on the dark rain curtain under the towers, whose sunward edges carry a bright silver lining"
    },
    {
      file: "references/sea-of-clouds-ridge.json",
      source: "photographic genre: high plateau trails above a cloud inversion (cloud sea below the ridge, haze toward distant mesas)",
      licence: "reference-only",
      why: "Aerial perspective pushes far mesas toward a pale blue haze while the cloud deck below reads as soft, sunlit floor"
    }
  ],
  palette: {
    primary: [CUMULUS_PALETTE.cobalt, CUMULUS_PALETTE.sandstone, CUMULUS_PALETTE.sage],
    accent: CUMULUS_PALETTE.amber,
    reservedObjective: CUMULUS_PALETTE.objective
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 4700, shadow: true },
    fill: "ibl",
    practicals: 1,
    environment: { hdri: STORM.hdri ?? "spruit_sunrise", background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "chase", subjectHeightFraction: [0.12, 0.3], fovDeg: [40, 66], mobile: "both" },
  assets: [
    { role: "hero", assetKey: "hero", maxTriangles: 60000, minTriangles: 4000, textureSet: "BC+N", maxTextureSize: 2048 },
    { role: "enemy", assetKey: "rex", maxTriangles: 60000, minTriangles: 4000, textureSet: "BC+N", maxTextureSize: 2048 },
    { role: "enemy", assetKey: "ptero", maxTriangles: 40000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 2048 },
    { role: "prop", assetKey: "cloud", maxTriangles: 20000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "prop", assetKey: "boulder", maxTriangles: 20000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "treeRound", maxTriangles: 20000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "treePine", maxTriangles: 20000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "mesa", maxTriangles: 30000, textureSet: "BC", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "skypearl", kind: "pearl-spark" },
    { event: "glider-mount", kind: "cloud-puff" },
    { event: "splash", kind: "puddle-splash" },
    { event: "launch", kind: "storm-mist" },
    { event: "glider", kind: "trail" },
    { event: "land", kind: "landing-dust" },
    { event: "power-launch", kind: "speed-lines" },
    { event: "hit", kind: "burst" }
  ],
  audio: [
    { event: "footstep", cue: "cumulus-footstep", variants: 1 },
    { event: "skypearl", cue: "cumulus-pearl", variants: 1 },
    { event: "jump", cue: "cumulus-jump", variants: 1 },
    { event: "hit", cue: "cumulus-hit", variants: 1 },
    { event: "glider-mount", cue: "cumulus-glider", variants: 1 }
  ],
  signatureEffect: "A rainbow over silver-lined storm towers: a 40-42 degree bow in the antisolar sky over rain curtains and sunward silver cloud edges.",
  standIns: [
    { feature: "storm towers and cloud sea drawn in the sky dome until the Meshy cumulus towers and deck tiles land", file: "shaders.ts", request: "R-14-07", removeWhen: "WP-36 cumulus towers and cloud-deck tiles admitted" },
    { feature: "procedural staff, hut, bridges and cord posts until the Meshy set pieces land", file: "props.ts", request: "R-14-07", removeWhen: "WP-36 staff, hut, bridge, arch, waystone and cord pole admitted" }
  ],
  criticalCategories: ["lighting", "environment_world", "atmospheric_effects", "shadows"],
  tiers: {
    low: { particles: 48, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 72, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    high: { particles: 96, shadowMap: 2048, cascades: 4, textureMax: 2048 },
    ultra: { particles: 128, shadowMap: 4096, cascades: 4, textureMax: 2048 }
  }
});
