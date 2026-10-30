/**
 * GU47 DIA-V2: the outfield scoreboard's live canvas as a `texture.canvas` handle, shared by every park (one canvas per
 * page). Returns null without a DOM (unit tests), and the board falls back to the plain 4.6.2 screen colour.
 */
import { texture } from "@aura3d/engine";
import { BOARD_CANVAS, paintBoard, type BoardColors, type BoardModel } from "../art/board";

export interface BoardTexture {
  readonly handle: unknown;
  paint(model: BoardModel, colors: BoardColors, hrLevel: number): void;
}

let cached: BoardTexture | null | undefined;

/** The shared board texture, or null without a DOM (or if a canvas cannot be made). */
export function boardTexture(): BoardTexture | null {
  if (cached !== undefined) return cached;
  if (typeof document === "undefined") return (cached = null);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = BOARD_CANVAS.width;
    canvas.height = BOARD_CANVAS.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return (cached = null);
    ctx.fillStyle = "#0a1410";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const handle = texture.canvas({ canvas, colorSpace: "srgb" });
    handle.anisotropy = 4;
    cached = {
      handle,
      paint(model, colors, hrLevel) {
        paintBoard(ctx, model, colors, hrLevel);
        handle.needsUpdate = true;
      }
    };
  } catch {
    cached = null;
  }
  return cached;
}
