import { mountClock } from "./three-bridge/clock.scene";

const PERIOD = 2; // seconds per full left-right cycle
const AMPLITUDE = (11 * Math.PI) / 180;
const WEIGHT_TRAVEL = 0.35; // metres before the weights are "wound" back up
const WEIGHT_SPEED_L = 0.004; // m/s
const WEIGHT_SPEED_R = 0.0027;
const DEG = Math.PI / 180;
const DAY_LIGHTS = ["day-light-0", "day-light-1", "day-light-2", "day-light-3"];
const NIGHT_LIGHTS = ["night-light-0", "night-light-1", "night-light-2"];

const app = mountClock("#app");
let started = false;
const t0 = performance.now();

const state = { lightsOn: true, pendulumAngleDeg: 0 };
(window as unknown as { __TASK_STATE__?: unknown }).__TASK_STATE__ = state;

let appliedLights: boolean | null = null;
const applyLights = (): void => {
  if (appliedLights === state.lightsOn) return;
  let ok = true;
  for (const id of DAY_LIGHTS) { const n = app.nodes.get(id); if (n) n.setVisible(state.lightsOn); else ok = false; }
  for (const id of NIGHT_LIGHTS) { const n = app.nodes.get(id); if (n) n.setVisible(!state.lightsOn); else ok = false; }
  if (ok) appliedLights = state.lightsOn;
};

const button = document.createElement("button");
button.id = "lights-toggle";
button.type = "button";
button.textContent = "Lights off";
button.style.cssText = "display:block;margin:8px;padding:6px 14px;font:600 14px system-ui,sans-serif;cursor:pointer";
button.addEventListener("click", () => {
  state.lightsOn = !state.lightsOn;
  button.textContent = state.lightsOn ? "Lights off" : "Lights on";
  applyLights();
});
document.body.append(button);

app.onFrame(() => {
  const t = (performance.now() - t0) / 1000;
  const now = new Date();
  const sec = now.getSeconds();
  const min = now.getMinutes();
  const hr = now.getHours() % 12;

  // Sinusoidal swing: slowest at the extremes, period 2 s.
  const swing = AMPLITUDE * Math.sin((2 * Math.PI * t) / PERIOD);
  // Clockwise on the dial = negative rotation about +z (viewer on +z).
  const secAngle = -sec * 6 * DEG; // one discrete tick per second
  const minAngle = -(min + sec / 60) * 6 * DEG;
  const hourAngle = -(hr + min / 60 + sec / 3600) * 30 * DEG;

  const epoch = now.getTime() / 1000;
  const wl = (epoch * WEIGHT_SPEED_L) % WEIGHT_TRAVEL;
  const wr = (epoch * WEIGHT_SPEED_R) % WEIGHT_TRAVEL;

  app.nodes.require("pendulum").setRotation(0, 0, swing);
  app.nodes.require("second-hand").setRotation(0, 0, secAngle);
  app.nodes.require("minute-hand").setRotation(0, 0, minAngle);
  app.nodes.require("hour-hand").setRotation(0, 0, hourAngle);
  app.nodes.require("weight-l").setPosition(-0.4, 1.5 - wl, 0.05);
  app.nodes.require("weight-r").setPosition(0.4, 1.5 - wr, 0.05);

  applyLights();
  state.pendulumAngleDeg = swing / DEG;

  if (!started) {
    started = true;
    window.__EVAL_READY__ = true;
  }
});

void app.ready();

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}
