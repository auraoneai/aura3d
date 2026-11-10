import {
  effects,
  lights,
  looks,
  type AuraColor,
  type AuraHdriId,
  type AuraLookId,
  type AuraLookOverrides,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";
import type { WorldId } from "../types.js";

export type { WorldId };

export const WORLD_IDS: readonly WorldId[] = [
  "meadow",
  "music-garden",
  "peekaboo-barn",
  "station",
  "learning-cloud",
  "home-nook"
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
}

const STORYBOOK_PCSS_SHADOW = {
  mapSize: 2048,
  cascades: 2,
  maxDistance: 28,
  filter: "pcss",
  softness: 0.65,
  bias: 0.0015,
  normalBias: 0.02
} as const;

const STORYBOOK_BLOOM = {
  intensity: 0.28,
  threshold: 1.15,
  knee: 0.45,
  clampLuminance: 4.0
} as const;

const STORYBOOK_POST = {
  bloom: STORYBOOK_BLOOM,
  antiAlias: { mode: "fxaa" }
} as const;

/**
 * Six bespoke Blender-Cycles storybook looks — one distinct CC0 HDRI, PCSS key
 * shadow, warm rim backlight, sky dome, bounce hemisphere fill, height fog,
 * multi-bounce AO, and AgX grade per world.
 *
 * `effects.vignette` is never emitted in any world.
 */
export const WORLD_LOOKS: Readonly<Record<WorldId, WorldLook>> = {
  meadow: {
    world: "meadow",
    look: "golden-hour",
    hdri: "autumn_field_puresky",
    background: "#BCE1FA",
    overrides: {
      hdri: "autumn_field_puresky",
      sun: { azimuthDeg: 42, elevationDeg: 34 },
      exposureEv: -0.22,
      environmentIntensity: 0.88,
      environmentRotationDeg: 28,
      background: "#BCE1FA",
      key: {
        color: "#FFF1D6",
        intensity: 2.25,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#FFE3B3",
        intensity: 0.68,
        azimuthDeg: 218
      },
      fog: {
        color: "#DCEFFA",
        height: {
          mode: "height",
          density: 0.004,
          heightFalloff: 0.24,
          heightReference: 0
        }
      },
      grade: {
        contrast: 1.1,
        saturation: 1.26,
        temperature: 0.05
      },
      post: STORYBOOK_POST
    },
    contactShadows: { intensity: 0.68, length: 0.26 },
    sky: {
      zenith: "#5DAEF0",
      horizon: "#FFE8BE",
      ground: "#84C26E",
      exponent: 0.72,
      horizonGlow: 0.24,
      sun: {
        azimuthDeg: 42,
        elevationDeg: 34,
        color: "#FFF2CE",
        intensity: 0.45,
        discSize: 0.045
      }
    },
    hemisphere: {
      skyColor: "#BCE0FF",
      groundColor: "#8EC46E",
      intensity: 0.46
    }
  },
  "music-garden": {
    world: "music-garden",
    look: "outdoor-day",
    hdri: "outdoor-midday",
    background: "#BAE5FA",
    overrides: {
      hdri: "outdoor-midday",
      sun: { azimuthDeg: 54, elevationDeg: 46 },
      exposureEv: -0.22,
      environmentIntensity: 0.88,
      environmentRotationDeg: 40,
      background: "#BAE5FA",
      key: {
        color: "#FFF6E3",
        intensity: 2.2,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#FFE8C8",
        intensity: 0.62,
        azimuthDeg: 232
      },
      fog: {
        color: "#D8F2FA",
        height: {
          mode: "height",
          density: 0.004,
          heightFalloff: 0.25,
          heightReference: 0
        }
      },
      grade: {
        contrast: 1.12,
        saturation: 1.44,
        temperature: 0.04
      },
      post: STORYBOOK_POST
    },
    contactShadows: { intensity: 0.66, length: 0.26 },
    sky: {
      zenith: "#54B0EC",
      horizon: "#E4F7F2",
      ground: "#75BF98",
      exponent: 0.75,
      horizonGlow: 0.2,
      sun: {
        azimuthDeg: 54,
        elevationDeg: 46,
        color: "#FFF8DE",
        intensity: 0.38,
        discSize: 0.04
      }
    },
    hemisphere: {
      skyColor: "#C4EBFF",
      groundColor: "#8CD1B0",
      intensity: 0.48
    }
  },
  "peekaboo-barn": {
    world: "peekaboo-barn",
    look: "golden-hour",
    hdri: "spruit_sunrise",
    background: "#F5DCB8",
    overrides: {
      hdri: "spruit_sunrise",
      sun: { azimuthDeg: -38, elevationDeg: 28 },
      exposureEv: -0.26,
      environmentIntensity: 0.86,
      environmentRotationDeg: 322,
      background: "#F5DCB8",
      key: {
        color: "#FFE7C2",
        intensity: 2.18,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#FFD79E",
        intensity: 0.68,
        azimuthDeg: 142
      },
      fog: {
        color: "#F5DEC0",
        height: {
          mode: "height",
          density: 0.005,
          heightFalloff: 0.23,
          heightReference: 0
        }
      },
      grade: {
        contrast: 1.08,
        saturation: 1.22,
        temperature: 0.06
      },
      post: STORYBOOK_POST
    },
    contactShadows: { intensity: 0.7, length: 0.26 },
    sky: {
      zenith: "#68A8E4",
      horizon: "#FFDCAD",
      ground: "#A6B664",
      exponent: 0.68,
      horizonGlow: 0.26,
      sun: {
        azimuthDeg: -38,
        elevationDeg: 28,
        color: "#FFE9BE",
        intensity: 0.46,
        discSize: 0.05
      }
    },
    hemisphere: {
      skyColor: "#FFE8CA",
      groundColor: "#B7AE68",
      intensity: 0.48
    }
  },
  station: {
    world: "station",
    look: "outdoor-day",
    hdri: "kloppenheim_06_puresky",
    background: "#BCDFFA",
    overrides: {
      hdri: "kloppenheim_06_puresky",
      sun: { azimuthDeg: 28, elevationDeg: 42 },
      exposureEv: -0.22,
      environmentIntensity: 0.88,
      environmentRotationDeg: 18,
      background: "#BCDFFA",
      key: {
        color: "#FFF4DF",
        intensity: 2.2,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#FFE6BF",
        intensity: 0.64,
        azimuthDeg: 208
      },
      fog: {
        color: "#DAEBFB",
        height: {
          mode: "height",
          density: 0.004,
          heightFalloff: 0.24,
          heightReference: 0
        }
      },
      grade: {
        contrast: 1.1,
        saturation: 1.26,
        temperature: 0.02
      },
      post: STORYBOOK_POST
    },
    contactShadows: { intensity: 0.7, length: 0.26 },
    sky: {
      zenith: "#50A0E6",
      horizon: "#E2EFFC",
      ground: "#84AA75",
      exponent: 0.76,
      horizonGlow: 0.2,
      sun: {
        azimuthDeg: 28,
        elevationDeg: 42,
        color: "#FFF5DA",
        intensity: 0.38,
        discSize: 0.04
      }
    },
    hemisphere: {
      skyColor: "#C2E2FF",
      groundColor: "#98B584",
      intensity: 0.45
    }
  },
  "learning-cloud": {
    world: "learning-cloud",
    look: "outdoor-day",
    hdri: "kloppenheim_02",
    background: "#83A8F8",
    overrides: {
      hdri: "kloppenheim_02",
      sun: { azimuthDeg: 18, elevationDeg: 52 },
      exposureEv: -0.28,
      environmentIntensity: 0.82,
      environmentRotationDeg: 12,
      background: "#83A8F8",
      key: {
        color: "#FFEAF8",
        intensity: 1.72,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#FFC2E8",
        intensity: 0.68,
        azimuthDeg: 198
      },
      fog: {
        color: "#96B5FA",
        height: {
          mode: "height",
          density: 0.003,
          heightFalloff: 0.22,
          heightReference: -0.4
        }
      },
      grade: {
        contrast: 1.14,
        saturation: 1.56,
        temperature: 0.02,
        tint: 0.04
      },
      post: STORYBOOK_POST
    },
    contactShadows: { intensity: 0.64, length: 0.25 },
    sky: {
      zenith: "#356BE8",
      horizon: "#F290CA",
      ground: "#6F97F5",
      exponent: 0.72,
      horizonGlow: 0.22,
      sun: {
        azimuthDeg: 18,
        elevationDeg: 52,
        color: "#FFF2E4",
        intensity: 0.36,
        discSize: 0.045
      }
    },
    hemisphere: {
      skyColor: "#8CB4FF",
      groundColor: "#EDA6DA",
      intensity: 0.56
    }
  },
  "home-nook": {
    world: "home-nook",
    look: "interior-warm",
    hdri: "warm_bar",
    background: "#F2DFC6",
    overrides: {
      hdri: "warm_bar",
      sun: { azimuthDeg: -32, elevationDeg: 36 },
      exposureEv: -0.06,
      environmentIntensity: 0.86,
      environmentRotationDeg: 14,
      background: "#F2DFC6",
      key: {
        color: "#FFEAD1",
        intensity: 1.92,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#FFD9AE",
        intensity: 0.56,
        azimuthDeg: 152
      },
      fog: {
        color: "#F3E3CD",
        height: {
          mode: "height",
          density: 0.003,
          heightFalloff: 0.3,
          heightReference: 0
        }
      },
      grade: {
        contrast: 1.06,
        saturation: 1.14,
        temperature: 0.08
      },
      post: STORYBOOK_POST
    },
    contactShadows: { intensity: 0.72, length: 0.25 },
    sky: null,
    hemisphere: {
      skyColor: "#FFF0DC",
      groundColor: "#CFA074",
      intensity: 0.52
    }
  }
};

export function worldLook(world: WorldId): WorldLook {
  return WORLD_LOOKS[world];
}

export function lookAppOptions(world: WorldId = "meadow"): ReturnType<typeof looks.appOptions> {
  return looks.appOptions(WORLD_LOOKS[world].look);
}

/**
 * Scene nodes emitted for a world's look: `looks.preset` (HDRI IBL, PCSS key
 * shadow, rim light, height fog, AgX grade, soft bloom, SMAA) layered with a
 * sunlit horizon backdrop + soft storybook sky clouds, `lights.hemisphere`
 * bounce fill, and multi-bounce `effects.ambientOcclusion`.
 */
export function worldLookNodes(
  world: WorldId,
  _options: WorldLookOptions = {}
): readonly AuraNodeBuilder<AuraSceneNode>[] {
  const spec = WORLD_LOOKS[world];
  return [
    looks.preset(spec.look, spec.overrides),
    lights.hemisphere({
      name: `${world} bounce fill`,
      skyColor: spec.hemisphere.skyColor,
      groundColor: spec.hemisphere.groundColor,
      intensity: spec.hemisphere.intensity
    }),
    effects.ambientOcclusion({
      name: `${world} clay ambient occlusion`,
      radius: 0.45,
      intensity: 0.65,
      falloff: 0.45,
      multiBounce: true
    })
  ];
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

/** Every HDRI file the six worlds load; the app serves them at `/hdri/<file>`. */
export const LOOK_HDRI_FILES: readonly string[] = [
  ...new Set(WORLD_IDS.map(lookHdriFile).filter((file): file is string => file !== null))
].sort();
