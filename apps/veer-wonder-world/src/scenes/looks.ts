import {
  effects,
  lights,
  looks,
  sky,
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

/**
 * Six bespoke Blender-Cycles storybook looks — one distinct CC0 HDRI, PCSS key
 * shadow, warm rim backlight, sky dome, bounce hemisphere fill, height fog,
 * contact shadows, half-res AO, and AgX grade per world.
 *
 * `effects.vignette` is never emitted in any world.
 */
export const WORLD_LOOKS: Readonly<Record<WorldId, WorldLook>> = {
  meadow: {
    world: "meadow",
    look: "golden-hour",
    hdri: "autumn_field_puresky",
    background: "#CFE8FA",
    overrides: {
      hdri: "autumn_field_puresky",
      sun: { azimuthDeg: 42, elevationDeg: 34 },
      exposureEv: -0.06,
      environmentIntensity: 0.92,
      environmentRotationDeg: 28,
      background: "#CFE8FA",
      key: {
        color: "#FFF1D6",
        intensity: 2.35,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#FFE3B3",
        intensity: 0.68,
        azimuthDeg: 218
      },
      fog: {
        color: "#E8F3FC",
        height: {
          mode: "height",
          density: 0.011,
          heightFalloff: 0.22,
          heightReference: 0
        }
      },
      grade: {
        contrast: 1.05,
        saturation: 1.12,
        temperature: 0.05
      },
      post: {
        bloom: STORYBOOK_BLOOM
      }
    },
    contactShadows: { intensity: 0.68, length: 0.26 },
    sky: {
      zenith: "#6EB5F0",
      horizon: "#FFECC9",
      ground: "#8CC476",
      exponent: 0.72,
      horizonGlow: 0.25,
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
    background: "#CBEBFB",
    overrides: {
      hdri: "outdoor-midday",
      sun: { azimuthDeg: 54, elevationDeg: 46 },
      exposureEv: -0.04,
      environmentIntensity: 0.94,
      environmentRotationDeg: 40,
      background: "#CBEBFB",
      key: {
        color: "#FFF6E3",
        intensity: 2.3,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#FFE8C8",
        intensity: 0.62,
        azimuthDeg: 232
      },
      fog: {
        color: "#E2F5FA",
        height: {
          mode: "height",
          density: 0.01,
          heightFalloff: 0.24,
          heightReference: 0
        }
      },
      grade: {
        contrast: 1.06,
        saturation: 1.15,
        temperature: 0.03
      },
      post: {
        bloom: STORYBOOK_BLOOM
      }
    },
    contactShadows: { intensity: 0.66, length: 0.26 },
    sky: {
      zenith: "#64B8EC",
      horizon: "#EBF9F5",
      ground: "#7EC29E",
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
    background: "#F9E3C6",
    overrides: {
      hdri: "spruit_sunrise",
      sun: { azimuthDeg: -38, elevationDeg: 28 },
      exposureEv: -0.2,
      environmentIntensity: 0.88,
      environmentRotationDeg: 322,
      background: "#F9E3C6",
      key: {
        color: "#FFE7C2",
        intensity: 2.2,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#FFD79E",
        intensity: 0.7,
        azimuthDeg: 142
      },
      fog: {
        color: "#F8E5CB",
        height: {
          mode: "height",
          density: 0.012,
          heightFalloff: 0.21,
          heightReference: 0
        }
      },
      grade: {
        contrast: 1.06,
        saturation: 1.14,
        temperature: 0.07
      },
      post: {
        bloom: STORYBOOK_BLOOM
      }
    },
    contactShadows: { intensity: 0.7, length: 0.26 },
    sky: {
      zenith: "#78B2E6",
      horizon: "#FFE2BA",
      ground: "#AEBA6C",
      exponent: 0.68,
      horizonGlow: 0.28,
      sun: {
        azimuthDeg: -38,
        elevationDeg: 28,
        color: "#FFE9BE",
        intensity: 0.48,
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
    background: "#CDE6FA",
    overrides: {
      hdri: "kloppenheim_06_puresky",
      sun: { azimuthDeg: 28, elevationDeg: 42 },
      exposureEv: -0.05,
      environmentIntensity: 0.92,
      environmentRotationDeg: 18,
      background: "#CDE6FA",
      key: {
        color: "#FFF4DF",
        intensity: 2.32,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#FFE6BF",
        intensity: 0.64,
        azimuthDeg: 208
      },
      fog: {
        color: "#E3EFFB",
        height: {
          mode: "height",
          density: 0.011,
          heightFalloff: 0.22,
          heightReference: 0
        }
      },
      grade: {
        contrast: 1.06,
        saturation: 1.12,
        temperature: 0.02
      },
      post: {
        bloom: STORYBOOK_BLOOM
      }
    },
    contactShadows: { intensity: 0.7, length: 0.26 },
    sky: {
      zenith: "#5FA9E8",
      horizon: "#E9F3FC",
      ground: "#8DB07E",
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
    background: "#B6CEFA",
    overrides: {
      hdri: "kloppenheim_02",
      sun: { azimuthDeg: 18, elevationDeg: 52 },
      exposureEv: 0,
      environmentIntensity: 0.96,
      environmentRotationDeg: 12,
      background: "#B6CEFA",
      key: {
        color: "#FFF7EC",
        intensity: 2.25,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#FFE3F4",
        intensity: 0.66,
        azimuthDeg: 198
      },
      fog: {
        color: "#C9DBFC",
        height: {
          mode: "height",
          density: 0.008,
          heightFalloff: 0.2,
          heightReference: -0.4
        }
      },
      grade: {
        contrast: 1.1,
        saturation: 1.24,
        temperature: 0.04,
        tint: 0.02
      },
      post: {
        bloom: STORYBOOK_BLOOM
      }
    },
    contactShadows: { intensity: 0.64, length: 0.25 },
    sky: {
      zenith: "#6F9AF2",
      horizon: "#F6D9EE",
      ground: "#A9C4F8",
      exponent: 0.7,
      horizonGlow: 0.24,
      sun: {
        azimuthDeg: 18,
        elevationDeg: 52,
        color: "#FFF5E8",
        intensity: 0.42,
        discSize: 0.045
      }
    },
    hemisphere: {
      skyColor: "#BDD4FF",
      groundColor: "#F3D7EC",
      intensity: 0.54
    }
  },
  "home-nook": {
    world: "home-nook",
    look: "interior-warm",
    hdri: "warm_bar",
    background: "#F5E4CE",
    overrides: {
      hdri: "warm_bar",
      sun: { azimuthDeg: -32, elevationDeg: 36 },
      exposureEv: 0,
      environmentIntensity: 0.88,
      environmentRotationDeg: 14,
      background: "#F5E4CE",
      key: {
        color: "#FFEAD1",
        intensity: 1.95,
        shadow: STORYBOOK_PCSS_SHADOW
      },
      rim: {
        color: "#FFD9AE",
        intensity: 0.56,
        azimuthDeg: 152
      },
      fog: {
        color: "#F6E7D4",
        height: {
          mode: "height",
          density: 0.006,
          heightFalloff: 0.3,
          heightReference: 0
        }
      },
      grade: {
        contrast: 1.05,
        saturation: 1.1,
        temperature: 0.08
      },
      post: {
        bloom: STORYBOOK_BLOOM
      }
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
 * shadow, rim light, height fog, AgX grade, soft bloom, FXAA) layered with a
 * storybook `sky.gradient` dome, `lights.hemisphere` bounce fill, screen-space
 * `effects.contactShadows`, half-res `effects.ambientOcclusion`, and subtle
 * miniature `effects.depthOfField` tilt-shift when motion is enabled.
 */
export function worldLookNodes(
  world: WorldId,
  options: WorldLookOptions = {}
): readonly AuraNodeBuilder<AuraSceneNode>[] {
  const spec = WORLD_LOOKS[world];
  const out: AuraNodeBuilder<AuraSceneNode>[] = [looks.preset(spec.look, spec.overrides)];

  if (spec.sky) {
    out.push(
      sky.gradient({
        name: `${world} sky dome`,
        zenith: spec.sky.zenith,
        horizon: spec.sky.horizon,
        ground: spec.sky.ground,
        ...(spec.sky.exponent !== undefined ? { exponent: spec.sky.exponent } : {}),
        ...(spec.sky.horizonGlow !== undefined ? { horizonGlow: spec.sky.horizonGlow } : {}),
        ...(spec.sky.sun ? { sun: spec.sky.sun } : {}),
        captureEnvironment: false,
        affectsFog: false
      })
    );
  }

  out.push(
    lights.hemisphere({
      name: `${world} bounce fill`,
      skyColor: spec.hemisphere.skyColor,
      groundColor: spec.hemisphere.groundColor,
      intensity: spec.hemisphere.intensity
    }),
    effects.contactShadows({
      intensity: spec.contactShadows.intensity,
      length: spec.contactShadows.length,
      thickness: 0.055,
      steps: 12,
      lights: "sun"
    }),
    effects.ambientOcclusion({
      name: `${world} clay ambient occlusion`,
      radius: 0.45,
      intensity: 0.65,
      quality: "balanced"
    })
  );

  const allowTiltShift =
    !options.reducedMotion &&
    (options.qualityTier === undefined ||
      options.qualityTier === "high" ||
      options.qualityTier === "ultra");

  if (allowTiltShift) {
    out.push(
      effects.depthOfField({
        name: `${world} miniature tilt-shift`,
        focusDistance: 4.6,
        focalLength: 42,
        fStop: 4.0,
        maxBlur: 0.0032,
        tiltShift: {
          bandCenter: 0.52,
          bandWidth: 0.58
        }
      })
    );
  }

  return out;
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
