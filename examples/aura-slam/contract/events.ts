import type { Side } from "./sim";

/** Events emitted by the sim through `options.onEvent` (match-engine.js `emit`) and by ball physics (`advance`). */
export interface ContactPresentation { x: number; y: number; speedKph: number; verticalSpeed: number; venue: string; stroke?: string }
export type SimEvent =
  | { type: "hit"; args: unknown[]; contact: ContactPresentation }
  | { type: "bounce"; contact: ContactPresentation }
  | { type: "tone"; args: unknown[] }
  | { type: "pointSound"; won: boolean }
  | { type: "point"; winner: Side; call: string }
  | { type: "serve"; [k: string]: unknown }
  | { type: "selection"; [k: string]: unknown }
  | { type: "complete"; winner: Side };

/** Physics-level events produced by `advance` (physics.js `onEvent`). */
export type PhysicsEventType = "bounce" | "net" | "tape" | "board";

/** Compact record used by reference capture and replay tests: one entry per emitted event with its sim tick. */
export interface LoggedEvent { tick: number; type: SimEvent["type"] | PhysicsEventType; side?: Side; call?: string; winner?: Side }
