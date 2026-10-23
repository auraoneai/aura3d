import type { WebXRFrameSample } from "@aura3d/input";

export type AuraXRMode = "immersive-vr" | "immersive-ar";

export type AuraXREventName = "sessionstart" | "sessionend" | "frame" | "error";

export interface AuraXRSessionInit {
  readonly requiredFeatures?: readonly string[];
  readonly optionalFeatures?: readonly string[];
  readonly referenceSpace?: "viewer" | "local" | "local-floor" | "bounded-floor" | "unbounded";
}

/**
 * The narrow slice of the render device the XR path needs. Both members are
 * OPTIONAL and capability-checked: a device without them cannot render into
 * an XR framebuffer, and `app.xr.enter()` then refuses to start a session
 * instead of presenting a black headset.
 *
 * Contract a device must honour:
 * - `setExternalFramebuffer(fb, w, h)`: until it is called again with `null`,
 *   frames render into `fb` (an `XRWebGLLayer.framebuffer`) instead of the
 *   canvas default framebuffer, with a backbuffer of `w x h`.
 * - `setViewport(x, y, w, h, { persistent: true })`: a raster sub-rect that
 *   survives `beginFrame` and the post and present passes, because one XR
 *   framebuffer holds every eye side by side. Without `persistent` the device
 *   resets the viewport at `beginFrame`, so the eye would render full-frame.
 * - `resetViewport()`: clears that persistent viewport when the device is
 *   handed back to the canvas path (after every XR frame and at session end).
 *
 * An `XRWebGLLayer` may report `framebuffer === null` (inline sessions and
 * emulators such as iwer): the frame then draws into the canvas default
 * framebuffer, and the per-eye viewports still apply.
 */
export interface AuraXRDeviceBridge {
  setExternalFramebuffer?(framebuffer: unknown | null, width: number, height: number): void;
  setViewport?(x: number, y: number, width: number, height: number, options?: { readonly persistent?: boolean }): void;
  resetViewport?(): void;
}

/** What the app resolved for one XR eye; installed per canvas while that eye renders. */
export interface AuraXRViewCamera {
  readonly eye: "left" | "right" | "none";
  /** World-to-view, column-major 4x4. */
  readonly viewMatrix: readonly number[];
  readonly projectionMatrix: readonly number[];
  /** `projection * view`, column-major 4x4. */
  readonly viewProjectionMatrix: readonly number[];
  /** World-space eye position. */
  readonly eyePosition: readonly [number, number, number];
  readonly viewport: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export interface AuraXREnterResult {
  /** The browser reports the mode as supported. */
  readonly supported: boolean;
  /** A session is now presenting. */
  readonly started: boolean;
  readonly mode: AuraXRMode;
  /** Set when `started` is false. */
  readonly reason?: "no-webxr" | "unsupported" | "already-presenting" | "render-path-unavailable" | "no-webgl-context" | "no-xr-layer" | "session-failed";
  readonly message?: string;
  readonly warnings: readonly string[];
}

export interface AuraXRFrameEvent {
  /** XR high-resolution time in milliseconds. */
  readonly time: number;
  readonly viewCount: number;
  readonly sample: WebXRFrameSample;
}

export interface AuraXREventMap {
  readonly sessionstart: { readonly mode: AuraXRMode };
  readonly sessionend: { readonly mode: AuraXRMode };
  readonly frame: AuraXRFrameEvent;
  readonly error: { readonly code: string; readonly message: string };
}

export interface AuraXRRuntime {
  readonly isPresenting: boolean;
  readonly mode: AuraXRMode | null;
  /** The most recent frame's controller, hand and pose sample; null before the first frame. */
  readonly lastSample: WebXRFrameSample | null;
  isSupported(mode?: AuraXRMode): Promise<boolean>;
  enter(mode?: AuraXRMode, init?: AuraXRSessionInit): Promise<AuraXREnterResult>;
  exit(): Promise<void>;
  on<K extends AuraXREventName>(event: K, listener: (payload: AuraXREventMap[K]) => void): () => void;
  dispose(): void;
}
