import { mountCanyon } from "./three-bridge/canyon.scene";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: Record<string, unknown>;
  }
}

// Canyon centre line, identical to recipes/canyon.mjs (period P, z-periodic).
const P = 200;
const K = (Math.PI * 2) / P;
const sz = (n: number, z: number, ph: number): number => Math.sin(n * K * z + ph);
const centre = (z: number): number => 12 * sz(1, z, 0.6) + 4 * sz(2, z, 2.0) + 1.5 * sz(3, z, 1.0);
// Gentle left/right drift of the camera inside the canyon, periodic in z so the loop has no seam.
const drift = (z: number): number => 2.4 * sz(3, z, 1.0) + 1.0 * sz(5, z, 0.2);

const SPEED = 5; // metres per second
const LOOK_AHEAD = 16;
const EYE = 1.8;

const pathPoint = (z: number): [number, number, number] => [centre(z) + drift(z), EYE + 0.1 * sz(7, z, 0.5), z];

const app = mountCanyon("#app");
let ready = false;
let travelled = 0;

app.onFrame((f) => {
  travelled += Math.min(f.dt, 0.1) * SPEED;
  const z = travelled % P;
  const [px, py, pz] = pathPoint(z);
  const [tx, , tz] = pathPoint(z + LOOK_AHEAD);
  app.camera?.setPose(
    { position: [px, py, pz], target: [tx, py + 5 + 0.6 * sz(2, z, 1.3), tz], up: [0, 1, 0], fov: 62, near: 0.3, far: 700 },
    { cut: true }
  );
  window.__TASK_STATE__ = { z, loops: Math.floor(travelled / P) };
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
});

void app.ready();
