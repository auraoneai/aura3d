// PR 0b-1 carve-out (CONTRACTS.md §3.2) — moved from agent-api/index.ts.
// PRD-07 P3-T4 (§6.5): adds the real `sky` node builders (preetham/gradient/
// hdri) and rewrites `sky.dayNight` to additionally emit one `sky` node
// (spec from `createDayNightSky`), while the legacy sphere primitives are
// emitted unchanged — each tagged `runtime.id = "prd07.legacySky.<n>"` so the
// effect system can hide them via their runtime handles when A3D_QR_VFX_SKY
// is on. Flag-off frames are byte-identical (the `sky` node draws nothing
// without the flag, and the primitives render exactly as before).
// `AuraSkyNode` isn't yet in the `AuraSceneNode` union (prd15-owned
// index.ts — CCR-07-2); builders cast like the §6.2.9–11 effect builders.

import type { AuraSceneNode } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";
import { primitives } from "./primitives.js";
import { createDayNightSky, type DayNightSkyOptions } from "@aura3d/rendering";
import type { AuraSkyNode, AuraSkySpec, AuraSkySunSpec } from "../../contracts/atmosphere";
import { lights } from "./lights.js";
import { material } from "./material.js";

function deg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function sunSpec(disc: { azimuthRadians: number; elevationRadians: number; intensity: number; color: string; angularRadius: number }): AuraSkySunSpec {
  return {
    elevationDeg: deg(disc.elevationRadians),
    azimuthDeg: deg(disc.azimuthRadians),
    intensity: disc.intensity,
    color: disc.color,
    discSize: disc.angularRadius * 2 // radians ≈ angular diameter
  };
}

/** Sky-node option bag shared by the three real builders. */
export interface AuraSkyNodeOptions {
  readonly name?: string;
  readonly captureEnvironment?: boolean;
  readonly affectsFog?: boolean;
}

function skyNode(name: string, spec: AuraSkySpec, options: AuraSkyNodeOptions): AuraNodeBuilder<AuraSceneNode> {
  const node: AuraSkyNode = {
    kind: "sky",
    name,
    spec,
    captureEnvironment: options.captureEnvironment ?? true,
    affectsFog: options.affectsFog ?? true
  };
  return new AuraNodeBuilder(node as unknown as AuraSceneNode);
}

function skyPreetham(
  options: Omit<Extract<AuraSkySpec, { model: "preetham" }>, "model"> & AuraSkyNodeOptions
): AuraNodeBuilder<AuraSceneNode> {
  const { name, captureEnvironment, affectsFog, ...spec } = options;
  return skyNode(name ?? "sky", { ...spec, model: "preetham" }, { captureEnvironment, affectsFog });
}

function skyGradient(
  options: Omit<Extract<AuraSkySpec, { model: "gradient" }>, "model"> & AuraSkyNodeOptions
): AuraNodeBuilder<AuraSceneNode> {
  const { name, captureEnvironment, affectsFog, ...spec } = options;
  return skyNode(name ?? "sky", { ...spec, model: "gradient" }, { captureEnvironment, affectsFog });
}

function skyHdri(
  options: Omit<Extract<AuraSkySpec, { model: "hdri" }>, "model"> & AuraSkyNodeOptions
): AuraNodeBuilder<AuraSceneNode> {
  const { name, captureEnvironment, affectsFog, ...spec } = options;
  return skyNode(name ?? "sky", { ...spec, model: "hdri" }, { captureEnvironment, affectsFog });
}

export const sky = {
  preetham: skyPreetham,
  gradient: skyGradient,
  hdri: skyHdri,

  /**
   * Time-of-day sky: with `A3D_QR_VFX_SKY` off, emits exactly the legacy
   * sphere sun/moon/stars/clouds + background colour (bit-identical); with
   * the flag on those same primitives are runtime-tagged `prd07.legacySky.*`
   * and hidden by the effect system, and the extra `sky` node draws the real
   * sky (model = `options.model`, default "preetham"; sun/moon directions
   * from `createDayNightSky` — the E31 keyframes keep only colour
   * temperature). Return shape preserved, plus `sky`.
   */
  dayNight: (options: DayNightSkyOptions & { readonly starLimit?: number; readonly cloudLimit?: number; readonly model?: "preetham" | "gradient" } = {}): {
    readonly nodes: readonly AuraSceneNode[];
    readonly background: string;
    readonly dayFactor: number;
    readonly visibleStarCount: number;
    readonly sky: AuraSkySpec;
  } => {
    const state = createDayNightSky(options);
    const nodes: AuraSceneNode[] = [];
    const sunUp = state.sun.elevationRadians > -0.05;
    const moonUp = state.moon.elevationRadians > -0.05;
    let legacyIndex = 0;
    const tag = <T extends AuraSceneNode>(builder: AuraNodeBuilder<T>): AuraSceneNode =>
      builder.runtime({ id: `prd07.legacySky.${legacyIndex++}`, tags: ["prd07.legacySky"] }).toJSON() as AuraSceneNode;
    if (sunUp) {
      nodes.push(tag(primitives.sphere({ name: "d3 sun disc", material: material.emissive({ color: state.sun.color, emissive: state.sun.color, emissiveIntensity: 2.2, roughness: 0.8 }) })
        .position(-6 * Math.cos(state.sun.azimuthRadians), 1 + 5 * Math.sin(state.sun.azimuthRadians), -7).scale(0.85)));
    }
    if (moonUp) {
      nodes.push(tag(primitives.sphere({ name: "d3 moon disc", material: material.emissive({ color: state.moon.color, emissive: state.moon.color, emissiveIntensity: 1.4, roughness: 0.8 }) })
        .position(-6 * Math.cos(state.moon.azimuthRadians), 1 + 5 * Math.sin(state.moon.azimuthRadians), -7).scale(0.6)));
    }
    const starLimit = Math.max(0, Math.min(120, options.starLimit ?? 48));
    const visibleStars = state.stars.filter((star) => star.brightness > 0.05 && star.y > 0).slice(0, starLimit);
    for (const [index, star] of visibleStars.entries()) {
      nodes.push(tag(primitives.sphere({ name: `d3 night star ${index}`, material: material.emissive({ color: "#dbeafe", emissive: "#bfdbfe", emissiveIntensity: 1.8, roughness: 0.9 }) })
        .position(star.x * 7, star.y * 4 + 0.6, -6.5).scale(0.028 + star.size * 2)));
    }
    const cloudLimit = Math.max(0, Math.min(48, options.cloudLimit ?? 12));
    const cloudTint = state.dayFactor > 0.5 ? "#f1f5f9" : state.dayFactor > 0.2 ? "#b6a6a6" : "#1e293b";
    for (const [index, cell] of state.clouds.slice(0, cloudLimit).entries()) {
      nodes.push(tag(primitives.sphere({ name: `d3 noise cloud ${index}`, material: material.pbr({ color: cloudTint, roughness: 1, metallic: 0 }) })
        .position(cell.x * 6, cell.y * 3 + 1.4, -5.5).scale([cell.radius * 1.7, cell.radius * 0.5, cell.radius * 0.8])));
    }
    // The real sky node: model defaults to preetham; sun/moon directions come
    // straight from the day-night state; `groundColor` carries the horizon
    // colour as the fog "sky" hint.
    const skySpec: AuraSkySpec = options.model === "gradient"
      ? {
          model: "gradient",
          zenith: state.zenithColor,
          horizon: state.horizonColor,
          ground: "#2a2d33",
          sun: sunSpec(state.sun),
          stars: { density: Math.min(1, visibleStars.length / 240), intensity: 1 },
          moon: { elevationDeg: deg(state.moon.elevationRadians), azimuthDeg: deg(state.moon.azimuthRadians), phase: state.moon.phase, color: state.moon.color, intensity: state.moon.intensity }
        }
      : {
          model: "preetham",
          sun: sunSpec(state.sun),
          groundColor: state.horizonColor,
          stars: { density: Math.min(1, visibleStars.length / 240), intensity: 1 },
          clouds: { coverage: state.averageCloudCoverage },
          moon: { elevationDeg: deg(state.moon.elevationRadians), azimuthDeg: deg(state.moon.azimuthRadians), phase: state.moon.phase, color: state.moon.color, intensity: state.moon.intensity }
        };
    nodes.push(skyNode("sky", skySpec, { captureEnvironment: true, affectsFog: true }).toJSON());
    nodes.push(lights.directional({
      name: sunUp ? "d3 sun key light" : "d3 moon key light",
      position: sunUp ? [-4, 5, 2] : [3, 4, -1],
      color: sunUp ? state.sun.color : state.moon.color,
      intensity: sunUp ? 0.6 + state.dayFactor * 1.2 : 0.35
    }).toJSON());
    return { nodes, background: state.dayFactor > 0.5 ? state.horizonColor : state.nightFactor > 0.6 ? "#020617" : state.horizonColor, dayFactor: state.dayFactor, visibleStarCount: visibleStars.length, sky: skySpec };
  }
} as const;
