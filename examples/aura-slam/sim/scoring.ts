import { MATCH_RULES, other } from "../contract/sim";
import type { ScoreState, Side } from "../contract/sim";

/**
 * Tennis scoring as implemented by match-engine.js `awardPoint`, kept bit-for-bit: 4 points win a game by 2, the first side
 * to 3 games (leading by 2) takes the match, and 3-3 starts a tiebreak to 7 win by 2. Pure over a small state slice: the
 * engine passes its own `state`, so the mutation order and the messages are exactly the original's.
 */
export interface ScoringSlice {
  score: ScoreState;
  tiebreak: boolean;
  tiebreakFirstServer: Side;
  firstServer: Side;
  server: Side;
  matchWon: boolean;
  pointDelay: number;
  lastCall: string;
  message: string;
  messageTimer: number;
}

/** Display label for one side's points in a game (`pointLabel(a, b)`): 0, 15, 30, 40 and AD after deuce. */
export function pointLabel(a: number, b: number): string {
  if (a >= MATCH_RULES.pointsToGame - 1 && b >= MATCH_RULES.pointsToGame - 1) {
    if (a === b) return "40";
    return a > b ? "AD" : "40";
  }
  return ["0", "15", "30", "40"][Math.min(a, 3)]!;
}

/** Total points played in the current game or tiebreak (`pointIndex`): it decides the serving court. */
export const pointIndex = (score: ScoreState): number => score.playerPoints + score.aiPoints;

/**
 * Resolve the score after `winner` already received their point (the engine increments first, then calls this).
 * Handles the tiebreak (win at 7 by 2, serve rotation every two points), game won, match won and the 3-3 tiebreak start.
 */
export function resolveScoreAfterPoint(slice: ScoringSlice, winner: Side): void {
  const s = slice.score;
  const a = winner === "player" ? s.playerPoints : s.aiPoints;
  const b = winner === "player" ? s.aiPoints : s.playerPoints;
  if (slice.tiebreak) {
    if (a >= MATCH_RULES.tiebreakPoints && a - b >= MATCH_RULES.winBy) {
      s[winner === "player" ? "playerGames" : "aiGames"]++;
      slice.matchWon = true;
      slice.pointDelay = MATCH_RULES.matchWonDelay;
    } else {
      const turn = Math.floor((a + b + 1) / 2) % 2;
      slice.server = turn === 0 ? slice.tiebreakFirstServer : other(slice.tiebreakFirstServer);
    }
    return;
  }
  if (a >= MATCH_RULES.pointsToGame && a - b >= MATCH_RULES.winBy) {
    if (winner === "player") s.playerGames += 1;
    else s.aiGames += 1;
    s.playerPoints = 0;
    s.aiPoints = 0;
    slice.lastCall = winner === "player" ? "GAME — YOU" : "GAME — RIVAL";
    slice.message = slice.lastCall;
    slice.messageTimer = 1.6;
    const totalGames = s.playerGames + s.aiGames;
    slice.server = totalGames % 2 === 0 ? slice.firstServer : other(slice.firstServer);
    if ((s.playerGames >= MATCH_RULES.gamesToMatch || s.aiGames >= MATCH_RULES.gamesToMatch) && Math.abs(s.playerGames - s.aiGames) >= MATCH_RULES.winBy) {
      slice.matchWon = true;
      slice.pointDelay = MATCH_RULES.matchWonDelay;
    } else if (s.playerGames === MATCH_RULES.tiebreakAt && s.aiGames === MATCH_RULES.tiebreakAt) {
      slice.tiebreak = true;
      slice.tiebreakFirstServer = slice.server;
      slice.message = "TIEBREAK · FIRST TO 7, WIN BY 2";
    }
  }
}
