import {
  effects,
  geometry,
  groups,
  lights,
  looks,
  material,
  texture,
  type AuraColor,
  type AuraCreateAppOptions,
  type AuraCustomGeometrySpec,
  type AuraHdriId,
  type AuraLookId,
  type AuraLookOverrides,
  type AuraNodeBuilder,
  type AuraSceneNode,
  type AuraTextureRef
} from "@aura3d/engine";
import type { WorldId } from "../types.js";
import { srgbHexToLinearRgba } from "./procedural-rigs/rig-kit.js";

export type { WorldId };

export const WORLD_IDS: readonly WorldId[] = [
  "meadow",
  "music-garden",
  "peekaboo-barn",
  "station",
  "learning-cloud",
  "home-nook",
  "moonlit-nursery",
  "starlight-cloud"
];

export interface WorldSkyGradientSpec {
  readonly zenith: AuraColor;
  readonly horizon: AuraColor;
  readonly ground: AuraColor;
  readonly exponent?: number;
  readonly horizonGlow?: number;
  readonly sun?: {
    readonly elevationDeg: number;
    readonly azimuthDeg: number;
    readonly color?: AuraColor;
    readonly intensity?: number;
    readonly discSize?: number;
  };
}

export interface WorldHemisphereSpec {
  readonly skyColor: AuraColor;
  readonly groundColor: AuraColor;
  readonly intensity: number;
}

export interface WorldLook {
  readonly world: WorldId;
  /** Real Aura3D 5.5.1 look preset id. */
  readonly look: AuraLookId;
  readonly hdri: AuraHdriId;
  readonly overrides: AuraLookOverrides;
  /** Scene clear colour matched to the horizon / room plaster. */
  readonly background: string;
  readonly contactShadows: { readonly intensity: number; readonly length: number };
  readonly sky: WorldSkyGradientSpec | null;
  readonly hemisphere: WorldHemisphereSpec;
}

export type WorldLookSpec = WorldLook;

export interface WorldLookOptions {
  readonly reducedMotion?: boolean;
  readonly qualityTier?: "low" | "medium" | "high" | "ultra";
  readonly softwareRenderer?: boolean;
  readonly mobile?: boolean;
}

export type WorldLookNodeOptions = WorldLookOptions;

export interface MobileProbeWindow {
  readonly navigator?: {
    readonly userAgent?: string;
    readonly maxTouchPoints?: number;
  };
  readonly matchMedia?: (query: string) => { readonly matches: boolean } | null;
  readonly innerWidth?: number;
  readonly innerHeight?: number;
  readonly screen?: {
    readonly width?: number;
    readonly height?: number;
  };
}

/**
 * Deterministic handheld / mobile Safari & Android thermal profile detector.
 * Returns `false` in headless Node tests (`win` null/undefined) so desktop
 * art-direction audits remain deterministic.
 */
export function detectMobileThermalProfile(win?: MobileProbeWindow | null): boolean {
  if (!win) return false;
  const ua = win.navigator?.userAgent ?? "";
  const touchPoints = win.navigator?.maxTouchPoints ?? 0;
  if (/iPhone|iPod|Android/i.test(ua)) return true;
  if (/iPad|Macintosh/i.test(ua) && touchPoints > 1) return true;
  const coarsePointer = win.matchMedia?.("(pointer: coarse)")?.matches === true;
  if (coarsePointer && touchPoints > 0) {
    const sw = win.screen?.width || win.innerWidth || 9999;
    const sh = win.screen?.height || win.innerHeight || 9999;
    if (Math.min(sw, sh) <= 1024) return true;
  }
  return false;
}

const STORYBOOK_PCSS_SHADOW = {
  mapSize: 2048,
  cascades: 2,
  maxDistance: 26,
  filter: "pcss",
  softness: 0.55,
  bias: 0.0015,
  normalBias: 0.02
} as const;

/**
 * Handheld thermal shadow tier: tightening `maxDistance` from 26m to 14m around
 * the 3.65m play stage keeps identical ~73 texels/m shadow sharpness with 1 cascade
 * at 1024x1024 (8x fewer shadow texels and 4x fewer PCF filter taps per fragment).
 */
export const MOBILE_STORYBOOK_SHADOW = {
  mapSize: 1024,
  cascades: 1,
  maxDistance: 14,
  filter: "pcf",
  softness: 0.42,
  bias: 0.0016,
  normalBias: 0.02
} as const;

const SOFTWARE_GL_SHADOW = {
  mapSize: 512,
  cascades: 1,
  maxDistance: 24,
  filter: "pcf",
  bias: 0.002,
  normalBias: 0.02
} as const;

const BEDTIME_BLOOM = {
  intensity: 0.06,
  threshold: 1.85,
  knee: 0.3,
  clampLuminance: 2.8
} as const;

/**
 * `"product-studio"` post preset keeps ONLY ambient-occlusion — stripping
 * `"cinematic-film"`'s implicit depth-of-field, chromatic-aberration, film-grain,
 * and vignette so every character at every stage depth renders tack-sharp.
 */
const STORYBOOK_POST = "product-studio" as const;

/**
 * Eight storybook diorama looks: six crisp, neutral morning/daylight sets with
 * zero indoor haze and clean sky-blue daylight separation, plus two cozy warm
 * bedtime worlds (`moonlit-nursery`, `starlight-cloud`) where gentle amber warmth
 * is intentionally scoped to sleep/wind-down episodes.
 *
 * `effects.vignette` is omitted across every world.
 */
export const WORLD_LOOKS: Readonly<Record<WorldId, WorldLook>> = {
  meadow: {
    world: "meadow",
    look: "outdoor-day",
    hdri: "autumn_field_puresky",
    background: "#BCE2FA",
    overrides: {
      hdri: "autumn_field_puresky",
      sun: { azimuthDeg: 40, elevationDeg: 50 },
      exposureEv: -0.08,
      environmentIntensity: 0.88,
      environmentRotationDeg: 28,
      background: "#BCE2FA",
      key: {
        color: "#FFFCF5",
        intensity: 1.84,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#E6F3FF",
        intensity: 0.42,
        azimuthDeg: 218
      },
      fog: {
        color: "#E4F3FC",
        near: 78,
        far: 260
      },
      grade: {
        contrast: 1.09,
        saturation: 1.18,
        temperature: 0
      },
      post: STORYBOOK_POST
    },
    contactShadows: { intensity: 0.56, length: 0.22 },
    sky: {
      zenith: "#54ACF4",
      horizon: "#DCEFFF",
      ground: "#84C470",
      exponent: 0.72,
      horizonGlow: 0.08
    },
    hemisphere: {
      skyColor: "#D0EBFF",
      groundColor: "#8CC472",
      intensity: 0.5
    }
  },
  "music-garden": {
    world: "music-garden",
    look: "outdoor-day",
    hdri: "autumn_field_puresky",
    background: "#B8E4FA",
    overrides: {
      hdri: "autumn_field_puresky",
      sun: { azimuthDeg: 52, elevationDeg: 50 },
      exposureEv: -0.08,
      environmentIntensity: 0.88,
      environmentRotationDeg: 40,
      background: "#B8E4FA",
      key: {
        color: "#FFFCF6",
        intensity: 1.82,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#E4F4FF",
        intensity: 0.42,
        azimuthDeg: 232
      },
      fog: {
        color: "#E0F4FC",
        near: 78,
        far: 260
      },
      grade: {
        contrast: 1.1,
        saturation: 1.24,
        temperature: 0
      },
      post: STORYBOOK_POST
    },
    contactShadows: { intensity: 0.54, length: 0.22 },
    sky: {
      zenith: "#4CAEEB",
      horizon: "#DCF5F7",
      ground: "#78C29A",
      exponent: 0.75,
      horizonGlow: 0.06
    },
    hemisphere: {
      skyColor: "#CEEEFF",
      groundColor: "#8AD0AF",
      intensity: 0.5
    }
  },
  "peekaboo-barn": {
    world: "peekaboo-barn",
    look: "outdoor-day",
    hdri: "autumn_field_puresky",
    background: "#C2E4FA",
    overrides: {
      hdri: "autumn_field_puresky",
      sun: { azimuthDeg: -36, elevationDeg: 48 },
      exposureEv: -0.08,
      environmentIntensity: 0.88,
      environmentRotationDeg: 322,
      background: "#C2E4FA",
      key: {
        color: "#FFFDF6",
        intensity: 1.84,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#E6F2FF",
        intensity: 0.42,
        azimuthDeg: 142
      },
      fog: {
        color: "#E4F2FC",
        near: 78,
        far: 260
      },
      grade: {
        contrast: 1.09,
        saturation: 1.18,
        temperature: 0
      },
      post: STORYBOOK_POST
    },
    contactShadows: { intensity: 0.58, length: 0.22 },
    sky: {
      zenith: "#58ACF2",
      horizon: "#E0F1FF",
      ground: "#98C06A",
      exponent: 0.72,
      horizonGlow: 0.08
    },
    hemisphere: {
      skyColor: "#D0EAFF",
      groundColor: "#A6BE72",
      intensity: 0.5
    }
  },
  station: {
    world: "station",
    look: "outdoor-day",
    hdri: "autumn_field_puresky",
    background: "#BCDFFA",
    overrides: {
      hdri: "autumn_field_puresky",
      sun: { azimuthDeg: 28, elevationDeg: 48 },
      exposureEv: -0.08,
      environmentIntensity: 0.88,
      environmentRotationDeg: 18,
      background: "#BCDFFA",
      key: {
        color: "#FFFCF5",
        intensity: 1.82,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#E6F2FF",
        intensity: 0.42,
        azimuthDeg: 208
      },
      fog: {
        color: "#E2F1FC",
        near: 78,
        far: 260
      },
      grade: {
        contrast: 1.09,
        saturation: 1.18,
        temperature: 0
      },
      post: STORYBOOK_POST
    },
    contactShadows: { intensity: 0.58, length: 0.22 },
    sky: {
      zenith: "#4FA3EC",
      horizon: "#DEF0FC",
      ground: "#86AE78",
      exponent: 0.75,
      horizonGlow: 0.07
    },
    hemisphere: {
      skyColor: "#CEE9FF",
      groundColor: "#96B684",
      intensity: 0.5
    }
  },
  "learning-cloud": {
    world: "learning-cloud",
    look: "outdoor-day",
    hdri: "kloppenheim_02",
    background: "#9EC2FA",
    overrides: {
      hdri: "kloppenheim_02",
      sun: { azimuthDeg: 18, elevationDeg: 52 },
      exposureEv: -0.06,
      environmentIntensity: 0.86,
      environmentRotationDeg: 12,
      background: "#9EC2FA",
      key: {
        color: "#FFFAFE",
        intensity: 1.76,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#EAF2FF",
        intensity: 0.44,
        azimuthDeg: 198
      },
      fog: {
        color: "#C4DCFE",
        near: 78,
        far: 260
      },
      grade: {
        contrast: 1.1,
        saturation: 1.32,
        temperature: 0
      },
      post: STORYBOOK_POST
    },
    contactShadows: { intensity: 0.54, length: 0.22 },
    sky: {
      zenith: "#528EF7",
      horizon: "#DFEBFF",
      ground: "#90B2FA",
      exponent: 0.72,
      horizonGlow: 0.08
    },
    hemisphere: {
      skyColor: "#C2DBFF",
      groundColor: "#E8C6EC",
      intensity: 0.52
    }
  },
  "home-nook": {
    world: "home-nook",
    look: "interior-neutral",
    hdri: "studio_small_08",
    background: "#F7F3EC",
    overrides: {
      hdri: "studio_small_08",
      sun: { azimuthDeg: -28, elevationDeg: 46 },
      exposureEv: -0.04,
      environmentIntensity: 0.9,
      environmentRotationDeg: 14,
      background: "#F7F3EC",
      key: {
        color: "#FFFDF9",
        intensity: 1.76,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#EEF6FF",
        intensity: 0.42,
        azimuthDeg: 152
      },
      fogDensityScale: 0,
      grade: {
        contrast: 1.08,
        saturation: 1.15,
        temperature: 0
      },
      post: STORYBOOK_POST
    },
    contactShadows: { intensity: 0.56, length: 0.22 },
    sky: null,
    hemisphere: {
      skyColor: "#F7FAFF",
      groundColor: "#EAE2D8",
      intensity: 0.54
    }
  },
  "moonlit-nursery": {
    world: "moonlit-nursery",
    look: "interior-warm",
    hdri: "warm_bar",
    background: "#261D30",
    overrides: {
      hdri: "warm_bar",
      sun: { azimuthDeg: -28, elevationDeg: 24 },
      exposureEv: -0.62,
      environmentIntensity: 0.6,
      environmentRotationDeg: 22,
      background: "#261D30",
      key: {
        color: "#FFD89E",
        intensity: 1.34,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#F5C794",
        intensity: 0.4,
        azimuthDeg: 154
      },
      fogDensityScale: 0,
      grade: {
        contrast: 1.06,
        saturation: 1.08,
        temperature: 0.1
      },
      post: STORYBOOK_POST
    },
    contactShadows: { intensity: 0.58, length: 0.22 },
    sky: null,
    hemisphere: {
      skyColor: "#F5CFA8",
      groundColor: "#5A3D4C",
      intensity: 0.4
    }
  },
  "starlight-cloud": {
    world: "starlight-cloud",
    look: "golden-hour",
    hdri: "kloppenheim_02",
    background: "#241B38",
    overrides: {
      hdri: "kloppenheim_02",
      sun: { azimuthDeg: -24, elevationDeg: 18 },
      exposureEv: -0.58,
      environmentIntensity: 0.62,
      environmentRotationDeg: 315,
      background: "#241B38",
      key: {
        color: "#FFE0A8",
        intensity: 1.38,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#F6C89F",
        intensity: 0.44,
        azimuthDeg: 162
      },
      fog: {
        color: "#2B2042",
        near: 78,
        far: 260
      },
      grade: {
        contrast: 1.06,
        saturation: 1.12,
        temperature: 0.08
      },
      post: STORYBOOK_POST
    },
    contactShadows: { intensity: 0.56, length: 0.22 },
    sky: {
      zenith: "#1D1633",
      horizon: "#48355E",
      ground: "#2A1F40",
      exponent: 0.74,
      horizonGlow: 0.08
    },
    hemisphere: {
      skyColor: "#E8C8AE",
      groundColor: "#563D64",
      intensity: 0.42
    }
  }
};

export function worldLook(world: WorldId): WorldLook {
  return WORLD_LOOKS[world];
}

export function lookAppOptions(
  world: WorldId = "meadow",
  options: { readonly mobile?: boolean; readonly softwareRenderer?: boolean } = {}
): Pick<AuraCreateAppOptions, "pixelRatio" | "renderer"> {
  if (options.softwareRenderer === true) {
    const dpr =
      typeof globalThis.devicePixelRatio === "number" && globalThis.devicePixelRatio > 0
        ? globalThis.devicePixelRatio
        : 1;
    return {
      renderer: { qualityProfile: "production" },
      pixelRatio: Math.min(dpr, 1)
    };
  }
  if (options.mobile === true) {
    const dpr =
      typeof globalThis.devicePixelRatio === "number" && globalThis.devicePixelRatio > 0
        ? globalThis.devicePixelRatio
        : 1;
    return {
      renderer: { qualityProfile: "production" },
      pixelRatio: Math.min(dpr, 1.5)
    };
  }
  return looks.appOptions(WORLD_LOOKS[world].look);
}

let sharedSkyDomeSpec: AuraCustomGeometrySpec | null = null;
const SKY_TEXTURE_CACHE = new Map<string, AuraTextureRef>();

function parseHexColor(color: AuraColor): string {
  return typeof color === "string" ? color : "#FFFFFF";
}

function linearToSrgbByte(linear: number): number {
  const clamped = linear <= 0 ? 0 : linear >= 1 ? 1 : linear;
  const srgb =
    clamped <= 0.0031308
      ? clamped * 12.92
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, srgb)) * 255);
}

function sampleSkyLinearRgb(skySpec: WorldSkyGradientSpec, u: number, v: number): readonly [number, number, number] {
  const phiMin = -0.22 * Math.PI;
  const phiMax = 0.5 * Math.PI;
  const phi = phiMin + (phiMax - phiMin) * v;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const theta = u * Math.PI * 2;
  const dx = cosPhi * Math.sin(theta);
  const dy = sinPhi;
  const dz = cosPhi * Math.cos(theta);

  const zenith = srgbHexToLinearRgba(parseHexColor(skySpec.zenith));
  const horizon = srgbHexToLinearRgba(parseHexColor(skySpec.horizon));
  const ground = srgbHexToLinearRgba(parseHexColor(skySpec.ground));
  const sunColor = srgbHexToLinearRgba(parseHexColor(skySpec.sun?.color ?? "#FFF9EC"));
  const exponent = skySpec.exponent ?? 0.72;
  const horizonGlow = skySpec.horizonGlow ?? 0.08;
  const sunElevRad = ((skySpec.sun?.elevationDeg ?? 48) * Math.PI) / 180;
  const sunAzimRad = ((skySpec.sun?.azimuthDeg ?? 38) * Math.PI) / 180;
  const sunX = Math.cos(sunElevRad) * Math.sin(sunAzimRad);
  const sunY = Math.sin(sunElevRad);
  const sunZ = -Math.cos(sunElevRad) * Math.cos(sunAzimRad);
  const sunStrength = skySpec.sun ? (skySpec.sun.intensity ?? 0.18) : 0;

  let cr: number;
  let cg: number;
  let cb: number;
  if (dy >= 0) {
    const t = Math.pow(Math.min(1, dy), exponent);
    cr = horizon[0] + (zenith[0] - horizon[0]) * t;
    cg = horizon[1] + (zenith[1] - horizon[1]) * t;
    cb = horizon[2] + (zenith[2] - horizon[2]) * t;
    const glow = Math.pow(1 - Math.min(1, dy), 3.6) * horizonGlow;
    cr += sunColor[0] * glow * 0.22;
    cg += sunColor[1] * glow * 0.22;
    cb += sunColor[2] * glow * 0.22;
  } else {
    const t = Math.min(1, Math.pow(-dy / 0.65, 0.78));
    cr = horizon[0] + (ground[0] - horizon[0]) * t;
    cg = horizon[1] + (ground[1] - horizon[1]) * t;
    cb = horizon[2] + (ground[2] - horizon[2]) * t;
  }

  if (sunStrength > 0 && dy > -0.05) {
    const cosAng = Math.max(0, dx * sunX + dy * sunY + dz * sunZ);
    const corona = Math.pow(cosAng, 24) * sunStrength * 0.35 + Math.pow(cosAng, 260) * sunStrength * 0.65;
    const blend = Math.min(0.65, corona);
    cr = cr + (sunColor[0] - cr) * blend;
    cg = cg + (sunColor[1] - cg) * blend;
    cb = cb + (sunColor[2] - cb) * blend;
  }

  return [Math.min(1, cr), Math.min(1, cg), Math.min(1, cb)];
}

function getSharedSkyDomeGeometry(): AuraCustomGeometrySpec {
  if (sharedSkyDomeSpec) return sharedSkyDomeSpec;
  const radius = 68;
  const rings = 16;
  const segs = 32;
  const phiMin = -0.22 * Math.PI;
  const phiMax = 0.5 * Math.PI;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rings; r += 1) {
    const v = r / rings;
    const phi = phiMin + (phiMax - phiMin) * v;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    for (let s = 0; s <= segs; s += 1) {
      const u = s / segs;
      const theta = u * Math.PI * 2;
      const dx = cosPhi * Math.sin(theta);
      const dy = sinPhi;
      const dz = cosPhi * Math.cos(theta);

      positions.push(dx * radius, dy * radius, dz * radius);
      normals.push(-dx, -dy, -dz);
      uvs.push(u, v);
      colors.push(1, 1, 1, 1);
    }
  }

  const stride = segs + 1;
  for (let r = 0; r < rings; r += 1) {
    const rowA = r * stride;
    const rowB = rowA + stride;
    for (let s = 0; s < segs; s += 1) {
      const a = rowA + s;
      const b = a + 1;
      const c = rowB + s;
      const d = c + 1;
      // Inward-facing winding so the camera inside the 68 m dome sees the sky gradient.
      indices.push(a, c, b, b, c, d);
    }
  }

  sharedSkyDomeSpec = {
    kind: "aura-custom-geometry",
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    colors: Float32Array.from(colors),
    indices: Uint16Array.from(indices),
    bounds: {
      min: [-radius, Math.sin(phiMin) * radius, -radius],
      max: [radius, radius, radius]
    }
  };
  return sharedSkyDomeSpec;
}

function getSkyGradientTexture(
  world: WorldId,
  skySpec: WorldSkyGradientSpec,
  exposureEv: number
): AuraTextureRef {
  const cacheKey = `${world}:${exposureEv.toFixed(3)}`;
  const cached = SKY_TEXTURE_CACHE.get(cacheKey);
  if (cached) return cached;

  const width = 64;
  const height = 32;
  const exposureCompensation = Math.pow(2, -exposureEv);
  const data = new Uint8Array(width * height * 4);
  let ptr = 0;
  for (let iy = 0; iy < height; iy += 1) {
    const v = (iy + 0.5) / height;
    for (let ix = 0; ix < width; ix += 1) {
      const u = (ix + 0.5) / width;
      const rgb = sampleSkyLinearRgb(skySpec, u, v);
      data[ptr] = linearToSrgbByte(rgb[0] * exposureCompensation);
      data[ptr + 1] = linearToSrgbByte(rgb[1] * exposureCompensation);
      data[ptr + 2] = linearToSrgbByte(rgb[2] * exposureCompensation);
      data[ptr + 3] = 255;
      ptr += 4;
    }
  }

  const ref = texture.data({
    width,
    height,
    data,
    format: "rgba8",
    colorSpace: "srgb"
  });
  ref.wrapS = "repeat";
  ref.wrapT = "clamp";
  ref.generateMipmaps = false;
  ref.minFilter = "linear";
  ref.magFilter = "linear";
  ref.needsUpdate = true;
  SKY_TEXTURE_CACHE.set(cacheKey, ref);
  return ref;
}

function buildStorybookSkyDomeNode(
  world: WorldId,
  skySpec: WorldSkyGradientSpec,
  exposureEv: number
): AuraNodeBuilder<AuraSceneNode> {
  const domeSpec = getSharedSkyDomeGeometry();
  const skyTex = getSkyGradientTexture(world, skySpec, exposureEv);

  return geometry.custom(domeSpec, {
    name: `${world} sky dome`,
    material: material.standard({
      color: "#FFFFFF",
      unlit: true,
      fog: false,
      texture: skyTex
    }),
    castShadow: false,
    receiveShadow: false
  });
}

function shouldKeepLookChild(child: AuraSceneNode, stripOutputPreset: boolean): boolean {
  if (child.kind === "effect" && (child.effect === "bloom" || child.effect === "ambient-occlusion")) {
    return false;
  }
  if (stripOutputPreset && child.kind === "group" && child.name === "look output preset") {
    return false;
  }
  return true;
}

/**
 * Scene nodes emitted for a world's look:
 * - Desktop (`!mobile && !softwareRenderer`): HDRI IBL, 2048 PCSS key shadow, neutral sky rim,
 *   far-only linear fog (zero indoor fog), unbleached sky dome, hemisphere bounce, single clean
 *   AO node (zero duplicate AO/bloom stages), contact shadows, and bedtime-only soft bloom.
 * - Mobile (`mobile === true`): HDRI IBL, 1024 single-cascade PCF shadow (`maxDistance: 14m`),
 *   unbleached sky dome, hemisphere bounce, and single-pass Neutral tonemap/grade — skipping
 *   6-pass float GTAO, 4th-geometry-pass contact shadows, and multi-mip bloom.
 */
export function worldLookNodes(
  world: WorldId,
  options: WorldLookNodeOptions = {}
): readonly AuraNodeBuilder<AuraSceneNode>[] {
  const spec = WORLD_LOOKS[world];
  const isMobile = options.mobile === true;
  const isSoftware = options.softwareRenderer === true;
  const skipHeavyPost = isMobile || isSoftware;
  const shadowSpec = isSoftware
    ? SOFTWARE_GL_SHADOW
    : isMobile
      ? MOBILE_STORYBOOK_SHADOW
      : STORYBOOK_PCSS_SHADOW;

  const overrides: AuraLookOverrides = spec.overrides.key
    ? {
        ...spec.overrides,
        key: { ...spec.overrides.key, shadow: shadowSpec }
      }
    : spec.overrides;

  const rawLookGroup = looks.preset(spec.look, overrides).toJSON();
  const filteredChildren = rawLookGroup.children.filter((child) =>
    shouldKeepLookChild(child, skipHeavyPost)
  );
  const lookGroup = groups.create(
    rawLookGroup.name ?? `aura-look:${spec.look}`,
    filteredChildren
  );

  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [
    lookGroup,
    lights.hemisphere({
      name: `${world} bounce fill`,
      skyColor: spec.hemisphere.skyColor,
      groundColor: spec.hemisphere.groundColor,
      intensity: spec.hemisphere.intensity
    })
  ];

  if (!isSoftware && spec.sky !== null) {
    nodes.push(buildStorybookSkyDomeNode(world, spec.sky, spec.overrides.exposureEv ?? 0));
  }

  if (!skipHeavyPost) {
    nodes.push(
      effects.ambientOcclusion({
        name: `${world} clay ambient occlusion`,
        radius: 0.36,
        intensity: 0.48,
        falloff: 0.45,
        multiBounce: false
      }),
      effects.contactShadows({
        length: spec.contactShadows.length,
        thickness: 0.05,
        steps: options.qualityTier === "medium" || options.qualityTier === "low" ? 8 : 12,
        intensity: spec.contactShadows.intensity,
        lights: "sun"
      })
    );
    if (world === "moonlit-nursery" || world === "starlight-cloud") {
      nodes.push(
        effects.bloom({
          name: `${world} bedtime bloom`,
          ...BEDTIME_BLOOM
        })
      );
    }
  }

  return nodes;
}

/** The HDRI file (`<name>.hdr`, served from `/hdri/`) a world's look loads, or null for a look without one. */
export function lookHdriFile(world: WorldId): string | null {
  const spec = WORLD_LOOKS[world];
  if (typeof spec.overrides.hdri === "string") {
    return `${spec.overrides.hdri}_1k.hdr`;
  }
  const hdri = looks.describe(spec.look).v0.hdri;
  return hdri === null ? null : `${hdri}.hdr`;
}

/** True when the world's look brings image-based light (an HDRI or a procedural environment fill). */
export function lookHasEnvironment(world: WorldId): boolean {
  const spec = WORLD_LOOKS[world];
  if (spec.overrides.hdri !== undefined) return true;
  const v0 = looks.describe(spec.look).v0;
  return v0.hdri !== null || v0.fill !== undefined;
}

/** Every HDRI file the worlds load; the app serves them at `/hdri/<file>`. */
export const LOOK_HDRI_FILES: readonly string[] = [
  ...new Set(WORLD_IDS.map(lookHdriFile).filter((file): file is string => file !== null))
].sort();
