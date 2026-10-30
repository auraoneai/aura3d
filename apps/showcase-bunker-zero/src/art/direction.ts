// apps/showcase-bunker-zero/src/art/direction.ts: C-35 art direction for Bunker Zero (GU47 WP-21 "Cold-War bunker lit by
// its own fixtures"). The look table is src/art/look.ts, the light rig src/art/lightRig.ts, the effect pack src/art/vfx.ts.
// The audit record (direction.audit.json beside this file) is written by tests/unit/bunker-zero/art-direction.test.ts,
// which audits the rig's per-floor mounted lights, the IBL node and every model key main.ts mounts.
import { defineArtDirection } from "@aura3d/game/art";
import { BZ_HDRI, BZ_PALETTE, BZ_PRACTICALS } from "./look";

const enemy = (assetKey: string, maxTriangles: number) =>
  ({ role: "enemy", assetKey, maxTriangles, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 1024, animated: { clips: ["Walk_Loop", "Run", "Shoot", "Contest", "Idle_Loop"] } }) as const;
const prop = (assetKey: string, maxTriangles = 30000, maxTextureSize: 1024 | 2048 = 1024) =>
  ({ role: "prop", assetKey, maxTriangles, textureSet: "BC+N+ORM", maxTextureSize }) as const;
const world = (assetKey: string, maxTriangles = 40000) =>
  ({ role: "world", assetKey, maxTriangles, textureSet: "BC+N+ORM", maxTextureSize: 1024 }) as const;

export default defineArtDirection({
  id: "showcase-bunker-zero",
  genre: "arena-shooter",
  fantasy: "Fight floor by floor down a buried Cold-War bunker lit only by its own fixtures, where every shot lights the room.",
  rebuildTier: "S-world",
  wave: 4,
  references: [
    {
      file: "references/civil-defence-bunker.json",
      source: "generic reference: Cold-War civil-defence and government bunker interiors (board-formed concrete, blast doors, olive-painted plant)",
      licence: "reference-only",
      why: "Board-formed concrete, olive steel doors and rusted plant read as a 1960s shelter dug into rock, never as sci-fi kit"
    },
    {
      file: "references/practical-lighting.json",
      source: "generic reference: practically lit film interiors (caged tungsten work lights, sodium and mercury-vapour lamps, flickering tubes)",
      licence: "reference-only",
      why: "Deep shadow between pools of light from fixtures the viewer can see, one lamp colour per space, haze catching the cones"
    },
    {
      file: "references/gunfire-lighting.json",
      source: "generic reference: first-person shooters whose muzzle flashes light the surrounding room for a frame",
      licence: "reference-only",
      why: "Gunfire as a light source: every shot throws a warm flash across concrete, so a fire-fight lights the corridor around it"
    }
  ],
  palette: {
    primary: [BZ_PALETTE.concrete, BZ_PALETTE.olive, BZ_PALETTE.rust],
    accent: BZ_PALETTE.hazard,
    reservedObjective: BZ_PALETTE.objective
  },
  lighting: {
    // One shadowed key per floor: the key spot (F6: the moon through the hatch). No ambient, no hemisphere (BZ-01).
    key: { type: "spot", colorTemperatureK: 2700, shadow: true },
    fill: "ibl",
    practicals: BZ_PRACTICALS,
    environment: { hdri: BZ_HDRI, background: "enclosed" },
    exposureEV: 0
  },
  // First person: the game writes the camera pose every frame (app.camera.setPose); C-22 has no first-person factory.
  framing: { rig: "static", subjectHeightFraction: [0.18, 0.62], fovDeg: [72, 76], mobile: "both" },
  assets: [
    enemy("bzGuardMeshy", 60000),
    enemy("bzHoundMeshy", 60000),
    enemy("bzGunnerMeshy", 60000),
    enemy("bzWardenMeshy", 90000),
    prop("bzPistol", 30000, 2048),
    prop("mechWeaponA"),
    prop("mechWeaponB"),
    prop("corridorPulseRifleMeshy"),
    prop("bunkerKeyMeshy"),
    prop("bunkerTreasureMeshy"),
    prop("fpsEnergyCorePickupMeshy"),
    prop("corridorFireAmmoCrateMeshy"),
    prop("bzArmorMeshy"),
    prop("bzBarrelMeshy"),
    prop("bzCrateMeshy"),
    prop("auroraPadBeacon"),
    prop("corridorFireAmmoBoltMeshy"),
    prop("corridorMuzzleFlameBurstMeshy"),
    world("pulseNeonGateArchMeshy"),
    world("fpsSciFiCoverCrateMeshy"),
    world("blockfallReactorContainmentPylonMeshy")
  ],
  vfx: [
    { event: "player-fire", kind: "bz-muzzle", flipbook: "muzzle" },
    { event: "enemy-fire", kind: "bz-enemy-muzzle", flipbook: "muzzle" },
    { event: "bullet-impact", kind: "bz-impact", flipbook: "spark-streak" },
    { event: "wall-chip", kind: "concrete-chip", flipbook: "debris-chips" },
    { event: "rocket-or-barrel-blast", kind: "bz-blast", flipbook: "fireball" },
    { event: "door-slide", kind: "bz-door-dust", flipbook: "dust-mote" },
    { event: "push-wall", kind: "bz-pushwall-debris", flipbook: "smoke-a" },
    { event: "pickup", kind: "bz-pickup", flipbook: "glow" }
  ],
  audio: [
    { event: "pistol-fire", cue: "pistol", variants: 1 },
    { event: "mg-fire", cue: "mg", variants: 1 },
    { event: "rocket-fire", cue: "rocket", variants: 1 },
    { event: "knife-swing", cue: "knife", variants: 1 },
    { event: "hit", cue: "hit", variants: 1 },
    { event: "kill", cue: "kill", variants: 1 },
    { event: "blast", cue: "boom", variants: 1 },
    { event: "door", cue: "door", variants: 1 },
    { event: "secret", cue: "secret", variants: 1 },
    { event: "enemy-fire", cue: "enemyShot", variants: 1 },
    { event: "warden-alarm", cue: "boss", variants: 1 },
    { event: "bunker-hum", cue: "ambience", variants: 1 }
  ],
  signatureEffect: "Gunfire lights the room: every shot, ricochet and blast throws a warm transient light across board-formed concrete between the pools of the floor's own lamps.",
  criticalCategories: ["lighting", "shadows", "atmospheric_effects", "vfx", "gameplay_readability"],
  tiers: {
    low: { particles: 150, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 300, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    high: { particles: 600, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    ultra: { particles: 600, shadowMap: 2048, cascades: 1, textureMax: 2048 }
  }
});
