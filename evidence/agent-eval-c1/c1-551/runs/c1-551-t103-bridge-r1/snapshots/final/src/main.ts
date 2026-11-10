import { mountCanyon } from "./three-bridge/canyon.scene";

// Camera path: the recipe's terrain repeats every PERIOD metres in z, so the camera wraps by PERIOD each LOOP seconds.
const PERIOD = 300;
const LOOP = 60;
const Z0 = -200;
const SPEED = PERIOD / LOOP;
const TAU = Math.PI * 2;

// Same centre line as recipes/canyon.mjs.
const u = (z: number): number => (TAU * z) / PERIOD;
const center = (z: number): number => 16 * Math.sin(u(z) + 0.5) + 7 * Math.sin(2 * u(z) + 2) + 3 * Math.sin(5 * u(z));
// Gentle left/right drift, periodic over LOOP so the wrap is seamless.
const drift = (t: number): number => 2.4 * Math.sin((TAU * 2 * t) / LOOP) + 0.7 * Math.sin((TAU * 5 * t) / LOOP + 1);

interface TaskState {
  flying: boolean;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
}

const state: TaskState = { flying: true, cameraX: 0, cameraY: 0, cameraZ: 0 };
(window as unknown as { __TASK_STATE__: TaskState }).__TASK_STATE__ = state;

// Pause button below the canvas.
const button = document.createElement("button");
button.type = "button";
button.id = "flythrough-toggle";
button.textContent = "Pause flythrough";
button.style.cssText = "display:block;margin:8px 0 0 8px;padding:6px 12px;font:inherit;cursor:pointer;";
button.addEventListener("click", () => {
  state.flying = !state.flying;
  button.textContent = state.flying ? "Pause flythrough" : "Resume flythrough";
});
document.body.appendChild(button);

const app = mountCanyon("#app");

// Flight clock: advances only while flying, so pausing freezes the camera and resuming continues from the same spot.
let flightTime = 0;

app.onFrame((f) => {
  if (state.flying) flightTime += Math.min(f.dt, 0.1);
  const t = flightTime;
  const z = Z0 - (((t * SPEED) % PERIOD) + PERIOD) % PERIOD;
  const zAhead = z - 28;
  const lead = 28 / SPEED;
  const position: [number, number, number] = [center(z) + drift(t), 2.3 + 0.1 * Math.sin((TAU * 7 * t) / LOOP), z];
  app.camera?.setPose(
    {
      position,
      target: [center(zAhead) + 0.8 * drift(t + lead), 8.6 + 0.6 * Math.sin((TAU * 3 * t) / LOOP), zAhead]
    },
    { cut: true }
  );
  state.cameraX = position[0];
  state.cameraY = position[1];
  state.cameraZ = position[2];
});

void app.ready().then(() => {
  (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
});
