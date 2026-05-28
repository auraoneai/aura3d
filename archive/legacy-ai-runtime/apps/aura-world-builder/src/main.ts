import { mountAISceneShowcase } from "/apps/wow-common/src/ai-scene-showcase.ts";

mountAISceneShowcase({
  appId: "aura-world-builder",
  title: "Aura World Builder",
  summary: "A structured world-building route that turns AI scene intent into connected environment, character, prop, camera, and lighting nodes.",
  mode: "world",
  prompt: "Build a compact cinematic world graph with an environment, a robot character, a glowing flower prop, lighting, and camera intent."
});
