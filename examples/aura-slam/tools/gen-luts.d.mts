/** Types for the venue LUT generator (`gen-luts.mjs`). */
export interface VenueLutRecipe {
  readonly shadow: readonly [number, number, number];
  readonly highlight: readonly [number, number, number];
  readonly curve: number;
  readonly saturation: number;
  readonly lift: number;
}
export const LUT_SIZE: number;
export const VENUE_LUT_RECIPES: Readonly<Record<"hard" | "grass" | "clay" | "desert" | "beach" | "moon", VenueLutRecipe>>;
export function gradeColor(recipe: VenueLutRecipe, r: number, g: number, b: number): number[];
export function venueLutCube(venue: string, size?: number): string;
