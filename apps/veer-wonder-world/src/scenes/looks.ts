import {
  effects,
  geometry,
  lights,
  looks,
  material,
  type AuraColor,
  type AuraCustomGeometrySpec,
  type AuraHdriId,
  type AuraLookId,
  type AuraLookOverrides,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";
import type { WorldId } from "../types.js";
import { getCraftTexture } from "./procedural-rigs/craft-textures.js";
import { srgbHexToLinearRgba } from "./procedural-rigs/rig-kit.js";

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
  readonly softwareRenderer?: boolean;
}

export type WorldLookNodeOptions = WorldLookOptions;

const STORYBOOK_PCSS_SHADOW = {
  mapSize: 2048,
  cascades: 2,
  maxDistance: 28,
  filter: "pcss",
  softness: 0.65,
  bias: 0.0015,
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

const STORYBOOK_BLOOM = {
  intensity: 0.16,
  threshold: 1.55,
  knee: 0.4,
  clampLuminance: 3.5
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
 * `effects.vignette` is omitted across every world.
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
      exposureEv: -0.34,
      environmentIntensity: 0.84,
      environmentRotationDeg: 322,
      background: "#F5DCB8",
      key: {
        color: "#FFE7C2",
        intensity: 1.92,
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
      exposureEv: -0.18,
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

const SKY_DOME_CACHE = new Map<WorldId, AuraCustomGeometrySpec>();

function parseHexColor(color: AuraColor): string {
  return typeof color === "string" ? color : "#FFFFFF";
}

function buildStorybookSkyDomeNode(world: WorldId, skySpec: WorldSkyGradientSpec): AuraNodeBuilder<AuraSceneNode> {
  let domeSpec = SKY_DOME_CACHE.get(world);
  if (!domeSpec) {
    const radius = 68;
    const rings = 22;
    const segs = 44;
    const phiMin = -0.22 * Math.PI;
    const phiMax = 0.5 * Math.PI;
    const zenith = srgbHexToLinearRgba(parseHexColor(skySpec.zenith));
    const horizon = srgbHexToLinearRgba(parseHexColor(skySpec.horizon));
    const ground = srgbHexToLinearRgba(parseHexColor(skySpec.ground));
    const sunColor = srgbHexToLinearRgba(parseHexColor(skySpec.sun?.color ?? "#FFF4D8"));
    const exponent = skySpec.exponent ?? 0.72;
    const horizonGlow = skySpec.horizonGlow ?? 0.2;
    const sunElevRad = ((skySpec.sun?.elevationDeg ?? 36) * Math.PI) / 180;
    const sunAzimRad = ((skySpec.sun?.azimuthDeg ?? 38) * Math.PI) / 180;
    const sunX = Math.cos(sunElevRad) * Math.sin(sunAzimRad);
    const sunY = Math.sin(sunElevRad);
    const sunZ = -Math.cos(sunElevRad) * Math.cos(sunAzimRad);
    const sunStrength = skySpec.sun ? (skySpec.sun.intensity ?? 0.4) : 0;

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
        normals.push(0, 1, 0);
        uvs.push(u, v);

        let cr: number;
        let cg: number;
        let cb: number;
        if (dy >= 0) {
          const t = Math.pow(Math.min(1, dy), exponent);
          cr = horizon[0] + (zenith[0] - horizon[0]) * t;
          cg = horizon[1] + (zenith[1] - horizon[1]) * t;
          cb = horizon[2] + (zenith[2] - horizon[2]) * t;
          const glow = Math.pow(1 - Math.min(1, dy), 3.4) * horizonGlow;
          cr += sunColor[0] * glow * 0.45;
          cg += sunColor[1] * glow * 0.42;
          cb += sunColor[2] * glow * 0.36;
        } else {
          const t = Math.min(1, Math.pow(-dy / 0.65, 0.78));
          cr = horizon[0] + (ground[0] - horizon[0]) * t;
          cg = horizon[1] + (ground[1] - horizon[1]) * t;
          cb = horizon[2] + (ground[2] - horizon[2]) * t;
        }

        if (sunStrength > 0 && dy > -0.08) {
          const cosAng = Math.max(0, dx * sunX + dy * sunY + dz * sunZ);
          const corona = Math.pow(cosAng, 14) * sunStrength * 0.55 + Math.pow(cosAng, 220) * sunStrength * 0.85;
          const blend = Math.min(0.92, corona);
          cr = cr + (sunColor[0] - cr) * blend;
          cg = cg + (sunColor[1] - cg) * blend;
          cb = cb + (sunColor[2] - cb) * blend;
        }

        colors.push(Math.min(1.5, cr), Math.min(1.5, cg), Math.min(1.5, cb), 1);
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

    domeSpec = {
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
    SKY_DOME_CACHE.set(world, domeSpec);
  }

  return geometry.custom(domeSpec, {
    name: `${world} sky dome`,
    material: material.standard({
      color: "#FFFFFF",
      roughness: 1,
      metallic: 0,
      diffuseRoughness: 0.9,
      envMapIntensity: 0.85,
      texture: getCraftTexture("glazedCeramicSpeckle")
    }),
    castShadow: false,
    receiveShadow: false
  });
}

/**
 * Scene nodes emitted for a world's look: `looks.preset` (HDRI IBL, PCSS key
 * shadow, rim light, height fog, AgX grade, soft bloom, FXAA) layered with a
 * WebGPU-native vertex-colored sunlit sky dome (`buildStorybookSkyDomeNode` so
 * the real CC0 HDRI remains authoritative on both WebGPU and WebGL2),
 * `lights.hemisphere` bounce fill, multi-bounce `effects.ambientOcclusion`,
 * close-range `effects.contactShadows`, and subtle miniature-diorama `effects.depthOfField`.
 */
export function worldLookNodes(
  world: WorldId,
  options: WorldLookNodeOptions = {}
): readonly AuraNodeBuilder<AuraSceneNode>[] {
  const spec = WORLD_LOOKS[world];
  const overrides: AuraLookOverrides =
    options.softwareRenderer === true
      ? {
          ...spec.overrides,
          ...(spec.overrides.key
            ? { key: { ...spec.overrides.key, shadow: SOFTWARE_GL_SHADOW } }
            : {})
        }
      : spec.overrides;
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [
    looks.preset(spec.look, overrides),
    lights.hemisphere({
      name: `${world} bounce fill`,
      skyColor: spec.hemisphere.skyColor,
      groundColor: spec.hemisphere.groundColor,
      intensity: spec.hemisphere.intensity
    })
  ];
  if (options.softwareRenderer !== true) {
    if (spec.sky !== null) {
      nodes.push(buildStorybookSkyDomeNode(world, spec.sky));
    }
    nodes.push(
      effects.ambientOcclusion({
        name: `${world} clay ambient occlusion`,
        radius: 0.45,
        intensity: 0.65,
        falloff: 0.45,
        multiBounce: true
      }),
      effects.contactShadows({
        length: spec.contactShadows.length,
        thickness: 0.05,
        steps: options.qualityTier === "medium" || options.qualityTier === "low" ? 12 : 16,
        intensity: spec.contactShadows.intensity,
        lights: "sun"
      })
    );
    if (options.qualityTier !== "low") {
      nodes.push(
        effects.depthOfField({
          name: `${world} miniature lens`,
          focusDistance: 4.5,
          fStop: 5.6,
          focalLength: 50,
          maxBlur: 1.5,
          focus: 0.09,
          aperture: 0.28
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

/** Every HDRI file the six worlds load; the app serves them at `/hdri/<file>`. */
export const LOOK_HDRI_FILES: readonly string[] = [
  ...new Set(WORLD_IDS.map(lookHdriFile).filter((file): file is string => file !== null))
].sort();
