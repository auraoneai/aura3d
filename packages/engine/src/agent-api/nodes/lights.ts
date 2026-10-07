// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraLightNode, AuraVec3 } from "./types.js";
import type { AuraDirectionalShadowOptions, AuraLocalShadowOptions } from "../../contracts/lighting.js";
import { AuraNodeBuilder } from "./builder.js";
import { distance } from "../SpatialAnchoring.js";

export const lights = {
  ambient: (options: { readonly name?: string; readonly intensity?: number; readonly color?: AuraColor } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "ambient",
      name: options.name,
      intensity: options.intensity ?? 0.28,
      color: options.color ?? "#ffffff"
    }),
  hemisphere: (options: { readonly name?: string; readonly skyColor?: AuraColor; readonly groundColor?: AuraColor; readonly intensity?: number; readonly position?: AuraVec3 } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "hemisphere",
      name: options.name ?? "hemisphere light",
      position: options.position ?? [0, 1, 0],
      intensity: options.intensity ?? 1,
      color: options.skyColor ?? "#bcd7ff",
      // CCR-02-2 additive field: the C-36 handler reads groundColor.
      ...(options.groundColor !== undefined ? { groundColor: options.groundColor } : {})
    } as AuraLightNode),
  directional: (options: { readonly name?: string; readonly position?: AuraVec3; readonly target?: AuraVec3; readonly intensity?: number; readonly color?: AuraColor; readonly shadow?: boolean | AuraDirectionalShadowOptions } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "directional",
      name: options.name,
      position: options.position ?? [3, 4, 3],
      ...(options.target !== undefined ? { target: options.target } : {}),
      intensity: options.intensity ?? 1.5,
      color: options.color ?? "#ffffff",
      shadow: options.shadow
    }),
  point: (options: { readonly name?: string; readonly position?: AuraVec3; readonly intensity?: number; readonly power?: number; readonly distance?: number; readonly decay?: number; readonly color?: AuraColor; readonly shadow?: boolean | AuraLocalShadowOptions } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "point",
      name: options.name,
      position: options.position ?? [2, 2.5, 1.5],
      intensity: options.intensity ?? 8,
      ...(options.power !== undefined ? { power: options.power } : {}),
      ...(options.distance !== undefined ? { distance: options.distance } : {}),
      ...(options.decay !== undefined ? { decay: options.decay } : {}),
      ...(options.shadow !== undefined ? { shadow: options.shadow } : {}),
      color: options.color ?? "#ffffff"
    }),
  spot: (options: { readonly name?: string; readonly position?: AuraVec3; readonly target?: AuraVec3; readonly angle?: number; readonly penumbra?: number; readonly distance?: number; readonly decay?: number; readonly intensity?: number; readonly power?: number; readonly color?: AuraColor; readonly shadow?: boolean | AuraLocalShadowOptions } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "spot",
      name: options.name ?? "spot light",
      position: options.position ?? [0, 4, 0],
      target: options.target,
      angle: options.angle ?? Math.PI / 6,
      penumbra: options.penumbra ?? 0.4,
      distance: options.distance ?? 12,
      decay: options.decay,
      intensity: options.intensity ?? 30,
      ...(options.power !== undefined ? { power: options.power } : {}),
      color: options.color ?? "#ffffff",
      shadow: options.shadow
    }),
  studio: (options: { readonly intensity?: number } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "studio",
      name: "studio-key-fill-rim",
      intensity: options.intensity ?? 1,
      color: "#ffffff",
      position: [0, 3, 4]
    }),
  rect: (options: { readonly name?: string; readonly position?: AuraVec3; readonly target?: AuraVec3; readonly intensity?: number; readonly color?: AuraColor; readonly width?: number; readonly height?: number; readonly twoSided?: boolean } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "rect",
      name: options.name ?? "rect area light",
      position: options.position ?? [0, 2.6, 1.8],
      ...(options.target !== undefined ? { target: options.target } : {}),
      intensity: options.intensity ?? 1.4,
      color: options.color ?? "#ffffff",
      width: options.width ?? 2.2,
      height: options.height ?? 1.2,
      // CCR-02-2 additive field.
      ...(options.twoSided !== undefined ? { twoSided: options.twoSided } : {})
    } as AuraLightNode),
  softbox: (options: { readonly name?: string; readonly position?: AuraVec3; readonly target?: AuraVec3; readonly intensity?: number; readonly color?: AuraColor; readonly width?: number; readonly height?: number; readonly twoSided?: boolean } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "softbox",
      name: options.name ?? "large softbox light",
      position: options.position ?? [-2.2, 2.4, 2.2],
      intensity: options.intensity ?? 1.75,
      color: options.color ?? "#f7fbff",
      width: options.width ?? 2.4,
      height: options.height ?? 1.6
    }),
  productStudio: (options: { readonly intensity?: number } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "softbox",
      name: "product-studio-softbox-rig",
      position: [-2.25, 2.45, 2.35],
      intensity: options.intensity ?? 1.7,
      color: "#f7fbff",
      width: 2.5,
      height: 1.6
    }),
  materialLab: (options: { readonly intensity?: number } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "softbox",
      name: "material-lab-rect-softbox-rig",
      position: [0, 2.55, 1.8],
      intensity: options.intensity ?? 1.9,
      color: "#ffffff",
      width: 3.2,
      height: 1.2
    })
} as const;
