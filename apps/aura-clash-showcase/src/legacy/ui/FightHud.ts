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

export interface FightHudReplayControlsModel {
  /** The scrub strip only exists in training/debug mode; normal play never shows it. */
  readonly visible: boolean;
  readonly hint: string;
  /** Present while scrubbing; null at live play. */
  readonly scrubLabel: string | null;
}

/**
 * AC-A2 — debug-gated exchange-replay controls.
 *
 * Pure model for the HUD's training-only replay strip. `training` comes from
 * `readPlayableHudMode(...).training`, so the controls are structurally hidden on the public
 * playable path (debug-toggle law) and the DOM node stays inert there.
 */
export function createFightHudReplayControlsModel(input: {
  training: boolean;
  scrubOffsetSeconds: number;
  bufferedSeconds: number;
}): FightHudReplayControlsModel {
  if (!input.training) {
    return { visible: false, hint: "", scrubLabel: null };
  }
  const buffered = Math.max(0, input.bufferedSeconds);
  const scrubbing = input.scrubOffsetSeconds < -1e-4 && buffered > 0;
  return {
    visible: true,
    hint: `[ / ] replay last exchange (${buffered.toFixed(1)}s buffered)`,
    scrubLabel: scrubbing ? `REPLAY −${Math.abs(input.scrubOffsetSeconds).toFixed(2)}s` : null
  };
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
