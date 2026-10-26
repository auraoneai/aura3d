/**
 * Aura Links 3D — rigged golfer driver (linksGolferAthleteMeshy GLB).
 *
 * The GLB is a real skinned character (15 joints: Root Hips Spine Chest Head
 * L/R UpperLeg LowerLeg Foot L/R UpperArm Forearm; 23 clips). This module
 * makes it perform an actual golf swing using the engine's PRD-06 animation
 * APIs:
 *
 *   - `animation.attach` sockets the three club parts to the RIGHT forearm
 *     bone (calibrated palm offset in bone space; no hand bones on this rig),
 *     so the club is rigidly gripped and follows every arm rotation.
 *   - `setAnimationPose({ mode: "overlay" })` writes the swing solve's bone
 *     rotations on top of the playing "Ready" clip (legs keep the clip), so
 *     takeaway → backswing → downswing → impact → follow-through all come
 *     from the skeleton instead of tilting the whole model.
 *   - The left arm is IK'd onto the shaft a hand-span above the right palm,
 *     so BOTH hands stay on the grip through the whole motion.
 *
 * The swing itself is authored in `swingMath.ts` (pure, offline-traceable):
 * a grip trajectory + shaft direction per key, with the impact key derived
 * from the ball so the clubhead strikes the ball exactly at the bottom of
 * the arc. `poseGolfer` evaluates that trajectory each frame and publishes
 * telemetry (`golferTelemetry`) for the impact event + evidence capture.
 *
 * LOCAL FRAME ("shot frame", metres):
 *   origin = the ball / address spot (`at`)
 *   +Z     = intended shot direction (faceYaw = 0 → world +Z)
 *   +X     = the golfer's stance side (~0.52 m left of the ball-line)
 *   +Y     = up
 * The golfer faces -X toward the ball: lead (left) arm/foot sit on the +Z
 * (target) side, trail (right) side toward -Z — a right-handed stance.
 */
import { game, material, model, primitives } from "@aura3d/engine";
import { gripQToEulerZYX } from "@aura3d/engine/game";
import { assets } from "../../../../src/aura-assets";
import type { GolferFit, Vec3 } from "./types";
import {
  BALL_SHOT,
  CLUB_PARTS,
  clubAttachOffsets,
  evaluateSwing,
  makeRoot,
  qMul,
  qRotate,
  quatFromEulerXYZ,
  solveSwing,
  toShot,
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

const HIDDEN = 0.0001;
const GOLFER_BONES = ["Root", "Hips", "Spine", "Chest", "Head", "LeftUpperLeg", "LeftLowerLeg", "LeftFoot", "RightUpperLeg", "RightLowerLeg", "RightFoot", "LeftUpperArm", "LeftForearm", "RightUpperArm", "RightForearm"] as const;
const UNI: [number, number, number] = [1, 1, 1];
const STANCE_MID: [number, number, number] = [0.52, 0.012, -0.02];

/** phases driven by the swing solve (overlay pose + gripped club) */
const SWING_PHASES = new Set<string>([
  "address", "idle", "backswing", "top", "downswing", "follow",
  "putt", "putt-address", "putt-back", "putt-through"
]);
const posePhase = (phase: GolferPhase): SwingPosePhase =>
  phase === "putt" ? "putt-address" : (phase as SwingPosePhase);

/* ------------------------------------------------------------------ *
 *  Rig handles + builders                                             *
 * ------------------------------------------------------------------ */

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
}

export function buildGolferNodes(fit: GolferFit): any[] {
  const steel = material.pbr({ color: "#c8ccd4", metalness: 0.85, roughness: 0.28 });
  const rt = (name: string) => game.runtimeNode(name);

  return [
    // Blob shadow + "at address" marker ring (hidden until address/idle/putt)
    primitives
      .cylinder({
        name: "golfer-shadow",
        size: [1, 0.01, 1],
        material: material.pbr({ color: "#000000", roughness: 1, opacity: 0.32 })
      })
      .runtime(rt("golfer-shadow")),
    primitives
      .torus({
        name: "golfer-ring",
        size: [0.62, 0.03, 0.03],
        material: material.emissive({ color: fit.polo || "#ffd76a", emissive: fit.polo || "#ffd76a", emissiveIntensity: 0.9 })
      })
      .scale(HIDDEN)
      .runtime(rt("golfer-ring")),
    // 3D Bespoke Meshy-6 Pro Golfer + Caddy + Bag + Golf Cart (minY = 0 grounded)
    model(assets.linksGolferAthleteMeshy, {
      name: "golfer-body",
      targetHeight: 1.84,
      role: "primaryCharacter",
      scaleMode: "fit",
      animation: { clip: "Ready", loop: true, speed: 1 }
    } as any)
      .animate({ clip: "Ready", loop: true, speed: 1 })
      .runtime(rt("golfer-body")),
    model(assets.linksGolferAthleteMeshy, {
      name: "caddy-body",
      targetHeight: 1.8,
      role: "setDressing",
      scaleMode: "fit",
      animation: { clip: "Idle_Loop", loop: true, speed: 0.9 }
    } as any)
      .animate({ clip: "Idle_Loop", loop: true, speed: 0.9 })
      .runtime(rt("caddy-body")),
    primitives
      .cylinder({ name: "golfer-bag", size: [0.3, 0.9, 0.3], material: material.pbr({ color: "#1f5f46", roughness: 0.8 }) })
      .runtime(rt("golfer-bag")),
    model(assets.linksGolfCartMeshy, {
      name: "golfer-cart",
      targetHeight: 1.65,
      role: "setDressing",
      scaleMode: "fit"
    }).runtime(rt("golfer-cart")),
    // Club — grip, shaft, head. Native geometry along local +Y; the bone
    // attachment (RightForearm) owns the world transform of all three parts,
    // laid out along the shaft per swingMath.CLUB_PARTS.
    primitives
      .cylinder({ name: "golfer-club-grip", size: [0.03, 0.3, 0.03], material: material.pbr({ color: "#1a1c22", roughness: 0.9 }) })
      .runtime(rt("golfer-club-grip")),
    primitives
      .cylinder({ name: "golfer-club-shaft", size: [0.016, 0.76, 0.016], material: steel })
      .runtime(rt("golfer-club-shaft")),
    primitives
      .box({
        name: "golfer-club-head",
        size: [0.058, 0.055, 0.17],
        material: material.pbr({ color: "#a7adba", metalness: 0.8, roughness: 0.32 })
      })
      .runtime(rt("golfer-club-head"))
  ];
}

/* ------------------------------------------------------------------ *
 *  Attach calibration + telemetry state                               *
 * ------------------------------------------------------------------ */

let attachDisposers: (() => void)[] = [];
let lastOffsets: readonly { readonly id: string; readonly position: readonly number[]; readonly rotation: readonly number[] }[] = [];
let calibGroundDy: number | null = null;
let lastGolferAnimKey = "";
let lastCaddyAnimKey = "";
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
  const golferBody = req("golfer-body");
  const caddyBody = req("caddy-body");
  golferBody?.setAnimation?.({ clip: "Ready", loop: true, speed: 1 });
  caddyBody?.setAnimation?.({ clip: "Idle_Loop", loop: true, speed: 0.9 });
  lastGolferAnimKey = "Ready:1";
  lastCaddyAnimKey = "Idle_Loop:0.9";
  // scene rebuild — drop stale bone attachments; poseGolfer recalibrates
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
    clubGrip: req("golfer-club-grip")
  };
}

/** Latest swing state for the evidence capture (world space). */
export function golferTelemetry() {
  return telemetry;
}

/**
 * Socket the club parts onto the right forearm. Offsets are calibrated from
 * the address frame so the clubhead rests on the ball at address; they only
 * depend on the skeleton, so one calibration per scene holds (re-run when the
 * stance/ball ground delta changes, i.e. per lie).
 */
function calibrateClub(rig: GolferRig, root: RootFrame, groundDy: number): void {
  for (const dispose of attachDisposers) dispose();
  attachDisposers = [];
  const addr = solveSwing(evaluateSwing("address", 0), root);
  const offsets = clubAttachOffsets(addr.rightForearmWorld, addr.rightElbowModel, addr.grip, addr.shaftDir, root);
  const parts: Record<string, any> = {
    "golfer-club-grip": rig.clubGrip,
    "golfer-club-shaft": rig.clubShaft,
    "golfer-club-head": rig.clubHead
  };
  // The club follows the swing solve every frame (poseGolfer re-places all three parts), not the engine bone attachment: the
  // attachment lagged the overlay pose and a bone-space XYZ rotation drew the shaft and head turned away from the grip.
  for (const part of offsets) {
    const handle = parts[part.id];
    if (!handle) continue;
    placeClubPart(handle, root, addr, part);
  }
  lastOffsets = offsets;
  calibGroundDy = groundDy;
  telemetry = { ...telemetry, attached: offsets.length > 0 };
}

/**
 * Fallback/manual placement of one club part from the solved swing frame —
 * the same transform the engine's bone attachment derives (elbow +
 * foreWorld·offset for position, foreWorld ∘ offset for rotation), so the
 * club stays glued even while the attachment registry is unavailable, and
 * doubles as the initial placement at calibration time.
 */
function placeClubPart(
  handle: any,
  root: RootFrame,
  solved: ReturnType<typeof solveSwing>,
  part: { readonly id: string; readonly position: readonly number[]; readonly rotation: readonly number[] }
): void {
  const offsetM = qRotate(solved.rightForearmWorld, [part.position[0], part.position[1], part.position[2]]);
  const centreM = toShot(root, [
    solved.rightElbowModel[0] + offsetM[0],
    solved.rightElbowModel[1] + offsetM[1],
    solved.rightElbowModel[2] + offsetM[2]
  ]);
  const worldQuat = qMul(
    solved.rightForearmWorld,
    quatFromEulerXYZ(part.rotation[0], part.rotation[1], part.rotation[2])
  );
  // route nodes rotate in the engine's default ZYX order (setRotation), not XYZ
  const worldEuler = gripQToEulerZYX([worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w]);
  handle?.setPosition?.(centreM[0], centreM[1], centreM[2]);
  handle?.setRotation?.(worldEuler[0], worldEuler[1], worldEuler[2]);
}

/* ------------------------------------------------------------------ *
 *  Player Studio fit — updates address ring and club grip accents      *
 * ------------------------------------------------------------------ */

export function applyGolferFit(rig: GolferRig, fit: GolferFit): void {
  const accent = fit.polo || "#ffd76a";
  rig.ring?.setMaterial?.(material.emissive({ color: accent, emissive: accent, emissiveIntensity: 0.9 }));
  rig.clubGrip?.setMaterial?.(material.pbr({ color: fit.cap || "#1a1c22", roughness: 0.85 }));
}

/* ------------------------------------------------------------------ *
 *  poseGolfer — per-frame swing driver                                *
 * ------------------------------------------------------------------ */

const clipFor = (phase: GolferPhase): { clip: string; speed: number } =>
  phase === "walk" ? { clip: "Walk_Loop", speed: 1.1 } :
  phase === "celebrate" ? { clip: "Jump_Loop", speed: 1.2 } :
  { clip: "Ready", speed: 1 };

export function poseGolfer(
  rig: GolferRig,
  phase: GolferPhase,
  t: number,
  at: Vec3,
  faceYaw: number,
  heightFn?: (x: number, z: number) => number
): void {
  const W = (v: readonly number[]) => golfKit.localToWorld(at, faceYaw, UNI, v as any);
  const stanceW = W([0.52, 0, -0.02]);
  const stanceGround = heightFn ? heightFn(stanceW[0], stanceW[2]) : at[1];
  const groundDy = stanceGround - at[1];
  const root = makeRoot(groundDy);

  // --- hero: place the model, upright — the swing comes from the bones ----
  rig.hero
    ?.setPosition(stanceW[0], stanceGround, stanceW[2])
    .setRotation(0, faceYaw - Math.PI / 2, 0)
    .setVisible(true);

  // --- club attach calibration (once per lie) -----------------------------
  const swingPhase = SWING_PHASES.has(phase);
  if (swingPhase && (calibGroundDy === null || Math.abs(groundDy - calibGroundDy) > 0.03)) {
    calibrateClub(rig, root, groundDy);
  }

  // --- animation clip + overlay pose --------------------------------------
  const heroAnim = clipFor(phase);
  const heroKey = `${heroAnim.clip}:${heroAnim.speed}`;
  if (heroKey !== lastGolferAnimKey) {
    lastGolferAnimKey = heroKey;
    rig.golferBody?.setAnimation?.({ clip: heroAnim.clip, loop: true, speed: heroAnim.speed });
  }
  const caddyAnim = phase === "celebrate"
    ? { clip: "Contest", speed: 1.15 }
    : { clip: "Idle_Loop", speed: 0.9 };
  const caddyKey = `${caddyAnim.clip}:${caddyAnim.speed}`;
  if (caddyKey !== lastCaddyAnimKey) {
    lastCaddyAnimKey = caddyKey;
    rig.caddyBody?.setAnimation?.({ clip: caddyAnim.clip, loop: true, speed: caddyAnim.speed });
  }

  if (swingPhase) {
    const breathe = phase === "address" || phase === "idle" || phase === "putt-address" || phase === "putt"
      ? Math.sin(performance.now() / 1400) * 0.012
      : 0;
    const key = evaluateSwing(posePhase(phase), t);
    const solved = solveSwing(key, root, breathe);
    // Build the overlay pose. Hips and Root also carry POSITION so the clip's
    // own hips translation cannot desync the rendered skeleton from the club
    // solve (the bone attachment reads the same skeleton).
    const bones: Record<string, { position?: { x: number; y: number; z: number }; rotation: Quat }> = {};
    for (const [bone, q] of Object.entries(solved.bones)) {
      bones[bone] = { rotation: { x: q.x, y: q.y, z: q.z, w: q.w } };
    }
    bones.Root = { rotation: { ...bones.Root!.rotation }, position: { x: 0, y: 0, z: 0 } };
    bones.Hips = { rotation: bones.Hips!.rotation, position: { x: solved.hipsPos[0], y: solved.hipsPos[1], z: solved.hipsPos[2] } };
    rig.golferBody?.setAnimationPose?.({ bones, mode: "overlay" } as any);

    // Drive the club parts from the same solve as the arms, every frame.
    for (const handle of [rig.clubGrip, rig.clubShaft, rig.clubHead]) handle?.setVisible?.(true);
    if (lastOffsets.length > 0) {
      const parts: Record<string, any> = {
        "golfer-club-grip": rig.clubGrip,
        "golfer-club-shaft": rig.clubShaft,
        "golfer-club-head": rig.clubHead
      };
      for (const part of lastOffsets) {
        placeClubPart(parts[part.id], root, solved, part);
      }
    }

    // telemetry (world space) — the impact predicate reads clubHeadWorld
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
    // walk / celebrate: the clip owns the body and no solve places the club, so it is put away rather than left hanging in the air
    rig.golferBody?.setAnimationPose?.(undefined);
    for (const handle of [rig.clubGrip, rig.clubShaft, rig.clubHead]) handle?.setVisible?.(false);
    telemetry = { ...telemetry, phase, t };
  }

  // --- Caddy + bag + cart (set dressing, out of the camera lane) ----------
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

  // Blob shadow under the stance + address marker ring on the ball spot.
  const shadowW = W(STANCE_MID);
  rig.shadow
    .setPosition(shadowW[0], stanceGround + 0.015, shadowW[2])
    .setScale([0.9, 1, 0.8])
    .setVisible(true);
  const atAddress = phase === "address" || phase === "idle" || phase === "putt" || phase === "putt-address";
  rig.ring
    .setPosition(at[0], at[1] + 0.02, at[2])
    .setRotation(Math.PI / 2, 0, 0)
    .setScale(atAddress ? [1, 1, 1] : [HIDDEN, HIDDEN, HIDDEN])
    .setVisible(atAddress);
}

/** club part ids owned by the bone attachment (for diagnostics) */
export const CLUB_PART_IDS: readonly string[] = CLUB_PARTS.map((p) => p.id);
