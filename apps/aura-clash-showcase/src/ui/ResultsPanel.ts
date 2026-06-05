export type RoundResultKind = "player-win" | "opponent-win" | "timeout" | "paused";

export interface ResultsPanelModel {
  kind: RoundResultKind;
  headline: string;
  summary: string;
  primaryAction: string;
  secondaryAction: string;
  screenshotCta: string;
}

export function createResultsPanelModel(kind: RoundResultKind): ResultsPanelModel {
  const map: Record<RoundResultKind, ResultsPanelModel> = {
    "player-win": {
      kind,
      headline: "Aura Burst finish",
      summary: "The player controlled space, built meter, and closed the round.",
      primaryAction: "Run it back",
      secondaryAction: "Choose fighter",
      screenshotCta: "Capture victory poster",
    },
    "opponent-win": {
      kind,
      headline: "Rival takes the round",
      summary: "The opponent broke guard pressure and finished the exchange.",
      primaryAction: "Run it back",
      secondaryAction: "Change matchup",
      screenshotCta: "Capture comeback setup",
    },
    timeout: {
      kind,
      headline: "Time over",
      summary: "The round ended on the timer, so the higher health fighter wins.",
      primaryAction: "Restart round",
      secondaryAction: "Inspect evidence",
      screenshotCta: "Capture HUD proof",
    },
    paused: {
      kind,
      headline: "Paused",
      summary: "The game loop is paused and the current state is preserved.",
      primaryAction: "Resume",
      secondaryAction: "Restart round",
      screenshotCta: "Capture accessibility state",
    },
  };

  return map[kind];
}
