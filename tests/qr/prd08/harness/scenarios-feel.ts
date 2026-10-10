/**
 * PRD-08 harness scenarios, part 1 — hit-stop (S5), shake (S7), feel
 * accounting (S10). Each scenario drives the mounted app ONLY through its
 * public C-22/C-23 surface (`app.camera`, `app.feel`, `app.time`) plus the
 * scripted clock, and returns plain JSON. The page runs them in-browser
 * (`window.__AURA3D_PRD08_HARNESS__.run(name, opts)`); the unit mirror runs the
 * same code headless. Assertions live in the specs, not here.
 */
import type { AuraApp } from "@aura3d/engine";
import type { FrameRecord, HarnessPipeline, Vec3 } from "./pipeline";

export interface ScenarioContext {
  readonly app: AuraApp;
  readonly pipeline: HarnessPipeline;
}

interface Pose {
  readonly position: readonly number[];
  readonly target: readonly number[];
  readonly up: readonly number[];
  readonly roll: number;
  readonly fov: number;
}
interface CameraApi {
  presented(): Pose;
  addLayer(l: { id: string; apply(p: Pose, ctx: { dt: number }): Pose }, order?: number): () => void;
  shake: { add(n: number): void; configure(o: Record<string, number>): void };
  evidence(): { viewProjection: readonly number[]; layers: readonly { id: string; energy: number }[] };
  use(rig: unknown): void;
  rigs: Record<string, (o: unknown) => unknown>;
}
interface FeelApi {
  preset(name: string): void;
  define(event: string, spec: Record<string, unknown>): void;
  emit(event: string, at?: { actors?: readonly string[] }): void;
  evidence(): { emitted: number; executed: Readonly<Record<string, number>> };
}
interface TimeApi {
  hitStop(seconds: number, o?: { scope?: "global" | readonly string[] }): void;
}

export const cam = (app: AuraApp) => (app as unknown as { camera: CameraApi }).camera;
export const feel = (app: AuraApp) => (app as unknown as { feel: FeelApi }).feel;
export const time = (app: AuraApp) => (app as unknown as { time: TimeApi }).time;

export function pump(p: HarnessPipeline, dtMs: number, n: number): void {
  if (!p.tick) throw new Error("scenario needs the scripted clock (?scripted=1)");
  for (let i = 0; i < n; i += 1) p.tick(dtMs);
}
export const drain = (p: HarnessPipeline): FrameRecord[] => p.records.splice(0, p.records.length);
export const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/**
 * World-space view forward from a column-major perspective VP: the
 * projection's w-row is [0,0,−1,0], so VP row 3 = −(view row 2) = −zaxis =
 * forward (lookAt's zaxis points from target to eye).
 */
export function vpForward(vp: readonly number[]): Vec3 {
  const f: Vec3 = [vp[3]!, vp[7]!, vp[11]!];
  const l = Math.hypot(f[0], f[1], f[2]);
  return [f[0] / l, f[1] / l, f[2] / l];
}
const yawOf = (f: readonly number[]) => Math.atan2(f[0]!, f[2]!);
const pitchOf = (f: readonly number[]) => Math.asin(Math.max(-1, Math.min(1, f[1]!)));
const dirOf = (p: Pose): Vec3 => {
  const d: Vec3 = [p.target[0]! - p.position[0]!, p.target[1]! - p.position[1]!, p.target[2]! - p.position[2]!];
  const l = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / l, d[1] / l, d[2] / l];
};
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** S5 global: `app.time.hitStop(s)` stalls sim time while frames keep presenting. */
export function hitStopGlobal({ pipeline: p, app }: ScenarioContext, o: { seconds: number }) {
  pump(p, 1000 / 60, 12);
  drain(p);
  time(app).hitStop(o.seconds);
  pump(p, 1000 / 60, 30);
  const r = drain(p);
  return {
    frames: r.length,
    simTime: r.map((x) => x.simTime),
    positions: r.map((x) => x.positions),
    layerEnergy: r.map((x) => x.layerEnergy)
  };
}

/**
 * S5 scoped (fighters scene): warm up 0.3 s, then `feel.emit("hit-heavy",
 * {actors:[a,b]})` (fighting preset → 0.07 s scoped stop + shake). Per frame:
 * displacement of each node from the first post-hit frame, and layer energy.
 */
export function hitStopScoped({ pipeline: p, app }: ScenarioContext, o: { event: string; actors?: readonly string[]; frames: number }) {
  const f = feel(app);
  f.preset("fighting");
  pump(p, 1000 / 60, 18); // 0.3 s = fixture hit.at
  const pre = drain(p).at(-1)!;
  if (o.actors) f.emit(o.event, { actors: o.actors });
  else f.emit(o.event);
  pump(p, 1000 / 60, o.frames);
  const r = drain(p);
  const ref = r[0]!.positions;
  return {
    nodeIds: p.nodeIds,
    preSimTime: pre.simTime,
    simTime: r.map((x) => x.simTime),
    displacement: r.map((x) => x.positions.map((q, i) => dist(q, ref[i]!))),
    stepFromPrevious: r.map((x, k) => x.positions.map((q, i) => dist(q, (k === 0 ? pre : r[k - 1]!).positions[i]!))),
    layerEnergy: r.map((x) => x.layerEnergy),
    executed: f.evidence().executed
  };
}

/**
 * S7: trauma 1.0 on a static camera. Probe layers just before (order −11)
 * and after (order +100) the built-in trauma layer (−10) capture the rig pose
 * and the trauma output; the presented VP is read back from evidence().
 */
export function shakeImpulse({ pipeline: p, app }: ScenarioContext, o: { frames: number; reducedMotion?: boolean }) {
  const c = cam(app);
  let pre: Pose | undefined;
  let post: Pose | undefined;
  const offPre = c.addLayer({ id: "s7-pre", apply: (pose) => ((pre = pose), pose) }, -11);
  const offPost = c.addLayer({ id: "s7-post", apply: (pose) => ((post = pose), pose) }, 100);
  pump(p, 1000 / 60, 6);
  drain(p);
  c.shake.add(1);
  const out: { t: number; layerYaw: number; layerPitch: number; layerRoll: number; vpYaw: number; vpPitch: number; presentedRoll: number; energy: number }[] = [];
  for (let i = 0; i < o.frames; i += 1) {
    p.tick!(1000 / 60);
    const vp = c.evidence().viewProjection;
    const rigDir = dirOf(pre!);
    const layerDir = dirOf(post!);
    const vf = vpForward(vp);
    out.push({
      t: (i + 1) / 60,
      layerYaw: wrap(yawOf(layerDir) - yawOf(rigDir)),
      layerPitch: pitchOf(layerDir) - pitchOf(rigDir),
      layerRoll: post!.roll - pre!.roll,
      vpYaw: wrap(yawOf(vf) - yawOf(rigDir)),
      vpPitch: pitchOf(vf) - pitchOf(rigDir),
      presentedRoll: c.presented().roll - pre!.roll,
      energy: c.evidence().layers.find((l) => l.id === "trauma")?.energy ?? 0
    });
  }
  offPre();
  offPost();
  return { frames: out, maxYawRad: (1.5 * Math.PI) / 180 };
}

/** S10: feel `executed` accounting for one emit of a fully-specified event. */
export function feelAccounting({ pipeline: p, app }: ScenarioContext) {
  const f = feel(app);
  const before = f.evidence();
  f.define("s10-probe", {
    shake: 0.4,
    punch: { fov: -2, dolly: 0.1 },
    hitStop: { seconds: 0.03 },
    haptics: { strong: 0.5, weak: 0.3, ms: 40 },
    audio: { cue: "s10-probe" },
    screen: { flash: 0.2 }
  });
  f.emit("s10-probe");
  pump(p, 1000 / 60, 3);
  drain(p);
  const after = f.evidence();
  const hasVibrate = typeof navigator !== "undefined" && typeof (navigator as { vibrate?: unknown }).vibrate === "function";
  return { emitted: after.emitted - before.emitted, executed: after.executed, hasVibrate };
}
