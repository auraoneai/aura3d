import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";
import { registerPostPass } from "@aura3d/rendering/contracts";

declare global {
  interface Window {
    __a3dCurrentRoutesPostprocessingCustom?: CurrentRoutesPostprocessingCustomRuntime;
  }
}

interface CurrentRoutesPostprocessingCustomRuntime {
  readonly appId: "postprocessing-custom";
  readonly status: "ready" | "running" | "error";
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly registeredPasses: readonly string[];
  readonly rejectedPasses: readonly string[];
  readonly renderer: string;
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "postprocessing-custom" as const;

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }
  canvas.width = 1280;
  canvas.height = 720;

  const startedAt = performance.now();
  let runtime = createRuntime(startedAt, "ready");
  const publish = (): void => {
    window.__a3dCurrentRoutesPostprocessingCustom = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const app = createAuraApp(canvas, {
      diagnostics: { overlay: false, performancePanel: false },
      scene: scene()
        .background("#0a0d12")
        .add(primitives.plane({
          name: "gallery floor",
          material: material.pbr({ color: "#141a22", roughness: 0.78, metallic: 0.12 })
        }).position(0, 0, 0).rotate(-Math.PI / 2, 0, 0).scale([6, 6, 1]))
        .add(primitives.sphere({
          name: "hero sphere",
          material: material.pbr({ color: "#d97742", roughness: 0.28, metallic: 0.05 })
        }).position(-0.9, 0.6, 0).scale(0.6))
        .add(primitives.box({
          name: "teal cube",
          material: material.pbr({ color: "#2dd4bf", roughness: 0.45, metallic: 0.2 })
        }).position(0.6, 0.45, -0.4).rotate(0, 0.5, 0).scale([0.7, 0.7, 0.7]))
        .add(primitives.torus({
          name: "warm torus",
          material: material.emissive({ color: "#1c0d02", emissive: "#fbbf24", emissiveIntensity: 2.2 })
        }).position(0.1, 1.35, -1.1).scale(0.42))
        .add(lights.ambient({ intensity: 0.25, color: "#94a3b8" }))
        .add(lights.directional({ position: [3, 5, 4], intensity: 1.4, color: "#fff7e0" }))
        .add(lights.point({ position: [-2, 2.2, 1.5], intensity: 1.1, color: "#7dd3fc" }))
        .camera(camera.perspective({ position: [0, 1.25, 4.2], target: [0, 0.8, -0.4], fov: 46 }))
    });

    const registered: string[] = [];
    const rejected: string[] = [];

    // §6.12: a before-tonemap pass receives linear RGBA16F (values > 1 hold).
    const releaseTint = app.addPostPass({
      name: "warm-highlight-tint",
      insertAt: "before-tonemap",
      uniforms: { u_tint: [1.04, 0.97, 0.9] },
      fragment: {
        glsl: `uniform vec3 u_tint;
void main() {
  vec4 c = texture(u_color, v_uv);
  outColor = vec4(c.rgb * u_tint, c.a);
}`
      }
    });
    registered.push("warm-highlight-tint@before-tonemap");

    // §6.12: an after-tonemap pass receives display-referred RGBA8.
    const releaseScanlines = app.addPostPass({
      name: "crt-scanlines",
      insertAt: "after-tonemap",
      uniforms: { u_strength: 0.12 },
      fragment: {
        glsl: `uniform float u_strength;
void main() {
  vec4 c = texture(u_color, v_uv);
  float shade = 1.0 - u_strength * step(0.5, fract(gl_FragCoord.y * 0.5));
  outColor = vec4(c.rgb * shade, c.a);
}`
      }
    });
    registered.push("crt-scanlines@after-tonemap");

    // Space-rule proof: the app API always stamps the anchor's space, so the
    // guard lives at the contract registry — a raw display-space descriptor
    // at an HDR anchor must throw POSTPROCESS_SPACE_INVALID.
    try {
      registerPostPass({
        id: "demo.bad-space",
        owner: "prd03",
        flag: "A3D_QR_POST",
        insertAt: "before-tonemap",
        space: "display",
        inputs: ["color"],
        fragment: { glsl: "void main() { outColor = texture(u_color, v_uv); }" },
        gpuOnly: true
      });
      rejected.push("display@before-tonemap was NOT rejected (bug)");
    } catch (error) {
      rejected.push(String(error instanceof Error ? error.message : error));
    }
    void releaseTint;
    void releaseScanlines;

    let frameCount = 0;
    let fps = 0;
    let fpsFrames = 0;
    let fpsFrom = performance.now();
    let lastUi = 0;

    app.onFrame(() => {
      frameCount += 1;
      fpsFrames += 1;
      const now = performance.now();
      if (now - fpsFrom >= 500) {
        fps = fpsFrames * 1000 / (now - fpsFrom);
        fpsFrames = 0;
        fpsFrom = now;
      }
      if (now - lastUi > 220) {
        const diagnostics = app.diagnostics();
        runtime = createRuntime(startedAt, frameCount <= 2 ? "ready" : "running", {
          frameCount,
          drawCalls: diagnostics.drawCalls,
          fps,
          registeredPasses: registered,
          rejectedPasses: rejected,
          renderer: diagnostics.renderer?.runtime.backend ?? "a3d-webgl2"
        });
        publish();
        lastUi = now;
      }
    });
  } catch (error) {
    runtime = createRuntime(startedAt, "error", { error: formatError(error) });
    publish();
  }
}

function createRuntime(
  startedAt: number,
  status: CurrentRoutesPostprocessingCustomRuntime["status"],
  patch: Partial<Omit<CurrentRoutesPostprocessingCustomRuntime, "appId" | "status" | "elapsedMs">> = {}
): CurrentRoutesPostprocessingCustomRuntime {
  return {
    appId: APP_ID,
    status,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    registeredPasses: patch.registeredPasses ?? [],
    rejectedPasses: patch.rejectedPasses ?? [],
    renderer: patch.renderer ?? "a3d-webgl2",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: CurrentRoutesPostprocessingCustomRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>CurrentRoutes Postprocessing Custom</h1>
        <p><code>app.addPostPass</code> — a linear-HDR tint at <code>before-tonemap</code> and CRT scanlines at <code>after-tonemap</code> (C-13 §6.12).</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button">${escapeHtml(runtime.status)}</button>
    </section>
    <section class="metrics">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("FPS", runtime.fps.toFixed(1))}
      ${metric("Passes", runtime.registeredPasses.join(" · ") || "none")}
      ${metric("Rejected", runtime.rejectedPasses.join(" · ") || "—")}
    </section>
    ${runtime.error ? `<section class="diagnostics">${escapeHtml(runtime.error)}</section>` : ""}
  `;
}

function metric(label: string, value: string | number): string {
  return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></article>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
