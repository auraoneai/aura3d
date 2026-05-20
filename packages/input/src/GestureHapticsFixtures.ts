export type GestureHapticsGestureType = "tap" | "pan" | "pinch" | "swipe" | "rotate";
export type GestureHapticsPatternName = "tap" | "impact" | "damage" | "success" | "engine";

export interface GestureHapticsFixtureOptions {
  readonly seed?: number;
  readonly pointerDeltaX?: number;
  readonly pointerDeltaY?: number;
  readonly pinchStartDistance?: number;
  readonly pinchEndDistance?: number;
  readonly rotateDegrees?: number;
  readonly gamepadConnected?: boolean;
}

export interface GestureHapticsFixture {
  readonly source: "origin-master-input-gesture-rumble-adapted";
  readonly gestures: readonly {
    readonly type: GestureHapticsGestureType;
    readonly state: "possible" | "began" | "changed" | "ended";
    readonly touchCount: number;
    readonly center: readonly [number, number];
    readonly distance?: number;
    readonly velocity?: readonly [number, number];
    readonly scale?: number;
    readonly rotationDegrees?: number;
  }[];
  readonly gestureSummary: {
    readonly tapDetected: boolean;
    readonly panDistance: number;
    readonly pinchScale: number;
    readonly swipeDirection: "left" | "right" | "up" | "down";
    readonly rotateDegrees: number;
  };
  readonly haptics: {
    readonly gamepadConnected: boolean;
    readonly hapticsClaimed: false;
    readonly patterns: readonly {
      readonly name: GestureHapticsPatternName;
      readonly steps: number;
      readonly totalDurationMs: number;
      readonly peakWeak: number;
      readonly peakStrong: number;
      readonly loop: boolean;
    }[];
    readonly queuedPatterns: number;
    readonly totalDurationMs: number;
    readonly intensityMultiplier: number;
  };
  readonly productionReadiness: {
    readonly gestureTelemetry: true;
    readonly swipeRotateTelemetry: true;
    readonly hapticPatternTelemetry: true;
    readonly hapticClaimBoundaryTelemetry: true;
  };
  readonly blockedClaims: readonly string[];
  readonly claimBoundary: string;
  readonly hash: string;
}

export function sampleGestureHapticsFixture(options: GestureHapticsFixtureOptions = {}): GestureHapticsFixture {
  const seed = normalizeSeed(options.seed ?? 0x9e57);
  const pointerDeltaX = finite(options.pointerDeltaX ?? 84, "pointerDeltaX");
  const pointerDeltaY = finite(options.pointerDeltaY ?? 18, "pointerDeltaY");
  const pinchStartDistance = positive(options.pinchStartDistance ?? 42, "pinchStartDistance");
  const pinchEndDistance = positive(options.pinchEndDistance ?? 76, "pinchEndDistance");
  const rotateDegrees = finite(options.rotateDegrees ?? 28, "rotateDegrees");
  const panDistance = Number(Math.hypot(pointerDeltaX, pointerDeltaY).toFixed(3));
  const pinchScale = Number((pinchEndDistance / pinchStartDistance).toFixed(3));
  const swipeDirection = Math.abs(pointerDeltaX) >= Math.abs(pointerDeltaY)
    ? pointerDeltaX >= 0 ? "right" : "left"
    : pointerDeltaY >= 0 ? "down" : "up";
  const patterns = [
    hapticPattern("tap", [{ weak: 0.3, strong: 0.2, duration: 50 }], false),
    hapticPattern("impact", [{ weak: 0.7, strong: 0.8, duration: 100 }], false),
    hapticPattern("damage", [
      { weak: 0.8, strong: 0.9, duration: 80 },
      { weak: 0, strong: 0, duration: 40 },
      { weak: 0.6, strong: 0.7, duration: 60 }
    ], false),
    hapticPattern("success", [
      { weak: 0.3, strong: 0.3, duration: 80 },
      { weak: 0, strong: 0, duration: 50 },
      { weak: 0.4, strong: 0.4, duration: 100 }
    ], false),
    hapticPattern("engine", [
      { weak: 0.3, strong: 0.2, duration: 50 },
      { weak: 0.35, strong: 0.25, duration: 50 }
    ], true)
  ] as const;
  const fixture: Omit<GestureHapticsFixture, "hash"> = {
    source: "origin-master-input-gesture-rumble-adapted",
    gestures: [
      { type: "tap", state: "ended", touchCount: 1, center: [16, 22] },
      { type: "pan", state: "changed", touchCount: 1, center: [42, 38], distance: panDistance, velocity: [pointerDeltaX, pointerDeltaY] },
      { type: "pinch", state: "changed", touchCount: 2, center: [64, 64], distance: pinchEndDistance, scale: pinchScale },
      { type: "swipe", state: "ended", touchCount: 1, center: [120, 64], distance: panDistance, velocity: [pointerDeltaX * 8, pointerDeltaY * 8] },
      { type: "rotate", state: "changed", touchCount: 2, center: [64, 64], rotationDegrees: Number(rotateDegrees.toFixed(3)) }
    ],
    gestureSummary: {
      tapDetected: true,
      panDistance,
      pinchScale,
      swipeDirection,
      rotateDegrees: Number(rotateDegrees.toFixed(3))
    },
    haptics: {
      gamepadConnected: options.gamepadConnected ?? true,
      hapticsClaimed: false,
      patterns,
      queuedPatterns: 3 + Math.floor(seededUnit(seed) * 2),
      totalDurationMs: patterns.reduce((sum, pattern) => sum + pattern.totalDurationMs, 0),
      intensityMultiplier: Number((0.65 + seededUnit(seed ^ 0x54c) * 0.25).toFixed(3))
    },
    productionReadiness: {
      gestureTelemetry: true,
      swipeRotateTelemetry: true,
      hapticPatternTelemetry: true,
      hapticClaimBoundaryTelemetry: true
    },
    blockedClaims: [
      "native mobile gesture recognizer parity",
      "gamepad haptic actuator delivery guarantee",
      "platform vibration permission handling",
      "Unity Input System haptics parity",
      "Unreal Enhanced Input haptics parity"
    ],
    claimBoundary: "This fixture ports old swipe/rotate gesture and rumble-pattern concepts into deterministic local input telemetry. It does not vibrate hardware, guarantee platform haptic delivery, or claim Unity Input System or Unreal Enhanced Input parity."
  };
  return {
    ...fixture,
    hash: stableHash(JSON.stringify(fixture))
  };
}

function hapticPattern(
  name: GestureHapticsPatternName,
  steps: readonly { readonly weak: number; readonly strong: number; readonly duration: number }[],
  loop: boolean
): GestureHapticsFixture["haptics"]["patterns"][number] {
  return {
    name,
    steps: steps.length,
    totalDurationMs: steps.reduce((sum, step) => sum + step.duration, 0),
    peakWeak: Math.max(...steps.map((step) => step.weak)),
    peakStrong: Math.max(...steps.map((step) => step.strong)),
    loop
  };
}

function normalizeSeed(seed: number): number {
  if (!Number.isInteger(seed) || seed < 0) throw new Error("seed must be a non-negative integer.");
  return seed >>> 0;
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite.`);
  return value;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive.`);
  return value;
}

function seededUnit(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0xffffffff;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
