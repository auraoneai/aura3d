/**
 * Red Zone 3D — primitive-built football athletes.
 *
 * Same approach as the tennis route's buildAthleteNodes/updateAthleteRig:
 * capsule limbs, box cleats, sphere helmeted head with a facemask bar and
 * shoulder pads, shadow disc, and an active-player ring — all posed each
 * frame through game.racketSports 2-bone IK helpers. No racket; helmets and
 * pads make the footballers read as footballers.
 */
import { game, material, primitives } from "@aura3d/engine";
import type { AthleteState, Club, StudioState, Vec3 } from "./types";

const HIDDEN = 0.0001;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface FootballKit {
  jersey: string;
  pants: string;
  helmet: string;
  visor: string;
  skin: string;
  ring: string;
}

export const kitFor = (club: Club, studio?: StudioState, isUser?: boolean): FootballKit => ({
  jersey: isUser && studio ? studio.jersey : club.colors.primary,
  pants: isUser && studio ? studio.pants : club.colors.pants,
  helmet: isUser && studio ? studio.helmet : club.colors.helmet,
  visor: isUser && studio ? studio.visor : club.colors.visor,
  skin: "#8a5f42",
  ring: club.colors.accent
});

/* ------------------------------------------------------------------ */
/* Node construction (called once at scene build — 14 athletes)         */
/* ------------------------------------------------------------------ */

export function buildAthleteNodes(id: string, kit: FootballKit): any[] {
  const jersey = material.pbr({ color: kit.jersey, roughness: 0.72 });
  const pants = material.pbr({ color: kit.pants, roughness: 0.78 });
  const helmet = material.pbr({ color: kit.helmet, roughness: 0.4, metalness: 0.25 });
  const visor = material.pbr({ color: kit.visor, roughness: 0.25, metalness: 0.5 });
  const skin = material.pbr({ color: kit.skin, roughness: 0.8 });
  const pads = material.pbr({ color: kit.jersey, roughness: 0.65 });
  const rubber = material.pbr({ color: "#1c1f26", roughness: 0.9 });
  const limb = (name: string, mat: any) =>
    primitives.capsule({ name, size: [1, 1, 1], material: mat }).runtime(game.runtimeNode(name));
  const joint = (name: string, mat: any) =>
    primitives.sphere({ name, size: [1, 1, 1], material: mat }).runtime(game.runtimeNode(name));

  return [
    // blob shadow + active ring
    primitives.cylinder({ name: `${id}-shadow`, size: [1, 0.012, 1], material: material.pbr({ color: "#000000", roughness: 1, opacity: 0.32 }) })
      .scale(HIDDEN).runtime(game.runtimeNode(`${id}-shadow`)),
    primitives.torus({ name: `${id}-ring`, size: [0.6, 0.035, 0.035], material: material.emissive({ color: kit.ring, emissive: kit.ring, emissiveIntensity: 0.9 }) })
      .scale(HIDDEN).runtime(game.runtimeNode(`${id}-ring`)),
    // core: shorts(pelvis) / torso jersey / shoulder pads / helmet+visor+facemask
    primitives.box({ name: `${id}-pelvis`, size: [0.44, 0.28, 0.3], material: pants }).scale(HIDDEN).runtime(game.runtimeNode(`${id}-pelvis`)),
    limb(`${id}-torso`, jersey),
    primitives.box({ name: `${id}-pads`, size: [0.62, 0.2, 0.4], material: pads }).scale(HIDDEN).runtime(game.runtimeNode(`${id}-pads`)),
    joint(`${id}-head`, helmet),
    primitives.box({ name: `${id}-visor`, size: [0.24, 0.07, 0.05], material: visor }).scale(HIDDEN).runtime(game.runtimeNode(`${id}-visor`)),
    primitives.cylinder({ name: `${id}-mask`, size: [1, 1, 1], material: material.pbr({ color: "#c9cdd4", roughness: 0.35, metalness: 0.6 }) }).scale(HIDDEN).runtime(game.runtimeNode(`${id}-mask`)),
    // arms
    limb(`${id}-uarm-l`, jersey), limb(`${id}-uarm-r`, jersey),
    limb(`${id}-farm-l`, skin), limb(`${id}-farm-r`, skin),
    joint(`${id}-hand-l`, skin), joint(`${id}-hand-r`, skin),
    // legs
    limb(`${id}-thigh-l`, pants), limb(`${id}-thigh-r`, pants),
    limb(`${id}-shin-l`, pants), limb(`${id}-shin-r`, pants),
    primitives.box({ name: `${id}-shoe-l`, size: [0.3, 0.11, 0.44], material: rubber }).scale(HIDDEN).runtime(game.runtimeNode(`${id}-shoe-l`)),
    primitives.box({ name: `${id}-shoe-r`, size: [0.3, 0.11, 0.44], material: rubber }).scale(HIDDEN).runtime(game.runtimeNode(`${id}-shoe-r`))
  ];
}

export interface RigHandles {
  shadow: any; ring: any; pelvis: any; torso: any; pads: any;
  head: any; visor: any; mask: any;
  uarmL: any; uarmR: any; farmL: any; farmR: any; handL: any; handR: any;
  thighL: any; thighR: any; shinL: any; shinR: any; shoeL: any; shoeR: any;
}

export function resolveRig(app: any, id: string): RigHandles {
  const req = (n: string) => app.nodes.require(`${id}-${n}`);
  return {
    shadow: req("shadow"), ring: req("ring"), pelvis: req("pelvis"), torso: req("torso"), pads: req("pads"),
    head: req("head"), visor: req("visor"), mask: req("mask"),
    uarmL: req("uarm-l"), uarmR: req("uarm-r"), farmL: req("farm-l"), farmR: req("farm-r"),
    handL: req("hand-l"), handR: req("hand-r"),
    thighL: req("thigh-l"), thighR: req("thigh-r"), shinL: req("shin-l"), shinR: req("shin-r"),
    shoeL: req("shoe-l"), shoeR: req("shoe-r")
  };
}

export function hideRig(rig: RigHandles) {
  for (const h of Object.values(rig)) (h as any).setScale([HIDDEN, HIDDEN, HIDDEN]).setVisible(false);
}

export function retintRig(rig: RigHandles, kit: FootballKit) {
  rig.torso.setMaterial(material.pbr({ color: kit.jersey, roughness: 0.72 }));
  rig.pads.setMaterial(material.pbr({ color: kit.jersey, roughness: 0.65 }));
  rig.pelvis.setMaterial(material.pbr({ color: kit.pants, roughness: 0.78 }));
  rig.thighL.setMaterial(material.pbr({ color: kit.pants, roughness: 0.78 }));
  rig.thighR.setMaterial(material.pbr({ color: kit.pants, roughness: 0.78 }));
  rig.shinL.setMaterial(material.pbr({ color: kit.pants, roughness: 0.78 }));
  rig.shinR.setMaterial(material.pbr({ color: kit.pants, roughness: 0.78 }));
  rig.uarmL.setMaterial(material.pbr({ color: kit.jersey, roughness: 0.72 }));
  rig.uarmR.setMaterial(material.pbr({ color: kit.jersey, roughness: 0.72 }));
  rig.head.setMaterial(material.pbr({ color: kit.helmet, roughness: 0.4, metalness: 0.25 }));
  rig.visor.setMaterial(material.pbr({ color: kit.visor, roughness: 0.25, metalness: 0.5 }));
  rig.ring.setMaterial(material.emissive({ color: kit.ring, emissive: kit.ring, emissiveIntensity: 0.9 }));
}

/* ------------------------------------------------------------------ */
/* Pose evaluation — maps sim pose+phase to joint targets               */
/* ------------------------------------------------------------------ */

interface PoseOut {
  hipY: number;
  shoulderY: number;
  headY: number;
  leanZ: number;   // forward lean (local +z)
  leanX: number;
  torsoYaw: number;
  legs: { hip: Vec3; knee: Vec3; foot: Vec3 }[];
  right: Vec3;
  left: Vec3;
}

function runPose(p: number, speedK: number, handsUp: boolean): PoseOut {
  const s = Math.sin(p), c = Math.cos(p);
  const bob = Math.abs(s) * 0.06;
  const stride = 0.34 * speedK;
  const lift = 0.5 * speedK;
  return {
    hipY: 0.94 - bob * 0.5, shoulderY: 1.42 - bob, headY: 1.7 - bob,
    leanZ: 0.14 + speedK * 0.08, leanX: 0, torsoYaw: s * 0.12,
    legs: [
      { hip: [-0.13, 0.94, 0], knee: [-0.15, 0.5 + Math.max(0, c) * lift, stride * s], foot: [-0.16, 0.07 + Math.max(0, c) * 0.16, stride * s * 1.35] },
      { hip: [0.13, 0.94, 0], knee: [0.15, 0.5 + Math.max(0, -c) * lift, -stride * s], foot: [0.16, 0.07 + Math.max(0, -c) * 0.16, -stride * s * 1.35] }
    ],
    right: handsUp ? [0.34, 1.62, 0.28] : [0.26, 1.05 + s * 0.22, -0.3 * s],
    left: handsUp ? [-0.34, 1.62, 0.28] : [-0.26, 1.05 - s * 0.22, 0.3 * s]
  };
}

function evalPose(a: AthleteState): PoseOut {
  const t = a.poseT;
  switch (a.pose) {
    case "stance3": {
      // 3-point: one hand on the turf
      return {
        hipY: 0.62, shoulderY: 1.0, headY: 1.24, leanZ: 0.5, leanX: 0, torsoYaw: 0,
        legs: [
          { hip: [-0.13, 0.62, 0], knee: [-0.2, 0.34, -0.14], foot: [-0.22, 0.07, -0.3] },
          { hip: [0.13, 0.62, 0], knee: [0.2, 0.3, 0.18], foot: [0.22, 0.07, 0.34] }
        ],
        right: [0.2, 0.42, 0.42],
        left: [-0.24, 0.86, 0.1]
      };
    }
    case "stance2": {
      const sway = Math.sin(t * 2.4) * 0.03;
      return {
        hipY: 0.9 + sway, shoulderY: 1.36 + sway, headY: 1.62 + sway, leanZ: 0.16, leanX: 0, torsoYaw: 0,
        legs: [
          { hip: [-0.13, 0.9, 0], knee: [-0.17, 0.48, 0.04], foot: [-0.2, 0.07, 0.06] },
          { hip: [0.13, 0.9, 0], knee: [0.17, 0.48, 0.04], foot: [0.2, 0.07, 0.06] }
        ],
        right: [0.24, 1.02, 0.14],
        left: [-0.24, 1.02, 0.14]
      };
    }
    case "backpedal": {
      const p = a.runPhase * 1.4;
      const s = Math.sin(p);
      return {
        hipY: 0.86, shoulderY: 1.4, headY: 1.66, leanZ: -0.08, leanX: 0, torsoYaw: s * 0.06,
        legs: [
          { hip: [-0.13, 0.86, 0], knee: [-0.16, 0.46, 0.1 + s * 0.1], foot: [-0.18, 0.07, 0.16 + s * 0.14] },
          { hip: [0.13, 0.86, 0], knee: [0.16, 0.46, 0.1 - s * 0.1], foot: [0.18, 0.07, 0.16 - s * 0.14] }
        ],
        right: [0.28, 1.2, -0.1 - s * 0.12],
        left: [-0.28, 1.2, -0.1 + s * 0.12]
      };
    }
    case "throw": {
      // windup → release over ~0.55s
      const k = clamp(t / 0.55, 0, 1);
      const wind = k < 0.55 ? k / 0.55 : 1 - (k - 0.55) / 0.45;
      return {
        hipY: 0.9, shoulderY: 1.4, headY: 1.66, leanZ: -0.06 + k * 0.2, leanX: -0.06, torsoYaw: -0.5 + k * 0.7,
        legs: [
          { hip: [-0.13, 0.9, 0], knee: [-0.18, 0.46, 0.16], foot: [-0.2, 0.07, 0.3] },
          { hip: [0.13, 0.9, 0], knee: [0.17, 0.46, -0.12], foot: [0.19, 0.07, -0.24] }
        ],
        right: [0.34 - k * 0.12, 1.3 + wind * 0.62, -0.5 + k * 1.05],
        left: [-0.3, 1.24 + k * 0.14, 0.3 + k * 0.14]
      };
    }
    case "catch":
    case "reach": {
      const k = Math.min(1, t * 3);
      return {
        hipY: 0.96 + k * 0.06, shoulderY: 1.44 + k * 0.08, headY: 1.7 + k * 0.1, leanZ: 0.1, leanX: 0, torsoYaw: 0,
        legs: [
          { hip: [-0.13, 0.96, 0], knee: [-0.15, 0.5, 0.08], foot: [-0.16, 0.07, 0.12] },
          { hip: [0.13, 0.96, 0], knee: [0.15, 0.5, 0.08], foot: [0.16, 0.07, 0.12] }
        ],
        right: [0.2, 1.55 + k * 0.25, 0.42],
        left: [-0.2, 1.55 + k * 0.25, 0.42]
      };
    }
    case "tackle": {
      const k = Math.min(1, t * 2.4);
      return {
        hipY: 0.8 - k * 0.1, shoulderY: 1.15 - k * 0.15, headY: 1.38 - k * 0.15, leanZ: 0.62, leanX: 0, torsoYaw: 0,
        legs: [
          { hip: [-0.13, 0.72, 0], knee: [-0.2, 0.36, 0.3], foot: [-0.24, 0.07, 0.5] },
          { hip: [0.13, 0.72, 0], knee: [0.2, 0.36, 0.3], foot: [0.24, 0.07, 0.5] }
        ],
        right: [0.3, 0.95, 0.55],
        left: [-0.3, 0.95, 0.55]
      };
    }
    case "down": {
      const k = Math.min(1, t * 3.2);
      const hip = lerp(0.94, 0.24, k);
      return {
        hipY: hip, shoulderY: lerp(1.42, 0.55, k), headY: lerp(1.68, 0.72, k), leanZ: 0.7 * k, leanX: 0.15 * k, torsoYaw: 0,
        legs: [
          { hip: [-0.13, hip, 0], knee: [-0.18, hip * 0.5, 0.22], foot: [-0.2, 0.07, 0.5] },
          { hip: [0.13, hip, 0], knee: [0.2, hip * 0.5, 0.14], foot: [0.22, 0.07, 0.42] }
        ],
        right: [0.32, lerp(1.0, 0.34, k), 0.3],
        left: [-0.32, lerp(1.0, 0.3, k), 0.36]
      };
    }
    case "celebrate": {
      const s = Math.sin(t * 6);
      const hop = Math.abs(Math.sin(t * 4.4)) * 0.3;
      return {
        hipY: 0.94 + hop, shoulderY: 1.42 + hop, headY: 1.7 + hop, leanZ: -0.05, leanX: 0, torsoYaw: s * 0.2,
        legs: [
          { hip: [-0.13, 0.94, 0], knee: [-0.16, 0.5, 0.05], foot: [-0.17, 0.07, 0.08] },
          { hip: [0.13, 0.94, 0], knee: [0.16, 0.5, 0.05], foot: [0.17, 0.07, 0.08] }
        ],
        right: [0.3, 1.9 + s * 0.1, 0.1],
        left: [-0.3, 1.9 - s * 0.1, 0.1]
      };
    }
    case "block": {
      const s = Math.sin(t * 3 + a.runPhase);
      return {
        hipY: 0.8, shoulderY: 1.24, headY: 1.5, leanZ: 0.34, leanX: 0, torsoYaw: s * 0.04,
        legs: [
          { hip: [-0.13, 0.8, 0], knee: [-0.18, 0.4, 0.14], foot: [-0.2, 0.07, 0.26] },
          { hip: [0.13, 0.8, 0], knee: [0.18, 0.4, -0.08], foot: [0.2, 0.07, -0.2] }
        ],
        right: [0.3, 1.15 + s * 0.05, 0.45],
        left: [-0.3, 1.15 - s * 0.05, 0.45]
      };
    }
    case "jump": {
      return runPose(a.runPhase, 0.9, true);
    }
    case "idle":
    default: {
      const sway = Math.sin(t * 1.8) * 0.02;
      return {
        hipY: 0.92 + sway, shoulderY: 1.4 + sway, headY: 1.66 + sway, leanZ: 0.05, leanX: 0, torsoYaw: 0,
        legs: [
          { hip: [-0.13, 0.92, 0], knee: [-0.16, 0.48, 0.02], foot: [-0.17, 0.07, 0.04] },
          { hip: [0.13, 0.92, 0], knee: [0.16, 0.48, 0.02], foot: [0.17, 0.07, 0.04] }
        ],
        right: [0.26, 1.05, 0.06],
        left: [-0.26, 1.05, 0.06]
      };
    }
    case "run": {
      const speed = Math.hypot(a.vx, a.vz);
      const k = clamp(speed / 7.5, 0.2, 1);
      const p = runPose(a.runPhase * 2.4, k, false);
      if (a.hasBall) {
        // ball-carry tuck: right forearm pins the rock to the chest
        p.right = [0.24, 1.28, 0.24];
      }
      return p;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Rig application (per frame per athlete)                              */
/* ------------------------------------------------------------------ */

export function updateFootballRig(kit: ReturnType<typeof game.racketSports>, rig: RigHandles, a: AthleteState, opts: { active: boolean; carrier: boolean }) {
  const pose = evalPose(a);
  const px = a.x, py = 0, pz = a.z;
  const yaw = a.yaw;
  const root: Vec3 = [px, py, pz];
  const uni: Vec3 = [1, 1, 1];
  const W = (local: Vec3) => kit.localToWorld(root, yaw, uni, local);

  const hips = W([0, pose.hipY, 0]);
  const chest = W([pose.leanX, pose.shoulderY, pose.leanZ]);
  const head = W([pose.leanX * 1.3, pose.headY, pose.leanZ * 1.35]);

  kit.orientCylinderBetween(rig.torso, hips, chest, 0.23, 0.19);
  rig.pelvis.setPosition(hips[0], hips[1], hips[2]).setRotation(0, yaw + pose.torsoYaw * 0.4, 0).setScale([1, 1, 1]).setVisible(true);
  // shoulder pads ride just above the chest anchor
  const padsC = W([pose.leanX, pose.shoulderY + 0.08, pose.leanZ]);
  rig.pads.setPosition(padsC[0], padsC[1], padsC[2]).setRotation(0, yaw + pose.torsoYaw, 0).setScale([1, 1, 1]).setVisible(true);
  // helmet: sphere + visor plate + facemask bar, all facing yaw
  rig.head.setPosition(head[0], head[1] + 0.1, head[2]).setScale([0.26, 0.28, 0.28]).setVisible(true);
  const faceDir = kit.localDirToWorld(yaw + pose.torsoYaw, [0, 0, 1]);
  const visorC: Vec3 = [head[0] + faceDir[0] * 0.2, head[1] + 0.1, head[2] + faceDir[2] * 0.2];
  rig.visor.setPosition(visorC[0], visorC[1], visorC[2]).setRotation(0, yaw + pose.torsoYaw, 0).setScale([1, 1, 1]).setVisible(true);
  const maskA: Vec3 = [head[0] + faceDir[0] * 0.24 - faceDir[2] * 0.11, head[1] + 0.02, head[2] + faceDir[2] * 0.24 + faceDir[0] * 0.11];
  const maskB: Vec3 = [head[0] + faceDir[0] * 0.24 + faceDir[2] * 0.11, head[1] + 0.02, head[2] + faceDir[2] * 0.24 - faceDir[0] * 0.11];
  kit.orientCylinderBetween(rig.mask, maskA, maskB, 0.018);

  // arms — 2-bone IK from shoulders beside chest
  const shOff = 0.28;
  const shoulderR = W([shOff, pose.shoulderY + 0.04, pose.leanZ]);
  const shoulderL = W([-shOff, pose.shoulderY + 0.04, pose.leanZ]);
  const handR = W(pose.right);
  const handL = W(pose.left);
  const elbowR = kit.solveArmElbow(shoulderR, handR, 1, 0.3, 0.285);
  const elbowL = kit.solveArmElbow(shoulderL, handL, -1, 0.3, 0.285);
  kit.orientCylinderBetween(rig.uarmR, shoulderR, elbowR, 0.06);
  kit.orientCylinderBetween(rig.farmR, elbowR, handR, 0.05);
  kit.orientCylinderBetween(rig.uarmL, shoulderL, elbowL, 0.06);
  kit.orientCylinderBetween(rig.farmL, elbowL, handL, 0.05);
  rig.handR.setPosition(handR[0], handR[1], handR[2]).setScale([0.08, 0.08, 0.08]).setVisible(true);
  rig.handL.setPosition(handL[0], handL[1], handL[2]).setScale([0.08, 0.08, 0.08]).setVisible(true);

  // legs — 2-bone IK
  for (let i = 0; i < 2; i++) {
    const leg = pose.legs[i]!;
    const hipL = W(leg.hip);
    const kneeL = W(leg.knee);
    const footL = W(leg.foot);
    const thigh = i === 0 ? rig.thighL : rig.thighR;
    const shin = i === 0 ? rig.shinL : rig.shinR;
    const shoe = i === 0 ? rig.shoeL : rig.shoeR;
    kit.orientCylinderBetween(thigh, hipL, kneeL, 0.085);
    kit.orientCylinderBetween(shin, kneeL, footL, 0.062);
    shoe.setPosition(footL[0], Math.max(0.055, footL[1]), footL[2]).setRotation(0, yaw, 0).setScale([1, 1, 1]).setVisible(true);
  }

  // blob shadow + active ring
  rig.shadow.setPosition(px, 0.012, pz).setScale([1.05, 1, 1.05]).setVisible(true);
  if (opts.active || opts.carrier) {
    const pulse = opts.carrier ? 1.05 + Math.sin(a.poseT * 8) * 0.08 : 0.92;
    rig.ring.setPosition(px, 0.02, pz).setRotation(Math.PI / 2, 0, 0).setScale([pulse, pulse, pulse]).setVisible(true);
  } else {
    rig.ring.setScale([HIDDEN, HIDDEN, HIDDEN]).setVisible(false);
  }
}
