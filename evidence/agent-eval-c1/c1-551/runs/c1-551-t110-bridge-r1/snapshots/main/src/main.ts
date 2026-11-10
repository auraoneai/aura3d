import { FACE_CENTER, HANDS, WEIGHT_MIN_Y, WEIGHT_START_Y, WEIGHT_X, WEIGHT_Z, CHAIN_LENGTH, mountClock } from "./three-bridge/clock.scene";

const SINK_RATE = 0.004; // metres per second
const SWING_AMPLITUDE = 0.22; // radians, matches the bridged clip
const SWING_PERIOD = 2; // seconds

const app = mountClock("#app");

const setHand = (id: string, angle: number): void => {
  const h = HANDS.find((x) => x.id === id);
  if (!h) return;
  const mid = (h.length - h.tail) / 2;
  app.nodes.require(id)
    .setPosition(FACE_CENTER.x + Math.sin(angle) * mid, FACE_CENTER.y + Math.cos(angle) * mid, h.z)
    .setRotation(0, 0, -angle);
};

const state = { hourAngle: 0, minuteAngle: 0, secondAngle: 0, weightY: WEIGHT_START_Y, pendulumAngle: 0, period: SWING_PERIOD, time: "" };
(window as unknown as { __TASK_STATE__: typeof state }).__TASK_STATE__ = state;

let firstFrame = true;
let t0 = -1;
app.onFrame((f) => {
  if (t0 < 0) t0 = f.time;
  const elapsed = f.time - t0;

  const now = new Date();
  const s = now.getSeconds();
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  state.secondAngle = (s / 60) * Math.PI * 2; // one discrete tick per second
  state.minuteAngle = (m / 60) * Math.PI * 2;
  state.hourAngle = (h / 12) * Math.PI * 2;
  state.time = now.toLocaleTimeString();
  setHand("hour-hand", state.hourAngle);
  setHand("minute-hand", state.minuteAngle);
  setHand("second-hand", state.secondAngle);

  // Weights sink slowly; rewind to the top when they reach the bottom of the case.
  const travel = WEIGHT_START_Y - WEIGHT_MIN_Y;
  const y = WEIGHT_START_Y - ((elapsed * SINK_RATE) % travel);
  state.weightY = y;
  WEIGHT_X.forEach((x, i) => {
    app.nodes.require(`weight-${i}`).setPosition(x, y, WEIGHT_Z);
    app.nodes.require(`weight-cap-${i}`).setPosition(x, y + 0.2, WEIGHT_Z);
    app.nodes.require(`chain-${i}`).setPosition(x, y + 0.2 + CHAIN_LENGTH / 2, WEIGHT_Z);
  });

  // Approximation of the clip's angle for inspection (the clip itself drives the pendulum).
  state.pendulumAngle = SWING_AMPLITUDE * Math.sin((elapsed / SWING_PERIOD) * Math.PI * 2);

  if (firstFrame) {
    firstFrame = false;
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  }
});

void app.ready();
