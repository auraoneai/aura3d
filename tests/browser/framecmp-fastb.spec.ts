import { framecmp } from "./framecmp-lib";

const FLY = "{ throttle: 1, steer: 0, lift: 0, brake: false, boost: false, interact: false }";
framecmp([
  { slug: "drift-and-deliver", hook: "__AURA_DRIFT_AND_DELIVER__", query: "?manual=1&quality=low&models=0", steps: [
    { name: "spawn", drive: `api.reset(); api.teleport(30, -300, 0); api.stepFrames(0);` },
    { name: "drive240", drive: `api.stepFrames(240, { w: true });` },
    { name: "turn20", drive: `api.stepFrames(20, { w: true, d: true });` }
  ] },
  { slug: "strange-orbit", hook: "__AURA_STRANGE_ORBIT__", query: "?manual=1&quality=low", steps: [
    { name: "auto120", drive: `api.begin(); api.setAutopilot(true); api.stepFrames(120);` },
    { name: "auto480", drive: `api.stepFrames(360);` }
  ] },
  { slug: "saiyan-snake-way", hook: "__AURA_SAIYAN_SNAKE_WAY__", query: "?manual=1&autostart=1", steps: [
    { name: "start30", drive: `api.start(); api.stepFrames(30);` },
    { name: "run330", drive: `api.stepFrames(300);` }
  ] },
  { slug: "where-the-wind-wanders", hook: "__AURA_WIND__", query: "?manual=1&quality=low", steps: [
    { name: "idle60", drive: `api.stepFrames(60);` },
    { name: "walk300", drive: `api.stepFrames(240, "D");` }
  ] }
]);
