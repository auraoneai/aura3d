export interface ExternalParityContactShadowOptions {
  readonly casterRadius: number;
  readonly receiverDistance: number;
  readonly softness?: number;
  readonly opacity?: number;
}

export interface ExternalParityContactShadowLayer {
  readonly index: number;
  readonly radius: number;
  readonly scale: readonly [number, number];
  readonly opacity: number;
  readonly softness: number;
  readonly yOffset: number;
}

export interface ExternalParityContactShadow {
  readonly radius: number;
  readonly opacity: number;
  readonly softness: number;
  readonly receiverDistance: number;
  readonly anchorStrength: number;
  readonly diagnostic: string;
}

export interface ExternalParityContactShadowPlanOptions extends ExternalParityContactShadowOptions {
  readonly layerCount?: number;
  readonly anisotropy?: number;
  readonly yOffset?: number;
}

export interface ExternalParityContactShadowPlan {
  readonly shadow: ExternalParityContactShadow;
  readonly layers: readonly ExternalParityContactShadowLayer[];
  readonly fallback: "layered-receiver-geometry";
  readonly unsupportedRendererFeatures: readonly string[];
  readonly claimBoundary: string;
}

export function createExternalParityContactShadow(options: ExternalParityContactShadowOptions): ExternalParityContactShadow {
  if (!Number.isFinite(options.casterRadius) || options.casterRadius <= 0) throw new RangeError("Contact shadow casterRadius must be positive.");
  if (!Number.isFinite(options.receiverDistance) || options.receiverDistance <= 0) throw new RangeError("Contact shadow receiverDistance must be positive.");
  const softness = clamp(options.softness ?? 0.45, 0, 1);
  const opacity = clamp(options.opacity ?? 0.55, 0, 1);
  const distanceFalloff = Math.max(0, 1 - options.receiverDistance / Math.max(options.casterRadius * 4, 0.001));
  return {
    radius: Number((options.casterRadius * (1 + softness)).toFixed(4)),
    opacity,
    softness,
    receiverDistance: options.receiverDistance,
    anchorStrength: Number((opacity * distanceFalloff).toFixed(4)),
    diagnostic: "Contact shadow approximation for grounding product/interior assets; flagship screenshots must prove it visually."
  };
}

export function createExternalParityContactShadowPlan(options: ExternalParityContactShadowPlanOptions): ExternalParityContactShadowPlan {
  const shadow = createExternalParityContactShadow(options);
  const layerCount = integerInRange(options.layerCount ?? 3, 1, 6, "Contact shadow layerCount");
  const anisotropy = positive(options.anisotropy ?? 1.28, "Contact shadow anisotropy");
  const yOffset = finite(options.yOffset ?? 0.002, "Contact shadow yOffset");
  const layers = Array.from({ length: layerCount }, (_, index): ExternalParityContactShadowLayer => {
    const t = layerCount === 1 ? 0 : index / (layerCount - 1);
    const radius = Number((shadow.radius * (1 + t * (0.38 + shadow.softness * 0.26))).toFixed(4));
    return {
      index,
      radius,
      scale: [
        Number((radius * anisotropy).toFixed(4)),
        Number((radius / Math.max(0.001, anisotropy)).toFixed(4))
      ],
      opacity: Number((shadow.opacity * (1 - t * 0.72)).toFixed(4)),
      softness: shadow.softness,
      yOffset: Number((yOffset + index * 0.0007).toFixed(5))
    };
  });
  return {
    shadow,
    layers,
    fallback: "layered-receiver-geometry",
    unsupportedRendererFeatures: [
      "screen-space-contact-shadow",
      "blurred-depth-contact-shadow-map",
      "true-area-light-penumbra"
    ],
    claimBoundary: "Layered receiver geometry provides reusable visual grounding only; it is not a renderer contact-shadow pass, soft-shadow map, or physical area-light penumbra claim."
  };
}

function integerInRange(value: number, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${label} must be an integer in [${min}, ${max}].`);
  return value;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive.`);
  return value;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// B2 game-ready contact system (muse3jsparity-PRD).
//
// Stays a bounded receiver-contact approximation: capsule/plane analytic
// occluders + bent-normal approximation + depth-aware radius, with
// per-object frame-stable telemetry. Never "SSR" or "ray-traced".
// ---------------------------------------------------------------------------

export type ContactOccluderKind = "capsule" | "plane";

export interface ContactOccluder {
  readonly id: string;
  readonly kind: ContactOccluderKind;
  /** Capsule segment endpoints (world) for "capsule"; ignored for "plane". */
  readonly segmentA?: readonly [number, number, number];
  readonly segmentB?: readonly [number, number, number];
  /** Capsule radius in world units. */
  readonly radius?: number;
  /** Plane normal (world, normalized by the resolver) for "plane". */
  readonly planeNormal?: readonly [number, number, number];
  /** Plane offset along the normal for "plane". */
  readonly planeOffset?: number;
}

export interface ContactReceiverSample {
  readonly objectId: string;
  readonly receiverPosition: readonly [number, number, number];
  readonly receiverNormal: readonly [number, number, number];
}

export interface ContactDarkeningSample {
  readonly objectId: string;
  /** Mean occlusion in [0, 1]; 0 = untouched, 1 = fully grounded. */
  readonly contactDarkening: number;
  /** Bent normal (world) approximating blocked-hemisphere leakage. */
  readonly bentNormal: readonly [number, number, number];
  /** Contact radius used for this receiver (depth-hardened). */
  readonly radius: number;
}

export interface ContactTelemetryFrame {
  readonly frame: number;
  readonly samples: readonly ContactDarkeningSample[];
  /** Max |darkening| delta vs the previous frame (frame-stability proof). */
  readonly maxFrameDelta: number;
}

/**
 * Depth-aware contact radius: the contact hardens (shrinks) as the
 * caster-to-receiver distance grows, so distant pairs fade instead of
 * smearing.
 */
export function resolveDepthAwareContactRadius(baseRadius: number, casterDistance: number, falloffDistance: number): number {
  if (!Number.isFinite(baseRadius) || baseRadius <= 0) throw new RangeError("Contact baseRadius must be finite and positive.");
  if (!Number.isFinite(casterDistance) || casterDistance < 0) throw new RangeError("Contact casterDistance must be finite and non-negative.");
  if (!Number.isFinite(falloffDistance) || falloffDistance <= 0) throw new RangeError("Contact falloffDistance must be finite and positive.");
  const t = clamp(casterDistance / falloffDistance, 0, 1);
  return Number((baseRadius * (1 - 0.65 * t)).toFixed(4));
}

function distancePointToSegment(
  point: readonly [number, number, number],
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): number {
  const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
  const lengthSquared = ab[0]! * ab[0]! + ab[1]! * ab[1]! + ab[2]! * ab[2]!;
  if (lengthSquared <= 1e-12) {
    return Math.hypot(point[0]! - a[0]!, point[1]! - a[1]!, point[2]! - a[2]!);
  }
  const t = clamp(
    ((point[0]! - a[0]!) * ab[0]! + (point[1]! - a[1]!) * ab[1]! + (point[2]! - a[2]!) * ab[2]!) / lengthSquared,
    0,
    1
  );
  return Math.hypot(point[0]! - (a[0]! + ab[0]! * t), point[1]! - (a[1]! + ab[1]! * t), point[2]! - (a[2]! + ab[2]! * t));
}

/**
 * Analytic contact darkening for one receiver against capsule/plane
 * occluders. Deterministic in its inputs: identical frames produce
 * identical telemetry (frame-stable by construction).
 */
export function resolveContactDarkening(
  receiver: ContactReceiverSample,
  occluders: readonly ContactOccluder[],
  options: { readonly baseRadius?: number; readonly falloffDistance?: number; readonly opacity?: number } = {}
): ContactDarkeningSample {
  if (!receiver.objectId.trim()) throw new Error("Contact receiver objectId is required.");
  const baseRadius = options.baseRadius ?? 0.5;
  const falloffDistance = options.falloffDistance ?? 2;
  const opacity = clamp(options.opacity ?? 0.55, 0, 1);
  let occlusion = 0;
  let bentX = 0;
  let bentY = 0;
  let bentZ = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const occluder of occluders) {
    if (occluder.kind === "capsule") {
      if (!occluder.segmentA || !occluder.segmentB) throw new Error(`Contact capsule occluder ${occluder.id} requires segmentA/segmentB.`);
      const radius = occluder.radius ?? 0.25;
      if (!Number.isFinite(radius) || radius <= 0) throw new RangeError(`Contact capsule occluder ${occluder.id} radius must be positive.`);
      const distance = distancePointToSegment(receiver.receiverPosition, occluder.segmentA, occluder.segmentB);
      nearestDistance = Math.min(nearestDistance, distance);
      const hardened = resolveDepthAwareContactRadius(baseRadius, distance, falloffDistance);
      const local = clamp(1 - Math.max(0, distance - radius) / Math.max(hardened, 1e-6), 0, 1);
      occlusion = Math.max(occlusion, local);
      const away = distance <= 1e-9
        ? [0, 1, 0]
        : [
            (receiver.receiverPosition[0]! - occluder.segmentA[0]!) / distance,
            (receiver.receiverPosition[1]! - occluder.segmentA[1]!) / distance,
            (receiver.receiverPosition[2]! - occluder.segmentA[2]!) / distance,
          ];
      bentX += away[0]! * local;
      bentY += away[1]! * local;
      bentZ += away[2]! * local;
    } else if (occluder.kind === "plane") {
      if (!occluder.planeNormal) throw new Error(`Contact plane occluder ${occluder.id} requires planeNormal.`);
      const normalLength = Math.hypot(occluder.planeNormal[0]!, occluder.planeNormal[1]!, occluder.planeNormal[2]!);
      if (!Number.isFinite(normalLength) || normalLength <= 0) throw new RangeError(`Contact plane occluder ${occluder.id} normal must be non-zero.`);
      const normal: readonly [number, number, number] = [
        occluder.planeNormal[0]! / normalLength,
        occluder.planeNormal[1]! / normalLength,
        occluder.planeNormal[2]! / normalLength,
      ];
      const offset = occluder.planeOffset ?? 0;
      const distance = Math.abs(
        receiver.receiverPosition[0]! * normal[0]! + receiver.receiverPosition[1]! * normal[1]! + receiver.receiverPosition[2]! * normal[2]! - offset
      );
      nearestDistance = Math.min(nearestDistance, distance);
      const hardened = resolveDepthAwareContactRadius(baseRadius, distance, falloffDistance);
      const local = clamp(1 - distance / Math.max(hardened, 1e-6), 0, 1);
      occlusion = Math.max(occlusion, local);
      bentX += normal[0]! * local;
      bentY += normal[1]! * local;
      bentZ += normal[2]! * local;
    } else {
      throw new Error(`Unsupported contact occluder kind: ${String((occluder as ContactOccluder).kind)}`);
    }
  }
  const normal = receiver.receiverNormal;
  const bentLength = Math.hypot(
    normal[0]! + bentX * 0.5,
    normal[1]! + bentY * 0.5,
    normal[2]! + bentZ * 0.5
  );
  const bentNormal: readonly [number, number, number] = bentLength <= 1e-9
    ? [normal[0]!, normal[1]!, normal[2]!]
    : [
        Number(((normal[0]! + bentX * 0.5) / bentLength).toFixed(6)),
        Number(((normal[1]! + bentY * 0.5) / bentLength).toFixed(6)),
        Number(((normal[2]! + bentZ * 0.5) / bentLength).toFixed(6)),
      ];
  const radius = occluders.length === 0 || !Number.isFinite(nearestDistance)
    ? baseRadius
    : resolveDepthAwareContactRadius(baseRadius, nearestDistance, falloffDistance);
  return {
    objectId: receiver.objectId,
    contactDarkening: Number((clamp(occlusion, 0, 1) * opacity).toFixed(4)),
    bentNormal,
    radius,
  };
}

/** Frame telemetry with max per-object delta vs the previous frame. */
export function createContactTelemetryFrame(
  frame: number,
  samples: readonly ContactDarkeningSample[],
  previous: ContactTelemetryFrame | null
): ContactTelemetryFrame {
  if (!Number.isInteger(frame) || frame < 0) throw new RangeError("Contact telemetry frame must be a non-negative integer.");
  let maxFrameDelta = 0;
  if (previous) {
    const prior = new Map(previous.samples.map((sample) => [sample.objectId, sample.contactDarkening]));
    for (const sample of samples) {
      const before = prior.get(sample.objectId);
      if (before !== undefined) maxFrameDelta = Math.max(maxFrameDelta, Math.abs(sample.contactDarkening - before));
    }
  }
  return { frame, samples, maxFrameDelta: Number(maxFrameDelta.toFixed(6)) };
}
