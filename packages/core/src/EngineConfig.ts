import { ValidationError } from "./Errors.js";

export interface EngineConfig {
  targetFPS?: number;
  fixedDelta?: number;
  maxDelta?: number;
  maxFixedSteps?: number;
  timeScale?: number;
  autoStart?: boolean;
}

export interface ResolvedEngineConfig {
  readonly targetFPS: number;
  readonly fixedDelta: number;
  readonly maxDelta: number;
  readonly maxFixedSteps: number;
  readonly timeScale: number;
  readonly autoStart: boolean;
}

export function resolveEngineConfig(config: EngineConfig = {}): ResolvedEngineConfig {
  const resolved = {
    targetFPS: config.targetFPS ?? 60,
    fixedDelta: config.fixedDelta ?? 1 / 60,
    maxDelta: config.maxDelta ?? 0.25,
    maxFixedSteps: config.maxFixedSteps ?? 5,
    timeScale: config.timeScale ?? 1,
    autoStart: config.autoStart ?? false
  };

  if (!Number.isFinite(resolved.targetFPS) || resolved.targetFPS <= 0) throw new ValidationError("INVALID_TARGET_FPS", "targetFPS must be positive.");
  if (!Number.isFinite(resolved.fixedDelta) || resolved.fixedDelta <= 0) throw new ValidationError("INVALID_FIXED_DELTA", "fixedDelta must be positive.");
  if (!Number.isFinite(resolved.maxDelta) || resolved.maxDelta <= 0) throw new ValidationError("INVALID_MAX_DELTA", "maxDelta must be positive.");
  if (!Number.isInteger(resolved.maxFixedSteps) || resolved.maxFixedSteps <= 0) throw new ValidationError("INVALID_MAX_FIXED_STEPS", "maxFixedSteps must be a positive integer.");
  if (!Number.isFinite(resolved.timeScale) || resolved.timeScale < 0) throw new ValidationError("INVALID_TIME_SCALE", "timeScale must be finite and non-negative.");

  return Object.freeze(resolved);
}
