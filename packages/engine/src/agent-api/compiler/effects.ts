// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraEffectNode, AuraSceneSnapshot, AuraFountainParticleLayer } from "../nodes/types.js";
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
