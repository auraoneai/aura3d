export type XRFixtureSessionMode = "inline" | "immersive-vr" | "immersive-ar";
export type XRFixtureLodLevel = "high" | "medium" | "low" | "culled";

export interface XRFixtureOptions {
  readonly requestedMode?: XRFixtureSessionMode;
  readonly gaze?: readonly [number, number];
  readonly objectCount?: number;
}

export interface XRRuntimeFixture {
  readonly source: "origin-master-xr-session-input-foveated-adapted";
  readonly requestedMode: XRFixtureSessionMode;
  readonly fallbackMode: "inline";
  readonly sessionSupported: boolean;
  readonly fallbackUsed: boolean;
  readonly webXRSessionClaimed: false;
  readonly deviceRuntimeClaimed: false;
  readonly evidence: {
    readonly oldCodebasePort: true;
    readonly sessionCapabilityNegotiation: true;
    readonly gracefulInlineFallback: true;
    readonly controllerInputTelemetry: true;
    readonly handGestureTelemetry: true;
    readonly gazeBasedLodTelemetry: true;
  };
  readonly capabilities: {
    readonly supportedModes: readonly XRFixtureSessionMode[];
    readonly requestedFeatures: readonly string[];
    readonly optionalFeatures: readonly string[];
    readonly unsupportedFeatures: readonly string[];
    readonly referenceSpaces: readonly string[];
    readonly depthSensing: false;
    readonly handTracking: false;
    readonly eyeTracking: false;
    readonly domOverlay: false;
  };
  readonly input: {
    readonly controllerCount: number;
    readonly handedness: readonly ["left", "right"];
    readonly triggerPressed: boolean;
    readonly squeezePressed: boolean;
    readonly thumbstickMagnitude: number;
    readonly hapticsClaimed: false;
    readonly pinchDetected: boolean;
    readonly pinchStrength: number;
    readonly pinchDistanceMeters: number;
    readonly pointDetected: boolean;
    readonly pointConfidence: number;
  };
  readonly gazeLod: {
    readonly gaze: readonly [number, number];
    readonly objectCount: number;
    readonly performanceBudget: number;
    readonly updatedObjects: number;
    readonly highDetailCount: number;
    readonly mediumDetailCount: number;
    readonly lowDetailCount: number;
    readonly culledCount: number;
    readonly transitionsPerFrame: number;
    readonly selectedLevels: readonly XRFixtureLodLevel[];
  };
  readonly blockedClaims: readonly string[];
  readonly hash: string;
  readonly claimBoundary: string;
}

export function sampleXRRuntimeFixture(options: XRFixtureOptions = {}): XRRuntimeFixture {
  const requestedMode = options.requestedMode ?? "immersive-vr";
  const gaze = options.gaze ?? [0.48, 0.44] as const;
  const objectCount = Math.max(6, Math.min(48, Math.trunc(options.objectCount ?? 14)));
  const supportedModes = ["inline"] as const;
  const sessionSupported = supportedModes.includes(requestedMode as "inline");
  const objects = Array.from({ length: objectCount }, (_, index) => {
    const column = index % 7;
    const row = Math.floor(index / 7);
    const x = 0.12 + column * 0.13;
    const y = 0.18 + row * 0.21;
    const distance = Math.hypot(x - gaze[0], y - gaze[1]);
    return { index, distance, lod: lodForDistance(distance) };
  });
  const performanceBudget = Math.min(10, objectCount);
  const updatedObjects = objects
    .slice()
    .sort((left, right) => left.distance - right.distance)
    .slice(0, performanceBudget);
  const selectedLevels = uniqueLevels(objects.map((object) => object.lod));
  const pinchDistanceMeters = 0.024;
  const pointConfidence = 0.82;
  const unsupportedFeatures = [
    "local-floor",
    "bounded-floor",
    "hand-tracking",
    "eye-tracking",
    "depth-sensing",
    "dom-overlay",
    "hit-test",
    "anchors",
    "plane-detection",
    "mesh-detection",
    "light-estimation"
  ];
  const blockedClaims = [
    "real WebXR headset session evidence",
    "AR hit-test anchor platform parity",
    "device hand-tracking runtime parity",
    "eye-tracked foveated rendering",
    "Unity XR Interaction Toolkit parity",
    "Unreal XR framework parity"
  ];
  const hash = hashStrings([
    requestedMode,
    String(sessionSupported),
    ...selectedLevels,
    String(updatedObjects.length),
    String(pinchDistanceMeters),
    String(pointConfidence),
    ...blockedClaims
  ]);

  return {
    source: "origin-master-xr-session-input-foveated-adapted",
    requestedMode,
    fallbackMode: "inline",
    sessionSupported,
    fallbackUsed: !sessionSupported,
    webXRSessionClaimed: false,
    deviceRuntimeClaimed: false,
    evidence: {
      oldCodebasePort: true,
      sessionCapabilityNegotiation: true,
      gracefulInlineFallback: true,
      controllerInputTelemetry: true,
      handGestureTelemetry: true,
      gazeBasedLodTelemetry: true
    },
    capabilities: {
      supportedModes,
      requestedFeatures: ["local-floor"],
      optionalFeatures: unsupportedFeatures.slice(2),
      unsupportedFeatures,
      referenceSpaces: ["viewer"],
      depthSensing: false,
      handTracking: false,
      eyeTracking: false,
      domOverlay: false
    },
    input: {
      controllerCount: 2,
      handedness: ["left", "right"],
      triggerPressed: true,
      squeezePressed: false,
      thumbstickMagnitude: round(Math.hypot(0.42, -0.36)),
      hapticsClaimed: false,
      pinchDetected: pinchDistanceMeters <= 0.03,
      pinchStrength: round((0.05 - pinchDistanceMeters) / 0.05),
      pinchDistanceMeters,
      pointDetected: true,
      pointConfidence
    },
    gazeLod: {
      gaze: [round(gaze[0]), round(gaze[1])],
      objectCount,
      performanceBudget,
      updatedObjects: updatedObjects.length,
      highDetailCount: objects.filter((object) => object.lod === "high").length,
      mediumDetailCount: objects.filter((object) => object.lod === "medium").length,
      lowDetailCount: objects.filter((object) => object.lod === "low").length,
      culledCount: objects.filter((object) => object.lod === "culled").length,
      transitionsPerFrame: updatedObjects.filter((object) => object.lod !== "medium").length,
      selectedLevels
    },
    blockedClaims,
    hash,
    claimBoundary: "Bounded deterministic fixture adapted from old XR session/input/foveated concepts. It does not claim a real WebXR headset session, AR platform support, eye-tracked foveated rendering, Unity XR parity, or Unreal XR parity."
  };
}

function lodForDistance(distance: number): XRFixtureLodLevel {
  if (distance <= 0.18) return "high";
  if (distance <= 0.36) return "medium";
  if (distance <= 0.58) return "low";
  return "culled";
}

function uniqueLevels(levels: readonly XRFixtureLodLevel[]): readonly XRFixtureLodLevel[] {
  const order: readonly XRFixtureLodLevel[] = ["high", "medium", "low", "culled"];
  return order.filter((level) => levels.includes(level));
}

function hashStrings(values: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const value of values) {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
