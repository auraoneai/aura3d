import { shotsb } from "./shotsb-lib";

shotsb({
  slug: "chroma-roll", folder: "splat-rush-port", hook: "__AURA_SPLAT_RUSH__",
  titleQuery: "", manualQuery: "?manual=1", card: "roll",
  states: [
    { name: "early", drive: `api.begin(); api.stepFrames(45);` },
    { name: "roll", drive: `api.runAutopilot(420);` },
    { name: "mid-action", drive: `api.runAutopilot(700);` },
    { name: "results", drive: `api.reset(); api.idleUntil("gameOver", 4000);`, settle: 8 }
  ]
});
