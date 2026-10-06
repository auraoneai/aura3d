// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraSceneNode } from "../index.js";
import { primitives } from "../index.js";
import { createDayNightSky, type DayNightSkyOptions } from "@aura3d/rendering";
import { lights } from "./lights.js";
import { material } from "./material.js";

export const sky = {
  /** Time-of-day sky: background key, sun/moon discs, stars, 2D-noise clouds, key light. */
  dayNight: (options: DayNightSkyOptions & { readonly starLimit?: number; readonly cloudLimit?: number } = {}): {
    readonly nodes: readonly AuraSceneNode[];
    readonly background: string;
    readonly dayFactor: number;
    readonly visibleStarCount: number;
  } => {
    const state = createDayNightSky(options);
    const nodes: AuraSceneNode[] = [];
    const sunUp = state.sun.elevationRadians > -0.05;
    const moonUp = state.moon.elevationRadians > -0.05;
    if (sunUp) {
      nodes.push(primitives.sphere({ name: "d3 sun disc", material: material.emissive({ color: state.sun.color, emissive: state.sun.color, emissiveIntensity: 2.2, roughness: 0.8 }) })
        .position(-6 * Math.cos(state.sun.azimuthRadians), 1 + 5 * Math.sin(state.sun.azimuthRadians), -7).scale(0.85).toJSON());
    }
    if (moonUp) {
      nodes.push(primitives.sphere({ name: "d3 moon disc", material: material.emissive({ color: state.moon.color, emissive: state.moon.color, emissiveIntensity: 1.4, roughness: 0.8 }) })
        .position(-6 * Math.cos(state.moon.azimuthRadians), 1 + 5 * Math.sin(state.moon.azimuthRadians), -7).scale(0.6).toJSON());
    }
    const starLimit = Math.max(0, Math.min(120, options.starLimit ?? 48));
    const visibleStars = state.stars.filter((star) => star.brightness > 0.05 && star.y > 0).slice(0, starLimit);
    for (const [index, star] of visibleStars.entries()) {
      nodes.push(primitives.sphere({ name: `d3 night star ${index}`, material: material.emissive({ color: "#dbeafe", emissive: "#bfdbfe", emissiveIntensity: 1.8, roughness: 0.9 }) })
        .position(star.x * 7, star.y * 4 + 0.6, -6.5).scale(0.028 + star.size * 2).toJSON());
    }
    const cloudLimit = Math.max(0, Math.min(48, options.cloudLimit ?? 12));
    const cloudTint = state.dayFactor > 0.5 ? "#f1f5f9" : state.dayFactor > 0.2 ? "#b6a6a6" : "#1e293b";
    for (const [index, cell] of state.clouds.slice(0, cloudLimit).entries()) {
      nodes.push(primitives.sphere({ name: `d3 noise cloud ${index}`, material: material.pbr({ color: cloudTint, roughness: 1, metallic: 0 }) })
        .position(cell.x * 6, cell.y * 3 + 1.4, -5.5).scale([cell.radius * 1.7, cell.radius * 0.5, cell.radius * 0.8]).toJSON());
    }
    nodes.push(lights.directional({
      name: sunUp ? "d3 sun key light" : "d3 moon key light",
      position: sunUp ? [-4, 5, 2] : [3, 4, -1],
      color: sunUp ? state.sun.color : state.moon.color,
      intensity: sunUp ? 0.6 + state.dayFactor * 1.2 : 0.35
    }).toJSON());
    return { nodes, background: state.dayFactor > 0.5 ? state.horizonColor : state.nightFactor > 0.6 ? "#020617" : state.horizonColor, dayFactor: state.dayFactor, visibleStarCount: visibleStars.length };
  }
} as const;
