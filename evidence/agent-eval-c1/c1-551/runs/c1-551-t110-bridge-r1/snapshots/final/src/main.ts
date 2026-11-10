import { BOB_DISTANCE, FACE_CENTER, HANDS, LIGHT_IDS, PIVOT, ROD_LENGTH, WEIGHT_MIN_Y, WEIGHT_START_Y, WEIGHT_X, WEIGHT_Z, CHAIN_LENGTH, mountClock } from "./three-bridge/clock.scene";

const SINK_RATE = 0.004; // metres per second
const SWING_AMPLITUDE = 0.22; // radians
const SWING_PERIOD = 2; // seconds per full left-right cycle

const app = mountClock("#app");

// Light settings per mode. The face lamp stays on at night so the dial remains readable.
interface LightLook { readonly color: string; readonly intensity: number }
const DAY: Record<string, LightLook> = {
  interior_lamp: { color: "#ffb866", intensity: 6 },
  room_lamp: { color: "#ffc98a", intensity: 30 },
  fill_lamp: { color: "#ff9a55", intensity: 8 },
  face_lamp: { color: "#ffd9a0", intensity: 3 }
};
const NIGHT: Record<string, LightLook> = {
  interior_lamp: { color: "#ff9a50", intensity: 1.5 },
  room_lamp: { color: "#6f8fe0", intensity: 8 },
  fill_lamp: { color: "#4a5a9a", intensity: 2 },
  face_lamp: { color: "#ffd9a0", intensity: 4 }
};

const state = { lightsOn: true, pendulumAngleDeg: 0 };
(window as unknown as { __TASK_STATE__: typeof state }).__TASK_STATE__ = state;

const applyLights = (on: boolean, transitionSeconds = 0.4): void => {
  const look = on ? DAY : NIGHT;
  for (const id of [...LIGHT_IDS, "face_lamp"]) {
    const l = look[id]!;
    app.nodes.require(id).setLight?.({ color: l.color, intensity: l.intensity }, { transitionSeconds });
  }
};

// DOM button outside the canvas.
const button = document.createElement("button");
button.id = "lights-toggle";
button.type = "button";
button.textContent = "Lights off";
button.style.cssText = "display:block;margin:8px;padding:6px 14px;font:600 13px system-ui,sans-serif;cursor:pointer";
document.body.append(button);
button.addEventListener("click", () => {
  state.lightsOn = !state.lightsOn;
  button.textContent = state.lightsOn ? "Lights off" : "Lights on";
  applyLights(state.lightsOn);
});

const setHand = (id: string, angle: number): void => {
  const h = HANDS.find((x) => x.id === id);
  if (!h) return;
  const mid = (h.length - h.tail) / 2;
  app.nodes.require(id)
    .setPosition(FACE_CENTER.x + Math.sin(angle) * mid, FACE_CENTER.y + Math.cos(angle) * mid, h.z)
    .setRotation(0, 0, -angle);
};

// Point at distance d below the pivot, swung by angle (radians, positive toward +x).
const swingPoint = (d: number, angle: number): [number, number, number] =>
  [PIVOT.x + Math.sin(angle) * d, PIVOT.y - Math.cos(angle) * d, PIVOT.z];

let firstFrame = true;
let t0 = -1;
app.onFrame((f) => {
  if (t0 < 0) t0 = f.time;
  const elapsed = f.time - t0;

  const now = new Date();
  const s = now.getSeconds();
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  setHand("hour-hand", (h / 12) * Math.PI * 2);
  setHand("minute-hand", (m / 60) * Math.PI * 2);
  setHand("second-hand", (s / 60) * Math.PI * 2); // one discrete tick per second

  // Pendulum: sinusoidal swing (slowest at the extremes), period 2 s.
  const angle = SWING_AMPLITUDE * Math.sin((elapsed / SWING_PERIOD) * Math.PI * 2);
  state.pendulumAngleDeg = (angle * 180) / Math.PI;
  const rod = swingPoint(ROD_LENGTH / 2, angle);
  app.nodes.require("pendulum-rod").setPosition(rod[0], rod[1], rod[2]).setRotation(0, 0, angle);
  const bob = swingPoint(BOB_DISTANCE, angle);
  app.nodes.require("pendulum-bob").setPosition(bob[0], bob[1], bob[2]).setRotation(0, 0, angle);
  app.nodes.require("pendulum-ring").setPosition(bob[0], bob[1], bob[2] + 0.05).setRotation(Math.PI / 2, 0, angle);

  // Weights sink slowly; rewind to the top when they reach the bottom of the case.
  const y = WEIGHT_START_Y - ((elapsed * SINK_RATE) % (WEIGHT_START_Y - WEIGHT_MIN_Y));
  WEIGHT_X.forEach((x, i) => {
    app.nodes.require(`weight-${i}`).setPosition(x, y, WEIGHT_Z);
    app.nodes.require(`weight-cap-${i}`).setPosition(x, y + 0.2, WEIGHT_Z);
    app.nodes.require(`chain-${i}`).setPosition(x, y + 0.2 + CHAIN_LENGTH / 2, WEIGHT_Z);
  });

  if (firstFrame) {
    firstFrame = false;
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  }
});

void app.ready();
