import { mountAISceneShowcase } from "/apps/wow-common/src/ai-scene-showcase.ts";

mountAISceneShowcase({
  appId: "aura-scene-diff-editor",
  title: "Aura Scene Diff Editor",
  summary: "A before/after route showing how a conversational patch changes scene scale, fog, and camera framing while preserving exportable IR.",
  mode: "diff",
  prompt: "Create a rainy neon alley at night with a robot, glowing flower, wet pavement, and blue-pink rim lighting.",
  editPrompt: "Make the robot smaller, add more fog, and move the camera lower."
});
