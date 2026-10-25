import type { Cfg } from "./finc-lib";

const D = (w: number, h: number): [number, number] => [w, h];
const FLY = "{ throttle: 1, steer: 0, lift: 0, brake: false, boost: false, interact: false }";
const FLYB = "{ throttle: 1, steer: 0.4, lift: 0, brake: false, boost: true, interact: false }";

export const SILT: Cfg = {
  id: "silt", slug: "silt-and-signal", base: "/examples/silt-and-signal-port/", hook: "__AURA_SILT__", desktop: D(1280, 720), mobile: D(390, 844),
  titleQuery: "?quality=low", playQuery: "?manual=1&start=1&chapter=0&objective=1", pump: "api.render();", settle: true, cardUpTo: "key-boost",
  steps: [
    { name: "gameplay-early", mobile: true, drive: "api.render(); api.render();" },
    { name: "key-boost", mobile: true, drive: `api.stepFrames(120, ${FLYB}); api.render(); api.render();` },
    { name: "mid-fly", drive: `api.stepFrames(360, ${FLY}); api.render(); api.render();` },
    { name: "results", drive: `api.setMode("done"); api.render(); api.render();` }
  ]
};

export const WIND: Cfg = {
  id: "wind", slug: "where-the-wind-wanders", base: "/examples/where-the-wind-wanders-port/", hook: "__AURA_WIND__", desktop: D(1280, 720), mobile: D(390, 844),
  titleQuery: "?quality=low", playQuery: "?manual=1&quality=low", pump: "api.stepFrames(1);", settle: true, cardUpTo: "key-walk",
  steps: [
    { name: "gameplay-early", mobile: true, drive: "api.stepFrames(60);" },
    { name: "key-walk", mobile: true, drive: `api.stepFrames(120, "D");` },
    { name: "mid-walk", drive: `api.stepFrames(300, "D");` },
    { name: "results", drive: "api.epilogue(6);" }
  ]
};

export const SALT: Cfg = {
  id: "salt", slug: "roadster-hours", base: "/examples/roadster-hours-port/", hook: "__AURA_ROADSTER_HOURS__", desktop: D(1280, 720), mobile: D(390, 844),
  titleQuery: "?quality=low", playQuery: "?manual=1", pump: "api.renderNow();", settle: true, cardUpTo: "key-drive",
  steps: [
    { name: "gameplay-early", mobile: true, drive: "api.begin(); api.renderNow();" },
    { name: "key-drive", mobile: true, drive: "api.setAutopilot(true); api.stepSteps(240); api.renderNow();" },
    { name: "mid-drive", drive: "api.stepSteps(1440); api.renderNow();" },
    { name: "results", drive: "api.stepSteps(200000); api.renderNow();" }
  ]
};

export const CLOUD: Cfg = {
  id: "cloud", slug: "kid-goku-beyond-the-clouds", base: "/examples/kid-goku-beyond-the-clouds-port/", hook: "__AURA_KID_GOKU__", desktop: D(640, 360), mobile: D(390, 844),
  titleQuery: "?quality=low", playQuery: "?manual=1&quality=low", pump: "api.settle(1, false);", settle: true, cardUpTo: "key-run",
  steps: [
    { name: "gameplay-early", mobile: true, drive: "api.begin(); api.settle(20, true);" },
    { name: "key-run", mobile: true, drive: "api.play(120, { steer: 0, jump: false, pole: false, nimbus: false, brake: false }); api.settle(2, false);" },
    { name: "key-jump", drive: "api.play(2, { steer: 0, jump: true, pole: false, nimbus: false, brake: false }); api.play(14, { steer: 0, jump: false, pole: false, nimbus: false, brake: false }); api.settle(2, false);" },
    { name: "mid-track", drive: "api.place(600, {}); api.settle(30, true);" },
    { name: "results", drive: "api.place(1000000, {}); api.settle(240, true);" }
  ]
};

export const TRAIN: Cfg = {
  id: "train", slug: "last-train", base: "/examples/last-train-port/", hook: "__AURA_LAST_TRAIN__", desktop: D(1280, 720), mobile: D(390, 844),
  titleQuery: "?quality=low", playQuery: "?manual=1&quality=low", pump: "api.stepFrames(1);", settle: true, cardUpTo: "key-depart",
  steps: [
    { name: "gameplay-early", mobile: true, drive: "api.stepFrames(2);" },
    { name: "key-depart", mobile: true, drive: "api.doors(); let g = 0; while (api.advance(1).phase !== 'ready' && g++ < 6000) {} api.depart(); g = 0; while (api.advance(1).phase !== 'enroute' && g++ < 6000) {} api.setAutopilot(true); api.advance(180); api.stepFrames(1);" },
    { name: "mid-leg", drive: "api.setAutopilot(true); api.advance(900); api.stepFrames(1);" },
    { name: "results", drive: "api.setAutopilot(true); let g = 0; while (api.advance(1).phase === 'enroute' && g++ < 200000) {} api.runCircuit(0); api.stepFrames(1);" }
  ]
};

/** Cumulus Dash jump frame with the runner clear of the opening log. */
export const CLOUD_JUMP: Cfg = {
  ...CLOUD, id: "cloudjump",
  steps: [
    { name: "key-jump", drive: "api.place(600, {}); api.settle(10, true); api.play(2, { steer: 0, jump: true, pole: false, nimbus: false, brake: false }); api.play(10, { steer: 0, jump: false, pole: false, nimbus: false, brake: false }); api.settle(2, false);" }
  ]
};

/** Lamplight Line results card, reached from a fresh service with the autopilot (as in the first retake). */
export const TRAIN_RESULTS: Cfg = {
  ...TRAIN, id: "trainresults",
  steps: [
    { name: "results", drive: "api.setAutopilot(true); api.advance(30000); api.stepFrames(1);" }
  ]
};

/** Saltwind Highway key-drive frames: enough steps to clear the countdown (240 left the 3-2-1 on screen). */
export const SALT_KEY: Cfg = {
  ...SALT, id: "saltkey",
  steps: [
    { name: "gameplay-early", mobile: true, drive: "api.begin(); api.renderNow();" },
    { name: "key-drive", mobile: true, drive: "api.setAutopilot(true); api.stepSteps(330); api.renderNow();" }
  ]
};

/** Lamplight Line card: the tram at the station, before the passenger list grows. */
export const TRAIN_CARD: Cfg = {
  ...TRAIN, id: "traincard", settle: false, cardUpTo: "gameplay-early",
  steps: [{ name: "gameplay-early", mobile: true, drive: "api.stepFrames(2);" }]
};
