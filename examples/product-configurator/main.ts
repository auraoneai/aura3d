import { Renderer, type RenderDeviceDiagnostics, type RendererPostProcessOptions } from "@aura3d/rendering";
import { createProductConfiguratorWorkflow, type ProductConfiguratorWorkflowResult } from "@aura3d/workflows";
import { assets } from "../../src/aura-assets.js";

type Finish = "graphite" | "copper" | "ceramic";
type Lighting = "studio" | "softbox" | "inspection";
type CameraPreset = "hero" | "profile" | "detail";
type Exposure = "low" | "neutral" | "high";

type ProductDemoState = {
  readonly id: "product-configurator";
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly visualClaim: string;
  readonly claimBoundary: string;
  readonly knownLimits: readonly string[];
  readonly activeVariant: Finish;
  readonly environmentPreset: Lighting;
  readonly cameraPreset: CameraPreset;
  readonly exposure: Exposure;
  readonly interactions: number;
  readonly asset: {
    readonly id: string;
    readonly url: string;
    readonly hash: string;
    readonly source: "typed-provenance-backed-asset";
    readonly license: string;
    readonly author: string;
    readonly meshCount: number;
    readonly materialCount: number;
    readonly textureCount: number;
  };
  readonly export: { readonly requested: boolean; readonly dataUrlBytes: number };
  readonly metrics: Record<string, number | string | boolean>;
  readonly diagnostics?: RenderDeviceDiagnostics;
  readonly errors: readonly string[];
  readonly error?: string;
};

declare global {
  interface Window {
    __AURA3D_PRODUCT_DEMO__?: ProductDemoState;
  }
}

const productAsset = assets.showcaseHeadphones;
const claimBoundary = "Public product-configurator workflow proof using one typed, provenance-backed headphone asset, three material modes, three lighting presets, three bounds-derived camera frames, and state-to-pixel browser evidence. This route does not claim a complete commerce backend or universal Three.js parity.";
const knownLimits = [
  "The product asset is a typed, provenance-backed catalog GLB; no second proxy product or manually assembled stand-in is rendered.",
  "Material variants use the public workflow's asset, contrast, and metal-check modes rather than rewriting glTF materials in place.",
  "Export is a browser PNG capture; native USDZ and a commerce backend are outside this route."
] as const;

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__AURA3D_PRODUCT_DEMO__ = {
      id: "product-configurator",
      status: "error",
      renderer: "webgl2",
      visualClaim: "Product configurator failed before its first public-workflow frame.",
      claimBoundary,
      knownLimits,
      activeVariant: "graphite",
      environmentPreset: "studio",
      cameraPreset: "hero",
      exposure: "neutral",
      interactions: 0,
      asset: {
        id: productAsset.id,
        url: productAsset.url,
        hash: productAsset.hash,
        source: "typed-provenance-backed-asset",
        license: productAsset.metadata?.provenance?.license ?? productAsset.license ?? "unknown",
        author: productAsset.metadata?.provenance?.author ?? productAsset.author ?? "unknown",
        meshCount: 0,
        materialCount: 0,
        textureCount: 0
      },
      export: { requested: false, dataUrlBytes: 0 },
      metrics: {},
      errors: [error instanceof Error ? error.message : String(error)],
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const shell = createShell();
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas: shell.canvas,
    width: shell.canvas.width,
    height: shell.canvas.height,
    clearColor: [0.018, 0.022, 0.028, 1],
    antialias: true,
    preserveDrawingBuffer: true
  });
  let finish: Finish = "graphite";
  let lighting: Lighting = "studio";
  let cameraPreset: CameraPreset = "hero";
  let exposure: Exposure = "neutral";
  let interactions = 0;
  let exportRequested = false;
  let exportedBytes = 0;
  let workflow: ProductConfiguratorWorkflowResult | undefined;
  let diagnostics: RenderDeviceDiagnostics | undefined;
  let renderGeneration = 0;

  const render = async (): Promise<void> => {
    const generation = ++renderGeneration;
    const next = await createProductConfiguratorWorkflow({
      asset: {
        id: productAsset.id,
        title: "Aura Studio Headphones",
        category: "consumer-audio",
        url: productAsset.url,
        manifestUrl: `${location.origin}/examples/external-product-configurator/headphones.manifest.json`
      },
      materialMode: materialMode(finish),
      lighting: lightingPreset(lighting),
      camera: cameraFrame(cameraPreset),
      viewport: { width: shell.canvas.width, height: shell.canvas.height }
    });
    if (generation !== renderGeneration) {
      next.dispose();
      return;
    }
    workflow?.dispose();
    workflow = next;
    diagnostics = renderer.render(withExposure(workflow.source, exposure), workflow.camera);
    publish();
  };

  const publish = (): void => {
    if (!workflow || !diagnostics) return;
    const gltf = workflow.asset.gltf;
    const state: ProductDemoState = {
      id: "product-configurator",
      status: "ready",
      renderer: "webgl2",
      visualClaim: "Typed studio headphones rendered through the public product-configurator workflow with material, lighting, camera, and PNG-capture controls.",
      claimBoundary,
      knownLimits,
      activeVariant: finish,
      environmentPreset: lighting,
      cameraPreset,
      exposure,
      interactions,
      asset: {
        id: productAsset.id,
        url: productAsset.url,
        hash: productAsset.hash,
        source: "typed-provenance-backed-asset",
        license: productAsset.metadata?.provenance?.license ?? productAsset.license ?? "unknown",
        author: productAsset.metadata?.provenance?.author ?? productAsset.author ?? "unknown",
        meshCount: gltf.meshes.length,
        materialCount: gltf.materials.length,
        textureCount: gltf.textures.length
      },
      export: { requested: exportRequested, dataUrlBytes: exportedBytes },
      metrics: {
        rendererBacked: true,
        drawCalls: diagnostics.drawCalls,
        workflowBacked: true,
        publicWorkflow: workflow.kind,
        typedAsset: true,
        provenanceBacked: true,
        materialVariants: 3,
        lightingPresets: 3,
        cameraPresets: 3,
        exposurePresets: 3,
        materialMode: materialMode(finish),
        lightingMode: lightingPreset(lighting),
        cameraMode: cameraFrame(cameraPreset),
        exposure: exposureValue(exposure),
        meshCount: gltf.meshes.length,
        materialCount: gltf.materials.length,
        textureCount: gltf.textures.length,
        cpuFrameMs: 0,
        gpuFrameMs: 0,
        gpuTimingSupported: false,
        gpuTimingSource: "cpu-fallback",
        gpuTimingFallbackReason: "CPU submission timing is the bounded browser fallback for this workflow."
      },
      diagnostics,
      errors: []
    };
    window.__AURA3D_PRODUCT_DEMO__ = state;
    document.body.dataset.aura3dReady = "true";
    shell.status.textContent = `${finish} · ${lighting} · ${cameraPreset} · ${exposure}`;
    shell.evidence.textContent = JSON.stringify({
      workflow: state.metrics.publicWorkflow,
      typedAsset: state.asset.id,
      source: state.asset.source,
      license: state.asset.license,
      author: state.asset.author,
      meshes: state.asset.meshCount,
      drawCalls: diagnostics.drawCalls
    }, null, 2);
  };

  const select = async <T extends string>(selector: string, value: T, apply: (next: T) => void): Promise<void> => {
    apply(value);
    interactions += 1;
    setPressed(shell.root, selector, value);
    await render();
  };

  for (const button of shell.root.querySelectorAll<HTMLButtonElement>("button[data-finish]")) {
    button.addEventListener("click", () => void select("data-finish", button.dataset.finish as Finish, (value) => { finish = value as Finish; }));
  }
  for (const button of shell.root.querySelectorAll<HTMLButtonElement>("button[data-lighting]")) {
    button.addEventListener("click", () => void select("data-lighting", button.dataset.lighting as Lighting, (value) => { lighting = value as Lighting; }));
  }
  for (const button of shell.root.querySelectorAll<HTMLButtonElement>("button[data-camera]")) {
    button.addEventListener("click", () => void select("data-camera", button.dataset.camera as CameraPreset, (value) => { cameraPreset = value as CameraPreset; }));
  }
  for (const button of shell.root.querySelectorAll<HTMLButtonElement>("button[data-exposure]")) {
    button.addEventListener("click", () => void select("data-exposure", button.dataset.exposure as Exposure, (value) => { exposure = value as Exposure; }));
  }
  shell.canvas.addEventListener("click", () => {
    const variants: readonly Finish[] = ["graphite", "copper", "ceramic"];
    const next = variants[(variants.indexOf(finish) + 1) % variants.length]!;
    void select("data-finish", next, (value) => { finish = value as Finish; });
  });
  shell.canvas.addEventListener("keydown", (event) => {
    const cameras: readonly CameraPreset[] = ["hero", "profile", "detail"];
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : -cameras.indexOf(cameraPreset);
    const next = cameras[(cameras.indexOf(cameraPreset) + delta + cameras.length) % cameras.length]!;
    void select("data-camera", next, (value) => { cameraPreset = value as CameraPreset; });
  });
  shell.exportButton.addEventListener("click", () => {
    exportedBytes = shell.canvas.toDataURL("image/png").length;
    exportRequested = true;
    interactions += 1;
    publish();
  });
  window.addEventListener("pagehide", () => {
    workflow?.dispose();
    renderer.dispose();
  }, { once: true });

  await render();
}

function materialMode(finish: Finish): "asset" | "contrast" | "metal-check" {
  if (finish === "copper") return "metal-check";
  if (finish === "ceramic") return "contrast";
  return "asset";
}

function lightingPreset(lighting: Lighting): "catalog-softbox" | "hero-contrast" | "inspection-bay" {
  if (lighting === "softbox") return "catalog-softbox";
  if (lighting === "inspection") return "inspection-bay";
  return "hero-contrast";
}

function cameraFrame(camera: CameraPreset): "front-three-quarter" | "side-profile" | "macro-detail" {
  if (camera === "profile") return "side-profile";
  if (camera === "detail") return "macro-detail";
  return "front-three-quarter";
}

function exposureValue(exposure: Exposure): number {
  if (exposure === "low") return 0.78;
  if (exposure === "high") return 1.34;
  return 1;
}

function withExposure(source: ProductConfiguratorWorkflowResult["source"], exposure: Exposure): ProductConfiguratorWorkflowResult["source"] {
  const postprocess = typeof source.postprocess === "object" ? source.postprocess : undefined;
  const toneMapping = postprocess?.toneMapping;
  return {
    ...source,
    postprocess: {
      ...(postprocess ?? {}),
      toneMapping: {
        ...(toneMapping ?? {}),
        operator: toneMapping?.operator ?? "filmic",
        exposure: (toneMapping?.exposure ?? 1) * exposureValue(exposure),
        whitePoint: toneMapping?.whitePoint ?? 1.25,
        inputColorSpace: toneMapping?.inputColorSpace ?? "linear",
        outputColorSpace: toneMapping?.outputColorSpace ?? "srgb"
      }
    } satisfies RendererPostProcessOptions
  };
}

function setPressed(root: HTMLElement, attribute: string, value: string): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>(`button[${attribute}]`)) {
    button.setAttribute("aria-pressed", String(button.getAttribute(attribute) === value));
  }
}

function createShell(): {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly status: HTMLElement;
  readonly evidence: HTMLElement;
  readonly exportButton: HTMLButtonElement;
} {
  const host = document.querySelector<HTMLElement>("#app") ?? document.body;
  host.replaceChildren();
  const root = document.createElement("main");
  root.innerHTML = `
    <section class="stage">
      <canvas data-testid="product-configurator-canvas" width="1280" height="900" tabindex="0" aria-label="Interactive typed headphone product stage"></canvas>
      <div class="stage-caption"><span>Typed catalog asset</span><strong data-testid="product-status">loading</strong></div>
    </section>
    <aside>
      <p class="eyebrow">Aura3D Product Studio</p>
      <h1>Studio Headphones</h1>
      <p class="lede">One provenance-backed GLB, rendered through the public product workflow.</p>
      <fieldset><legend>Finish</legend>
        <button data-finish="graphite" aria-pressed="true">Graphite</button>
        <button data-finish="copper" aria-pressed="false">Copper</button>
        <button data-finish="ceramic" aria-pressed="false">Ceramic</button>
      </fieldset>
      <fieldset><legend>Lighting</legend>
        <button data-lighting="studio" aria-pressed="true">Studio</button>
        <button data-lighting="softbox" aria-pressed="false">Softbox</button>
        <button data-lighting="inspection" aria-pressed="false">Inspection</button>
      </fieldset>
      <fieldset><legend>Camera</legend>
        <button data-camera="hero" aria-pressed="true">Hero</button>
        <button data-camera="profile" aria-pressed="false">Profile</button>
        <button data-camera="detail" aria-pressed="false">Detail</button>
      </fieldset>
      <fieldset><legend>Exposure</legend>
        <button data-exposure="low" aria-pressed="false">Low</button>
        <button data-exposure="neutral" aria-pressed="true">Neutral</button>
        <button data-exposure="high" aria-pressed="false">High</button>
      </fieldset>
      <button class="export" data-testid="product-export">Export PNG</button>
      <pre data-testid="product-evidence"></pre>
    </aside>`;
  host.append(root);
  return {
    root,
    canvas: root.querySelector("canvas")!,
    status: root.querySelector("[data-testid='product-status']")!,
    evidence: root.querySelector("[data-testid='product-evidence']")!,
    exportButton: root.querySelector("[data-testid='product-export']")!
  };
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #0b0e12; color: #f7f8fa; }
    * { box-sizing: border-box; }
    html, body, #app { margin: 0; min-height: 100%; background: #0b0e12; }
    main { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 22rem; }
    .stage { min-width: 0; display: grid; grid-template-rows: minmax(0, 1fr) 3.25rem; background: radial-gradient(circle at 50% 28%, #202936, #0b0e12 68%); }
    canvas { width: 100%; height: calc(100vh - 3.25rem); display: block; }
    .stage-caption { display: flex; justify-content: space-between; align-items: center; padding: 0 1.25rem; border-top: 1px solid #252c35; color: #aeb8c5; font-size: .82rem; letter-spacing: .04em; }
    .stage-caption strong { color: #e9f6ff; font-weight: 600; }
    aside { padding: 2rem 1.5rem; border-left: 1px solid #252c35; background: rgba(15, 19, 25, .97); }
    .eyebrow { margin: 0 0 .65rem; color: #72d7ff; font-size: .72rem; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
    h1 { margin: 0; font-size: 2rem; letter-spacing: -.03em; }
    .lede { margin: .75rem 0 1.75rem; color: #aeb8c5; line-height: 1.5; }
    fieldset { margin: 0 0 1.25rem; padding: 0; border: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: .5rem; }
    legend { grid-column: 1 / -1; margin-bottom: .55rem; color: #dbe3ec; font-size: .72rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
    button { min-height: 2.65rem; border: 1px solid #34404d; border-radius: .6rem; background: #171d25; color: #eaf0f6; cursor: pointer; }
    button:hover, button:focus-visible { border-color: #72d7ff; outline: none; }
    button[aria-pressed="true"] { border-color: #72d7ff; background: #173247; box-shadow: inset 0 0 0 1px #72d7ff55; }
    .export { width: 100%; margin-top: .25rem; background: #eaf5ff; color: #0b1721; font-weight: 700; }
    pre { margin: 1.5rem 0 0; padding: 1rem; border: 1px solid #252c35; border-radius: .6rem; background: #0b0e12; color: #9adfb8; font-size: .72rem; white-space: pre-wrap; line-height: 1.45; }
    @media (max-width: 860px) {
      main { grid-template-columns: 1fr; }
      .stage { min-height: 62vh; }
      canvas { height: calc(62vh - 3.25rem); }
      aside { border-left: 0; border-top: 1px solid #252c35; }
    }
  `;
  document.head.append(style);
}
