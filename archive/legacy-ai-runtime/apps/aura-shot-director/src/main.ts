import { mountAISceneShowcase } from "/apps/wow-common/src/ai-scene-showcase.ts";

mountAISceneShowcase({
  appId: "aura-shot-director",
  title: "Aura Shot Director",
  summary: "A camera-planning route that visualizes generated shot beats, camera rails, lighting targets, and timeline diagnostics.",
  mode: "shot",
  prompt: "Plan a 12-second emotional camera push around a glowing flower, with a robot entering frame and soft sunrise rim light."
});
