/**
 * Deterministic, solver-free arcade services for `@aura3d/lean/game`.
 *
 * This module deliberately owns no rigid-body world. Games that need physical
 * simulation opt into `@aura3d/physics-rapier`; the lean game entry provides
 * keyboard/action mapping and fixed-contract platform motion only.
 */

export interface LeanGameInputOptions {
  readonly actions: Readonly<Record<string, readonly string[]>>;
  readonly axes?: Readonly<Record<string, { readonly negative: string; readonly positive: string }>>;
  readonly bufferMs?: number;
  readonly autoListen?: boolean;
}

export interface LeanGameInputController {
  update(deltaSeconds: number): void;
  held(action: string): boolean;
  pressed(action: string): boolean;
  buffered(action: string): boolean;
  axis(axis: string): number;
  press(binding: string): void;
  release(binding: string): void;
  dispose(): void;
}

export function createLeanGameInput(options: LeanGameInputOptions): LeanGameInputController {
  const heldBindings = new Set<string>();
  const pendingPresses = new Set<string>();
  const pressedActions = new Set<string>();
  const lastPressedAt = new Map<string, number>();
  let timeMs = 0;

  const actionsForBinding = (binding: string): string[] => Object.entries(options.actions)
    .filter(([, bindings]) => bindings.includes(binding))
    .map(([action]) => action);
  const press = (binding: string): void => {
    if (!heldBindings.has(binding)) pendingPresses.add(binding);
    heldBindings.add(binding);
  };
  const release = (binding: string): void => { heldBindings.delete(binding); };
  const onKeyDown = (event: KeyboardEvent): void => press(event.code);
  const onKeyUp = (event: KeyboardEvent): void => release(event.code);
  if (options.autoListen !== false && typeof window !== "undefined") {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }

  return {
    update(deltaSeconds) {
      timeMs += Math.max(0, deltaSeconds) * 1_000;
      pressedActions.clear();
      for (const binding of pendingPresses) {
        for (const action of actionsForBinding(binding)) {
          pressedActions.add(action);
          lastPressedAt.set(action, timeMs);
        }
      }
      pendingPresses.clear();
    },
    held(action) {
      return (options.actions[action] ?? []).some((binding) => heldBindings.has(binding));
    },
    pressed(action) { return pressedActions.has(action); },
    buffered(action) {
      const pressedAt = lastPressedAt.get(action);
      return pressedAt !== undefined && timeMs - pressedAt <= (options.bufferMs ?? 120);
    },
    axis(axis) {
      const mapping = options.axes?.[axis];
      if (!mapping) return 0;
      return Number(this.held(mapping.positive)) - Number(this.held(mapping.negative));
    },
    press,
    release,
    dispose() {
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
      }
      heldBindings.clear();
      pendingPresses.clear();
      pressedActions.clear();
    }
  };
}

export interface LeanPlatformPoint { readonly x: number; readonly y: number }
export interface LeanPlatformRect extends LeanPlatformPoint { readonly id: string; readonly width: number; readonly height: number }
export interface LeanMovingPlatform extends LeanPlatformRect {
  readonly axis: "x" | "y";
  readonly amplitude: number;
  readonly period: number;
  readonly phase?: number;
}
export interface LeanCollectible extends LeanPlatformPoint { readonly id: string; readonly value?: number; readonly radius?: number }
export interface LeanHazard extends LeanPlatformRect { readonly respawn?: boolean }
export interface LeanCheckpoint extends LeanPlatformPoint { readonly id: string; readonly radius?: number }

export interface LeanPlatformerLevel {
  readonly id?: string;
  readonly start?: LeanPlatformPoint;
  readonly finish?: LeanPlatformPoint;
  readonly platforms?: readonly LeanPlatformRect[];
  readonly movingPlatforms?: readonly LeanMovingPlatform[];
  readonly collectibles?: readonly LeanCollectible[];
  readonly hazards?: readonly LeanHazard[];
  readonly checkpoints?: readonly LeanCheckpoint[];
  readonly lowerBound?: number;
  readonly gravity?: number;
  readonly moveSpeed?: number;
  readonly jumpVelocity?: number;
  readonly dashSpeed?: number;
  readonly lives?: number;
}

export interface LeanPlatformerInput {
  readonly moveX?: number;
  readonly jumpPressed?: boolean;
  readonly jumpHeld?: boolean;
  readonly dashPressed?: boolean;
  readonly fastFall?: boolean;
  readonly reset?: boolean;
}

export type LeanPlatformerEventType = "jump" | "dash" | "land" | "collect" | "checkpoint" | "hazard" | "fall" | "respawn" | "complete" | "reset";
export interface LeanPlatformerEvent {
  readonly type: LeanPlatformerEventType;
  readonly id?: string;
  readonly frame: number;
  readonly time: number;
}

export interface LeanPlatformerSnapshot {
  readonly status: "playing" | "completed" | "failed";
  readonly frame: number;
  readonly time: number;
  readonly player: { readonly x: number; readonly y: number; readonly vx: number; readonly vy: number; readonly grounded: boolean };
  readonly score: number;
  readonly lives: number;
  readonly deaths: number;
  readonly checkpointId: string;
  readonly collected: readonly string[];
  readonly activatedCheckpoints: readonly string[];
  readonly events: readonly LeanPlatformerEvent[];
}

export interface LeanPlatformerController {
  step(deltaSeconds: number, input?: LeanPlatformerInput): LeanPlatformerSnapshot;
  reset(): LeanPlatformerSnapshot;
  snapshot(): LeanPlatformerSnapshot;
}

export function createLeanPlatformer(level: LeanPlatformerLevel): LeanPlatformerController {
  const config = {
    start: level.start ?? { x: 0, y: 0.35 },
    finish: level.finish ?? { x: 8, y: 0.35 },
    platforms: level.platforms ?? [{ id: "ground", x: -1, y: 0, width: 10, height: 0.35 }],
    movingPlatforms: level.movingPlatforms ?? [],
    collectibles: level.collectibles ?? [],
    hazards: level.hazards ?? [],
    checkpoints: level.checkpoints ?? [],
    lowerBound: level.lowerBound ?? -3,
    gravity: level.gravity ?? -22,
    moveSpeed: level.moveSpeed ?? 5.25,
    jumpVelocity: level.jumpVelocity ?? 8.25,
    dashSpeed: level.dashSpeed ?? 9,
    lives: level.lives ?? 3
  };
  const playerWidth = 0.45;
  const playerHeight = 1;
  let state = initialState();
  let events: LeanPlatformerEvent[] = [];

  function initialState() {
    return {
      status: "playing" as "playing" | "completed" | "failed",
      frame: 0,
      time: 0,
      player: { x: config.start.x, y: config.start.y, vx: 0, vy: 0, grounded: true },
      score: 0,
      lives: config.lives,
      deaths: 0,
      checkpointId: "start",
      collected: new Set<string>(),
      activated: new Set<string>(),
      dashCooldown: 0
    };
  }
  const emit = (type: LeanPlatformerEventType, id?: string): void => {
    events.push({ type, ...(id ? { id } : {}), frame: state.frame, time: state.time });
  };
  const spawn = (): LeanPlatformPoint => config.checkpoints.find((checkpoint) => checkpoint.id === state.checkpointId) ?? config.start;
  const respawn = (reason: "hazard" | "fall", id?: string): void => {
    emit(reason, id);
    state.deaths += 1;
    state.lives = Math.max(0, state.lives - 1);
    if (state.lives === 0) state.status = "failed";
    const point = spawn();
    state.player = { x: point.x, y: point.y, vx: 0, vy: 0, grounded: false };
    emit("respawn", state.checkpointId);
  };
  const movingRects = (time: number): readonly LeanPlatformRect[] => config.movingPlatforms.map((platform) => {
    const offset = Math.sin((time / Math.max(0.001, platform.period)) * Math.PI * 2 + (platform.phase ?? 0)) * platform.amplitude;
    return { ...platform, x: platform.x + (platform.axis === "x" ? offset : 0), y: platform.y + (platform.axis === "y" ? offset : 0) };
  });
  const snapshot = (): LeanPlatformerSnapshot => ({
    status: state.status,
    frame: state.frame,
    time: state.time,
    player: { ...state.player },
    score: state.score,
    lives: state.lives,
    deaths: state.deaths,
    checkpointId: state.checkpointId,
    collected: [...state.collected].sort(),
    activatedCheckpoints: [...state.activated].sort(),
    events: [...events]
  });

  return {
    step(deltaSeconds, input = {}) {
      if (input.reset) return this.reset();
      events = [];
      if (state.status !== "playing") return snapshot();
      const dt = Math.min(0.05, Math.max(0, deltaSeconds));
      const previousBottom = state.player.y;
      const wasGrounded = state.player.grounded;
      state.frame += 1;
      state.time += dt;
      state.dashCooldown = Math.max(0, state.dashCooldown - dt);
      state.player.vx = clamp(input.moveX ?? 0, -1, 1) * config.moveSpeed;
      if (input.dashPressed && state.dashCooldown === 0) {
        state.player.vx = Math.sign(input.moveX || state.player.vx || 1) * config.dashSpeed;
        state.dashCooldown = 0.38;
        emit("dash");
      }
      if (input.jumpPressed && state.player.grounded) {
        state.player.vy = config.jumpVelocity;
        state.player.grounded = false;
        emit("jump");
      }
      state.player.vy += config.gravity * (input.fastFall && state.player.vy < 0 ? 1.6 : 1) * dt;
      state.player.x += state.player.vx * dt;
      state.player.y += state.player.vy * dt;
      state.player.grounded = false;

      for (const platform of [...config.platforms, ...movingRects(state.time)]) {
        const top = platform.y + platform.height;
        const overlapsX = state.player.x + playerWidth / 2 >= platform.x && state.player.x - playerWidth / 2 <= platform.x + platform.width;
        if (overlapsX && state.player.vy <= 0 && previousBottom >= top - 0.08 && state.player.y <= top) {
          state.player.y = top;
          state.player.vy = 0;
          state.player.grounded = true;
          if (!wasGrounded) emit("land", platform.id);
          break;
        }
      }

      for (const collectible of config.collectibles) {
        if (state.collected.has(collectible.id)) continue;
        if (Math.hypot(state.player.x - collectible.x, state.player.y + playerHeight / 2 - collectible.y) <= (collectible.radius ?? 0.55)) {
          state.collected.add(collectible.id);
          state.score += collectible.value ?? 1;
          emit("collect", collectible.id);
        }
      }
      for (const checkpoint of config.checkpoints) {
        if (state.activated.has(checkpoint.id)) continue;
        if (Math.hypot(state.player.x - checkpoint.x, state.player.y - checkpoint.y) <= (checkpoint.radius ?? 0.8)) {
          state.checkpointId = checkpoint.id;
          state.activated.add(checkpoint.id);
          emit("checkpoint", checkpoint.id);
        }
      }
      for (const hazard of config.hazards) {
        if (rectOverlap(state.player.x - playerWidth / 2, state.player.y, playerWidth, playerHeight, hazard)) {
          respawn("hazard", hazard.id);
          break;
        }
      }
      if (state.player.y < config.lowerBound) respawn("fall");
      if (state.player.x >= config.finish.x && Math.abs(state.player.y - config.finish.y) < 1.5) {
        state.status = "completed";
        emit("complete");
      }
      return snapshot();
    },
    reset() {
      state = initialState();
      events = [];
      emit("reset");
      return snapshot();
    },
    snapshot
  };
}

function rectOverlap(x: number, y: number, width: number, height: number, rect: LeanPlatformRect): boolean {
  return x < rect.x + rect.width && x + width > rect.x && y < rect.y + rect.height && y + height > rect.y;
}

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
