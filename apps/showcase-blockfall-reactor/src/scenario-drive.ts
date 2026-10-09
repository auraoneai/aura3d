/**
 * scenario-drive.ts — gameplay-only surface the `src/scenarios/` modules use.
 * Bound once from `main.ts`; scenario files never reach for route internals
 * directly. Replaces the deleted __AURA3D_BLOCKFALL_{ACCEPTANCE,ATTRACT,
 * BLOOM,COMPOSITION}_PROBE__ window globals (PRD-09).
 */
export type BlockfallAcceptanceScenario =
  "play" | "single-clear" | "quad" | "level-up" | "danger" | "game-over";

export interface BlockfallDrive {
  /** Runs the exact acceptance staging on the live kit, then freezes the app. */
  applyAcceptance(scenario: BlockfallAcceptanceScenario): unknown;
  /** Restages "play" and resumes the app (was ACCEPTANCE_PROBE.resume). */
  resumeFromAcceptance(): unknown;
  /** Clears the acceptance freeze without restaging. */
  unfreezeAcceptance(): void;
  /** Boxes the active piece in so the next rotate press is refused. */
  stageRotationTrap(): boolean;
  enterAttract(reason?: string): void;
  exitAttract(reason?: string): void;
  attractActive(): boolean;
}

let active: BlockfallDrive | undefined;

export function bindBlockfallDrive(impl: BlockfallDrive): void {
  active = impl;
}

export function blockfallDrive(): BlockfallDrive {
  if (active === undefined) {
    throw new Error("Blockfall scenario drive is not bound yet — call createGame first.");
  }
  return active;
}
