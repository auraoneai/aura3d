/** `material.custom` specs for the port's surfaces, apart from the scene so a unit test can compile exactly what the app draws. */
import type { material } from "@aura3d/engine";
import { ROAD_FRAGMENT, ROAD_VERTEX, SOLID_FRAGMENT, SOLID_VERTEX, WATER_FRAGMENT, WATER_VERTEX } from "./shaders";

export type CustomSpec = Parameters<typeof material.custom>[0];
export type Rgb = readonly [number, number, number];

export interface FogLook { readonly fogColor: Rgb; readonly fogNear: number; readonly fogFar: number }

const fogUniforms = (fog: FogLook) => ({
  fogColor: { type: "color3" as const, value: [...fog.fogColor] as [number, number, number] },
  fogNear: { type: "f32" as const, value: fog.fogNear },
  fogFar: { type: "f32" as const, value: fog.fogFar }
});

export const roadSpec = (asphalt: Rgb, line: Rgb, glow: Rgb, fog: FogLook): CustomSpec => ({
  glsl: { vertex: ROAD_VERTEX, fragment: ROAD_FRAGMENT },
  uniforms: {
    asphalt: { type: "color3", value: [...asphalt] },
    lineColor: { type: "color3", value: [...line] },
    glowColor: { type: "color3", value: [...glow] },
    ...fogUniforms(fog)
  },
  side: "double"
});

export const waterSpec = (base: Rgb, fog: FogLook): CustomSpec => ({
  glsl: { vertex: WATER_VERTEX, fragment: WATER_FRAGMENT },
  uniforms: { baseColor: { type: "color3", value: [...base] }, ...fogUniforms(fog) },
  side: "double"
});

export const solidSpec = (base: Rgb, glow: Rgb, glowAmount: number, fog: FogLook): CustomSpec => ({
  glsl: { vertex: SOLID_VERTEX, fragment: SOLID_FRAGMENT },
  uniforms: {
    baseColor: { type: "color3", value: [...base] },
    glowColor: { type: "color3", value: [...glow] },
    glowAmount: { type: "f32", value: glowAmount },
    ...fogUniforms(fog)
  },
  side: "double"
});

/** One of each distinct program the scene uses. */
export const allProgramSpecs = (): readonly { readonly name: string; readonly spec: CustomSpec }[] => {
  const fog: FogLook = { fogColor: [0.7, 0.8, 0.9], fogNear: 200, fogFar: 1800 };
  return [
    { name: "road", spec: roadSpec([0.08, 0.09, 0.1], [0.9, 0.9, 0.85], [0.2, 0.8, 0.9], fog) },
    { name: "water", spec: waterSpec([0.05, 0.3, 0.45], fog) },
    { name: "solid", spec: solidSpec([0.6, 0.6, 0.65], [0.1, 0.8, 0.9], 0, fog) },
    { name: "solid-glow", spec: solidSpec([0.2, 0.8, 0.9], [0.2, 0.9, 1.0], 1.4, fog) }
  ];
};
