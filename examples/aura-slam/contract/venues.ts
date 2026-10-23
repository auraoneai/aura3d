import type { Surface } from "./sim";

/** Surface restitution table, verbatim from physics.js. Every non-clay/grass venue plays as hard court under Earth gravity. */
export const SURFACE_PHYSICS: Readonly<Record<Surface, { readonly rebound: number; readonly retention: number }>> = {
  hard: { rebound: 0.65, retention: 0.79 },
  grass: { rebound: 0.59, retention: 0.86 },
  clay: { rebound: 0.7, retention: 0.72 },
};

export type VenueId = "hard" | "grass" | "clay" | "desert" | "beach" | "moon";

export interface VenueSpec {
  readonly id: VenueId;
  readonly name: string;
  readonly surface: Surface;
  /** Destination venues (desert/beach/moon) play as hard court; the flag only drives presentation (outfits, skybox, audio). */
  readonly destination: boolean;
  readonly particleColor: string;
}

/** Names and particle colours are read from game.js `venues`; module M-RENDER owns palettes. */
export const VENUES: readonly VenueSpec[] = [
  { id: "hard", name: "New York", surface: "hard", destination: false, particleColor: "#6cc8ff" },
  { id: "grass", name: "London", surface: "grass", destination: false, particleColor: "#a8c78e" },
  { id: "clay", name: "Paris", surface: "clay", destination: false, particleColor: "#e88d63" },
  { id: "desert", name: "Dubai Desert", surface: "hard", destination: true, particleColor: "#f2c08a" },
  { id: "beach", name: "Tropical Beach", surface: "hard", destination: true, particleColor: "#91e7de" },
  { id: "moon", name: "The Moon", surface: "hard", destination: true, particleColor: "#cedbff" },
];

/** Court line geometry in normalised units (physics.js COURT/LINE_BOUNDS source constants). */
export const COURT_LINES = Object.freeze({
  singlesX: 0.82, baselineY: 1, serviceY: 0.52, renderX: 5.5, renderY: 8,
  lineWidth: 0.055, baselineWidth: 0.075, ballRadius: 0.072,
} as const);

/** Rear sponsor boards that deflect loose balls (physics.js REAR_BOARDS; scene units). */
export interface BoardSpec { readonly x: number; readonly y: number; readonly halfWidth: number; readonly height: number; readonly angle: number }
export const REAR_BOARDS: readonly BoardSpec[] = [
  { x: -5.2, y: -9.3, halfWidth: 0.75, height: 0.96, angle: 0.16 },
  { x: 5.2, y: -9.3, halfWidth: 0.75, height: 0.96, angle: -0.16 },
  { x: 0, y: -10.8, halfWidth: 7.2, height: 0.765, angle: 0 },
];
