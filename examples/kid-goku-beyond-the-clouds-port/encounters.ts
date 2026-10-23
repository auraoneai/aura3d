/**
 * Encounter layer of the Cloud Runner port: rolling boulders, diving pteranodons and the T-rex bite and tail-swipe
 * gauntlet. A pure module (no rendering): it reads the sim state each step and returns events, a danger level and a
 * callout prompt, exactly like the original's encounter controller (`Lw.update`). It also closes the `liveAttack` seam
 * in `sim.ts` so a defeated creature stops being a threat.
 *
 * Reproduced mechanics and tuning only; creature art, animation and audio are the port's own.
 */
import type { Chapter, Creature } from "./chapter";
import { smooth, clamp, type SimState, type StepInput } from "./sim";

export interface EncounterEvent {
  readonly type: "rumble" | "boulder-hit" | "close-call" | "screech" | "ptera-struck" | "ptera-grab" | "dodge" | "trex-struck" | "trex-bite" | "trex-swipe";
  readonly creature?: Creature;
  readonly index?: number;
  readonly points?: number;
  readonly kind?: string;
  readonly style?: string;
  readonly bumps?: number;
}
export interface Prompt { readonly tag: string; readonly title: string; readonly help: string }
export interface EncounterResult { events: EncounterEvent[]; danger: number; slow: number; chase: boolean; prompt: Prompt | null }

export interface Boulder { readonly s: number; readonly id: number; lane: number; hit: boolean; passed: boolean; rumbled: boolean }
export interface Dive {
  readonly creature: Creature; readonly s: number; target: number | null; passed: boolean; hit: boolean; gone: boolean;
  ko: { style: string; at: number } | null;
}
export interface TrexAttack { readonly s: number; readonly kind: "bite" | "swipe"; done: boolean }
export interface Trex {
  readonly creature: Creature; attacks: TrexAttack[]; stunnedUntil: number; bonks: { at: number }[];
  ko: { style: string; at: number; bumps: number } | null; beaten: boolean; downUntil: number;
}
export interface Threat { creature: Creature; kind: string; s: number }

export class Encounters {
  time = 0;
  s = 0;
  threat: Threat | null = null;
  readonly boulders: Boulder[];
  readonly dives: Dive[];
  readonly trex: Trex | undefined;

  constructor(readonly chapter: Chapter) {
    this.boulders = (chapter.boulders ?? []).map((b, id) => ({ s: b.s, id, lane: -16, hit: false, passed: false, rumbled: false }));
    this.dives = chapter.creatures.filter((c) => c.type === "pteranodon").map((creature) => ({ creature, s: creature.s, target: null, passed: false, hit: false, gone: false, ko: null }));
    const tc = chapter.creatures.find((c) => c.type === "trex");
    if (tc) {
      const attacks: TrexAttack[] = [
        ...(tc.bites ?? []).map((s) => ({ s, kind: "bite" as const, done: false })),
        ...(tc.swipes ?? []).map((s) => ({ s, kind: "swipe" as const, done: false }))
      ].sort((a, b) => a.s - b.s);
      this.trex = { creature: tc, attacks, stunnedUntil: -1, bonks: [], ko: null, beaten: false, downUntil: -1 };
    }
  }

  /** Plug into `SimState.liveAttack`. */
  liveAttack = (creature: Creature, at: number): boolean => {
    if (creature.type === "pteranodon") return this.dives.some((d) => d.s === creature.s && !d.hit && !d.passed);
    return !!this.trex && this.s >= this.trex.stunnedUntil && this.trex.attacks.some((a) => a.s === at && !a.done);
  };

  /** Boulder lane as it rolls across the road toward the runner (original: -16 + (distance + 36) * 0.44). */
  boulderLane(b: Boulder, runnerS: number): number { return -16 + (runnerS - b.s + 36) * 0.44; }

  /** Original `rewind`: put every encounter beyond `s` back, after a respawn. */
  rewind(s: number): void {
    this.s = s; this.threat = null;
    for (const b of this.boulders) if (b.s > s) Object.assign(b, { hit: false, passed: false, rumbled: false });
    for (const d of this.dives) if (d.s > s) Object.assign(d, { hit: false, passed: false, target: null, ko: null, gone: false });
    const t = this.trex;
    if (!t) return;
    t.bonks = t.bonks.filter((b) => b.at <= s);
    if (t.ko && t.ko.at > s) { t.ko = null; t.beaten = false; t.downUntil = -1; }
    const janken = t.ko?.style === "janken" ? t.ko.at : null;
    for (const a of t.attacks) if (a.s > s && !(janken !== null && a.s < janken + 56)) a.done = false;
    if (janken === null && s < t.stunnedUntil) t.stunnedUntil = -1;
  }

  /** Original `knockout`: a bonk (pole strike) or a Janken win removes the threat. */
  knockout(creature: Creature | undefined, style: "bonk" | "janken" = "bonk", attack: TrexAttack | null = null): boolean {
    if (!creature) return false;
    const s = this.s;
    if (creature.type === "trex") {
      const t = this.trex;
      if (!t) return false;
      if (t.beaten || (t.ko?.style === "janken" && s < t.downUntil)) return false;
      if (style === "janken") {
        for (const a of t.attacks) if (a.s < s + 56) a.done = true;
        const next = t.attacks.find((a) => !a.done);
        t.beaten = !next;
        t.downUntil = t.stunnedUntil = next ? Math.max(s + 24, Math.min(s + 40, next.s - 16)) : Infinity;
        t.ko = { style, at: s, bumps: t.bonks.length };
        return true;
      }
      if (t.ko && s < t.stunnedUntil) return false;
      const target = attack ?? t.attacks.find((a) => !a.done && s > a.s - 15 && s < a.s + 2) ?? null;
      if (target) target.done = true;
      t.stunnedUntil = (target ? target.s : s) + 45;
      t.bonks.push({ at: s });
      t.ko = { style, at: s, bumps: t.bonks.length };
      return true;
    }
    const d = this.dives.find((x) => x.creature === creature);
    if (!d) return false;
    if (d.ko?.style === "janken" || (d.ko && style === "bonk")) return false;
    d.hit = true; d.passed = true; d.ko = { style, at: s };
    return true;
  }

  update(dt: number, state: SimState, _input?: StepInput): EncounterResult {
    this.time += dt;
    this.s = state.s;
    const events: EncounterEvent[] = [];
    let danger = 0, slow = 0, chase = false;
    let prompt: Prompt | null = null;
    let nearest: Threat | null = null;
    const consider = (creature: Creature, kind: string, at: number): void => {
      if (at >= state.s - 0.5 && (!nearest || at < nearest.s)) nearest = { creature, kind, s: at };
    };

    for (const b of this.boulders) {
      const d = state.s - b.s;
      if (!(d > -62 && d < 22)) continue;
      b.lane = this.boulderLane(b, state.s);
      if (d > -48 && d < -4 && !b.passed) {
        danger = Math.max(danger, 1 - Math.abs(d + 14) / 40);
        prompt = { tag: "ROCK SLIDE!", title: "BOULDER INCOMING", help: "JUMP IT OR STEER CLEAR" };
      }
      if (d > -44 && d < -40 && !b.rumbled) { b.rumbled = true; events.push({ type: "rumble" }); }
      if (!b.passed && d >= 0) {
        b.passed = true;
        if (d > 6) continue;
        if (Math.abs(state.lane - b.lane) < 2.1 && state.jump < 1.7) { b.hit = true; events.push({ type: "boulder-hit", index: b.id }); }
        else events.push({ type: "close-call", points: Math.abs(state.lane - b.lane) < 3.4 ? 250 : 120 });
      }
    }

    for (const dive of this.dives) {
      const d = state.s - dive.s;
      if (dive.hit) continue;
      if (dive.target === null && d >= 0) { dive.passed = true; dive.target = state.lane; }
      if (d > -40 && d < 0 && dive.target === null) {
        dive.target = clamp(state.lane, -4, 4);
        events.push({ type: "screech", creature: dive.creature });
      }
      if (dive.target !== null && !dive.passed) {
        const k = smooth(-40, -2, d);
        danger = Math.max(danger, k);
        const aligned = Math.abs(state.lane - dive.target) < 2;
        prompt = { tag: "LOOK UP!", title: aligned ? "STRIKE IT OR DODGE!" : "IT'S DIVING!", help: aligned ? "PRESS E NOW · OR STEER AWAY" : "STAY OUT OF THE SHADOW" };
        consider(dive.creature, "grab", dive.s);
        if (d > -13 && d < -2 && aligned) slow = Math.max(slow, 0.45);
        if (d > -15 && d < 1.5 && state.strikeTimer > 0) {
          this.knockout(dive.creature, "bonk");
          events.push({ type: "ptera-struck", creature: dive.creature, style: "bonk" });
        } else if (d >= 0) {
          dive.passed = true;
          const ceiling = state.nimbus.active ? 3.2 + 1.2 : 2.2;
          if (Math.abs(state.lane - dive.target) < 1.9 && state.jump < ceiling) events.push({ type: "ptera-grab", creature: dive.creature });
          else events.push({ type: "dodge", creature: dive.creature, kind: "grab" });
        }
      }
    }

    const t = this.trex;
    if (t) {
      chase = state.s > t.creature.s - 20 && state.s < (t.creature.until ?? 0) && !t.beaten && !(t.ko?.style === "janken" && state.s < t.downUntil);
      for (const a of t.attacks) {
        const d = state.s - a.s, stunned = state.s < t.stunnedUntil, live = !a.done && !stunned && d > -30 && d < 0;
        if (live) {
          consider(t.creature, a.kind, a.s);
          danger = Math.max(danger, smooth(-30, -6, d));
          prompt = a.kind === "bite"
            ? { tag: "HE'S GOING TO BITE!", title: "GET RIGHT · OR BONK HIM", help: "STEER RIGHT · OR PRESS E" }
            : { tag: "TAIL SWIPE!", title: "JUMP!", help: "SPACE" };
          if (a.kind === "bite" && d > -10 && d < -2 && state.lane < -0.4) slow = Math.max(slow, 0.35);
          if (a.kind === "swipe" && d > -8 && d < -1 && state.jump < 0.5) slow = Math.max(slow, 0.3);
        }
        if (a.kind === "bite" && !a.done && d > -10 && d < 1.5 && state.strikeTimer > 0 && !stunned && this.knockout(t.creature, "bonk", a)) {
          events.push({ type: "trex-struck", creature: t.creature, style: "bonk", bumps: t.bonks.length });
        }
        if (!a.done && d >= 0) {
          a.done = true;
          if (stunned || d > 6) continue;
          if (a.kind === "bite" && state.lane < -0.4) events.push({ type: "trex-bite" });
          else if (a.kind === "swipe" && state.jump < 1.1) events.push({ type: "trex-swipe" });
          else events.push({ type: "dodge", points: 250, kind: a.kind });
        }
      }
    }
    this.threat = nearest;
    return { events, danger, slow, chase, prompt };
  }
}
