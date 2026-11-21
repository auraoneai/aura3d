/**
 * Aura Links 3D — golfer driver.
 *
 * Drives the player through an anatomic championship golf swing (`swingMath.ts`): takeaway -> full backswing ->
 * accelerating downswing -> impact -> high finish, keeping both hands locked on the golf club grip and both shoes planted.
 * Default: the rigged Idol golfer GLB for the studio polo (speridlabs/idol/max), its unnamed bones driven every frame by
 * text-to-motion clips (`golferMotion.ts`: address waggle, swing, putt, re-aim shuffle, celebrate) with the solve as the club /
 * contact authority and an arm IK overlay (`idolHumanoid.ts`, on the Idol body's own proportions), plus the Idol caddie
 * (CaddieIdle clip), tour bag and cart.
 * `?golfer=old` / `?look=original`: the 14-joint procedural golfer (`buildArticulatedGolferNode`) and procedural props.
 */
import { game, material, model, primitives } from "@aura3d/engine";
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
import { rigProfile, retargetSolved } from "./golferRetarget";
import { assets } from "../aura-assets";
import { IDOL_BINDS } from "./idolBinds";
import { groundUnder, idolGolferKeyFor, type IdolGolferKey } from "./idolArt";
import { idolProfile, retargetIdol, type IdolRigBind } from "./idolHumanoid";
import { IDOL_CADDIE_BIND } from "./idolBinds";
import { caddieIdleDeltas, celebrateDeltas, golferMotionDeltas, type GolferMotionPhase } from "./golferMotion";
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

/**
 * "idol" (the default player): the rigged Idol golfer GLB for the fit's polo, its body playing text-to-motion clips
 * (golferMotion.ts) with the swing solve as the club / contact authority and arm IK overlay, plus the Idol caddie, bag and cart. "athlete" (`?golfer=old` / `?look=original`): the
 * 100% procedural articulated golfer and props, untouched.
 */
export type GolferVariant = "idol" | "athlete";
let golferVariant: GolferVariant = "idol";
let appliedVariant: string | null = null;
let idolKey: IdolGolferKey = "linksIdolGolferBlue";
/** true when GU47 real cast shadows (`turfOn`) are active so the legacy flat blob disc stays hidden */
let realShadowsActive = false;
/** true when the default (Idol GLB) golfer, caddie, bag and cart are mounted */
export const idolGolferActive = (): boolean => golferVariant === "idol";
const idolBind = (): IdolRigBind | undefined => IDOL_BINDS[idolKey];
/** the Idol golfer GLB key the next scene build mounts for this fit (scene signature input for main.ts) */
export const idolGolferKey = (fit: GolferFit): string => (idolGolferActive() ? idolGolferKeyFor(fit) : "procedural");

interface VariantSpec {
  readonly ready: string;
  readonly readySpeed: number;
  readonly walk: { clip: string; speed: number } | null;
  readonly celebrate: { clip: string; speed: number };
}
const VARIANTS: Record<GolferVariant, VariantSpec> = {
  idol: {
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
  return q.get("golfer") === "old" || q.get("look") === "original" ? "athlete" : "idol";
};
const ensureSkeleton = (): void => {
  const bind = idolGolferActive() ? idolBind() : undefined;
  const want = bind ? `idol:${idolKey}` : golferVariant;
  if (appliedVariant === want) return;
  useSkeleton(bind ? idolProfile(bind, idolKey) : rigProfile());
  appliedVariant = want;
};

/** the loops (address waggle, re-aim shuffle, celebrate, caddie idle) run on the real frame clock */
const motionClock = (): number => performance.now() / 1000;

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
  const idol = idolGolferActive();
  realShadowsActive = refined;
  if (idol) {
    const want = idolGolferKeyFor(fit);
    idolKey = IDOL_BINDS[want] ? want : "linksIdolGolferBlue";
    appliedVariant = null;
    calibGroundDy = null;
  }

  return [
    primitives
      .cylinder({
        name: "golfer-shadow",
        size: [1, 0.01, 1],
        material: material.pbr({ color: "#02040a", roughness: 1, opacity: refined ? 0 : 0.22 }),
        castShadow: false,
        receiveShadow: false,
        visible: !refined
      } as any)
      .scale(refined ? HIDDEN : 1)
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
    ...(idol
      ? [
          model(assets[idolKey], { name: "golfer-body", scaleMode: "world", castShadow: true, receiveShadow: true })
            .animate({ clip: v.ready, loop: true, speed: v.readySpeed })
            .runtime(rt("golfer-body")),
          model(assets.linksIdolCaddie, { name: "caddy-body", scaleMode: "world", castShadow: true, receiveShadow: true })
            .animate({ clip: "idle", loop: true, speed: 0.9 })
            .runtime(rt("caddy-body")),
          model(assets.linksIdolTourBag, { name: "golfer-bag", scaleMode: "world", castShadow: true, receiveShadow: true })
            .runtime(rt("golfer-bag")),
          model(assets.linksIdolGolfCart, { name: "golfer-cart", scaleMode: "world", castShadow: true, receiveShadow: true })
            .runtime(rt("golfer-cart"))
        ]
      : [
          buildArticulatedGolferNode(fit, refined, v.ready, v.readySpeed),
          buildGolfCaddieNode(fit, refined),
          buildTourBagNode(fit, refined),
          buildGolfCartNode(refined)
        ]),
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
  // the Idol GLB ships only its idle clip; every phase is a code pose on top of it
  if (idolGolferActive()) return { clip: v.ready, speed: v.readySpeed };
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
  // the Idol golfer re-aims with the Shuffle clip (feet stepping, hands kept on the club at address)
  const idolWalk = idolGolferActive() && phase === "walk";
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
    const bind = idolGolferActive() ? idolBind() : undefined;
    if (bind) {
      // full swing: the motion-captured golf_drive body with the solve's grip as an arm IK overlay (the club and the contact
      // stay on the solve); putting: the pure solve
      // text-to-motion clip body (golferMotion.ts) with the solve's grip as an arm IK overlay; the club and the contact
      // stay on the solve, and each stroke clip's impact frame is warped onto the solve's contact
      const mp: GolferMotionPhase = idolWalk ? "walk" : posePhase(phase);
      const pose = retargetIdol(bind, golferMotionDeltas(bind, idolKey, solved, root, mp, t, motionClock()));
      rig.golferBody?.setAnimationPose?.({ bones: pose, morphTargets: {} } as any);
    }
    else rig.golferBody?.setAnimationPose?.({ bones: retargetSolved(solved), mode: "overlay" } as any);

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
    const bind = idolGolferActive() ? idolBind() : undefined;
    if (bind) {
      // the Idol rig's bind is a T-pose: celebrate (the only non-swing phase) plays the Celebrate clip, never the bind
      rig.golferBody?.setAnimationPose?.({ bones: retargetIdol(bind, celebrateDeltas(bind, motionClock())), morphTargets: {} } as any);
    } else rig.golferBody?.setAnimationPose?.(undefined);
    if (j) {
      const prof = rigProfile();
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
  // Idol props stand on the lowest ground under their footprint (no hovering edge on a slope)
  const under = (p: readonly number[], r: number, sink: number) =>
    heightFn ? (idolGolferActive() ? groundUnder(heightFn, p[0]!, p[2]!, r) - sink : heightFn(p[0]!, p[2]!)) : at[1];
  const caddyGroundY = under(caddyW, 0.2, 0.02);
  const caddyPump = phase === "celebrate" ? Math.abs(Math.sin(t * Math.PI * 2)) * 0.14 : 0;
  rig.caddy
    ?.setPosition(caddyW[0], caddyGroundY + caddyPump, caddyW[2])
    .setRotation(0, faceYaw - 0.38, 0)
    .setVisible(true);
  // the Idol caddie's own GLB idle clip barely moves: it plays the CaddieIdle text-to-motion loop instead
  if (idolGolferActive()) rig.caddy?.setAnimationPose?.({ bones: retargetIdol(IDOL_CADDIE_BIND, caddieIdleDeltas(IDOL_CADDIE_BIND, motionClock())), morphTargets: {} } as any);

  const bagW = W([3.6, 0, 2.7]);
  const bagGroundY = under(bagW, 0.5, 0.03);
  rig.bag
    ?.setPosition(bagW[0], bagGroundY + (idolGolferActive() ? 0 : 0.46), bagW[2])
    // the Idol stand bag already leans on its own stand legs
    .setRotation(idolGolferActive() ? 0 : 0.12, faceYaw - 0.5, 0)
    .setVisible(true);

  const cartW = W([6.4, 0, 3.0]);
  const cartGroundY = under(cartW, 1.1, 0.04);
  rig.cart
    ?.setPosition(cartW[0], cartGroundY, cartW[2])
    .setRotation(0, faceYaw - 0.25, 0)
    .setVisible(true);

  const shadowW = W(STANCE_MID);
  if (realShadowsActive) {
    rig.shadow
      .setPosition(shadowW[0], stanceGround + 0.07, shadowW[2])
      .setScale([HIDDEN, HIDDEN, HIDDEN])
      .setVisible(false);
  } else {
    rig.shadow
      .setPosition(shadowW[0], stanceGround + 0.07, shadowW[2])
      .setScale([0.72, 1, 0.6])
      .setVisible(true);
  }
  const atAddress = phase === "address" || phase === "idle" || phase === "putt" || phase === "putt-address";
  rig.ring
    .setPosition(at[0], at[1] + 0.02, at[2])
    .setRotation(Math.PI / 2, 0, 0)
    .setScale(atAddress ? [1, 1, 1] : [HIDDEN, HIDDEN, HIDDEN])
    .setVisible(atAddress);
}

export const CLUB_PART_IDS: readonly string[] = CLUB_PARTS.map((p) => p.id);
