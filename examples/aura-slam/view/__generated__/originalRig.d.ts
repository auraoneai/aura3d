/** Types for the generated original rig factory (see tools/aura-slam/extractOriginalRig.mjs). */
export interface OriginalRigEnv {
  game: { racketSports(): unknown };
  material: { pbr(options: Record<string, unknown>): unknown };
  window: { TennisAppearance?: { resolve?: (appearance: unknown, role: "player" | "ai") => unknown } };
}
export interface OriginalRig {
  updateAthleteRig(
    rig: unknown,
    actor: unknown,
    pose: unknown,
    isPlayer: boolean,
    isMoon: boolean,
    appearanceKeyCache: { lastKey: string }
  ): void;
  COURT_X: number;
  COURT_Z: number;
  HIDDEN_SCALE: [number, number, number];
}
export function createOriginalRig(env: OriginalRigEnv): OriginalRig;
