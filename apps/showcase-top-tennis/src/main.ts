import {
  camera,
  createAuraApp,
  effects,
  game,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraRuntimeNodeHandle,
  type AuraSceneNode
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

type Vec3 = [number, number, number];

interface TennisPoseLeg {
  hip: Vec3;
  knee: Vec3;
  foot: Vec3;
  planted?: boolean;
}

interface TennisPoseResult {
  mode: string;
  sliding: boolean;
  legs: [TennisPoseLeg, TennisPoseLeg];
  right: Vec3;
  left: Vec3;
  racketDirection: Vec3;
  hipY: number;
  torsoYaw: number;
  shoulderY: number;
  headY: number;
  leanX: number;
  leanZ: number;
}

interface VenuePalette {
  name: string;
  court: string;
  alley: string;
  apron: string;
  ground: string;
  background: string;
  seat: string;
  trim: string;
}

const VENUE_PALETTES: Record<string, VenuePalette> = {
  hard: {
    name: "NEW YORK HARD",
    court: "#2b678e",
    alley: "#24597a",
    apron: "#3b7d65",
    ground: "#1d3847",
    background: "#0d2230",
    seat: "#1f4e69",
    trim: "#d8ff3e"
  },
  grass: {
    name: "LONDON GRASS",
    court: "#4d8a54",
    alley: "#447b4b",
    apron: "#3c6f43",
    ground: "#2c5433",
    background: "#16301d",
    seat: "#295238",
    trim: "#f3f0dc"
  },
  clay: {
    name: "PARIS CLAY",
    court: "#c4653f",
    alley: "#b35935",
    apron: "#9e4d2d",
    ground: "#6e3823",
    background: "#2e1a12",
    seat: "#675b4c",
    trim: "#e1d4b7"
  },
  desert: {
    name: "DUBAI DESERT",
    court: "#427f82",
    alley: "#397476",
    apron: "#ac8b6b",
    ground: "#c49e78",
    background: "#2b2118",
    seat: "#a88b59",
    trim: "#ede0c5"
  },
  beach: {
    name: "TROPICAL BEACH",
    court: "#367e98",
    alley: "#306f88",
    apron: "#c4b89c",
    ground: "#d4c5a7",
    background: "#123a47",
    seat: "#2b7a8c",
    trim: "#f0e5d3"
  },
  moon: {
    name: "LUNAR COURT",
    court: "#394e60",
    alley: "#324555",
    apron: "#747a7e",
    ground: "#52575c",
    background: "#050911",
    seat: "#4b5563",
    trim: "#e5e7eb"
  }
};

const COURT_X = 5.5;
const COURT_Z = 8.0;
const COURT_Y = 2.177;
const SINGLES_X = 0.82 * COURT_X; // 4.51
const DOUBLES_X = 1.08 * COURT_X; // 5.94
const BASELINE_Z = 1.0 * COURT_Z; // 8.0
const SERVICE_Z = 0.52 * COURT_Z; // 4.16
const NET_POST_X = 1.08 * COURT_X; // 5.94
const NET_POST_H = (1.07 / 2.177) * COURT_Y; // 1.07
const HIDDEN_SCALE: Vec3 = [0.0001, 0.0001, 0.0001];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

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


interface AthleteRigHandles {
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

function buildAthleteNodes(prefix: string, isPlayer: boolean): AuraSceneNode[] {
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
        name: `${prefix}-collar`,
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
        name: `${prefix}-hair`,
        size: [0.284, 0.284, 0.284],
        material: material.pbr({ color: hairColor, roughness: 0.88 })
      })
      .runtime(game.runtimeNode(`${prefix}-hair`))
      .toJSON(),

    primitives
      .box({
        name: `${prefix}-visor`,
        size: [0.22, 0.028, 0.16],
        material: material.pbr({ color: isPlayer ? "#214b3e" : "#f3f0dc", roughness: 0.65 })
      })
      .runtime(game.runtimeNode(`${prefix}-visor`))
      .toJSON(),

    primitives
      .sphere({
        name: `${prefix}-apollo-helmet`,
        size: [0.38, 0.38, 0.38],
        material: material.pbr({ color: "#d8b458", metalness: 0.82, roughness: 0.2 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode(`${prefix}-apollo-helmet`))
      .toJSON(),

    primitives
      .box({
        name: `${prefix}-apollo-pack`,
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
        name: `${prefix}-racket-handle`,
        size: [1, 1, 1],
        material: material.pbr({ color: "#f3efdf", roughness: 0.68 })
      })
      .runtime(game.runtimeNode(`${prefix}-racket-handle`))
      .toJSON(),
    primitives
      .cylinder({
        name: `${prefix}-racket-throat-left`,
        size: [1, 1, 1],
        material: material.pbr({ color: racketColor, metalness: 0.35, roughness: 0.42 })
      })
      .runtime(game.runtimeNode(`${prefix}-racket-throat-left`))
      .toJSON(),
    primitives
      .cylinder({
        name: `${prefix}-racket-throat-right`,
        size: [1, 1, 1],
        material: material.pbr({ color: racketColor, metalness: 0.35, roughness: 0.42 })
      })
      .runtime(game.runtimeNode(`${prefix}-racket-throat-right`))
      .toJSON(),
    primitives
      .torus({
        name: `${prefix}-racket-hoop`,
        size: [0.35, 0.35, 0.032],
        material: material.pbr({ color: racketColor, metalness: 0.4, roughness: 0.38 })
      })
      .runtime(game.runtimeNode(`${prefix}-racket-hoop`))
      .toJSON(),
    primitives
      .cylinder({
        name: `${prefix}-racket-strings`,
        size: [0.32, 0.006, 0.32],
        material: material.pbr({ color: "#e4e4cd", roughness: 0.5 })
      })
      .runtime(game.runtimeNode(`${prefix}-racket-strings`))
      .toJSON()
  );

  return nodes;
}

function resolveAthleteRig(app: ReturnType<typeof createAuraApp>, prefix: string): AthleteRigHandles {
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

function updateAthleteRig(
  rig: AthleteRigHandles,
  actor: any,
  pose: TennisPoseResult,
  isPlayer: boolean,
  isMoon: boolean,
  appearanceKeyCache: { lastKey: string }
): void {
  const rootPos: Vec3 = [(actor?.x ?? 0) * COURT_X, 0, (actor?.y ?? (isPlayer ? 0.86 : -0.86)) * COURT_Z];
  const baseYaw = (actor?.end ?? (isPlayer ? 1 : -1)) > 0 ? 0 : Math.PI;
  const yaw = baseYaw + (pose.torsoYaw ?? 0) * 0.45;
  const scale: Vec3 = [0.88, 0.94, 0.88];

  const resolvedAppearance = (window as any).TennisAppearance?.resolve?.(actor?.appearance, isPlayer ? "player" : "ai") ?? {};
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

const TRAIL_COUNT = 8;
const MARK_COUNT = 8;
const SPECTATOR_COUNT = 24;

function buildTennisScene(): ReturnType<typeof scene> {
  const lineMat = material.pbr({ color: "#f5f4e6", roughness: 0.58 });
  const netPostMat = material.pbr({ color: "#1d322c", metalness: 0.42, roughness: 0.48 });
  const netMeshMat = material.pbr({ color: "#182421", roughness: 0.88 });
  const netTapeMat = material.pbr({ color: "#faf8ee", roughness: 0.46 });

  const s = scene()
    .background("#0d2230")
    .camera(
      camera.perspective({
        fov: 15,
        near: 0.1,
        far: 180,
        position: [0, 25.5, 37.1],
        target: [0, 0, 0.7]
      })
    )
    .add(lights.ambient({ color: "#dce8f2", intensity: 0.62 }))
    .add(
      lights.hemisphere({
        skyColor: "#eef6ff",
        groundColor: "#4d6358",
        intensity: 0.72
      })
    )
    .add(
      lights.directional({
        color: "#fff6e5",
        intensity: 1.95,
        position: [14, 24, 12],
        shadow: true
      })
    )
    .add(
      lights.point({
        color: "#d8ff3e",
        intensity: 1.4,
        position: [0, 11, 0],
        distance: 42
      })
    )
    .add(effects.bloom({ intensity: 0.14, threshold: 0.86, radius: 0.45 }))
    .add(effects.vignette({ intensity: 0.18, smoothness: 0.65 }))
    .add(effects.colorGrade({ contrast: 1.05, saturation: 1.08 }))

    // Outer stadium ground, apron, doubles court, and singles inner court
    .add(
      primitives
        .plane({
          name: "stadium-outer-ground",
          size: [54, 1, 58],
          material: material.pbr({ color: VENUE_PALETTES.hard.ground, roughness: 0.94 })
        })
        .position(0, -0.024, 0)
        .runtime(game.runtimeNode("stadium-outer-ground"))
    )
    .add(
      primitives
        .box({
          name: "court-apron",
          size: [19.8, 0.016, 26.8],
          material: material.pbr({ color: VENUE_PALETTES.hard.apron, roughness: 0.88 })
        })
        .position(0, -0.012, 0)
        .runtime(game.runtimeNode("court-apron"))
    )
    .add(
      primitives
        .box({
          name: "court-doubles-surface",
          size: [DOUBLES_X * 2, 0.016, BASELINE_Z * 2],
          material: material.pbr({ color: VENUE_PALETTES.hard.alley, roughness: 0.82 })
        })
        .position(0, -0.004, 0)
        .runtime(game.runtimeNode("court-doubles-surface"))
    )
    .add(
      primitives
        .box({
          name: "court-singles-surface",
          size: [SINGLES_X * 2, 0.018, BASELINE_Z * 2],
          material: material.pbr({ color: VENUE_PALETTES.hard.court, roughness: 0.78 })
        })
        .position(0, 0, 0)
        .runtime(game.runtimeNode("court-singles-surface"))
    );

  // Grass mower stripes (visible on grass court)
  for (let i = 0; i < 8; i++) {
    const stripeZ = -BASELINE_Z + (i + 0.5) * ((BASELINE_Z * 2) / 8);
    s.add(
      primitives
        .box({
          name: `grass-stripe-${i}`,
          size: [DOUBLES_X * 2 - 0.04, 0.004, (BASELINE_Z * 2) / 8 - 0.02],
          material: material.pbr({
            color: i % 2 === 0 ? "#53945a" : "#46804d",
            roughness: 0.84
          })
        })
        .position(0, 0.009, stripeZ)
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(`grass-stripe-${i}`))
    );
  }

  // Regulation white court lines
  s.addMany([
    primitives
      .box({ name: "line-baseline-far", size: [DOUBLES_X * 2 + 0.055, 0.008, 0.075], material: lineMat })
      .position(0, 0.012, -BASELINE_Z),
    primitives
      .box({ name: "line-baseline-near", size: [DOUBLES_X * 2 + 0.055, 0.008, 0.075], material: lineMat })
      .position(0, 0.012, BASELINE_Z),
    primitives
      .box({ name: "line-doubles-left", size: [0.055, 0.008, BASELINE_Z * 2 + 0.075], material: lineMat })
      .position(-DOUBLES_X, 0.012, 0),
    primitives
      .box({ name: "line-doubles-right", size: [0.055, 0.008, BASELINE_Z * 2 + 0.075], material: lineMat })
      .position(DOUBLES_X, 0.012, 0),
    primitives
      .box({ name: "line-singles-left", size: [0.055, 0.008, BASELINE_Z * 2 + 0.075], material: lineMat })
      .position(-SINGLES_X, 0.012, 0),
    primitives
      .box({ name: "line-singles-right", size: [0.055, 0.008, BASELINE_Z * 2 + 0.075], material: lineMat })
      .position(SINGLES_X, 0.012, 0),
    primitives
      .box({ name: "line-service-far", size: [SINGLES_X * 2 + 0.055, 0.008, 0.055], material: lineMat })
      .position(0, 0.012, -SERVICE_Z),
    primitives
      .box({ name: "line-service-near", size: [SINGLES_X * 2 + 0.055, 0.008, 0.055], material: lineMat })
      .position(0, 0.012, SERVICE_Z),
    primitives
      .box({ name: "line-center-service", size: [0.055, 0.008, SERVICE_Z * 2 + 0.055], material: lineMat })
      .position(0, 0.012, 0),
    primitives
      .box({ name: "line-center-mark-far", size: [0.055, 0.008, 0.28], material: lineMat })
      .position(0, 0.012, -BASELINE_Z + 0.14),
    primitives
      .box({ name: "line-center-mark-near", size: [0.055, 0.008, 0.28], material: lineMat })
      .position(0, 0.012, BASELINE_Z - 0.14)
  ]);

  // Net posts + pulsing red fault LED strips + parabolic sagging net & top tape
  s.addMany([
    primitives
      .cylinder({
        name: "net-post-left",
        size: [0.14, NET_POST_H, 0.14],
        material: netPostMat
      })
      .position(-NET_POST_X, NET_POST_H * 0.5, 0),
    primitives
      .cylinder({
        name: "net-post-right",
        size: [0.14, NET_POST_H, 0.14],
        material: netPostMat
      })
      .position(NET_POST_X, NET_POST_H * 0.5, 0),
    primitives
      .box({
        name: "net-fault-left",
        size: [0.032, NET_POST_H * 0.72, 0.088],
        material: material.emissive({ color: "#3d1c1a", emissive: "#3d1c1a", emissiveIntensity: 0.15 })
      })
      .position(-NET_POST_X, NET_POST_H * 0.54, 0.048)
      .runtime(game.runtimeNode("net-fault-left")),
    primitives
      .box({
        name: "net-fault-right",
        size: [0.032, NET_POST_H * 0.72, 0.088],
        material: material.emissive({ color: "#3d1c1a", emissive: "#3d1c1a", emissiveIntensity: 0.15 })
      })
      .position(NET_POST_X, NET_POST_H * 0.54, 0.048)
      .runtime(game.runtimeNode("net-fault-right")),
    primitives
      .box({
        name: "net-center-strap",
        size: [0.055, 0.914, 0.034],
        material: netTapeMat
      })
      .position(0, 0.457, 0)
  ]);

  const netSegments = 9;
  const netHalfSpan = NET_POST_X;
  for (let i = 0; i < netSegments; i++) {
    const t0 = -1 + (i / netSegments) * 2;
    const t1 = -1 + ((i + 1) / netSegments) * 2;
    const tm = (t0 + t1) * 0.5;
    const segW = (t1 - t0) * netHalfSpan;
    const segX = tm * netHalfSpan;
    const topH = 0.914 + (1.07 - 0.914) * tm * tm;
    s.addMany([
      primitives
        .box({
          name: `net-mesh-seg-${i}`,
          size: [segW + 0.01, topH - 0.05, 0.022],
          material: netMeshMat
        })
        .position(segX, (topH - 0.05) * 0.5 + 0.02, 0),
      primitives
        .box({
          name: `net-tape-seg-${i}`,
          size: [segW + 0.015, 0.062, 0.036],
          material: netTapeMat
        })
        .position(segX, topH - 0.02, 0)
    ]);
  }

  // Umpire high chair + animated 3D Chair Umpire at x = -6.76, z = 0
  const chairWood = material.pbr({ color: "#8c613c", roughness: 0.78 });
  const chairFrame = material.pbr({ color: "#223b35", roughness: 0.65 });
  s.addMany([
    primitives.box({ name: "umpire-chair-base", size: [0.85, 1.85, 0.92], material: chairFrame }).position(-6.76, 0.925, 0),
    primitives.box({ name: "umpire-chair-seat", size: [0.74, 0.12, 0.72], material: chairWood }).position(-6.76, 1.92, 0),
    primitives.box({ name: "umpire-chair-back", size: [0.12, 0.68, 0.72], material: chairWood }).position(-7.08, 2.28, 0),
    primitives.box({ name: "umpire-canopy", size: [1.18, 0.08, 1.18], material: material.pbr({ color: "#ece4cf", roughness: 0.82 }) }).position(-6.76, 2.95, 0),
    primitives
      .capsule({
        name: "umpire-torso",
        size: [0.34, 0.68, 0.34],
        material: material.pbr({ color: "#214b3e", roughness: 0.78 })
      })
      .position(-6.72, 2.26, 0),
    primitives
      .sphere({
        name: "umpire-head",
        size: [0.27, 0.27, 0.27],
        material: material.pbr({ color: "#c58e69", roughness: 0.74 })
      })
      .position(-6.68, 2.62, 0)
      .runtime(game.runtimeNode("umpire-head"))
  ]);

  // Sponsor A-frame boards ("FAMILYSHOOT") at z = -10.85, x = ±4.3 & side player benches
  const sponsorBoardMat = material.pbr({ color: "#1d3d33", roughness: 0.72 });
  const sponsorTrimMat = material.pbr({ color: "#f3efdf", roughness: 0.55 });
  for (const bx of [-4.3, 4.3]) {
    s.addMany([
      primitives.box({ name: `sponsor-board-${bx}`, size: [3.2, 0.78, 0.34], material: sponsorBoardMat }).position(bx, 0.39, -10.85),
      primitives.box({ name: `sponsor-trim-${bx}`, size: [2.85, 0.18, 0.36], material: sponsorTrimMat }).position(bx, 0.42, -10.85)
    ]);
  }
  for (const bz of [-3.4, 3.4]) {
    s.add(
      primitives.box({ name: `players-bench-${bz}`, size: [0.58, 0.46, 1.95], material: chairWood }).position(-7.35, 0.23, bz)
    );
  }

  // Typed Aura3D Stadium Grandstands & Floodlights (from src/aura-assets.ts)
  s.addMany([
    model(assets.showcaseStadiumSeats, {
      name: "stadium-grandstand-rear",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 12.5
    })
      .position(0, 0, -18.5)
      .runtime(game.runtimeNode("stadium-grandstand-rear", { tags: ["typed-supporting-asset"] })),
    model(assets.rooftopScoreboardRigMeshy, {
      name: "stadium-scoreboard-gantry",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 6.2
    }).position(0, 2.4, -15.6),
    model(assets.rooftopFloodlightTowerMeshy, {
      name: "stadium-floodlight-left",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 5.8
    }).position(-12.5, 0, -13.2),
    model(assets.rooftopFloodlightTowerMeshy, {
      name: "stadium-floodlight-right",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 5.8
    }).position(12.5, 0, -13.2)
  ]);

  // Bleacher tiers & animated 3D spectators
  const bleacherMat = material.pbr({ color: "#223b47", roughness: 0.85 });
  s.addMany([
    primitives.box({ name: "bleacher-tier-rear-1", size: [18.5, 0.9, 1.4], material: bleacherMat }).position(0, 0.45, -12.4),
    primitives.box({ name: "bleacher-tier-rear-2", size: [19.4, 1.65, 1.4], material: bleacherMat }).position(0, 0.825, -13.6),
    primitives.box({ name: "bleacher-tier-left", size: [1.5, 1.1, 18.0], material: bleacherMat }).position(-9.2, 0.55, -0.8),
    primitives.box({ name: "bleacher-tier-right", size: [1.5, 1.1, 18.0], material: bleacherMat }).position(9.2, 0.55, -0.8)
  ]);

  const spectatorColors = ["#e06348", "#f2c14e", "#4ea8de", "#52b788", "#f3f0dc", "#c77dff"];
  for (let i = 0; i < SPECTATOR_COUNT; i++) {
    let sx = 0;
    let sy = 1.25;
    let sz = -12.4;
    if (i < 12) {
      sx = -7.2 + (i % 6) * 2.88 + (i >= 6 ? 0.45 : 0);
      sy = i < 6 ? 1.18 : 1.92;
      sz = i < 6 ? -12.35 : -13.55;
    } else if (i < 18) {
      sx = -9.15;
      sy = 1.35;
      sz = -7.5 + (i - 12) * 2.75;
    } else {
      sx = 9.15;
      sy = 1.35;
      sz = -7.5 + (i - 18) * 2.75;
    }
    s.add(
      primitives
        .capsule({
          name: `spectator-${i}`,
          size: [0.32, 0.6, 0.32],
          material: material.pbr({ color: spectatorColors[i % spectatorColors.length]!, roughness: 0.78 })
        })
        .position(sx, sy, sz)
        .runtime(game.runtimeNode(`spectator-${i}`))
    );
  }

  // Service Box Highlight, Aim Ring, Toss Ring, Beginner Landing Ring, and 8 Court Bounce Marks
  s.addMany([
    primitives
      .box({
        name: "service-box-highlight",
        size: [SINGLES_X, 0.005, SERVICE_Z],
        material: material.emissive({ color: "#d9f28c", emissive: "#d9f28c", emissiveIntensity: 0.25 })
      })
      .position(-SINGLES_X * 0.5, 0.011, -SERVICE_Z * 0.5)
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("service-box-highlight")),
    primitives
      .torus({
        name: "serve-aim-ring",
        size: [0.44, 0.44, 0.05],
        material: material.emissive({ color: "#f4f8df", emissive: "#f4f8df", emissiveIntensity: 0.75 })
      })
      .rotate(Math.PI * 0.5, 0, 0)
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("serve-aim-ring")),
    primitives
      .torus({
        name: "serve-toss-ring",
        size: [0.28, 0.28, 0.032],
        material: material.emissive({ color: "#f7e994", emissive: "#f7e994", emissiveIntensity: 0.9 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("serve-toss-ring")),
    primitives
      .torus({
        name: "landing-indicator-ring",
        size: [0.36, 0.36, 0.044],
        material: material.emissive({ color: "#edf1d2", emissive: "#edf1d2", emissiveIntensity: 0.65 })
      })
      .rotate(Math.PI * 0.5, 0, 0)
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("landing-indicator-ring"))
  ]);

  for (let i = 0; i < MARK_COUNT; i++) {
    s.add(
      primitives
        .cylinder({
          name: `court-mark-${i}`,
          size: [0.144, 0.006, 0.144],
          material: material.pbr({ color: "#d6bb95", roughness: 0.75 })
        })
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(`court-mark-${i}`))
    );
  }

  // Tennis Ball, Shadow, Retiring Ball, and 8-Node Flight Trail
  s.addMany([
    primitives
      .sphere({
        name: "tennis-ball",
        size: [0.156, 0.156, 0.156],
        material: material.emissive({ color: "#d8ff3e", emissive: "#d8ff3e", emissiveIntensity: 0.42 })
      })
      .position(0, 0.8, 6.4)
      .runtime(game.runtimeNode("tennis-ball")),
    primitives
      .cylinder({
        name: "tennis-ball-shadow",
        size: [0.19, 0.006, 0.19],
        material: material.pbr({ color: "#122022", roughness: 0.95 })
      })
      .position(0, 0.014, 6.4)
      .runtime(game.runtimeNode("tennis-ball-shadow")),
    primitives
      .sphere({
        name: "retiring-ball",
        size: [0.144, 0.144, 0.144],
        material: material.pbr({ color: "#c9eb3b", roughness: 0.55 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("retiring-ball"))
  ]);

  for (let i = 0; i < TRAIL_COUNT; i++) {
    s.add(
      primitives
        .sphere({
          name: `ball-trail-${i}`,
          size: [0.096, 0.096, 0.096],
          material: material.emissive({ color: "#e6eb8d", emissive: "#e6eb8d", emissiveIntensity: 0.35 })
        })
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(`ball-trail-${i}`))
    );
  }

  // Articulated 3D Athletes (Player & Rival)
  s.addMany(buildAthleteNodes("player", true));
  s.addMany(buildAthleteNodes("rival", false));

  return s;
}

function loadScriptSequentially(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
    document.body.appendChild(script);
  });
}

function installAura3DTopTennisRenderer(): void {
  let auraApp: ReturnType<typeof createAuraApp> | null = null;
  let playerRig: AthleteRigHandles | null = null;
  let rivalRig: AthleteRigHandles | null = null;
  let ballHandle: AuraRuntimeNodeHandle | null = null;
  let ballShadowHandle: AuraRuntimeNodeHandle | null = null;
  let retiringBallHandle: AuraRuntimeNodeHandle | null = null;
  let serviceBoxHighlightHandle: AuraRuntimeNodeHandle | null = null;
  let serveAimRingHandle: AuraRuntimeNodeHandle | null = null;
  let serveTossRingHandle: AuraRuntimeNodeHandle | null = null;
  let landingRingHandle: AuraRuntimeNodeHandle | null = null;
  let umpireHeadHandle: AuraRuntimeNodeHandle | null = null;
  let netFaultLeftHandle: AuraRuntimeNodeHandle | null = null;
  let netFaultRightHandle: AuraRuntimeNodeHandle | null = null;
  let outerGroundHandle: AuraRuntimeNodeHandle | null = null;
  let courtApronHandle: AuraRuntimeNodeHandle | null = null;
  let doublesSurfaceHandle: AuraRuntimeNodeHandle | null = null;
  let singlesSurfaceHandle: AuraRuntimeNodeHandle | null = null;
  let grassStripeHandles: AuraRuntimeNodeHandle[] = [];
  let trailHandles: AuraRuntimeNodeHandle[] = [];
  let markHandles: AuraRuntimeNodeHandle[] = [];
  let spectatorHandles: AuraRuntimeNodeHandle[] = [];

  let viewportWidth = 1280;
  let viewportHeight = 800;
  let currentVenueKey = "";
  let lastFaultActive = false;
  let lastBallWorld: Vec3 = [0, 0.8, 6.4];
  let lastPlayerPose: TennisPoseResult | null = null;
  let framesRendered = 0;
  const playerAppearanceCache = { lastKey: "" };
  const rivalAppearanceCache = { lastKey: "" };

  const cameraEye: Vec3 = [0, 25.5, 37.1];
  const cameraTarget: Vec3 = [0, 0, 0.7];
  const cameraFovDeg = 15;

  function projectWorldPoint(wx: number, wy: number, wz: number): { x: number; y: number; visible: boolean; ndc: Vec3 } {
    // Forward vector from eye to target
    const fxRaw = cameraTarget[0] - cameraEye[0];
    const fyRaw = cameraTarget[1] - cameraEye[1];
    const fzRaw = cameraTarget[2] - cameraEye[2];
    const fLen = Math.hypot(fxRaw, fyRaw, fzRaw) || 1;
    const fx = fxRaw / fLen;
    const fy = fyRaw / fLen;
    const fz = fzRaw / fLen;

    // Right = normalize(cross(f, [0,1,0])) = normalize([-fz, 0, fx])
    const rLen = Math.hypot(fz, fx) || 1;
    const rx = -fz / rLen;
    const ry = 0;
    const rz = fx / rLen;

    // Up = cross(r, f)
    const ux = ry * fz - rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy - ry * fx;

    const dx = wx - cameraEye[0];
    const dy = wy - cameraEye[1];
    const dz = wz - cameraEye[2];

    const cx = dx * rx + dy * ry + dz * rz;
    const cy = dx * ux + dy * uy + dz * uz;
    const cz = -(dx * fx + dy * fy + dz * fz);

    if (cz >= -0.1) {
      return { x: viewportWidth * 0.5, y: viewportHeight * 0.5, visible: false, ndc: [0, 0, 2] };
    }
    const aspect = Math.max(0.2, viewportWidth / Math.max(1, viewportHeight));
    const tanHalfFov = Math.tan((cameraFovDeg * Math.PI) / 360);
    const ndcX = cx / (-cz * tanHalfFov * aspect);
    const ndcY = cy / (-cz * tanHalfFov);
    const screenX = (ndcX + 1) * 0.5 * viewportWidth;
    const screenY = (1 - ndcY) * 0.5 * viewportHeight;
    const visible = Math.abs(ndcX) <= 1.05 && Math.abs(ndcY) <= 1.05 && cz < -0.1;
    return { x: screenX, y: screenY, visible, ndc: [ndcX, ndcY, 0.5] };
  }

  (window as any).TennisScene = {
    createRenderer(canvas: HTMLCanvasElement) {
      auraApp = createAuraApp(canvas, {
        scene: buildTennisScene(),
        renderer: { quality: "high" }
      });

      const req = (id: string) => auraApp!.nodes.require(id);
      playerRig = resolveAthleteRig(auraApp, "player");
      rivalRig = resolveAthleteRig(auraApp, "rival");
      ballHandle = req("tennis-ball");
      ballShadowHandle = req("tennis-ball-shadow");
      retiringBallHandle = req("retiring-ball");
      serviceBoxHighlightHandle = req("service-box-highlight");
      serveAimRingHandle = req("serve-aim-ring");
      serveTossRingHandle = req("serve-toss-ring");
      landingRingHandle = req("landing-indicator-ring");
      umpireHeadHandle = req("umpire-head");
      netFaultLeftHandle = req("net-fault-left");
      netFaultRightHandle = req("net-fault-right");
      outerGroundHandle = req("stadium-outer-ground");
      courtApronHandle = req("court-apron");
      doublesSurfaceHandle = req("court-doubles-surface");
      singlesSurfaceHandle = req("court-singles-surface");
      grassStripeHandles = Array.from({ length: 8 }, (_, i) => req(`grass-stripe-${i}`));
      trailHandles = Array.from({ length: TRAIL_COUNT }, (_, i) => req(`ball-trail-${i}`));
      markHandles = Array.from({ length: MARK_COUNT }, (_, i) => req(`court-mark-${i}`));
      spectatorHandles = Array.from({ length: SPECTATOR_COUNT }, (_, i) => req(`spectator-${i}`));

      document.body.dataset.aura3dReady = "true";
      canvas.dataset.ready = "true";

      function applyVenueMaterials(venue: string): void {
        const key = VENUE_PALETTES[venue] ? venue : "hard";
        if (currentVenueKey === key) return;
        currentVenueKey = key;
        const pal = VENUE_PALETTES[key]!;
        outerGroundHandle?.setMaterial(material.pbr({ color: pal.ground, roughness: 0.94 }));
        courtApronHandle?.setMaterial(material.pbr({ color: pal.apron, roughness: 0.88 }));
        doublesSurfaceHandle?.setMaterial(material.pbr({ color: pal.alley, roughness: 0.82 }));
        singlesSurfaceHandle?.setMaterial(material.pbr({ color: pal.court, roughness: 0.78 }));
        const isGrass = key === "grass";
        for (let i = 0; i < grassStripeHandles.length; i++) {
          grassStripeHandles[i]!
            .setScale(isGrass ? [1, 1, 1] : HIDDEN_SCALE)
            .setVisible(isGrass);
        }
      }

      function render(state: any, serveCue?: any, _tournamentPresentation?: any): void {
        if (!state || !auraApp) return;
        framesRendered += 1;

        const venue = state.venue || "hard";
        const isMoon = venue === "moon";
        applyVenueMaterials(venue);

        // 1. Tennis Ball & Ground Shadow
        const ball = state.ball ?? { x: 0, y: 0.8, z: 0.3, trail: [] };
        const bx = (ball.x ?? 0) * COURT_X;
        const by = Math.max(0.072, (ball.z ?? 0.3) * COURT_Y);
        const bz = (ball.y ?? 0) * COURT_Z;
        lastBallWorld = [bx, by, bz];

        ballHandle?.setPosition(bx, by, bz).setScale([1, 1, 1]).setVisible(true);
        const shadowScale = clamp(1 - by * 0.16, 0.35, 1.05);
        ballShadowHandle
          ?.setPosition(bx, 0.014, bz)
          .setScale([shadowScale, 1, shadowScale])
          .setVisible(true);

        // Retiring ball
        if (state.retiringBall) {
          const rx = state.retiringBall.x * COURT_X;
          const ry = Math.max(0.072, state.retiringBall.z * COURT_Y);
          const rz = state.retiringBall.y * COURT_Z;
          retiringBallHandle?.setPosition(rx, ry, rz).setScale([0.92, 0.92, 0.92]).setVisible(true);
        } else {
          retiringBallHandle?.setScale(HIDDEN_SCALE).setVisible(false);
        }

        // 2. Ball Flight Trail
        const trail = Array.isArray(ball.trail) ? ball.trail : [];
        for (let i = 0; i < TRAIL_COUNT; i++) {
          const pt = trail[trail.length - 1 - i];
          if (pt && state.mode === "playing" && (ball.active || state.phase === "serveToss")) {
            const s = Math.max(0.25, 1 - i / (TRAIL_COUNT + 1));
            trailHandles[i]!
              .setPosition(pt.x * COURT_X, Math.max(0.06, pt.z * COURT_Y), pt.y * COURT_Z)
              .setScale([s, s, s])
              .setVisible(true);
          } else {
            trailHandles[i]!.setScale(HIDDEN_SCALE).setVisible(false);
          }
        }

        // 3. Court Bounce Marks
        const marks = Array.isArray(state.marks) ? state.marks : [];
        for (let i = 0; i < MARK_COUNT; i++) {
          const mk = marks[i];
          if (mk && state.mode !== "menu" && mk.life > 0) {
            markHandles[i]!
              .setPosition(mk.x * COURT_X, 0.016, mk.y * COURT_Z)
              .setScale([1, 1, 1])
              .setVisible(true);
          } else {
            markHandles[i]!.setScale(HIDDEN_SCALE).setVisible(false);
          }
        }

        // 4. Serve Aim Ring, Service Box Highlight, Toss Window Ring & Beginner Landing Ring
        const isPlayerServing =
          state.mode === "playing" &&
          state.server === "player" &&
          (state.phase === "serve" || state.phase === "serveToss" || state.phase === "serveSwing");
        const serveAim = state.serveAttempt?.lockedAim || state.serveAttempt?.aim;
        if (isPlayerServing && serveAim) {
          const boxSignX = state.serveSide === "deuce" ? -1 : 1;
          serviceBoxHighlightHandle
            ?.setPosition(boxSignX * SINGLES_X * 0.5, 0.011, -SERVICE_Z * 0.5)
            .setScale([1, 1, 1])
            .setVisible(true);
          serveAimRingHandle
            ?.setPosition(serveAim.x * COURT_X, 0.022, serveAim.y * COURT_Z)
            .setScale([1, 1, 1])
            .setVisible(true);
        } else {
          serviceBoxHighlightHandle?.setScale(HIDDEN_SCALE).setVisible(false);
          serveAimRingHandle?.setScale(HIDDEN_SCALE).setVisible(false);
        }

        if (
          state.mode === "playing" &&
          state.server === "player" &&
          state.phase === "serveToss" &&
          ball.z >= 0.75 &&
          ball.z <= 1.08
        ) {
          serveTossRingHandle
            ?.setPosition(bx, by, bz)
            .setRotation(0, (state.time ?? 0) * 4, 0)
            .setScale([1.15, 1.15, 1.15])
            .setVisible(true);
        } else {
          serveTossRingHandle?.setScale(HIDDEN_SCALE).setVisible(false);
        }

        const physicsApi = (window as any).TennisPhysics;
        if (
          state.mode === "playing" &&
          state.phase === "rally" &&
          ball.active &&
          ball.vy > 0 &&
          ball.bounceCount === 0 &&
          physicsApi?.landing
        ) {
          const land = physicsApi.landing(ball);
          if (land && Number.isFinite(land.x) && Number.isFinite(land.y)) {
            landingRingHandle
              ?.setPosition(land.x * COURT_X, 0.02, land.y * COURT_Z)
              .setScale([1, 1, 1])
              .setVisible(true);
          } else {
            landingRingHandle?.setScale(HIDDEN_SCALE).setVisible(false);
          }
        } else {
          landingRingHandle?.setScale(HIDDEN_SCALE).setVisible(false);
        }

        // 5. Net Post Fault LEDs & Umpire Head Tracking
        const faultOn = Boolean(
          (serveCue?.visible && serveCue?.kind === "fault") ||
            (state.outFeedback && state.outFeedback.remaining > 0)
        );
        if (faultOn !== lastFaultActive) {
          lastFaultActive = faultOn;
          const mat = faultOn
            ? material.emissive({ color: "#ff3b30", emissive: "#ff3b30", emissiveIntensity: 1.45 })
            : material.emissive({ color: "#3d1c1a", emissive: "#3d1c1a", emissiveIntensity: 0.15 });
          netFaultLeftHandle?.setMaterial(mat);
          netFaultRightHandle?.setMaterial(mat);
        }

        const umpireYaw = clamp(-bx * 0.055, -0.42, 0.42);
        umpireHeadHandle?.setPosition(-6.68, 2.62, 0).setRotation(0, Math.PI * 0.5 + umpireYaw, 0);

        // 6. Spectator Crowd Animation
        const t = Number(state.time ?? 0);
        const cheering = state.phase === "pointOver" || state.mode === "gameover";
        for (let i = 0; i < spectatorHandles.length; i++) {
          let sx = 0;
          let sy = 1.25;
          let sz = -12.4;
          if (i < 12) {
            sx = -7.2 + (i % 6) * 2.88 + (i >= 6 ? 0.45 : 0);
            sy = i < 6 ? 1.18 : 1.92;
            sz = i < 6 ? -12.35 : -13.55;
          } else if (i < 18) {
            sx = -9.15;
            sy = 1.35;
            sz = -7.5 + (i - 12) * 2.75;
          } else {
            sx = 9.15;
            sy = 1.35;
            sz = -7.5 + (i - 18) * 2.75;
          }
          const bounce = cheering ? Math.abs(Math.sin(t * 9 + i * 1.3)) * 0.12 : Math.sin(t * 2.2 + i) * 0.015;
          spectatorHandles[i]!.setPosition(sx, sy + bounce, sz);
        }

        // 7. Articulated 3D Athletes (Player & Rival) via window.TennisPose.pose
        const poseApi = (window as any).TennisPose;
        if (poseApi?.pose && playerRig && rivalRig) {
          const pPose: TennisPoseResult = poseApi.pose(state.player, state);
          const aiPose: TennisPoseResult = poseApi.pose(state.ai, state);
          lastPlayerPose = pPose;
          updateAthleteRig(playerRig, state.player, pPose, true, isMoon, playerAppearanceCache);
          updateAthleteRig(rivalRig, state.ai, aiPose, false, isMoon, rivalAppearanceCache);
        }

        // 8. Publish Aura3D Runtime Evidence
        const evidence = {
          route: "showcase-top-tennis",
          engine: "@aura3d/engine",
          ready: true,
          framesRendered,
          mode: state.mode,
          phase: state.phase,
          venue,
          score: state.score,
          playerPosition: [state.player?.x ?? 0, state.player?.y ?? 0.86],
          aiPosition: [state.ai?.x ?? 0, state.ai?.y ?? -0.86],
          ballWorld: lastBallWorld,
          rallyHits: state.rallyHits ?? 0
        };
        (window as any).__AURA3D_GAME_EVIDENCE__ = evidence;
        (window as any).__AURA3D_GAME__ = evidence;
      }

      function resize(width: number, height: number): void {
        viewportWidth = Math.max(1, width);
        viewportHeight = Math.max(1, height);
      }

      function projectCourt(x: number, y: number, z = 0): { x: number; y: number; visible: boolean } {
        const p = projectWorldPoint(x * COURT_X, Math.max(0.04, z * COURT_Y), y * COURT_Z);
        return { x: p.x, y: p.y, visible: p.visible };
      }

      function debug(): any {
        return {
          type: "aura3d-smooth-players",
          engine: "@aura3d/engine",
          playerStyle: "3d",
          displayBall: [...lastBallWorld],
          camera: {
            position: [...cameraEye],
            target: [...cameraTarget],
            fov: cameraFovDeg,
            near: 0.1,
            far: 180,
            aspect: viewportWidth / Math.max(1, viewportHeight)
          },
          viewport: {
            width: viewportWidth,
            height: viewportHeight,
            bottom: 0,
            pixelRatio: window.devicePixelRatio || 1
          },
          audience: { visible: !isMoonVenue(currentVenueKey), count: SPECTATOR_COUNT },
          environment: { venue: currentVenueKey || "hard" },
          umpire: { visible: true },
          netPostLights: { active: lastFaultActive },
          outfits: {
            player: currentVenueKey === "moon" ? "apollo" : "tennis",
            rival: currentVenueKey === "moon" ? "apollo" : "tennis"
          },
          playerPose: lastPlayerPose
            ? {
                mode: lastPlayerPose.mode,
                legs: lastPlayerPose.legs,
                rightHand: lastPlayerPose.right,
                leftHand: lastPlayerPose.left
              }
            : null
        };
      }

      return { render, resize, projectCourt, debug };
    }
  };
}

function isMoonVenue(v: string): boolean {
  return v === "moon";
}

function bindQuickToolbar(): void {
  const playBtn = document.getElementById("aura-btn-play");
  const practiceBtn = document.getElementById("aura-btn-practice");
  const menuBtn = document.getElementById("aura-btn-menu");
  const venueBtns = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-aura-venue]"));

  function setActiveModeBtn(active: HTMLElement | null): void {
    for (const btn of [playBtn, practiceBtn, menuBtn]) {
      btn?.classList.toggle("active", btn === active);
    }
  }

  function startImmediateSingleMatch(): void {
    const local = (window as any).TennisLocal;
    const menu = (window as any).TennisMenu;
    const modeRadio = document.querySelector<HTMLInputElement>('input[name="game-mode"][value="single"]');
    if (modeRadio) {
      modeRadio.checked = true;
      modeRadio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    menu?.started?.();
    local?.startOffline?.();
    document.getElementById("menu")?.classList.add("hidden");
    document.getElementById("match-intro")?.setAttribute("hidden", "");
    document.getElementById("match-hud")?.classList.remove("hidden");
    setActiveModeBtn(playBtn);
  }

  function startImmediatePractice(): void {
    const local = (window as any).TennisLocal;
    const menu = (window as any).TennisMenu;
    const modeRadio = document.querySelector<HTMLInputElement>('input[name="game-mode"][value="practice"]');
    if (modeRadio) {
      modeRadio.checked = true;
      modeRadio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    menu?.started?.();
    local?.startOffline?.();
    document.getElementById("menu")?.classList.add("hidden");
    document.getElementById("match-intro")?.setAttribute("hidden", "");
    document.getElementById("match-hud")?.classList.remove("hidden");
    setActiveModeBtn(practiceBtn);
  }

  playBtn?.addEventListener("click", () => {
    startImmediateSingleMatch();
  });

  practiceBtn?.addEventListener("click", () => {
    startImmediatePractice();
  });

  menuBtn?.addEventListener("click", () => {
    (window as any).TennisMenu?.home?.();
    setActiveModeBtn(menuBtn);
  });

  for (const btn of venueBtns) {
    btn.addEventListener("click", () => {
      const v = btn.dataset.auraVenue || "hard";
      for (const b of venueBtns) b.classList.toggle("active", b === btn);
      (window as any).TennisLocal?.selectVenue?.(v);
      const st = (window as any).__TOP_TENNIS_CONTROL__?.getState?.();
      if (st) {
        st.venue = v;
      }
    });
  }

  // Unless ?menu=1 is requested, start immediately on the live 3D court so WASD/Arrows/Space work immediately!
  const params = new URLSearchParams(window.location.search);
  const requestedVenue = params.get("venue");
  if (requestedVenue && VENUE_PALETTES[requestedVenue]) {
    const matchBtn = venueBtns.find((b) => b.dataset.auraVenue === requestedVenue);
    matchBtn?.click();
  }
  if (params.get("menu") !== "1" && !params.get("mode")) {
    startImmediateSingleMatch();
  } else if (params.get("mode") === "practice") {
    startImmediatePractice();
  }
}

function injectStylesheet(href: string): void {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function installOfflineApiMocks(): void {
  (window as any).TennisAnalytics = new Proxy(
    {},
    {
      get: () => () => {}
    }
  );
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    if (urlStr.includes("/api/games-played")) {
      return new Response(JSON.stringify({ count: 14820 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (urlStr.includes("/api/players-online")) {
      return new Response(JSON.stringify({ online: 28 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (urlStr.includes("/api/tour/me") || urlStr.includes("/api/auth/")) {
      return new Response(JSON.stringify({ authenticated: false, user: null, profile: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return origFetch(input, init);
  };
}

async function loadAndRunScriptsInOrder(urls: readonly string[]): Promise<void> {
  const sources = await Promise.all(
    urls.map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
      return { url, code: await res.text() };
    })
  );
  for (const { url, code } of sources) {
    const script = document.createElement("script");
    script.text = `${code}\n//# sourceURL=${url}`;
    document.body.appendChild(script);
  }
}

async function bootTopTennisAura3D(): Promise<void> {
  installOfflineApiMocks();

  const cssFiles = [
    "/toptennis/brand.css",
    "/toptennis/matchpoint-fonts.css",
    "/toptennis/styles.css",
    "/toptennis/menu.css",
    "/toptennis/player-select.css",
    "/toptennis/appearance-select.css",
    "/toptennis/multiplayer-build.css",
    "/toptennis/tour.css",
    "/toptennis/tournament-view.css",
    "/toptennis/matchpoint-game.css",
    "/toptennis/controls-settings.css"
  ];
  for (const href of cssFiles) {
    injectStylesheet(href);
  }

  const preRendererScripts = [
    "/toptennis/games-played.js",
    "/toptennis/physics.js",
    "/toptennis/strokes.js",
    "/toptennis/player-pose.js",
    "/toptennis/player-appearance.js",
    "/toptennis/player-characters.js",
    "/toptennis/player-roster.js",
    "/toptennis/match-engine.js",
    "/toptennis/player-select.js",
    "/toptennis/random-id.js",
    "/toptennis/appearance-select.js",
    "/toptennis/multiplayer-build.js",
    "/toptennis/tour-catalog.js",
    "/toptennis/tournament.js",
    "/toptennis/tour-engine-loader.js",
    "/toptennis/tour-client.js",
    "/toptennis/tour-guest.bundle.js",
    "/toptennis/tour-hub.js",
    "/toptennis/tournament-view.js",
    "/toptennis/tennis-audio.js",
    "/toptennis/controls.js",
    "/toptennis/mobile-swipe.js",
    "/toptennis/match-results.js"
  ];
  await loadAndRunScriptsInOrder(preRendererScripts);

  installAura3DTopTennisRenderer();

  const postRendererScripts = [
    "/toptennis/game.js",
    "/toptennis/controls-settings.js",
    "/toptennis/menu-flow.js"
  ];
  await loadAndRunScriptsInOrder(postRendererScripts);

  bindQuickToolbar();
}

void bootTopTennisAura3D();
