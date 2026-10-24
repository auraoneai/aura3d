/**
 * Self-heal lab. `?mode=` picks the scene the black-frame guard must judge correctly:
 *   black : the scene draws (drawCalls > 0) but every pixel is black  -> the guard must reload one rung down
 *   dark  : a dim but valid scene (every pixel slightly above black)   -> the guard must NOT fire
 *   slow  : a loading overlay is up and the canvas stays black for `slowMs` (default 12 s) before the lit scene
 *           starts, like a slow first frame on a CPU renderer         -> the guard must NOT fire
 * Exposes `window.__SELFHEAL_LAB__` for the remote spec.
 */
import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";
import { installBlackFrameGuard } from "../../packages/debug/src/safety/index";

type Win = Window & { __SELFHEAL_LAB__?: unknown; __SELFHEAL_LAB_ERROR__?: string };

const q = new URLSearchParams(location.search);
const mode = q.get("mode") ?? "dark";
const slowMs = Number(q.get("slowMs") ?? "12000");

const lab = { mode, frames: 0, running: false, overlayVisible: mode === "slow", rung: () => window.__AURA3D_HEAL__?.rung ?? -1, observation: () => window.__AURA3D_HEAL__?.observation?.() ?? null };
(window as Win).__SELFHEAL_LAB__ = lab;

installBlackFrameGuard({ canvas: () => document.querySelector<HTMLCanvasElement>("#world") });

function build(): ReturnType<typeof scene> {
  const base = scene().camera(camera.perspective({ fov: 40, near: 0.1, far: 60, position: [0, 1.5, 9], target: [0, 0.5, 0] }));
  if (mode === "black") {
    return base
      .background("#000000")
      .add(primitives.box({ name: "black-box", size: [3, 3, 3], material: material.custom({ glsl: { fragment: "out vec4 outColor;\nvoid main() { outColor = vec4(0.0, 0.0, 0.0, 1.0); }" } }) }));
  }
  if (mode === "dark") {
    return base
      .background("#05080d")
      .add(lights.ambient({ color: "#8899aa", intensity: 0.25 }))
      .add(lights.directional({ color: "#aabbcc", intensity: 0.35, position: [4, 8, 6] }))
      .add(primitives.box({ name: "dark-box", size: [3, 3, 3], material: material.pbr({ color: "#202830", roughness: 0.8 }) }));
  }
  return base
    .background("#101820")
    .add(lights.ambient({ color: "#ffffff", intensity: 0.9 }))
    .add(lights.directional({ color: "#fff6e5", intensity: 1.4, position: [4, 8, 6] }))
    .add(primitives.box({ name: "lit-box", size: [3, 3, 3], material: material.pbr({ color: "#e0b030", roughness: 0.6 }) }));
}

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
  canvas.width = 320;
  canvas.height = 180;
  const app = createAuraApp(canvas, { scene: build(), autoStart: false, resize: false, pixelRatio: 1, renderer: { quality: "high" } } as never);
  await app.ready();
  const start = (): void => {
    lab.running = true;
    lab.overlayVisible = false;
    document.querySelector("#boot")?.classList.add("done");
  };
  if (mode === "slow") setTimeout(start, slowMs);
  else start();
  const loop = (): void => {
    requestAnimationFrame(loop);
    lab.frames += 1;
    if (lab.running) app.step(1 / 60);
  };
  if (mode !== "slow") document.querySelector("#boot")?.classList.add("done");
  requestAnimationFrame(loop);
}

main().catch((error: unknown) => {
  (window as Win).__SELFHEAL_LAB_ERROR__ = String((error as Error)?.stack ?? error);
});
