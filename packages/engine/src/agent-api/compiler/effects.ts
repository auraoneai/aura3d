// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraEffectNode, AuraSceneSnapshot, AuraFountainParticleLayer } from "../nodes/types.js";
import { registerOptionCoverage } from "../../contracts/compiler.js";
import { groups } from "../nodes/groups.js";
import { seededRange } from "../sceneMath.js";

export function getParticleLife(seedIndex: number, seconds: number, emitter: AuraEffectNode["emitter"]): number {
  if (emitter !== "fountain") return (seededRange(seedIndex, 181, 0, 1) + seconds * 0.18) % 1;
  const phase = seededRange(seedIndex, 181, 0, 1);
  const jet = seededRange(seedIndex, 199, 0.42, 1);
  return (phase + seconds * 0.34 * jet) % 1;
}

export function writeParticlePosition(
  positions: Float32Array,
  index: number,
  seconds: number,
  emitter: AuraEffectNode["emitter"],
  radius: number,
  height: number,
  seedIndex = index,
  turbulence = 0,
  gravity = 0,
  groundCollision = false,
  fountainLayer: AuraFountainParticleLayer = "plume"
): void {
  const angleSeed = seededRange(seedIndex, 191, 0, 1);
  const angle = angleSeed * Math.PI * 2 + seconds * (emitter === "swirl" ? 1.45 : 0.14);
  const radial = radius * (0.18 + seededRange(seedIndex, 193, 0, 0.82));
  let x = Math.cos(angle) * radial;
  let y = seededRange(seedIndex, 197, 0.08, height);
  let z = Math.sin(angle) * radial;
  if (emitter === "fountain") {
    const rise = getParticleLife(seedIndex, seconds, emitter);
    const arc = Math.sin(rise * Math.PI);
    const shell = seededRange(seedIndex, 203, 0.82, 1.08);
    const side = seededRange(seedIndex, 271, 0, 1) < 0.5 ? -1 : 1;
    if (fountainLayer === "splash") {
      const theta = seedIndex * 2.07 + rise * Math.PI * 1.35 + seconds * 0.18;
      const outward = radius * (0.34 + rise * 0.66) * shell;
      x = Math.cos(theta) * outward;
      z = Math.sin(theta) * outward;
      y = 0.08 + (seedIndex % 5) * 0.035 + Math.sin(rise * Math.PI) * height * 0.08;
    } else if (fountainLayer === "mist") {
      const theta = angleSeed * Math.PI * 2 + seconds * 0.08;
      const outward = radius * seededRange(seedIndex, 203, 0.32, 1.12);
      x = Math.cos(theta) * outward + side * arc * radius * 0.16;
      z = Math.sin(theta) * outward * 0.48 - rise * radius * 0.12;
      y = 0.16 + arc * height * 0.54 + seededRange(seedIndex, 207, -0.08, 0.16);
    } else {
      const vertical = Math.pow(rise, 0.78);
      const widthProfile = Math.sin(rise * Math.PI);
      const theta = seedIndex * 2.399963 + seconds * 0.08;
      const spread = radius * (0.1 + widthProfile * (0.55 + (seedIndex % 7) * 0.018)) * shell;
      x = Math.cos(theta) * spread;
      z = Math.sin(theta) * spread - widthProfile * radius * 0.18;
      y = 0.28 + vertical * height - Math.max(0, vertical - 0.92) ** 2 * gravity * 0.025;
    }
  } else if (emitter === "ambient") {
    x = seededRange(seedIndex, 211, -radius * 2, radius * 2);
    y = seededRange(seedIndex, 223, 0.08, height);
    z = seededRange(seedIndex, 227, -radius * 1.4, radius * 1.4);
  }
  if (turbulence > 0) {
    const turbulencePhase = seconds * (0.8 + seededRange(seedIndex, 229, 0, 1.7)) + angleSeed * Math.PI * 2;
    x += Math.sin(turbulencePhase) * turbulence * radius * 0.12;
    z += Math.cos(turbulencePhase * 0.83) * turbulence * radius * 0.12;
    y += Math.sin(turbulencePhase * 1.23) * turbulence * height * 0.035;
  }
  if (groundCollision && y < 0.035) y = 0.035 + seededRange(seedIndex, 233, 0, 0.035);
  positions[index * 3] = x;
  positions[index * 3 + 1] = y;
  positions[index * 3 + 2] = z;
}

export function collectRuntimeEffectNodes(snapshot: AuraSceneSnapshot): AuraEffectNode[] {
  return groups.flatten(snapshot.nodes).filter((node): node is AuraEffectNode => node.kind === "effect");
}

export function hasRuntimePostProcessEffects(effectNodes: readonly AuraEffectNode[]): boolean {
  return effectNodes.some((node) => node.effect === "bloom" || node.effect === "ambient-occlusion" || node.effect === "contact-occlusion"
    || node.effect === "color-grade" || node.effect === "anti-alias" || node.effect === "outline"
    || node.effect === "screen-space-reflections" || node.effect === "depth-of-field" || node.effect === "motion-blur");
}

// PRD-07 P1-T15 — option-coverage rows for the prd07 surface (C-37).
// Each row declares a builder field and two probe values; the coverage test in
// tests/unit/contracts asserts every field appears in the compiled map.
export function registerPrd07OptionCoverage(): void {
  registerOptionCoverage([
    { builder: "effect", field: "effect", probeValueA: "particles", probeValueB: "rain", ownerPrd: 7 },
    { builder: "effect", field: "materialMode", probeValueA: "additive-glow", probeValueB: "smoke", ownerPrd: 7 },
    { builder: "effect", field: "particleCount", probeValueA: 64, probeValueB: 2000, ownerPrd: 7 },
    { builder: "effect", field: "emitter", probeValueA: "fountain", probeValueB: "swirl", ownerPrd: 7 },
    { builder: "effect", field: "emissionRate", probeValueA: 20, probeValueB: 600, ownerPrd: 7 },
    { builder: "effect", field: "gravity", probeValueA: -9.8, probeValueB: 0, ownerPrd: 7 },
    { builder: "effect", field: "turbulence", probeValueA: 0, probeValueB: 0.7, ownerPrd: 7 },
    { builder: "effect", field: "speed", probeValueA: 1, probeValueB: 20, ownerPrd: 7 },
    { builder: "effect", field: "spriteColumns", probeValueA: 1, probeValueB: 6, ownerPrd: 7 },
    { builder: "effect", field: "frameRate", probeValueA: 0, probeValueB: 12, ownerPrd: 7 },
    { builder: "atmosphere.fog", field: "mode", probeValueA: "exp2", probeValueB: "height", ownerPrd: 7 },
    { builder: "atmosphere.fog", field: "heightDensity", probeValueA: 0, probeValueB: 0.04, ownerPrd: 7 },
    { builder: "atmosphere.fog", field: "heightFalloff", probeValueA: 1, probeValueB: 0.1, ownerPrd: 7 },
    { builder: "atmosphere.fog", field: "maxOpacity", probeValueA: 0.5, probeValueB: 0.95, ownerPrd: 7 },
    { builder: "atmosphere.fog", field: "sunInscatter", probeValueA: 0, probeValueB: 0.6, ownerPrd: 7 },
    { builder: "atmosphere.setSky", field: "model", probeValueA: "preetham", probeValueB: "gradient", ownerPrd: 7 },
    { builder: "atmosphere.setWetness", field: "value", probeValueA: 0, probeValueB: 1, ownerPrd: 7 },
    { builder: "effects.spawn", field: "effect", probeValueA: "burst", probeValueB: "trail", ownerPrd: 7 },
    { builder: "effects.burst", field: "kind", probeValueA: "spark", probeValueB: "dust", ownerPrd: 7 },
    { builder: "sky", field: "spec", probeValueA: { model: "gradient" }, probeValueB: { model: "preetham" }, ownerPrd: 7 },
    { builder: "sky", field: "captureEnvironment", probeValueA: false, probeValueB: true, ownerPrd: 7 },
    // P2-T5 builder fields
    { builder: "effect.trail", field: "maxPoints", probeValueA: 48, probeValueB: 16, ownerPrd: 7 },
    { builder: "effect.trail", field: "minVertexDistance", probeValueA: 0.05, probeValueB: 0.2, ownerPrd: 7 },
    { builder: "effect.trail", field: "width", probeValueA: 0.3, probeValueB: 1.2, ownerPrd: 7 },
    { builder: "effect.trail", field: "orientation", probeValueA: "camera", probeValueB: "surface", ownerPrd: 7 },
    { builder: "effect.lightCone", field: "coneAngle", probeValueA: 0.35, probeValueB: 0.7, ownerPrd: 7 },
    { builder: "effect.lightCone", field: "length", probeValueA: 6, probeValueB: 20, ownerPrd: 7 },
    { builder: "effect.lightCone", field: "softness", probeValueA: 0.4, probeValueB: 0.9, ownerPrd: 7 },
    { builder: "effect.auroraRibbon", field: "segments", probeValueA: 96, probeValueB: 32, ownerPrd: 7 },
    { builder: "effect.auroraRibbon", field: "sway", probeValueA: 1, probeValueB: 3, ownerPrd: 7 },
    { builder: "effect.auroraRibbon", field: "shimmer", probeValueA: 0.6, probeValueB: 1.5, ownerPrd: 7 },
    { builder: "effect.meshParticles", field: "groundBounce", probeValueA: 0.35, probeValueB: 0.8, ownerPrd: 7 },
    { builder: "effect.meshParticles", field: "castShadow", probeValueA: false, probeValueB: true, ownerPrd: 7 },
    { builder: "effect.meshParticles", field: "spin", probeValueA: 1, probeValueB: 6, ownerPrd: 7 },
    { builder: "effect.fogVolume", field: "scatteringAnisotropy", probeValueA: 0.3, probeValueB: 0.8, ownerPrd: 7 },
    { builder: "effect.fogVolume", field: "heightFalloff", probeValueA: 0.5, probeValueB: 1, ownerPrd: 7 },
    { builder: "effect.fogVolume", field: "density", probeValueA: 0.25, probeValueB: 1.2, ownerPrd: 7 }
  ]);
}
