import { game, material, primitives, type AuraApp, type AuraRuntimeNodeHandle, type AuraSceneNode } from "@aura3d/engine";
import type { PoseResult } from "../contract/modules";
import type { ActorState } from "../contract/sim";
import type { Vec3 } from "../contract/units";
import { COURT_X, COURT_Z, HIDDEN_SCALE, clamp } from "./constants";
import type { AthleteRigPort } from "./rigPort";

/** Appearance resolver (the live page reads window.TennisAppearance); optional so Phase 1 renders the default outfits. */
export type AppearanceResolver = (appearance: unknown, side: "player" | "ai") => Record<string, string | undefined>;
export type ActorLike = Pick<ActorState, "x" | "y" | "end"> & { appearance?: unknown };
type TennisPoseResult = PoseResult;

/**
 * Athlete rig carried over verbatim from the live adapter so render parity can be measured before the M-POSE module
 * (view/athleteRig.ts) lands; swap it in through the AthleteRigPort seam and delete this file.
 */
const racketSportsKit = game.racketSports();

function directionToEulerXYZ(dx: number, dy: number, dz: number): Vec3 {
  return racketSportsKit.directionToEulerXYZ(dx, dy, dz);
}

function orientCylinderBetween(
  handle: AuraRuntimeNodeHandle | undefined,
  a: Vec3,
  b: Vec3,
  radiusX: number,
  radiusZ = radiusX
): void {
  racketSportsKit.orientCylinderBetween(handle, a, b, radiusX, radiusZ);
}

function solveArmElbow(shoulder: Vec3, hand: Vec3, sideSign: number): Vec3 {
  return racketSportsKit.solveArmElbow(shoulder, hand, sideSign);
}

function localToWorld(rootPos: Vec3, yaw: number, scale: Vec3, local: Vec3): Vec3 {
  return racketSportsKit.localToWorld(rootPos, yaw, scale, local);
}

function localDirToWorld(yaw: number, dir: Vec3): Vec3 {
  return racketSportsKit.localDirToWorld(yaw, dir);
}


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
  const skinColor = isPlayer ? "#c9926d" : "#805039";
  const hairColor = isPlayer ? "#30281f" : "#211e1c";
  const shoeColor = "#f3f0dc";
  const racketColor = "#1d2927";

  const nodes: AuraSceneNode[] = [
    primitives
      .cylinder({
        name: `${prefix}-shadow`,
        size: [0.84, 0.008, 0.84],
        material: material.pbr({ color: "#102024", roughness: 0.95 })
      })
      .position(0, 0.006, isPlayer ? 6.8 : -6.8)
      .runtime(game.runtimeNode(`${prefix}-shadow`))
      .toJSON(),

    primitives
      .capsule({
        name: `${prefix}-torso`,
        size: [0.35, 0.69, 0.35],
        material: material.pbr({ color: shirtColor, roughness: 0.78 })
      })
      .runtime(game.runtimeNode(`${prefix}-torso`))
      .toJSON(),

    primitives
      .cylinder({
        castShadow: false, name: `${prefix}-collar`,
        size: [0.29, 0.07, 0.29],
        material: material.pbr({ color: isPlayer ? "#214b3e" : "#f3f0dc", roughness: 0.75 })
      })
      .runtime(game.runtimeNode(`${prefix}-collar`))
      .toJSON(),

    primitives
      .box({
        name: `${prefix}-hips`,
        size: [0.34, 0.22, 0.24],
        material: material.pbr({ color: pantsColor, roughness: 0.82 })
      })
      .runtime(game.runtimeNode(`${prefix}-hips`))
      .toJSON(),

    primitives
      .sphere({
        name: `${prefix}-head`,
        size: [0.27, 0.27, 0.27],
        material: material.pbr({ color: skinColor, roughness: 0.72 })
      })
      .runtime(game.runtimeNode(`${prefix}-head`))
      .toJSON(),

    primitives
      .sphere({
        castShadow: false, name: `${prefix}-hair`,
        size: [0.284, 0.284, 0.284],
        material: material.pbr({ color: hairColor, roughness: 0.88 })
      })
      .runtime(game.runtimeNode(`${prefix}-hair`))
      .toJSON(),

    primitives
      .box({
        castShadow: false, name: `${prefix}-visor`,
        size: [0.22, 0.028, 0.16],
        material: material.pbr({ color: isPlayer ? "#214b3e" : "#f3f0dc", roughness: 0.65 })
      })
      .runtime(game.runtimeNode(`${prefix}-visor`))
      .toJSON(),

    primitives
      .sphere({
        castShadow: false, name: `${prefix}-apollo-helmet`,
        size: [0.38, 0.38, 0.38],
        material: material.pbr({ color: "#d8b458", metalness: 0.82, roughness: 0.2 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode(`${prefix}-apollo-helmet`))
      .toJSON(),

    primitives
      .box({
        castShadow: false, name: `${prefix}-apollo-pack`,
        size: [0.3, 0.4, 0.18],
        material: material.pbr({ color: "#e5e7eb", roughness: 0.55 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode(`${prefix}-apollo-pack`))
      .toJSON()
  ];

  for (const legSide of ["left", "right"] as const) {
    nodes.push(
      primitives
        .cylinder({
          name: `${prefix}-${legSide}-upper-leg`,
          size: [1, 1, 1],
          material: material.pbr({ color: pantsColor, roughness: 0.82 })
        })
        .runtime(game.runtimeNode(`${prefix}-${legSide}-upper-leg`))
        .toJSON(),
      primitives
        .cylinder({
          name: `${prefix}-${legSide}-lower-leg`,
          size: [1, 1, 1],
          material: material.pbr({ color: skinColor, roughness: 0.76 })
        })
        .runtime(game.runtimeNode(`${prefix}-${legSide}-lower-leg`))
        .toJSON(),
      primitives
        .sphere({
          name: `${prefix}-${legSide}-knee`,
          size: [0.136, 0.136, 0.136],
          material: material.pbr({ color: skinColor, roughness: 0.76 })
        })
        .runtime(game.runtimeNode(`${prefix}-${legSide}-knee`))
        .toJSON(),
      primitives
        .box({
          name: `${prefix}-${legSide}-shoe`,
          size: [0.13, 0.095, 0.25],
          material: material.pbr({ color: shoeColor, roughness: 0.65 })
        })
        .runtime(game.runtimeNode(`${prefix}-${legSide}-shoe`))
        .toJSON()
    );
  }

  for (const armSide of ["left", "right"] as const) {
    nodes.push(
      primitives
        .cylinder({
          name: `${prefix}-${armSide}-upper-arm`,
          size: [1, 1, 1],
          material: material.pbr({ color: shirtColor, roughness: 0.78 })
        })
        .runtime(game.runtimeNode(`${prefix}-${armSide}-upper-arm`))
        .toJSON(),
      primitives
        .cylinder({
          name: `${prefix}-${armSide}-lower-arm`,
          size: [1, 1, 1],
          material: material.pbr({ color: skinColor, roughness: 0.74 })
        })
        .runtime(game.runtimeNode(`${prefix}-${armSide}-lower-arm`))
        .toJSON(),
      primitives
        .sphere({
          name: `${prefix}-${armSide}-hand`,
          size: [0.104, 0.104, 0.104],
          material: material.pbr({ color: skinColor, roughness: 0.74 })
        })
        .runtime(game.runtimeNode(`${prefix}-${armSide}-hand`))
        .toJSON()
    );
  }

  // 3D Tennis Racket (handle, V-throat struts, oval hoop, string bed)
  nodes.push(
    primitives
      .cylinder({
        castShadow: false, name: `${prefix}-racket-handle`,
        size: [1, 1, 1],
        material: material.pbr({ color: "#f3efdf", roughness: 0.68 })
      })
      .runtime(game.runtimeNode(`${prefix}-racket-handle`))
      .toJSON(),
    primitives
      .cylinder({
        castShadow: false, name: `${prefix}-racket-throat-left`,
        size: [1, 1, 1],
        material: material.pbr({ color: racketColor, metalness: 0.35, roughness: 0.42 })
      })
      .runtime(game.runtimeNode(`${prefix}-racket-throat-left`))
      .toJSON(),
    primitives
      .cylinder({
        castShadow: false, name: `${prefix}-racket-throat-right`,
        size: [1, 1, 1],
        material: material.pbr({ color: racketColor, metalness: 0.35, roughness: 0.42 })
      })
      .runtime(game.runtimeNode(`${prefix}-racket-throat-right`))
      .toJSON(),
    primitives
      .torus({
        castShadow: false, name: `${prefix}-racket-hoop`,
        size: [0.35, 0.35, 0.032],
        material: material.pbr({ color: racketColor, metalness: 0.4, roughness: 0.38 })
      })
      .runtime(game.runtimeNode(`${prefix}-racket-hoop`))
      .toJSON(),
    primitives
      .cylinder({
        castShadow: false, name: `${prefix}-racket-strings`,
        size: [0.32, 0.006, 0.32],
        material: material.pbr({ color: "#e4e4cd", roughness: 0.5 })
      })
      .runtime(game.runtimeNode(`${prefix}-racket-strings`))
      .toJSON()
  );

  return nodes;
}

export function resolveAthleteRig(app: AuraApp, prefix: string): AthleteRigHandles {
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

export function updateAthleteRig(
  rig: AthleteRigHandles,
  actor: ActorLike | undefined,
  pose: PoseResult,
  isPlayer: boolean,
  isMoon: boolean,
  appearanceKeyCache: { lastKey: string },
  resolveAppearance?: AppearanceResolver
): void {
  const rootPos: Vec3 = [(actor?.x ?? 0) * COURT_X, 0, (actor?.y ?? (isPlayer ? 0.86 : -0.86)) * COURT_Z];
  const baseYaw = (actor?.end ?? (isPlayer ? 1 : -1)) > 0 ? 0 : Math.PI;
  const yaw = baseYaw + (pose.torsoYaw ?? 0) * 0.45;
  const scale: Vec3 = [0.88, 0.94, 0.88];

  const resolvedAppearance = resolveAppearance?.(actor?.appearance, isPlayer ? "player" : "ai") ?? {};
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

  // Legs (0 = left, 1 = right)
  const leftLeg = pose.legs?.[0] ?? { hip: [-0.11, 0.88, 0], knee: [-0.12, 0.48, -0.05], foot: [-0.12, 0.05, 0] };
  const rightLeg = pose.legs?.[1] ?? { hip: [0.11, 0.88, 0], knee: [0.12, 0.48, 0.05], foot: [0.12, 0.05, 0] };

  const lHipW = localToWorld(rootPos, yaw, scale, leftLeg.hip);
  const lKneeW = localToWorld(rootPos, yaw, scale, leftLeg.knee);
  const lFootW = localToWorld(rootPos, yaw, scale, leftLeg.foot);
  orientCylinderBetween(rig.leftUpperLeg, lHipW, lKneeW, 0.135);
  orientCylinderBetween(rig.leftLowerLeg, lKneeW, lFootW, 0.11);
  rig.leftKnee.setPosition(lKneeW[0], lKneeW[1], lKneeW[2]).setScale([1, 1, 1]).setVisible(true);
  rig.leftShoe
    .setPosition(lFootW[0], Math.max(0.045, lFootW[1]), lFootW[2])
    .setRotation(0, yaw, 0)
    .setScale([scale[0], scale[1], scale[2]])
    .setVisible(true);

  const rHipW = localToWorld(rootPos, yaw, scale, rightLeg.hip);
  const rKneeW = localToWorld(rootPos, yaw, scale, rightLeg.knee);
  const rFootW = localToWorld(rootPos, yaw, scale, rightLeg.foot);
  orientCylinderBetween(rig.rightUpperLeg, rHipW, rKneeW, 0.135);
  orientCylinderBetween(rig.rightLowerLeg, rKneeW, rFootW, 0.11);
  rig.rightKnee.setPosition(rKneeW[0], rKneeW[1], rKneeW[2]).setScale([1, 1, 1]).setVisible(true);
  rig.rightShoe
    .setPosition(rFootW[0], Math.max(0.045, rFootW[1]), rFootW[2])
    .setRotation(0, yaw, 0)
    .setScale([scale[0], scale[1], scale[2]])
    .setVisible(true);

  // Arms (left & right with 2-bone IK elbow solver)
  const lShoulderLocal: Vec3 = [-0.225, pose.shoulderY, 0];
  const rShoulderLocal: Vec3 = [0.225, pose.shoulderY, 0];
  const lHandLocal: Vec3 = pose.left ?? [-0.28, 1.05, -0.14];
  const rHandLocal: Vec3 = pose.right ?? [0.3, 1.08, -0.16];
  const lElbowLocal = solveArmElbow(lShoulderLocal, lHandLocal, -1);
  const rElbowLocal = solveArmElbow(rShoulderLocal, rHandLocal, 1);

  const lShoulderW = localToWorld(rootPos, yaw, scale, lShoulderLocal);
  const lElbowW = localToWorld(rootPos, yaw, scale, lElbowLocal);
  const lHandW = localToWorld(rootPos, yaw, scale, lHandLocal);
  orientCylinderBetween(rig.leftUpperArm, lShoulderW, lElbowW, 0.105);
  orientCylinderBetween(rig.leftLowerArm, lElbowW, lHandW, 0.09);
  rig.leftHand.setPosition(lHandW[0], lHandW[1], lHandW[2]).setScale([1, 1, 1]).setVisible(true);

  const rShoulderW = localToWorld(rootPos, yaw, scale, rShoulderLocal);
  const rElbowW = localToWorld(rootPos, yaw, scale, rElbowLocal);
  const rHandW = localToWorld(rootPos, yaw, scale, rHandLocal);
  orientCylinderBetween(rig.rightUpperArm, rShoulderW, rElbowW, 0.105);
  orientCylinderBetween(rig.rightLowerArm, rElbowW, rHandW, 0.09);
  rig.rightHand.setPosition(rHandW[0], rHandW[1], rHandW[2]).setScale([1, 1, 1]).setVisible(true);

  // 3D Tennis Racket oriented along pose.racketDirection from rHandW
  const rDirLocal: Vec3 = pose.racketDirection ?? [0.4, 0.7, -0.4];
  const rDirWorld = localDirToWorld(yaw, rDirLocal);
  const rDirLen = Math.hypot(rDirWorld[0], rDirWorld[1], rDirWorld[2]) || 1;
  const rx = rDirWorld[0] / rDirLen;
  const ry = rDirWorld[1] / rDirLen;
  const rz = rDirWorld[2] / rDirLen;

  // Orthogonal side vector in racket plane
  let sx = -rz;
  let sy = 0;
  let sz = rx;
  const sLen = Math.hypot(sx, sy, sz) || 1;
  sx /= sLen;
  sy /= sLen;
  sz /= sLen;

  const gripStart: Vec3 = [rHandW[0] - rx * 0.04, rHandW[1] - ry * 0.04, rHandW[2] - rz * 0.04];
  const gripEnd: Vec3 = [rHandW[0] + rx * 0.17, rHandW[1] + ry * 0.17, rHandW[2] + rz * 0.17];
  const throatLeftEnd: Vec3 = [
    rHandW[0] + rx * 0.31 - sx * 0.075,
    rHandW[1] + ry * 0.31 - sy * 0.075,
    rHandW[2] + rz * 0.31 - sz * 0.075
  ];
  const throatRightEnd: Vec3 = [
    rHandW[0] + rx * 0.31 + sx * 0.075,
    rHandW[1] + ry * 0.31 + sy * 0.075,
    rHandW[2] + rz * 0.31 + sz * 0.075
  ];
  const hoopCenter: Vec3 = [rHandW[0] + rx * 0.49, rHandW[1] + ry * 0.49, rHandW[2] + rz * 0.49];

  orientCylinderBetween(rig.racketHandle, gripStart, gripEnd, 0.032);
  orientCylinderBetween(rig.racketThroatLeft, gripEnd, throatLeftEnd, 0.022);
  orientCylinderBetween(rig.racketThroatRight, gripEnd, throatRightEnd, 0.022);

  const racketRot = directionToEulerXYZ(rx, ry, rz);
  rig.racketHoop
    .setPosition(hoopCenter[0], hoopCenter[1], hoopCenter[2])
    .setRotation(racketRot[0] + Math.PI * 0.5, racketRot[1], racketRot[2])
    .setScale([0.92, 1.18, 0.92])
    .setVisible(true);
  rig.racketStrings
    .setPosition(hoopCenter[0], hoopCenter[1], hoopCenter[2])
    .setRotation(racketRot[0] + Math.PI * 0.5, racketRot[1], racketRot[2])
    .setScale([0.9, 0.6, 1.14])
    .setVisible(true);
}

export function createLegacyRig(options: { resolveAppearance?: AppearanceResolver } = {}): AthleteRigPort<AthleteRigHandles> {
  const caches = { player: { lastKey: "" }, rival: { lastKey: "" } };
  return {
    build: (prefix, isPlayer) => buildAthleteNodes(prefix, isPlayer),
    resolve: (app, prefix) => resolveAthleteRig(app, prefix),
    update: (handles, actor, pose, ctx) =>
      updateAthleteRig(handles, actor, pose, ctx.isPlayer, ctx.isMoon, ctx.isPlayer ? caches.player : caches.rival, options.resolveAppearance)
  };
}
