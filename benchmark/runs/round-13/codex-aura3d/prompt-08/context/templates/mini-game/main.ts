import { createAuraApp, definePromptPlan, promptPlanToScene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const plan = definePromptPlan({
  sceneType: "mini-game",
  subject: { asset: assets.playerModel, label: "player" },
  style: "readable neon collect-and-dodge arena",
  environment: "bounded board with rails, lane markings, coins, hazards, and portal goal",
  camera: { preset: "game-board" },
  lighting: { preset: "game-readable" },
  effects: ["motion-trail", "hud", "bloom"],
  interaction: "keyboard",
  acceptanceCriteria: [
    "player, coins, hazards, and portal are all visible",
    "arena boundaries and lane direction are readable",
    "motion trail and shield communicate active game state"
  ],
  negativeCriteria: [
    "do not accept random primitives without readable game state",
    "do not accept a character on an empty grid as a mini-game"
  ]
} as const);

createAuraApp("#app", {
  diagnostics: { overlay: true, performancePanel: true },
  scene: promptPlanToScene(plan)
});
