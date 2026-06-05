import type { ArenaDefinition } from "./ArenaDefinition";

export const neonDowntownRooftop: ArenaDefinition = {
  id: "neon-downtown-rooftop",
  name: "Neon Downtown Rooftop",
  tagline: "A rain-slick rooftop ring above a stylized city skyline.",
  typedAsset: "assets.arenaNeonDowntown",
  visualPillars: [
    "Quaternius Downtown City MegaKit architecture",
    "deep green and cyan rim lighting",
    "readable 2.5D fighting lane",
    "high-contrast silhouettes for combat clarity",
  ],
  lightCues: [
    {
      id: "left-rim",
      label: "Player-side emerald rim",
      color: "#33ff9f",
      intensity: 1.25,
      position: [-3.8, 2.6, 2.2],
    },
    {
      id: "right-rim",
      label: "Opponent-side cyan rim",
      color: "#62d8ff",
      intensity: 1.15,
      position: [3.9, 2.4, 2.1],
    },
    {
      id: "impact-top",
      label: "Aura Burst overhead flash",
      color: "#fff0a8",
      intensity: 0.8,
      position: [0, 5.2, 1.4],
    },
  ],
  cameraCues: [
    {
      id: "fight-wide",
      label: "Wide playable combat",
      position: [0, 2.35, 7.4],
      target: [0, 1.05, 0],
      fov: 42,
    },
    {
      id: "super-push",
      label: "Aura Burst push-in",
      position: [0.35, 2.05, 5.1],
      target: [0, 1.25, 0],
      fov: 36,
    },
    {
      id: "poster-hero",
      label: "Homepage poster hero",
      position: [0, 2.7, 6.2],
      target: [0, 1.15, 0],
      fov: 34,
    },
  ],
  hazardCues: [
    {
      id: "neon-pulse",
      label: "Neon floor pulse",
      gameplayEffect: "Briefly highlights active lane spacing after a special move.",
      accessibilityFallback: "Reduced flash mode changes the pulse into a low-contrast border glow.",
    },
    {
      id: "skyline-shake",
      label: "Skyline bass shake",
      gameplayEffect: "Adds weight to heavy hits and round finish.",
      accessibilityFallback: "Reduced motion mode replaces shake with a static radial vignette.",
    },
  ],
  posterNotes: [
    "Frame the skyline high enough that the fighters read as full-body characters.",
    "Keep health bars and typed GLB evidence visible for developer-facing screenshots.",
    "Do not let bloom hide fighter silhouettes or input readability.",
  ],
};
