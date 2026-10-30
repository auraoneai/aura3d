import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BOARD_BAKE_LOW, bakeBoardMaps, boardTexel } from "../../../apps/showcase-dot-dash-3d/src/game/boardMaterial";
import { parseMaze } from "../../../apps/showcase-dot-dash-3d/src/game/grid";
import { BOARD_LOOKS, hexRgb } from "../../../apps/showcase-dot-dash-3d/src/game/look";
import { MAZES, MAZE_ORDER } from "../../../apps/showcase-dot-dash-3d/src/game/mazes";
import { traceEdges } from "../../../apps/showcase-dot-dash-3d/src/game/traces";

const sha = (bytes: Uint8Array | Uint8ClampedArray): string => createHash("sha256").update(bytes).digest("hex");
const size = { width: BOARD_BAKE_LOW.width, height: BOARD_BAKE_LOW.height };

describe("dot-dash-3d baked PCB (DD47-M1)", () => {
  it("is deterministic and differs per board", () => {
    const hashes = new Set<string>();
    for (const id of MAZE_ORDER) {
      const maze = parseMaze(MAZES[id]);
      const a = bakeBoardMaps({ maze, look: BOARD_LOOKS[id], ...size });
      const b = bakeBoardMaps({ maze, look: BOARD_LOOKS[id], ...size });
      expect(sha(a.albedo)).toBe(sha(b.albedo));
      expect(sha(a.normal)).toBe(sha(b.normal));
      expect(a.albedo.length).toBe(size.width * size.height * 4);
      hashes.add(sha(a.albedo));
    }
    expect(hashes.size).toBe(MAZE_ORDER.length);
  });

  it("puts the trace mask on the corridor traces and the mask colour between them", () => {
    const id = MAZE_ORDER[0]!;
    const maze = parseMaze(MAZES[id]);
    const maps = bakeBoardMaps({ maze, look: BOARD_LOOKS[id] });
    const edge = traceEdges(maze)[0]!;
    const [c, r] = boardTexel(edge.x - 9, edge.y - 10);
    expect(maps.traceMask[r * maps.width + c]).toBe(255);
    // a wall tile centre is under a chip: no trace, occluded
    const wi = maze.wall.findIndex((w) => w);
    const [wc, wr] = boardTexel((wi % maze.width) - 9, Math.floor(wi / maze.width) - 10);
    expect(maps.traceMask[wr * maps.width + wc]).toBe(0);
    expect(maps.occlusion[(wr * maps.width + wc) * 4]).toBeLessThan(128);
    // most of the board is bare solder mask in the board's colour (weave within 4%)
    const mask = hexRgb(BOARD_LOOKS[id].mask).map((v) => v * 255);
    let maskLike = 0;
    for (let i = 0; i < maps.width * maps.height; i++) {
      if ([0, 1, 2].every((k) => Math.abs(maps.albedo[i * 4 + k]! - mask[k]!) <= 0.04 * 255)) maskLike++;
    }
    expect(maskLike / (maps.width * maps.height)).toBeGreaterThan(0.5);
    // a flat texel's normal points straight up
    const flat = Array.from(maps.normal.slice((wr * maps.width + wc) * 4, (wr * maps.width + wc) * 4 + 3));
    expect(flat).toEqual([128, 128, 255]);
  });
});
