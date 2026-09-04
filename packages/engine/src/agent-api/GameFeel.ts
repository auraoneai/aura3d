/**
 * Generalized game-feel kit (muse3jsparity-PRD F3).
 *
 * Generalizes the combat-proven pieces: `hitStop` durations come from the
 * fighting kit (`game-kits/fighting.ts`: light 0.045s, heavy 0.07s,
 * special 0.1s) and the pixel path reuses the `createGameEffects` kinds
 * (`hit-spark`, `impact-flash`, `dash-trail`, `ground-dust`, ...), so every
 * effect below resolves to real scene nodes through `nodes()` — never DOM,
 * canvas, or CSS fakes (boundaries rule).
 *
 * This module is engine-pure and owns no renderer: the effects controller is
 * injected through {@link GameFeelEffectsPort}, which `createGameEffects`
 * (in `GameRuntime.ts`) satisfies structurally. A kit without a wired
 * controller refuses pixel-backed triggers with an explicit receipt instead
 * of faking success. All triggers are frame-budgeted and every trigger
 * returns a receipt; `snapshot()` is the telemetry surface.
 */

import type {
  GameEffectInstance,
  GameEffectKind,
  GameEffectsSnapshot,
  GameVec3
} from "./GameRuntime.js";

/** Combat-proven hit-stop defaults, generalized (fighting kit values). */
export const GAME_FEEL_HIT_STOP_LIGHT_S = 0.045;
export const GAME_FEEL_HIT_STOP_HEAVY_S = 0.07;
export const GAME_FEEL_HIT_STOP_SPECIAL_S = 0.1;
export const GAME_FEEL_HIT_STOP_DEFAULT_S = 0.06;

export type GameFeelEffectKind = GameEffectKind;

export interface GameFeelEffectsPort {
  spawn(kind: GameFeelEffectKind, position: GameVec3, options?: { color?: string; intensity?: number; duration?: number; radius?: number; ownerId?: string }): GameEffectInstance;
  update(dt: number): GameEffectsSnapshot;
  snapshot(): GameEffectsSnapshot;
  nodes(): readonly unknown[];
  clear(): void;
}

export interface GameFeelOptions {
  readonly effects?: GameFeelEffectsPort;
  /** Per-update wall-clock budget in milliseconds. Default 2. */
  readonly budgetMs?: number;
  readonly enabled?: boolean;
}

export interface GameFeelReceipt {
  readonly accepted: boolean;
  readonly reason?: string;
  readonly effectId?: string;
}

export interface GameFeelBudgetTelemetry {
  readonly lastMs: number;
  readonly maxMs: number;
  readonly budgetMs: number;
  readonly overBudget: boolean;
  readonly overBudgetCount: number;
  readonly updates: number;
}

export interface GameFeelSnapshot {
  readonly kind: "aura-game-feel";
  readonly enabled: boolean;
  readonly timeScale: number;
  readonly frozen: boolean;
  readonly slowMoActive: boolean;
  readonly hitStopActive: boolean;
  readonly flashActive: boolean;
  readonly lineIntensity: number;
  readonly dustSpawned: number;
  readonly effectsActive: number;
  readonly effectsSpawned: number;
  readonly budget: GameFeelBudgetTelemetry;
}

export interface GameFeel {
  readonly effectsWired: boolean;
  setEnabled(enabled: boolean): void;
  slowMo(scale: number, durationMs: number): GameFeelReceipt;
  hitStop(durationMs: number): GameFeelReceipt;
  damageFlash(color: string, position?: GameVec3): GameFeelReceipt;
  speedLines(intensity: number, position?: GameVec3): GameFeelReceipt;
  landingDust(position: GameVec3): GameFeelReceipt;
  /** Scaled frame delta: `dtMs * timeScale`. Routes step gameplay with this. */
  effectiveDt(dtMs: number): number;
  update(dtMs: number): GameFeelSnapshot;
  snapshot(): GameFeelSnapshot;
  nodes(): readonly unknown[];
  clear(): void;
}

function assertFinite(value: number, api: string, field: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${api} ${field} must be finite (received ${String(value)}).`);
  }
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  return Date.now();
}

export function createGameFeel(options: GameFeelOptions = {}): GameFeel {
  const budgetMs = options.budgetMs ?? 2;
  assertFinite(budgetMs, "gameFeel", "budgetMs");
  if (budgetMs < 0) throw new RangeError("gameFeel budgetMs must be >= 0.");

  let enabled = options.enabled ?? true;
  const effects = options.effects;

  let slowMoScale = 1;
  let slowMoRemainingMs = 0;
  let hitStopRemainingMs = 0;
  let flashRemainingMs = 0;
  let lineIntensity = 0;
  let lineRemainingMs = 0;
  let dustSpawned = 0;

  let updates = 0;
  let lastMs = 0;
  let maxMs = 0;
  let overBudgetCount = 0;

  const disabled = (effect: string): GameFeelReceipt => ({
    accepted: false,
    reason: `gameFeel.${effect} rejected: kit disabled (setEnabled(true) to resume).`
  });
  const unwired = (effect: string): GameFeelReceipt => ({
    accepted: false,
    reason: `gameFeel.${effect} rejected: no effects controller wired (pass options.effects).`
  });

  const timeScale = (): number => {
    if (hitStopRemainingMs > 0) return 0;
    if (slowMoRemainingMs > 0) return slowMoScale;
    return 1;
  };

  const budget = (): GameFeelBudgetTelemetry => ({
    lastMs,
    maxMs,
    budgetMs,
    overBudget: lastMs > budgetMs,
    overBudgetCount,
    updates
  });

  const snap = (): GameFeelSnapshot => {
    const effectsSnapshot = effects?.snapshot();
    return {
      kind: "aura-game-feel",
      enabled,
      timeScale: timeScale(),
      frozen: hitStopRemainingMs > 0,
      slowMoActive: slowMoRemainingMs > 0,
      hitStopActive: hitStopRemainingMs > 0,
      flashActive: flashRemainingMs > 0,
      lineIntensity: lineRemainingMs > 0 ? lineIntensity : 0,
      dustSpawned,
      effectsActive: effectsSnapshot?.active ?? 0,
      effectsSpawned: effectsSnapshot?.spawned ?? 0,
      budget: budget()
    };
  };

  return {
    get effectsWired(): boolean {
      return effects !== undefined;
    },
    setEnabled(next: boolean): void {
      enabled = next === true;
      if (!enabled) {
        slowMoRemainingMs = 0;
        hitStopRemainingMs = 0;
        flashRemainingMs = 0;
        lineRemainingMs = 0;
        lineIntensity = 0;
        slowMoScale = 1;
      }
    },
    slowMo(scale: number, durationMs: number): GameFeelReceipt {
      const api = "gameFeel.slowMo";
      assertFinite(scale, api, "scale");
      assertFinite(durationMs, api, "durationMs");
      if (scale < 0 || scale > 1) throw new RangeError(`${api} scale must be in [0, 1].`);
      if (durationMs <= 0) throw new RangeError(`${api} durationMs must be > 0.`);
      if (!enabled) return disabled("slowMo");
      slowMoScale = scale;
      slowMoRemainingMs = durationMs;
      return { accepted: true };
    },
    hitStop(durationMs: number): GameFeelReceipt {
      const api = "gameFeel.hitStop";
      assertFinite(durationMs, api, "durationMs");
      if (durationMs <= 0) throw new RangeError(`${api} durationMs must be > 0.`);
      if (!enabled) return disabled("hitStop");
      // Generalized from the fighting kit: a full freeze for the window.
      hitStopRemainingMs = Math.max(hitStopRemainingMs, durationMs);
      return { accepted: true };
    },
    damageFlash(color: string, position: GameVec3 = [0, 1, 0]): GameFeelReceipt {
      const api = "gameFeel.damageFlash";
      if (typeof color !== "string" || color.length === 0) {
        throw new RangeError(`${api} color must be a non-empty string.`);
      }
      if (!enabled) return disabled("damageFlash");
      if (!effects) return unwired("damageFlash");
      const effect = effects.spawn("impact-flash", position, { color, intensity: 1, duration: 0.12 });
      flashRemainingMs = 120;
      return { accepted: true, effectId: effect.id };
    },
    speedLines(intensity: number, position: GameVec3 = [0, 1, -1]): GameFeelReceipt {
      const api = "gameFeel.speedLines";
      assertFinite(intensity, api, "intensity");
      if (intensity < 0 || intensity > 1) throw new RangeError(`${api} intensity must be in [0, 1].`);
      if (!enabled) return disabled("speedLines");
      if (!effects) return unwired("speedLines");
      const effect = effects.spawn(intensity > 0.6 ? "slash-trail" : "dash-trail", position, {
        intensity,
        duration: 0.28
      });
      lineIntensity = intensity;
      lineRemainingMs = 280;
      return { accepted: true, effectId: effect.id };
    },
    landingDust(position: GameVec3): GameFeelReceipt {
      const api = "gameFeel.landingDust";
      if (!Array.isArray(position) || position.length !== 3 || position.some((c) => !Number.isFinite(c))) {
        throw new RangeError(`${api} position must be a finite [x, y, z] tuple.`);
      }
      if (!enabled) return disabled("landingDust");
      if (!effects) return unwired("landingDust");
      const effect = effects.spawn("ground-dust", position, { intensity: 0.8, duration: 0.34 });
      dustSpawned += 1;
      return { accepted: true, effectId: effect.id };
    },
    effectiveDt(dtMs: number): number {
      assertFinite(dtMs, "gameFeel.effectiveDt", "dtMs");
      return Math.max(0, dtMs) * timeScale();
    },
    update(dtMs: number): GameFeelSnapshot {
      assertFinite(dtMs, "gameFeel.update", "dtMs");
      const started = nowMs();
      const step = Math.max(0, dtMs);
      slowMoRemainingMs = Math.max(0, slowMoRemainingMs - step);
      if (slowMoRemainingMs === 0) slowMoScale = 1;
      hitStopRemainingMs = Math.max(0, hitStopRemainingMs - step);
      flashRemainingMs = Math.max(0, flashRemainingMs - step);
      lineRemainingMs = Math.max(0, lineRemainingMs - step);
      if (lineRemainingMs === 0) lineIntensity = 0;
      effects?.update(step / 1000);
      updates += 1;
      lastMs = nowMs() - started;
      maxMs = Math.max(maxMs, lastMs);
      if (lastMs > budgetMs) overBudgetCount += 1;
      return snap();
    },
    snapshot: snap,
    nodes(): readonly unknown[] {
      return effects?.nodes() ?? [];
    },
    clear(): void {
      effects?.clear();
      slowMoRemainingMs = 0;
      hitStopRemainingMs = 0;
      flashRemainingMs = 0;
      lineRemainingMs = 0;
      lineIntensity = 0;
      slowMoScale = 1;
    }
  };
}

/**
 * Root-bridge namespace (wiring lives in `agent-api/index.ts`, owned by the
 * bridge sibling — this object is the exact surface to expose as `gameFeel`).
 */
export const gameFeelBuilders = {
  create: createGameFeel,
  hitStopDefaults: {
    light: GAME_FEEL_HIT_STOP_LIGHT_S,
    heavy: GAME_FEEL_HIT_STOP_HEAVY_S,
    special: GAME_FEEL_HIT_STOP_SPECIAL_S,
    default: GAME_FEEL_HIT_STOP_DEFAULT_S
  }
} as const;
