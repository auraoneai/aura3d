/**
 * BF-R7 unit proof — rotation feedback signals.
 *
 * The rules engine is the source of truth for "was this rotation refused":
 * `tryRotate` records `rotate:blocked` in `lastMove` when no wall kick lands,
 * and `rotate:<direction>` when the rotation is accepted. The route's frame
 * loop turns the refused signal into the visible denied pulse on the rotate
 * buttons (plus the `rotateDenied` proof counter); these tests pin the
 * engine-side contract that feedback path depends on.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  createInitialState,
  pieceCells,
  type ActivePiece,
  type BlockfallState
} from "../../../apps/showcase-blockfall-reactor/src/rules";

function boxedInState(): BlockfallState {
  const base = createInitialState(1234);
  const active: ActivePiece = { kind: "T", x: 4, y: 10, rotation: 0 };
  const occupied = new Set(pieceCells(active).map((cell) => `${cell.x},${cell.y}`));
  // Fill every cell except the active piece's own: every rotation target and
  // every wall kick collides, so the rotation is genuinely refused.
  const board = Array.from({ length: BOARD_HEIGHT }, (_, y) =>
    Array.from({ length: BOARD_WIDTH }, (_, x) =>
      occupied.has(`${x},${y}`) ? null : ("I" as const)
    )
  );
  return { ...base, active, board };
}

describe("Blockfall rotation feedback signals", () => {
  it("marks a refused rotation as rotate:blocked and leaves the piece untouched", () => {
    const before = boxedInState();
    const denied = applyAction(before, { type: "rotate", direction: 1 });
    expect(denied.lastMove).toBe("rotate:blocked");
    expect(denied.active).toEqual(before.active);
    // Counter-clockwise is refused too — the signal is direction-independent.
    const deniedCCW = applyAction(before, { type: "rotate", direction: -1 });
    expect(deniedCCW.lastMove).toBe("rotate:blocked");
  });

  it("marks an accepted rotation as rotate:<direction> with the new rotation", () => {
    const open: BlockfallState = {
      ...createInitialState(1234),
      active: { kind: "T", x: 4, y: 10, rotation: 0 }
    };
    const rotated = applyAction(open, { type: "rotate", direction: 1 });
    expect(rotated.lastMove).toBe("rotate:1");
    expect(rotated.active?.rotation).toBe(1);
  });

  it("a wall kick still counts as accepted, not blocked", () => {
    // T piece one cell from the left wall: rotation 0 -> 1 would collide at
    // x=0, but the +1 x kick lands it, so the engine accepts with a kick.
    const base = createInitialState(1234);
    const nearWall: BlockfallState = {
      ...base,
      active: { kind: "T", x: 0, y: 10, rotation: 0 }
    };
    const kicked = applyAction(nearWall, { type: "rotate", direction: 1 });
    expect(kicked.lastMove).toBe("rotate:1");
    expect(kicked.active?.rotation).toBe(1);
  });
});
