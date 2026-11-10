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

const app = mountCanyon("#app");

app.onFrame((f) => {
  const t = f.time;
  const wrap = (s: number): number => Z0 - (((s * SPEED) % PERIOD) + PERIOD) % PERIOD;
  const z = wrap(t);
  const zAhead = z - 28;
  const lead = 28 / SPEED;
  app.camera?.setPose(
    {
      position: [center(z) + drift(t), 2.3 + 0.1 * Math.sin((TAU * 7 * t) / LOOP), z],
      target: [center(zAhead) + 0.8 * drift(t + lead), 8.6 + 0.6 * Math.sin((TAU * 3 * t) / LOOP), zAhead]
    },
    { cut: true }
  );
});

void app.ready().then(() => {
  (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
});
