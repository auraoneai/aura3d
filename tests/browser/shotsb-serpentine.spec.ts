import { shotsb } from "./shotsb-lib";

shotsb({
  slug: "serpentine-sky-run", folder: "saiyan-snake-way-port", hook: "__AURA_SAIYAN_SNAKE_WAY__",
  titleQuery: "", manualQuery: "?manual=1", card: "jump",
  states: [
    { name: "early", drive: `api.start(); api.stepFrames(45);` },
    { name: "jump", drive: `api.stepFrames(1, { taps: ["Space"] }); api.stepFrames(16);` },
    { name: "roll", drive: `api.stepFrames(120); api.stepFrames(1, { taps: ["KeyS"] }); api.stepFrames(10);` },
    { name: "mid-action", drive: `api.stepFrames(600);` },
    { name: "results", drive: `api.stepFrames(30000);`, settle: 8 }
  ]
});
