/**
 * M-POSE rig: builds the athlete's scene nodes and applies a pose to them (transcription of the athlete rig in
 * tests/fixtures/aura-slam-original/adapter/main.ts). Only this module and the renderer touch engine scene nodes; the pose itself is
 * computed by ./pose. Costume colours come from an injectable appearance resolver (Phase 2 roster/appearance data).
 */
import { game, geometry, material, primitives, racketSports, type AuraRuntimeNodeHandle, type AuraSceneNode } from "@aura3d/engine";
import { getAthleteRigSpecs } from "../art/proceduralModels";
import type { PoseResult } from "../contract";

type Vec3 = [number, number, number];

const COURT_X = 5.5;
const COURT_Z = 8.0;
const HIDDEN_SCALE: Vec3 = [0.0001, 0.0001, 0.0001];

const { localToWorld } = racketSports;

/** Small rig parts (hands, knees, racket pieces, accessories) do not cast sun shadows: their shadows are sub-pixel at the game camera and each caster is an extra draw per cascade. `?rigshadows=full` restores them. */
const SMALL_CAST = typeof location !== "undefined" && new URLSearchParams(location.search).get("rigshadows") === "full";

export interface RigNodeResolver {
  nodes: { require(id: string): AuraRuntimeNodeHandle };
}

/** Per-athlete colours; mirrors what TennisAppearance.resolve returns in the live game. */
export interface AthleteAppearance {
  skin?: string;
  shirt?: string;
  pants?: string;
  shoes?: string;
  racket?: string;
}
export type ResolveAppearance = (appearance: unknown, role: "player" | "ai") => AthleteAppearance | undefined;

/** Default resolver: the live game's global `TennisAppearance` when present (it is a Phase 2 data module). */
export const resolveAppearanceFromGlobal: ResolveAppearance = (appearance, role) =>
  (globalThis as { TennisAppearance?: { resolve?: ResolveAppearance } }).TennisAppearance?.resolve?.(appearance, role);

export interface AthleteRigHandles {
  torso: AuraRuntimeNodeHandle;
  collar: AuraRuntimeNodeHandle;
  hips: AuraRuntimeNodeHandle;
  head: AuraRuntimeNodeHandle;
  hairCap: AuraRuntimeNodeHandle;
  visorBrim: AuraRuntimeNodeHandle;
  apolloHelmet: AuraRuntimeNodeHandle;
  apolloPack: AuraRuntimeNodeHandle;
  leftUpperLeg: AuraRuntimeNodeHandle;
  leftLowerLeg: AuraRuntimeNodeHandle;
  leftKnee: AuraRuntimeNodeHandle;
  leftShoe: AuraRuntimeNodeHandle;
  rightUpperLeg: AuraRuntimeNodeHandle;
  rightLowerLeg: AuraRuntimeNodeHandle;
  rightKnee: AuraRuntimeNodeHandle;
  rightShoe: AuraRuntimeNodeHandle;
  leftUpperArm: AuraRuntimeNodeHandle;
  leftLowerArm: AuraRuntimeNodeHandle;
  leftHand: AuraRuntimeNodeHandle;
  rightUpperArm: AuraRuntimeNodeHandle;
  rightLowerArm: AuraRuntimeNodeHandle;
  rightHand: AuraRuntimeNodeHandle;
  racketHandle: AuraRuntimeNodeHandle;
  racketThroatLeft: AuraRuntimeNodeHandle;
  racketThroatRight: AuraRuntimeNodeHandle;
  racketHoop: AuraRuntimeNodeHandle;
  racketStrings: AuraRuntimeNodeHandle;
  shadowDisc: AuraRuntimeNodeHandle;
}

export function buildAthleteNodes(prefix: string, isPlayer: boolean): AuraSceneNode[] {
  const shirtColor = isPlayer ? "#f3f0dc" : "#db582f";
  const pantsColor = isPlayer ? "#214b3e" : "#25364d";
  const trimColor = isPlayer ? "#214b3e" : "#f3f0dc";
  const skinColor = isPlayer ? "#c9926d" : "#805039";
  const hairColor = isPlayer ? "#30281f" : "#211e1c";
  const shoeColor = "#f3f0dc";
  const racketColor = "#1d2927";
  const specs = getAthleteRigSpecs(isPlayer);

  const kitMat = (c: string) => material.fabric({ color: c, roughness: 0.62, clearcoat: 0, envMapIntensity: 0.10, sheen: 0.5, sheenRoughness: 0.58, sheenColor: c });
  const skinMat = (r = 0.58) => material.pbr({ color: skinColor, roughness: r, clearcoat: 0, envMapIntensity: 0.09 });
  const carbonMat = material.clearcoatPaint({ color: racketColor, metalness: 0.35, roughness: 0.28, clearcoat: 0.92, clearcoatRoughness: 0.1 });

  const nodes: AuraSceneNode[] = [
    primitives
      .cylinder({
        name: `${prefix}-shadow`,
        castShadow: SMALL_CAST,
        size: [0.84, 0.008, 0.84],
        material: material.pbr({ color: "#102024", roughness: 0.95 })
      })
      .position(0, 0.006, isPlayer ? 6.8 : -6.8)
      .runtime(game.runtimeNode(`${prefix}-shadow`))
      .toJSON(),

    geometry
      .custom(specs.torso, {
        name: `${prefix}-torso`,
        material: kitMat(shirtColor)
      })
      .runtime(game.runtimeNode(`${prefix}-torso`))
      .toJSON(),

    geometry
      .custom(specs.collar, {
        name: `${prefix}-collar`,
        castShadow: SMALL_CAST,
        material: kitMat(trimColor)
      })
      .runtime(game.runtimeNode(`${prefix}-collar`))
      .toJSON(),

    geometry
      .custom(specs.hips, {
        name: `${prefix}-hips`,
        material: kitMat(pantsColor)
      })
      .runtime(game.runtimeNode(`${prefix}-hips`))
      .toJSON(),

    geometry
      .custom(specs.head, {
        name: `${prefix}-head`,
        material: skinMat(0.56)
      })
      .runtime(game.runtimeNode(`${prefix}-head`))
      .toJSON(),

    geometry
      .custom(specs.hair, {
        name: `${prefix}-hair`,
        material: material.pbr({ color: hairColor, roughness: 0.64, clearcoat: 0, envMapIntensity: 0.08 })
      })
      .runtime(game.runtimeNode(`${prefix}-hair`))
      .toJSON(),

    geometry
      .custom(specs.visor, {
        name: `${prefix}-visor`,
        castShadow: SMALL_CAST,
        material: kitMat(trimColor)
      })
      .runtime(game.runtimeNode(`${prefix}-visor`))
      .toJSON(),

    geometry
      .custom(specs.apolloHelmet, {
        name: `${prefix}-apollo-helmet`,
        castShadow: SMALL_CAST,
        material: material.studioMetal({ color: "#d8b458", roughness: 0.18 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode(`${prefix}-apollo-helmet`))
      .toJSON(),

    geometry
      .custom(specs.apolloPack, {
        name: `${prefix}-apollo-pack`,
        castShadow: SMALL_CAST,
        material: material.clearcoatPaint({ color: "#e5e7eb", roughness: 0.34, clearcoat: 0.72 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode(`${prefix}-apollo-pack`))
      .toJSON()
  ];

  for (const legSide of ["left", "right"] as const) {
    nodes.push(
      geometry
        .custom(specs.upperLeg, {
          name: `${prefix}-${legSide}-upper-leg`,
          material: kitMat(pantsColor)
        })
        .runtime(game.runtimeNode(`${prefix}-${legSide}-upper-leg`))
        .toJSON(),
      geometry
        .custom(specs.lowerLeg, {
          name: `${prefix}-${legSide}-lower-leg`,
          material: skinMat(0.60)
        })
        .runtime(game.runtimeNode(`${prefix}-${legSide}-lower-leg`))
        .toJSON(),
      geometry
        .custom(specs.knee, {
          name: `${prefix}-${legSide}-knee`,
          castShadow: SMALL_CAST,
          material: skinMat(0.60)
        })
        .runtime(game.runtimeNode(`${prefix}-${legSide}-knee`))
        .toJSON(),
      geometry
        .custom(specs.shoe, {
          name: `${prefix}-${legSide}-shoe`,
          material: material.sneakerMesh({ color: shoeColor, roughness: 0.62, clearcoat: 0, envMapIntensity: 0.12, sheen: 0.35 })
        })
        .runtime(game.runtimeNode(`${prefix}-${legSide}-shoe`))
        .toJSON()
    );
  }

  for (const armSide of ["left", "right"] as const) {
    nodes.push(
      geometry
        .custom(specs.upperArm, {
          name: `${prefix}-${armSide}-upper-arm`,
          material: kitMat(shirtColor)
        })
        .runtime(game.runtimeNode(`${prefix}-${armSide}-upper-arm`))
        .toJSON(),
      geometry
        .custom(specs.lowerArm, {
          name: `${prefix}-${armSide}-lower-arm`,
          material: skinMat(0.58)
        })
        .runtime(game.runtimeNode(`${prefix}-${armSide}-lower-arm`))
        .toJSON(),
      geometry
        .custom(specs.hand, {
          name: `${prefix}-${armSide}-hand`,
          castShadow: SMALL_CAST,
          material: skinMat(0.58)
        })
        .runtime(game.runtimeNode(`${prefix}-${armSide}-hand`))
        .toJSON()
    );
  }

  // 3D Carbon-Graphite Tennis Racket (octagonal cushioned grip, aero V-throat shafts, swept oval hoop, string bed)
  nodes.push(
    geometry
      .custom(specs.racketHandle, {
        name: `${prefix}-racket-handle`,
        castShadow: SMALL_CAST,
        material: material.rubber({ color: "#f3efdf", roughness: 0.72 })
      })
      .runtime(game.runtimeNode(`${prefix}-racket-handle`))
      .toJSON(),
    geometry
      .custom(specs.racketThroat, {
        name: `${prefix}-racket-throat-left`,
        castShadow: SMALL_CAST,
        material: carbonMat
      })
      .runtime(game.runtimeNode(`${prefix}-racket-throat-left`))
      .toJSON(),
    geometry
      .custom(specs.racketThroat, {
        name: `${prefix}-racket-throat-right`,
        castShadow: SMALL_CAST,
        material: carbonMat
      })
      .runtime(game.runtimeNode(`${prefix}-racket-throat-right`))
      .toJSON(),
    geometry
      .custom(specs.racketHoop, {
        name: `${prefix}-racket-hoop`,
        castShadow: SMALL_CAST,
        material: carbonMat
      })
      .runtime(game.runtimeNode(`${prefix}-racket-hoop`))
      .toJSON(),
    geometry
      .custom(specs.racketStrings, {
        name: `${prefix}-racket-strings`,
        castShadow: SMALL_CAST,
        material: material.pbr({ color: "#e4e4cd", roughness: 0.5 })
      })
      .runtime(game.runtimeNode(`${prefix}-racket-strings`))
      .toJSON()
  );

  return nodes;
}

export function resolveAthleteRig(app: RigNodeResolver, prefix: string): AthleteRigHandles {
  const req = (id: string) => app.nodes.require(id);
  return {
    torso: req(`${prefix}-torso`),
    collar: req(`${prefix}-collar`),
    hips: req(`${prefix}-hips`),
    head: req(`${prefix}-head`),
    hairCap: req(`${prefix}-hair`),
    visorBrim: req(`${prefix}-visor`),
    apolloHelmet: req(`${prefix}-apollo-helmet`),
    apolloPack: req(`${prefix}-apollo-pack`),
    leftUpperLeg: req(`${prefix}-left-upper-leg`),
    leftLowerLeg: req(`${prefix}-left-lower-leg`),
    leftKnee: req(`${prefix}-left-knee`),
    leftShoe: req(`${prefix}-left-shoe`),
    rightUpperLeg: req(`${prefix}-right-upper-leg`),
    rightLowerLeg: req(`${prefix}-right-lower-leg`),
    rightKnee: req(`${prefix}-right-knee`),
    rightShoe: req(`${prefix}-right-shoe`),
    leftUpperArm: req(`${prefix}-left-upper-arm`),
    leftLowerArm: req(`${prefix}-left-lower-arm`),
    leftHand: req(`${prefix}-left-hand`),
    rightUpperArm: req(`${prefix}-right-upper-arm`),
    rightLowerArm: req(`${prefix}-right-lower-arm`),
    rightHand: req(`${prefix}-right-hand`),
    racketHandle: req(`${prefix}-racket-handle`),
    racketThroatLeft: req(`${prefix}-racket-throat-left`),
    racketThroatRight: req(`${prefix}-racket-throat-right`),
    racketHoop: req(`${prefix}-racket-hoop`),
    racketStrings: req(`${prefix}-racket-strings`),
    shadowDisc: req(`${prefix}-shadow`)
  };
}

/** Minimal actor fields the rig reads (all optional, exactly like the live adapter). */
export interface RigActor {
  x?: number;
  y?: number;
  end?: number;
  appearance?: unknown;
}

export function updateAthleteRig(
  rig: AthleteRigHandles,
  actor: RigActor | null | undefined,
  pose: Pick<PoseResult, "hipY" | "shoulderY" | "headY" | "torsoYaw" | "leanX" | "leanZ" | "legs" | "left" | "right" | "racketDirection">,
  isPlayer: boolean,
  isMoon: boolean,
  appearanceKeyCache: { lastKey: string },
  resolveAppearance: ResolveAppearance = resolveAppearanceFromGlobal
): void {
  const rootPos: Vec3 = [(actor?.x ?? 0) * COURT_X, 0, (actor?.y ?? (isPlayer ? 0.86 : -0.86)) * COURT_Z];
  const baseYaw = (actor?.end ?? (isPlayer ? 1 : -1)) > 0 ? 0 : Math.PI;
  const yaw = baseYaw + (pose.torsoYaw ?? 0) * 0.45;
  const scale: Vec3 = [0.88, 0.94, 0.88];

  const resolvedAppearance = resolveAppearance(actor?.appearance, isPlayer ? "player" : "ai") ?? {};
  const skinColor = resolvedAppearance.skin || (isPlayer ? "#c9926d" : "#805039");
  const shirtColor = isMoon ? "#f3f4f6" : (resolvedAppearance.shirt || (isPlayer ? "#f3f0dc" : "#db582f"));
  const pantsColor = isMoon ? "#e5e7eb" : (resolvedAppearance.pants || (isPlayer ? "#214b3e" : "#25364d"));
  const shoeColor = isMoon ? "#9ca3af" : (resolvedAppearance.shoes || "#f3f0dc");
  const racketColor = resolvedAppearance.racket || "#1d2927";
  const nextKey = `${skinColor}|${shirtColor}|${pantsColor}|${shoeColor}|${racketColor}|${isMoon}`;
  if (appearanceKeyCache.lastKey !== nextKey) {
    appearanceKeyCache.lastKey = nextKey;
    rig.torso.setMaterial(material.pbr({ color: shirtColor, roughness: 0.75 }));
    rig.hips.setMaterial(material.pbr({ color: pantsColor, roughness: 0.8 }));
    rig.leftUpperLeg.setMaterial(material.pbr({ color: pantsColor, roughness: 0.8 }));
    rig.rightUpperLeg.setMaterial(material.pbr({ color: pantsColor, roughness: 0.8 }));
    rig.leftLowerLeg.setMaterial(material.pbr({ color: isMoon ? "#f3f4f6" : skinColor, roughness: 0.74 }));
    rig.rightLowerLeg.setMaterial(material.pbr({ color: isMoon ? "#f3f4f6" : skinColor, roughness: 0.74 }));
    rig.leftKnee.setMaterial(material.pbr({ color: isMoon ? "#f3f4f6" : skinColor, roughness: 0.74 }));
    rig.rightKnee.setMaterial(material.pbr({ color: isMoon ? "#f3f4f6" : skinColor, roughness: 0.74 }));
    rig.leftUpperArm.setMaterial(material.pbr({ color: shirtColor, roughness: 0.75 }));
    rig.rightUpperArm.setMaterial(material.pbr({ color: shirtColor, roughness: 0.75 }));
    rig.leftLowerArm.setMaterial(material.pbr({ color: isMoon ? "#f3f4f6" : skinColor, roughness: 0.74 }));
    rig.rightLowerArm.setMaterial(material.pbr({ color: isMoon ? "#f3f4f6" : skinColor, roughness: 0.74 }));
    rig.leftHand.setMaterial(material.pbr({ color: isMoon ? "#d1d5db" : skinColor, roughness: 0.74 }));
    rig.rightHand.setMaterial(material.pbr({ color: isMoon ? "#d1d5db" : skinColor, roughness: 0.74 }));
    rig.head.setMaterial(material.pbr({ color: skinColor, roughness: 0.72 }));
    rig.leftShoe.setMaterial(material.pbr({ color: shoeColor, roughness: 0.62 }));
    rig.rightShoe.setMaterial(material.pbr({ color: shoeColor, roughness: 0.62 }));
    rig.racketHoop.setMaterial(material.pbr({ color: racketColor, metalness: 0.4, roughness: 0.38 }));
    rig.racketThroatLeft.setMaterial(material.pbr({ color: racketColor, metalness: 0.4, roughness: 0.38 }));
    rig.racketThroatRight.setMaterial(material.pbr({ color: racketColor, metalness: 0.4, roughness: 0.38 }));
  }

  rig.shadowDisc.setPosition(rootPos[0], 0.008, rootPos[2]).setScale([1, 1, 1]).setVisible(true);

  const torsoPos = localToWorld(rootPos, yaw, scale, [0, (pose.hipY + pose.shoulderY) * 0.5, 0]);
  rig.torso
    .setPosition(torsoPos[0], torsoPos[1], torsoPos[2])
    .setRotation(pose.leanZ * 0.65, yaw, -pose.leanX * 0.65)
    .setScale([scale[0], scale[1], scale[2]])
    .setVisible(true);

  const collarPos = localToWorld(rootPos, yaw, scale, [0, pose.shoulderY + 0.04, 0]);
  rig.collar
    .setPosition(collarPos[0], collarPos[1], collarPos[2])
    .setRotation(pose.leanZ * 0.5, yaw, -pose.leanX * 0.5)
    .setScale([scale[0], scale[1], scale[2]])
    .setVisible(true);

  const hipsPos = localToWorld(rootPos, yaw, scale, [0, pose.hipY, 0]);
  rig.hips
    .setPosition(hipsPos[0], hipsPos[1], hipsPos[2])
    .setRotation(pose.leanZ * 0.35, yaw, -pose.leanX * 0.35)
    .setScale([scale[0], scale[1], scale[2]])
    .setVisible(true);

  const headPos = localToWorld(rootPos, yaw, scale, [0, pose.headY, 0]);
  rig.head
    .setPosition(headPos[0], headPos[1], headPos[2])
    .setRotation(0, yaw, 0)
    .setScale([scale[0], scale[1], scale[2]])
    .setVisible(!isMoon);

  rig.hairCap
    .setPosition(headPos[0], headPos[1] + 0.055, headPos[2])
    .setRotation(0, yaw, 0)
    .setScale([scale[0], scale[1] * 0.72, scale[2]])
    .setVisible(!isMoon);

  const visorPos = localToWorld(rootPos, yaw, scale, [0, pose.headY + 0.045, -0.11]);
  rig.visorBrim
    .setPosition(visorPos[0], visorPos[1], visorPos[2])
    .setRotation(0, yaw, 0)
    .setScale([scale[0], scale[1], scale[2]])
    .setVisible(!isMoon);

  if (isMoon) {
    rig.apolloHelmet
      .setPosition(headPos[0], headPos[1] + 0.015, headPos[2])
      .setRotation(0, yaw, 0)
      .setScale([scale[0], scale[1], scale[2]])
      .setVisible(true);
    const packPos = localToWorld(rootPos, yaw, scale, [0, (pose.hipY + pose.shoulderY) * 0.52, 0.18]);
    rig.apolloPack
      .setPosition(packPos[0], packPos[1], packPos[2])
      .setRotation(pose.leanZ * 0.5, yaw, -pose.leanX * 0.5)
      .setScale([scale[0], scale[1], scale[2]])
      .setVisible(true);
  } else {
    rig.apolloHelmet.setScale(HIDDEN_SCALE).setVisible(false);
    rig.apolloPack.setScale(HIDDEN_SCALE).setVisible(false);
  }

  // Legs, arms and racket are posed by the library's racket-sport athlete rig.
  racketSports.athleteRig.applyLimbs(rig, pose, { position: rootPos, yaw, scale });
}
