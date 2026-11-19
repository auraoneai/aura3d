// PRD-07 P3-T6 (§6.4 + C-09 integration) — captures the visible sky into an
// environment probe when the scene has no explicit environment.
//
// Capture runs ONLY when all of these hold:
//   1. the atmosphere reports a visible sky (`background: "sky-*"`);
//   2. the scene has no explicit environment (`environment` absent/null);
//   3. the C-09 factory slot has a real provider (prd02);
//   4. `A3D_QR_LIGHTING` is on (the slot's own flag);
//   5. the sky node did not opt out (`captureEnvironment: false`).
// Otherwise the adapter resolves to `SKY_CAPTURE_PENDING` and captures
// nothing. Re-capture is driven by the atmosphere's `onSkyChanged` listener.

import type { RenderDevice } from "../RenderDevice";
import type { QrFlags } from "../contracts/core";
import { environmentProbeFactorySlot, type EnvironmentProbe } from "../contracts/environment";
import { skyPassFor } from "./SkyBackgroundPass";

/** Resolved outcome when capture is not permitted/available yet. */
export const SKY_CAPTURE_PENDING = "SKY_CAPTURE_PENDING" as const;

export interface SkyCaptureAppLike {
  /** App diagnostics surface — atmosphere state + listener. */
  readonly atmosphere: {
    state(): { readonly sky: unknown | null; readonly captureEnvironment?: boolean };
    onSkyChanged?(listener: () => void): (() => void) | void;
  };
  /** Explicit environment field on the render source (undefined = none). */
  readonly environment?: unknown | null;
}

export interface SkyCaptureResult {
  readonly status: "captured" | typeof SKY_CAPTURE_PENDING;
  readonly probe: EnvironmentProbe | null;
}

/**
 * Evaluate + run the capture once. Pure policy — the caller owns when to call
 * it (mount + re-capture listeners).
 */
export function captureSkyEnvironment(
  app: SkyCaptureAppLike,
  device: RenderDevice,
  flags: QrFlags,
  o: { readonly resolution?: 64 | 128 | 256 } = {}
): SkyCaptureResult {
  const state = app.atmosphere.state();
  const hasSky = state.sky != null;
  const hasExplicitEnvironment = app.environment != null;
  if (!hasSky || hasExplicitEnvironment || state.captureEnvironment === false || !environmentProbeFactorySlot.provided || !flags.on("A3D_QR_LIGHTING")) {
    return { status: SKY_CAPTURE_PENDING, probe: null };
  }
  const factory = environmentProbeFactorySlot.get(flags)(device);
  const sky = skyPassFor(device);
  sky.setSpec(state.sky as Parameters<typeof sky.setSpec>[0], 0);
  const probe = factory.fromScene(
    { renderFace: (face, target, viewProjection) => sky.renderToCubeFace(face, target, viewProjection), resolution: o.resolution ?? 128 },
    { faceSize: 128 }
  );
  return { status: "captured", probe };
}

/**
 * SkyCaptureAdapter: captures once at mount (when allowed) and re-captures
 * every `onSkyChanged` the LiveAtmosphere emits (sky spec change ⇒ new probe).
 * `dispose()` detaches the listener.
 */
export class SkyCaptureAdapter {
  private probe: EnvironmentProbe | null = null;
  private offSkyChanged: (() => void) | null = null;
  private failureWarned = false;
  /** The last capture failure (null after a capture succeeds); a failure never throws out of the frame. */
  lastError: unknown = null;

  constructor(
    private readonly app: SkyCaptureAppLike,
    private readonly device: RenderDevice,
    private readonly flags: QrFlags
  ) {
    this.recapture();
    const off = this.app.atmosphere.onSkyChanged?.(() => this.recapture());
    this.offSkyChanged = typeof off === "function" ? off : null;
  }

  /** Latest probe, or null while capture is pending. */
  current(): EnvironmentProbe | null {
    return this.probe;
  }

  private recapture(): void {
    // An opted-out sky lights nothing: drop a probe an earlier sky captured.
    if (this.app.atmosphere.state().captureEnvironment === false) {
      this.probe = null;
      return;
    }
    let result: SkyCaptureResult;
    try {
      result = captureSkyEnvironment(this.app, this.device, this.flags);
    } catch (error) {
      // A failed capture (e.g. no float render target) leaves the scene lit
      // as before; it must never take the frame (and the renderer) down.
      this.lastError = error;
      if (!this.failureWarned && typeof console !== "undefined") {
        this.failureWarned = true;
        console.warn(`SKY_CAPTURE_FAILED: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    this.lastError = null;
    if (result.probe) this.probe = result.probe;
  }

  dispose(): void {
    this.offSkyChanged?.();
    this.offSkyChanged = null;
  }
}
