/**
 * IRON CROWN arena scene (GU47 WP-15 + WP-09 10/10 Visual Overhaul).
 *
 * Layers, in order: the venue's look (its own HDRI, sun or follow-spot, fog, grade, bloom and post preset from
 * STAGE_LOOKS), the fighting-kit floor, the venue dressing, the two fighters with multi-lobe surface overrides,
 * paired GLSL+WGSL rune ward & cleave/parry arc shaders, flipbook sparks & dust atlases, the venue's own lights
 * (zero `lights.ambient`), volumetric truss shafts, weather, and GTAO + contact shadows + SSR + cinematic bloom.
 */
import {
  camera,
  effects,
  lights,
  looks,
  material,
  primitives,
  scene,
  weather,
  type AuraColor,
  type AuraPhotometricProfile,
  type AuraSceneNode
} from "@aura3d/engine";
import { createFlipbookAtlas } from "../../../showcase-port-shared/vfx-pack";
import { labCameraOptions, readLabFlags } from "../../../showcase-port-shared/lab-flags";
import { prayerFlagNodes } from "./ambientMotion";
import { crownRuneWardMaterialSpec, dualFlipbookAtlasBurstSpec, parrySlashArcMaterialSpec } from "./dualShaders";
import { koScorchNode, stageFlareNodes } from "./flareScorch";
import { createFighterNode, type FighterDef, type FighterPalette, type TypedFighterAssets } from "./fighters";
import { backRimPose, FOLLOW_SPOT_ID, followSpotPose, RIM_IDS, stageLightNodes, stageLook, stageLookNode, streakLimitFor, weatherParticlesFor, type StageLookRow } from "./look";
import { ORIGINAL_LOOKS, ORIGINAL_VIGNETTE, type VenueLookMode } from "./originalLook";
import { groundDressing, markDeckPracticals, refinedLook, refinedLookOverrides, type RefinedVenueLook } from "./refinedLook";
import type { IronStage } from "./stages";

export type Vec3 = readonly [number, number, number];

export const SPAWN_RING_IDS = [
  "player-spawn-outer",
  "player-spawn-inner",
  "rival-spawn-outer",
  "rival-spawn-inner"
] as const;

export const RUNE_WARD_ID = "ic-rune-ward";

export const SLASH_ARC_IDS = {
  p1: "ic-slash-arc-p1",
  p2: "ic-slash-arc-p2",
  parry: "ic-parry-ring"
} as const;

export const FLIPBOOK_VFX_IDS = {
  sparks: "ic-flipbook-sparks",
  dust: "ic-flipbook-dust"
} as const;

let cachedFlipbooks: {
  sparks: ReturnType<typeof createFlipbookAtlas>;
  dust: ReturnType<typeof createFlipbookAtlas>;
} | null = null;

function getFlipbooks() {
  if (!cachedFlipbooks) {
    cachedFlipbooks = {
      sparks: createFlipbookAtlas("sparks", [255, 214, 128]),
      dust: createFlipbookAtlas("dust", [214, 198, 176])
    };
  }
  return cachedFlipbooks;
}

export interface ArenaOptions {
  readonly stage: IronStage;
  readonly p1: FighterDef;
  readonly cpu: FighterDef;
  readonly p1Tint?: FighterPalette;
  readonly cpuTint?: FighterPalette;
  readonly typedFighterAssets: TypedFighterAssets;
  readonly playerStart: Vec3;
  readonly rivalStart: Vec3;
  /** `?iccontact=0` drops the contact-shadow effect. */
  readonly contactShadows: boolean;
  /** PRD §6.3: precipitation streaks halve. */
  readonly reducedMotion: boolean;
  /** PRD §6.4 (`?tier=low`): weather particles halve again. */
  readonly lowTier?: boolean;
  /** The venue's look (originalLook.ts `venueLookMode`); default the GU47 look. */
  readonly lookMode?: VenueLookMode;
  /** A5 lab (`?ies=1`): IES distribution for the two ring spots; absent keeps the scalar spots. */
  readonly ringPhotometry?: AuraPhotometricProfile;
  /** Mount procedural RGBA8 `createFlipbookAtlas` spark & dust burst sheets for live runtime combat. */
  readonly liveFlipbooks?: boolean;
}

/** Spread into a ring `lights.spot`: the lab IES profile, or nothing. */
function photometry(o: ArenaOptions): { photometricProfile?: AuraPhotometricProfile } {
  return o.ringPhotometry ? { photometricProfile: o.ringPhotometry } : {};
}

/** The fighting kit's debug-style markers (camera safe-zone posts, centre aura beam): dropped from a finished arena. */
const KIT_MARKER_NODES = new Set(["left camera safe boundary marker", "right camera safe boundary marker", "center aura combat lane"]);

/** The 4.6.2 spawn disc (near-black): it swallowed every cast shadow at the fighters' feet. */
const ORIGINAL_SPAWN_DISC: AuraColor = "#15121a";

function spawnRing(id: string, x: number, color: AuraColor, disc: AuraColor = ORIGINAL_SPAWN_DISC): AuraSceneNode[] {
  return [
    primitives
      .cylinder({
        name: `${id}-outer`,
        material: material.pbr({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.4, practical: true }),
        castShadow: false,
        receiveShadow: false
      })
      .position(x, 0.012, 0.02)
      .scale([1.15, 0.012, 1.15])
      .runtime({ id: `${id}-outer` })
      .toJSON(),
    primitives
      .cylinder({
        name: `${id}-inner`,
        material: material.pbr({ color: disc, roughness: 0.7 }),
        castShadow: false,
        receiveShadow: true
      })
      .position(x, 0.016, 0.02)
      .scale([0.96, 0.012, 0.96])
      .runtime({ id: `${id}-inner` })
      .toJSON()
  ];
}

/** Paired GLSL+WGSL forged rune seal + runtime melee cleave/parry arcs + optional flipbook atlases. */
function combatOverlayNodes(liveFlipbooks: boolean): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [
    primitives
      .plane({
        name: "iron crown rune ward",
        material: material.custom(crownRuneWardMaterialSpec({ opacity: 0.52 })),
        castShadow: false,
        receiveShadow: false
      })
      .position(0, 0.008, 0.18)
      .rotate(-Math.PI / 2, 0, 0)
      .scale([2.55, 2.55, 1])
      .runtime({ id: RUNE_WARD_ID })
      .toJSON(),
    primitives
      .plane({
        name: "p1 cleave slash arc",
        material: material.custom(parrySlashArcMaterialSpec({ coreColor: [1.0, 0.74, 0.28], rimColor: [1.0, 0.96, 0.84], opacity: 0.88 })),
        castShadow: false,
        receiveShadow: false
      })
      .position(0, -40, 0)
      .scale([1.45, 1.45, 1])
      .runtime({ id: SLASH_ARC_IDS.p1 })
      .toJSON(),
    primitives
      .plane({
        name: "p2 cleave slash arc",
        material: material.custom(parrySlashArcMaterialSpec({ coreColor: [0.98, 0.36, 0.24], rimColor: [1.0, 0.88, 0.68], opacity: 0.88 })),
        castShadow: false,
        receiveShadow: false
      })
      .position(0, -40, 0)
      .scale([1.45, 1.45, 1])
      .runtime({ id: SLASH_ARC_IDS.p2 })
      .toJSON(),
    primitives
      .plane({
        name: "guard parry shock arc",
        material: material.custom(parrySlashArcMaterialSpec({ coreColor: [0.38, 0.86, 1.0], rimColor: [0.92, 0.99, 1.0], opacity: 0.92 })),
        castShadow: false,
        receiveShadow: false
      })
      .position(0, -40, 0)
      .scale([1.35, 1.35, 1])
      .runtime({ id: SLASH_ARC_IDS.parry })
      .toJSON()
  ];

  if (liveFlipbooks) {
    const atlases = getFlipbooks();
    nodes.push(
      primitives
        .plane({
          name: "steel clash sparks flipbook",
          material: material.custom(dualFlipbookAtlasBurstSpec(atlases.sparks, { tint: [1.0, 0.88, 0.56], emissiveGain: 1.55, additive: true })),
          castShadow: false,
          receiveShadow: false
        })
        .position(0, -40, 0)
        .scale([1.05, 1.05, 1])
        .runtime({ id: FLIPBOOK_VFX_IDS.sparks })
        .toJSON(),
      primitives
        .plane({
          name: "arena footwork dust flipbook",
          material: material.custom(dualFlipbookAtlasBurstSpec(atlases.dust, { tint: [0.88, 0.82, 0.72], emissiveGain: 0.92 })),
          castShadow: false,
          receiveShadow: false
        })
        .position(0, -40, 0)
        .scale([1.22, 1.22, 1])
        .runtime({ id: FLIPBOOK_VFX_IDS.dust })
        .toJSON()
    );
  }
  return nodes;
}

/** The kit's floor nodes (everything at or below 0.35 m), with the start-lane slabs swapped for spawn rings. */
export function arenaFloorNodes(stage: IronStage, playerX: number, rivalX: number, spawnDisc?: AuraColor): AuraSceneNode[] {
  return stage.stage.nodes
    .filter((n: AuraSceneNode) => {
      const raw = n as { transform?: { position?: Vec3 }; position?: Vec3; name?: string };
      const py = raw.transform?.position?.[1] ?? raw.position?.[1] ?? 0;
      return py <= 0.35 && !KIT_MARKER_NODES.has(raw.name ?? "");
    })
    .flatMap((n: AuraSceneNode): AuraSceneNode[] => {
      const name = (n as { name?: string }).name;
      if (name === "fighting foreground floor plane") {
        return [{ ...n, position: [0, -0.055, 0], scale: [44, 1, 32] } as AuraSceneNode];
      }
      if (name === "player start lane glow") return spawnRing("player-spawn", playerX, stage.palette.lane, spawnDisc);
      if (name === "opponent start lane glow") return spawnRing("rival-spawn", rivalX, stage.palette.warning, spawnDisc);
      return [n];
    });
}

/** The fighter's own colour for its back rim (a studio tint's emissive wins). */
export function rimColorOf(fighter: FighterDef, tint?: FighterPalette): AuraColor {
  return tint?.emissive || fighter.palette.emissive;
}

/**
 * The hero-floor mirror. `effects.screenSpaceReflections` copies only `name` and `intensity`; the v2 bridge reads
 * `maxDistance`, `roughness` and `thickness` off the node (postBridge POST_EFFECT_FIELDS, E-C EC-6).
 */
function ssrNode(): AuraSceneNode {
  const node = effects.screenSpaceReflections({ name: "hero floor mirror", intensity: 0.52 }).toJSON();
  return { ...node, maxDistance: 16, roughness: 0.28, thickness: 0.3 } as AuraSceneNode;
}

/** Post effects the look does not author, per row. Bloom and grade come from the look (one node each). */
export function arenaPostNodes(row: StageLookRow, contactShadows: boolean): AuraSceneNode[] {
  return [
    effects.ambientOcclusion({ name: "iron crown gtao", intensity: 0.54, radius: 0.48, falloff: 0.6 }).toJSON(),
    ...(contactShadows ? [effects.contactShadows({ intensity: 0.84, length: 0.32 }).toJSON()] : []),
    effects.vignette({ name: "iron crown vignette", intensity: row.vignette, smoothness: 0.65 }).toJSON(),
    ...(row.grain > 0 ? [effects.filmGrain({ name: "crown film grain", intensity: row.grain, size: 1.4, luminanceResponse: 0.6 }).toJSON()] : []),
    // Mirror floor: the S3 SSR stage runs at High and above only (the post tier drops it below High).
    ...(row.floor.mirror ? [ssrNode()] : [])
  ];
}

/** Light shafts (light cones through smoke or dust). */
export function arenaShaftNodes(row: StageLookRow): AuraSceneNode[] {
  return row.shafts.map((shaft) =>
    effects
      .lightCone({
        name: shaft.name,
        position: [...shaft.position],
        direction: [...shaft.direction],
        color: shaft.color,
        intensity: shaft.intensity,
        length: shaft.length,
        coneAngle: shaft.coneAngle,
        softness: 0.6
      })
      .toJSON()
  );
}

/**
 * Rain on Neo-Tokyo, snow on the Monastery (IC47-E2).
 */
export function arenaWeatherNodes(row: StageLookRow, reducedMotion: boolean, lowTier = false): AuraSceneNode[] {
  if (!row.weather) return [];
  const [volume, ...streaks] = weather.precipitation({ type: row.weather.type, seed: 0x1c47, streakLimit: streakLimitFor(row, reducedMotion) }).nodes;
  if (!volume) return [...streaks];
  return [{ ...volume, name: `${row.stage} ${row.weather.type}`, particleCount: weatherParticlesFor(row, reducedMotion, lowTier), color: row.weather.color } as AuraSceneNode, ...streaks];
}

/**
 * The 4.6.2 venue scene (`?look=original` compatibility path).
 */
export function buildOriginalArenaScene(o: ArenaOptions) {
  const s = o.stage;
  const look = ORIGINAL_LOOKS[s.id];
  const accent = s.palette.aura;
  return scene()
    .add(looks.preset(look.lookId, look.overrides))
    .addMany(arenaFloorNodes(s, o.playerStart[0], o.rivalStart[0]))
    .addMany(s.originalDressing)
    .add(createFighterNode("player", o.p1, `${o.p1.name} (P1)`, o.playerStart, 1, o.typedFighterAssets, o.p1Tint, false))
    .add(createFighterNode("rival", o.cpu, `${o.cpu.name} (CPU)`, o.rivalStart, -1, o.typedFighterAssets, o.cpuTint, false))
    .addMany([
      ...(o.contactShadows ? [effects.contactShadows({ intensity: 0.75, length: 0.3 })] : []),
      effects.vignette({ intensity: ORIGINAL_VIGNETTE, smoothness: 0.65 }),
      effects.bloom({ intensity: 0.24, threshold: 0.86 }),
      effects.lightCone({ name: "crown key cone left", position: [-6.3, 4.8, -5.5], direction: [0.65, -0.42, 0.63], color: s.palette.warning, intensity: 0.24, length: 8.5, coneAngle: 0.34, softness: 0.6 }),
      effects.lightCone({ name: "crown key cone right", position: [6.3, 4.8, -5.5], direction: [-0.65, -0.42, 0.63], color: accent, intensity: 0.2, length: 8.5, coneAngle: 0.32, softness: 0.6 }),
      lights.directional({ name: "iron crown rim", color: accent, intensity: 0.75 }).position(0, 4.2, 3),
      lights.spot({ name: "crown ring key", position: [-3.9, 5.4, 1.6], target: [0, 0.5, 0], angle: 0.46, penumbra: 0.85, distance: 15, decay: 1.3, intensity: 12, color: s.palette.warning, ...photometry(o) }),
      lights.spot({ name: "crown ring fill", position: [3.9, 5.4, 1.6], target: [0, 0.5, 0], angle: 0.46, penumbra: 0.85, distance: 15, decay: 1.3, intensity: 9, color: accent, ...photometry(o) })
    ])
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"), position: [0, 1.6, 5.6], target: [0, 0.82, 0], fov: 43 }));
}

/** The refined look group; under a follow-spot the look's sun is dropped (the spot is the one shadowed key). */
function refinedLookNode(look: RefinedVenueLook, dropSun: boolean): AuraSceneNode {
  const group = looks.preset(look.lookId, refinedLookOverrides(look)).toJSON();
  if (!dropSun) return group;
  return { ...group, children: group.children.filter((child) => !(child.kind === "light" && child.name === "look key light")) };
}

/**
 * The refined venue scene (GU47 phase 3 + WP-09): multi-lobe fighter surfaces + Fresnel rims (`surfaceExtras = true`),
 * paired GLSL+WGSL rune ward & parry/cleave arcs, GTAO + contact shadows + wet obsidian/stone SSR + cinematicBloom +
 * volumetric truss beams, and zero `lights.ambient`.
 */
export function buildRefinedArenaScene(o: ArenaOptions, look: RefinedVenueLook) {
  const s = o.stage;
  const row = stageLook(s.id);
  const lightNodes: AuraSceneNode[] = [];
  if (look.followSpot && row.key.kind === "follow-spot") {
    const key = row.key;
    const pose = followSpotPose(key, (o.playerStart[0] + o.rivalStart[0]) / 2);
    lightNodes.push(
      lights
        .spot({ name: "crown follow-spot", position: pose.position, target: pose.target, angle: key.angle, penumbra: key.penumbra, distance: key.distance, decay: key.decay, intensity: look.followSpot.intensity, color: look.followSpot.color, shadow: key.shadow })
        .runtime({ id: FOLLOW_SPOT_ID })
        .toJSON()
    );
  }
  for (const side of ["p1", "p2"] as const) {
    const pose = backRimPose(row.backRim, side === "p1" ? o.playerStart[0] : o.rivalStart[0]);
    const rimTone = side === "p1" ? look.rim.color : "#ffe6be";
    lightNodes.push(
      lights
        .spot({ name: `fighter back rim ${side}`, position: pose.position, target: pose.target, angle: row.backRim.angle, penumbra: row.backRim.penumbra, distance: row.backRim.distance, decay: 1.3, intensity: look.rim.intensity, color: rimTone })
        .runtime({ id: RIM_IDS[side] })
        .toJSON()
    );
  }
  const weatherNodes: AuraSceneNode[] = [];
  if (look.weather) {
    const streakLimit = o.reducedMotion ? Math.floor(look.weather.streakLimit / 2) : look.weather.streakLimit;
    const [volume, ...streaks] = weather.precipitation({ type: look.weather.type, seed: 0x1c47, streakLimit }).nodes;
    const particles = Math.round(look.weather.particles * (o.reducedMotion ? 0.5 : 1) * (o.lowTier ? 0.5 : 1));
    if (volume) weatherNodes.push({ ...volume, name: `${s.id} ${look.weather.type}`, particleCount: particles, color: look.weather.color } as AuraSceneNode);
    weatherNodes.push(...streaks);
  }
  return scene()
    .add(refinedLookNode(look, row.key.kind === "follow-spot" && look.followSpot !== undefined))
    .addMany(arenaFloorNodes(s, o.playerStart[0], o.rivalStart[0], look.spawnDisc))
    .addMany(markDeckPracticals(groundDressing(s.originalDressing)))
    .addMany(combatOverlayNodes(o.liveFlipbooks === true))
    .add(createFighterNode("player", o.p1, `${o.p1.name} (P1)`, o.playerStart, 1, o.typedFighterAssets, o.p1Tint, true))
    .add(createFighterNode("rival", o.cpu, `${o.cpu.name} (CPU)`, o.rivalStart, -1, o.typedFighterAssets, o.cpuTint, true))
    .addMany([
      ...lightNodes,
      ...weatherNodes,
      ...(look.prayerFlags ? prayerFlagNodes(s.id, o.reducedMotion) : []),
      koScorchNode(),
      effects.ambientOcclusion({ name: "iron crown gtao", intensity: 0.56, radius: 0.5, falloff: 0.6 }).toJSON(),
      ...(o.contactShadows ? [effects.contactShadows({ intensity: look.contact?.intensity ?? 0.85, length: look.contact?.length ?? 0.35 }).toJSON()] : []),
      effects.vignette({ name: "iron crown vignette", intensity: look.vignette, smoothness: 0.65 }).toJSON(),
      effects.cinematicBloom({ intensity: look.bloom.intensity, threshold: look.bloom.threshold }).toJSON(),
      ...(look.mirror ? [{ ...ssrNode(), intensity: look.mirror } as AuraSceneNode] : []),
      ...(look.cones
        ? [
            effects.lightCone({ name: "crown key cone left", position: [-6.3, 4.8, -5.5], direction: [0.65, -0.42, 0.63], color: look.ringKey.color, intensity: 0.13, length: 8.5, coneAngle: 0.32, softness: 0.65 }).toJSON(),
            effects.lightCone({ name: "crown key cone right", position: [6.3, 4.8, -5.5], direction: [-0.65, -0.42, 0.63], color: look.ringFill.color, intensity: 0.1, length: 8.5, coneAngle: 0.3, softness: 0.65 }).toJSON()
          ]
        : []),
      lights.spot({ name: "crown ring key", position: [-3.9, 5.4, 1.6], target: [0, 0.5, 0], angle: 0.46, penumbra: 0.85, distance: 15, decay: 1.3, intensity: look.ringKey.intensity, color: look.ringKey.color, ...photometry(o) }).toJSON(),
      lights.spot({ name: "crown ring fill", position: [3.9, 5.4, 1.6], target: [0, 0.5, 0], angle: 0.46, penumbra: 0.85, distance: 15, decay: 1.3, intensity: look.ringFill.intensity, color: look.ringFill.color, ...photometry(o) }).toJSON()
    ])
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"), position: [0, 1.6, 5.6], target: [0, 0.86, 0], fov: 43 }));
}

/** The venue's base vignette for the cinematic post cue (4.6.2, refined or GU47 look). */
export function venueVignette(id: IronStage["id"], mode: VenueLookMode): number {
  if (mode === "original") return ORIGINAL_VIGNETTE;
  return refinedLook(id)?.vignette ?? stageLook(id).vignette;
}

export function buildArenaScene(o: ArenaOptions) {
  if (o.lookMode === "original") return buildOriginalArenaScene(o);
  const refined = refinedLook(o.stage.id);
  if (refined) return buildRefinedArenaScene(o, refined);
  const s = o.stage;
  const row = stageLook(s.id);
  const rims = { p1: rimColorOf(o.p1, o.p1Tint), p2: rimColorOf(o.cpu, o.cpuTint) };
  return scene()
    .add(stageLookNode(row))
    .addMany(arenaFloorNodes(s, o.playerStart[0], o.rivalStart[0]))
    .addMany(s.dressing)
    .addMany(combatOverlayNodes(o.liveFlipbooks === true))
    .add(createFighterNode("player", o.p1, `${o.p1.name} (P1)`, o.playerStart, 1, o.typedFighterAssets, o.p1Tint))
    .add(createFighterNode("rival", o.cpu, `${o.cpu.name} (CPU)`, o.rivalStart, -1, o.typedFighterAssets, o.cpuTint))
    .addMany([
      ...stageLightNodes(row, rims, { p1: o.playerStart[0], p2: o.playerStart[0] === o.rivalStart[0] ? 2.2 : o.rivalStart[0] }),
      ...arenaShaftNodes(row),
      ...arenaWeatherNodes(row, o.reducedMotion, o.lowTier === true),
      ...prayerFlagNodes(s.id, o.reducedMotion),
      ...stageFlareNodes(row, o.lowTier === true),
      koScorchNode(),
      ...arenaPostNodes(row, o.contactShadows)
    ])
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"), position: [0, 1.6, 5.6], target: [0, 0.86, 0], fov: 43 }));
}
