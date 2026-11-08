// 5.1 look defaults (lane 511): opt-in helpers that fix the three weak cold-start frames (flat grey metal under the
// neutral room, hazy forest under a fixed fog density, dim robot on a floor with a visible edge). Nothing here runs
// unless a scene calls it, so scenes that author their own look render exactly as before.

import type { AuraColor, AuraGroupNode, AuraLightNode, AuraSceneNode, AuraVec3 } from "../nodes/types.js";
import { AuraNodeBuilder } from "../nodes/builder.js";
import { effects } from "../nodes/effects.composite.js";
import { environments } from "../nodes/environments.composite.js";
import { lights } from "../nodes/lights.js";
import { material } from "../nodes/material.js";
import { primitives } from "../nodes/primitives.js";

export interface AuraFogForExtentOptions {
  /** Distance (world units) at which the fog should reach `haze` opacity: the far edge of the scene you want to see. */
  readonly extent: number;
  readonly color?: AuraColor;
  /** Fog opacity at `extent`, inside (0,1). Default 0.35: far objects fade but stay readable. */
  readonly haze?: number;
  /** `exp` ramps from the camera (default); `exp2` stays clear nearby and closes fast near `extent`. */
  readonly mode?: "exp" | "exp2";
  readonly name?: string;
}

/** Fog density (per world unit) that reaches `haze` opacity at `extent`, for the given falloff curve. */
export function fogDensityForExtent(extent: number, haze = 0.35, mode: "exp" | "exp2" = "exp"): number {
  if (!Number.isFinite(extent) || extent <= 0) throw new RangeError("looks.fogForExtent extent must be a positive finite distance.");
  if (!Number.isFinite(haze) || haze <= 0 || haze >= 1) throw new RangeError("looks.fogForExtent haze must be inside (0, 1).");
  const k = -Math.log(1 - haze);
  return mode === "exp2" ? Math.sqrt(k) / extent : k / extent;
}

/** Scene fog sized by scene extent instead of a fixed density: `haze` opacity at `extent` world units. */
export function fogForExtent(options: AuraFogForExtentOptions) {
  const mode = options.mode ?? "exp";
  return effects.fog({
    name: options.name ?? "extent fog",
    mode,
    ...(options.color !== undefined ? { color: options.color } : {}),
    density: fogDensityForExtent(options.extent, options.haze, mode)
  });
}

export interface AuraHeroRigOptions {
  /** Point the rig lights. Default [0, 0, 0]. */
  readonly target?: AuraVec3;
  /** Subject radius in world units; light distance scales with it. Default 1. */
  readonly radius?: number;
  /** Overall multiplier on the three lights. Default 1. */
  readonly intensity?: number;
  readonly keyColor?: AuraColor;
  readonly fillColor?: AuraColor;
  readonly rimColor?: AuraColor;
  readonly shadow?: boolean;
  readonly name?: string;
}

const deg = Math.PI / 180;
function around(target: AuraVec3, distance: number, azimuthDeg: number, elevationDeg: number): AuraVec3 {
  const el = elevationDeg * deg;
  const az = azimuthDeg * deg;
  return [
    target[0] + distance * Math.cos(el) * Math.sin(az),
    target[1] + distance * Math.sin(el),
    target[2] + distance * Math.cos(el) * Math.cos(az)
  ];
}

function group(name: string, children: readonly AuraSceneNode[]): AuraNodeBuilder<AuraGroupNode> {
  return new AuraNodeBuilder<AuraGroupNode>({ kind: "group", name, children: [...children] } as AuraGroupNode);
}

function heroLights(options: AuraHeroRigOptions): AuraLightNode[] {
  const target = options.target ?? [0, 0, 0];
  const radius = options.radius ?? 1;
  if (!Number.isFinite(radius) || radius <= 0) throw new RangeError("looks.heroRig radius must be a positive finite number.");
  const gain = options.intensity ?? 1;
  const d = radius * 6;
  const prefix = options.name ?? "hero";
  return [
    lights.directional({ name: `${prefix} key`, position: around(target, d, 35, 42), target, intensity: 3.2 * gain, color: options.keyColor ?? "#fff1de", shadow: options.shadow ?? true }).toJSON(),
    lights.directional({ name: `${prefix} fill`, position: around(target, d, -60, 18), target, intensity: 1.1 * gain, color: options.fillColor ?? "#a9c4ff" }).toJSON(),
    lights.directional({ name: `${prefix} rim`, position: around(target, d, 170, 28), target, intensity: 2.6 * gain, color: options.rimColor ?? "#ffffff" }).toJSON()
  ];
}

/** Warm key + cool fill + back rim, sized to the subject. A group of three directional lights. */
export function heroRig(options: AuraHeroRigOptions = {}): AuraNodeBuilder<AuraGroupNode> {
  return group(options.name ? `${options.name} rig` : "hero rig", heroLights(options));
}

export interface AuraHeroStageOptions extends AuraHeroRigOptions {
  /**
   * Studio (default) gives metal and gloss something to reflect; the neutral room is flat grey. `"room"` is the
   * structured studio room generated in code (softbox panels, a windowed fill and dark flags over darker walls and a
   * floor), embedded in the engine so it needs no `/aura-environments` file: glass and metal read even in an app that
   * ships no environment assets.
   */
  readonly environment?: "studio" | "room" | "neutral" | "none";
  readonly environmentIntensity?: number;
  /** Colour the floor fades into; set it equal to `scene({ background })`. Default "#1b1d24". */
  readonly background?: AuraColor;
  /** `false` omits the floor and fog. */
  readonly floor?: false | { readonly color?: AuraColor; readonly roughness?: number; readonly y?: number };
}

/**
 * One call for a hero subject: studio IBL, key/fill/rim, and a floor that fades into `background` (distance fog
 * sized to the floor) so no edge shows. The floor sits at `target.y - radius`; move it with `floor.y`.
 */
export function heroStage(options: AuraHeroStageOptions = {}): AuraNodeBuilder<AuraGroupNode> {
  const target = options.target ?? [0, 0, 0];
  const radius = options.radius ?? 1;
  const children: AuraSceneNode[] = [];
  const environment = options.environment ?? "studio";
  const envIntensity = options.environmentIntensity ?? 1;
  if (environment === "studio") children.push(environments.studio({ name: "hero studio environment", intensity: envIntensity }).toJSON());
  else if (environment === "room") children.push(environments.studio({ preset: "softbox", name: "hero room environment", intensity: envIntensity }).toJSON());
  else if (environment === "neutral") children.push(environments.neutral({ name: "hero neutral environment", intensity: envIntensity }).toJSON());
  children.push(...heroLights(options));
  if (options.floor !== false) {
    const floor = options.floor ?? {};
    const half = radius * 40;
    const background = options.background ?? "#1b1d24";
    children.push(
      primitives
        .plane({
          name: "hero floor",
          size: [half * 2, 1, half * 2],
          material: material.pbr({ color: floor.color ?? "#3a3d48", roughness: floor.roughness ?? 0.8 }),
          castShadow: false
        })
        .position(target[0], floor.y ?? target[1] - radius, target[2])
        .toJSON(),
      // exp2 stays clear around the subject (a few radii from the camera) and is closed by the floor edge.
      fogForExtent({ name: "hero floor fade", color: background, haze: 0.98, extent: half, mode: "exp2" }).toJSON()
    );
  }
  return group("hero stage", children);
}
