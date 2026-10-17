import type { Difficulty } from "./ai";
import type { FighterId } from "./fighters";
import type { StageId } from "./stages";

/**
 * Crown Ladder — an 8-rung gauntlet. Rungs 1-7 rotate the non-chosen
 * fighters across venues with rising difficulty; rung 8 is always SOVEREIGN
 * at the Crown Arena on boss rules.
 */

export interface LadderRung {
  readonly rung: number;
  readonly opponent: FighterId;
  readonly stage: StageId;
  readonly difficulty: Difficulty;
  readonly title: string;
}

export interface LadderState {
  readonly playerFighter: FighterId;
  readonly rungs: readonly LadderRung[];
  cursor: number;
  cleared: boolean;
  dead: boolean;
}

const ROTATION: readonly { stage: StageId; difficulty: Difficulty; title: string }[] = [
  { stage: "bangkok-dock", difficulty: "novice", title: "Dockside Initiation" },
  { stage: "desert-airbase", difficulty: "novice", title: "Range Rules" },
  { stage: "colosseum-ruins", difficulty: "scrapper", title: "Dust and Echoes" },
  { stage: "neo-tokyo-rooftop", difficulty: "scrapper", title: "Neon Qualifier" },
  { stage: "himalayan-monastery", difficulty: "scrapper", title: "Thin-Air Trial" },
  { stage: "bangkok-dock", difficulty: "champion", title: "Rematch Clause" },
  { stage: "colosseum-ruins", difficulty: "champion", title: "The Old Guard" }
];

export function createLadder(playerFighter: FighterId): LadderState {
  const pool: readonly FighterId[] = (["kenji", "volt", "boulder", "seraph", "jinx"] as FighterId[]).filter((id) => id !== playerFighter);
  const rungs: LadderRung[] = ROTATION.map((rung, i) => ({
    rung: i + 1,
    opponent: pool[i % pool.length] ?? "volt",
    stage: rung.stage,
    difficulty: rung.difficulty,
    title: rung.title
  }));
  rungs.push({
    rung: 8,
    opponent: "sovereign",
    stage: "crown-arena",
    difficulty: "boss",
    title: "THE IRON CROWN"
  });
  return { playerFighter, rungs, cursor: 0, cleared: false, dead: false };
}

export function currentRung(ladder: LadderState): LadderRung | undefined {
  return ladder.rungs[ladder.cursor];
}

export function advanceLadder(ladder: LadderState): void {
  ladder.cursor += 1;
  if (ladder.cursor >= ladder.rungs.length) ladder.cleared = true;
}
