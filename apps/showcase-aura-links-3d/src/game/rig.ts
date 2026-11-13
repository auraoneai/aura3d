/**
 * Aura Links 3D — 100% Procedural Articulated Pro Golfer Driver.
 *
 * Drives the 14-joint `@aura3d/engine` procedural golfer (`buildArticulatedGolferNode`)
 * through an anatomic championship golf swing (`swingMath.ts` + `meshyProfile()`):
 * takeaway -> full backswing -> accelerating downswing -> impact -> high finish,
 * keeping both hands locked on the golf club grip and both tour golf shoes planted
 * on the turf with zero external or Meshy `.glb` files.
 */
import { game, material, primitives } from "@aura3d/engine";
import { gripQToEulerZYX } from "@aura3d/engine/game";
import {
  buildArticulatedGolferNode,
  buildClubGripNode,
  buildClubHeadNode,
  buildClubShaftNode,
  buildGolfCaddieNode,
  buildGolfCartNode,
  buildTourBagNode
} from "../art/proceduralModels";
import type { GolferFit, Vec3 } from "./types";
import { meshyProfile, retargetSolved } from "./golferRetarget";
import {
  BALL_SHOT,
  CLUB_PARTS,
  clubAttachOffsets,
  clubPartPose,
  evaluateSwing,
  makeRoot,
  qMul,
  solveSwing,
  useSkeleton,
  vDist,
  type Quat,
  type RootFrame,
  type SwingPosePhase
} from "./swingMath";

export type GolferPhase =
  | "address"
  | "backswing"
  | "top"
  | "downswing"
  | "follow"
  | "celebrate"
  | "walk"
  | "idle"
  | "putt"
  | "putt-address"
  | "putt-back"
  | "putt-through";

const golfKit = game.racketSports("aura-links-golfer");

export type GolferVariant = "meshy" | "athlete";
let golferVariant: GolferVariant = "meshy";
let appliedVariant: GolferVariant | null = null;

interface VariantSpec {
  readonly ready: string;
  readonly readySpeed: number;
  readonly walk: { clip: string; speed: number } | null;
  readonly celebrate: { clip: string; speed: number };
}
const VARIANTS: Record<GolferVariant, VariantSpec> = {
  meshy: {
    ready: "idle",
    readySpeed: 1,
    walk: null,
    celebrate: { clip: "cheer", speed: 1 }
  },
  athlete: {
    ready: "Ready",
    readySpeed: 1,
    walk: { clip: "Walk_Loop", speed: 1.1 },
    celebrate: { clip: "Jump_Loop", speed: 1.2 }
  }
};

export function setGolferVariant(variant: GolferVariant): void {
  golferVariant = variant;
  appliedVariant = null;
  calibGroundDy = null;
  lastGolferAnimKey = "";
}
export const golferVariantFromSearch = (search: string): GolferVariant => {
  const q = new URLSearchParams(search);
  return q.get("golfer") === "old" || q.get("look") === "original" ? "athlete" : "meshy";
};
const ensureSkeleton = (): void => {
  if (appliedVariant === golferVariant) return;
  useSkeleton(meshyProfile());
  appliedVariant = golferVariant;
};

const HIDDEN = 0.0001;
const UNI: [number, number, number] = [1, 1, 1];
const STANCE_MID: [number, number, number] = [0.52, 0.012, -0.02];

const SWING_PHASES = new Set<string>([
  "address", "idle", "backswing", "top", "downswing", "follow",
  "putt", "putt-address", "putt-back", "putt-through"
]);
const posePhase = (phase: GolferPhase): SwingPosePhase =>
  phase === "putt" ? "putt-address" : (phase as SwingPosePhase);

export interface GolferJointHandles {
  readonly hips?: any;
  readonly spine?: any;
  readonly chest?: any;
  readonly head?: any;
  readonly armL?: any;
  readonly forearmL?: any;
  readonly armR?: any;
  readonly forearmR?: any;
  readonly thighL?: any;
  readonly shinL?: any;
  readonly footL?: any;
  readonly thighR?: any;
  readonly shinR?: any;
  readonly footR?: any;
}

export interface GolferRig {
  readonly shadow: any;
  readonly ring: any;
  readonly hero: any;
  readonly caddy: any;
  readonly golferBody: any;
  readonly caddyBody: any;
  readonly bag: any;
  readonly cart: any;
  readonly clubShaft: any;
  readonly clubHead: any;
  readonly clubGrip: any;
  readonly joints?: GolferJointHandles;
}

export function buildGolferNodes(fit: GolferFit, refined = false): any[] {
  const rt = (name: string) => game.runtimeNode(name);
  const v = VARIANTS[golferVariant];

  return [
    primitives
      .cylinder({
        name: "golfer-shadow",
        size: [1, 0.01, 1],
        material: material.pbr({ color: "#02040a", roughness: 1, opacity: 0.22 }),
        castShadow: false,
        receiveShadow: false
      })
      .runtime(rt("golfer-shadow")),
    primitives
      .torus({
        name: "golfer-ring",
        size: [0.62, 0.03, 0.03],
        material: material.emissive({ color: fit.polo || "#ffd76a", emissive: fit.polo || "#ffd76a", emissiveIntensity: 0.9 }),
        castShadow: false,
        receiveShadow: false,
        visible: false
      } as any)
      .scale(HIDDEN)
      .runtime(rt("golfer-ring")),
    buildArticulatedGolferNode(fit, refined, v.ready, v.readySpeed),
    buildGolfCaddieNode(fit, refined),
    buildTourBagNode(fit, refined),
    buildGolfCartNode(refined),
    buildClubGripNode(fit.cap),
    buildClubShaftNode(),
    buildClubHeadNode()
  ];
}

let attachDisposers: (() => void)[] = [];
let lastOffsets: readonly { readonly id: string; readonly position: readonly number[]; readonly rotation: readonly number[]; readonly quat: Quat }[] = [];
let calibGroundDy: number | null = null;
let lastGolferAnimKey = "";
let telemetry: {
  phase: GolferPhase;
  t: number;
  clubHeadWorld: Vec3;
  gripWorld: Vec3;
  ballWorld: Vec3 | null;
  impactDistance: number | null;
  attached: boolean;
} = {
  phase: "address",
  t: 0,
  clubHeadWorld: [0, 0, 0],
  gripWorld: [0, 0, 0],
  ballWorld: null,
  impactDistance: null,
  attached: false
};

export function resolveGolferRig(app: any): GolferRig {
  const req = (n: string) => app.nodes.require(n);
  const opt = (n: string) => {
    try {
      return app.nodes.get ? app.nodes.get(n) : app.nodes.require(n);
    } catch {
      return undefined;
    }
  };
  const golferBody = req("golfer-body");
  const caddyBody = req("caddy-body");
  const variant = VARIANTS[golferVariant];
  golferBody?.setAnimation?.({ clip: variant.ready, loop: true, speed: variant.readySpeed });
  lastGolferAnimKey = `${variant.ready}:${variant.readySpeed}`;
  for (const dispose of attachDisposers) dispose();
  attachDisposers = [];
  calibGroundDy = null;
  telemetry = { ...telemetry, attached: false };
  return {
    shadow: req("golfer-shadow"),
    ring: req("golfer-ring"),
    hero: golferBody,
    caddy: caddyBody,
    golferBody,
    caddyBody,
    bag: req("golfer-bag"),
    cart: req("golfer-cart"),
    clubShaft: req("golfer-club-shaft"),
    clubHead: req("golfer-club-head"),
    clubGrip: req("golfer-club-grip"),
    joints: {
      hips: opt("golfer-hips"),
      spine: opt("golfer-spine"),
      chest: opt("golfer-chest"),
      head: opt("golfer-head"),
      armL: opt("golfer-arm-l"),
      forearmL: opt("golfer-forearm-l"),
      armR: opt("golfer-arm-r"),
      forearmR: opt("golfer-forearm-r"),
      thighL: opt("golfer-thigh-l"),
      shinL: opt("golfer-shin-l"),
      footL: opt("golfer-foot-l"),
      thighR: opt("golfer-thigh-r"),
      shinR: opt("golfer-shin-r"),
      footR: opt("golfer-foot-r")
    }
  };
}

export function golferTelemetry() {
  return telemetry;
}

function calibrateClub(_rig: GolferRig, root: RootFrame, groundDy: number): void {
  for (const dispose of attachDisposers) dispose();
  attachDisposers = [];
  const addr = solveSwing(evaluateSwing("address", 0), root);
  const offsets = clubAttachOffsets(addr.rightForearmWorld, addr.rightElbowModel, addr.grip, addr.shaftDir, root);
  lastOffsets = offsets;
  calibGroundDy = groundDy;
  telemetry = { ...telemetry, attached: offsets.length > 0 };
}

function placeClubPart(
  handle: any,
  root: RootFrame,
  solved: ReturnType<typeof solveSwing>,
  part: { readonly id: string; readonly position: readonly number[]; readonly quat: Quat },
  toWorld: (shotLocal: readonly number[]) => readonly number[],
  faceYaw: number
): void {
  const { centreShot, worldQuat } = clubPartPose(solved, part, root, faceYaw);
  const centreW = toWorld(centreShot);
  const worldEuler = gripQToEulerZYX([worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w]);
  handle?.setPosition?.(centreW[0], centreW[1], centreW[2]);
  handle?.setRotation?.(worldEuler[0], worldEuler[1], worldEuler[2]);
}

function applyQuatEuler(handle: any, q: Quat | undefined): void {
  if (!handle || !q) return;
  const e = gripQToEulerZYX([q.x, q.y, q.z, q.w]);
  handle.setRotation?.(e[0], e[1], e[2]);
}

export function applyGolferFit(rig: GolferRig, fit: GolferFit): void {
  const accent = fit.polo || "#ffd76a";
  rig.ring?.setMaterial?.(material.emissive({ color: accent, emissive: accent, emissiveIntensity: 0.9 }));
  rig.clubGrip?.setMaterial?.(material.blackRubber({ color: fit.cap || "#1a1c22", roughness: 0.84 }));
}

const clipFor = (phase: GolferPhase): { clip: string; speed: number } => {
  const v = VARIANTS[golferVariant];
  if (phase === "walk" && v.walk) return v.walk;
  if (phase === "celebrate") return v.celebrate;
  return { clip: v.ready, speed: v.readySpeed };
};

const effectivePhase = (phase: GolferPhase): GolferPhase =>
  phase === "walk" && !VARIANTS[golferVariant].walk ? "address" : phase;

export function poseGolfer(
  rig: GolferRig,
  phase: GolferPhase,
  t: number,
  at: Vec3,
  faceYaw: number,
  heightFn?: (x: number, z: number) => number
): void {
  ensureSkeleton();
  phase = effectivePhase(phase);
  const W = (v: readonly number[]) => golfKit.localToWorld(at, faceYaw, UNI, v as any);
  const stanceW = W([0.52, 0, -0.02]);
  const stanceGround = heightFn ? heightFn(stanceW[0], stanceW[2]) : at[1];
  const groundDy = stanceGround - at[1];
  const root = makeRoot(groundDy);

  rig.hero
    ?.setPosition(stanceW[0], stanceGround, stanceW[2])
    .setRotation(0, faceYaw - Math.PI / 2, 0)
    .setVisible(true);

  const swingPhase = SWING_PHASES.has(phase);
  if (swingPhase && (calibGroundDy === null || Math.abs(groundDy - calibGroundDy) > 0.03)) {
    calibrateClub(rig, root, groundDy);
  }

  const heroAnim = clipFor(phase);
  const heroKey = `${heroAnim.clip}:${heroAnim.speed}`;
  if (heroKey !== lastGolferAnimKey) {
    lastGolferAnimKey = heroKey;
    rig.golferBody?.setAnimation?.({ clip: heroAnim.clip, loop: true, speed: heroAnim.speed });
  }

  const j = rig.joints;

  if (swingPhase) {
    const breathe = phase === "address" || phase === "idle" || phase === "putt-address" || phase === "putt"
      ? Math.sin(performance.now() / 1400) * 0.012
      : 0;
    const key = evaluateSwing(posePhase(phase), t);
    const solved = solveSwing(key, root, breathe);
    const bones = retargetSolved(solved);
    rig.golferBody?.setAnimationPose?.({ bones, mode: "overlay" } as any);

    if (j) {
      j.hips?.setPosition?.(solved.hipsPos[0], solved.hipsPos[1], solved.hipsPos[2]);
      applyQuatEuler(j.hips, solved.bones.Hips);
      applyQuatEuler(j.spine, solved.bones.Spine);
      applyQuatEuler(j.chest, solved.bones.Chest);
      applyQuatEuler(j.head, solved.bones.Head);
      applyQuatEuler(j.armL, solved.bones.LeftUpperArm);
      applyQuatEuler(j.forearmL, solved.bones.LeftForearm);
      applyQuatEuler(j.armR, solved.bones.RightUpperArm);
      applyQuatEuler(j.forearmR, solved.bones.RightForearm);
      applyQuatEuler(j.thighL, solved.bones.LeftUpperLeg);
      applyQuatEuler(j.shinL, solved.bones.LeftLowerLeg);
      applyQuatEuler(j.footL, solved.bones.LeftFoot);
      applyQuatEuler(j.thighR, solved.bones.RightUpperLeg);
      applyQuatEuler(j.shinR, solved.bones.RightLowerLeg);
      const footRQ = solved.deltas.footR && solved.bones.RightFoot
        ? qMul(solved.bones.RightFoot, solved.deltas.footR)
        : solved.bones.RightFoot;
      applyQuatEuler(j.footR, footRQ);
    }

    for (const handle of [rig.clubGrip, rig.clubShaft, rig.clubHead]) handle?.setVisible?.(true);
    if (lastOffsets.length > 0) {
      const parts: Record<string, any> = {
        "golfer-club-grip": rig.clubGrip,
        "golfer-club-shaft": rig.clubShaft,
        "golfer-club-head": rig.clubHead
      };
      for (const part of lastOffsets) {
        placeClubPart(parts[part.id], root, solved, part, W, faceYaw);
      }
    }

    const headW = W(solved.clubHead);
    const gripW = W(solved.grip);
    const ballW = W(BALL_SHOT);
    telemetry = {
      phase,
      t,
      clubHeadWorld: [headW[0], headW[1], headW[2]],
      gripWorld: [gripW[0], gripW[1], gripW[2]],
      ballWorld: [ballW[0], ballW[1], ballW[2]],
      impactDistance: vDist(solved.clubHead, BALL_SHOT),
      attached: telemetry.attached
    };
  } else {
    rig.golferBody?.setAnimationPose?.(undefined);
    if (j) {
      const prof = meshyProfile();
      const pump = phase === "celebrate" ? Math.sin(t * Math.PI * 3) : 0;
      j.hips?.setPosition?.(prof.rig.hipsBind[0], prof.rig.hipsBind[1], prof.rig.hipsBind[2]);
      j.hips?.setRotation?.(0, 0, 0);
      j.spine?.setRotation?.(0, 0, 0);
      j.chest?.setRotation?.(phase === "celebrate" ? -0.1 : 0, 0, 0);
      j.head?.setRotation?.(phase === "celebrate" ? -0.14 : 0, 0, 0);
      j.armL?.setRotation?.(0, 0, phase === "celebrate" ? -0.45 : 0.12);
      j.forearmL?.setRotation?.(-0.35, 0, 0);
      j.armR?.setRotation?.(phase === "celebrate" ? -1.45 - Math.abs(pump) * 0.25 : 0, 0, phase === "celebrate" ? 0.35 : -0.12);
      j.forearmR?.setRotation?.(phase === "celebrate" ? -0.55 : -0.25, 0, 0);
      j.thighL?.setRotation?.(0, 0, 0);
      j.shinL?.setRotation?.(0, 0, 0);
      j.footL?.setRotation?.(0, 0, 0);
      j.thighR?.setRotation?.(0, 0, 0);
      j.shinR?.setRotation?.(0, 0, 0);
      j.footR?.setRotation?.(0, 0, 0);
    }
    for (const handle of [rig.clubGrip, rig.clubShaft, rig.clubHead]) handle?.setVisible?.(false);
    telemetry = { ...telemetry, phase, t };
  }

  const caddyW = W([3.1, 0, 2.2]);
  const caddyGroundY = heightFn ? heightFn(caddyW[0], caddyW[2]) : at[1];
  const caddyPump = phase === "celebrate" ? Math.abs(Math.sin(t * Math.PI * 2)) * 0.14 : 0;
  rig.caddy
    ?.setPosition(caddyW[0], caddyGroundY + caddyPump, caddyW[2])
    .setRotation(0, faceYaw - 0.38, 0)
    .setVisible(true);

  const bagW = W([3.6, 0, 2.7]);
  const bagGroundY = heightFn ? heightFn(bagW[0], bagW[2]) : at[1];
  rig.bag
    ?.setPosition(bagW[0], bagGroundY + 0.46, bagW[2])
    .setRotation(0.12, faceYaw - 0.5, 0)
    .setVisible(true);

  const cartW = W([6.4, 0, 3.0]);
  const cartGroundY = heightFn ? heightFn(cartW[0], cartW[2]) : at[1];
  rig.cart
    ?.setPosition(cartW[0], cartGroundY, cartW[2])
    .setRotation(0, faceYaw - 0.25, 0)
    .setVisible(true);

  const shadowW = W(STANCE_MID);
  rig.shadow
    .setPosition(shadowW[0], stanceGround + 0.07, shadowW[2])
    .setScale([0.72, 1, 0.6])
    .setVisible(true);
  const atAddress = phase === "address" || phase === "idle" || phase === "putt" || phase === "putt-address";
  rig.ring
    .setPosition(at[0], at[1] + 0.02, at[2])
    .setRotation(Math.PI / 2, 0, 0)
    .setScale(atAddress ? [1, 1, 1] : [HIDDEN, HIDDEN, HIDDEN])
    .setVisible(atAddress);
}

export const CLUB_PART_IDS: readonly string[] = CLUB_PARTS.map((p) => p.id);
