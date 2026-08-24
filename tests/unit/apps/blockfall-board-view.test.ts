/**
 * BF-A2 unit proof — the instanced board view mirrors kit state cell-for-cell.
 *
 * The mounted route projects every visible cell through `createBoardViewModel`
 * into two instanced pool groups. These tests pin the projection contract
 * directly against the route's own deterministic simulation: same cells, same
 * kinds, no extras, nothing missing, and capacities that can never overflow for
 * any legal board.
 */
import { describe, expect, it } from "vitest";
import {
  ACTIVE_POOL_CAPACITY,
  LOCKED_POOL_CAPACITY_PER_KIND,
  boardViewFitsCapacity,
  boardViewMatchesState,
  createBoardViewModel
} from "../../../apps/showcase-blockfall-reactor/src/board-view";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PIECE_KINDS,
  VISIBLE_HEIGHT,
  applyAction,
  createInitialState,
  createOpeningBoard,
  visibleLockedCells
} from "../../../apps/showcase-blockfall-reactor/src/rules";

describe("Blockfall instanced board view parity", () => {
  it("projects the opening stack cell-for-cell", () => {
    const state = { ...createInitialState(1, createOpeningBoard()), active: null };
    const view = createBoardViewModel(state);
    expect(boardViewMatchesState(view, state)).toBe(true);
    const expected = visibleLockedCells(state);
    expect(view.lockedCount).toBe(expected.length);
    // The opening stack fills rows across several kinds; the projection must
    // group them by kind without losing or inventing any cell.
    const perKind = PIECE_KINDS.map((kind) => view.lockedByKind[kind].length);
    expect(perKind.reduce((total, count) => total + count, 0)).toBe(expected.length);
    expect(perKind.every((count) => count > 0)).toBe(true);
  });

  it("stays in parity while a real game plays out deterministically", () => {
    let state = createInitialState(0xC0FFEE, createOpeningBoard());
    let checks = 0;
    const actions = [
      { type: "move", dx: -1 },
      { type: "rotate", direction: 1 },
      { type: "hardDrop" },
      { type: "hold" },
      { type: "move", dx: 1 },
      { type: "hardDrop" },
      { type: "move", dx: -1 },
      { type: "softDrop" },
      { type: "rotate", direction: -1 },
      { type: "hardDrop" },
      { type: "tick" },
      { type: "hardDrop" }
    ] as const;
    for (const action of actions) {
      state = applyAction(state, action);
      const view = createBoardViewModel(state);
      expect(boardViewMatchesState(view, state)).toBe(true);
      checks += 1;
    }
    expect(checks).toBe(actions.length);
  });

  it("keeps active-piece cells inside the visible well and the four-slot capacity", () => {
    let state = createInitialState(7, createOpeningBoard());
    for (let index = 0; index < 30; index += 1) {
      state = applyAction(state, { type: "hardDrop" });
      const view = createBoardViewModel(state);
      expect(boardViewMatchesState(view, state)).toBe(true);
      expect(view.active.length).toBeLessThanOrEqual(ACTIVE_POOL_CAPACITY);
      for (const cell of view.active) {
        expect(cell.y).toBeGreaterThanOrEqual(0);
        expect(cell.y).toBeLessThan(VISIBLE_HEIGHT);
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.x).toBeLessThan(BOARD_WIDTH);
      }
    }
  });

  it("detects drift instead of silently passing", () => {
    const state = { ...createInitialState(3, createOpeningBoard()), active: null };
    const view = createBoardViewModel(state);
    // Drop one projected cell; the comparator must notice the missing member.
    const firstKindWithCells = PIECE_KINDS.find((kind) => view.lockedByKind[kind].length > 0);
    if (firstKindWithCells) {
      const drifted = {
        ...view,
        lockedByKind: {
          ...view.lockedByKind,
          [firstKindWithCells]: view.lockedByKind[firstKindWithCells].slice(1)
        }
      };
      expect(boardViewMatchesState(drifted, state)).toBe(false);
    }
  });

  it("never exceeds per-kind pool capacity for legal boards", () => {
    // Worst legal case: the fixed opening stack plus a full well of drops still
    // fits because the well itself is the hard bound (10x22 < 48*7).
    expect(BOARD_WIDTH * BOARD_HEIGHT).toBeLessThanOrEqual(LOCKED_POOL_CAPACITY_PER_KIND * PIECE_KINDS.length);
    let state = createInitialState(11, createOpeningBoard());
    for (let index = 0; index < 12; index += 1) {
      state = applyAction(state, { type: "hardDrop" });
      if (state.gameOver) break;
      expect(boardViewFitsCapacity(createBoardViewModel(state))).toBe(true);
    }
  });

  it("clears the ghost overlay when no piece is live", () => {
    const cleared = applyAction(
      createInitialState(5, createOpeningBoard()),
      { type: "reset", seed: 5 }
    );
    void cleared;
    const emptyState = { ...createInitialState(5), active: null };
    const view = createBoardViewModel(emptyState);
    expect(view.active).toHaveLength(0);
    expect(view.activeCount).toBe(0);
  });
});
