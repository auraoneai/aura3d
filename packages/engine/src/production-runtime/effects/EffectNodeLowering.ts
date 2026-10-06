// PRD-07 P1-T13 — Aura effect-node lowering (PRD-07 §6.3.1 + §11 mapping).
// Particles / rain / snow / flipbook-sprite lower to CpuEmitter descriptors;
// beam (light-beam) lowers to a beam record; every other kind maps to `null`
// (post/other consumer — reported in diagnostics as non-particle kinds).

import type { EmitterDescriptor } from "./CpuEmitter";
import type { AuraVec3 } from "./CpuEmitter";

export interface EffectNodeLike {
  readonly kind: string;
  readonly effect?: string;
  readonly name?: string;
  readonly id?: string;
  readonly position?: AuraVec3;
  readonly particleCount?: number;
  readonly emitter?: "fountain" | "swirl" | "ambient";
  readonly color?: string | readonly number[];
  readonly speed?: number | readonly [number, number];
  readonly gravity?: number | AuraVec3;
  readonly emissionRate?: number;
  readonly radius?: number;
  readonly height?: number;
  readonly wind?: AuraVec3;
  readonly turbulence?: number;
  readonly materialMode?: string;
  readonly spriteColumns?: number;
  readonly spriteRows?: number;
  readonly frameRate?: number;
  readonly intensity?: number;
  readonly mist?: boolean;
  readonly splashes?: boolean;
  readonly seed?: number;
  // PRD-07 §6.2 emitter surface (options accepted by effects.particles).
  readonly blend?: "alpha" | "premultiplied" | "additive" | "multiply" | "opaque";
  readonly size?: number | readonly [number, number];
  readonly maxParticles?: number;
  readonly prewarm?: number;
  readonly rate?: number;
  readonly lifetime?: number | readonly [number, number];
  readonly drag?: number;
  readonly spread?: number;
  readonly direction?: AuraVec3;
  readonly softDistance?: number;
  readonly nearFade?: number;
}

export interface LoweredParticleEffect {
  readonly type: "emitter";
  readonly nodeId: string;
  readonly effect: string;
  readonly batch: LoweredBatchSpec;
  readonly emitter: EmitterDescriptor;
  readonly consumer: "particle-pass";
  readonly sim: "cpu";
}

export interface LoweredBeamEffect {
  readonly type: "beam";
  readonly nodeId: string;
  readonly effect: string;
  readonly consumer: "beam-pass";
  readonly sim: "procedural";
}

export interface LoweredOtherEffect {
  readonly type: "other";
  readonly nodeId: string;
  readonly effect: string;
  readonly consumer: "post" | "scene-fog" | "none";
  readonly sim: "none";
}

export type LoweredEffect = LoweredParticleEffect | LoweredBeamEffect | LoweredOtherEffect;

export interface LoweredBatchSpec {
  readonly blend: "alpha" | "premultiplied" | "additive" | "multiply";
  readonly shading: "unlit" | "lit";
  readonly softDepth: boolean;
  readonly softDistance?: number;
  readonly nearFade?: number;
  readonly stretch: boolean;
  readonly frameBlend: boolean;
  readonly atlasKey: string;
}

const COLOR_TABLE: Record<string, readonly [number, number, number]> = {
  "additive-glow": [2.0, 1.1, 0.45],
  spark: [3.0, 1.8, 0.6],
  smoke: [0.28, 0.28, 0.3],
  splash: [0.45, 0.65, 0.9],
  dust: [0.6, 0.55, 0.45],
  star: [3.0, 3.0, 2.4],
  "soft-alpha": [1, 1, 1]
};

const ADDITIVE_MODES = new Set(["additive-glow", "spark", "star"]);

const VALID_BLENDS = new Set(["alpha", "premultiplied", "additive", "multiply"]);

type Blend = "alpha" | "premultiplied" | "additive" | "multiply";

function asRange(v: number | readonly [number, number] | undefined): readonly [number, number] | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number") return [v, v];
  return [v[0], v[1] ?? v[0]];
}

function hashSeed(nodeId: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < nodeId.length; i++) {
    h ^= nodeId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function nodeColor(node: EffectNodeLike): readonly [number, number, number] {
  const c = node.color;
  if (Array.isArray(c) && c.length >= 3) return [Number(c[0]), Number(c[1]), Number(c[2])];
  if (typeof c === "string" && c.startsWith("#") && c.length === 7) {
    return [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
  }
  return COLOR_TABLE[node.materialMode ?? "soft-alpha"] ?? [1, 1, 1];
}

/** Lower one scene node; `seed` overrides hashing (benchmark scenes pin it). */
export function lowerEffectNode(node: EffectNodeLike, seedOverride?: number): LoweredEffect {
  const nodeId = node.id ?? node.name ?? `effect-${node.effect ?? "none"}`;
  const effect = node.effect ?? "particles";
  const position = node.position ?? [0, 0, 0];

  switch (effect) {
    case "particles": {
      const materialMode = node.materialMode ?? "soft-alpha";
      const additive = ADDITIVE_MODES.has(materialMode);
      const blend: Blend = node.blend && VALID_BLENDS.has(node.blend) ? (node.blend as Blend) : additive ? "additive" : "alpha";
      const count = Math.max(1, Math.min(200000, Math.round(node.maxParticles ?? node.particleCount ?? 200)));
      const speedScalar = typeof node.speed === "number" ? node.speed : node.emitter === "fountain" ? 3 : 1;
      const speedRange = asRange(node.speed) ?? [speedScalar * 0.7, speedScalar];
      return {
        type: "emitter",
        nodeId,
        effect,
        consumer: "particle-pass",
        sim: "cpu",
        batch: {
          blend,
          shading: "unlit",
          softDepth: node.softDistance !== undefined ? true : materialMode !== "spark",
          ...(node.softDistance !== undefined ? { softDistance: node.softDistance } : {}),
          ...(node.nearFade !== undefined ? { nearFade: node.nearFade } : {}),
          stretch: materialMode === "spark",
          frameBlend: false,
          atlasKey: "soft-dot"
        },
        emitter: {
          // §6.2.2 material key — identical blend/atlas/flags merge into one
          // instanced draw in ProductionEffectSystem.feed.
          key: `eff.${blend}.soft-dot.${materialMode !== "spark"}.${materialMode === "spark"}.0`,
          nodeId,
          origin: position,
          capacity: count,
          emissionRate: node.rate ?? node.emissionRate ?? count / 2.5,
          life: asRange(node.lifetime) ?? [1.2, 2.4],
          speed: speedRange,
          spread: node.spread ?? (node.emitter === "ambient" ? 1 : node.emitter === "swirl" ? 0.35 : 0.18),
          direction: node.direction ?? (node.emitter === "ambient" ? [0.15, 0.4, 0.1] : [0, 1, 0]),
          gravity: typeof node.gravity === "number" ? node.gravity : Array.isArray(node.gravity) ? node.gravity[1] ?? 0 : additive ? -1.2 : -0.6,
          size: asRange(node.size) ?? (node.emitter === "ambient" ? [0.04, 0.1] : [0.05, 0.14]),
          color: nodeColor(node),
          alpha: materialMode === "smoke" ? 0.35 : 0.85,
          spin: node.emitter === "swirl" ? 2.4 : 0.6,
          stretch: materialMode === "spark" ? 0.02 : 0,
          drag: node.drag ?? 0.12,
          seed: seedOverride ?? (node.seed ?? hashSeed(nodeId)),
          ...(node.prewarm !== undefined ? { prewarm: node.prewarm } : {})
        }
      };
    }
    case "rain":
    case "snow": {
      const isRain = effect === "rain";
      const count = Math.max(1, Math.min(20000, Math.round(node.particleCount ?? (isRain ? 3000 : 1500))));
      const wind = node.wind ?? [0, 0, 0];
      return {
        type: "emitter",
        nodeId,
        effect,
        consumer: "particle-pass",
        sim: "cpu",
        batch: {
          blend: "alpha",
          shading: "unlit",
          softDepth: true,
          stretch: isRain,
          frameBlend: false,
          atlasKey: isRain ? "streak" : "soft-dot"
        },
        emitter: {
          key: `eff.alpha.${isRain ? "streak" : "soft-dot"}.1.${isRain}.0`,
          nodeId,
          origin: position,
          capacity: count,
          emissionRate: node.emissionRate ?? count / 3,
          life: isRain ? [0.6, 1.0] : [4, 8],
          speed: isRain ? [18, 24] : [0.8, 1.6],
          spread: 0.06,
          direction: [wind[0] * 0.15 - 0.02, -1, wind[2] * 0.15],
          gravity: isRain ? -9.8 : -0.5,
          size: isRain ? [0.02, 0.035] : [0.06, 0.14],
          color: nodeColor(node),
          alpha: isRain ? 0.5 : 0.9,
          spin: isRain ? 0 : 0.8,
          stretch: isRain ? 0.028 : 0,
          drag: isRain ? 0 : 0.6,
          seed: seedOverride ?? (node.seed ?? hashSeed(nodeId))
        }
      };
    }
    case "flipbook-sprite": {
      const count = Math.max(1, Math.min(64, Math.round(node.particleCount ?? 1)));
      return {
        type: "emitter",
        nodeId,
        effect,
        consumer: "particle-pass",
        sim: "cpu",
        batch: {
          blend: "alpha",
          shading: "unlit",
          softDepth: false,
          stretch: false,
          frameBlend: true,
          atlasKey: `flipbook.${node.spriteColumns ?? 8}x${node.spriteRows ?? 8}`
        },
        emitter: {
          key: `eff.alpha.flipbook.${node.spriteColumns ?? 8}x${node.spriteRows ?? 8}.0.0.1`,
          nodeId,
          origin: position,
          capacity: count,
          emissionRate: node.emissionRate ?? 2,
          life: [1, 1.5],
          speed: [0, 0.1],
          spread: 0,
          direction: [0, 1, 0],
          gravity: 0,
          size: [1, 1],
          color: nodeColor(node),
          alpha: 1,
          spin: 0,
          stretch: 0,
          drag: 0,
          seed: seedOverride ?? (node.seed ?? hashSeed(nodeId))
        }
      };
    }
    case "light-beam":
      return { type: "beam", nodeId, effect, consumer: "beam-pass", sim: "procedural" };
    case "fog":
    case "volumetric-fog":
      return { type: "other", nodeId, effect, consumer: "scene-fog", sim: "none" };
    case "bloom":
    case "ambient-occlusion":
    case "contact-occlusion":
    case "color-grade":
    case "anti-alias":
    case "outline":
    case "screen-space-reflections":
    case "depth-of-field":
    case "motion-blur":
      return { type: "other", nodeId, effect, consumer: "post", sim: "none" };
    default:
      return { type: "other", nodeId, effect, consumer: "none", sim: "none" };
  }
}
