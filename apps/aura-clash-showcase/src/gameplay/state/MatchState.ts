import { createFighterRuntimeState } from "./FighterState";
import type { FighterRuntimeState, FighterSide, RoundRuntimeState } from "./GameTypes";

export function createRoundRuntimeState(playerId = "mara-volt", opponentId = "rook-atlas"): RoundRuntimeState {
  return {
    roundId: `aura-clash-${Date.now().toString(36)}`,
    timerSeconds: 90,
    paused: false,
    winner: null,
    reason: null,
    player: createFighterRuntimeState("player", playerId, { x: -2.2, y: 0 }, 1),
    opponent: createFighterRuntimeState("opponent", opponentId, { x: 2.2, y: 0 }, -1),
  };
}

export function updateRoundWinner(round: RoundRuntimeState): RoundRuntimeState {
  if (round.player.stats.health <= 0) {
    return { ...round, winner: "opponent", reason: "player-health-zero" };
  }

  if (round.opponent.stats.health <= 0) {
    return { ...round, winner: "player", reason: "opponent-health-zero" };
  }

  if (round.timerSeconds <= 0) {
    const winner: FighterSide =
      round.player.stats.health >= round.opponent.stats.health ? "player" : "opponent";
    return { ...round, winner, reason: "timer-expired" };
  }

  return round;
}

export function replaceFighter(round: RoundRuntimeState, side: FighterSide, fighter: FighterRuntimeState): RoundRuntimeState {
  return side === "player" ? { ...round, player: fighter } : { ...round, opponent: fighter };
}
