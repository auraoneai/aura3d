import type { AuraLightingPlan } from "./AuraSceneIR.js";

export function planLightingFromMood(mood: readonly string[] | string): AuraLightingPlan {
  const moodText = typeof mood === "string" ? mood.toLowerCase() : mood.join(" ").toLowerCase();
  const night = moodText.includes("night") || moodText.includes("noir");
  const warm = moodText.includes("warm") || moodText.includes("golden") || moodText.includes("hopeful");
  return {
    id: night ? "light-noir-stage" : warm ? "light-warm-cinematic" : "light-neutral-studio",
    label: night ? "Noir stage lighting" : warm ? "Warm cinematic lighting" : "Neutral studio lighting",
    mood: moodText || "neutral",
    exposure: night ? 1.28 : warm ? 1.12 : 1.04,
    keyLight: {
      direction: [-0.45, -0.9, -0.35],
      color: warm ? [1, 0.82, 0.56] : night ? [0.56, 0.68, 1] : [1, 1, 0.94],
      intensity: night ? 1.65 : warm ? 1.45 : 1.12
    },
    fillLight: {
      direction: [0.58, -0.45, 0.2],
      color: warm ? [0.45, 0.7, 1] : [0.72, 0.82, 1],
      intensity: night ? 0.2 : 0.34
    },
    rimLight: {
      direction: [0.1, -0.38, 0.9],
      color: warm ? [0.75, 1, 0.8] : [1, 1, 1],
      intensity: night ? 0.55 : 0.38
    }
  };
}
