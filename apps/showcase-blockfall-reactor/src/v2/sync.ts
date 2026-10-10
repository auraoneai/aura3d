// Node/HUD sync family — extracted from boot.ts for 14-LOC. Functions moved
// verbatim; they share `ctx` plus the deps below.
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import type { Game } from "@aura3d/game";
import {
  ACTIVE_FOCUS_NODE_ID, BEAT_NODE_IDS, CLEAR_WAVE_NODE_ID, DROP_GUIDE_NODE_ID,
  HIDDEN_BLOCK_SCALE, BLOCK_SCALE, ACTIVE_BLOCK_SCALE, GHOST_BLOCK_SCALE,
  cellPosition, clearFlashNodeId, ghostNodeId, pieceMaterials
} from "../gameplay/reactor-scene";
import {
  LOCKED_POOL_CAPACITY_PER_KIND, boardViewMatchesState, createBoardViewModel,
  formatLevelDigits, formatScoreDigits, scoreDigitNodeId, levelDigitNodeId,
  type BoardViewModel
} from "../gameplay/board-view";
import { ghostPiece, pieceCells, visibleLockedCells, HIDDEN_ROWS, VISIBLE_HEIGHT,
  type BlockfallState, type PieceKind } from "../gameplay/rules";
import type { createClearFx } from "../legacy/clear-fx";
import type { createCameraFeel } from "../legacy/camera-feel";
import type { wireBlockfallFx } from "./scene/fx";
import type { blockfallWorldNodes } from "./scene/world";
import type { BlockfallCtx } from "./state";

type NodeHandle = AuraRuntimeNodeHandle | null;

export function wireBlockfallSync(ctx: BlockfallCtx, deps: {
  handle(name: string): NodeHandle;
  game: Game;
  fx: ReturnType<typeof wireBlockfallFx>;
  clearFx: ReturnType<typeof createClearFx>;
  cameraFeel: ReturnType<typeof createCameraFeel>;
  ghostHandles: readonly string[];
  clearFlashIds: readonly string[];
  world: ReturnType<typeof blockfallWorldNodes>;
}) {
  const { handle, game, fx, clearFx, cameraFeel, world, ghostHandles, clearFlashIds } = deps;
  function isDangerState(nextState: BlockfallState): boolean {
    return visibleLockedCells(nextState).some((cell) => cell.y <= 4);
  }
  
  
  function stackHeight(s: BlockfallState): number {
    const cells = visibleLockedCells(s);
    if (cells.length === 0) return 0;
    const minY = Math.min(...cells.map((cell) => cell.y));
    return VISIBLE_HEIGHT - minY;
  }
  
  function syncInstancedPools(view: BoardViewModel): void {
    world.lockedPools.forEach((pool, poolIndex) => {
      const kind = ["I", "J", "L", "O", "S", "T", "Z"][poolIndex] as PieceKind;
      const cells = view.lockedByKind[kind];
      for (let index = 0; index < pool.transforms.length; index += 1) {
        const spec = pool.transforms[index];
        const cell = cells[index];
        if (!cell) {
          spec.position = [0, -50, 0];
          spec.scale = [HIDDEN_BLOCK_SCALE[0], HIDDEN_BLOCK_SCALE[1], HIDDEN_BLOCK_SCALE[2]];
          continue;
        }
        spec.position = [cell.position[0], cell.position[1], cell.position[2]];
        spec.scale = [BLOCK_SCALE[0], BLOCK_SCALE[1], BLOCK_SCALE[2]];
      }
    });
    const activeKind = ctx.state.active && !ctx.state.gameOver ? ctx.state.active.kind : null;
    const activeNode = handle("blockfall-active-instanced");
    if (activeKind && activeKind !== ctx.lastActivePoolKind) {
      ctx.lastActivePoolKind = activeKind;
      (activeNode as { setMaterial?(m: unknown): void } | null)?.setMaterial?.(pieceMaterials[activeKind]);
    }
    if (!activeKind) {
      ctx.lastActivePoolKind = null;
      activeNode?.setVisible(false);
    } else {
      activeNode?.setVisible(true);
    }
    for (let index = 0; index < world.activePool.transforms.length; index += 1) {
      const spec = world.activePool.transforms[index];
      const cell = view.active[index];
      if (!cell || !activeKind) {
        spec.position = [0, -50, 0];
        spec.scale = [HIDDEN_BLOCK_SCALE[0], HIDDEN_BLOCK_SCALE[1], HIDDEN_BLOCK_SCALE[2]];
        continue;
      }
      spec.position = [cell.position[0], cell.position[1], cell.position[2]];
      spec.scale = [ACTIVE_BLOCK_SCALE[0], ACTIVE_BLOCK_SCALE[1], ACTIVE_BLOCK_SCALE[2]];
    }
  }
  
  function syncGhostAndGuide(): void {
    const ghost = ghostPiece(ctx.state);
    const activeCells = ctx.state.active ? pieceCells(ctx.state.active) : [];
    const activeKey = activeCells.map((cell) => `${cell.x}:${cell.y}`).join("|");
    const ghostCells = ghost && !ctx.state.gameOver ? pieceCells(ghost) : [];
    const guide = handle(DROP_GUIDE_NODE_ID);
    if (ghostCells.map((cell) => `${cell.x}:${cell.y}`).join("|") === activeKey) {
      for (const id of ghostHandles) handle(id)?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
      guide?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
    } else {
      ghostHandles.forEach((id: string, index: number) => {
        const cell = ghostCells[index];
        const visibleY = cell ? cell.y - HIDDEN_ROWS : -1;
        const node = handle(id);
        if (!cell || visibleY < 0 || visibleY >= VISIBLE_HEIGHT) {
          node?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
          return;
        }
        const position = cellPosition(cell.x, visibleY, 0.06);
        node?.setPosition(position[0], position[1], position[2]).setScale([...GHOST_BLOCK_SCALE]).setVisible(true);
      });
      // Slim beam between the active silhouette's bottom and the ghost's top.
      const activeVisible = activeCells
        .map((cell) => ({ x: cell.x, visibleY: cell.y - HIDDEN_ROWS }))
        .filter((cell) => cell.visibleY >= 0 && cell.visibleY < VISIBLE_HEIGHT);
      const ghostVisible = ghostCells
        .map((cell) => ({ x: cell.x, visibleY: cell.y - HIDDEN_ROWS }))
        .filter((cell) => cell.visibleY >= 0 && cell.visibleY < VISIBLE_HEIGHT);
      if (activeVisible.length === 0 || ghostVisible.length === 0 || !guide) return;
      const beamX = cellPosition(ghostVisible.reduce((sum, cell) => sum + cell.x, 0) / ghostVisible.length, 0, 0)[0];
      const activeY = Math.max(...activeVisible.map((cell) => cell.visibleY));
      const ghostY = Math.min(...ghostVisible.map((cell) => cell.visibleY));
      if (ghostY <= activeY) {
        guide.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
        return;
      }
      const activePositionY = cellPosition(0, activeY, 0)[1];
      const ghostPositionY = cellPosition(0, ghostY, 0)[1];
      const span = Math.max(0.08, activePositionY - ghostPositionY);
      guide
        .setPosition(beamX, ghostPositionY + span * 0.5, 0.075)
        .setScale([0.014, span * 0.5, 0.018])
        .setVisible(true);
    }
  }
  
  function syncActiveFocus(): void {
    const focus = handle(ACTIVE_FOCUS_NODE_ID);
    const piece = ctx.state.gameOver ? null : ctx.state.active;
    if (!piece || !focus) {
      focus?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
      return;
    }
    const visible = pieceCells(piece)
      .map((cell) => ({ x: cell.x, visibleY: cell.y - HIDDEN_ROWS }))
      .filter((cell) => cell.visibleY > 0 && cell.visibleY < VISIBLE_HEIGHT);
    if (visible.length === 0) {
      focus.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
      return;
    }
    const averageX = visible.reduce((sum, cell) => sum + cell.x, 0) / visible.length;
    const averageY = visible.reduce((sum, cell) => sum + cell.visibleY, 0) / visible.length;
    const position = cellPosition(averageX, averageY, 0.112);
    const pulse = 0.92 + Math.sin(ctx.state.frame * 0.16) * 0.08;
    focus
      .setPosition(position[0], position[1], position[2])
      .setScale([0.34 * pulse, 0.16 * pulse, 0.045])
      .setVisible(true);
  }
  
  function syncClearFlash(): void {
    // Timed renderer beat: the row stays lit for clearBeatDuration after the
    // observed clear so capture shots keep visible feedback.
    for (let row = 0; row < VISIBLE_HEIGHT; row += 1) {
      const node = handle(clearFlashIds[row]);
      if (ctx.clearBeatTimer <= 0 || !ctx.clearedRowsThisBeat.includes(row)) {
        node?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
        continue;
      }
      const position = cellPosition(0, row, 0.17);
      const width = CELL_BOARD_WIDTH_HALF;
      node
        ?.setPosition(position[0], position[1], position[2])
        .setScale([width, 0.085, 0.02])
        .setVisible(true);
    }
  }
  const CELL_BOARD_WIDTH_HALF = 1.39; // half of 10 × CELL(0.278)
  
  function syncBeats(dt: number): void {
    ctx.beatTimers.levelUp = Math.max(0, ctx.beatTimers.levelUp - dt);
    ctx.beatTimers.reset = Math.max(0, ctx.beatTimers.reset - dt);
    ctx.beatTimers.burst = Math.max(0, ctx.beatTimers.burst - dt);
    ctx.clearBeatTimer = Math.max(0, ctx.clearBeatTimer - dt);
  
    const levelUpNode = handle(BEAT_NODE_IDS.levelUp);
    const levelUpProgress = ctx.beatTimers.levelUp / ctx.beatDurations.levelUp;
    if (levelUpProgress > 0) {
      levelUpNode?.setPosition(1.52, 2.66, 0.24).setScale([0.1 + levelUpProgress * 0.05, 0.035, 0.035]).setVisible(true);
    } else {
      levelUpNode?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
    }
  
    const gameOverNode = handle(BEAT_NODE_IDS.gameOver);
    if (isDangerState(ctx.state) || ctx.state.gameOver) {
      gameOverNode
        ?.setPosition(-1.52, 2, 0.2)
        .setScale(ctx.state.gameOver ? [0.085, 1.56, 0.055] : [0.045, 1.2, 0.045])
        .setVisible(true);
    } else {
      gameOverNode?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
    }
  
    const resetNode = handle(BEAT_NODE_IDS.reset);
    const resetProgress = ctx.beatTimers.reset / ctx.beatDurations.reset;
    if (resetProgress > 0) {
      resetNode?.setPosition(1.52, 1.34, 0.24).setScale([0.1 + resetProgress * 0.05, 0.035, 0.035]).setVisible(true);
    } else {
      resetNode?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
    }
  
    const waveNode = handle(CLEAR_WAVE_NODE_ID);
    const burstProgress = ctx.beatTimers.burst / ctx.beatDurations.burst;
    if (burstProgress > 0) {
      const waveProgress = 1 - burstProgress;
      const waveWidth = ctx.lastClearSize >= 4 ? 1.22 : 0.72;
      waveNode
        ?.setPosition(0, ctx.burstRowY, 0.232)
        .setScale([waveWidth + waveProgress * 1.52, 0.22 + waveProgress * 0.08, 0.038])
        .setVisible(true);
    } else {
      waveNode?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
    }
  }
  
  function syncReactor(): void {
    const charge = Math.max(0.04, ctx.state.reactor / 100);
    const height = 0.18 + charge * 1.25;
    handle("blockfall-reactor-fill")
      ?.setScale([0.08, height, 0.08])
      .setPosition(1.52, 1.32 + height * 0.5, 0.2)
      .setVisible(true);
    const critical = ctx.state.gameOver || isDangerState(ctx.state) || ctx.state.reactor >= 88 || ctx.state.reactorLevel > 0;
    handle("blockfall-reactor-cap")
      ?.setScale(critical ? [0.12, 0.06, 0.055] : [...HIDDEN_BLOCK_SCALE])
      .setVisible(critical);
  }
  
  function syncScoreboard(): void {
    const scoreText = formatScoreDigits(ctx.state.score);
    for (let slot = 0; slot < 6; slot += 1) {
      const shown = Number(scoreText[slot]);
      for (let digit = 0; digit <= 9; digit += 1) {
        handle(scoreDigitNodeId(slot, digit))?.setVisible(digit === shown);
      }
    }
    const levelText = formatLevelDigits(ctx.state.level);
    for (let slot = 0; slot < 2; slot += 1) {
      const shown = Number(levelText[slot]);
      for (let digit = 0; digit <= 9; digit += 1) {
        handle(levelDigitNodeId(slot, digit))?.setVisible(digit === shown);
      }
    }
  }
  
  // Dirty-checked HUD: one write only when a value actually changes.
  function syncHud(): void {
    const hud = {
      score: ctx.state.score,
      lines: ctx.state.lines,
      level: ctx.state.level,
      reactor: ctx.state.reactor,
      hold: ctx.state.hold ?? "—",
      next: ctx.state.queue.slice(0, 3).join(" "),
      mode: ctx.state.gameOver ? "GAME OVER" : ctx.replayActive ? "REPLAY" : ctx.state.paused ? "PAUSED" : "RUNNING"
    };
    const key = JSON.stringify(hud);
    if (key === ctx.lastHudKey) return;
    ctx.lastHudKey = key;
    game.hud.set("score", String(hud.score));
    game.hud.set("lines", String(hud.lines));
    game.hud.set("level", String(hud.level));
    game.hud.set("reactor", `${hud.reactor}%`);
    game.hud.set("hold", String(hud.hold));
    game.hud.set("next", hud.next);
    game.hud.set("mode", hud.mode);
  }

  return { isDangerState, stackHeight, syncInstancedPools, syncGhostAndGuide, syncActiveFocus, syncClearFlash, syncBeats, syncReactor, syncScoreboard, syncHud };
}
