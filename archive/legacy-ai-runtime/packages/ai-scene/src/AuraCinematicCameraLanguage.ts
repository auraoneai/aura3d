import type { AuraCinematicCameraMovement, AuraShotCameraSpec } from "./AuraShotSpec.js";

export interface AuraCinematicCameraLanguagePlan {
  readonly movement: AuraCinematicCameraMovement;
  readonly durationSeconds: number;
  readonly framing: AuraShotCameraSpec["framing"];
  readonly targetTracking: boolean;
  readonly resetSupported: true;
  readonly diagnostics: readonly string[];
}

export function parseAuraCinematicCameraLanguage(prompt: string): AuraCinematicCameraLanguagePlan {
  const lower = prompt.toLowerCase();
  const movement: AuraCinematicCameraMovement = /\borbit|arc\b/.test(lower)
    ? "orbit"
    : /\bpan|tilt|truck\b/.test(lower)
      ? "truck"
      : /\bhandheld\b/.test(lower)
        ? "handheld"
        : /\bdolly|push|closer|reveal\b/.test(lower)
          ? "dolly"
          : "static";
  const framing: AuraShotCameraSpec["framing"] = /\bestablishing|wide\b/.test(lower)
    ? "wide-establishing"
    : /\bclose|detail\b/.test(lower)
      ? "close-detail"
      : /\bover.?shoulder\b/.test(lower)
        ? "over-shoulder"
        : /\blow.?angle|low\b/.test(lower)
          ? "low-angle"
          : "medium-hero";
  const durationMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:second|sec|s)\b/);
  return {
    movement,
    durationSeconds: durationMatch ? Number(durationMatch[1]) : 12,
    framing,
    targetTracking: /\btrack|follow|look at|look-at|target\b/.test(lower),
    resetSupported: true,
    diagnostics: [`Parsed camera language as ${movement} with ${framing} framing.`]
  };
}
