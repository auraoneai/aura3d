import { shotsb } from "./shotsb-lib";

shotsb({
  slug: "serpentine-sky-run", folder: "saiyan-snake-way-port", hook: "__AURA_SERPENTINE_SKY_RUN__",
  titleQuery: "", manualQuery: "?manual=1", card: "mid-action",
  states: [
    { name: "early", drive: `api.start(); api.stepFrames(45);` },
    { name: "jump", drive: `api.stepFrames(1, { taps: ["Space"] }); api.stepFrames(16);` },
    { name: "roll", drive: `api.stepFrames(120); api.stepFrames(1, { taps: ["KeyS"] }); api.stepFrames(10);` },
    { name: "mid-action", drive: `api.stepFrames(600);` },
    // the idle run falls at the first gap; outro(3) passes the fall's 2.6 s results delay so the next frame shows the results card
    { name: "results", drive: `api.stepFrames(30000); api.outro(3);`, settle: 8 }
  ]
});
