import { shotsb } from "./shotsb-lib";

/**
 * Card-only recapture for Shadowstep Gauntlet. The desktop viewport is the 1440x900 card size and there is one state, so the desktop test
 * emits `run-1440` (the card frame) well inside the one hour ACR step limit that the full spec exceeds at this scene's software-GL speed.
 */
shotsb({
  slug: "shadowstep-gauntlet", folder: "ninja-runner-port", hook: "__AURA_NINJA_RUNNER__",
  titleQuery: "", manualQuery: "?manual=1", card: "run", desktop: { width: 1440, height: 900 },
  states: [{ name: "run", drive: `api.begin(); api.stepFrames(300);`, mobile: false }]
});
