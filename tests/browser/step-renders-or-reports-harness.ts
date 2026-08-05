/**
 * WS-2.9 harness: step() before and after `app.ready()`.
 *
 * Imports the public entry point, so this satisfies R1's harness-import evidence shape.
 */
import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

function litPixels(canvas: HTMLCanvasElement): number {
  const probe = document.createElement("canvas");
  probe.width = canvas.width;
  probe.height = canvas.height;
  const context = probe.getContext("2d");
  if (!context) return 0;
  context.drawImage(canvas, 0, 0);
  const data = context.getImageData(0, 0, probe.width, probe.height).data;
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index]! > 24 || data[index + 1]! > 24 || data[index + 2]! > 24) count += 1;
  }
  return count;
}

async function main(): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 320;
  document.body.replaceChildren(canvas);

  const built = scene()
    .background("#05070b")
    .camera(camera.perspective({ position: [0, 0, 2.6], target: [0, 0, 0], fov: 45 }))
    .add(lights.directional({ name: "key", intensity: 3 }).position(1.6, 1.8, 2.4))
    .add(primitives.sphere({ name: "subject", material: material.pbr({ color: "#c8d3e0", roughness: 0.4 }) }));

  const app = createAuraApp(canvas, { scene: built, autoStart: false, pixelRatio: 1, resize: false, renderer: { qualityProfile: "production" } });

  // The defect window: synchronous steps immediately after construction, with no rAF yield.
  for (let frame = 0; frame < 8; frame += 1) app.step(1 / 60);
  const before = app.diagnostics();
  const beforeReady = {
    drawCalls: before.drawCalls,
    warnings: [...before.warnings],
    errors: [...before.errors],
    litPixels: litPixels(canvas)
  };

  let readyResolved = false;
  await app.ready();
  readyResolved = true;

  for (let frame = 0; frame < 4; frame += 1) app.step(1 / 60);
  const after = app.diagnostics();
  const afterReady = { drawCalls: after.drawCalls, litPixels: litPixels(canvas) };

  (window as unknown as { __stepProbe: unknown }).__stepProbe = { beforeReady, afterReady, readyResolved };
  app.dispose();
}

void main().catch((error: unknown) => {
  (window as unknown as { __stepProbeError: string }).__stepProbeError = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
});
