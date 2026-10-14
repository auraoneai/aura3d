// apps/showcase-blockfall-reactor/src/v2/scenarios/index.ts — ?scenario= URLs.
// Every scenario routes through the real game paths — queued BlockfallActions
// consumed by the same collectInputActions→advanceFrame pipeline the player
// uses — never by touching evidence or scene nodes directly (T2.5).
//   ?scenario=clear-line   — seeds the tall opening stack then force-clears
//                            the lowest row with scripted placements.
//   ?scenario=tall-stack   — opening stack + an immediately visible 4+-high
//                            tower (still a real board in the kit sense: cells
//                            arrive through normal locks).
//   ?scenario=replay       — runs the deterministic 60 s demonstration replay.
//   ?scenario=top-out      — replays a guaranteed top-out sequence.
import type { BlockfallAction, PieceKind } from "../../gameplay/rules";

export type BlockfallScenario = "clear-line" | "tall-stack" | "replay" | "top-out";

export function parseBlockfallScenario(name: string | null): BlockfallScenario | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (key === "clear-line" || key === "clearline") return "clear-line";
  if (key === "tall-stack" || key === "tallstack") return "tall-stack";
  if (key === "replay" || key === "autorun") return "replay";
  if (key === "top-out" || key === "topout" || key === "gameover") return "top-out";
  return null;
}

export interface BlockfallScenarioActions {
  /** Queue real actions into the per-frame input pipeline. */
  queue(actions: readonly BlockfallAction[]): void;
  /** Start the deterministic replay through the same action path. */
  startReplay(): void;
  /** Seed a pre-built board the way the reset path does (real kit board arg). */
  seedBoard(board: (PieceKind | null)[][]): void;
}

/**
 * Applies a scenario by feeding real actions/boards into the sim. A scripted
 * action burst is spread over consecutive frames inside updateGameplay, so the
 * path taken is identical to a fast player (and to the recorded replay).
 */
export function applyBlockfallScenario(name: BlockfallScenario, actions: BlockfallScenarioActions): void {
  switch (name) {
    case "replay":
      actions.startReplay();
      return;
    case "tall-stack": {
      // Column-0 tower through normal hard drops; each piece lands immediately.
      actions.queue([
        { type: "move", dx: -1 }, { type: "move", dx: -1 }, { type: "move", dx: -1 },
        { type: "move", dx: -1 }, { type: "hardDrop" },
        { type: "move", dx: -1 }, { type: "move", dx: -1 }, { type: "move", dx: -1 },
        { type: "move", dx: -1 }, { type: "hardDrop" },
        { type: "move", dx: -1 }, { type: "move", dx: -1 }, { type: "move", dx: -1 },
        { type: "move", dx: -1 }, { type: "hardDrop" }
      ]);
      return;
    }
    case "clear-line": {
      // Fill the gap in the seeded opening stack: park pieces on the right so
      // the next I or O piece drops into the low column and clears the row.
      actions.queue([
        { type: "move", dx: 1 }, { type: "move", dx: 1 }, { type: "move", dx: 1 },
        { type: "move", dx: 1 }, { type: "hardDrop" },
        { type: "move", dx: -1 }, { type: "move", dx: -1 }, { type: "move", dx: -1 },
        { type: "move", dx: -1 }, { type: "hardDrop" }
      ]);
      return;
    }
    case "top-out": {
      // Centre-column hard drops until the stack tops out through real locks.
      const burst: BlockfallAction[] = [];
      for (let index = 0; index < 11; index += 1) burst.push({ type: "hardDrop" });
      actions.queue(burst);
      return;
    }
  }
}
