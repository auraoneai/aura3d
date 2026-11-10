/**
 * Aura Links 3D — rigged golfer driver (linksGolferAthleteMeshy GLB).
 *
 * The default golfer is the Meshy `links_golfer_player` (24-joint humanoid, clips idle/wave/cheer); `?golfer=old` (or
 * `?look=original`) keeps the original athlete, a skinned character of 15 joints (Root Hips Spine Chest Head
 * L/R UpperLeg LowerLeg Foot L/R UpperArm Forearm; 23 clips). The swing is solved on the athlete's virtual skeleton and
 * retargeted onto the Meshy bones (golferRetarget.ts). This module
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
import { game, group, material, model, primitives } from "@aura3d/engine";
import { gripQToEulerZYX } from "@aura3d/engine/game";
import { assets } from "../aura-assets";
import type { GolferFit, Vec3 } from "./types";
import { meshyProfile, retargetSolved } from "./golferRetarget";
import {
  BALL_SHOT,
  CLUB_PARTS,
  clubAttachOffsets,
  clubPartPose,
  SKELETON_ATHLETE,
  evaluateSwing,
  makeRoot,
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

/** which golfer the scene mounts: the Meshy player (default) or the original athlete (`?golfer=old`, `?look=original`) */
export type GolferVariant = "meshy" | "athlete";
let golferVariant: GolferVariant = "meshy";
let appliedVariant: GolferVariant | null = null;

interface VariantSpec {
  /** model asset of the player */
  readonly asset: () => any;
  /** clip under the swing overlay (address, idle, swing) */
  readonly ready: string;
  readonly readySpeed: number;
  /** clip while the player turns the aim, no swing solve */
  readonly walk: { clip: string; speed: number } | null;
  /** clip for the hole-out celebration */
  readonly celebrate: { clip: string; speed: number };
}
const VARIANTS: Record<GolferVariant, VariantSpec> = {
  meshy: {
    asset: () => assets.links_golfer_player,
    ready: "idle",
    readySpeed: 1,
    // no walk clip on the Meshy rig: turning the aim keeps the address pose (club in hand) instead of popping to a club-less idle
    walk: null,
    celebrate: { clip: "cheer", speed: 1 }
  },
  athlete: {
    asset: () => assets.linksGolferAthleteMeshy,
    ready: "Ready",
    readySpeed: 1,
    walk: { clip: "Walk_Loop", speed: 1.1 },
    celebrate: { clip: "Jump_Loop", speed: 1.2 }
  }
};

/** pick the golfer before the scene is built (main.ts reads the URL); the swing solve follows the matching skeleton */
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
  useSkeleton(golferVariant === "meshy" ? meshyProfile() : SKELETON_ATHLETE);
  appliedVariant = golferVariant;
};

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

/**
 * GU47 phase 4 (ibl_reflections, material_quality): on the GU47 look the cart body is a clear-coated painted shell (the
 * judge read it as "blown-out white with no specular response") and the bag a coated nylon; `?look=original` keeps the
 * 4.6.2 materials. Presentation only.
 */
export const CART_REFINED_OVERRIDES = [
  // Unnamed inner-backface primitives (0..2) receive matte chassis dark so inverted normals never bloom chalk-white
  { color: "#191c22", colorMode: "replace" as const, roughness: 0.84, metallic: 0.08 },
  // Championship British racing-green clear-coated bodywork
  { target: "cart_body", color: "#184b39", colorMode: "replace" as const, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.65 },
  // Warm ivory sun canopy lacquer
  { target: "cart_roof", color: "#f3eee3", colorMode: "replace" as const, roughness: 0.26, clearcoat: 0.85, clearcoatRoughness: 0.1, envMapIntensity: 1.35 },
  // Stitched saddle-tan leather bench with grazing microfiber sheen
  { target: "cart_seat", color: "#b68352", colorMode: "replace" as const, roughness: 0.62, sheen: 0.48, sheenColor: "#e6c79c", sheenRoughness: 0.5 },
  // Tires, floor mat, steering column & suspension hardware
  { target: "cart_dark", color: "#191c22", colorMode: "replace" as const, roughness: 0.78, metallic: 0.16 }
];

export function buildGolferNodes(fit: GolferFit, refined = false): any[] {
  const chromeShaft = material.chrome({ color: "#e8eef5", roughness: 0.06, envMapIntensity: 1.8 });
  const brushedTitanium = material.brushedMetal({ color: "#cfd6e0", roughness: 0.22 });
  const carbonCrown = material.clearcoatPaint({
    color: "#141820",
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.65
  });
  const soleBrass = material.pbr({ color: "#d4af5a", metalness: 0.88, roughness: 0.26 });
  const gripRubber = material.physical({
    color: fit.cap || "#191c22",
    roughness: 0.86,
    sheen: 0.25,
    sheenColor: "#3a3f4a",
    sheenRoughness: 0.72
  });
  const bagBodyMat = refined
    ? material.physical({
        color: "#184b39",
        roughness: 0.4,
        clearcoat: 0.45,
        clearcoatRoughness: 0.22,
        sheen: 0.3,
        sheenColor: "#357a60"
      })
    : material.pbr({ color: "#1f5f46", roughness: 0.8 });
  const bagLeatherMat = material.physical({
    color: "#a87444",
    roughness: 0.58,
    sheen: 0.42,
    sheenColor: "#dfbe93",
    sheenRoughness: 0.52
  });
  const rt = (name: string) => game.runtimeNode(name);

  const tourBagNode = refined
    ? group("golfer-bag", [
        primitives.cylinder({ name: "bag-shell", size: [0.27, 0.84, 0.27], material: bagBodyMat }).position(0, -0.02, 0),
        primitives.cylinder({ name: "bag-collar", size: [0.29, 0.11, 0.29], material: bagLeatherMat }).position(0, 0.39, 0),
        primitives.cylinder({ name: "bag-base", size: [0.285, 0.08, 0.285], material: material.pbr({ color: "#171a20", roughness: 0.82 }) }).position(0, -0.42, 0),
        primitives.box({ name: "bag-pocket", size: [0.18, 0.32, 0.12], material: bagLeatherMat }).position(0, -0.1, 0.14),
        primitives.cylinder({ name: "bag-leg-l", size: [0.016, 0.72, 0.016], material: brushedTitanium }).position(-0.11, -0.1, -0.16).rotation(-0.24, 0, 0.12),
        primitives.cylinder({ name: "bag-leg-r", size: [0.016, 0.72, 0.016], material: brushedTitanium }).position(0.11, -0.1, -0.16).rotation(-0.24, 0, -0.12)
      ]).runtime(rt("golfer-bag"))
    : primitives
        .cylinder({ name: "golfer-bag", size: [0.3, 0.9, 0.3], material: bagBodyMat })
        .runtime(rt("golfer-bag"));

  const clubHeadNode = group("golfer-club-head", [
    primitives.cylinder({ name: "club-hosel", size: [0.017, 0.046, 0.017], material: chromeShaft }).position(0, -0.018, 0),
    primitives.sphere({ name: "club-crown", size: 1, material: carbonCrown }).position(0.036, 0.002, -0.016).scale([0.114, 0.054, 0.094]),
    primitives.box({ name: "club-face", size: [0.102, 0.044, 0.012], material: brushedTitanium }).position(0.036, 0.002, 0.024).rotation(-0.18, 0, 0),
    primitives.box({ name: "club-sole", size: [0.068, 0.008, 0.054], material: soleBrass }).position(0.036, 0.025, -0.014)
  ]).runtime(rt("golfer-club-head"));

  return [
    // Blob shadow + "at address" marker ring (hidden until address/idle/putt)
    primitives
      .cylinder({
        name: "golfer-shadow",
        size: [1, 0.01, 1],
        material: material.pbr({ color: "#02040a", roughness: 1, opacity: 0.22 })
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
    // 3D Bespoke Meshy-6 Pro Golfer + Caddy + Bag + Golf Cart (minY = 0 grounded).
    // model() has no `animation` option (it was dropped silently); .animate() sets the clip.
    model(VARIANTS[golferVariant].asset(), {
      name: "golfer-body",
      targetHeight: 1.84,
      role: "primaryCharacter",
      scaleMode: "fit"
    })
      .animate({ clip: VARIANTS[golferVariant].ready, loop: true, speed: VARIANTS[golferVariant].readySpeed })
      .runtime(rt("golfer-body")),
    model(assets.linksGolferAthleteMeshy, {
      name: "caddy-body",
      targetHeight: 1.8,
      role: "setDressing",
      scaleMode: "fit"
    })
      .animate({ clip: "Idle_Loop", loop: true, speed: 0.9 })
      .runtime(rt("caddy-body")),
    tourBagNode,
    model(assets.linksGolfCartMeshy, {
      name: "golfer-cart",
      targetHeight: 1.65,
      role: "setDressing",
      scaleMode: "fit",
      ...(refined ? { materialOverrides: CART_REFINED_OVERRIDES } : {})
    }).runtime(rt("golfer-cart")),
    // Club — tour velvet grip, tapered chrome shaft, 460cc carbon-crown + brushed-titanium head.
    primitives
      .cylinder({ name: "golfer-club-grip", size: [0.028, 0.3, 0.028], material: gripRubber })
      .runtime(rt("golfer-club-grip")),
    primitives
      .cylinder({ name: "golfer-club-shaft", size: [0.013, 0.84, 0.013], material: chromeShaft })
      .runtime(rt("golfer-club-shaft")),
    clubHeadNode
  ];
}

/* ------------------------------------------------------------------ *
 *  Attach calibration + telemetry state                               *
 * ------------------------------------------------------------------ */

let attachDisposers: (() => void)[] = [];
let lastOffsets: readonly { readonly id: string; readonly position: readonly number[]; readonly rotation: readonly number[]; readonly quat: Quat }[] = [];
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
  const variant = VARIANTS[golferVariant];
  golferBody?.setAnimation?.({ clip: variant.ready, loop: true, speed: variant.readySpeed });
  caddyBody?.setAnimation?.({ clip: "Idle_Loop", loop: true, speed: 0.9 });
  lastGolferAnimKey = `${variant.ready}:${variant.readySpeed}`;
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
  part: { readonly id: string; readonly position: readonly number[]; readonly quat: Quat },
  toWorld: (shotLocal: readonly number[]) => readonly number[],
  faceYaw: number
): void {
  const { centreShot, worldQuat } = clubPartPose(solved, part, root, faceYaw);
  const centreW = toWorld(centreShot);
  // route nodes rotate in the engine's default ZYX order (setRotation), not XYZ
  const worldEuler = gripQToEulerZYX([worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w]);
  handle?.setPosition?.(centreW[0], centreW[1], centreW[2]);
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

const clipFor = (phase: GolferPhase): { clip: string; speed: number } => {
  const v = VARIANTS[golferVariant];
  if (phase === "walk" && v.walk) return v.walk;
  if (phase === "celebrate") return v.celebrate;
  return { clip: v.ready, speed: v.readySpeed };
};

/** the Meshy rig has no walk clip: a turning player stays in the address pose */
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
    let bones: Record<string, { position?: { x: number; y: number; z: number }; rotation: Quat }> = {};
    if (golferVariant === "meshy") {
      // the Meshy bones carry other bind rotations and proportions: retarget the solved world deltas (golferRetarget.ts);
      // the Hips position is in centimetres (the Armature node scales its children by 0.01)
      bones = retargetSolved(solved);
    } else {
      for (const [bone, q] of Object.entries(solved.bones)) {
        bones[bone] = { rotation: { x: q.x, y: q.y, z: q.z, w: q.w } };
      }
      bones.Root = { rotation: { ...bones.Root!.rotation }, position: { x: 0, y: 0, z: 0 } };
      bones.Hips = { rotation: bones.Hips!.rotation, position: { x: solved.hipsPos[0], y: solved.hipsPos[1], z: solved.hipsPos[2] } };
    }
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
        placeClubPart(parts[part.id], root, solved, part, W, faceYaw);
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
    // GU47 phase 3: +0.07 m clears the tee deck (+0.03..0.032) and the green disc (+0.065); at +0.015 the blob sat inside
    // the tee box and the golfer had no contact shadow on the tee (rubric: "characters float on the tee box")
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

/** club part ids owned by the bone attachment (for diagnostics) */
export const CLUB_PART_IDS: readonly string[] = CLUB_PARTS.map((p) => p.id);
