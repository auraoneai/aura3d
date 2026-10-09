// Event wiring — extracted from boot.ts for 14-LOC.
import type { Game } from "@aura3d/game";
import { DEFAULT_SEED, HIDDEN_ROWS, VISIBLE_HEIGHT, pieceCells, type BlockfallState } from "../gameplay/rules";
import type { BlockfallAudioCue } from "../gameplay/blockfall-audio-manifest";
import type { createClearFx } from "../legacy/clear-fx";
import type { createCameraFeel } from "../legacy/camera-feel";
import { cellPosition } from "../gameplay/reactor-scene";
import type { wireBlockfallFx } from "./scene/fx";
import { dasRepeat } from "./input";
import type { BlockfallCtx } from "./state";
import type { GameInputController } from "@aura3d/engine";

export function wireBlockfallFlow(ctx: BlockfallCtx, deps: {
  game: Game;
  pushCue(cue: BlockfallAudioCue): void;
  fx: ReturnType<typeof wireBlockfallFx>;
  clearFx: ReturnType<typeof createClearFx>;
  cameraFeel: ReturnType<typeof createCameraFeel>;
  input: GameInputController;
  audio: { applyMusicLevel(level: number): void };
  queue(actions: unknown[]): void;
}) {
  const { game, pushCue, fx, clearFx, cameraFeel, input, audio } = deps;
  function observeEvents(prev: BlockfallState, next: BlockfallState): void {
    // Locks: piecesPlaced increments through the real kit path.
    if (next.piecesPlaced > prev.piecesPlaced) {
      pushCue("lock");
      const cells = pieceCells(prev.active ?? next.active!);
      if (cells.length > 0) {
        const cx = cells.reduce((sum: number, cell: { x: number; y: number }) => sum + cell.x, 0) / cells.length;
        const cy = cells.reduce((sum: number, cell: { x: number; y: number }) => sum + cell.y, 0) / cells.length;
        const position = cellPosition(cx, Math.max(0, cy - HIDDEN_ROWS), 0);
        fx.lockFlash(position[0], position[1]);
      }
      if (next.lastMove === "hard-drop") {
        const active = next.active ?? prev.active;
        if (active) {
          const position = cellPosition(active.x + 0.5, 8, 0);
          fx.hardDropTrail(position[0], position[1] + 1.4, position[1]);
        }
      }
    }
    if (next.lastClearedLines > 0) {
      ctx.linesClearedThisRound += next.lastClearedLines;
      ctx.lastClearSize = next.lastClearedLines;
      const rows = next.lastClearedRows.map((row) => row - HIDDEN_ROWS).filter((row) => row >= 0 && row < VISIBLE_HEIGHT);
      ctx.clearedRowsThisBeat = rows;
      if (rows.length > 0) {
        const averageRow = rows.reduce((sum, row) => sum + row, 0) / rows.length;
        ctx.burstRowY = cellPosition(0, averageRow, 0)[1];
      }
      ctx.beatTimers.burst = ctx.beatDurations.burst;
      ctx.clearBeatTimer = ctx.clearBeatDuration;
      pushCue(next.lastClearedLines >= 4 ? "quad" : "line-clear");
      clearFx.burst(rows, next.lastClearedLines);
      fx.clearBurst(ctx.burstRowY, next.lastClearedLines);
      if (next.lastClearedLines >= 4) cameraFeel.punch(1.6, "quad");
    }
    if (!prev.gameOver && next.gameOver) {
      pushCue("game-over");
      fx.gameOverAccent();
    }
    if (next.level > prev.level) {
      ctx.beatTimers.levelUp = ctx.beatDurations.levelUp;
      pushCue("level-up");
      audio.applyMusicLevel(next.level);
      fx.levelUpFlare();
      cameraFeel.punch(1.1, "level-up");
      ctx.linesClearedThisRound = 0;
    }
    if (next.lastMove === "reset" && prev.frame !== next.frame) {
      ctx.beatTimers.reset = ctx.beatDurations.reset;
      ctx.linesClearedThisRound = 0;
    }
  }
  
  function collectInputActions(dt: number): void {
    if (input.pressed("reset")) ctx.queuedActions.push({ type: "reset", seed: DEFAULT_SEED });
    else if (input.pressed("pause")) ctx.queuedActions.push({ type: "pause" });
    else {
      if (input.pressed("hold")) ctx.queuedActions.push({ type: "hold" });
      if (dasRepeat(ctx, "left", dt, input.pressed("left"), input.held("left"))) ctx.queuedActions.push({ type: "move", dx: -1 });
      if (dasRepeat(ctx, "right", dt, input.pressed("right"), input.held("right"))) ctx.queuedActions.push({ type: "move", dx: 1 });
      if (input.pressed("rotateCW")) ctx.queuedActions.push({ type: "rotate", direction: 1 });
      if (input.pressed("rotateCCW")) ctx.queuedActions.push({ type: "rotate", direction: -1 });
      if (dasRepeat(ctx, "soft", dt, input.pressed("softDrop"), input.held("softDrop"))) ctx.queuedActions.push({ type: "softDrop" });
      if (input.pressed("hardDrop")) ctx.queuedActions.push({ type: "hardDrop" });
    }
  }

  return { observeEvents, collectInputActions };
}
