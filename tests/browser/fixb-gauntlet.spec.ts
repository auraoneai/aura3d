import { shotsb } from "./shotsb-lib";

/** Short capture for the Shadowstep Gauntlet phone-layout fix: the early, run and gate-hit states only (software GL, remote). */
shotsb({
  slug: "shadowstep-gauntlet", folder: "ninja-runner-port", hook: "__AURA_NINJA_RUNNER__",
  titleQuery: "", manualQuery: "?manual=1", card: "run",
  states: [
    { name: "early", drive: `api.begin(); api.stepFrames(60);` },
    { name: "run", drive: `api.stepFrames(240);` }
  ]
});
