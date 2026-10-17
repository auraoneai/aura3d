// Dev-time maze sanity: every dot/orb/fruit tile reachable from spawn,
// house interior reachable from the door for ghosts. Run:
//   ../node_modules/.bin/tsx? — no, run from repo root:
//   node --experimental-strip-types apps/showcase-dot-dash-3d/scripts/validate-mazes.mjs
// or via tsx: ../../node_modules/.bin/tsx scripts/validate-mazes.mjs
import { MAZES, MAZE_ORDER } from "../src/game/mazes.ts";
import { parseMaze, validateMaze } from "../src/game/grid.ts";

let bad = 0;
for (const id of MAZE_ORDER) {
  const def = MAZES[id];
  try {
    const m = parseMaze(def);
    const problems = validateMaze(m);
    console.log(`${id.padEnd(9)} ${m.width}x${m.height} dots=${m.dots.length} orbs=${m.orbs.length} house=${m.houseTiles.length} door=${m.door.x},${m.door.y} aboveDoor=${m.aboveDoor.x},${m.aboveDoor.y}`);
    for (const p of problems) { console.log(`   !! ${p}`); bad += 1; }
  } catch (e) {
    bad += 1;
    console.log(`${id} FAILED: ${e.message}`);
  }
}
process.exit(bad ? 1 : 0);
