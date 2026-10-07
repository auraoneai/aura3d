/**
 * session/GameSession.ts — PRD-09 day-0 (C-24 §7.3).
 *
 * Real GameSession: legal state transitions, pause/reason stacks, time
 * delegation to the mounted C-23 `AuraTimeController` (or a local
 * `StubTimeController` until PR 0b-2 mounts `app.time`), per-actor hit-stop
 * freeze sets expiring on REAL time, and slow-mo ramping through the
 * controller. Session state never depends on capture flags.
 */

import {
  StubTimeController,
  type AuraTimeController
} from "@aura3d/engine/contracts";
import type {
  GameSession,
  GameSessionState,
  PauseReason
} from "@aura3d/engine/contracts";

export type SessionEvent = "state" | "pause" | "resume" | "settings";

/** Transitions legal per §7.3; everything else throws. */
const LEGAL: Readonly<Record<GameSessionState, readonly GameSessionState[]>> = {
  booting: ["loading", "disposed"],
  loading: ["title", "playing", "disposed"],
  title: ["playing", "loading", "disposed"],
  playing: ["paused", "transitioning", "results", "title", "context-lost", "disposed"],
  paused: ["playing", "title", "context-lost", "disposed"],
  results: ["playing", "title", "loading", "disposed"],
  transitioning: ["playing", "title", "loading", "disposed"],
  "context-lost": ["paused", "disposed"],
  disposed: []
};

export interface GameSessionOptions {
  readonly seed: number;
  readonly time?: AuraTimeController;
}

export class GameSessionImpl implements GameSession {
  public state: GameSessionState = "booting";
  private pauseStack: PauseReason[] = [];
  private readonly listeners = new Map<SessionEvent, Set<(s: GameSession) => void>>();
  private controller: AuraTimeController;
  /** Per-actor freeze remaining in REAL seconds — decremented in tick(). */
  private readonly actorFreezes = new Map<string, number>();
  /** Scaled dt produced by the last tick — feeds scaledDt()/simTime accounting. */
  private lastScaledDt = 0;
  public readonly seed: number;
  private accessibility?: { readonly values: { reducedMotion: boolean; reducedFlash: boolean; highContrast: boolean } };

  public constructor(options: GameSessionOptions) {
    this.seed = options.seed;
    this.controller = options.time ?? new StubTimeController();
  }

  /** Swap the delegate (e.g. once the app mounts `app.time`). */
  public bindTimeController(controller: AuraTimeController): void {
    this.controller = controller;
  }

  /** Called once per real frame by the runtime hook — advances real + sim time. */
  public tick(realDt: number): number {
    for (const [actor, remaining] of [...this.actorFreezes]) {
      const next = remaining - realDt;
      if (next <= 0) this.actorFreezes.delete(actor);
      else this.actorFreezes.set(actor, next);
    }
    const driver = this.controller as AuraTimeController & { advance?(dt: number): number };
    this.lastScaledDt = typeof driver.advance === "function" ? driver.advance(realDt) : realDt * this.controller.scale;
    return this.lastScaledDt;
  }

  public setAccessibility(values: { reducedMotion: boolean; reducedFlash: boolean; highContrast: boolean }): void {
    this.accessibility = { values };
  }

  public get paused(): boolean {
    return this.state === "paused";
  }

  /** Effective scale = user scale × slow-mo × (hit-stop ? 0 : 1). */
  public get timeScale(): number {
    return this.controller.hitStopRemaining > 0 ? 0 : this.controller.scale;
  }

  public get simTime(): number {
    return this.controller.simTime;
  }

  public get reducedMotion(): boolean {
    return this.accessibility?.values.reducedMotion ?? false;
  }
  public get reducedFlash(): boolean {
    return this.accessibility?.values.reducedFlash ?? false;
  }
  public get highContrast(): boolean {
    return this.accessibility?.values.highContrast ?? false;
  }

  public transition(to: GameSessionState): void {
    if (this.state === to) return;
    if (!LEGAL[this.state].includes(to)) {
      throw new Error(`GAME_SESSION_ILLEGAL_TRANSITION:${this.state}->${to}`);
    }
    this.state = to;
    this.emit("state");
  }

  public pause(reason: PauseReason = "user"): void {
    this.pauseStack.push(reason);
    if (this.state === "playing" || this.state === "title") {
      this.state = "paused";
      this.emit("state");
      this.emit("pause");
    }
  }

  public resume(): void {
    this.pauseStack = [];
    if (this.state === "paused") {
      this.state = "playing";
      this.emit("state");
      this.emit("resume");
    }
  }

  public releasePause(reason: PauseReason): void {
    this.pauseStack = this.pauseStack.filter((r) => r !== reason);
    if (this.state === "paused" && this.pauseStack.length === 0) {
      this.state = "playing";
      this.emit("state");
      this.emit("resume");
    }
  }

  public setTimeScale(scale: number, o?: { rampMs?: number }): void {
    if (!Number.isFinite(scale)) {
      throw new Error(`GAME_TIMESCALE_NAN: setTimeScale(${String(scale)}) requires a finite number.`);
    }
    const clamped = Math.min(4, Math.max(0, scale));
    if (o?.rampMs !== undefined && o.rampMs > 0) {
      this.controller.scaleTo(clamped, o.rampMs / 1000);
    } else {
      this.controller.scale = clamped;
    }
  }

  public hitStop(seconds: number, o?: { actors?: readonly string[] }): void {
    if (o?.actors !== undefined && o.actors.length > 0) {
      for (const actor of o.actors) {
        this.actorFreezes.set(actor, Math.max(this.actorFreezes.get(actor) ?? 0, seconds));
      }
    } else {
      this.controller.hitStop(seconds, { scope: "global" });
    }
  }

  public slowMo(scale: number, ms: number, o?: { ease?: string }): void {
    const easeOut = o?.ease === undefined || o.ease === "linear" ? 0.1 : Math.min(ms / 1000, 0.35);
    this.controller.slowMo(scale, ms / 1000, { easeOut });
  }

  public scaledDt(rawDt: number, actorId?: string): number {
    if (actorId !== undefined && this.actorFreezes.has(actorId)) return 0;
    if (this.controller.hitStopRemaining > 0) return 0;
    return rawDt * this.controller.scale;
  }

  public isFrozen(actorId?: string): boolean {
    if (actorId !== undefined) return this.actorFreezes.has(actorId);
    return this.paused || this.controller.hitStopRemaining > 0;
  }

  public get pauseReasons(): readonly PauseReason[] {
    return this.pauseStack;
  }

  public on(event: SessionEvent, cb: (s: GameSession) => void): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(cb);
    this.listeners.set(event, set);
    return () => set.delete(cb);
  }

  public emit(event: SessionEvent): void {
    for (const cb of [...(this.listeners.get(event) ?? [])]) cb(this);
  }
}
