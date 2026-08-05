/**
 * WS-2.5 harness — a renderable scene on a canvas that cannot give a WebGL2 context.
 *
 * The failure is provoked honestly: `getContext` is stubbed on **one** canvas instance to return null for
 * `webgl2`, which is exactly what a browser does when the GPU process is unavailable or too many contexts
 * are live. Before WS-2.5 that produced a gradient schematic and reported `backend: "canvas2d"` as though
 * it were a successful render.
 */
import { camera, createAuraApp, material, primitives, scene } from "@aura3d/engine";

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
  const built = () => scene()
    .background("#12305a")
    .camera(camera.perspective({ position: [0, 0, 2.6], target: [0, 0, 0], fov: 45 }))
    .add(primitives.box({ name: "subject", material: material.pbr({ color: "#c8d3e0" }) }));

  // A real canvas, with WebGL2 denied on this instance only.
  const denied = document.createElement("canvas");
  denied.width = 128;
  denied.height = 128;
  document.body.append(denied);
  const originalGetContext = denied.getContext.bind(denied);
  (denied as { getContext: unknown }).getContext = ((id: string, ...rest: unknown[]) =>
    id === "webgl2" || id === "webgl" ? null : (originalGetContext as (...args: unknown[]) => unknown)(id, ...rest)) as typeof denied.getContext;

  /*
   * Two ways this can be refused, and both are acceptable — what matters is that neither paints a
   * schematic:
   *
   *   synchronously  — `createAuraApp` throws, when the selection rule can already tell WebGL is out
   *                    (no canvas at all, or no window).
   *   asynchronously — the mount promise rejects and `diagnostics().errors` records why, when the canvas
   *                    and window exist but the device cannot be created. That is this case: the
   *                    selection rule sees a canvas in a browser, so it correctly attempts WebGL and
   *                    only discovers the denial inside `startProductionRender`.
   *
   * The original defect was neither of these. It was the *third* outcome: fall through to the 2D path and
   * report `backend: "canvas2d"` with a gradient on screen and empty errors.
   */
  let threw = false;
  let message = "";
  let asyncErrors: string[] = [];
  let backend = "";
  // Measured after the attempt settles: the old behaviour would have painted a gradient here.
  let deniedLitPixels = 0;
  try {
    const deniedApp = createAuraApp(denied, { scene: built(), autoStart: false, resize: false });
    await deniedApp.ready();
    deniedApp.step(1 / 60);
    const diagnostics = deniedApp.diagnostics();
    asyncErrors = [...diagnostics.errors];
    backend = diagnostics.backend;
    message = asyncErrors.join(" | ");
    deniedLitPixels = litPixels(denied);
    deniedApp.dispose();
  } catch (error) {
    threw = true;
    message = error instanceof Error ? error.message : String(error);
    deniedLitPixels = litPixels(denied);
  }
  // Control: the same scene on a working canvas must still render.
  const working = document.createElement("canvas");
  working.width = 128;
  working.height = 128;
  document.body.append(working);
  const app = createAuraApp(working, { scene: built(), autoStart: false, resize: false });
  await app.ready();
  app.step(1 / 60);
  const control = { backend: app.diagnostics().backend, litPixels: litPixels(working) };
  app.dispose();

  (window as unknown as { __canvas2dProbe: unknown }).__canvas2dProbe = {
    denied: { threw, message, asyncErrors, backend, litPixels: deniedLitPixels },
    control
  };
}

void main().catch((error: unknown) => {
  (window as unknown as { __canvas2dProbeError: string }).__canvas2dProbeError =
    error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
});
