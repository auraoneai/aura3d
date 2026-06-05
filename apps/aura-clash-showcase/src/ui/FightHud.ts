export interface FightHudMeter {
  label: string;
  current: number;
  max: number;
  color: string;
}

export interface FightHudFighter {
  name: string;
  archetype: string;
  status: string;
  meters: FightHudMeter[];
}

export interface FightHudModel {
  roundTimer: number;
  player: FightHudFighter;
  opponent: FightHudFighter;
  comboText: string;
  accessibilityText: string;
}

export function createFightHudModel(input: {
  roundTimer: number;
  playerName: string;
  opponentName: string;
  playerHealth: number;
  opponentHealth: number;
  playerGuard: number;
  opponentGuard: number;
  playerMeter: number;
  opponentMeter: number;
  comboCount: number;
}): FightHudModel {
  return {
    roundTimer: input.roundTimer,
    player: {
      name: input.playerName,
      archetype: "selected fighter",
      status: "ready",
      meters: [
        { label: "health", current: input.playerHealth, max: 100, color: "#ff705d" },
        { label: "guard", current: input.playerGuard, max: 100, color: "#9ce8ff" },
        { label: "aura", current: input.playerMeter, max: 100, color: "#ffe978" },
      ],
    },
    opponent: {
      name: input.opponentName,
      archetype: "rival fighter",
      status: "pressuring",
      meters: [
        { label: "health", current: input.opponentHealth, max: 100, color: "#31ff9f" },
        { label: "guard", current: input.opponentGuard, max: 100, color: "#9ce8ff" },
        { label: "aura", current: input.opponentMeter, max: 100, color: "#ffe978" },
      ],
    },
    comboText: input.comboCount > 1 ? `${input.comboCount} hit combo` : "neutral",
    accessibilityText: "All combat changes are backed by text state, bars, and combat log entries.",
  };
}
