/**
 * Player drone of the original HEATSINK: kinematic racer on the track frame (s along, x lateral), spring-damper
 * hover, boost/overdrive meters, heat, crash/respawn. Ported line by line from the captured module's vehicle class
 * (`update(dt, input, active)`), including its quirks (heat clamps at 1.05 and crashes at >= 1; the wall crash needs
 * heading > 0.38 rad at > 45 m/s; respawn drops the drone 30 m back at half speed with heat 0.3).
 * Pure: no rendering, no engine imports beyond the track.
 */
import { CFG } from "./config";
import { clamp, expSmooth, lerp } from "./rng";
import type { Frame, Obstacle, Track } from "./track";

export interface Input {
  throttle: number;
  brake: number;
  steer: number;
  afterburner: boolean;
  ramjet: boolean;
  drift: boolean;
  fire: boolean;
}

export const IDLE: Input = { throttle: 0, brake: 0, steer: 0, afterburner: false, ramjet: false, drift: false, fire: false };

export type PlayerEvent =
  | { type: "crash"; reason: string }
  | { type: "scrape"; side: number; strength: number }
  | { type: "nearmiss"; side: number }
  | { type: "landing"; perfect: boolean }
  | { type: "bottom"; strength: number }
  | { type: "burst" }
  | { type: "roll"; dir: number };

const V = CFG.vehicle;

export class Vehicle {
  readonly f: Partial<Frame> = {};
  readonly events: PlayerEvent[] = [];
  readonly mods = { speed: 1, boost: 1, heat: 1 };
  readonly shieldMax: number = CFG.weapons.shield;
  s = 0;
  x = 0;
  dist = 0;
  theta = 0;
  phi = 0;
  v = 0;
  groundY = 0;
  yW = 0;
  vyW = 0;
  airborne = false;
  airTime = 0;
  steerVal = 0;
  ab = 1;
  abActive = false;
  heat = 0;
  rjActive = false;
  burning = 0;
  drifting = false;
  driftCharge = 0;
  burstT = 0;
  landT = 0;
  hyperT = 0;
  turboT = 0;
  crashed = false;
  crashT = 0;
  crashes = 0;
  invuln = 0;
  pitch = 0;
  lean = 0;
  onLava = false;
  finished = false;
  finishTime = 0;
  cd = { shockwave: 0, mine: 0, roll: 0 };
  rollT = 0;
  rollDir = 1;
  takedowns = 0;
  scrape = 0;
  shield: number = CFG.weapons.shield;
  shieldT = 0;
  gunHeat = 0;
  gunCd = 0;
  gunLocked = false;
  accelSm = 0;
  lane = 0;
  nearCd = 0;
  nearO: Obstacle | null = null;
  ckPrevS: number | undefined = undefined;
  padCd = 0;
  /** world position of the drone model (`updateVisual`), which barrel blasts measure distance from */
  readonly position = { x: 0, y: 0, z: 0 };

  constructor(readonly track: Track) {
    this.reset(track.length - 30, 0);
  }

  reset(s: number, x: number): void {
    const len = this.track.length;
    this.s = s;
    this.x = x;
    this.dist = s > len / 2 ? s - len : s;
    this.theta = 0;
    this.phi = 0;
    this.v = 0;
    const fr = this.track.frame(s, this.f);
    this.groundY = fr.y + this.track.latY(s, this.x);
    this.yW = this.groundY + V.hover;
    this.vyW = 0;
    this.airborne = false;
    this.airTime = 0;
    this.steerVal = 0;
    this.ab = 1;
    this.abActive = false;
    this.heat = 0;
    this.rjActive = false;
    this.burning = 0;
    this.drifting = false;
    this.driftCharge = 0;
    this.burstT = 0;
    this.landT = 0;
    this.hyperT = 0;
    this.crashed = false;
    this.crashT = 0;
    this.crashes = 0;
    this.invuln = 0;
    this.pitch = 0;
    this.lean = 0;
    this.onLava = false;
    this.finished = false;
    this.finishTime = 0;
    this.cd = { shockwave: 0, mine: 0, roll: 0 };
    this.rollT = 0;
    this.rollDir = 1;
    this.takedowns = 0;
    this.scrape = 0;
    this.shield = this.shieldMax;
    this.shieldT = 0;
    this.gunHeat = 0;
    this.gunCd = 0;
    this.gunLocked = false;
    this.accelSm = 0;
  }

  get v01(): number {
    return this.v / V.maxSpeed;
  }

  crash(reason: string): void {
    if (this.crashed || this.invuln > 0) return;
    this.crashed = true;
    this.hyperT = 0;
    this.crashT = V.crashTime;
    this.crashes++;
    this.events.push({ type: "crash", reason });
    this.v = 0;
  }

  respawn(): void {
    const tr = this.track;
    this.s = tr.wrap(this.s - 30);
    this.dist -= 30;
    const fr = tr.frame(this.s, this.f);
    let lateral = 0;
    if (tr.lavaAt(this.s, 0, fr)) lateral = fr.hw * 0.4;
    for (let n = 0; n < 8 && tr.hitObstacle(this.s, lateral, 40, V.halfWidth + 1); n++) lateral = (n % 2 ? -1 : 1) * (4 + n * 3);
    this.x = clamp(lateral, -fr.hw + 4, fr.hw - 4);
    const dv = tr.dividerAt(this.s);
    if (dv > 0 && Math.abs(this.x) < dv + 5) this.x = (this.lane || Math.sign(this.x) || 1) * (dv + 6);
    this.theta = this.phi = 0;
    this.v = V.maxSpeed * 0.5;
    this.groundY = fr.y + tr.latY(this.s, this.x);
    this.yW = this.groundY + V.hover;
    this.vyW = 0;
    this.heat = 0.3;
    this.burning = 0;
    this.crashed = false;
    this.invuln = V.respawnInvuln;
  }

  /** spring-damper hover against the (moving) ground height; returns landing time and bottom-out impact */
  private ground(groundTarget: number, dt: number): { landed: number; impact: number } {
    const rate = (groundTarget - this.groundY) / dt;
    this.groundY = groundTarget;
    const gap = this.yW - groundTarget;
    let acc = -V.gravity;
    if (gap < V.hover + 0.6) acc += V.spring * (V.hover - gap) - V.damping * (this.vyW - rate);
    this.vyW += acc * dt;
    this.yW += this.vyW * dt;
    let impact = 0;
    if (this.yW - groundTarget < 0.35) {
      impact = Math.max(0, rate - this.vyW);
      this.yW = groundTarget + 0.35;
      this.vyW = Math.max(this.vyW, rate);
    }
    const was = this.airborne;
    this.airborne = this.yW - groundTarget > V.hover + 0.9;
    if (this.airborne) this.airTime += dt;
    const landed = was && !this.airborne ? this.airTime : 0;
    if (!this.airborne) this.airTime = 0;
    return { landed, impact };
  }

  update(dt: number, input: Input, active: boolean): void {
    const tr = this.track;
    const fr0 = tr.frame(this.s, this.f);
    this.cd.shockwave = Math.max(0, this.cd.shockwave - dt);
    this.cd.mine = Math.max(0, this.cd.mine - dt);
    this.cd.roll = Math.max(0, this.cd.roll - dt);
    if (this.crashed) {
      this.crashT -= dt;
      if (this.crashT <= 0) this.respawn();
      return;
    }
    this.invuln = Math.max(0, this.invuln - dt);
    const t = active ? input : IDLE;
    this.abActive = t.afterburner && this.ab > 0.02 && active;
    if (this.abActive) this.ab = Math.max(0, this.ab - CFG.afterburner.drain * dt);
    else this.ab = Math.min(1, this.ab + CFG.afterburner.refill * dt);
    this.rjActive = t.ramjet && active;
    const sec = fr0.sec as { heat: number; cool: number };
    if (this.rjActive) this.heat += CFG.ramjet.heatRate * sec.heat * dt;
    else this.heat -= CFG.ramjet.coolRate * sec.cool * dt;
    this.onLava = !this.airborne && tr.lavaAt(this.s, this.x, fr0 as Frame);
    if (this.onLava) this.heat += CFG.lava.heatRate * dt;
    this.heat = clamp(this.heat, 0, 1.05);
    this.burning = this.heat > CFG.ramjet.burningAt ? (this.heat - CFG.ramjet.burningAt) / (1 - CFG.ramjet.burningAt) : 0;
    if (this.heat >= 1) {
      this.crash("OVERHEATED");
      return;
    }
    this.burstT = Math.max(0, this.burstT - dt);
    this.landT = Math.max(0, this.landT - dt);
    const boostMul = 1 + (this.abActive ? CFG.afterburner.mult : 0) + (this.rjActive ? CFG.ramjet.mult : 0) + (this.burstT > 0 ? CFG.drift.burstMult : 0) + (this.landT > 0 ? CFG.landing.perfectMult : 0);
    const boosting = boostMul > 1.01;
    // hyperdrive is an item effect; Time Trial has no items, so hyperT is always 0 here
    const target = t.throttle * V.maxSpeed * this.mods.speed * (1 + (boostMul - 1) * this.mods.boost) * (this.drifting ? 0.97 : 1);
    let k = t.throttle > 0 ? (target > this.v ? (boosting ? V.boostAccelK : V.accelK) : 0.6) : V.coastK;
    if (this.airborne) k *= 0.3;
    const dv = (target - this.v) * expSmooth(k, dt);
    const vPrev = this.v;
    this.v += Math.min(dv, (boosting ? V.boostAccelMax : V.accelMax) * dt);
    this.accelSm += ((this.v - vPrev) / dt - this.accelSm) * expSmooth(5, dt);
    if (t.brake) this.v = Math.max(0, this.v - V.brake * t.brake * dt);
    this.steerVal += (t.steer - this.steerVal) * expSmooth(V.steerResponse, dt);
    if (t.drift && Math.abs(t.steer) > 0.3 && this.v > 40 && !this.airborne) {
      this.drifting = true;
      this.driftCharge += dt * Math.abs(this.steerVal);
    } else if (this.drifting) {
      this.drifting = false;
      if (this.driftCharge > CFG.drift.minCharge) {
        this.burstT = Math.min(CFG.drift.burstTime, this.driftCharge);
        this.ab = Math.min(1, this.ab + 0.2);
        this.events.push({ type: "burst" });
      }
      this.driftCharge = 0;
    }
    const speed01 = clamp(this.v / V.maxSpeed, 0, 1);
    let turn = this.steerVal * lerp(V.steerLow, V.steerHigh, speed01) * (this.drifting ? V.driftSteerMul : 1);
    if (this.airborne) turn *= 0.5;
    this.theta += turn * dt;
    if (Math.abs(t.steer) < 0.05 && !this.drifting) this.theta -= this.theta * V.assist * dt;
    this.theta = clamp(this.theta, -1.2, 1.2);
    const grip = this.drifting ? V.driftGrip : this.airborne ? 0.5 : V.grip;
    this.phi += (this.theta - this.phi) * expSmooth(grip, dt);
    const ds = (this.v * Math.cos(this.phi) * dt) / Math.max(0.3, 1 - fr0.kappa * this.x);
    this.theta -= fr0.kappa * ds;
    this.phi -= fr0.kappa * ds;
    this.x += this.v * Math.sin(this.phi) * dt;
    this.s = tr.wrap(this.s + ds);
    this.dist += ds;
    const fr = tr.frame(this.s, this.f);
    if (this.rollT > 0) {
      const R = CFG.roll;
      const u = 1 - this.rollT / R.time;
      this.x += this.rollDir * R.dash * (Math.PI / (2 * R.time)) * Math.sin(Math.PI * u) * dt;
      this.rollT = Math.max(0, this.rollT - dt);
    }
    this.scrape = Math.max(0, this.scrape - dt * 4);
    const edge = fr.hw - V.halfWidth;
    if (Math.abs(this.x) > edge) {
      const side = Math.sign(this.x);
      const into = this.phi * side;
      if (into > V.crashAngle && this.v > V.crashMinSpeed && this.invuln <= 0) {
        this.crash("WALL");
        return;
      }
      this.x = side * edge;
      if (into > 0) {
        this.v *= 1 - clamp(Math.sin(into) * 1.4, 0.02, 0.5);
        this.phi = -side * Math.abs(this.phi) * 0.3;
        this.theta = this.theta - side * Math.max(0, this.theta * side) * 0.7;
        this.events.push({ type: "scrape", side, strength: clamp(into * 4, 0.2, 1) });
        this.scrape = 1;
      }
    }
    const dw = tr.dividerAt(this.s);
    if (dw > 0) {
      if (!this.lane) this.lane = Math.sign(this.x) || 1;
      const lim = dw + V.halfWidth;
      if (this.x * this.lane < lim) {
        const e = -this.lane;
        const into = this.phi * e;
        this.x = this.lane * lim;
        if (into > 0) {
          this.v *= 1 - clamp(Math.sin(into) * 0.9, 0.02, 0.3);
          this.phi = -e * Math.abs(this.phi) * 0.3;
          this.events.push({ type: "scrape", side: e, strength: clamp(into * 4, 0.2, 1) });
          this.scrape = 1;
        }
      }
    } else this.lane = 0;
    const hit = tr.hitObstacle(this.s, this.x, V.halfLength * 0.8, V.halfWidth * 0.9);
    if (hit && this.yW - fr.y < hit.h + 0.5 && this.invuln <= 0) {
      this.crash(hit.kind === "pillar" ? "PILLAR" : "ROCK");
      return;
    }
    const nm = CFG.nearMiss;
    this.nearCd = Math.max(0, this.nearCd - dt);
    const near = this.v > nm.minSpeed ? tr.hitObstacle(this.s, this.x, V.halfLength * 0.8, V.halfWidth * 0.9 + nm.gap) : null;
    if (near && near !== this.nearO && this.yW - fr.y < near.h + 0.5 && this.nearCd <= 0) {
      this.nearO = near;
      this.nearCd = nm.cooldown;
      this.events.push({ type: "nearmiss", side: Math.sign(near.x - this.x) || 1 });
    } else if (!near) this.nearO = null;
    const { landed, impact } = this.ground(fr.y + tr.latY(this.s, this.x), dt);
    if (landed > 0.35) {
      if (Math.abs(this.phi) < 0.12 && t.throttle > 0) {
        this.landT = CFG.landing.time;
        this.events.push({ type: "landing", perfect: true });
      } else this.events.push({ type: "landing", perfect: false });
    }
    if (impact > 6) this.events.push({ type: "bottom", strength: clamp(impact / 20, 0, 1) });
    const pitchTarget = Math.atan2(this.vyW, Math.max(10, this.v));
    this.pitch += (pitchTarget - this.pitch) * expSmooth(6, dt);
    const leanTarget = this.steerVal * 0.55 + (this.drifting ? Math.sign(this.steerVal) * 0.22 : 0);
    this.lean += (leanTarget - this.lean) * expSmooth(8, dt);
  }

  /** mirrors the original `updateVisual`: world position of the drone model (hover bob included) */
  updateVisual(time: number): void {
    if (this.crashed) return;
    const fr = this.track.frame(this.s, this.f);
    const bob = Math.sin(time * 5.3) * 0.12 + Math.sin(time * 23) * 0.03 * this.v01;
    this.position.x = fr.x + fr.rx * this.x;
    this.position.y = this.yW + bob;
    this.position.z = fr.z + fr.rz * this.x;
  }
}
