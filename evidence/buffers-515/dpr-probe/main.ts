// P-05 probe: default (attenuated) and fixed-size WebGL2 points on a real GPU at dpr 1 vs 2. CSS canvas is 640x360 in both.
import { camera, createAuraApp, points, pointStreamOf, scene } from "@aura3d/engine";

const mode = new URLSearchParams(location.search).get("mode") ?? "attenuated";
const canvas = document.getElementById("c") as HTMLCanvasElement;
const dpr = window.devicePixelRatio;
canvas.width = Math.round(640 * dpr);
canvas.height = Math.round(360 * dpr);
const stage = scene({ background: "#000000" }).camera(camera.perspective({ fov: 50, position: [0, 0, 10], target: [0, 0, 0], near: 0.1, far: 100 }));
const xs = [-4, -2, 0, 2, 4];
const cloud = new Float32Array(xs.length * 3);
xs.forEach((x, i) => { cloud[i * 3] = x; });
if (mode === "stream") {
  stage.add(points.stream({ capacity: 8, colors: "u8x4n", size: 8, sizeAttenuation: false, runtime: { id: "s" } }));
} else {
  stage.add(points({ positions: cloud, size: mode === "fixed" ? 8 : 0.5, sizeAttenuation: mode !== "fixed" }));
}
const app = createAuraApp(canvas, { scene: stage, autoStart: false, resize: false, pixelRatio: dpr });
await app.ready();
if (mode === "stream") {
  pointStreamOf(app.nodes.require("s")).write(cloud, { colors: new Uint8Array(xs.length * 4).fill(255) });
}
let frames = 0;
const loop = () => {
  app.step(1 / 60);
  frames += 1;
  if (frames < 30) requestAnimationFrame(loop);
  else (window as unknown as { __done: unknown }).__done = { dpr, w: canvas.width, h: canvas.height, mode, errors: app.diagnostics?.()?.errors ?? [] };
};
requestAnimationFrame(loop);
