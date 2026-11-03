// Shared games.json classification for the PRD-14 unit checks.
//
// PRD-14 rebuilt 18 game routes behind a `route-<id>` dispatcher
// (apps/<dir>/src/main.ts -> src/v2/boot.ts). Thirteen of those apps were
// deleted in release 4.0.1 (46bca99f1) and pruned from games.json in
// 8e6ecef13; the five below still ship. games.json also registers later
// routes for capture (aura-links-3d 644da6651, iron-crown + pips-big-leap
// 479225fd9) that are not PRD-14 rebuild routes: no v2 boot, no route flag.
// games-json.test.ts asserts this split matches the data and the tree, so a
// new or removed route fails there instead of being skipped here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

export interface GamesJsonEntry {
  readonly id: string;
  readonly appDir?: string;
  readonly qrFlags?: readonly string[];
  readonly [key: string]: unknown;
}

export const GAMES_JSON_ENTRIES: readonly GamesJsonEntry[] = (JSON.parse(
  readFileSync(join(ROOT, "tools/quality-rebuild-capture/games.json"), "utf8")
) as { games: GamesJsonEntry[] }).games;

/** The PRD-14 rebuild routes that still ship (v2 boot + route-<id> dispatch). */
export const PRD14_REBUILD_ROUTES = [
  "aura-clash-showcase",
  "showcase-aurora-lander",
  "showcase-bank-shot",
  "showcase-blockfall-reactor",
  "showcase-vault-breakers"
] as const;

/** Later games.json routes outside the PRD-14 rebuild (no v2 boot). */
export const NON_REBUILD_ROUTES = [
  "showcase-aura-links-3d",
  "showcase-iron-crown",
  "showcase-pips-big-leap"
] as const;

const appDirOf = (id: string): string => {
  const entry = GAMES_JSON_ENTRIES.find((g) => g.id === id);
  return entry?.appDir ?? id;
};

/** App directories of the PRD-14 rebuild routes, sorted. */
export const PRD14_REBUILD_APP_DIRS: readonly string[] = [...new Set(PRD14_REBUILD_ROUTES.map(appDirOf))].sort();
