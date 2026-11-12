/**
 * WP-05 (`GOV-1`): Zero-remount dynamic thermal & VSync-aware `RuntimeQualityGovernor`.
 *
 * Operates across a 5-rung monotonic degradation ladder (`0` = mount ceiling .. `4` = floor)
 * without ever remounting the scene or invalidating WebGPU `GPURenderPipeline` MSAA caches:
 *  - Skips the first 45 frames and first 1.0 s warmup window.
 *  - Skips `> 100 ms` tab-background / visibility gaps (+ 5 resume settle frames).
 *  - Skips shader-compilation frames (`programCompileCount` delta > 0).
 *  - Detects **iOS Low Power Mode 30 Hz VSync Lock** (`rafDeltaMs` tightly clustered around
 *    `33.33 ms` while `cpuBodyMs < 5.0 ms` and `gpuMs == null`) and holds the current rung
 *    instead of stepping quality down to the floor.
 *  - Asymmetric hysteresis:
 *    - Step down 1 rung when `p75(last 30) > 18.5 ms` AND `>= 20/30` frames exceed budget,
 *      with a `1.5 s` (`1500 ms`) inter-step settle cooldown.
 *    - Step up 1 rung after `8.0 s` (`8000 ms`) post-drop cooldown when `p75(last 180) < 12.5 ms`
 *      AND `p90(last 180) < 14.5 ms`.
 *    - Bounce ceiling lock: if stepping up `R -> R - 1` triggers a step-down within `12.0 s`,
 *      locks ceiling at `R` (`60 s` on first bounce, session-permanent on second bounce).
 */

import type { AuraQualityTier } from "../contracts/quality";
import { TIER_ORDER, tierIndex } from "./QualityTier";

export type RuntimeQualityRung = 0 | 1 | 2 | 3 | 4;

export interface RuntimeQualityRungAllocation {
  readonly rung: RuntimeQualityRung;
  /** Cap applied to devicePixelRatio on resize (`Infinity` = mount tier cap). */
  readonly maxPixelRatioCap: number;
  /** Backing-store resolution scale (`1.0` at ceiling -> `0.67` at floor). */
  readonly resolutionScale: number;
  /** Dynamic render scale passed into the v2 post chain (`1.0` at ceiling). */
  readonly renderScale: number;
  /** Maximum post-processing quality tier allowed at this rung. */
  readonly maxPostTier: AuraQualityTier;
  /** Maximum directional shadow cascade count (`4 -> 3 -> 2 -> 1 -> 1`). */
  readonly maxShadowCascades: 1 | 2 | 3 | 4;
  /** Maximum directional shadow map edge in texels. */
  readonly maxShadowMapSize: 512 | 1024 | 2048 | 4096;
  /** Root performance-quality preset for LOD/particle distance scaling. */
  readonly performancePreset: "high" | "balanced" | "low";
}

export const RUNTIME_QUALITY_LADDER: readonly [
  RuntimeQualityRungAllocation,
  RuntimeQualityRungAllocation,
  RuntimeQualityRungAllocation,
  RuntimeQualityRungAllocation,
  RuntimeQualityRungAllocation
] = [
  {
    rung: 0,
    maxPixelRatioCap: Number.POSITIVE_INFINITY,
    resolutionScale: 1.0,
    renderScale: 1.0,
    maxPostTier: "ultra",
    maxShadowCascades: 4,
    maxShadowMapSize: 4096,
    performancePreset: "high"
  },
  {
    rung: 1,
    maxPixelRatioCap: 1.5,
    resolutionScale: 0.92,
    renderScale: 0.9,
    maxPostTier: "high",
    maxShadowCascades: 3,
    maxShadowMapSize: 2048,
    performancePreset: "high"
  },
  {
    rung: 2,
    maxPixelRatioCap: 1.25,
    resolutionScale: 0.85,
    renderScale: 0.85,
    maxPostTier: "medium",
    maxShadowCascades: 2,
    maxShadowMapSize: 1024,
    performancePreset: "balanced"
  },
  {
    rung: 3,
    maxPixelRatioCap: 1.0,
    resolutionScale: 0.75,
    renderScale: 0.75,
    maxPostTier: "low",
    maxShadowCascades: 1,
    maxShadowMapSize: 1024,
    performancePreset: "low"
  },
  {
    rung: 4,
    maxPixelRatioCap: 1.0,
    resolutionScale: 0.67,
    renderScale: 0.67,
    maxPostTier: "low",
    maxShadowCascades: 1,
    maxShadowMapSize: 512,
    performancePreset: "low"
  }
] as const;

export interface RuntimeQualityGovernorOptions {
  /** Initial tier resolved at mount (`"ultra" | "high" | "medium" | "low"`). Default `"high"`. */
  readonly mountTier?: AuraQualityTier;
  /** Target frame budget in ms. Default `16.67` (`60 fps`, including mobile). */
  readonly targetFrameMs?: number;
  /** Warmup frame count ignored after mount. Default `45`. */
  readonly warmupFrames?: number;
  /** Warmup elapsed duration in ms ignored after mount. Default `1000`. */
  readonly warmupMs?: number;
  /** Maximum valid rAF delta before classifying as a background/tab stall. Default `100`. */
  readonly maxValidDeltaMs?: number;
  /** Minimum cooldown between consecutive step-downs in ms. Default `1500`. */
  readonly stepDownCooldownMs?: number;
  /** Minimum cooldown after a step-down before any step-up in ms. Default `8000`. */
  readonly stepUpCooldownMs?: number;
  /** Window in ms within which a step-down after a step-up counts as a bounce. Default `12000`. */
  readonly bounceWindowMs?: number;
  /** Duration in ms to lock the ceiling on the first bounce (second bounce is permanent). Default `60000`. */
  readonly firstBounceLockMs?: number;
}

export interface RuntimeQualitySample {
  /** Wall-clock timestamp in ms (e.g. `performance.now()`). */
  readonly nowMs: number;
  /** Inter-frame rAF delta in ms. */
  readonly rafDeltaMs: number;
  /** Synchronous CPU frame-body work duration in ms. */
  readonly cpuBodyMs: number;
  /** Optional GPU frame duration in ms when timer queries are supported. */
  readonly gpuMs?: number | null;
  /** Optional cumulative compiled shader count to ignore shader-compile spikes. */
  readonly compiledPrograms?: number | null;
}

export interface RuntimeQualityStepResult {
  readonly changed: boolean;
  readonly direction: "down" | "up" | null;
  readonly previousRung: RuntimeQualityRung;
  readonly rung: RuntimeQualityRung;
  readonly vsyncLocked30Hz: boolean;
  readonly ceilingRung: RuntimeQualityRung;
  readonly allocation: RuntimeQualityRungAllocation;
  readonly effectivePostTier: AuraQualityTier;
}

const SHORT_WINDOW = 30;
const LONG_WINDOW = 180;
const POST_STEP_SETTLE_FRAMES = 4;
const RESUME_SKIP_FRAMES = 5;

function percentileSorted(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[idx] ?? 0;
}

function clampPostTier(mountTier: AuraQualityTier, capTier: AuraQualityTier): AuraQualityTier {
  return TIER_ORDER[Math.min(tierIndex(mountTier), tierIndex(capTier))] ?? "high";
}

export class RuntimeQualityGovernor {
  private readonly mountTier: AuraQualityTier;
  private readonly budgetScale: number;
  private readonly stepDownThresholdMs: number;
  private readonly stepUpP75Ms: number;
  private readonly stepUpP90Ms: number;
  private readonly warmupFrames: number;
  private readonly warmupMs: number;
  private readonly maxValidDeltaMs: number;
  private readonly stepDownCooldownMs: number;
  private readonly stepUpCooldownMs: number;
  private readonly bounceWindowMs: number;
  private readonly firstBounceLockMs: number;

  private currentRung: RuntimeQualityRung = 0;
  private mountStartMs: number | null = null;
  private framesSeen = 0;
  private resumeSkipFrames = 0;
  private settleFramesRemaining = 0;
  private lastCompiledPrograms: number | null = null;
  private vsyncLocked = false;

  private readonly shortFrameMs: number[] = [];
  private readonly shortRafMs: number[] = [];
  private readonly shortCpuMs: number[] = [];
  private readonly longFrameMs: number[] = [];

  private lastStepMs = Number.NEGATIVE_INFINITY;
  private lastStepDownMs = Number.NEGATIVE_INFINITY;
  private lastStepUpMs = Number.NEGATIVE_INFINITY;
  private lastStepDirection: "down" | "up" | null = null;
  private lockedCeilingRung: RuntimeQualityRung = 0;
  private ceilingLockUntilMs = Number.NEGATIVE_INFINITY;
  private bounceCount = 0;

  constructor(options: RuntimeQualityGovernorOptions = {}) {
    this.mountTier = options.mountTier ?? "high";
    const targetFrameMs = options.targetFrameMs !== undefined && options.targetFrameMs > 0 ? options.targetFrameMs : 16.67;
    this.budgetScale = targetFrameMs / 16.67;
    this.stepDownThresholdMs = 18.5 * this.budgetScale;
    this.stepUpP75Ms = 12.5 * this.budgetScale;
    this.stepUpP90Ms = 14.5 * this.budgetScale;
    this.warmupFrames = options.warmupFrames ?? 45;
    this.warmupMs = options.warmupMs ?? 1000;
    this.maxValidDeltaMs = options.maxValidDeltaMs ?? 100;
    this.stepDownCooldownMs = options.stepDownCooldownMs ?? 1500;
    this.stepUpCooldownMs = options.stepUpCooldownMs ?? 8000;
    this.bounceWindowMs = options.bounceWindowMs ?? 12000;
    this.firstBounceLockMs = options.firstBounceLockMs ?? 60000;
  }

  get rung(): RuntimeQualityRung {
    return this.currentRung;
  }

  get vsyncLocked30Hz(): boolean {
    return this.vsyncLocked;
  }

  get allocation(): RuntimeQualityRungAllocation {
    return RUNTIME_QUALITY_LADDER[this.currentRung];
  }

  get effectivePostTier(): AuraQualityTier {
    return clampPostTier(this.mountTier, this.allocation.maxPostTier);
  }

  effectiveCeilingRung(nowMs: number): RuntimeQualityRung {
    if (nowMs < this.ceilingLockUntilMs) return this.lockedCeilingRung;
    return 0;
  }

  /** Notify the governor that page visibility resumed so resumption spikes are ignored. */
  notifyVisibilityResume(): void {
    this.resumeSkipFrames = Math.max(this.resumeSkipFrames, RESUME_SKIP_FRAMES);
    this.shortFrameMs.length = 0;
    this.shortRafMs.length = 0;
    this.shortCpuMs.length = 0;
  }

  private unchangedResult(nowMs: number): RuntimeQualityStepResult {
    return {
      changed: false,
      direction: null,
      previousRung: this.currentRung,
      rung: this.currentRung,
      vsyncLocked30Hz: this.vsyncLocked,
      ceilingRung: this.effectiveCeilingRung(nowMs),
      allocation: this.allocation,
      effectivePostTier: this.effectivePostTier
    };
  }

  sample(input: RuntimeQualitySample): RuntimeQualityStepResult {
    const { nowMs, rafDeltaMs, cpuBodyMs, gpuMs, compiledPrograms } = input;
    if (!Number.isFinite(nowMs)) return this.unchangedResult(0);
    if (this.mountStartMs === null) this.mountStartMs = nowMs;
    this.framesSeen += 1;

    // Track shader compilation spikes before warmup/stall early-outs so baseline stays current.
    let compiledThisFrame = false;
    if (typeof compiledPrograms === "number" && Number.isFinite(compiledPrograms)) {
      if (this.lastCompiledPrograms !== null && compiledPrograms > this.lastCompiledPrograms) {
        compiledThisFrame = true;
      }
      this.lastCompiledPrograms = compiledPrograms;
    }

    // 1. Tab-background / visibility stall guard (> 100 ms or non-positive delta).
    if (!Number.isFinite(rafDeltaMs) || rafDeltaMs <= 0 || rafDeltaMs > this.maxValidDeltaMs) {
      if (rafDeltaMs > this.maxValidDeltaMs) {
        this.resumeSkipFrames = Math.max(this.resumeSkipFrames, RESUME_SKIP_FRAMES);
        this.shortFrameMs.length = 0;
        this.shortRafMs.length = 0;
        this.shortCpuMs.length = 0;
      }
      return this.unchangedResult(nowMs);
    }

    if (this.resumeSkipFrames > 0) {
      this.resumeSkipFrames -= 1;
      return this.unchangedResult(nowMs);
    }

    // 2. Mount warmup guard (skip first 45 frames and first 1.0 s).
    if (this.framesSeen <= this.warmupFrames || nowMs - this.mountStartMs < this.warmupMs) {
      return this.unchangedResult(nowMs);
    }

    // 3. Shader-compile frame guard & post-step settle guard.
    if (compiledThisFrame) {
      return this.unchangedResult(nowMs);
    }
    if (this.settleFramesRemaining > 0) {
      this.settleFramesRemaining -= 1;
      return this.unchangedResult(nowMs);
    }

    const hasGpuMs = typeof gpuMs === "number" && Number.isFinite(gpuMs) && gpuMs >= 0;
    const effectiveMs = hasGpuMs ? gpuMs : rafDeltaMs;
    const safeCpuMs = Number.isFinite(cpuBodyMs) && cpuBodyMs >= 0 ? cpuBodyMs : 0;

    this.shortFrameMs.push(effectiveMs);
    if (this.shortFrameMs.length > SHORT_WINDOW) this.shortFrameMs.shift();
    this.shortRafMs.push(rafDeltaMs);
    if (this.shortRafMs.length > SHORT_WINDOW) this.shortRafMs.shift();
    this.shortCpuMs.push(safeCpuMs);
    if (this.shortCpuMs.length > SHORT_WINDOW) this.shortCpuMs.shift();

    this.longFrameMs.push(effectiveMs);
    if (this.longFrameMs.length > LONG_WINDOW) this.longFrameMs.shift();

    // 4. iOS Low Power Mode 30 Hz VSync Lock Guard:
    // When GPU timestamps are unavailable, Low Power Mode caps rAF to 30 Hz (~33.33 ms)
    // even when CPU + GPU finish in < 5 ms. Detect tight clustering around 33.33 ms with
    // light CPU work (< 5 ms) and hold the current rung instead of stepping to the floor.
    if (!hasGpuMs && this.shortRafMs.length >= SHORT_WINDOW) {
      let near33Count = 0;
      for (const dt of this.shortRafMs) {
        if (dt >= 30.5 && dt <= 36.2) near33Count += 1;
      }
      const sortedRaf = [...this.shortRafMs].sort((a, b) => a - b);
      const sortedCpu = [...this.shortCpuMs].sort((a, b) => a - b);
      const rafIqr = percentileSorted(sortedRaf, 0.75) - percentileSorted(sortedRaf, 0.25);
      const rafMedian = percentileSorted(sortedRaf, 0.5);
      const cpuP75 = percentileSorted(sortedCpu, 0.75);
      this.vsyncLocked =
        cpuP75 < 5.0 &&
        near33Count >= 24 &&
        rafMedian >= 31.0 &&
        rafMedian <= 35.6 &&
        rafIqr <= 3.0;
    } else if (hasGpuMs) {
      this.vsyncLocked = false;
    } else if (this.shortRafMs.length >= 10) {
      // Clear lock promptly if browser returns to 60 Hz (< 22 ms) or CPU work rises >= 5 ms.
      const recent = this.shortRafMs.slice(-10);
      const fastCount = recent.filter((dt) => dt < 22).length;
      const recentCpu = this.shortCpuMs.slice(-10);
      const heavyCpu = recentCpu.filter((c) => c >= 5.0).length;
      if (fastCount >= 6 || heavyCpu >= 6) this.vsyncLocked = false;
    }

    if (this.vsyncLocked) {
      return this.unchangedResult(nowMs);
    }

    // 5. Step-down check: p75(last 30) > 18.5 ms AND >= 20/30 frames over budget, 1.5 s settle.
    if (
      this.currentRung < 4 &&
      this.shortFrameMs.length >= SHORT_WINDOW &&
      nowMs - this.lastStepMs >= this.stepDownCooldownMs
    ) {
      let overCount = 0;
      for (const ms of this.shortFrameMs) {
        if (ms > this.stepDownThresholdMs) overCount += 1;
      }
      const sortedShort = [...this.shortFrameMs].sort((a, b) => a - b);
      const p75Short = percentileSorted(sortedShort, 0.75);
      if (overCount >= 20 && p75Short > this.stepDownThresholdMs) {
        const previousRung = this.currentRung;
        const nextRung = (this.currentRung + 1) as RuntimeQualityRung;
        // Bounce ceiling detection: stepped up recently, then forced back down within 12 s.
        if (this.lastStepDirection === "up" && nowMs - this.lastStepUpMs <= this.bounceWindowMs) {
          this.bounceCount += 1;
          this.lockedCeilingRung = nextRung;
          this.ceilingLockUntilMs = this.bounceCount >= 2 ? Number.POSITIVE_INFINITY : nowMs + this.firstBounceLockMs;
        }
        this.currentRung = nextRung;
        this.lastStepMs = nowMs;
        this.lastStepDownMs = nowMs;
        this.lastStepDirection = "down";
        this.settleFramesRemaining = POST_STEP_SETTLE_FRAMES;
        this.shortFrameMs.length = 0;
        this.shortRafMs.length = 0;
        this.shortCpuMs.length = 0;
        this.longFrameMs.length = 0;
        return {
          changed: true,
          direction: "down",
          previousRung,
          rung: this.currentRung,
          vsyncLocked30Hz: this.vsyncLocked,
          ceilingRung: this.effectiveCeilingRung(nowMs),
          allocation: this.allocation,
          effectivePostTier: this.effectivePostTier
        };
      }
    }

    // 6. Step-up check: after 8.0 s post-drop cooldown, p75(last 180) < 12.5 ms & p90 < 14.5 ms.
    const ceiling = this.effectiveCeilingRung(nowMs);
    if (
      this.currentRung > ceiling &&
      this.longFrameMs.length >= LONG_WINDOW &&
      nowMs - this.lastStepDownMs >= this.stepUpCooldownMs &&
      nowMs - this.lastStepMs >= 5000
    ) {
      const sortedLong = [...this.longFrameMs].sort((a, b) => a - b);
      const p75Long = percentileSorted(sortedLong, 0.75);
      const p90Long = percentileSorted(sortedLong, 0.9);
      if (p75Long < this.stepUpP75Ms && p90Long < this.stepUpP90Ms) {
        const previousRung = this.currentRung;
        this.currentRung = (this.currentRung - 1) as RuntimeQualityRung;
        this.lastStepMs = nowMs;
        this.lastStepUpMs = nowMs;
        this.lastStepDirection = "up";
        this.settleFramesRemaining = POST_STEP_SETTLE_FRAMES;
        this.longFrameMs.length = 0;
        return {
          changed: true,
          direction: "up",
          previousRung,
          rung: this.currentRung,
          vsyncLocked30Hz: this.vsyncLocked,
          ceilingRung: ceiling,
          allocation: this.allocation,
          effectivePostTier: this.effectivePostTier
        };
      }
    }

    return this.unchangedResult(nowMs);
  }
}

/**
 * Per-canvas / per-device zero-remount runtime quality state shared between
 * `frameLoop.ts`, `compiler/postprocess.ts`, `postBridge.ts`, and `Prd02ShadowBridge.ts`.
 */
export interface RuntimeQualityCanvasState {
  rung: RuntimeQualityRung;
  pinnedSampleCount?: 1 | 4;
  postTier?: AuraQualityTier;
  renderScale?: number;
  maxPixelRatioCap?: number;
  maxShadowCascades?: 1 | 2 | 3 | 4;
  maxShadowMapSize?: number;
}

const canvasQualityStates = new WeakMap<object, RuntimeQualityCanvasState>();
const deviceQualityStates = new WeakMap<object, RuntimeQualityCanvasState>();

export function ensureRuntimeQualityState(canvas: object): RuntimeQualityCanvasState {
  let state = canvasQualityStates.get(canvas);
  if (!state) {
    state = { rung: 0 };
    canvasQualityStates.set(canvas, state);
  }
  return state;
}

export function runtimeQualityStateFor(canvas: object | null | undefined): RuntimeQualityCanvasState | undefined {
  return canvas ? canvasQualityStates.get(canvas) : undefined;
}

export function bindRuntimeQualityDevice(device: object | null | undefined, state: RuntimeQualityCanvasState): void {
  if (device) deviceQualityStates.set(device, state);
}

export function runtimeQualityDeviceStateFor(device: object | null | undefined): RuntimeQualityCanvasState | undefined {
  return device ? deviceQualityStates.get(device) : undefined;
}

export function clearRuntimeQualityState(canvas: object | null | undefined, device?: object | null): void {
  if (canvas) canvasQualityStates.delete(canvas);
  if (device) deviceQualityStates.delete(device);
}
