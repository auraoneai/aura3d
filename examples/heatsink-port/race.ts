/**
 * Time Trial race of the original HEATSINK: countdown, fixed 1/120 s substeps, slow-motion after a crash,
 * boost pads, checkpoints, pickups, barrels, lap counting and DNF. Mirrors the original game's `frame()` /
 * `step()` / `updateProps()` order for the solo (Time Trial) case: no rival drones, no item boxes, no weapons fire.
 * Pure and deterministic: the same input sequence always reproduces the same state.
 */
import { CFG } from "./config";
import { Operation } from "./operation";
import { expSmooth } from "./rng";
import { Track, MAP, type Barrel, type Pickup } from "./track";
import { Vehicle, type Input } from "./vehicle";

/** maximum simulation substep (the original's `wq`); a 1/60 frame runs two 1/120 substeps */
export const SUBSTEP = 1 / 120;
export const FRAME = 1 / 60;
const COUNTDOWN_START = 3.2;
const CRASH_BUDGET = CFG.vehicle.crashBudget;
const LAPS = CFG.track.laps;

export type RaceState = "countdown" | "race" | "finished" | "dnf";

export interface RaceEvent {
  step: number;
  type: "state" | "lap" | "crash" | "pickup" | "barrel" | "boostPad" | "checkpoint" | "dnf";
  detail?: string | number;
}

export class Race {
  readonly track: Track;
  readonly player: Vehicle;
  /** the strike layer: targets, bolt gun, score and medals (additive; never feeds the drone's movement) */
  readonly ops: Operation;
  readonly events: RaceEvent[] = [];
  state: RaceState = "countdown";
  countdown = COUNTDOWN_START;
  raceTime = 0;
  /** wall-clock seconds (unscaled frames) since the state became "race"; drives the GO banner (HP-01) */
  goT = 0;
  time = 0;
  lapIdx = 0;
  lapStart = 0;
  bestLap = 0;
  laps = LAPS;
  slowT = 0;
  timeScale = 1;
  resultsT = 0;
  /** true once the results screen would have opened (the original then stops stepping the world) */
  resultsOpen = false;
  frames = 0;
  readonly pickups: Pickup[];
  readonly barrels: (Barrel & { y: number })[];
  private readonly barrelPos: { x: number; y: number; z: number }[];

  constructor(track: Track = new Track()) {
    this.track = track;
    this.player = new Vehicle(track);
    this.ops = new Operation(track);
    this.pickups = track.pickups.map((p) => ({ ...p, respawn: 0 }));
    this.barrels = track.barrels.map((b) => ({ ...b, alive: true, respawn: 0, y: track.frame(b.s).y }));
    this.barrelPos = this.barrels.map((b) => track.toWorld(b.s, b.x, b.y));
    this.startRace();
  }

  /** the original's `startRace()` for Time Trial: reset the player to the grid slot and begin the countdown */
  startRace(): void {
    const grid = MAP.grid ?? { x: 7, row: 16 };
    this.player.reset(this.track.length - 25, -grid.x);
    this.raceTime = 0;
    this.goT = 0;
    this.lapIdx = 0;
    this.lapStart = 0;
    this.bestLap = 0;
    this.resultsT = 0;
    this.resultsOpen = false;
    this.state = "countdown";
    this.countdown = COUNTDOWN_START;
    this.timeScale = 1;
    this.slowT = 0;
    this.time = 0;
    this.player.ckPrevS = undefined;
    for (const p of this.pickups) p.respawn = 0;
    for (const b of this.barrels) { b.alive = true; b.respawn = 0; }
    this.events.length = 0;
    this.ops.reset();
  }

  /** one displayed frame (dt = 1/60): substeps, countdown, results timer, then the visual position update */
  frame(dt: number, input: Input): void {
    this.frames++;
    if (!this.resultsOpen) {
      if (this.slowT > 0) {
        this.slowT -= dt;
        this.timeScale = 0.3;
      } else this.timeScale += (1 - this.timeScale) * expSmooth(6, dt);
      const s = dt * this.timeScale;
      if (s > 1e-5) {
        const n = Math.ceil(s / SUBSTEP - 1e-6);
        for (let i = 0; i < n; i++) this.step(s / n, input);
      }
      if (this.state === "race") this.goT += dt;
      if (this.state === "countdown") {
        this.countdown -= dt;
        if (this.countdown <= 0) {
          this.state = "race";
          this.raceTime = 0;
          this.events.push({ step: this.frames, type: "state", detail: "race" });
        }
      }
      if (this.resultsT > 0) {
        this.resultsT -= dt;
        if (this.resultsT <= 0) this.resultsOpen = true;
      }
      this.time += s;
    }
    this.player.updateVisual(this.time);
  }

  private step(e: number, input: Input): void {
    const p = this.player;
    const tr = this.track;
    const racing = this.state !== "countdown";
    if (racing) this.raceTime += e;
    p.update(e, input, racing && this.state !== "dnf");
    // playerWeapons (Time Trial: firing is disabled; only the cool-down and shield regeneration run)
    const W = CFG.weapons;
    p.gunCd -= e;
    p.gunHeat = Math.max(0, p.gunHeat - W.cool * e);
    if (p.gunLocked && p.gunHeat <= W.lockout) p.gunLocked = false;
    p.shieldT -= e;
    if (p.shieldT <= 0) p.shield = Math.min(p.shieldMax, p.shield + W.shieldRegen * e);
    if (racing) this.updateProps(e);
    this.ops.advance(e, input, this);
    for (const ev of p.events) this.onPlayerEvent(ev);
    p.events.length = 0;
    if (this.state === "race" && !p.finished) {
      const c = Math.floor(p.dist / tr.length);
      if (c > this.lapIdx && c >= 1) {
        const lap = this.raceTime - this.lapStart;
        this.lapStart = this.raceTime;
        this.bestLap = this.bestLap ? Math.min(this.bestLap, lap) : lap;
        this.lapIdx = c;
        this.events.push({ step: this.frames, type: "lap", detail: c });
      }
      if (p.dist >= this.laps * tr.length) {
        p.finished = true;
        p.finishTime = this.raceTime;
        this.state = "finished";
        this.resultsT = 2.5;
        this.events.push({ step: this.frames, type: "state", detail: "finished" });
      }
    }
  }

  private onPlayerEvent(ev: { type: string; reason?: string }): void {
    const p = this.player;
    if (ev.type === "crash") {
      this.slowT = 0.5;
      const left = CRASH_BUDGET - p.crashes;
      this.events.push({ step: this.frames, type: "crash", detail: ev.reason });
      if (this.state === "race" && left < 0) {
        this.state = "dnf";
        p.crashT = 1e9;
        this.resultsT = 2.2;
        this.events.push({ step: this.frames, type: "dnf" });
      }
    } else if (ev.type === "nearmiss") {
      if (this.state !== "race") return;
      this.slowT = Math.max(this.slowT, CFG.nearMiss.slow);
      p.ab = Math.min(1, p.ab + CFG.nearMiss.boost);
    }
  }

  private updateProps(e: number): void {
    const tr = this.track;
    const p = this.player;
    p.padCd = Math.max(0, p.padCd - e);
    if (!(p.padCd > 0 || p.crashed || p.airborne)) {
      for (const pad of tr.boostPads) {
        if (Math.abs(tr.wrapDelta(p.s, pad.s)) < 4.5 && Math.abs(p.x - pad.x) < 3.4) {
          p.padCd = 1;
          p.burstT = 1.4;
          p.ab = Math.min(1, p.ab + 0.25);
          this.events.push({ step: this.frames, type: "boostPad", detail: pad.s });
        }
      }
    }
    const prev = p.ckPrevS ?? p.s;
    p.ckPrevS = p.s;
    if (!p.crashed) {
      for (const l of tr.checkpoints) {
        if (tr.wrapDelta(prev, l) < 0 && tr.wrapDelta(p.s, l) >= 0) {
          p.burstT = Math.max(p.burstT || 0, CFG.checkpoint.burst);
          p.ab = Math.min(1, p.ab + CFG.checkpoint.boost);
          this.events.push({ step: this.frames, type: "checkpoint", detail: l });
        }
      }
    }
    for (const pk of this.pickups) {
      if (pk.respawn > 0) {
        pk.respawn -= e;
        continue;
      }
      if (!(p.crashed || Math.abs(tr.wrapDelta(p.s, pk.s)) > 4.5 || Math.abs(p.x - pk.x) > 3.6)) {
        pk.respawn = 15;
        if (pk.kind === "shield") p.shield = p.shieldMax;
        else {
          p.heat = 0;
          p.gunHeat = 0;
          p.gunLocked = false;
        }
        this.events.push({ step: this.frames, type: "pickup", detail: pk.kind });
      }
    }
    for (let i = 0; i < this.barrels.length; i++) {
      const b = this.barrels[i] as Barrel & { y: number };
      if (!b.alive) {
        b.respawn -= e;
        if (b.respawn <= 0) b.alive = true;
        continue;
      }
      if (!(p.crashed || p.invuln > 0) && Math.abs(tr.wrapDelta(p.s, b.s)) < 3.2 && Math.abs(p.x - b.x) < 3) {
        b.alive = false;
        b.respawn = 25;
        this.events.push({ step: this.frames, type: "barrel", detail: b.s });
        this.explodeBarrel(i);
      }
    }
  }

  private explodeBarrel(index: number): void {
    const p = this.player;
    const o = this.barrelPos[index] as { x: number; y: number; z: number };
    if (p.crashed) return;
    const dx = p.position.x - o.x;
    const dy = p.position.y - (o.y + 1);
    const dz = p.position.z - o.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > 14) return;
    const r = 7 * (1 - dist / 14) + 2;
    if (p.invuln > 0) return;
    p.shield -= r;
    p.shieldT = CFG.weapons.shieldDelay;
    if (p.shield <= 0) {
      p.crash("BARREL");
      p.shield = p.shieldMax;
    }
  }
}
