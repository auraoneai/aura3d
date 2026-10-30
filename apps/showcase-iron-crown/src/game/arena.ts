/**
 * IRON CROWN arena scene (GU47 WP-15). Moved out of main.ts so the unit tests can mount every venue without the DOM
 * and audit it against the art direction (tests/unit/iron-crown/art-direction.test.ts).
 *
 * Layers, in order: the venue's look (its own HDRI, sun or follow-spot, fog, grade, bloom and post preset from
 * STAGE_LOOKS), the fighting-kit floor, the venue dressing, the two fighters, the venue's own lights (follow-spot on the
 * Crown, two back rims in the fighters' colours, Neo-Tokyo's rect panels), light shafts, weather and the post effects
 * the look does not author (contact shadows, vignette, Crown grain, SSR mirror at High).
 */
import {
  camera,
  effects,
  material,
  primitives,
  scene,
  weather,
  type AuraColor,
  type AuraSceneNode
} from "@aura3d/engine";
import { prayerFlagNodes } from "./ambientMotion";
import { koScorchNode, stageFlareNodes } from "./flareScorch";
import { createFighterNode, type FighterDef, type FighterPalette, type TypedFighterAssets } from "./fighters";
import { stageLightNodes, stageLook, stageLookNode, streakLimitFor, weatherParticlesFor, type StageLookRow } from "./look";
import type { IronStage } from "./stages";

export type Vec3 = readonly [number, number, number];

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
}

/** The fighting kit's debug-style markers (camera safe-zone posts, centre aura beam): dropped from a finished arena. */
const KIT_MARKER_NODES = new Set(["left camera safe boundary marker", "right camera safe boundary marker", "center aura combat lane"]);

function spawnRing(id: string, x: number, color: AuraColor): AuraSceneNode[] {
  return [
    primitives
      .cylinder({ name: `${id}-outer`, material: material.emissive({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.4 }), castShadow: false, receiveShadow: false })
      .position(x, 0.012, 0.02)
      .scale([1.15, 0.012, 1.15])
      .toJSON(),
    primitives
      .cylinder({ name: `${id}-inner`, material: material.pbr({ color: "#15121a", roughness: 0.7 }), castShadow: false, receiveShadow: true })
      .position(x, 0.016, 0.02)
      .scale([0.96, 0.012, 0.96])
      .toJSON()
  ];
}

/** The kit's floor nodes (everything at or below 0.35 m), with the start-lane slabs swapped for spawn rings. */
export function arenaFloorNodes(stage: IronStage, playerX: number, rivalX: number): AuraSceneNode[] {
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
      if (name === "player start lane glow") return spawnRing("player-spawn", playerX, stage.palette.lane);
      if (name === "opponent start lane glow") return spawnRing("rival-spawn", rivalX, stage.palette.warning);
      return [n];
    });
}

/** The fighter's own colour for its back rim (a studio tint's emissive wins). */
export function rimColorOf(fighter: FighterDef, tint?: FighterPalette): AuraColor {
  return tint?.emissive || fighter.palette.emissive;
}

/**
 * The hero-floor mirror. `effects.screenSpaceReflections` copies only `name` and `intensity`; the v2 bridge reads
 * `maxDistance`, `roughness` and `thickness` off the node (postBridge POST_EFFECT_FIELDS, E-C EC-6), so they are set on
 * the node itself (factory pass-through: handoff to E-C in the lane report).
 */
function ssrNode(): AuraSceneNode {
  const node = effects.screenSpaceReflections({ name: "hero floor mirror", intensity: 0.55 }).toJSON();
  return { ...node, maxDistance: 12, roughness: 0.32, thickness: 0.4 } as AuraSceneNode;
}

/** Post effects the look does not author, per row. Bloom and grade come from the look (one node each). */
export function arenaPostNodes(row: StageLookRow, contactShadows: boolean): AuraSceneNode[] {
  return [
    ...(contactShadows ? [effects.contactShadows({ intensity: 0.75, length: 0.3 }).toJSON()] : []),
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
 * Rain on Neo-Tokyo, snow on the Monastery (IC47-E2). `weather.precipitation` emits the weather volume (first node) plus
 * flag-off primitive streaks that A3D_QR_VFX (default on) hides; the volume gets the row's explicit particle count and
 * colour, and both halve on reduced motion (the volume halves again on Low).
 */
export function arenaWeatherNodes(row: StageLookRow, reducedMotion: boolean, lowTier = false): AuraSceneNode[] {
  if (!row.weather) return [];
  const [volume, ...streaks] = weather.precipitation({ type: row.weather.type, seed: 0x1c47, streakLimit: streakLimitFor(row, reducedMotion) }).nodes;
  if (!volume) return [...streaks];
  return [{ ...volume, name: `${row.stage} ${row.weather.type}`, particleCount: weatherParticlesFor(row, reducedMotion, lowTier), color: row.weather.color } as AuraSceneNode, ...streaks];
}

export function buildArenaScene(o: ArenaOptions) {
  const s = o.stage;
  const row = stageLook(s.id);
  const rims = { p1: rimColorOf(o.p1, o.p1Tint), p2: rimColorOf(o.cpu, o.cpuTint) };
  return scene()
    .add(stageLookNode(row))
    .addMany(arenaFloorNodes(s, o.playerStart[0], o.rivalStart[0]))
    .addMany(s.dressing)
    .add(createFighterNode("player", o.p1, `${o.p1.name} (P1)`, o.playerStart, 1, o.typedFighterAssets, o.p1Tint))
    .add(createFighterNode("rival", o.cpu, `${o.cpu.name} (CPU)`, o.rivalStart, -1, o.typedFighterAssets, o.cpuTint))
    .addMany([
      ...stageLightNodes(row, rims, { p1: o.playerStart[0], p2: o.rivalStart[0] }),
      ...arenaShaftNodes(row),
      ...arenaWeatherNodes(row, o.reducedMotion, o.lowTier === true),
      ...prayerFlagNodes(s.id, o.reducedMotion),
      ...stageFlareNodes(row, o.lowTier === true),
      koScorchNode(),
      ...arenaPostNodes(row, o.contactShadows)
    ])
    .camera(camera.perspective({ position: [0, 1.6, 5.6], target: [0, 0.82, 0], fov: 40 }));
}
