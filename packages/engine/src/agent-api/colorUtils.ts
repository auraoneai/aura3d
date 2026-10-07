// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor } from "./nodes/types.js";
import { clampNumber } from "./compiler/observations.js";
import { srgbToLinearChannel } from "@aura3d/rendering";
import { round } from "./GameRuntime.js";

export function multiplyRgb(
  color: readonly [number, number, number],
  tint: readonly [number, number, number]
): readonly [number, number, number] {
  return [color[0] * tint[0], color[1] * tint[1], color[2] * tint[2]];
}

export function colorToRgba(color: AuraColor): readonly [number, number, number, number] {
  const [r, g, b, a] = colorToClearColor(color);
  return [r, g, b, a];
}

export function colorToClearColor(color: AuraColor): readonly [number, number, number, number] {
  if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) {
    const value = Number.parseInt(color.slice(1), 16);
    return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255, 1];
  }
  return [0.02, 0.025, 0.035, 1];
}

function colorToLinearClearColor(color: AuraColor): readonly [number, number, number, number] {
  const [red, green, blue, alpha] = colorToClearColor(color);
  return [srgbToLinearChannel(red), srgbToLinearChannel(green), srgbToLinearChannel(blue), alpha];
}

export function colorToLinearRgba(color: AuraColor): readonly [number, number, number, number] {
  return colorToLinearClearColor(color);
}

export function colorToAcesInputClearColor(color: AuraColor): readonly [number, number, number, number] {
  const [red, green, blue, alpha] = colorToLinearClearColor(color);
  const fitted = multiplyMat3Vec3([
    0.6430382486, 0.3111867518, 0.0457754574,
    0.0592686904, 0.9314364869, 0.0092949157,
    0.0059619013, 0.0639290157, 0.9301183842
  ], [red, green, blue]).map(inverseAcesFit) as [number, number, number];
  const input = multiplyMat3Vec3([
    1.7647409720, -0.6757776782, -0.0889632938,
    -0.1470278520, 1.1602515117, -0.0132236597,
    -0.0363368301, -0.1624364369, 1.1987732670
  ], fitted);
  // The renderer's fitted ACES shoulder is effectively linear only above the
  // toe. Preserve very dark authored display colors through that toe while
  // leaving mid/high display colors at the full inverse-transform energy.
  const displayPeak = Math.max(red, green, blue);
  const toeCompensation = 0.6 + 0.06 * smoothstepNumber(0.08, 0.55, displayPeak);
  return [Math.max(0, input[0] * toeCompensation), Math.max(0, input[1] * toeCompensation), Math.max(0, input[2] * toeCompensation), alpha];
}

function smoothstepNumber(edge0: number, edge1: number, value: number): number {
  const t = clampNumber((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function inverseAcesFit(target: number): number {
  const a = target * 0.983729 - 1;
  const b = target * 0.432951 - 0.0245786;
  const c = target * 0.238081 + 0.000090537;
  const discriminant = Math.max(0, b * b - 4 * a * c);
  const first = (-b + Math.sqrt(discriminant)) / (2 * a);
  const second = (-b - Math.sqrt(discriminant)) / (2 * a);
  return Math.max(0, first, second);
}

function multiplyMat3Vec3(matrix: readonly number[], vector: readonly [number, number, number]): [number, number, number] {
  return [
    matrix[0]! * vector[0] + matrix[1]! * vector[1] + matrix[2]! * vector[2],
    matrix[3]! * vector[0] + matrix[4]! * vector[1] + matrix[5]! * vector[2],
    matrix[6]! * vector[0] + matrix[7]! * vector[1] + matrix[8]! * vector[2]
  ];
}

export function colorToLinearRgb(color: AuraColor): readonly [number, number, number] {
  const [red, green, blue] = colorToLinearClearColor(color);
  return [red, green, blue];
}

export function colorWithAlpha(color: AuraColor, alpha: number): string {
  const [r, g, b] = colorToClearColor(color);
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${Math.min(1, Math.max(0, alpha))})`;
}
