// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraSceneNode } from "../index.js";
import { effects, primitives } from "../index.js";
import { createWeatherState, describeWetMaterial, type WeatherType } from "@aura3d/rendering";
import { lights } from "./lights.js";
import { material } from "./material.js";

export const weather = {
  /** Rain/snow declaration + weather-state-driven primitive streaks/flakes for production-path pixels. */
  precipitation: (options: {
    readonly type: WeatherType;
    readonly seed?: number;
    readonly streakLimit?: number;
    readonly elapsedSeconds?: number;
  }): { readonly nodes: readonly AuraSceneNode[]; readonly dropCount: number; readonly wetness: number } => {
    const state = createWeatherState({
      type: options.type,
      seed: options.seed ?? 0xd3e7,
      elapsedSeconds: options.elapsedSeconds ?? 1.2,
      maxVisualDrops: 400
    });
    const snowing = options.type === "snow";
    const intensity = snowing ? Math.max(0.2, state.snowIntensity) : Math.max(0.2, state.rainIntensity);
    const nodes: AuraSceneNode[] = [
      (snowing ? effects.snow({ intensity, color: "#e8f1ff" }) : effects.rain({ intensity, color: "#bcd7ff" })).toJSON()
    ];
    const limit = Math.max(0, Math.min(160, options.streakLimit ?? (snowing ? 70 : 90)));
    const drops = state.visualDrops.slice(0, limit);
    drops.forEach((drop, index) => {
      const x = Math.max(-3.4, Math.min(3.4, drop.x * 2.4));
      const y = Math.max(0.15, Math.min(3.4, drop.y + 1.6));
      const z = Math.max(-4.5, Math.min(2.5, drop.z * 2.4));
      if (snowing) {
        nodes.push(primitives.sphere({ name: `d3 snow flake ${index}`, material: material.pbr({ color: "#eef4ff", roughness: 0.85, metallic: 0 }) })
          .position(x, y, z).scale(0.035).toJSON());
      } else {
        nodes.push(primitives.box({ name: `d3 rain streak ${index}`, material: material.pbr({ color: "#bcd7ff", roughness: 0.35, metallic: 0 }) })
          .position(x, y, z).scale([0.014, Math.max(0.08, drop.length * 2.4), 0.014]).toJSON());
      }
    });
    return { nodes, dropCount: drops.length, wetness: state.wetness };
  },
  /** Ground slab with wetness darkening + puddle discs mapped from WeatherPuddlePatch. */
  wetGround: (options: {
    readonly type?: WeatherType;
    readonly dryColor?: string;
    readonly dryRoughness?: number;
    readonly seed?: number;
    readonly size?: number;
  } = {}): {
    readonly nodes: readonly AuraSceneNode[];
    readonly wetness: number;
    readonly albedoColor: string;
    readonly roughness: number;
    readonly puddleCount: number;
  } => {
    const probe = describeWetMaterial({
      type: options.type ?? "rain",
      dryColor: options.dryColor ?? "#5b6b4f",
      dryRoughness: options.dryRoughness ?? 0.9,
      seed: options.seed ?? 0xd3e7
    });
    const size = Math.max(2, Math.min(14, options.size ?? 8));
    const nodes: AuraSceneNode[] = [
      primitives.box({ name: "d3 weather ground slab", material: material.pbr({ color: probe.response.albedoColor, roughness: probe.response.roughness, metallic: 0 }) })
        .position(0, -0.02, 0).scale([size, 0.04, size]).toJSON()
    ];
    probe.weather.puddlePatches.forEach((patch, index) => {
      nodes.push(primitives.cylinder({ name: `d3 puddle disc ${index}`, material: material.pbr({ color: "#16283a", roughness: 0.05, metallic: 0.1 }) })
        .position(patch.x * 2.4, 0.005, patch.z * 2.4).scale([Math.max(0.06, patch.radius * 3), 0.006, Math.max(0.06, patch.radius * 3)]).toJSON());
    });
    return {
      nodes,
      wetness: probe.response.wetness,
      albedoColor: probe.response.albedoColor,
      roughness: probe.response.roughness,
      puddleCount: probe.weather.puddlePatches.length
    };
  },
  /** Lightning-flash light hook: intensity is 0 unless type is thunderstorm. */
  lightning: (options: { readonly type: WeatherType; readonly elapsedSeconds?: number; readonly seed?: number } = { type: "thunderstorm" }): {
    readonly nodes: readonly AuraSceneNode[];
    readonly intensity: number;
  } => {
    const probe = describeWetMaterial({ type: options.type, elapsedSeconds: options.elapsedSeconds ?? 0.4, seed: options.seed ?? 0xd3e7 });
    return {
      nodes: probe.flash.intensity > 0
        ? [lights.directional({ name: "d3 lightning flash", color: "#dbeafe", intensity: 1 + probe.flash.intensity * 4, position: [2, 6, -3] }).toJSON()]
        : [],
      intensity: probe.flash.intensity
    };
  }
} as const;
