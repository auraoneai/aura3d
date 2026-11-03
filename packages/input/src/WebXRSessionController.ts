export type A3DXRSessionMode = "inline" | "immersive-vr" | "immersive-ar";
export type A3DXRReferenceSpaceType = "viewer" | "local" | "local-floor" | "bounded-floor" | "unbounded";
export type A3DXRHandedness = "none" | "left" | "right";
export type A3DXRNumericArray = ArrayLike<number>;
export type A3DXRPointLike = { readonly x: number; readonly y: number; readonly z: number; readonly w?: number } | readonly number[];

export interface A3DXRSystemLike {
  isSessionSupported?(mode: A3DXRSessionMode): Promise<boolean>;
  requestSession(mode: A3DXRSessionMode, options?: A3DXRSessionInit): Promise<A3DXRSessionLike>;
}

export interface A3DXRSessionInit {
  readonly requiredFeatures?: readonly string[];
  readonly optionalFeatures?: readonly string[];
  readonly depthSensing?: A3DXRDepthSensingOptions;
}
export interface A3DXRDepthSensingOptions {
  readonly usagePreference: readonly ("cpu-optimized" | "gpu-optimized")[];
  readonly dataFormatPreference: readonly ("luminance-alpha" | "float32" | "unsigned-short")[];
  readonly depthTypeRequest?: readonly ("raw" | "smooth")[];
  readonly matchDepthView?: boolean;
}

export interface A3DXREventLike {
  readonly inputSource?: A3DXRInputSourceLike;
  readonly added?: readonly A3DXRInputSourceLike[];
  readonly removed?: readonly A3DXRInputSourceLike[];
  readonly transform?: A3DXRTransformLike;
}

export interface A3DXRSessionLike {
  readonly inputSources?: Iterable<A3DXRInputSourceLike>;
  readonly enabledFeatures?: Iterable<string>;
  readonly visibilityState?: string;
  readonly depthUsage?: "cpu-optimized" | "gpu-optimized";
  readonly depthDataFormat?: "luminance-alpha" | "float32" | "unsigned-short";
  readonly renderState?: { readonly baseLayer?: A3DXRWebGLLayerLike };
  requestReferenceSpace?(type: A3DXRReferenceSpaceType): Promise<A3DXRReferenceSpaceLike>;
  requestHitTestSource?(options: { readonly space: unknown }): Promise<A3DXRHitTestSourceLike> | undefined;
  requestLightProbe?(): Promise<unknown>;
  requestAnimationFrame?(callback: (time: number, frame: A3DXRFrameLike) => void): number;
  cancelAnimationFrame?(handle: number): void;
  /** Native layer objects vary by browser; the presentation runtime constructs this state. */
  updateRenderState?(state: unknown): void | Promise<void>;
  addEventListener?(type: string, listener: (event: A3DXREventLike) => void): void;
  removeEventListener?(type: string, listener: (event: A3DXREventLike) => void): void;
  end?(): Promise<void>;
}

export interface A3DXRViewportLike { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface A3DXRWebGLLayerLike {
  readonly framebuffer?: unknown;
  readonly framebufferWidth?: number;
  readonly framebufferHeight?: number;
  fixedFoveation?: number | null;
  getViewport?(view: A3DXRViewLike): A3DXRViewportLike | null | undefined;
}
export interface A3DXRTransformLike {
  readonly matrix?: A3DXRNumericArray;
  readonly position?: A3DXRPointLike;
  readonly orientation?: A3DXRPointLike;
  readonly inverse?: { readonly matrix?: A3DXRNumericArray };
}
export interface A3DXRViewLike {
  readonly eye?: "left" | "right" | "none";
  readonly projectionMatrix?: A3DXRNumericArray;
  readonly transform?: A3DXRTransformLike;
}
export interface A3DXRInputSourceLike {
  readonly handedness?: A3DXRHandedness;
  readonly targetRayMode?: "gaze" | "tracked-pointer" | "screen" | "transient-pointer";
  readonly profiles?: readonly string[];
  readonly targetRaySpace?: unknown;
  readonly gripSpace?: unknown;
  readonly hand?: A3DXRHandLike | null;
  readonly gamepad?: {
    readonly buttons?: readonly { readonly pressed?: boolean; readonly touched?: boolean; readonly value?: number }[];
    readonly axes?: readonly number[];
    readonly hapticActuators?: readonly { pulse?(intensity: number, duration: number): Promise<boolean> | boolean }[];
  } | null;
}
export interface A3DXRJointSample {
  readonly position?: A3DXRPointLike;
  readonly orientation?: A3DXRPointLike;
  readonly radius?: number;
}
/** Supports both browser XRHand's iterable joint spaces and legacy injected samples. */
export interface A3DXRHandLike {
  readonly handedness?: A3DXRHandedness;
  readonly trackingState?: "tracked" | "not-tracked" | unknown;
  readonly joints?: Readonly<Record<string, A3DXRJointSample>>;
  entries?(): IterableIterator<[string, unknown]>;
}
export interface A3DXRViewerPoseLike {
  readonly views?: readonly A3DXRViewLike[];
  readonly transform?: A3DXRTransformLike;
  readonly position?: A3DXRPointLike;
  readonly orientation?: A3DXRPointLike;
  readonly viewMatrix?: A3DXRNumericArray;
  readonly projectionMatrix?: A3DXRNumericArray;
}
export interface A3DXRHitTestSourceLike { cancel?(): void }
export interface A3DXRFrameLike {
  getHitTestResults?(source: unknown): readonly A3DXRHitTestResultLike[];
  getPose?(space: unknown, baseSpace: unknown): A3DXRPoseLike | null | undefined;
  getJointPose?(joint: unknown, baseSpace: unknown): (A3DXRPoseLike & { readonly radius?: number }) | null | undefined;
  getViewerPose?(referenceSpace: unknown): A3DXRViewerPoseLike | null | undefined;
  readonly detectedPlanes?: Iterable<A3DXRPlaneLike>;
  getDepthInformation?(view: A3DXRViewLike): A3DXRDepthInformationLike | null | undefined;
  getLightEstimate?(probe: unknown): A3DXRLightEstimateLike | null | undefined;
}
export interface A3DXRReferenceSpaceLike {
  readonly type?: A3DXRReferenceSpaceType;
  addEventListener?(type: string, listener: (event: A3DXREventLike) => void): void;
  removeEventListener?(type: string, listener: (event: A3DXREventLike) => void): void;
}
export interface A3DXRHitTestResultLike {
  readonly position?: A3DXRPointLike;
  readonly normal?: A3DXRPointLike;
  getPose?(baseSpace: unknown): A3DXRPoseLike | null | undefined;
}
export interface A3DXRPoseLike { readonly transform?: A3DXRTransformLike }
export interface A3DXRPlaneLike {
  readonly planeSpace: unknown;
  readonly polygon?: Iterable<A3DXRPointLike>;
  readonly orientation?: string | null;
  readonly semanticLabel?: string | null;
  readonly lastChangedTime?: number;
}
export interface A3DXRDepthInformationLike {
  readonly width: number;
  readonly height: number;
  readonly rawValueToMeters: number;
  readonly normDepthBufferFromNormView?: A3DXRTransformLike;
  readonly data?: ArrayBuffer | ArrayBufferView;
  readonly texture?: unknown;
  readonly textureType?: string;
  readonly imageIndex?: number | null;
}
export interface A3DXRLightEstimateLike {
  readonly primaryLightDirection?: A3DXRPointLike;
  readonly primaryLightIntensity?: A3DXRPointLike;
  readonly sphericalHarmonicsCoefficients?: A3DXRNumericArray;
}
export interface WebXRSessionControllerOptions {
  readonly xr?: A3DXRSystemLike;
  /** Controllers with the same owner serialize native session acquisition and closure. */
  readonly leaseOwner?: object;
  readonly mode?: A3DXRSessionMode;
  readonly requiredFeatures?: readonly string[];
  readonly optionalFeatures?: readonly string[];
  readonly referenceSpace?: A3DXRReferenceSpaceType;
  readonly depthSensing?: A3DXRDepthSensingOptions;
}
export interface WebXRControllerSample {
  readonly id: number;
  readonly handedness: A3DXRHandedness;
  readonly targetRayMode: "gaze" | "tracked-pointer" | "screen" | "transient-pointer";
  readonly profiles: readonly string[];
  readonly triggerPressed: boolean;
  readonly squeezePressed: boolean;
  readonly primaryValue: number;
  readonly axes: readonly number[];
  readonly targetRayMatrix: readonly number[] | null;
  readonly gripMatrix: readonly number[] | null;
  readonly hapticActuatorCount: number;
}
export interface WebXRHitTestSample { readonly position: readonly [number, number, number]; readonly normal: readonly [number, number, number] }
export interface WebXRJointSample {
  readonly position: readonly [number, number, number] | null;
  readonly orientation: readonly [number, number, number, number] | null;
  readonly radius: number;
}
export interface WebXRHandSample { readonly id: number; readonly handedness: A3DXRHandedness; readonly tracked: boolean; readonly jointCount: number; readonly joints: Readonly<Record<string, WebXRJointSample>> }
export interface WebXRCameraSample {
  readonly tracked: boolean;
  readonly position: readonly [number, number, number] | null;
  readonly orientation: readonly [number, number, number, number] | null;
  readonly viewMatrix: readonly number[] | null;
  readonly projectionMatrix: readonly number[] | null;
}
export interface WebXRPlaneSample {
  readonly id: number;
  readonly matrix: readonly number[] | null;
  readonly polygon: readonly (readonly [number, number, number])[];
  readonly orientation: string | null;
  readonly semanticLabel: string | null;
  readonly lastChangedTime: number | null;
}
export interface WebXRDepthSample {
  readonly eye: "left" | "right" | "none";
  readonly width: number;
  readonly height: number;
  readonly rawValueToMeters: number;
  readonly transform: readonly number[] | null;
  readonly data: ArrayBuffer | ArrayBufferView | null;
  readonly texture: unknown | null;
  readonly textureType: string | null;
  readonly imageIndex: number | null;
}
export interface WebXRLightSample {
  readonly direction: readonly [number, number, number] | null;
  readonly intensity: readonly [number, number, number] | null;
  readonly sphericalHarmonics: readonly number[];
}
export interface WebXRCapabilityReport {
  readonly handTracking: boolean;
  readonly viewerPose: boolean;
  readonly hitTest: boolean;
  readonly haptics: boolean;
  readonly referenceSpace: A3DXRReferenceSpaceType;
  readonly enabledFeatures: readonly string[];
  readonly planeDetection: boolean;
  readonly depthSensing: boolean;
  readonly lightEstimation: boolean;
}
export interface WebXRFrameSample {
  readonly mode: A3DXRSessionMode;
  readonly referenceSpace: A3DXRReferenceSpaceType;
  readonly active: boolean;
  readonly controllerCount: number;
  readonly controllers: readonly WebXRControllerSample[];
  readonly hitTestCount: number;
  readonly hitTests: readonly WebXRHitTestSample[];
  readonly hands: readonly WebXRHandSample[];
  readonly camera: WebXRCameraSample;
  readonly planes: readonly WebXRPlaneSample[];
  readonly depth: readonly WebXRDepthSample[];
  readonly light: WebXRLightSample | null;
  readonly capabilities: WebXRCapabilityReport;
}
export interface WebXRSessionStartResult { readonly mode: A3DXRSessionMode; readonly referenceSpace: A3DXRReferenceSpaceType; readonly supported: boolean; readonly started: boolean; readonly busy?: true }

// A cancelled native request cannot itself be cancelled. Keep its owner busy
// until it rejects or its eventual session has finished closing. Weak keys keep
// this coordination scoped to the app without retaining disposed owners.
const sessionLeases = new WeakMap<object, object>();

/** Owns one pending or active session. A cancelled start closes any session that arrives late. */
export class WebXRSessionController {
  readonly mode: A3DXRSessionMode;
  readonly requiredFeatures: readonly string[];
  readonly optionalFeatures: readonly string[];
  readonly referenceSpaceType: A3DXRReferenceSpaceType;
  private readonly explicitReferenceSpace: boolean;
  private activeReferenceSpaceType: A3DXRReferenceSpaceType;
  private readonly xr?: A3DXRSystemLike;
  private readonly leaseOwner: object;
  private lease: object | null = null;
  private readonly depthSensing?: A3DXRDepthSensingOptions;
  private session: A3DXRSessionLike | null = null;
  private referenceSpace: A3DXRReferenceSpaceLike | null = null;
  private hitTestSource: A3DXRHitTestSourceLike | null = null;
  private lightProbe: unknown = null;
  private pendingSession: A3DXRSessionLike | null = null;
  private readonly endedSessions = new WeakSet<A3DXRSessionLike>();
  private readonly sessionClosePromises = new WeakMap<A3DXRSessionLike, Promise<void>>();
  private readonly sourceIds = new WeakMap<object, number>();
  private nextSourceId = 1;
  private readonly planeIds = new WeakMap<object, number>();
  private nextPlaneId = 1;
  private generation = 0;
  private starting = false;
  private disposed = false;
  private endPromise: Promise<void> | null = null;
  private endListener: ((event: A3DXREventLike) => void) | null = null;
  private readonly hapticCleanups = new Set<() => void>();
  readonly warnings: string[] = [];

  constructor(options: WebXRSessionControllerOptions = {}) {
    this.xr = options.xr ?? readNavigatorXR();
    this.leaseOwner = options.leaseOwner ?? this;
    this.mode = options.mode ?? "immersive-vr";
    this.requiredFeatures = options.requiredFeatures ?? [];
    this.optionalFeatures = options.optionalFeatures ?? [];
    this.depthSensing = options.depthSensing;
    this.referenceSpaceType = options.referenceSpace ?? (this.mode === "immersive-ar" ? "viewer" : "local-floor");
    this.explicitReferenceSpace = options.referenceSpace !== undefined;
    this.activeReferenceSpaceType = this.referenceSpaceType;
  }
  get active(): boolean { return this.session !== null && this.referenceSpace !== null; }
  get xrSession(): A3DXRSessionLike | null { return this.session; }
  get xrReferenceSpace(): A3DXRReferenceSpaceLike | null { return this.referenceSpace; }
  get xrHitTestSource(): A3DXRHitTestSourceLike | null { return this.hitTestSource; }
  get hasLightProbe(): boolean { return this.lightProbe !== null; }
  async isSupported(): Promise<boolean> {
    if (this.disposed || !this.xr) return false;
    return this.xr.isSessionSupported ? this.xr.isSessionSupported(this.mode) : true;
  }
  private result(supported: boolean, started: boolean, busy = false): WebXRSessionStartResult {
    return { mode: this.mode, referenceSpace: this.activeReferenceSpaceType, supported, started, ...(busy ? { busy: true as const } : {}) };
  }
  private releaseLease(lease: object): void {
    if (sessionLeases.get(this.leaseOwner) === lease) sessionLeases.delete(this.leaseOwner);
    if (this.lease === lease) this.lease = null;
  }
  async start(): Promise<WebXRSessionStartResult> {
    if (this.disposed || !this.xr) return this.result(false, false);
    if (this.starting || this.session || this.endPromise || sessionLeases.has(this.leaseOwner)) return this.result(true, false, true);
    const generation = ++this.generation;
    this.starting = true;
    this.warnings.length = 0;
    let candidate: A3DXRSessionLike | null = null;
    let lease: object | null = null;
    let source: A3DXRHitTestSourceLike | null = null;
    let pendingEndListener: ((event: A3DXREventLike) => void) | null = null;
    try {
      const supported = await this.isSupported();
      if (generation !== this.generation) return this.result(supported, false);
      if (!supported) return this.result(false, false);
      // Check again after support detection, which can run concurrently for
      // different controllers with the same owner.
      if (sessionLeases.has(this.leaseOwner)) return this.result(true, false, true);
      lease = {};
      sessionLeases.set(this.leaseOwner, lease);
      this.lease = lease;
      const requestedType = this.referenceSpaceType;
      const implied = requestedType === "viewer" || requestedType === "local";
      const listed = this.requiredFeatures.includes(requestedType) || this.optionalFeatures.includes(requestedType);
      const optionalFeatures = implied || listed ? this.optionalFeatures : [...this.optionalFeatures, requestedType];
      candidate = await this.xr.requestSession(this.mode, { requiredFeatures: this.requiredFeatures, optionalFeatures, ...(this.depthSensing ? { depthSensing: this.depthSensing } : {}) });
      if (generation !== this.generation) return this.result(true, false);
      this.pendingSession = candidate;
      const openingSession = candidate;
      pendingEndListener = () => {
        if (this.pendingSession === openingSession) {
          this.pendingSession = null;
          this.endedSessions.add(openingSession);
          ++this.generation;
          this.starting = false;
          if (lease) this.releaseLease(lease);
        }
      };
      candidate.addEventListener?.("end", pendingEndListener);
      if (generation !== this.generation) return this.result(true, false);
      if (typeof candidate.requestReferenceSpace !== "function") {
        throw new Error("XR_REFERENCE_SPACE_UNAVAILABLE: the session does not expose requestReferenceSpace.");
      }
      let space: A3DXRReferenceSpaceLike | null | undefined;
      let actualType = requestedType;
      try {
        space = await candidate.requestReferenceSpace(requestedType);
      } catch (error) {
        if (generation !== this.generation) return this.result(true, false);
        if (this.explicitReferenceSpace || requestedType !== "local-floor") throw error;
        actualType = "local";
        try {
          space = await candidate.requestReferenceSpace("local");
        } catch (fallbackError) {
          if (generation !== this.generation) return this.result(true, false);
          throw fallbackError;
        }
      }
      if (generation !== this.generation) return this.result(true, false);
      if (!space || typeof space !== "object") {
        throw new Error(`XR_REFERENCE_SPACE_UNAVAILABLE: the session did not supply a usable ${actualType} reference space.`);
      }
      const features = [...this.requiredFeatures, ...this.optionalFeatures];
      if (features.includes("hit-test")) {
        if (candidate.requestHitTestSource) {
          try {
            const viewer = actualType === "viewer" ? space : await candidate.requestReferenceSpace?.("viewer");
            if (generation !== this.generation) return this.result(true, false);
            if (viewer) {
              source = await candidate.requestHitTestSource({ space: viewer }) ?? null;
              if (!source && generation === this.generation) this.warnings.push("Hit testing unavailable: no hit-test source was supplied.");
            }
            else this.warnings.push("Hit testing unavailable: viewer reference space was not supplied.");
          } catch (error) {
            if (generation !== this.generation) return this.result(true, false);
            this.warnings.push(`Hit testing unavailable: ${message(error)}`);
          }
        } else this.warnings.push("Hit testing unavailable: session does not expose requestHitTestSource.");
      }
      if (generation !== this.generation) return this.result(true, false);
      let lightProbe: unknown = null;
      if (features.includes("light-estimation")) {
        if (candidate.requestLightProbe) {
          try { lightProbe = await candidate.requestLightProbe(); }
          catch (error) { if (generation === this.generation) this.warnings.push(`Light estimation unavailable: ${message(error)}`); }
        } else this.warnings.push("Light estimation unavailable: session does not expose requestLightProbe.");
      }
      if (generation !== this.generation) return this.result(true, false);
      this.session = candidate;
      this.referenceSpace = space;
      this.activeReferenceSpaceType = actualType;
      this.hitTestSource = source;
      this.lightProbe = lightProbe;
      const owned = candidate;
      const ownedLease = lease;
      this.endListener = () => {
        if (this.session === owned) {
          this.endedSessions.add(owned);
          this.clearOwned();
          if (ownedLease) this.releaseLease(ownedLease);
        }
      };
      candidate.addEventListener?.("end", this.endListener);
      if (pendingEndListener) candidate.removeEventListener?.("end", pendingEndListener);
      pendingEndListener = null;
      if (this.pendingSession === candidate) this.pendingSession = null;
      candidate = null;
      source = null;
      lease = null; // The active session now owns the lease.
      return this.result(true, true);
    } finally {
      if (generation === this.generation) this.starting = false;
      cancelSource(source);
      if (candidate) {
        if (pendingEndListener) candidate.removeEventListener?.("end", pendingEndListener);
        if (this.pendingSession === candidate) this.pendingSession = null;
        await this.closeSession(candidate);
      }
      if (lease) this.releaseLease(lease);
    }
  }
  private clearOwned(): void {
    const session = this.session;
    if (this.endListener) session?.removeEventListener?.("end", this.endListener);
    this.endListener = null;
    for (const cleanup of this.hapticCleanups) cleanup();
    cancelSource(this.hitTestSource);
    this.hitTestSource = null;
    this.lightProbe = null;
    this.session = null;
    this.referenceSpace = null;
    this.activeReferenceSpaceType = this.referenceSpaceType;
  }
  sampleFrame(
    frame?: A3DXRFrameLike,
    hitTestSource?: unknown,
    gpuDepth?: (view: A3DXRViewLike) => A3DXRDepthInformationLike | null | undefined
  ): WebXRFrameSample {
    const referenceSpace = this.referenceSpace ?? { type: this.activeReferenceSpaceType };
    const sources = Array.from(this.session?.inputSources ?? []);
    const id = (source: A3DXRInputSourceLike): number => {
      let value = this.sourceIds.get(source);
      if (value === undefined) { value = this.nextSourceId++; this.sourceIds.set(source, value); }
      return value;
    };
    const controllers = sources.map((source) => sampleInputSource(id(source), source, frame, referenceSpace));
    const hands = sources.filter((source) => source.hand != null).map((source) => sampleHand(id(source), source.handedness ?? "none", source.hand, frame, referenceSpace));
    const source = hitTestSource ?? this.hitTestSource;
    const hitTests = source && frame?.getHitTestResults ? safe(() => frame.getHitTestResults!(source), []).flatMap((hit) => {
      const sampled = sampleHitTest(hit, referenceSpace);
      return sampled ? [sampled] : [];
    }) : [];
    const pose = safe(() => frame?.getViewerPose?.(referenceSpace), undefined);
    const camera = sampleViewerPose(pose);
    const planes = Array.from(frame?.detectedPlanes ?? [], (plane) => {
      let planeId = this.planeIds.get(plane);
      if (planeId === undefined) { planeId = this.nextPlaneId++; this.planeIds.set(plane, planeId); }
      return samplePlane(planeId, plane, frame, referenceSpace);
    });
    const depth = (pose?.views ?? []).flatMap((view) => {
      const value = safe(() => frame?.getDepthInformation?.(view), undefined) ?? safe(() => gpuDepth?.(view), undefined);
      return value ? [sampleDepth(view, value)] : [];
    });
    const lightEstimate = this.lightProbe ? safe(() => frame?.getLightEstimate?.(this.lightProbe), undefined) : undefined;
    const light = lightEstimate ? sampleLight(lightEstimate) : null;
    const enabledFeatures = Array.from(this.session?.enabledFeatures ?? []);
    return {
      mode: this.mode, referenceSpace: this.activeReferenceSpaceType, active: this.active,
      controllerCount: controllers.length, controllers, hitTestCount: hitTests.length, hitTests, hands, camera, planes, depth, light,
      capabilities: {
        handTracking: hands.some((hand) => hand.tracked), viewerPose: camera.tracked,
        hitTest: Boolean(frame?.getHitTestResults && source), haptics: controllers.some((controller) => controller.hapticActuatorCount > 0),
        referenceSpace: this.activeReferenceSpaceType, enabledFeatures,
        planeDetection: frame?.detectedPlanes !== undefined, depthSensing: depth.length > 0, lightEstimation: light !== null
      }
    };
  }
  end(): Promise<void> {
    ++this.generation;
    this.starting = false;
    const session = this.session;
    const pending = this.pendingSession;
    const lease = pending || session ? this.lease : null;
    this.pendingSession = null;
    this.clearOwned();
    const previous = this.endPromise;
    // Publish the closing promise before invoking the native end method: an
    // end listener can synchronously re-enter this controller or its runtime.
    const closing = Promise.resolve().then(async () => {
      if (previous) await previous;
      if (pending) await this.closeSession(pending);
      if (session) await this.closeSession(session);
    });
    this.endPromise = closing;
    return closing.finally(() => {
      if (lease) this.releaseLease(lease);
      if (this.endPromise === closing) this.endPromise = null;
    });
  }
  async dispose(): Promise<void> {
    if (this.disposed) { await this.endPromise; return; }
    this.disposed = true;
    await this.end();
  }
  private closeSession(session: A3DXRSessionLike): Promise<void> {
    const previous = this.sessionClosePromises.get(session);
    if (previous) return previous;
    if (this.endedSessions.has(session)) return Promise.resolve();
    this.endedSessions.add(session);
    const closing = Promise.resolve().then(async () => {
      try { await session.end?.(); } catch { /* A native session can already be ended. */ }
    });
    this.sessionClosePromises.set(session, closing);
    return closing;
  }
  async pulseHaptics(intensity = 0.5, duration = 35): Promise<number> {
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) throw new RangeError("WebXR haptic intensity must be in [0, 1].");
    if (!Number.isFinite(duration) || duration < 0) throw new RangeError("WebXR haptic duration must be finite and non-negative.");
    const session = this.session;
    if (!session || !this.referenceSpace || this.disposed) return 0;
    const generation = this.generation;
    const isCurrent = (): boolean => !this.disposed && this.session === session && this.generation === generation;
    const removed = new Set<A3DXRInputSourceLike>();
    const onSourcesChanged = (event: A3DXREventLike): void => {
      for (const source of event.removed ?? []) removed.add(source);
    };
    const cleanup = (): void => {
      session.removeEventListener?.("inputsourceschange", onSourcesChanged);
      this.hapticCleanups.delete(cleanup);
    };
    if (session.addEventListener && session.removeEventListener) {
      session.addEventListener("inputsourceschange", onSourcesChanged);
      this.hapticCleanups.add(cleanup);
    }
    // Native lists are repeatable, while injected session sources may be a
    // one-shot iterator. Preserve the latter's initial snapshot and use source
    // removal events to invalidate it when available.
    const oneShotSources = new Map<Iterable<A3DXRInputSourceLike>, readonly A3DXRInputSourceLike[]>();
    const currentSources = (): readonly A3DXRInputSourceLike[] => {
      const collection = session.inputSources;
      if (!collection) return [];
      const previous = oneShotSources.get(collection);
      if (previous) return previous;
      const iterator = collection[Symbol.iterator]();
      const snapshot = Array.from({ [Symbol.iterator]: () => iterator });
      if (iterator === (collection as unknown)) oneShotSources.set(collection, snapshot);
      return snapshot;
    };
    const sourceIsLive = (source: A3DXRInputSourceLike): boolean => !removed.has(source) && currentSources().includes(source);
    try {
      const sources = currentSources();
      let pulses = 0;
      for (const source of sources) {
        if (!isCurrent()) break;
        if (!sourceIsLive(source)) continue;
        const actuators = Array.from(source.gamepad?.hapticActuators ?? []);
        for (const actuator of actuators) {
          if (!isCurrent()) return pulses;
          if (!sourceIsLive(source)) break;
          if (!source.gamepad?.hapticActuators?.includes(actuator)) continue;
          if (!isCurrent()) return pulses;
          if (actuator.pulse && await actuator.pulse(intensity, duration) !== false) pulses += 1;
        }
      }
      return pulses;
    } finally {
      cleanup();
    }
  }
}

function sampleInputSource(id: number, source: A3DXRInputSourceLike, frame: A3DXRFrameLike | undefined, space: A3DXRReferenceSpaceLike): WebXRControllerSample {
  const trigger = source.gamepad?.buttons?.[0];
  return {
    id, handedness: source.handedness ?? "none", targetRayMode: source.targetRayMode ?? "tracked-pointer", profiles: source.profiles ?? [],
    triggerPressed: Boolean(trigger?.pressed), squeezePressed: Boolean(source.gamepad?.buttons?.[1]?.pressed), primaryValue: finiteOrZero(trigger?.value),
    axes: (source.gamepad?.axes ?? []).map(finiteOrZero), targetRayMatrix: samplePoseMatrix(frame, source.targetRaySpace, space),
    gripMatrix: samplePoseMatrix(frame, source.gripSpace, space), hapticActuatorCount: source.gamepad?.hapticActuators?.length ?? 0
  };
}
function samplePoseMatrix(frame: A3DXRFrameLike | undefined, target: unknown, base: A3DXRReferenceSpaceLike): readonly number[] | null {
  return target && frame?.getPose ? matrix(safe(() => frame.getPose!(target, base)?.transform?.matrix, undefined)) : null;
}
function sampleHand(id: number, handedness: A3DXRHandedness, hand: A3DXRHandLike | null | undefined, frame: A3DXRFrameLike | undefined, base: A3DXRReferenceSpaceLike): WebXRHandSample {
  const joints: Record<string, WebXRJointSample> = {};
  if (hand?.entries && frame?.getJointPose) {
    for (const [name, jointSpace] of hand.entries()) {
      const pose = safe(() => frame.getJointPose!(jointSpace, base), undefined);
      if (!pose) continue;
      joints[name] = { position: vector3(pose.transform?.position), orientation: quaternion(pose.transform?.orientation), radius: Math.max(0, finiteOrZero(pose.radius)) };
    }
  } else for (const [name, joint] of Object.entries(hand?.joints ?? {}).slice(0, 64)) {
    joints[name] = { position: vector3(joint.position), orientation: quaternion(joint.orientation), radius: Math.max(0, finiteOrZero(joint.radius)) };
  }
  const jointCount = Object.keys(joints).length;
  return { id, handedness, tracked: jointCount > 0 && (hand?.entries ? true : hand?.trackingState === "tracked"), jointCount, joints };
}
function sampleViewerPose(pose: A3DXRViewerPoseLike | null | undefined): WebXRCameraSample {
  const position = vector3(pose?.transform?.position ?? pose?.position);
  const orientation = quaternion(pose?.transform?.orientation ?? pose?.orientation);
  const viewMatrix = matrix(pose?.viewMatrix ?? pose?.views?.[0]?.transform?.inverse?.matrix);
  const projectionMatrix = matrix(pose?.projectionMatrix ?? pose?.views?.[0]?.projectionMatrix);
  return { tracked: Boolean(position || orientation || viewMatrix || projectionMatrix), position, orientation, viewMatrix, projectionMatrix };
}
function sampleHitTest(hit: A3DXRHitTestResultLike, referenceSpace: A3DXRReferenceSpaceLike): WebXRHitTestSample | null {
  const pose = safe(() => hit.getPose?.(referenceSpace), undefined);
  const position = vector3(pose?.transform?.position ?? hit.position);
  if (!position) return null;
  const rotation = quaternion(pose?.transform?.orientation);
  const m = matrix(pose?.transform?.matrix);
  const normal = vector3(hit.normal) ?? (m ? [m[4]!, m[5]!, m[6]!] as const : rotation ? rotateUp(rotation) : [0, 1, 0] as const);
  return { position, normal };
}
function samplePlane(id: number, plane: A3DXRPlaneLike, frame: A3DXRFrameLike | undefined, base: A3DXRReferenceSpaceLike): WebXRPlaneSample {
  return {
    id, matrix: samplePoseMatrix(frame, plane.planeSpace, base),
    polygon: Array.from(plane.polygon ?? []).flatMap((point) => { const v = vector3(point); return v ? [v] : []; }),
    orientation: plane.orientation ?? null, semanticLabel: plane.semanticLabel ?? null,
    lastChangedTime: Number.isFinite(plane.lastChangedTime) ? plane.lastChangedTime! : null
  };
}
function sampleDepth(view: A3DXRViewLike, depth: A3DXRDepthInformationLike): WebXRDepthSample {
  return { eye: view.eye ?? "none", width: depth.width, height: depth.height, rawValueToMeters: depth.rawValueToMeters,
    transform: matrix(depth.normDepthBufferFromNormView?.matrix), data: depth.data ?? null, texture: depth.texture ?? null,
    textureType: depth.textureType ?? null, imageIndex: depth.imageIndex ?? null };
}
function sampleLight(value: A3DXRLightEstimateLike): WebXRLightSample {
  return { direction: vector3(value.primaryLightDirection), intensity: vector3(value.primaryLightIntensity),
    sphericalHarmonics: Array.from(value.sphericalHarmonicsCoefficients ?? [], finiteOrZero) };
}
function rotateUp(q: readonly [number, number, number, number]): readonly [number, number, number] {
  const [x, y, z, w] = q;
  return [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)];
}
function components(value: A3DXRPointLike | undefined): readonly number[] | null {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  const point = value as { readonly x: number; readonly y: number; readonly z: number; readonly w?: number };
  return [point.x, point.y, point.z, point.w ?? NaN];
}
function vector3(value: A3DXRPointLike | undefined): readonly [number, number, number] | null {
  const c = components(value);
  return c && c.length >= 3 && c.slice(0, 3).every(Number.isFinite) ? [c[0]!, c[1]!, c[2]!] : null;
}
function quaternion(value: A3DXRPointLike | undefined): readonly [number, number, number, number] | null {
  const c = components(value);
  return c && c.length >= 4 && c.slice(0, 4).every(Number.isFinite) ? [c[0]!, c[1]!, c[2]!, c[3]!] : null;
}
function matrix(value: A3DXRNumericArray | undefined): readonly number[] | null {
  if (!value || value.length < 16) return null;
  const entries = Array.from({ length: 16 }, (_, i) => value[i]!);
  return entries.every(Number.isFinite) ? entries : null;
}
function safe<T>(fn: () => T, fallback: T): T { try { return fn(); } catch { return fallback; } }
function cancelSource(source: A3DXRHitTestSourceLike | null): void { try { source?.cancel?.(); } catch { /* A closed native session may already have invalidated the source. */ } }
function finiteOrZero(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function readNavigatorXR(): A3DXRSystemLike | undefined { return (globalThis.navigator as (Navigator & { xr?: A3DXRSystemLike }) | undefined)?.xr; }
