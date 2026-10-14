// apps/showcase-mech-hangar/art/direction.ts — C-35 art direction (PRD-14 §6.9.17).
// Fantasy: workshop hangar where you configure a mech, then test-drive it
// down the hangar lane against target dummies.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-mech-hangar",
  genre: "fighting",
  fantasy: "Workshop hangar where you configure a mech, then test-drive it down the hangar lane against target dummies.",
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
      why: "Floodlit lane framing a heavy mech — the arena read the test-drive lane targets"
    },
    {
      file: "references/rigged-mechs.json",
      source: "shipped comparable: rigged modular mechs (ZOIDS articulated kits / Armored Core VI assemblies)",
      licence: "reference-only",
      why: "Rigged robot bodies with walk/strike clips — the read the admitted Quaternius rigs stand in for until modular socketed parts exist"
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
  // The rebuilt single-path scene (src/main.ts) renders from the admitted
  // typed assets in apps/showcase-mech-hangar/aura.assets.json: three
  // rigged Quaternius chassis options, the gun-drone support attachment,
  // the large-gun robot as target dummies, and crate/wall hangar dressing.
  // The trashed MH-2M modular-part roles are gone — no separable socketed
  // part GLBs exist in the repo, so no part role is claimed. None of these
  // assets is staged in a shared kit yet, so no `kit` is claimed: S10's
  // kit half stays failing until a human look-dev review accepts a staged
  // kit file (verdicts are never authored here).
  assets: [
    { role: "character", assetKey: "quaterniusMech", maxTriangles: 20000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "character", assetKey: "quaterniusRobotEnemy", maxTriangles: 20000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "character", assetKey: "quaterniusRobotEnemyLarge", maxTriangles: 20000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "character", assetKey: "quaterniusRobotEnemyLargeGun", maxTriangles: 20000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "prop", assetKey: "quaterniusFlyingGunDrone", maxTriangles: 20000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "prop", assetKey: "quaterniusCubeCrate", maxTriangles: 2000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "world", assetKey: "quaterniusWallModular", maxTriangles: 5000, textureSet: "BC+N", maxTextureSize: 1024 }
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
  signatureEffect: "A hangar bay where whole rigged chassis swap on the turntable lane, then the locked build test-drives past crate dressing striking target dummies under the industrial key.",
  standIns: [],
  criticalCategories: ["animation_quality", "environment_world"],
  tiers: {
    low: { particles: 300, shadowMap: 1024, cascades: 2, textureMax: 1024 },
    medium: { particles: 600, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    high: { particles: 1000, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 1600, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
