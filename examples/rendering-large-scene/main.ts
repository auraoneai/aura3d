import { runLargeSceneHarness } from "./harness";

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__GALILEO3D_LARGE_SCENE_TEST__ = {
      id: "rendering-large-scene",
      status: "error",
      renderer: "webgl2",
      visualClaim: "bounded-large-scene-webgl2-harness",
      knownLimits: ["The large-scene page failed before rendering its bounded WebGL2 harness."],
      errors: [error instanceof Error ? error.message : String(error)],
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const { canvas, status } = createShell();
  resizeCanvas(canvas);
  window.addEventListener("resize", () => resizeCanvas(canvas));
  await runLargeSceneHarness({ canvas, statusElement: status });
}

function createShell(): { readonly canvas: HTMLCanvasElement; readonly status: HTMLElement } {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.innerHTML = `
    <canvas id="large-scene" data-testid="rendering-large-scene-canvas" width="960" height="540"></canvas>
    <aside>
      <h1>Large Scene</h1>
      <p>Renderer/WebGL2 validation scene with 5,000 logical static meshes, LOD selection, static batching, 10,000 instances, generated texture variants, and stable camera movement timing.</p>
      <pre data-testid="rendering-large-scene-status">booting</pre>
    </aside>
  `;
  root.append(shell);
  return {
    canvas: shell.querySelector("canvas")!,
    status: shell.querySelector("pre")!
  };
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #101316; color: #eef4f7; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    main { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 24rem; }
    canvas { width: 100%; height: 100vh; display: block; background: #050608; }
    aside { border-left: 1px solid #2a333a; background: #171d22; padding: 1.25rem; display: grid; align-content: start; gap: 1rem; }
    h1, p { margin: 0; }
    p { color: #bdc9d1; line-height: 1.45; }
    pre { margin: 0; white-space: pre-wrap; color: #b9e9bc; font-size: 0.78rem; line-height: 1.4; }
    @media (max-width: 780px) {
      main { grid-template-columns: 1fr; }
      canvas { height: 62vh; }
      aside { border-left: 0; border-top: 1px solid #2a333a; }
    }
  `;
  document.head.append(style);
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * window.devicePixelRatio));
  const height = Math.max(1, Math.floor(rect.height * window.devicePixelRatio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}
