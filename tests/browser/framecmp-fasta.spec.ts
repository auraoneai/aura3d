import { framecmp } from "./framecmp-lib";

const FLY = "{ throttle: 1, steer: 0, lift: 0, brake: false, boost: false, interact: false }";
framecmp([
  { slug: "silt-and-signal", hook: "__AURA_SILT__", query: "?manual=1&chapter=0&objective=1", repeatLoads: 2, steps: [
    { name: "gatehouse", drive: `api.pose({ position: [20, 14, -190], target: [-34, 10, -262], up: [0, 1, 0], fov: 62 }); api.render(); api.render();` },
    { name: "rings", drive: `api.pose({ position: [138, 9, 42], target: [138, 5, 5], up: [0, 1, 0], fov: 62 }); api.render(); api.render();` },
    { name: "chase0", drive: `api.render(); api.render();` }
  ] },
  { slug: "silt-and-signal", hook: "__AURA_SILT__", query: "?manual=1&chapter=0&objective=2", steps: [
    { name: "fly240", drive: `api.stepFrames(240, ${FLY}); api.render(); api.render();` }
  ] },
  { slug: "ninja-runner", hook: "__AURA_NINJA_RUNNER__", query: "?manual=1&quality=low", steps: [
    { name: "run120", drive: `api.begin(); api.stepFrames(120);` },
    { name: "jump24", drive: `api.applyInput("jump"); api.stepFrames(24);` },
    { name: "run300", drive: `api.stepFrames(300);` }
  ] },
  { slug: "roadster-hours", hook: "__AURA_ROADSTER_HOURS__", query: "?manual=1", steps: [
    { name: "start", drive: `api.begin(); api.renderNow();` },
    { name: "auto240", drive: `api.setAutopilot(true); api.stepSteps(240); api.renderNow();` },
    { name: "auto1680", drive: `api.stepSteps(1440); api.renderNow();` }
  ] }
]);
