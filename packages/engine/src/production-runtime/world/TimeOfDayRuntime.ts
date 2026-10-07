/**
 * PRD-10 §6.7 / T6.4 — TimeOfDayRuntime.
 *
 * Advances the hour, decides IBL re-capture per §6.7 (sun moved ≥ 1.5° since the
 * last captured sun, or the keyframe interpolation weight changed ≥ 0.05), and
 * produces the `EnvironmentCaptureRequest` descriptor. One cube face renders per
 * frame; mips spread over subsequent frames — the ≤ 0.2 ms/frame budget lands on
 * the real C-21 `renderToCubeFace` path; with the PR-0 stubs the probe is a
 * horizon-colour cube and is reported as such, never claimed as sky IBL.
 *
 * The 0.5 s two-probe crossfade needs C-09 `blendFrom` — CCR-10-1 is filed; until
 * it lands the swap is a hard cut and diagnostics report
 * `iblCrossfade: "pending-CCR-10-1"`.
 *
 * `worldUniforms` contributions are uniform writes only — `set`/`animate` never
 * remount the scene (§6.7).
 */
import type { AuraTimeOfDayNode, AuraTimeOfDayOptions } from "../../agent-api/world/biomes.js";
import {
  practicalScaleFor,
  rigAtHour,
  sunPositionFor,
  type AuraSunPosition
} from "../../agent-api/world/timeOfDay.js";
import type { AuraBiomeRigDetail } from "../../agent-api/world/biomes.js";
import type { AuraWorldQualityTier } from "../../agent-api/world/types.js";
import { keyframeBracket } from "../../agent-api/world/timeOfDay.js";

export const SUN_RECAPTURE_THRESHOLD_DEG = 1.5;
export const KEYFRAME_WEIGHT_THRESHOLD = 0.05;

/** Descriptor handed to C-09 `environmentProbeFactorySlot` / C-21 `skyBackgroundSlot` when real. */
export interface EnvironmentCaptureRequest {
  readonly reason: "sun-moved" | "keyframe-weight" | "initial" | "sky-changed";
  readonly faceSize: 64 | 128 | 256;
  /** Faces are rendered one per frame — 6 faces total. */
  readonly facesRemaining: number;
}

export interface TimeOfDayFrame {
  readonly hour: number;
  readonly sun: AuraSunPosition;
  readonly rig: AuraBiomeRigDetail;
  readonly practicalScale: number;
  readonly captureRequest: EnvironmentCaptureRequest | null;
  readonly iblCrossfade: "pending-CCR-10-1";
}

export class TimeOfDayRuntime {
  private hour: number;
  private hoursPerSecond: number | null = null;
  private lastCapturedSun: AuraSunPosition | null = null;
  private lastKeyframeWeight: number | null = null;
  private facesRemaining = 0;

  constructor(
    private readonly options: AuraTimeOfDayOptions,
    private readonly tier: AuraWorldQualityTier = "high"
  ) {
    this.hour = ((options.hour % 24) + 24) % 24;
  }

  get currentHour(): number {
    return this.hour;
  }

  setHour(hour: number): void {
    this.hour = ((hour % 24) + 24) % 24;
    this.hoursPerSecond = null; // set() pauses any running animate (§6.7)
  }

  animate(hoursPerSecond: number): void {
    this.hoursPerSecond = hoursPerSecond;
  }

  pause(): void {
    this.hoursPerSecond = null;
  }

  /** Keyframe interpolation weight t inside the active bracket (0 without keyframes). */
  private keyframeWeight(hour: number): number {
    const kf = this.options.keyframes;
    if (!kf || kf.length < 2) return 0;
    const ks = [...kf].sort((p, q) => p.hour - q.hour);
    return keyframeBracket(ks, hour)[2];
  }

  private sunMovedDeg(a: AuraSunPosition, b: AuraSunPosition): number {
    const d = [
      a.direction[0] - b.direction[0],
      a.direction[1] - b.direction[1],
      a.direction[2] - b.direction[2]
    ];
    // |d| ≈ angle in radians for small deltas — report in degrees
    return (Math.hypot(d[0], d[1], d[2]) * 180) / Math.PI;
  }

  /**
   * Advance by `dtSeconds` (sim seconds) and return this frame's rig, sun,
   * practical scale and (optionally) a re-capture request. `animate` writes
   * `hoursPerSecond`; `set`/`pause` stop it — uniform writes only.
   */
  advance(dtSeconds: number): TimeOfDayFrame {
    if (this.hoursPerSecond !== null && dtSeconds > 0) {
      this.hour = ((this.hour + (this.hoursPerSecond * dtSeconds) / 3600) % 24 + 24) % 24;
    }
    const sun = sunPositionFor(this.options, this.hour);
    const rig = rigAtHour(this.options, this.hour);
    const practicalScale = practicalScaleFor(sun);

    const weight = this.keyframeWeight(this.hour);
    const wantCapture = this.options.ibl?.recapture !== false;
    const thresholdDeg = this.options.ibl?.thresholdDeg ?? SUN_RECAPTURE_THRESHOLD_DEG;
    let reason: EnvironmentCaptureRequest["reason"] | null = null;
    if (wantCapture && this.facesRemaining === 0) {
      if (this.lastCapturedSun === null) reason = "initial";
      else if (this.sunMovedDeg(sun, this.lastCapturedSun) >= thresholdDeg) reason = "sun-moved";
      else if (Math.abs(weight - (this.lastKeyframeWeight ?? 0)) >= KEYFRAME_WEIGHT_THRESHOLD) reason = "keyframe-weight";
    }
    let captureRequest: EnvironmentCaptureRequest | null = null;
    if (reason !== null) {
      this.facesRemaining = 6;
      this.lastCapturedSun = sun;
      this.lastKeyframeWeight = weight;
      const faceSize = rig.environmentSpec.source === "sky-capture"
        ? tierFaceSize(rig.environmentSpec.faceSize, this.tier)
        : 128;
      captureRequest = { reason, faceSize, facesRemaining: this.facesRemaining };
    } else if (this.facesRemaining > 0) {
      this.facesRemaining -= 1; // one face per frame
      captureRequest = {
        reason: "initial",
        faceSize: 128,
        facesRemaining: this.facesRemaining
      };
    }

    return {
      hour: this.hour,
      sun,
      rig,
      practicalScale,
      captureRequest,
      iblCrossfade: "pending-CCR-10-1"
    };
  }
}

const tierFaceSize = (
  faceSize: number | { low?: number; medium?: number; high?: number; ultra?: number },
  tier: AuraWorldQualityTier
): 64 | 128 | 256 => {
  if (typeof faceSize === "number") return faceSize as 64 | 128 | 256;
  return (faceSize[tier] ?? faceSize.high ?? 128) as 64 | 128 | 256;
};

// ------------------------------------------------- frame driver (per node) --

const drivers = new Map<string, TimeOfDayRuntime>();
let lastAdvanceTime = Number.NaN;

/** The driver for a `time-of-day` node id (created lazily from its options). */
export function timeOfDayDriverFor(
  node: { readonly id: string; readonly options: AuraTimeOfDayOptions },
  tier: AuraWorldQualityTier = "high"
): TimeOfDayRuntime {
  let d = drivers.get(node.id);
  if (!d) {
    d = new TimeOfDayRuntime(node.options, tier);
    drivers.set(node.id, d);
  }
  return d;
}

/** Routes `app.world.timeOfDay.*` to the driver of the (first) compiled node. */
export function timeOfDayDriverForNodes(
  nodes: Iterable<{ readonly id: string; readonly options: AuraTimeOfDayOptions }>,
  tier: AuraWorldQualityTier = "high"
): TimeOfDayRuntime | null {
  for (const n of nodes) return timeOfDayDriverFor(n, tier);
  return null;
}

/**
 * Frame advance — called once per frame from the `prd10.world` collect phase.
 * `dt` derives from `timeSeconds` deltas so a paused headless run doesn't drift.
 * Returns every node's frame result; the caller publishes them on the
 * blackboard (`prd10.timeOfDay`) and drives `u_a3dPrd10PracticalScale`.
 */
export function advanceTimeOfDay(
  nodes: ReadonlyMap<string, AuraTimeOfDayNode> | Iterable<AuraTimeOfDayNode>,
  timeSeconds: number,
  tier: AuraWorldQualityTier = "high"
): readonly TimeOfDayFrame[] {
  const dt = Number.isFinite(lastAdvanceTime) ? Math.max(0, timeSeconds - lastAdvanceTime) : 0;
  lastAdvanceTime = timeSeconds;
  const list = nodes instanceof Map ? [...nodes.values()] : [...nodes];
  return list.map((node) => {
    const frame = timeOfDayDriverFor(node, tier).advance(dt);
    lastFrames.set(node.id, frame);
    return frame;
  });
}

/** The most recent frame result per node id (for diagnostics + uniforms). */
const lastFrames = new Map<string, TimeOfDayFrame>();
export function timeOfDayLastFrame(nodeId: string): TimeOfDayFrame | undefined {
  return lastFrames.get(nodeId);
}
