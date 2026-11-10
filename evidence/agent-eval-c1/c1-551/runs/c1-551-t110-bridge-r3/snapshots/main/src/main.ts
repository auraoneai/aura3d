import { mountClock } from "./three-bridge/clock.scene";

const PERIOD = 2; // seconds per full left-right cycle
const AMPLITUDE = (11 * Math.PI) / 180;
const WEIGHT_TRAVEL = 0.35; // metres before the weights are "wound" back up
const WEIGHT_SPEED_L = 0.004; // m/s
const WEIGHT_SPEED_R = 0.0027;
const DEG = Math.PI / 180;

const app = mountClock("#app");
let started = false;
const t0 = performance.now();

const state = { swing: 0, hour: 0, minute: 0, second: 0, weightL: 0, weightR: 0, tick: 0 };
(window as unknown as { __TASK_STATE__?: unknown }).__TASK_STATE__ = state;

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

  state.swing = swing;
  state.hour = now.getHours();
  state.minute = min;
  state.second = sec;
  state.weightL = 1.5 - wl;
  state.weightR = 1.5 - wr;
  state.tick = sec;

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
