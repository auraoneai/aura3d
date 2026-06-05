import type { ArenaDefinition } from "./ArenaDefinition";

export const skylineTrainingDeck: ArenaDefinition = {
  id: "skyline-training-deck",
  name: "Skyline Training Deck",
  tagline: "A simplified rooftop deck for input tutorials, hitbox overlays, and accessibility captures.",
  typedAsset: "assets.arenaNeonDowntown",
  visualPillars: [
    "minimal foreground clutter",
    "clear combat lane",
    "soft rim lighting for readable silhouettes",
    "UI-first composition for documentation screenshots",
  ],
  lightCues: [
    {
      id: "training-key",
      label: "Soft tutorial key",
      color: "#e9fff1",
      intensity: 0.75,
      position: [0, 3.6, 4],
    },
    {
      id: "training-grid",
      label: "Low floor grid glow",
      color: "#32ffa3",
      intensity: 0.55,
      position: [0, 0.35, 0],
    },
  ],
  cameraCues: [
    {
      id: "training-wide",
      label: "Input tutorial wide",
      position: [0, 2.2, 7.8],
      target: [0, 1.0, 0],
      fov: 44,
    },
    {
      id: "hitbox-proof",
      label: "Hitbox proof capture",
      position: [0, 2.0, 6.4],
      target: [0, 1.1, 0],
      fov: 38,
    },
  ],
  hazardCues: [
    {
      id: "training-safe-reset",
      label: "Safe reset pulse",
      gameplayEffect: "Recenters both fighters after tutorial actions.",
      accessibilityFallback: "No motion effect required; state is announced in the combat log.",
    },
  ],
  posterNotes: [
    "Use this arena for documentation and accessibility shots rather than the main marketing hero.",
    "Keep overlays and state chips more important than cinematic bloom.",
  ],
};
