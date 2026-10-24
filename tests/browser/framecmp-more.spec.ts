import { framecmp } from "./framecmp-lib";

framecmp([
  { slug: "roadster-hours", hook: "__AURA_ROADSTER_HOURS__", query: "?manual=1", repeatLoads: 4, steps: [
    { name: "start", drive: `api.begin(); api.renderNow();` },
    { name: "auto240", drive: `api.setAutopilot(true); api.stepSteps(240); api.renderNow();` }
  ] },
  { slug: "saiyan-snake-way", hook: "__AURA_SAIYAN_SNAKE_WAY__", query: "?manual=1&autostart=1", repeatLoads: 4, steps: [
    { name: "start30", drive: `api.start(); api.stepFrames(30);` }
  ] }
]);
