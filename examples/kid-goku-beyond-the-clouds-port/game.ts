/**
 * Game layer of the Cloud Runner port: the phase machine (menu, playing, paused, falling, finale, result) and the
 * per-frame order of the original's main loop, wrapped around the verified pure simulation (`sim.ts`) and the encounter
 * layer (`encounters.ts`). No rendering and no DOM: presentation reads `Game` and consumes the event names it returns.
 *
 * The first 800 recorded steps of the original are replayed through `stepFrame` alone (see the unit tests); this layer
 * only adds what the original's controller adds on top (hit-stop, slow-motion, falls and respawns, duels, the finale).
 */
import type { Chapter } from "./chapter";
import { Encounters, type EncounterEvent, type EncounterResult, type Prompt } from "./encounters";
import {
  JANKEN, award, collectOrb, createState, damage, gainGlider, jankenAllowed, knockOff, rescue, rideHeight, startJanken, step, tickJanken,
  worldLayout, worldPass, type Orb, type SimState, type StepInput
} from "./sim";
import { GLIDER } from "./chapter";

export type Phase = "menu" | "playing" | "paused" | "falling" | "finale" | "result";
export interface RunResult {
  won: boolean; score: number; time: number; hits: number; falls: number; balls: number; orbs: number; meat: number; maxCombo: number; stars: readonly number[];
  best: boolean; /** Fastest finished run so far (seconds, 0 = none) and whether this run set it. */ bestTime: number; newBestTime: boolean;
  /** Most sky pearls held at the end of any run, and whether this run set it. */ bestPearls: number; newBestPearls: boolean;
  /** Where "run again" restarts: from the start after a win, from the last checkpoint after a loss. */ retryFrom: "start" | "checkpoint";
}
export type Difficulty = "normal" | "easy";
/** Easy mode: 0.85x running speed and a fourth heart. Normal is the original's tuning. */
export const DIFFICULTY: Readonly<Record<Difficulty, { speed: number; hearts: number }>> = { normal: { speed: 1, hearts: 3 }, easy: { speed: 0.85, hearts: 4 } };
export interface Records { best: number; bestTime: number; bestPearls: number }
export interface Toast { text: string; until: number }
export interface Falling { t: number; y: number; v: number; s: number; lane: number; jump: number }
export const FINALE_SECONDS = 9;
const MENU_S = 16;
const FALL_RESCUE_WINDOW = 0.8;
const FALL_RESPAWN_AT = 1.05;

export class Game {
  state: SimState;
  enc: Encounters;
  phase: Phase = "menu";
  falling: Falling | null = null;
  finale: { t: number } | null = null;
  result: RunResult | null = null;
  prompt: Prompt | null = null;
  /** Teaching hint for the next set piece (shown for a few seconds, once per run). */
  hint: Prompt | null = null;
  private hintId = "";
  private hintUntil = 0;
  toast: Toast | null = null;
  /** 0..1 presentation shake / flash strength, decays each frame (the original's `HT`). */
  impact = 0;
  flash: { color: string; k: number } | null = null;
  /** Orb magnet while riding the cloud: orb id -> progress 0..1 (the original's `UE`/`GE`). */
  readonly magnet = new Map<number, number>();
  danger = 0;
  chase = false;
  /** Reduced motion (prefers-reduced-motion or the title toggle): presentation drops shake, softens flashes and skips the hit blink. */
  reducedMotion = false;
  /** A pause asked for during a fall, applied when the fall ends (see `pause()`). */
  pauseQueued = false;
  timeScale = 1;
  hold = 0;
  clock = 0;
  taught = new Set<string>();
  best = 0;
  bestTime = 0;
  bestPearls = 0;
  /** Current difficulty; `chapter` is the base chapter with the difficulty's speed applied. */
  difficulty: Difficulty = "normal";
  chapter: Chapter;
  private clockToast = 0;
  private strikeHint = false;
  private gliderHint = false;
  readonly orbs: readonly Orb[];

  constructor(readonly base: Chapter, start = 0, records: number | Partial<Records> = 0, difficulty: Difficulty = "normal") {
    this.difficulty = difficulty;
    this.chapter = withDifficulty(base, difficulty);
    this.state = this.fresh(start);
    this.enc = this.attach();
    this.orbs = worldLayout(this.chapter).orbs;
    const r = typeof records === "number" ? { best: records } : records;
    this.best = r.best ?? 0; this.bestTime = r.bestTime ?? 0; this.bestPearls = r.bestPearls ?? 0;
    this.menu();
  }

  private fresh(start: number): SimState {
    const s = createState(0);
    s.s = start;
    s.hearts = s.maxHearts = DIFFICULTY[this.difficulty].hearts;
    return s;
  }
  /** Switch difficulty (title screen only); the next run uses it. */
  setDifficulty(d: Difficulty): void {
    if (d === this.difficulty) return;
    this.difficulty = d;
    this.chapter = withDifficulty(this.base, d);
    if (this.phase === "menu") this.menu();
  }
  private attach(): Encounters {
    const enc = new Encounters(this.chapter);
    this.state.liveAttack = enc.liveAttack;
    return enc;
  }

  /** Title screen: the runner idles at the start of the track. */
  menu(): void {
    this.state = this.fresh(MENU_S);
    this.enc = this.attach();
    this.phase = "menu";
    this.falling = null; this.finale = null; this.result = null; this.prompt = null; this.magnet.clear();
    this.timeScale = 1; this.hold = 0; this.impact = 0; this.flash = null; this.pauseQueued = false;
  }

  /** Begin a fresh run from `start`, or from a checkpoint keeping the collected balls. */
  start(start = 0, keepBalls: readonly number[] = []): void {
    this.state = this.fresh(start);
    this.state.checkpoint = start;
    this.state.checkpointIndex = Math.max(0, this.chapter.checkpoints.indexOf(start));
    this.state.balls = [...keepBalls];
    this.enc = this.attach();
    this.enc.rewind(start);
    this.phase = "playing";
    this.falling = null; this.finale = null; this.result = null; this.prompt = null; this.hint = null; this.hintId = ""; this.taught.clear(); this.magnet.clear();
    this.timeScale = 1; this.hold = 0; this.impact = 0; this.flash = null; this.strikeHint = false; this.pauseQueued = false;
  }
  /**
   * Pause the run. During a fall the pause is queued and lands when the run is back on the track (the fall camera and the
   * respawn belong to the falling phase). The finale is a short cutscene that ends on the result card, which waits for input,
   * so it is not paused.
   */
  pause(): void {
    if (this.phase === "playing") this.phase = "paused";
    else if (this.phase === "falling") this.pauseQueued = true;
  }
  resume(): void { this.pauseQueued = false; if (this.phase === "paused") this.phase = "playing"; }
  /** From the result card: after a win a fresh run from the start; after a game over the last checkpoint with the pearls found so far. */
  retry(): void {
    const s = this.state;
    if (this.result?.won) { this.start(0); return; }
    this.start(s.checkpoint, s.balls);
  }

  say(text: string, ms = 2200): void { this.toast = { text, until: this.clock + ms / 1000 }; }

  private hurt(kind: string, text: string): boolean {
    const landed = damage(this.state, false, kind);
    if (!landed) return false;
    this.impact = Math.max(this.impact, 0.6);
    this.flash = { color: "#ffd6c8", k: 0.35 };
    this.state.stumbleTimer = 0.55;
    this.say(text);
    return true;
  }

  private end(won: boolean): string[] {
    const s = this.state;
    if (won) s.score += 1000 + Math.max(0, 3 - s.hits) * 300 + s.balls.length * 500;
    const best = Math.round(s.score) > this.best;
    if (best) this.best = Math.round(s.score);
    const newBestTime = won && (this.bestTime <= 0 || s.time < this.bestTime);
    if (newBestTime) this.bestTime = s.time;
    const newBestPearls = s.balls.length > this.bestPearls;
    if (newBestPearls) this.bestPearls = s.balls.length;
    this.result = {
      won, score: Math.round(s.score), time: s.time, hits: s.hits, falls: s.falls, balls: s.balls.length, orbs: s.orbs, meat: s.meat, maxCombo: s.maxCombo, stars: [...s.balls],
      best, bestTime: this.bestTime, newBestTime, bestPearls: this.bestPearls, newBestPearls, retryFrom: won ? "start" : "checkpoint"
    };
    this.phase = "result";
    this.prompt = null;
    return [won ? "finish" : "dead"];
  }

  private startFalling(): string[] {
    if (this.falling) return [];
    const s = this.state;
    this.falling = { t: 0, y: 0, v: 3, s: s.s, lane: s.lane, jump: s.jump };
    this.phase = "falling";
    this.impact = Math.max(this.impact, 0.2);
    return ["fall-start"];
  }

  /** Per-frame entry. `dt` is the real frame time in seconds (clamped to 1/25); returns presentation event names. */
  frame(dtIn: number, input: StepInput): string[] {
    const dt = Math.min(0.04, Math.max(1e-3, dtIn));
    this.clock += dt;
    this.impact = Math.max(0, this.impact - dt * 2.4);
    if (this.flash) { this.flash.k = Math.max(0, this.flash.k - dt * 2.5); if (this.flash.k <= 0) this.flash = null; }
    if (this.toast && this.clock > this.toast.until) this.toast = null;
    const out: string[] = [];
    if (this.phase === "playing") this.playing(dt, input, out);
    else if (this.phase === "falling") this.fallingFrame(dt, input, out);
    else if (this.phase === "finale") this.finaleFrame(dt, out);
    else if (this.phase === "menu") this.state.time += dt;
    // A pause asked for during a fall (window blur, hidden tab, P) lands as soon as the run is back on the track.
    if (this.pauseQueued && this.phase !== "falling") { if (this.phase === "playing") this.phase = "paused"; this.pauseQueued = false; }
    return out;
  }

  private playing(dt: number, input: StepInput, out: string[]): void {
    const s = this.state, ch = this.chapter;
    const j = tickJanken(s, dt);
    out.push(...j.events);
    for (const e of j.events) if (e === "janken-hit") this.jankenHit(out);
    const slow = Math.max(this.lastSlow, s.glider.call > 0 ? 0.72 : 0);
    this.timeScale += (1 - slow - this.timeScale) * Math.min(1, dt * 10);
    const t = this.hold > 0 ? 1e-4 : dt * Math.min(this.timeScale, j.scale);
    this.hold = Math.max(0, this.hold - dt);
    const simEvents = step(s, input, t, ch);
    for (const k of ["stumbleTimer", "grabTimer", "catchTimer"] as const) s[k] = Math.max(0, (s[k] ?? 0) - t);
    const enc: EncounterResult = this.enc.update(t, s, input);
    this.lastSlow = enc.slow;
    this.prompt = enc.prompt;
    this.danger = enc.danger;
    this.chase = enc.chase;
    if ((s.glider.active || s.glider.call > 0) && !this.enc.dives.some((d) => !d.passed && !d.hit && d.target !== null)) { this.prompt = null; this.danger = 0; this.lastSlow = 0; }
    const threat = this.enc.threat;
    const toThreat = threat ? threat.s - s.s : 99;
    s.jankenWindow = !!threat && threat.kind !== "swipe" && toThreat <= JANKEN.late && toThreat > -1.5 && !s.janken && jankenAllowed(s, ch);
    s.chased = enc.chase;
    for (const e of simEvents) this.simEvent(e, out);
    if (this.phase === "playing") {
      for (const e of enc.events) this.encounterEvent(e, out);
      if (this.phase === "playing") {
        const world = worldLayout(ch);
        for (const e of worldPass(s, ch, world)) {
          if (e === "hit") { this.impact = Math.max(this.impact, 0.6); this.flash = { color: "#ffd6c8", k: 0.35 }; this.say("Jump or steer around the obstacles."); }
          out.push(e);
        }
        this.magnetStep(t, out);
        if (!this.gliderHint && s.glider.charge >= 1 && !s.glider.active && s.glider.call <= 0 && !this.prompt) { this.gliderHint = true; this.say("The sky cloud is ready: press Q!", 2600); }
      }
    }
    // A last heart lost to a rock or log (worldPass) or a sim hazard ends the run here; only encounters and falls checked before.
    if (s.dead && this.phase === "playing") { out.push(...this.end(false)); return; }
    if (!s.dead && !s.finished) s.score += s.speed * t * 0.6;
    this.teach();
  }
  private lastSlow = 0;

  private teach(): void {
    const s = this.state, ch = this.chapter;
    const gap = ch.gaps.find((g) => g.start - s.s < 30 && g.start - s.s > 2);
    const pole = ch.poles.find((p) => p.start - s.s < 44 && p.start - s.s > 4 && s.pole?.start !== p.start);
    const onPole = s.pole && s.pole.end - s.s < 20 && s.pole.end - s.s > 2 ? s.pole : null;
    const wall = ch.walls.find((w) => w.start - s.s < 24 && w.start - s.s > 2);
    const river = ch.waters.find((w) => w.start - s.s < 26 && w.start - s.s > 2);
    let id = "", hint: Prompt | null = null;
    if (s.s < 70) { id = "start"; hint = { tag: "THE RUN BEGINS", title: "RIDE THE ROLLING LOG", help: "← → OR A D TO STEER" }; }
    else if (onPole) { id = "launch"; hint = { tag: "POWER LAUNCH", title: "JUMP AT THE END", help: "SPACE" }; }
    else if (pole) { id = `pole-${pole.start}`; hint = { tag: "GORGE AHEAD", title: "PLANT THE STAFF", help: "PRESS E" }; }
    else if (gap) { id = `gap-${gap.start}`; hint = { tag: "GAP AHEAD", title: "JUMP!", help: "SPACE" }; }
    else if (wall) { id = `wall-${wall.start}`; hint = { tag: "CLIFF RUN", title: "JUMP OFF THE WALL", help: "SPACE" }; }
    else if (river) { id = `river-${river.start}`; hint = { tag: "RIVER AHEAD", title: "VAULT THE WATER", help: "PRESS E" }; }
    if (id && id !== this.hintId) {
      this.hintId = id;
      if (!this.taught.has(id) || id === "start") { this.taught.add(id); this.hintUntil = this.clock + (id === "start" ? 5.5 : 4); this.hint = hint; }
      else this.hint = null;
    }
    if (!id) this.hintId = "";
    if (this.hint && this.clock > this.hintUntil) this.hint = null;
    if (id === "start" && s.s >= 70) this.hint = null;
  }

  private magnetStep(t: number, out: string[]): void {
    const s = this.state, riding = s.glider.active || s.glider.call > 0;
    if (riding) {
      for (const orb of this.orbs) {
        if (s.collected.has(orb.id) || this.magnet.has(orb.id)) continue;
        const d = orb.s - s.s;
        if (d > -1.5 && d < 6 && Math.abs(s.lane - orb.lane) < GLIDER.magnet) this.magnet.set(orb.id, 0);
      }
    }
    for (const [id, p] of this.magnet) {
      const next = p + t / 0.2;
      if (next >= 1) {
        this.magnet.delete(id);
        const orb = this.orbs[id];
        if (orb && !s.collected.has(id)) { collectOrb(s, orb, this.chapter); out.push("orb"); }
      } else this.magnet.set(id, next);
    }
  }

  private simEvent(e: string, out: string[]): void {
    const s = this.state;
    out.push(e);
    if (e === "fall") out.push(...this.startFalling());
    else if (e === "finish") {
      if (this.chapter.home) { this.phase = "finale"; this.finale = { t: 0 }; this.prompt = null; }
      else out.push(...this.end(true));
    } else if (e === "glider-empty") this.say("Not yet: spirit orbs fill the cloud gauge!", 2000);
    else if (e === "glider-wait") {
      const why = s.glider.nopeWhy ?? "charge";
      this.say({
        log: "Ride the log first: the cloud is stored.", pole: "Stored for after the staff crossing.", wall: "Stored for after the cliff run.",
        river: "Stored: the river is run on foot.", home: "Almost home: run the rest of the way!", charge: "Almost full: a few more orbs!"
      }[why] ?? "Stored for later.", 1600);
    } else if (e === "meat" || e === "skypearl") s.catchTimer = 0.4;
    if (e === "skypearl") this.say(`Sky pearl ${s.balls[s.balls.length - 1]} found!`, 1800);
    if (e === "checkpoint") this.say("Checkpoint", 1400);
    if (e === "land" || e === "splash") this.impact = Math.max(this.impact, 0.06);
    if (e === "extend") this.impact = Math.max(this.impact, 0.08);
    if (e === "power-launch") this.hold = 0.05;
    if (e === "glider-mount") this.impact = Math.max(this.impact, 0.35);
  }

  private strikeResult(ev: EncounterEvent, kind: "ptera" | "trex", out: string[]): void {
    const s = this.state, ch = this.chapter;
    gainGlider(s, "strike", ch);
    const creature = ev.creature ?? (kind === "trex" ? this.enc.trex?.creature : undefined);
    if (creature && !s.janken && s.strikeLead <= JANKEN.late && jankenAllowed(s, ch)) {
      out.push(...startJanken(s, creature, kind));
      this.strikeHint = true;
      return;
    }
    s.encounters++;
    award(s, kind === "trex" ? 600 : 500);
    this.hold = kind === "trex" ? 0.14 : 0.12;
    this.impact = Math.max(this.impact, kind === "trex" ? 0.6 : 0.3);
    out.push("strike-hit");
    if (!this.strikeHint) { this.strikeHint = true; this.say("Bonk at the very last moment for a rock-paper-scissors duel!", 2600); }
  }

  private jankenHit(out: string[]): void {
    const s = this.state, j = s.janken;
    if (!j) return;
    this.enc.knockout(j.creature as never, "janken");
    s.encounters++;
    award(s, 1500);
    this.impact = Math.max(this.impact, 1.1);
    this.flash = { color: "#ffffff", k: 0.5 };
    out.push("duel-won");
  }

  private encounterEvent(ev: EncounterEvent, out: string[]): void {
    const s = this.state, ch = this.chapter;
    out.push(ev.type);
    switch (ev.type) {
      case "rumble": this.impact = Math.max(this.impact, 0.25); break;
      case "boulder-hit": this.hurt("boulder", "Jump the boulders or steer clear!"); break;
      case "close-call":
        if (s.glider.active) break;
        award(s, ev.points ?? 100);
        gainGlider(s, (ev.points ?? 0) > 200 ? "dodge" : "close", ch);
        break;
      case "ptera-struck": this.strikeResult(ev, "ptera", out); break;
      case "ptera-grab": s.grabTimer = 0.9; this.hurt("grab", "Strike it when its shadow covers you, or steer away!"); break;
      case "dodge": {
        const kind = ev.kind ?? this.attackKindAt(s.s);
        if (s.glider.active && kind === "swipe") break;
        award(s, ev.points ?? 200);
        gainGlider(s, "dodge", ch);
        break;
      }
      case "trex-struck": this.strikeResult(ev, "trex", out); break;
      case "trex-bite":
        if (s.glider.active) this.bitOffCloud(out);
        else this.hurt("bite", "Get right when the ground turns red!");
        break;
      case "trex-swipe": this.hurt("swipe", "Jump the tail swipe!"); break;
      default: break;
    }
    if (s.dead) out.push(...this.end(false));
  }
  private attackKindAt(at: number): string | null {
    const t = this.chapter.creatures.find((c) => c.type === "trex");
    if (!t) return null;
    if ((t.swipes ?? []).some((x) => at >= x && at < x + 6.5)) return "swipe";
    if ((t.bites ?? []).some((x) => at >= x && at < x + 6.5)) return "bite";
    return null;
  }
  private bitOffCloud(out: string[]): void {
    const s = this.state;
    if (s.jump > rideHeight(s, this.chapter) + 1.1) { award(s, 300); out.push("dodge"); return; }
    if (knockOff(s, this.chapter)) { this.impact = Math.max(this.impact, 0.7); this.flash = { color: "#ffd6c8", k: 0.3 }; out.push("glider-knocked"); }
    else this.hurt("bite", "Steer right when the ground turns red!");
  }

  private fallingFrame(dt: number, input: StepInput, out: string[]): void {
    const f = this.falling, s = this.state, ch = this.chapter;
    if (!f) { this.phase = "playing"; return; }
    f.t += dt; f.v -= 30 * dt; f.y += f.v * dt;
    if (s.glider.charge >= 1 && f.t < FALL_RESCUE_WINDOW) this.prompt = { tag: "SKY CLOUD!", title: "CALL THE CLOUD!", help: "Q · CALL IT NOW" };
    else this.prompt = null;
    if (input.glider && f.t < FALL_RESCUE_WINDOW && rescue(s, ch)) {
      s.s += f.t * 8.5; s.jump = f.y; s.jumpVelocity = Math.min(0, f.v) * 0.3; s.speed = Math.max(s.speed, ch.speed * 0.85);
      this.falling = null; this.phase = "playing"; this.timeScale = 0.5; this.prompt = null;
      out.push("glider-call");
    } else if (f.t > FALL_RESPAWN_AT) {
      this.falling = null; this.phase = "playing"; this.prompt = null;
      if (damage(s, true)) { this.enc.rewind(s.s); this.impact = 0.4; this.flash = { color: "#ffffff", k: 0.3 }; }
      out.push("respawn");
      if (s.dead) out.push(...this.end(false));
    }
  }

  private finaleFrame(dt: number, out: string[]): void {
    const f = this.finale;
    if (!f) return;
    f.t += dt;
    const s = this.state, home = this.chapter.home;
    if (home) s.s = Math.min(home.s, this.chapter.length + (home.s - this.chapter.length) * Math.min(1, f.t / 4));
    s.speed *= Math.max(0, 1 - dt * 1.5);
    if (f.t >= FINALE_SECONDS) { this.finale = null; out.push(...this.end(true)); }
  }
}

/** The chapter with a difficulty's running speed applied (normal returns the chapter itself). */
export function withDifficulty(ch: Chapter, d: Difficulty): Chapter {
  const k = DIFFICULTY[d].speed;
  return k === 1 ? ch : { ...ch, speed: ch.speed * k };
}
