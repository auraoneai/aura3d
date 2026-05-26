export type A3DXRSessionMode = "inline" | "immersive-vr" | "immersive-ar";
export type A3DXRReferenceSpaceType = "viewer" | "local" | "local-floor" | "bounded-floor" | "unbounded";
export type A3DXRHandedness = "none" | "left" | "right";

export interface A3DXRSystemLike {
  isSessionSupported?(mode: A3DXRSessionMode): Promise<boolean>;
  requestSession(mode: A3DXRSessionMode, options?: A3DXRSessionInit): Promise<A3DXRSessionLike>;
}

export interface A3DXRSessionInit {
  readonly requiredFeatures?: readonly string[];
  readonly optionalFeatures?: readonly string[];
}

export interface A3DXRSessionLike {
  readonly inputSources?: readonly A3DXRInputSourceLike[];
  requestReferenceSpace?(type: A3DXRReferenceSpaceType): Promise<A3DXRReferenceSpaceLike>;
  requestAnimationFrame?(callback: (time: number, frame: A3DXRFrameLike) => void): number;
  end?(): Promise<void>;
}

export interface A3DXRInputSourceLike {
  readonly handedness?: A3DXRHandedness;
  readonly targetRayMode?: "gaze" | "tracked-pointer" | "screen";
  readonly profiles?: readonly string[];
  readonly targetRaySpace?: unknown;
  readonly gripSpace?: unknown;
  readonly gamepad?: {
    readonly buttons?: readonly { readonly pressed?: boolean; readonly touched?: boolean; readonly value?: number }[];
    readonly axes?: readonly number[];
    readonly hapticActuators?: readonly { pulse?(intensity: number, duration: number): Promise<boolean> | boolean }[];
  };
}

export interface A3DXRFrameLike {
  getHitTestResults?(source: unknown): readonly A3DXRHitTestResultLike[];
  getPose?(space: unknown, baseSpace: A3DXRReferenceSpaceLike): A3DXRPoseLike | undefined;
}

export interface A3DXRReferenceSpaceLike {
  readonly type?: A3DXRReferenceSpaceType;
}

export interface A3DXRHitTestResultLike {
  readonly position?: readonly [number, number, number];
  readonly normal?: readonly [number, number, number];
}

export interface A3DXRPoseLike {
  readonly transform?: {
    readonly matrix?: readonly number[];
    readonly position?: readonly [number, number, number];
    readonly orientation?: readonly [number, number, number, number];
  };
}

export interface WebXRSessionControllerOptions {
  readonly xr?: A3DXRSystemLike;
  readonly mode?: A3DXRSessionMode;
  readonly requiredFeatures?: readonly string[];
  readonly optionalFeatures?: readonly string[];
  readonly referenceSpace?: A3DXRReferenceSpaceType;
}

export interface WebXRControllerSample {
  readonly handedness: A3DXRHandedness;
  readonly targetRayMode: "gaze" | "tracked-pointer" | "screen";
  readonly profiles: readonly string[];
  readonly triggerPressed: boolean;
  readonly squeezePressed: boolean;
  readonly primaryValue: number;
  readonly axes: readonly number[];
  readonly targetRayMatrix: readonly number[] | null;
  readonly gripMatrix: readonly number[] | null;
  readonly hapticActuatorCount: number;
}

export interface WebXRHitTestSample {
  readonly position: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
}

export interface WebXRFrameSample {
  readonly mode: A3DXRSessionMode;
  readonly referenceSpace: A3DXRReferenceSpaceType;
  readonly active: boolean;
  readonly controllerCount: number;
  readonly controllers: readonly WebXRControllerSample[];
  readonly hitTestCount: number;
  readonly hitTests: readonly WebXRHitTestSample[];
}

export interface WebXRSessionStartResult {
  readonly mode: A3DXRSessionMode;
  readonly referenceSpace: A3DXRReferenceSpaceType;
  readonly supported: boolean;
  readonly started: boolean;
}

export class WebXRSessionController {
  readonly mode: A3DXRSessionMode;
  readonly requiredFeatures: readonly string[];
  readonly optionalFeatures: readonly string[];
  readonly referenceSpaceType: A3DXRReferenceSpaceType;

  private readonly xr?: A3DXRSystemLike;
  private session: A3DXRSessionLike | null = null;
  private referenceSpace: A3DXRReferenceSpaceLike | null = null;

  constructor(options: WebXRSessionControllerOptions = {}) {
    this.xr = options.xr ?? readNavigatorXR();
    this.mode = options.mode ?? "immersive-vr";
    this.requiredFeatures = options.requiredFeatures ?? [];
    this.optionalFeatures = options.optionalFeatures ?? [];
    this.referenceSpaceType = options.referenceSpace ?? (this.mode === "immersive-ar" ? "viewer" : "local-floor");
  }

  get active(): boolean {
    return this.session !== null;
  }

  async isSupported(): Promise<boolean> {
    if (!this.xr) return false;
    if (!this.xr.isSessionSupported) return true;
    return this.xr.isSessionSupported(this.mode);
  }

  async start(): Promise<WebXRSessionStartResult> {
    if (!this.xr) {
      return {
        mode: this.mode,
        referenceSpace: this.referenceSpaceType,
        supported: false,
        started: false
      };
    }
    const supported = await this.isSupported();
    if (!supported) {
      return {
        mode: this.mode,
        referenceSpace: this.referenceSpaceType,
        supported: false,
        started: false
      };
    }
    this.session = await this.xr.requestSession(this.mode, {
      requiredFeatures: this.requiredFeatures,
      optionalFeatures: this.optionalFeatures
    });
    this.referenceSpace = await this.session.requestReferenceSpace?.(this.referenceSpaceType) ?? { type: this.referenceSpaceType };
    return {
      mode: this.mode,
      referenceSpace: this.referenceSpace?.type ?? this.referenceSpaceType,
      supported: true,
      started: true
    };
  }

  sampleFrame(frame?: A3DXRFrameLike, hitTestSource?: unknown): WebXRFrameSample {
    const referenceSpace = this.referenceSpace ?? { type: this.referenceSpaceType };
    const controllers = Array.from(this.session?.inputSources ?? []).map((source) => sampleInputSource(source, frame, referenceSpace));
    const hitTests = frame?.getHitTestResults && hitTestSource
      ? frame.getHitTestResults(hitTestSource).map(sampleHitTest)
      : [];
    return {
      mode: this.mode,
      referenceSpace: this.referenceSpace?.type ?? this.referenceSpaceType,
      active: this.active,
      controllerCount: controllers.length,
      controllers,
      hitTestCount: hitTests.length,
      hitTests
    };
  }

  async end(): Promise<void> {
    const session = this.session;
    this.session = null;
    this.referenceSpace = null;
    await session?.end?.();
  }

  async pulseHaptics(intensity = 0.5, duration = 35): Promise<number> {
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) throw new RangeError("WebXR haptic intensity must be in [0, 1].");
    if (!Number.isFinite(duration) || duration < 0) throw new RangeError("WebXR haptic duration must be finite and non-negative.");
    let pulses = 0;
    for (const source of this.session?.inputSources ?? []) {
      for (const actuator of source.gamepad?.hapticActuators ?? []) {
        const accepted = await actuator.pulse?.(intensity, duration);
        if (accepted !== false) pulses += 1;
      }
    }
    return pulses;
  }
}

function sampleInputSource(source: A3DXRInputSourceLike, frame: A3DXRFrameLike | undefined, referenceSpace: A3DXRReferenceSpaceLike): WebXRControllerSample {
  const buttons = source.gamepad?.buttons ?? [];
  const axes = source.gamepad?.axes ?? [];
  const trigger = buttons[0];
  const squeeze = buttons[1];
  return {
    handedness: source.handedness ?? "none",
    targetRayMode: source.targetRayMode ?? "tracked-pointer",
    profiles: source.profiles ?? [],
    triggerPressed: Boolean(trigger?.pressed),
    squeezePressed: Boolean(squeeze?.pressed),
    primaryValue: finiteOrZero(trigger?.value),
    axes: axes.map(finiteOrZero),
    targetRayMatrix: samplePoseMatrix(frame, source.targetRaySpace, referenceSpace),
    gripMatrix: samplePoseMatrix(frame, source.gripSpace, referenceSpace),
    hapticActuatorCount: source.gamepad?.hapticActuators?.length ?? 0
  };
}

function samplePoseMatrix(frame: A3DXRFrameLike | undefined, space: unknown, referenceSpace: A3DXRReferenceSpaceLike): readonly number[] | null {
  if (!frame?.getPose || !space) return null;
  return sanitizeMatrix4(frame.getPose(space, referenceSpace)?.transform?.matrix);
}

function sampleHitTest(result: A3DXRHitTestResultLike): WebXRHitTestSample {
  return {
    position: sanitizeVec3(result.position, [0, 0, 0]),
    normal: sanitizeVec3(result.normal, [0, 1, 0])
  };
}

function sanitizeVec3(value: readonly number[] | undefined, fallback: readonly [number, number, number]): readonly [number, number, number] {
  if (!value || value.length < 3) return fallback;
  const x = finiteOrZero(value[0]);
  const y = finiteOrZero(value[1]);
  const z = finiteOrZero(value[2]);
  return [x, y, z];
}

function finiteOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sanitizeMatrix4(value: readonly number[] | undefined): readonly number[] | null {
  if (!value || value.length < 16) return null;
  const matrix = Array.from(value.slice(0, 16), finiteOrZero);
  return matrix;
}

function readNavigatorXR(): A3DXRSystemLike | undefined {
  return (globalThis.navigator as Navigator & { xr?: A3DXRSystemLike } | undefined)?.xr;
}
