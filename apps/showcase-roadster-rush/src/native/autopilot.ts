/**
 * Apex Overdrive autoplay pilot (`?autoplay=1`): reads the live sim (player, traffic, sky cars, gantries) and drives it
 * only through `triggerAction`, the game's normal input path, ~10 times a second. Extracted from main.ts so
 * tests/unit/roadster-rush-native/autopilot.test.ts can run it against the headless sim.
 *
 * It drives like a careful human with good look-ahead (owner QA Nov 19: the old rule-based pilot crashed every
 * 30-60 s): every tick it predicts ~2 s ahead for a few dozen candidate manoeuvres (hold the lane, change lanes now or a
 * beat later, one or two lanes, hop, thrust over, dive, barrel roll through) using a scratch copy of the real `Player`
 * flight model against the predicted motion of every road vehicle (incl. lane changers and brakers), every sky-lane
 * roadster and every overhead gantry sign, scores each by "no crash" first, then no scrapes, safety margin, time-to-
 * collision in the lane it ends in, air left and a little showmanship (ramp launches, pickups), and plays the first
 * input of the best one. The prediction never touches the live sim, so normal play and replays are unchanged.
 */
import { clamp, clamp01, lerp, smoothstep01 } from "./math";
import { PLAYER_BOX, emptyInput, laneX, type InputFrame } from "./constants";
import { GANTRY_HALF_WIDTH, SIGN_BAND } from "./world";
import { Player } from "./player";
import { SKY_SPEED_MAX, SKY_SPEED_MIN, SUPPORT_TOLERANCE } from "./traffic";

export interface FreewayAutopilotState {
  lastTickMs: number;
  lastStuntMs: number;
  gameOverSinceMs: number;
  /** Planning ticks run and prediction steps simulated (the CPU budget the tests hold the planner to). */
  stats?: { ticks: number; steps: number };
}

/** Prediction step (s) and horizon (steps): 2 s ahead at the sim's own 60 Hz (a 30 Hz forecast drifted enough to miss wrecks). */
const PDT = 1 / 60;
const STEPS = 120;
const VEHICLE_ACCEL = 6;
const VEHICLE_DECEL = 14;

interface Plan {
  /** Lane-change edges: [time s, dir]. */
  lat: readonly (readonly [number, number])[];
  /** Barrel roll edge: [time s, dir]. */
  roll?: readonly [number, number];
  /** Thrust held over [start, end) s; a grounded start is a hop. */
  thrust?: readonly [number, number];
  /** Dive held over [start, end) s. */
  dive?: readonly [number, number];
  /** Boost held for the first `boost` s. */
  boost?: number;
}

interface PlanResult {
  cost: number;
  /** The safety part of `cost` (crash, scrape, margins, time-to-collision, gantry exposure); 0 = nothing to worry about. */
  risk: number;
  crashStep: number;
}

const LATERAL: readonly (readonly (readonly [number, number])[])[] = [
  [],
  [[0, -1]],
  [[0, 1]],
  [[0.3, -1]],
  [[0.3, 1]],
  [[0.65, -1]],
  [[0.65, 1]],
  [[0, -1], [0.3, -1]],
  [[0, 1], [0.3, 1]]
];
const GROUND_VERTICAL: readonly Partial<Plan>[] = [{}, { thrust: [0, 0.05] }, { thrust: [0, 0.6] }, { thrust: [0.3, 0.35] }, { thrust: [0.3, 0.9] }];
const AIR_VERTICAL: readonly Partial<Plan>[] = [{}, { thrust: [0, 0.35] }, { thrust: [0, 1] }, { dive: [0, 0.25] }, { dive: [0, 2] }, { dive: [0.4, 2] }];
const ROLLS: readonly Plan[] = [0, 0.25, 0.5].flatMap((t) => [
  { lat: [], roll: [t, -1] as const },
  { lat: [], roll: [t, 1] as const }
]);

/** Every lateral x vertical combination, indexed [lateral][vertical]. */
function combos(vertical: readonly Partial<Plan>[]): Plan[][] {
  return LATERAL.map((lat) => vertical.map((v) => ({ lat, ...v })));
}
const GROUND_COMBOS = combos(GROUND_VERTICAL);
const AIR_COMBOS = combos(AIR_VERTICAL);
/** Lateral indices of the cheap first pass: hold the lane, or change one / two lanes now. */
const QUICK_LATERAL = [0, 1, 2, 7, 8];
/** Below this risk the first pass is good enough and the wider search is skipped (most ticks on an open road). */
const QUICK_OK_RISK = 15;

/** Copies every own data field of `src` into `dst` (same class), recursing into nested plain objects / vectors. */
function copyFields(dst: any, src: any, depth = 0): void {
  for (const key of Object.keys(src)) {
    const value = src[key];
    if (typeof value === "function") continue;
    if (value && typeof value === "object") {
      if (depth < 3 && dst[key] && typeof dst[key] === "object") copyFields(dst[key], value, depth + 1);
    } else dst[key] = value;
  }
}

interface VehPath {
  w: number;
  h: number;
  l: number;
  roof: number;
  ramp: { length: number; height: number } | null;
  x: Float64Array;
  z: Float64Array;
}
interface SkyPath {
  w: number;
  h: number;
  l: number;
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
}
interface PickPath {
  kind: string;
  x: number;
  y: number;
  z0: number;
  vz: number;
}

function surfaceAt(v: VehPath, zc: number, z0: number): number {
  if (!v.ramp) return v.roof;
  const onRamp = zc + v.l / 2 - Math.max(z0, zc - v.l / 2);
  return onRamp >= v.ramp.length ? v.roof : (v.ramp.height * Math.max(0, onRamp)) / v.ramp.length;
}

/** Predicted world for one planning tick: vehicle, sky-car and pickup positions per prediction step. */
class Forecast {
  veh: VehPath[] = [];
  sky: SkyPath[] = [];
  picks: PickPath[] = [];
  gantries: number[] = [];
  /** Per prediction step, the indices of the vehicles that can touch the car then (shared by every plan). */
  active: number[][] = Array.from({ length: STEPS + 1 }, () => []);
  /** Same for pickups and sky roadsters. */
  activePicks: number[][] = Array.from({ length: STEPS + 1 }, () => []);
  activeSky: number[][] = Array.from({ length: STEPS + 1 }, () => []);

  build(g: any, p: any): void {
    const traffic = g.traffic ?? {};
    const pz = Number(p.position.z);
    const pspeed = Math.max(18, Number(p.speed) || 26);
    const laneSpeed: ArrayLike<number> = traffic._laneSpeed ?? [0, 0, 0, 0, 0];
    const reach = pspeed * 1.35 * STEPS * PDT + 60;
    this.veh.length = 0;
    for (const v of (traffic.vehicles ?? []) as any[]) {
      const dz = pz - Number(v.z);
      if (dz < -30 || dz > reach) continue;
      const path: VehPath = { w: +v.w, h: +v.h, l: +v.l, roof: +v.roof, ramp: v.ramp ?? null, x: new Float64Array(STEPS + 1), z: new Float64Array(STEPS + 1) };
      const target = Math.max(0, Number(laneSpeed[v.flowLane] ?? v.spd) + Number(v.dv || 0));
      let spd = Number(v.spd) || 0;
      let z = Number(v.z);
      const ch = v.changer;
      for (let k = 0; k <= STEPS; k++) {
        const t = k * PDT;
        if (k > 0) {
          spd = target > spd ? Math.min(target, spd + VEHICLE_ACCEL * PDT) : Math.max(target, spd - VEHICLE_DECEL * PDT);
          z -= spd * PDT;
        }
        let x = Number(v.x);
        if (ch && ch.state === 1) {
          const start = Math.max(0, ch.blink - ch.t);
          x = t < start ? x : lerp(laneX(v.lane), laneX(ch.to), smoothstep01(Math.min(1, (t - start) / ch.dur)));
        } else if (ch && ch.state === 2) x = lerp(laneX(ch.from), laneX(ch.to), smoothstep01(Math.min(1, (ch.t + t) / ch.dur)));
        path.x[k] = x;
        path.z[k] = z;
      }
      this.veh.push(path);
    }
    // the car's z at step k lies between a stumble-slowed and a boosted/rocket run from here
    for (let k = 0; k <= STEPS; k++) {
      const list = this.active[k]!;
      list.length = 0;
      const t = k * PDT;
      const zHi = pz - pspeed * 0.6 * t + PLAYER_BOX.l / 2 + 4;
      const zLo = pz - pspeed * 1.6 * t - PLAYER_BOX.l / 2 - 4;
      for (let i = 0; i < this.veh.length; i++) {
        const v = this.veh[i]!;
        const vz = v.z[k]!;
        if (vz - v.l / 2 < zHi && vz + v.l / 2 > zLo) list.push(i);
      }
    }

    this.sky.length = 0;
    const skySpeed = lerp(SKY_SPEED_MIN, SKY_SPEED_MAX, clamp01(Number(traffic.difficulty) || 0));
    const time = Number(traffic.time) || 0;
    const gz: number[] = ((g.world?.gantries ?? []) as any[]).map((q) => Number(q?.position?.z ?? 1e9)).filter((z) => z < 1e4);
    this.gantries = gz;
    for (const s of (traffic.skyCars ?? []) as any[]) {
      const dz = pz - Number(s.z);
      if (dz < -30 || dz > (pspeed + skySpeed) * STEPS * PDT + 40) continue;
      const path: SkyPath = { w: +s.w, h: +s.h, l: +s.l, x: new Float64Array(STEPS + 1), y: new Float64Array(STEPS + 1), z: new Float64Array(STEPS + 1) };
      const vz = s.dir > 0 ? (s.vz > 0 ? s.vz : skySpeed) : -12;
      for (let k = 0; k <= STEPS; k++) {
        const t = k * PDT;
        const T = time + t;
        const z = Number(s.z) + vz * t;
        const x = s.amp > 0 ? clamp(s.bx + s.amp * Math.sin(s.wp + T * s.wf), laneX(0), laneX(4)) : Number(s.x);
        let ty = Number(s.baseY);
        if (s.mode === 2) ty = lerp(s.yLo, s.yHi, smoothstep01(clamp((pz - pspeed * t - z - s.diveEnd) / s.diveLen, 0, 1)));
        ty += Math.sin(T * 1.7 + s.phase) * 0.18;
        if (ty < 6) ty = Math.max(ty, Math.min(Number(s.y), 6));
        if (ty > 5.6 && ty < 11.4) {
          for (const gzz of gz) {
            const d = Math.abs(z - gzz);
            if (d < 14) {
              const kk = smoothstep01(1 - d / 14);
              ty = ty < 7.8 ? lerp(ty, 5.4, kk) : lerp(ty, 11.5, kk);
            }
          }
        }
        path.x[k] = k === 0 ? Number(s.x) : x;
        path.y[k] = k === 0 ? Number(s.y) : Math.min(ty, 22.8);
        path.z[k] = z;
      }
      this.sky.push(path);
    }

    this.picks.length = 0;
    for (const q of (traffic.pickups ?? []) as any[]) {
      if (q.magnet) continue;
      const dz = pz - Number(q.z);
      if (dz < -5 || dz > reach) continue;
      const vz = q.anchor ? Number(q.anchor.spd) || 0 : q.flowLane >= 0 ? Number(laneSpeed[q.flowLane]) || 0 : 0;
      this.picks.push({ kind: String(q.kind), x: +q.x, y: +q.y, z0: +q.z, vz });
    }
    for (let k = 0; k <= STEPS; k++) {
      const t = k * PDT;
      const zHi = pz - pspeed * 0.6 * t + PLAYER_BOX.l / 2 + 6;
      const zLo = pz - pspeed * 1.6 * t - PLAYER_BOX.l / 2 - 6;
      const picks = this.activePicks[k]!;
      picks.length = 0;
      for (let i = 0; i < this.picks.length; i++) {
        const q = this.picks[i]!;
        const qz = q.z0 - q.vz * t;
        if (qz < zHi && qz > zLo) picks.push(i);
      }
      const sky = this.activeSky[k]!;
      sky.length = 0;
      for (let i = 0; i < this.sky.length; i++) {
        const sz = this.sky[i]!.z[k]!;
        if (sz < zHi + 8 && sz > zLo - 8) sky.push(i);
      }
    }
  }
}

/** Plays one candidate plan forward on a scratch Player against the forecast and returns its cost (lower is better). */
class Planner {
  private sp = new Player();
  private frame: InputFrame = emptyInput();
  private scrapeUntil: number[] = [];
  private close: Uint8Array = new Uint8Array(64);
  private got: Uint8Array = new Uint8Array(64);
  private events: string[] = [];
  readonly fc = new Forecast();
  boostUntilMs = 0;
  steps = 0;

  constructor() {
    // the scratch car only needs the flight model: its pose, plume and speed-line easing are presentation-only
    // (they write render-facing fields the sim never reads back), so they are skipped to keep a tick ~1-2 ms
    const scratch = this.sp as any;
    scratch.syncPose = scratch.drivePlumes = scratch.driveSpeedLines = () => {};
  }

  private readonly record = (name: string): void => {
    this.events.push(name);
  };

  evaluate(src: any, difficulty: number, plan: Plan): PlanResult {
    const sp = this.sp;
    copyFields(sp, src);
    sp.onEvent = this.record;
    this.events.length = 0;
    const fc = this.fc;
    const nv = fc.veh.length;
    this.scrapeUntil.length = nv;
    this.scrapeUntil.fill(-1);
    if (this.close.length < nv) this.close = new Uint8Array(nv * 2);
    this.close.fill(0);
    if (this.got.length < fc.picks.length) this.got = new Uint8Array(fc.picks.length * 2);
    this.got.fill(0);
    const air0 = sp.air;
    let idx = 0;
    const env = {
      difficulty,
      supportHeight: (x: number, z: number, y: number): number => {
        const half = PLAYER_BOX.l / 2;
        const z0 = z - half;
        const z1 = z + half;
        const reach = y + SUPPORT_TOLERANCE;
        let best = 0;
        for (const i of fc.active[idx]!) {
          const v = fc.veh[i]!;
          const vz = v.z[idx]!;
          if (Math.abs(v.x[idx]! - x) > v.w / 2 + 0.35 || vz - v.l / 2 >= z1 || vz + v.l / 2 <= z0) continue;
          const h = surfaceAt(v, vz, z0);
          if (h <= reach && h > best) best = h;
        }
        return best;
      }
    };
    let cost = 0;
    let risk = 0;
    let scrapes = 0;
    let bonus = 0;
    const f = this.frame;
    const edgeStep = (t: number): number => Math.round(t / PDT);
    for (let k = 1; k <= STEPS; k++) {
      const t = (k - 1) * PDT;
      const s = k - 1;
      f.left = f.right = f.rollLeft = f.rollRight = f.thrustPressed = false;
      for (let j = 0; j < plan.lat.length; j++) if (edgeStep(plan.lat[j]![0]) === s) plan.lat[j]![1] < 0 ? (f.left = true) : (f.right = true);
      if (plan.roll && edgeStep(plan.roll[0]) === s) plan.roll[1] < 0 ? (f.rollLeft = true) : (f.rollRight = true);
      f.thrust = !!plan.thrust && t >= plan.thrust[0] - 1e-6 && t < plan.thrust[1];
      f.thrustPressed = !!plan.thrust && edgeStep(plan.thrust[0]) === s;
      f.dive = !!plan.dive && t >= plan.dive[0] - 1e-6 && t < plan.dive[1];
      f.boost = !!plan.boost && t < plan.boost;
      idx = k - 1;
      sp.update(PDT, f, env);
      this.steps++;
      idx = k;
      // ---- collisions (mirrors Traffic.checkCollisions / FreewayWorld.checkCollisions) ----
      const b = sp.bounds();
      const inv = sp.invulnerable;
      const px = sp.position.x;
      const changing = sp.lane !== sp.targetLane || Math.abs(px - laneX(sp.targetLane)) > 0.35;
      const steerDir = Math.sign(laneX(sp.targetLane) - px) || 0;
      let crashed = false;
      for (const i of fc.active[k]!) {
        const v = fc.veh[i]!;
        const vz = v.z[k]!;
        const vx = v.x[k]!;
        const zFront = vz - v.l / 2;
        const zBack = vz + v.l / 2;
        const xLeft = vx - v.w / 2;
        const xRight = vx + v.w / 2;
        const top = surfaceAt(v, vz, b.minZ);
        // safety margin: a box ~1.5 m longer / 0.25 m wider than the real one
        if (!this.close[i] && b.minZ < zBack + 1.5 && b.maxZ > zFront - 1.5 && b.minX < xRight + 0.25 && b.maxX > xLeft - 0.25 && b.minY < top - 0.2) this.close[i] = 1;
        if (!(b.minZ < zBack && b.maxZ > zFront)) continue;
        if (!(b.minX < xRight && b.maxX > xLeft) || b.minY >= top - SUPPORT_TOLERANCE) continue;
        if (this.scrapeUntil[i]! > k) continue;
        const side = Math.min(b.maxX - xLeft, xRight - b.minX);
        const depth = Math.min(b.maxZ - zFront, zBack - b.minZ);
        if ((changing && side < depth) || (side < 0.6 && depth > 1.2)) {
          const vLane = clamp(Math.round(vx / 3.6 + 2), 0, 4);
          let from = sp.lane;
          if (changing && (sp.lane === vLane || sp.lane === sp.targetLane)) from = sp.prevLane != null && sp.prevLane !== vLane ? sp.prevLane : clamp(vLane - steerDir, 0, 4);
          if (from === vLane) from = clamp(vLane - (steerDir || 1), 0, 4);
          this.scrapeUntil[i] = k + Math.round(0.6 / PDT);
          if (!inv) {
            sp.scrape(from);
            scrapes++;
          }
        } else if (!inv) {
          crashed = true;
          break;
        }
      }
      if (!crashed && !(sp.grounded && (sp.supportY || 0) < 0.5)) {
        const sweep = sp.speed * PDT * 0.65;
        for (const si of fc.activeSky[k]!) {
          const s = fc.sky[si]!;
          const sz = s.z[k]!, pz0 = s.z[k - 1]!;
          const zLo = Math.min(sz, pz0) - s.l / 2 - 0.35;
          const zHi = Math.max(sz, pz0) + s.l / 2 + 0.35 + sweep;
          if (!(b.minZ < zHi && b.maxZ > zLo)) continue;
          const sx = s.x[k]!, px0 = s.x[k - 1]!, sy = s.y[k]!, py0 = s.y[k - 1]!;
          const xLo = Math.min(sx, px0) - s.w * 0.54;
          const xHi = Math.max(sx, px0) + s.w * 0.54;
          const yLo = Math.min(sy, py0) - 0.85;
          const yHi = Math.max(sy, py0) + s.h + 1.15;
          if (b.minX < xHi + 0.3 && b.maxX > xLo - 0.3 && b.minY < yHi + 0.4 && b.maxY > yLo - 0.4) {
            if (b.minX < xHi && b.maxX > xLo && b.minY < yHi && b.maxY > yLo && !inv) {
              crashed = true;
              break;
            }
            risk += 6; // skimming a sky roadster: keep a margin
          }
        }
      }
      if (!crashed && b.maxY >= 5.1 && Math.abs(px) <= GANTRY_HALF_WIDTH) {
        const sweep = sp.speed * PDT * 0.7;
        for (const gz of fc.gantries) {
          if (b.minZ > gz + 0.65 + sweep || b.maxZ < gz - 1.15) continue;
          if (b.maxY > SIGN_BAND.minY - 0.35 && b.minY < SIGN_BAND.maxY + 0.35) {
            if (!inv && b.maxY > SIGN_BAND.minY && b.minY < SIGN_BAND.maxY) {
              crashed = true;
              break;
            }
            risk += 40; // grazing the sign band
          }
        }
      }
      if (crashed) return { cost: 10000 - k * 80 + scrapes * 300, risk: 10000, crashStep: k };
      const tt = k * PDT;
      for (const i of fc.activePicks[k]!) {
        if (this.got[i]) continue;
        const q = fc.picks[i]!;
        const r = q.kind === "bolt" ? 0.85 : 1.05;
        const qz = q.z0 - q.vz * tt;
        if (qz < b.minZ - r || qz > b.maxZ + r || q.x < b.minX - r || q.x > b.maxX + r || q.y < b.minY - r || q.y > b.maxY + r) continue;
        this.got[i] = 1;
        bonus += q.kind === "bolt" ? 1.2 : q.kind === "air" ? Math.max(2, (100 - sp.air) * 0.25) : 18;
      }
    }

    // ---- end-state: how good a place is this to be in ~2 s ----
    risk += scrapes * 300;
    for (let i = 0; i < nv; i++) if (this.close[i]) risk += 25;
    const lane = sp.targetLane;
    const pzEnd = sp.position.z;
    const yEnd = sp.position.y;
    if (yEnd < 3.5 && !sp.invulnerable) {
      // time-to-collision with whatever is ahead in the lane the car ends up in
      let ttc = 99;
      for (const v of fc.veh) {
        if (Math.abs(v.x[STEPS]! - laneX(lane)) > 1.9) continue;
        if (yEnd >= surfaceAt(v, v.z[STEPS]!, pzEnd - PLAYER_BOX.l / 2) - SUPPORT_TOLERANCE && sp.grounded && sp.supportY > 0.5) continue;
        const gap = pzEnd - PLAYER_BOX.l / 2 - (v.z[STEPS]! + v.l / 2);
        if (gap < -1) continue;
        const vspd = (v.z[STEPS - 1]! - v.z[STEPS]!) / PDT;
        const closing = sp.speed - vspd;
        if (closing <= 0.5) continue;
        ttc = Math.min(ttc, Math.max(0, gap) / closing);
      }
      if (ttc < 2.6) {
        // under ~1.2 s it is a hazard; further out it is just the lane to prefer
        risk += Math.max(0, 1.2 - ttc) * 45;
        cost += (2.6 - Math.max(1.2, ttc)) * 45;
      }
    }
    // airborne at the horizon: a sign gantry coming up while inside its band is a crash waiting to happen
    const speedEnd = Math.max(20, sp.speed);
    if (!sp.grounded && yEnd + PLAYER_BOX.h > SIGN_BAND.minY - 0.8 && yEnd < SIGN_BAND.maxY + 0.6) {
      for (const gz of fc.gantries) {
        const ahead = pzEnd - gz;
        if (ahead > -1 && ahead < speedEnd * 1.4) risk += 200 + 300 * (1 - Math.max(0, ahead) / (speedEnd * 1.4));
      }
    }
    cost += Math.max(0, 100 - sp.air) * 0.12 + (air0 - sp.air > 0 ? (air0 - sp.air) * 0.15 : 0);
    cost += Math.min(12, yEnd) * 0.8 + Math.abs(lane - 2) * 0.8 + plan.lat.length * 1.5 + (plan.roll ? 14 : 0);
    if (this.events.includes("rampLaunch")) bonus += 16;
    return { cost: cost + risk - bonus, risk, crashStep: -1 };
  }
}

/** A stateful autopilot tick: call every rendered frame with the wall-clock (or simulated) time in ms. */
export function createFreewayAutopilot(st: FreewayAutopilotState = { lastTickMs: 0, lastStuntMs: 0, gameOverSinceMs: 0 }) {
  const planner = new Planner();
  return function tick(g: any, now: number): void {
    if (!g) return;

    // Auto-recover from Wrecked / Game Over screen if autopilot is active
    if (g.mode === "gameover") {
      if (st.gameOverSinceMs === 0) {
        st.gameOverSinceMs = now;
      } else if (now - st.gameOverSinceMs > 3000) {
        // autoplay standard (Nov 18): the Wrecked card stays up ~3 s before the next run
        st.gameOverSinceMs = 0;
        g.start?.();
      }
      return;
    }
    st.gameOverSinceMs = 0;

    if (g.mode !== "playing" || g.paused || g.activePreset) return;
    // an autopiloted run is an assisted run: it cannot set the saved best (audit RR-7)
    g.markAssisted?.();
    if (now - st.lastTickMs < 95) return;
    st.lastTickMs = now;

    const p = g.player;
    if (!p || p.alive === false || !p.position) return;
    const before = planner.steps;
    const plan = choosePlan(planner, g, p, now, st);
    if (st.stats) {
      st.stats.ticks++;
      st.stats.steps += planner.steps - before;
    }
    if (plan) execute(g, p, plan);
  };
}

/**
 * Coarse-to-fine search (keeps a tick to a few ms): (1) lane-only plans now; if one is safe, done. (2) the rest of the
 * lane-only plans, every vertical-only plan and the barrel rolls. (3) the best few lateral moves combined with the best
 * few vertical moves.
 */
function choosePlan(planner: Planner, g: any, p: any, now: number, st: FreewayAutopilotState): Plan | null {
  const difficulty = Number(g.env?.difficulty ?? 0) || 0;
  planner.fc.build(g, p);
  // a showcase boost already under way keeps running for the time it was checked safe for
  const boostLeft = Math.max(0, (planner.boostUntilMs - now) / 1000);
  const table = p.grounded ? GROUND_COMBOS : AIR_COMBOS;
  let best: Plan | null = null;
  let bestCost = Infinity;
  let bestRisk = Infinity;
  const latCost: number[] = LATERAL.map(() => Infinity);
  const vertCost: number[] = table[0]!.map(() => Infinity);
  const run = (base: Plan): number => {
    const plan = boostLeft > 0.05 ? { ...base, boost: boostLeft } : base;
    const r = planner.evaluate(p, difficulty, plan);
    if (r.cost < bestCost) {
      bestCost = r.cost;
      bestRisk = r.risk;
      best = plan;
    }
    return r.cost;
  };
  for (const li of QUICK_LATERAL) latCost[li] = run(table[li]![0]!);
  vertCost[0] = latCost[0]!;
  if (bestRisk < QUICK_OK_RISK) return withShowcaseBoost(planner, g, p, now, st, best, bestCost, difficulty, boostLeft);
  for (let li = 0; li < LATERAL.length; li++) if (latCost[li] === Infinity) latCost[li] = run(table[li]![0]!);
  for (let vi = 1; vi < vertCost.length; vi++) vertCost[vi] = run(table[0]![vi]!);
  for (const roll of ROLLS) run(roll);
  const topLat = rankIndices(latCost, 3, 0);
  const topVert = rankIndices(vertCost, 2, 0);
  for (const li of topLat) for (const vi of topVert) run(table[li]![vi]!);
  return withShowcaseBoost(planner, g, p, now, st, best, bestCost, difficulty, boostLeft);
}

/** Indices of the `n` lowest costs, skipping `skip` (the "do nothing" entry, already covered on the other axis). */
function rankIndices(costs: readonly number[], n: number, skip: number): number[] {
  return costs
    .map((c, i) => [c, i] as const)
    .filter(([, i]) => i !== skip)
    .sort((x, y) => x[0] - y[0])
    .slice(0, n)
    .map(([, i]) => i);
}

/** Showcase overdrive: a boost burst now and then, only when the predicted boosted run is as safe as the best plan. */
function withShowcaseBoost(planner: Planner, _g: any, p: any, now: number, st: FreewayAutopilotState, best: Plan | null, bestCost: number, difficulty: number, boostLeft: number): Plan | null {
  if (best && boostLeft <= 0.05 && p.grounded && Number(p.air) > 85 && now - st.lastStuntMs > 5600) {
    const boosted: Plan = { ...best, boost: 1.1 };
    if (planner.evaluate(p, difficulty, boosted).cost <= bestCost + 4) {
      st.lastStuntMs = now;
      planner.boostUntilMs = now + 1100;
      return boosted;
    }
  }
  return best;
}

/** Plays the t=0 inputs of `plan` through the game's harness input path and releases anything the plan doesn't hold. */
function execute(g: any, p: any, plan: Plan): void {
  const held = g.harness?.held ?? {};
  for (const [t, dir] of plan.lat) if (t === 0) g.triggerAction?.(dir < 0 ? "left" : "right");
  if (plan.roll && plan.roll[0] === 0) g.triggerAction?.(plan.roll[1] < 0 ? "rollLeft" : "rollRight");
  if (plan.thrust && plan.thrust[0] === 0) {
    if (p.grounded && plan.thrust[1] <= 0.06) g.triggerAction?.("hop", { frames: 3 });
    else g.triggerAction?.("thrustHold", { duration: plan.thrust[1] });
  } else if (Number(held.thrust) > 0) g.triggerAction?.("thrustRelease");
  if (plan.dive && plan.dive[0] === 0) g.triggerAction?.("dive", { duration: Math.min(plan.dive[1], 0.6) });
  else if (Number(held.dive) > 0) g.triggerAction?.("dive", { duration: 0 });
  if (plan.boost) g.triggerAction?.("boost", { duration: plan.boost });
  else if (Number(held.boost) > 0) g.triggerAction?.("boost", { on: false });
}
