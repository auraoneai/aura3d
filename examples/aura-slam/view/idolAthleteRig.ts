/**
 * Idol wow pass: the athletes are rigged image-to-3D GLBs (speridlabs/idol/max) driven every frame from the SAME pose the
 * procedural 28-part rig reads (view/pose.ts -> PoseResult): pelvis height and lean, two-bone IK for each ankle and palm with
 * the pose's knee / elbow as poles. The procedural racket keeps its parts and is re-seated on the GLB's palm, so the grip stays
 * in the hand. The 28-part rig (view/athleteRig.ts, rig-parity tested) is untouched: it still renders on the Moon (Apollo
 * helmet and pack), with `?look=original`, and with `?idol=0`; while the GLB shows, its body parts get inert handles.
 */
import { game, model, type AuraRuntimeNodeHandle, type AuraSceneNode } from "@aura3d/engine";
import type { PoseResult } from "../contract";
import type { ActorState } from "../contract/sim";
import { buildAthleteNodes, resolveAthleteRig, updateAthleteRig, resolveAppearanceFromGlobal, type AthleteRigHandles, type ResolveAppearance, type RigNodeResolver } from "./athleteRig";
import { IDOL_BINDS } from "./idolBind.generated";
import { createIdolHumanoid, qAxis, qMul, vAdd, vSub, type IdolHumanoid, type Q, type V3 } from "./idolHumanoid";
import { hasIdolModel, idolModels, type IdolModelKey } from "./assets";
import type { AthleteRigPort, NodeInput } from "./rigPort";
import { athleteDriver, athleteMotionFrame, createAthleteMotionState, type AthleteMotionState, type MotionActor, type ServeClock } from "./idolMotion";

const COURT_X = 5.5;
const COURT_Z = 8.0;
/** the procedural rig's root scale (athleteRig.ts): pose units -> metres */
const POSE_SCALE: V3 = [0.88, 0.94, 0.88];
/** on-court standing height of the GLB athletes (m): the 28-part rig's rendered height (hair top (1.66 + 0.055) x 0.94 + 0.144 x 0.94 x 0.72 = 1.71 m, shoe soles at 0) */
export const IDOL_ATHLETE_HEIGHT = 1.71;
/** the pose's ankle height when a foot is planted (pose units) */
const POSE_ANKLE_Y = 0.09;

/** Each GLB variant's kit, matched to the appearance colours the match applies (shell/matchSetup.ts + sim defaults). */
export interface AthleteVariant {
  readonly key: string;
  readonly skin: string;
  readonly shirt: string;
  readonly pants: string;
}
const ALL_ATHLETE_VARIANTS: Readonly<Record<"player" | "rival", readonly AthleteVariant[]>> = {
  // alcatraz: medium skin, sky shirt, navy shorts (every offline match and practice)
  player: [{ key: "slamAthleteMatchPlayer", skin: "#c9926d", shirt: "#70b5d3", pants: "#25364d" }],
  // zinner: light skin, clay shirt, ivory shorts (matches); the sim's default rival kit: dark skin, clay shirt, navy shorts
  rival: [
    { key: "slamAthleteMatchRival", skin: "#e4b995", shirt: "#db582f", pants: "#f3f0dc" },
    { key: "slamAthleteRival", skin: "#805039", shirt: "#db582f", pants: "#25364d" }
  ]
};
/** The variants whose GLB and bind table are admitted (a kit without one falls back to the closest admitted kit). */
export const ATHLETE_VARIANTS: Readonly<Record<"player" | "rival", readonly (AthleteVariant & { readonly key: IdolModelKey })[]>> = {
  player: ALL_ATHLETE_VARIANTS.player.filter((v): v is AthleteVariant & { key: IdolModelKey } => hasIdolModel(v.key) && Boolean(IDOL_BINDS[v.key])),
  rival: ALL_ATHLETE_VARIANTS.rival.filter((v): v is AthleteVariant & { key: IdolModelKey } => hasIdolModel(v.key) && Boolean(IDOL_BINDS[v.key]))
};

const hexRgb = (hex: string): V3 => {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [128, 128, 128];
};
const colourDistance = (a: string, b: string): number => {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** The variant whose kit is closest to the resolved appearance (shirt weighs most: it is the largest area on screen). */
export function pickAthleteVariant(variants: readonly AthleteVariant[], look: { skin?: string; shirt?: string; pants?: string }): AthleteVariant {
  let best = variants[0]!;
  let bestScore = Infinity;
  for (const v of variants) {
    const score = 2 * colourDistance(v.shirt, look.shirt ?? v.shirt) + colourDistance(v.skin, look.skin ?? v.skin) + colourDistance(v.pants, look.pants ?? v.pants);
    if (score < bestScore) { bestScore = score; best = v; }
  }
  return best;
}

const humanoids = new Map<string, IdolHumanoid>();
export function athleteHumanoid(key: IdolModelKey): IdolHumanoid {
  let h = humanoids.get(key);
  if (!h) {
    const bind = IDOL_BINDS[key];
    if (!bind) throw new Error(`idolAthleteRig: no bind table for ${key} (run examples/aura-slam/tools/idol-bind.mjs)`);
    humanoids.set(key, (h = createIdolHumanoid(bind)));
  }
  return h;
}

/** uniform node scale that stands a GLB at `height` metres */
export function athleteNodeScale(key: IdolModelKey, height = IDOL_ATHLETE_HEIGHT): number {
  return height / idolModels[key].bounds[1];
}

/** pose-local point (athlete frame, -Z forward) -> GLB model space (+Z forward) at node scale `k` */
const toModel = (p: readonly number[], k: number): V3 => [(-p[0]! * POSE_SCALE[0]) / k, (p[1]! * POSE_SCALE[1]) / k, (-p[2]! * POSE_SCALE[2]) / k];
const toPose = (m: V3, k: number): [number, number, number] => [(-m[0] * k) / POSE_SCALE[0], (m[1] * k) / POSE_SCALE[1], (-m[2] * k) / POSE_SCALE[2]];
const X: V3 = [1, 0, 0];
const Z: V3 = [0, 0, 1];
/** the athlete frame's lean (procedural torso: Euler X = leanZ, Z = -leanX) in model space, where X and Z flip sign */
const leanQ = (leanX: number, leanZ: number, amount: number): Q => qMul(qAxis(X, -leanZ * amount), qAxis(Z, leanX * amount));

export interface AthletePoseSolve {
  readonly bones: ReturnType<IdolHumanoid["solve"]>["bones"];
  /** the GLB palm, back in pose-local units (where the racket is seated) */
  readonly palmR: [number, number, number];
  readonly palmL: [number, number, number];
  /** the GLB right palm in model space */
  readonly palmRModel: V3;
}

/** Solve one GLB athlete pose from the procedural rig's PoseResult (pure: unit tested). */
export function solveAthletePose(h: IdolHumanoid, k: number, pose: Pick<PoseResult, "hipY" | "shoulderY" | "leanX" | "leanZ" | "legs" | "left" | "right">): AthletePoseSolve {
  const m = h.map;
  const hipL = h.bindPos(m.upperLegL);
  const hipR = h.bindPos(m.upperLegR);
  const ankleBindY = (h.bindPos(m.footL)[1] + h.bindPos(m.footR)[1]) / 2;
  const hipBindY = (hipL[1] + hipR[1]) / 2;
  const legs = pose.legs;
  const footTarget = (foot: readonly number[]): V3 => {
    const t = toModel(foot, k);
    return [t[0], ankleBindY + ((foot[1]! - POSE_ANKLE_Y) * POSE_SCALE[1]) / k, t[2]];
  };
  const footL = footTarget(legs[0].foot);
  const footR = footTarget(legs[1].foot);
  // pelvis height from the pose; lowered when a stride asks for more reach than the GLB leg has
  let hipY = ankleBindY + ((pose.hipY - POSE_ANKLE_Y) * POSE_SCALE[1]) / k;
  const reach = h.legLength * 0.985;
  for (const [hip, foot] of [[hipL, footL], [hipR, footR]] as const) {
    const dx = foot[0] - hip[0];
    const dz = foot[2] - hip[2];
    const maxDy = Math.sqrt(Math.max(0, reach * reach - dx * dx - dz * dz));
    if (hipY - foot[1] > maxDy) hipY = foot[1] + maxDy;
  }
  const pelvis = leanQ(pose.leanX, pose.leanZ, 0.35);
  const chest = leanQ(pose.leanX, pose.leanZ, 0.65);
  const pole = (a: readonly number[], b: readonly number[]): V3 => vSub(toModel(b, 1), toModel(a, 1));
  const solved = h.solve({
    hipsOffset: [0, hipY - hipBindY, 0],
    pelvis,
    chest,
    head: [0, 0, 0, 1],
    legL: { end: footL, pole: pole(legs[0].hip, legs[0].knee) },
    legR: { end: footR, pole: pole(legs[1].hip, legs[1].knee) },
    // the procedural elbow hint (racketGeometry solveArmElbow): out, down and back
    armL: { end: toModel(pose.left, k), pole: pole([0, 0, 0], [-0.8, -0.45, 0.9]) },
    armR: { end: toModel(pose.right, k), pole: pole([0, 0, 0], [0.8, -0.45, 0.9]) }
  });
  return { bones: solved.bones, palmR: toPose(solved.palmR, k), palmL: toPose(solved.palmL, k), palmRModel: solved.palmR };
}

interface IdolAthleteHandles {
  readonly base: AthleteRigHandles;
  /** the base handles with every body part inert (racket and shadow stay live) */
  readonly racketOnly: AthleteRigHandles;
  readonly models: ReadonlyArray<{ variant: AthleteVariant & { readonly key: IdolModelKey }; handle: AuraRuntimeNodeHandle; k: number; humanoid: IdolHumanoid }>;
  mode: "idol" | "procedural" | null;
  active: string | null;
  readonly motion: AthleteMotionState;
  lastNow: number | null;
}

const RACKET_PARTS = new Set<keyof AthleteRigHandles>(["racketHandle", "racketThroatLeft", "racketThroatRight", "racketHoop", "racketStrings", "shadowDisc"]);
const HIDDEN: [number, number, number] = [0.0001, 0.0001, 0.0001];
const inert = (real: AuraRuntimeNodeHandle): AuraRuntimeNodeHandle =>
  new Proxy(real, { get: (target, prop, receiver) => { const v = Reflect.get(target, prop, receiver); return typeof v === "function" ? function noop(this: unknown) { return this; } : v; } });

const modelId = (prefix: string, key: string): string => `${prefix}-idol-${key}`;

/**
 * The renderer's athlete rig port with the Idol GLB athletes. `enabled: false` (or `?look=original` / `?idol=0` upstream) is
 * exactly the procedural rig.
 */
export function createIdolPoseRig(options: { resolveAppearance?: ResolveAppearance; enabled?: boolean } = {}): AthleteRigPort<AthleteRigHandles | IdolAthleteHandles> {
  const resolveAppearance = options.resolveAppearance ?? resolveAppearanceFromGlobal;
  const enabled = options.enabled !== false && ATHLETE_VARIANTS.player.length > 0 && ATHLETE_VARIANTS.rival.length > 0;
  const caches = { player: { lastKey: "" }, rival: { lastKey: "" } };
  return {
    build(prefix, isPlayer): NodeInput[] {
      const nodes: NodeInput[] = buildAthleteNodes(prefix, isPlayer) as NodeInput[];
      if (!enabled) return nodes;
      for (const v of ATHLETE_VARIANTS[prefix]) {
        const k = athleteNodeScale(v.key);
        nodes.push(model(idolModels[v.key], { name: modelId(prefix, v.key), role: "primaryCharacter", scaleMode: "world", castShadow: true, receiveShadow: true })
          .position(0, 0, isPlayer ? 6.8 : -6.8)
          .rotate(0, isPlayer ? Math.PI : 0, 0)
          .scale([k, k, k])
          .runtime(game.runtimeNode(modelId(prefix, v.key)))
          .toJSON() as AuraSceneNode as NodeInput);
      }
      return nodes;
    },
    resolve(app: RigNodeResolver, prefix) {
      const base = resolveAthleteRig(app, prefix);
      if (!enabled) return base;
      const racketOnly = Object.fromEntries(Object.entries(base).map(([k, h]) => [k, RACKET_PARTS.has(k as keyof AthleteRigHandles) ? h : inert(h)])) as unknown as AthleteRigHandles;
      const models = ATHLETE_VARIANTS[prefix].map((variant) => ({ variant, handle: app.nodes.require(modelId(prefix, variant.key)), k: athleteNodeScale(variant.key), humanoid: athleteHumanoid(variant.key) }));
      for (const m of models) m.handle.setVisible(false);
      return { base, racketOnly, models, mode: null, active: null, motion: createAthleteMotionState(), lastNow: null } satisfies IdolAthleteHandles;
    },
    update(handles, actor: Readonly<ActorState>, pose: PoseResult, ctx) {
      const cache = ctx.isPlayer ? caches.player : caches.rival;
      if (!enabled || !("models" in handles)) {
        updateAthleteRig(handles as AthleteRigHandles, actor, pose, ctx.isPlayer, ctx.isMoon, cache, resolveAppearance);
        return;
      }
      // The Moon keeps the procedural Apollo athletes (helmet and pack are rig parts).
      const mode = ctx.isMoon ? "procedural" : "idol";
      if (mode !== handles.mode) {
        handles.mode = mode;
        if (mode === "idol") {
          for (const [key, h] of Object.entries(handles.base)) if (!RACKET_PARTS.has(key as keyof AthleteRigHandles)) h.setScale(HIDDEN).setVisible(false);
        } else {
          for (const m of handles.models) m.handle.setVisible(false);
          handles.active = null;
          cache.lastKey = "";
        }
      }
      if (mode === "procedural") {
        updateAthleteRig(handles.base, actor, pose, ctx.isPlayer, ctx.isMoon, cache, resolveAppearance);
        return;
      }
      const look = resolveAppearance(actor?.appearance, ctx.isPlayer ? "player" : "ai") ?? {};
      const variant = pickAthleteVariant(handles.models.map((m) => m.variant), look);
      const active = handles.models.find((m) => m.variant.key === variant.key)!;
      if (handles.active !== variant.key) {
        for (const m of handles.models) m.handle.setVisible(m === active);
        handles.active = variant.key;
      }
      const rootPos: V3 = [(actor?.x ?? 0) * COURT_X, 0, (actor?.y ?? (ctx.isPlayer ? 0.86 : -0.86)) * COURT_Z];
      const baseYaw = (actor?.end ?? (ctx.isPlayer ? 1 : -1)) > 0 ? 0 : Math.PI;
      const yaw = baseYaw + (pose.torsoYaw ?? 0) * 0.45;
      const solved = solveAthletePose(active.humanoid, active.k, pose);
      // text-to-motion clips (stance, footwork, strokes, serve, celebration) with the racket grip pinned to the solve during
      // strokes (view/idolMotion.ts); a body the shared driver cannot map keeps the procedural solve
      const now = typeof performance !== "undefined" ? performance.now() / 1000 : 0;
      const dt = handles.lastNow === null ? 1 / 60 : Math.max(0, Math.min(0.1, now - handles.lastNow));
      handles.lastNow = now;
      const driver = athleteDriver(variant.key);
      let bones: unknown = solved.bones;
      let palm: V3 = solved.palmRModel;
      if (driver) {
        const frame = athleteMotionFrame(handles.motion, driver, { actor: actor as MotionActor, pose, dt, gripModel: solved.palmRModel, k: active.k, serve: (ctx as { state?: ServeClock }).state });
        bones = driver.pose(frame.input).bones;
        palm = driver.palmPoints(frame.input).right;
      }
      active.handle
        .setPosition(rootPos[0], rootPos[1], rootPos[2])
        .setRotation(0, yaw + Math.PI, 0)
        .setScale([active.k, active.k, active.k])
        .setAnimationPose({ bones, morphTargets: {} } as never);
      // the racket (and the hidden-by-default shadow disc) from the procedural rig, seated on the drawn palm
      updateAthleteRig(handles.racketOnly, actor, { ...pose, right: toPose(palm, active.k) }, ctx.isPlayer, ctx.isMoon, cache, resolveAppearance);
    }
  };
}

/** For tests and tools: the model-space translation of a pose-local point (exported helpers). */
export const idolAthleteFrames = { toModel, toPose, vAdd };
