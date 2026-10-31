import {
  BEST_KEY,
  CHAIN_SECONDS,
  CRASH_SLOWMO,
  CRASH_TO_GAMEOVER,
  DIFFICULTY_DISTANCE,
  FIXED_DT,
  HONK_GATE,
  INPUT_EDGES,
  INPUT_HELD,
  INPUT_KEYS,
  TOD_CYCLE_DISTANCE,
  emptyInput,
  type InputFrame,
  type InputKey
} from "./constants";
import { clamp01, Vector3 } from "./math";
import type { Player, PlayerEventName } from "./player";
import type { Traffic, TrafficEvent } from "./traffic";
import type { FreewayWorld, WorldEvent } from "./world";

export type GameMode = "title" | "playing" | "crashed" | "gameover";

export interface GameHud {
  popup?(text: string, points: number, style?: string): void;
  update?(state: { score: number; distance: number; bolts: number; mult: number; comboT: number; air: number; airMax: number; powerups: Record<string, number>; speed?: number; nextMilestone?: number }): void;
  showRun?(): void;
  showTitle?(best: number): void;
  hideTitle?(): void;
  showPause?(visible: boolean): void;
  showGameOver?(summary: { score: number; best: number; isBest: boolean; distance: number; bolts: number; bestCombo: number; assisted?: boolean }): void;
  hideGameOver?(): void;
  flashAir?(): void;
  clearPopups?(): void;
}
export interface GameAudio {
  sfx?(name: string, options?: { pitch?: number; volume?: number }): void;
  music?(kind: "title" | "run" | "rocket" | null): void;
  say?(name: string, options?: { force?: boolean | string }): void;
  setEngine?(speed01: number, thrust: number, boosting: boolean): void;
  unlock?(): void;
  quiet?(): void;
}
export interface InputSource {
  poll(): Partial<InputFrame>;
  reset?(): void;
}

export interface GameOptions {
  player: Player;
  traffic: Traffic;
  world: FreewayWorld;
  input?: InputSource;
  hud?: GameHud;
  audio?: GameAudio;
  params?: URLSearchParams;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  drawCalls?: () => number;
}

const ROLL_LABELS = ["Barrel roll!", "Double roll!", "Triple roll!", "Quad roll!"];
const POWERUP_LABELS: Record<string, string> = { magnet: "Bolt magnet", rocket: "Rocket!", shield: "Shield up", multiplier: "Double points", air: "Air refill" };

/** The Apex Overdrive run: fixed-step simulation, scoring and combo chain, pickups, crash and game-over flow. */
export class RoadsterGame {
  readonly player: Player;
  readonly traffic: Traffic;
  readonly world: FreewayWorld;
  input?: InputSource;
  hud?: GameHud;
  audio?: GameAudio;
  mode: GameMode = "title";
  paused = false;
  simPaused = false;
  manual = false;
  activePreset: string | null = null;
  best = 0;
  seed = 42;
  fixedSeed: number | null;
  startZ = 0;
  crashWhat: string | null = null;
  /** True once a QA/demo scenario button or the autopilot touched this run; an assisted run never sets the saved best. */
  assisted = false;
  readonly env: { difficulty: number; supportHeight(x: number, z: number, y: number): number };

  distance = 0;
  score = 0;
  bolts = 0;
  chain = 0;
  chainTimer = 0;
  mult = 1;
  bestCombo = 1;
  time = 0;
  airTime = 0;
  airRolls = 0;
  roofTime = 0;
  roofAwarded = false;
  skyAnnounced = false;
  nextMilestone = 1000;
  boltStreak = 0;
  boltStreakT = 0;
  honkGate = 0;
  crashT = 0;
  overT = 0;
  comboVoiced = false;
  lastTod = -1;
  hudOverride: { air: number } | null = null;

  private params: URLSearchParams;
  private storage: Pick<Storage, "getItem" | "setItem"> | null;
  private drawCalls: () => number;
  private acc = 0;
  /** Called after every fixed simulation step the wall-clock driver runs (presentation interpolation pushes its snapshot here). */
  afterStep: (() => void) | null = null;
  private lastNow = 0;
  private frame: InputFrame = emptyInput();
  private emptyInput: InputFrame = emptyInput();
  private harness = { edges: {} as Record<string, boolean>, held: {} as Record<string, number> };
  private tmp = new Vector3();

  constructor(options: GameOptions) {
    this.player = options.player;
    this.traffic = options.traffic;
    this.world = options.world;
    this.input = options.input;
    this.hud = options.hud;
    this.audio = options.audio;
    this.params = options.params ?? new URLSearchParams();
    this.storage = options.storage === undefined ? safeStorage() : options.storage;
    this.drawCalls = options.drawCalls ?? (() => 0);
    const seedParam = this.params.get("seed");
    this.fixedSeed = seedParam != null && seedParam !== "" ? parseInt(seedParam, 10) || 42 : null;
    this.seed = this.fixedSeed == null ? 42 : this.fixedSeed;
    try {
      this.best = parseInt(this.storage?.getItem(BEST_KEY) || "0", 10) || 0;
    } catch {
      this.best = 0;
    }
    for (const k of INPUT_EDGES) this.harness.edges[k] = false;
    for (const k of INPUT_HELD) this.harness.held[k] = 0;
    const self = this;
    this.env = {
      difficulty: 0,
      supportHeight(x, z, y) {
        return self.traffic.supportHeight(x, z, y);
      }
    };
    this.resetStats();
    this.player.onEvent = (name, payload) => this.onPlayerEvent(name, payload);
    this.traffic.onEvent = (name, payload) => this.onTrafficEvent(name, payload);
    this.traffic.world = this.world;
  }

  boot(): void {
    this.resetWorld();
    this.enterTitle();
  }

  private resetStats(): void {
    this.distance = 0;
    this.score = 0;
    this.bolts = 0;
    this.chain = 0;
    this.chainTimer = 0;
    this.mult = 1;
    this.bestCombo = 1;
    this.time = 0;
    this.airTime = 0;
    this.airRolls = 0;
    this.roofTime = 0;
    this.roofAwarded = false;
    this.skyAnnounced = false;
    this.nextMilestone = 1000;
    this.boltStreak = 0;
    this.boltStreakT = 0;
    this.honkGate = 0;
    this.crashT = 0;
    this.overT = 0;
    this.comboVoiced = false;
    this.lastTod = -1;
    this.hudOverride = null;
  }

  private resetWorld(): void {
    const seed = this.fixedSeed == null ? (Math.random() * 1e9) | 0 : this.fixedSeed;
    this.seed = seed;
    this.player.reset();
    this.traffic.reset(seed);
    this.world.reset();
    this.world.setTimeOfDay(0);
    this.lastTod = 0;
    this.input?.reset?.();
    for (const k of INPUT_EDGES) this.harness.edges[k] = false;
    for (const k of INPUT_HELD) this.harness.held[k] = 0;
    this.startZ = this.player.position.z;
  }

  private enterTitle(): void {
    this.mode = "title";
    this.activePreset = null;
    this.simPaused = false;
    this.hud?.showTitle?.(this.best);
    this.audio?.music?.("title");
  }

  /** Begin (or restart) a run. */
  start(): void {
    if (this.mode === "playing" && !this.activePreset) return;
    this.resetStats();
    this.resetWorld();
    this.activePreset = null;
    this.simPaused = false;
    this.paused = false;
    this.mode = "playing";
    this.crashWhat = null;
    this.assisted = false;
    this.hud?.hideTitle?.();
    this.hud?.hideGameOver?.();
    this.hud?.showRun?.();
    this.hud?.showPause?.(false);
    this.audio?.unlock?.();
    this.audio?.sfx?.("ui");
    this.audio?.music?.("run");
    this.audio?.say?.("start", { force: "always" });
  }

  requestStart(): void {
    this.start();
  }

  /** Mark the current run as assisted (scenario buttons, autopilot): it still scores, but cannot become the saved best. */
  markAssisted(): void {
    if (this.mode === "playing" || this.mode === "crashed") this.assisted = true;
  }

  togglePause(force?: boolean): void {
    if (this.mode !== "playing" || this.activePreset) return;
    const next = force ?? !this.paused;
    if (next === this.paused) return;
    this.paused = next;
    this.hud?.showPause?.(next);
    if (next) {
      this.audio?.quiet?.();
      this.audio?.music?.(null);
    } else this.audio?.music?.((this.player.rocketTimer || 0) > 0 ? "rocket" : "run");
    this.input?.reset?.();
  }

  private crash(what: string): void {
    if (this.mode !== "playing") return;
    if (this.player.alive !== false) this.player.crash();
    this.mode = "crashed";
    this.crashT = 0;
    this.audio?.sfx?.("crash");
    this.audio?.music?.(null);
    this.audio?.quiet?.();
    this.audio?.say?.("crash", { force: "always" });
    this.crashWhat = what || "traffic";
  }

  private gameOver(): void {
    this.mode = "gameover";
    this.overT = 0;
    const score = Math.floor(this.score);
    const isBest = !this.assisted && score > this.best;
    if (isBest) {
      this.best = score;
      try {
        this.storage?.setItem(BEST_KEY, String(score));
      } catch {
        /* storage unavailable */
      }
    }
    this.hud?.showGameOver?.({ score, best: this.best, isBest, distance: this.distance, bolts: this.bolts, bestCombo: this.bestCombo, assisted: this.assisted });
    this.audio?.music?.("title");
  }

  private pollInput(dt: number): InputFrame {
    const polled = this.input && this.input.poll ? this.input.poll() : this.emptyInput;
    const frame = this.frame;
    for (const key of INPUT_KEYS) frame[key] = !!polled[key];
    const h = this.harness;
    for (const key of INPUT_EDGES) {
      if (h.edges[key]) {
        frame[key] = true;
        h.edges[key] = false;
      }
    }
    for (const key of INPUT_HELD) {
      if (h.held[key]! > 0) {
        frame[key] = true;
        h.held[key]! -= dt;
      }
    }
    return frame;
  }

  /** Advance the simulation by one fixed step (`dt` seconds). */
  simStep(dt: number): void {
    const input = this.pollInput(dt);
    switch (this.mode) {
      case "title":
        if (input.startPressed) this.requestStart();
        break;
      case "playing":
        if (input.pausePressed && !this.activePreset) {
          this.togglePause();
          return;
        }
        this.play(dt, input);
        break;
      case "crashed": {
        this.crashT += dt;
        const slow = dt * CRASH_SLOWMO;
        this.player.update(slow, this.emptyInput, this.env);
        this.traffic.update(slow, this.player, this.env.difficulty);
        this.ambient(slow);
        if (this.crashT >= CRASH_TO_GAMEOVER) this.gameOver();
        break;
      }
      case "gameover":
        this.overT += dt;
        if (input.startPressed && this.overT > 0.7) {
          this.start();
          return;
        }
        this.player.update(dt * 0.5, this.emptyInput, this.env);
        this.ambient(dt);
        break;
    }
  }

  private ambient(dt: number): void {
    this.world.update(dt, this.player.position);
  }

  private play(dt: number, input: InputFrame): void {
    const p = this.player;
    this.time += dt;
    this.env.difficulty = clamp01(this.distance / DIFFICULTY_DISTANCE);
    const wasGrounded = p.grounded;
    p.update(dt, input, this.env);
    this.traffic.update(dt, p, this.env.difficulty);
    const hits = this.traffic.checkCollisions(p);
    for (let i = 0; i < hits.length; i++) {
      this.onCollision(hits[i]!);
      if (this.mode !== "playing") break;
    }
    if (this.mode === "playing") {
      const worldHits = this.world.checkCollisions(p, dt);
      for (let i = 0; i < worldHits.length; i++) {
        this.onCollision(worldHits[i]!);
        if (this.mode !== "playing") break;
      }
    }
    if (this.mode !== "playing") {
      this.ambient(dt);
      return;
    }
    const travelled = Math.max(0, this.startZ - p.position.z);
    const delta = travelled - this.distance;
    this.distance = travelled;
    if (delta > 0) this.score += delta * this.mult;
    if (this.chainTimer > 0) {
      this.chainTimer -= dt;
      if (this.chainTimer <= 0) {
        this.chain = 0;
        this.chainTimer = 0;
      }
    }
    this.updateMult();
    if (!p.grounded && p.alive !== false) this.airTime += dt;
    else if (wasGrounded === false && p.grounded && this.airTime > 0) this.landed();
    if (p.grounded && (p.supportY || 0) > 0.6) {
      this.roofTime += dt;
      this.score += 30 * dt * this.mult;
      if (!this.roofAwarded && this.roofTime > 1) {
        this.roofAwarded = true;
        this.trick("Roof runner", 150);
      }
    } else if (p.grounded) {
      this.roofTime = 0;
      this.roofAwarded = false;
    }
    if (!this.skyAnnounced && p.position.y > 8) {
      this.skyAnnounced = true;
      this.hud?.popup?.("Welcome to the sky lane", 0, "cyan small");
      this.audio?.say?.("sky", { force: true });
    }
    if (this.distance >= this.nextMilestone) {
      const km = Math.round(this.nextMilestone / 1000);
      this.nextMilestone += 1000;
      this.trick(`${km} km!`, 250 * km, "cyan");
      this.audio?.say?.("milestone", { force: km === 1 });
    }
    if (this.boltStreakT > 0) {
      this.boltStreakT -= dt;
      if (this.boltStreakT <= 0) this.boltStreak = 0;
    }
    if (this.honkGate > 0) this.honkGate -= dt;
    const phase = (this.distance / TOD_CYCLE_DISTANCE) % 2;
    const tod = phase < 1 ? phase : 2 - phase;
    if (Math.abs(tod - this.lastTod) > 2e-3) {
      this.lastTod = tod;
      this.world.setTimeOfDay(tod);
    }
    this.ambient(dt);
    const thrusting = p.thrusting == null ? !p.grounded && input.thrust && p.air > 0 : p.thrusting;
    const rocket = (p.rocketTimer || 0) > 0;
    const thrustLevel = rocket || thrusting ? 1 : !p.grounded ? 0.15 : 0;
    this.audio?.setEngine?.(clamp01((p.speed || 0) / 64) + 0.05, thrustLevel, !!(p.boostVisual ?? p.boosting) || rocket);
  }

  private updateMult(): void {
    const next = (1 + Math.min(7, Math.floor(this.chain / 3))) * ((this.player.multiplierTimer || 0) > 0 ? 2 : 1);
    if (next === this.mult) return;
    this.mult = next;
    if (next > this.bestCombo) this.bestCombo = next;
    if (next >= 4 && !this.comboVoiced) {
      this.comboVoiced = true;
      this.audio?.say?.("combo", { force: true });
    }
  }

  private trick(label: string, points: number, style = ""): void {
    this.chain++;
    this.chainTimer = CHAIN_SECONDS;
    this.updateMult();
    const awarded = Math.round(points * this.mult);
    this.score += awarded;
    this.hud?.popup?.(label, awarded, style);
  }

  private landed(): void {
    const t = this.airTime;
    if (t >= 1.6 && this.mode === "playing") this.trick(`Big air ${t.toFixed(1)}s`, Math.round(t * 80), "cyan");
    this.airTime = 0;
    this.airRolls = 0;
  }

  private onCollision(hit: TrafficEvent | WorldEvent): void {
    if (!hit) return;
    const p = this.player;
    switch (hit.type) {
      case "crash":
        if (!p.invulnerable) this.crash(hit.what ?? "traffic");
        break;
      case "scrape": {
        if (p.invulnerable) break;
        p.scrape((hit as TrafficEvent).fromLane);
        this.audio?.sfx?.("scrape");
        this.chain = 0;
        this.chainTimer = 0;
        this.updateMult();
        break;
      }
      case "nearMiss": {
        const high = p.position.y > 7;
        this.trick(high ? "Sky dodge!" : "Close call!", high ? 90 : 50, "cyan");
        this.audio?.sfx?.("nearMiss");
        this.audio?.say?.("closeCall");
        break;
      }
      case "pickup": {
        const pk = hit as TrafficEvent;
        this._pickup(pk.kind ?? "bolt", pk.value ?? 1, pk.position);
        break;
      }
    }
  }

  /** Collect a pickup (bolt, air refill or power-up). */
  _pickup(kind: string, value?: number, position?: { x: number; y: number; z: number } | null): void {
    const p = this.player;
    this.tmp.copy(position ?? p.position);
    if (!kind || kind === "bolt") {
      const n = value || 1;
      this.bolts += n;
      this.score += 10 * n * this.mult;
      this.boltStreak = Math.min(this.boltStreak + 1, 14);
      this.boltStreakT = 0.7;
      this.audio?.sfx?.("bolt", { pitch: 1 + 0.045 * this.boltStreak });
    } else {
      p.applyPickup(kind);
      if (kind === "air") {
        this.audio?.sfx?.("air");
        this.hud?.popup?.(POWERUP_LABELS.air!, 0, "cyan small");
      } else {
        this.audio?.sfx?.("powerup");
        this.hud?.popup?.(POWERUP_LABELS[kind] || "Power up!", 0, kind === "rocket" ? "hot" : "cyan");
      }
    }
  }

  private onPlayerEvent(name: PlayerEventName, payload?: Record<string, unknown>): void {
    const p = this.player;
    const live = this.mode === "playing" && !this.activePreset;
    switch (name) {
      case "hop":
        this.audio?.sfx?.("hop");
        break;
      case "thrust":
        this.audio?.sfx?.("thrust");
        break;
      case "roll": {
        this.audio?.sfx?.("roll");
        if (!live) break;
        const combo = (payload?.combo as number) || (p.grounded ? 1 : this.airRolls + 1);
        this.airRolls = combo;
        const label = combo <= ROLL_LABELS.length ? ROLL_LABELS[combo - 1]! : `${combo}× roll combo!`;
        this.trick(label, combo === 1 ? 80 : 120 * combo, combo >= 3 ? "hot" : "");
        this.audio?.say?.("roll", { force: combo >= 3 });
        break;
      }
      case "land":
        this.audio?.sfx?.("land", { volume: 0.4 + 0.6 * ((payload?.impact as number) || 0.5) });
        if (live) {
          if (payload && payload.airTime != null) this.airTime = Math.max(this.airTime, payload.airTime as number);
          this.landed();
        }
        break;
      case "boost":
        this.audio?.sfx?.("boost");
        break;
      case "airLow":
        this.hud?.flashAir?.();
        this.audio?.say?.("airLow", { force: true });
        break;
      case "stumble":
        this.audio?.sfx?.("scrape", { volume: 0.6 });
        break;
      case "crash":
        if (live) this.crash("player");
        break;
      case "rocketStart":
        this.audio?.music?.("rocket");
        this.audio?.sfx?.("boost");
        break;
      case "rocketEnd":
        if (this.mode === "playing") this.audio?.music?.("run");
        break;
      case "rampLaunch":
        this.audio?.sfx?.("whoosh");
        if (live) this.trick("Ramp launch!", 150, "cyan");
        break;
    }
  }

  private onTrafficEvent(name: string, payload?: unknown): void {
    if (name === "honk") {
      if (this.honkGate > 0 || this.mode !== "playing" || this.activePreset) return;
      this.honkGate = HONK_GATE;
      this.audio?.sfx?.("honk");
    } else if (name === "skyIncoming") {
      if (this.mode !== "playing" || this.activePreset) return;
      this.audio?.sfx?.("whoosh", { volume: 0.45 });
      const y = this.player.position.y || 0;
      const band = (payload as { band?: number } | undefined)?.band ?? 1;
      if ((band === 0 && y > 1.2) || (band >= 1 && y > 5)) this.audio?.say?.("sky");
    }
  }

  updateHud(): void {
    if (!this.hud || this.mode === "title") return;
    const p = this.player;
    const override = this.hudOverride;
    this.hud.update?.({
      score: this.score,
      distance: this.distance,
      bolts: this.bolts,
      mult: this.mult,
      comboT: this.chainTimer / CHAIN_SECONDS,
      air: override && this.activePreset ? override.air : p.air == null ? 100 : p.air,
      airMax: 100,
      powerups: { rocket: p.rocketTimer || 0, shield: p.shieldTimer || 0, magnet: p.magnetTimer || 0, multiplier: p.multiplierTimer || 0 },
      speed: p.speed || 0,
      nextMilestone: this.nextMilestone
    });
  }

  /** Progress through the current fixed step, 0..1: the blend factor for render interpolation. */
  get alpha(): number {
    return Math.max(0, Math.min(1, this.acc / FIXED_DT));
  }

  /** Drive the fixed-step accumulator from a wall clock (ms). */
  frameTick(nowMs: number): void {
    const dt = this.lastNow ? Math.min(0.1, (nowMs - this.lastNow) / 1000) : FIXED_DT;
    this.lastNow = nowMs;
    if (this.paused && !this.manual) {
      const polled = this.input?.poll?.();
      if (polled && (polled.pausePressed || polled.startPressed)) this.togglePause(false);
    } else if (!this.manual && !this.simPaused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < 6) {
        this.simStep(FIXED_DT);
        this.afterStep?.();
        this.acc -= FIXED_DT;
        steps++;
      }
      if (steps >= 6) this.acc = 0;
    }
    this.updateHud();
  }

  getState(): Record<string, unknown> {
    const p = this.player;
    return {
      mode: this.mode,
      paused: this.paused,
      distance: this.distance,
      score: Math.floor(this.score),
      bolts: this.bolts,
      multiplier: this.mult,
      chain: this.chain,
      best: this.best,
      assisted: this.assisted,
      difficulty: this.env.difficulty,
      seed: this.seed,
      player: {
        x: p.position.x,
        y: p.position.y,
        z: p.position.z,
        lane: p.lane,
        targetLane: p.targetLane,
        speed: p.speed,
        air: p.air,
        grounded: !!p.grounded,
        supportY: p.supportY,
        rolling: !!p.rolling,
        alive: p.alive !== false,
        invulnerable: !!p.invulnerable,
        boosting: !!(p.boostVisual ?? p.boosting),
        rocketTimer: p.rocketTimer || 0
      },
      traffic: this.traffic.stats(),
      timeOfDay: this.world.timeOfDay,
      activePreset: this.activePreset,
      crashWhat: this.crashWhat,
      drawCalls: this.drawCalls()
    };
  }

  /** QA/automation entry point: queue an input edge, a held input, or a direct game action. */
  triggerAction(action: string, options: { frames?: number; duration?: number; kind?: string; value?: number; on?: boolean } = {}): Record<string, unknown> {
    const h = this.harness;
    switch (action) {
      case "start":
      case "retry":
        this.start();
        break;
      case "left":
      case "right":
      case "rollLeft":
      case "rollRight":
        h.edges[action] = true;
        break;
      case "hop":
        h.edges.thrustPressed = true;
        h.held.thrust = (options.frames || 3) * FIXED_DT - 1e-6;
        break;
      case "thrustHold":
        h.edges.thrustPressed = true;
        h.held.thrust = options.duration == null ? 1e9 : options.duration;
        break;
      case "thrustRelease":
        h.held.thrust = 0;
        break;
      case "dive":
        h.held.dive = options.duration == null ? 0.4 : options.duration;
        break;
      case "boost":
        h.held.boost = options.on === false ? 0 : options.duration == null ? 1 : options.duration;
        break;
      case "pickup":
        this._pickup(options.kind || "bolt", options.value || 1, null);
        break;
      case "crash":
        this.crash("harness");
        break;
      case "pause":
        this.togglePause();
        break;
      default:
        return { ok: false, error: `unknown action ${action}` };
    }
    return this.getState();
  }

  /** Expose `window.__GAME__` (state, stepping and actions) for tests and tooling. */
  installHarness(target: Record<string, unknown> = window as unknown as Record<string, unknown>): void {
    const game = this;
    target.__GAME__ = {
      game,
      getState: () => game.getState(),
      loadScenePreset: () => false,
      step: (dt = FIXED_DT) => {
        game.manual = true;
        let remaining = Math.max(0, dt);
        let guard = 0;
        while (remaining > 1e-6 && guard++ < 6000) {
          const slice = Math.min(FIXED_DT, remaining);
          game.simStep(slice);
          remaining -= slice;
        }
        game.updateHud();
        return game.getState();
      },
      render: () => game.updateHud(),
      triggerAction: (action: string, options?: Parameters<RoadsterGame["triggerAction"]>[1]) => game.triggerAction(action, options),
      release: () => {
        game.manual = false;
        game.lastNow = 0;
      }
    };
  }
}

function safeStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export type { InputKey };
