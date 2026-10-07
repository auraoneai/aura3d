// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import { gameFeelBuilders } from "../GameFeel.js";

export const gameFeel = { create: gameFeelBuilders.create, hitStopDefaults: gameFeelBuilders.hitStopDefaults } as const;
