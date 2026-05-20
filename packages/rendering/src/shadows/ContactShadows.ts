export interface V4ContactShadowOptions {
  readonly casterRadius: number;
  readonly receiverDistance: number;
  readonly softness?: number;
  readonly opacity?: number;
}

export interface V4ContactShadowLayer {
  readonly index: number;
  readonly radius: number;
  readonly scale: readonly [number, number];
  readonly opacity: number;
  readonly softness: number;
  readonly yOffset: number;
}

export interface V4ContactShadow {
  readonly radius: number;
  readonly opacity: number;
  readonly softness: number;
  readonly receiverDistance: number;
  readonly anchorStrength: number;
  readonly diagnostic: string;
}

export interface V4ContactShadowPlanOptions extends V4ContactShadowOptions {
  readonly layerCount?: number;
  readonly anisotropy?: number;
  readonly yOffset?: number;
}

export interface V4ContactShadowPlan {
  readonly shadow: V4ContactShadow;
  readonly layers: readonly V4ContactShadowLayer[];
  readonly fallback: "layered-receiver-geometry";
  readonly unsupportedRendererFeatures: readonly string[];
  readonly claimBoundary: string;
}

export function createV4ContactShadow(options: V4ContactShadowOptions): V4ContactShadow {
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

export function createV4ContactShadowPlan(options: V4ContactShadowPlanOptions): V4ContactShadowPlan {
  const shadow = createV4ContactShadow(options);
  const layerCount = integerInRange(options.layerCount ?? 3, 1, 6, "Contact shadow layerCount");
  const anisotropy = positive(options.anisotropy ?? 1.28, "Contact shadow anisotropy");
  const yOffset = finite(options.yOffset ?? 0.002, "Contact shadow yOffset");
  const layers = Array.from({ length: layerCount }, (_, index): V4ContactShadowLayer => {
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
