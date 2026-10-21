import type { AuraQualityTier } from "./contracts/quality";
import { resolveSamplerAnisotropy as resolveTierSamplerAnisotropy, type AuraTextureSampling, type AuraTextureWrap } from "./contracts/sampling";

export type TextureMagFilter = "nearest" | "linear";
export type TextureMinFilter =
  | TextureMagFilter
  | "nearest-mipmap-nearest"
  | "linear-mipmap-nearest"
  | "nearest-mipmap-linear"
  | "linear-mipmap-linear";
export type TextureFilter = TextureMinFilter;
export type TextureAddressMode = "clamp-to-edge" | "repeat" | "mirror-repeat";

export interface SamplerDescriptor {
  readonly minFilter?: TextureMinFilter;
  readonly magFilter?: TextureMagFilter;
  readonly addressU?: TextureAddressMode;
  readonly addressV?: TextureAddressMode;
  readonly maxAnisotropy?: number;
  /** C-12 (PR 0a): depth-compare sampler mode (PRD 02 shadow compare samplers). */
  readonly compare?: "less-equal" | "greater-equal";
  /** C-12 (PR 0a): third axis address mode. */
  readonly addressW?: TextureAddressMode;
  /** C-12 (PR 0a): mirror-once address mode for U/V/W when the backend supports it. */
  readonly mirror?: boolean;
}

export class Sampler {
  public readonly minFilter: TextureMinFilter;
  public readonly magFilter: TextureMagFilter;
  public readonly addressU: TextureAddressMode;
  public readonly addressV: TextureAddressMode;
  public readonly maxAnisotropy: number;

  public readonly compare: "less-equal" | "greater-equal" | undefined;
  public readonly addressW: TextureAddressMode | undefined;
  public readonly mirror: boolean;

  constructor(descriptor: SamplerDescriptor = {}) {
    this.minFilter = descriptor.minFilter ?? "linear";
    this.magFilter = descriptor.magFilter ?? "linear";
    this.addressU = descriptor.addressU ?? "clamp-to-edge";
    this.addressV = descriptor.addressV ?? "clamp-to-edge";
    this.compare = descriptor.compare;
    this.addressW = descriptor.addressW;
    this.mirror = descriptor.mirror ?? false;
    const maxAnisotropy = descriptor.maxAnisotropy ?? 1;
    if (!Number.isFinite(maxAnisotropy) || maxAnisotropy < 1) {
      throw new RangeError("Sampler maxAnisotropy must be finite and at least 1");
    }
    this.maxAnisotropy = maxAnisotropy;
  }

  /**
   * PRD-04 P2-6: trilinear (mipmapped-linear) material sampler. `wrap` takes a single address
   * mode or a `[u, v]` pair; the public `AuraTextureWrap` aliases map — `"clamp"` →
   * `"clamp-to-edge"`, `"mirror"` → `"mirror-repeat"`.
   */
  static trilinear(options: {
    readonly wrap?: TextureAddressMode | "clamp" | "mirror" | readonly [TextureAddressMode | "clamp" | "mirror", TextureAddressMode | "clamp" | "mirror"];
    readonly anisotropy?: number;
  } = {}): Sampler {
    const mapWrap = (mode: TextureAddressMode | "clamp" | "mirror"): TextureAddressMode =>
      mode === "mirror" ? "mirror-repeat" : mode === "clamp" ? "clamp-to-edge" : mode;
    const [wrapU, wrapV] = Array.isArray(options.wrap) ? options.wrap : [options.wrap ?? "repeat", options.wrap ?? "repeat"];
    return new Sampler({
      minFilter: "linear-mipmap-linear",
      magFilter: "linear",
      addressU: mapWrap(wrapU),
      addressV: mapWrap(wrapV),
      maxAnisotropy: options.anisotropy ?? 1
    });
  }

  /** PRD-04 P2-6: a glTF sampler descriptor (`magFilter`/`minFilter`/`wrapS`/`wrapT` enums). */
  static fromGLTF(
    info: { readonly magFilter?: number; readonly minFilter?: number; readonly wrapS?: number; readonly wrapT?: number } | undefined,
    anisotropy: number = 1
  ): Sampler {
    const magFilter = info?.magFilter === 9728 ? "nearest" : "linear";
    const minFilter = GLTF_MIN_FILTERS[info?.minFilter ?? 0] ?? "linear-mipmap-linear";
    return new Sampler({
      minFilter,
      magFilter,
      addressU: GLTF_WRAP_MODES[info?.wrapS ?? 0] ?? "repeat",
      addressV: GLTF_WRAP_MODES[info?.wrapT ?? 0] ?? "repeat",
      maxAnisotropy: anisotropy
    });
  }

  /**
   * threejs-parity ST-02/ST-04 (L4): build a sampler from an
   * `AuraTextureSampling` descriptor — the shape `texture.*` handles and
   * `material.sampling`/`slotSampling` carry. Per-axis `wrapS`/`wrapT` win
   * over the shared `wrap`; `minFilter`/`magFilter` (three names or numeric
   * enum) win over the legacy `filter` shorthand
   * ("trilinear"/"bilinear"/"nearest").
   */
  static fromSampling(
    sampling: AuraTextureSampling | undefined,
    options: { readonly anisotropy?: number; readonly defaultWrap?: TextureAddressMode } = {}
  ): Sampler {
    const fallbackWrap = options.defaultWrap ?? "clamp-to-edge";
    const legacyFilter = sampling?.filter;
    const legacyMin: TextureMinFilter = legacyFilter === "nearest"
      ? "nearest"
      : legacyFilter === "bilinear"
        ? "linear"
        : "linear-mipmap-linear";
    const legacyMag: TextureMagFilter = legacyFilter === "nearest" ? "nearest" : "linear";
    return new Sampler({
      minFilter: threeToMinFilter(sampling?.minFilter) ?? legacyMin,
      magFilter: threeToMagFilter(sampling?.magFilter) ?? legacyMag,
      addressU: auraWrapMode(sampling?.wrapS ?? sampling?.wrap) ?? fallbackWrap,
      addressV: auraWrapMode(sampling?.wrapT ?? sampling?.wrap) ?? fallbackWrap,
      maxAnisotropy: sampling?.anisotropy ?? options.anisotropy ?? 1
    });
  }

  /**
   * threejs-parity ST-02/ST-04 (L4): a three `Texture` sampler view —
   * `{ wrapS, wrapT, minFilter, magFilter, anisotropy }` where wrap/filter
   * fields accept three's numeric enums (RepeatWrapping 1000, ClampToEdgeWrapping
   * 1001, MirroredRepeatWrapping 1002, NearestFilter 1003 …
   * LinearMipmapLinearFilter 1008) or the matching Aura strings.
   */
  static fromThree(info: {
    readonly wrapS?: number | AuraTextureWrap;
    readonly wrapT?: number | AuraTextureWrap;
    readonly minFilter?: number | TextureMinFilter;
    readonly magFilter?: number | TextureMagFilter;
    readonly anisotropy?: number;
  } | undefined): Sampler {
    return new Sampler({
      minFilter: threeToMinFilter(info?.minFilter) ?? "linear-mipmap-linear",
      magFilter: threeToMagFilter(info?.magFilter) ?? "linear",
      addressU: threeToWrapMode(info?.wrapS) ?? "repeat",
      addressV: threeToWrapMode(info?.wrapT) ?? "repeat",
      maxAnisotropy: info?.anisotropy ?? 1
    });
  }
}

// glTF sampler enums: CLAMP_TO_EDGE 33071, MIRRORED_REPEAT 33648, REPEAT 10497.
const GLTF_WRAP_MODES: Readonly<Record<number, TextureAddressMode>> = {
  33071: "clamp-to-edge",
  10497: "repeat",
  33648: "mirror-repeat"
};
const GLTF_MIN_FILTERS: Readonly<Record<number, TextureMinFilter>> = {
  9728: "nearest",
  9729: "linear",
  9984: "nearest-mipmap-nearest",
  9985: "linear-mipmap-nearest",
  9986: "nearest-mipmap-linear",
  9987: "linear-mipmap-linear"
};

// threejs-parity ST-04 (L4): three.js numeric enums (three/src/constants.js).
// RepeatWrapping 1000, ClampToEdgeWrapping 1001, MirroredRepeatWrapping 1002;
// NearestFilter 1003, NearestMipmapNearest 1004, NearestMipmapLinear 1005,
// LinearFilter 1006, LinearMipmapNearest 1007, LinearMipmapLinear 1008.
const THREE_WRAP_MODES: Readonly<Record<number, TextureAddressMode>> = {
  1000: "repeat",
  1001: "clamp-to-edge",
  1002: "mirror-repeat"
};
const THREE_MIN_FILTERS: Readonly<Record<number, TextureMinFilter>> = {
  1003: "nearest",
  1004: "nearest-mipmap-nearest",
  1005: "nearest-mipmap-linear",
  1006: "linear",
  1007: "linear-mipmap-nearest",
  1008: "linear-mipmap-linear"
};
const THREE_MAG_FILTERS: Readonly<Record<number, TextureMagFilter>> = {
  1003: "nearest",
  1006: "linear"
};

/** threejs-parity ST-04 (L4): Aura wrap name → device address mode. */
export function auraWrapMode(wrap: AuraTextureWrap | TextureAddressMode | undefined): TextureAddressMode | undefined {
  if (wrap === undefined) return undefined;
  if (wrap === "clamp" || wrap === "clamp-to-edge") return "clamp-to-edge";
  if (wrap === "mirror" || wrap === "mirror-repeat") return "mirror-repeat";
  return "repeat";
}

/** threejs-parity ST-04 (L4): three wrap enum or Aura name → device address mode. */
export function threeToWrapMode(wrap: number | AuraTextureWrap | TextureAddressMode | undefined): TextureAddressMode | undefined {
  if (wrap === undefined) return undefined;
  if (typeof wrap === "number") return THREE_WRAP_MODES[wrap];
  return auraWrapMode(wrap);
}

/** threejs-parity ST-04 (L4): three min-filter enum or name → `TextureMinFilter`. */
export function threeToMinFilter(filter: number | TextureMinFilter | undefined): TextureMinFilter | undefined {
  if (filter === undefined) return undefined;
  if (typeof filter === "number") return THREE_MIN_FILTERS[filter];
  return filter;
}

/** threejs-parity ST-04 (L4): three mag-filter enum or name → `TextureMagFilter`. */
export function threeToMagFilter(filter: number | TextureMagFilter | undefined): TextureMagFilter | undefined {
  if (filter === undefined) return undefined;
  if (typeof filter === "number") return THREE_MAG_FILTERS[filter];
  return filter;
}

/** Device-quantized sampler anisotropy steps (muse3jsparity-PRD C3). */
export const SAMPLER_ANISOTROPY_STEPS = [1, 2, 4, 8, 16] as const;

/**
 * C3 floor: root material builders request at least 8x where supported.
 * The renderer still clamps to the device maximum at upload time, so a
 * request above the device capability folds down instead of failing.
 */
export const DEFAULT_SAMPLER_ANISOTROPY = 8;

export interface SamplerAnisotropyRequest {
  /**
   * Desired anisotropy. Defaults to {@link DEFAULT_SAMPLER_ANISOTROPY} — or to the `tier`
   * default (C-12 R9: low 4 / medium 8 / high 16 / ultra 16) when `tier` is given (PRD-04 P2-6).
   */
  readonly desired?: number;
  /**
   * Capability-probe result: maximum anisotropy the device supports.
   * When absent the request passes through at the desired level and the
   * renderer clamps to the device maximum at upload time.
   */
  readonly maxSupported?: number;
  /** PRD-04 P2-6: quality tier supplying the default when `desired` is undefined (C-12 R9). */
  readonly tier?: AuraQualityTier;
  /** PRD-04 P2-6: C-12 contract alias of `maxSupported` — the device maximum. */
  readonly deviceMax?: number;
}

export interface SamplerAnisotropyResolution {
  readonly applied: number;
  readonly capped: boolean;
  readonly detail: string;
}

/**
 * C3 capability-gated anisotropy for root material builders. Snaps the
 * request down to a device-quantized step and, when the device capability
 * is known, caps it instead of failing.
 */
export function resolveSamplerAnisotropy(request: SamplerAnisotropyRequest = {}): SamplerAnisotropyResolution {
  const rawDesired = request.desired;
  const deviceCap = request.deviceMax ?? request.maxSupported;
  const desired = typeof rawDesired === "number" && Number.isFinite(rawDesired) && rawDesired >= 1
    ? rawDesired
    : request.tier !== undefined
      // P2-6: no explicit desire + tier -> C-12 R9 tier default (L4/M8/H16/U16), device-clamped.
      ? resolveTierSamplerAnisotropy({ tier: request.tier, deviceMax: Math.max(1, deviceCap ?? 16) })
      : DEFAULT_SAMPLER_ANISOTROPY;
  const snappedDesired = snapAnisotropyStep(desired);
  const rawMax = deviceCap;
  if (typeof rawMax !== "number" || !Number.isFinite(rawMax)) {
    return {
      applied: snappedDesired,
      capped: false,
      detail: `Anisotropy ${snappedDesired}x requested; device capability unknown — the renderer clamps to the device maximum at upload time.`
    };
  }
  const maxSupported = Math.max(1, rawMax);
  const allowed = Math.min(desired, maxSupported);
  const applied = snapAnisotropyStep(allowed);
  const capped = applied < desired;
  return {
    applied,
    capped,
    detail: capped
      ? `Anisotropy ${desired}x requested but device supports ${maxSupported}x — applied ${applied}x.`
      : `Anisotropy ${applied}x applied (requested ${desired}x, device ${maxSupported}x).`
  };
}

function snapAnisotropyStep(value: number): number {
  let applied: number = SAMPLER_ANISOTROPY_STEPS[0]!;
  for (const step of SAMPLER_ANISOTROPY_STEPS) {
    if (step <= value) applied = step;
  }
  return applied;
}
