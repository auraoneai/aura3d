import {
  camera,
  createAuraApp,
  distanceLod,
  effects,
  instances,
  lights,
  material,
  primitives,
  scene,
  type AuraApp,
  type AuraCameraSpec,
  type AuraTransformSpec
} from "@aura3d/engine";

type LargeWorldView = "overview" | "near" | "far";

interface LargeWorldEvidence {
  readonly id: "rendering-large-scene";
  readonly status: "loading" | "ready" | "error";
  readonly claim: "createAuraApp-root-instancing-and-distance-lod-example";
  readonly view: LargeWorldView;
  readonly revision: number;
  readonly instanceCount: number;
  readonly instanceFamilies: number;
  readonly nativeInstancedSubmissions?: number;
  readonly activeLod?: string;
  readonly lodLevelIndex?: number;
  readonly drawCalls?: number;
  readonly visibleObjects?: number;
  readonly culledObjects?: number;
  readonly runtimeBackend?: string;
  readonly errors: readonly string[];
  readonly knownLimits: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_LARGE_WORLD__?: LargeWorldEvidence;
    __AURA3D_LARGE_WORLD_SET_VIEW__?: (view: LargeWorldView) => Promise<void>;
  }
}

const GRID_SIZE = 50;
const INSTANCE_COUNT = GRID_SIZE * GRID_SIZE;
const knownLimits = [
  "This is a bounded abstract large-world visualization, not a streaming or open-world production system.",
  "The example proves native root-API primitive instancing and camera-distance LOD selection; it does not claim imported-GLB instancing, occlusion culling, or performance parity with Three.js."
] as const;
const views: Record<LargeWorldView, AuraCameraSpec> = {
  overview: camera.orthographic({ position: [14, 12, 17], target: [0, 0.8, 0], orthographicSize: 10.5 }),
  near: camera.orthographic({ position: [14, 12, 17], target: [0, 0.8, 0], orthographicSize: 7.2 }),
  far: camera.perspective({ position: [27, 20, 30], target: [0, 0.8, 0], fov: 31 })
};

const terrain = buildTerrainInstances();
let app: AuraApp | undefined;
let activeView: LargeWorldView = "overview";
let revision = 0;

installShell();
publish({ id: "rendering-large-scene", status: "loading", claim: "createAuraApp-root-instancing-and-distance-lod-example", view: activeView, revision, instanceCount: INSTANCE_COUNT, instanceFamilies: 1, errors: [], knownLimits });
void boot().catch(fail);

async function boot(): Promise<void> {
  const canvas = requiredElement<HTMLCanvasElement>("[data-testid='rendering-large-scene-canvas']");
  app = createAuraApp(canvas, {
    autoStart: false,
    resize: true,
    pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: buildScene(activeView)
  });
  await app.ready();
  app.step(1 / 60);
  bindControls();
  window.__AURA3D_LARGE_WORLD_SET_VIEW__ = setView;
  publishReady();
}

function buildScene(view: LargeWorldView) {
  return scene()
    .background("#071019")
    .camera(views[view])
    .add(effects.fog({ name: "data highlands depth haze", color: "#102b3a", density: 0.018, intensity: 0.3 }))
    .add(effects.bloom({ name: "data highlands signal bloom", intensity: 0.24, threshold: 0.78, radius: 0.32 }))
    .add(lights.ambient({ name: "data highlands ambient", color: "#b8ddff", intensity: 0.42 }))
    .add(lights.directional({ name: "data highlands sun", position: [11, 18, 9], color: "#ffe6b5", intensity: 2.8 }))
    .add(primitives.box({
      name: "large world foundation",
      material: material.pbr({ color: "#0c2531", roughness: 0.92, metallic: 0.05 }),
      castShadow: false
    }).position(0, -0.22, 0).scale([17, 0.3, 17]))
    .add(primitives.box({
      name: "north south data channel",
      material: material.neon({ color: "#36d8d0", emissive: "#36d8d0", emissiveIntensity: 1.35 })
    }).position(0, 0.02, 0).scale([0.18, 0.035, 15.8]))
    .add(primitives.box({
      name: "east west data channel",
      material: material.neon({ color: "#f3b75c", emissive: "#f3b75c", emissiveIntensity: 1.25 })
    }).position(0, 0.025, 0).scale([15.8, 0.035, 0.18]))
    .add(instances.box({
      name: "native instanced data highlands",
      transforms: terrain.transforms,
      colors: terrain.colors,
      material: material.pbr({ color: "#ffffff", roughness: 0.48, metallic: 0.18 }),
      castShadow: false,
      receiveShadow: true
    }))
    .add(distanceLod({
      name: "central observation tower distance LOD",
      levels: [
        { name: "near detailed cylindrical tower", maxDistance: 30, primitive: "cylinder", material: material.pbr({ color: "#f3cf7a", roughness: 0.24, metallic: 0.58 }) },
        { name: "far simplified box tower", primitive: "box", material: material.pbr({ color: "#d49a48", roughness: 0.66, metallic: 0.12 }) }
      ],
      hysteresis: 1.2,
      castShadow: false
    }).position(0, 2.2, 0).scale([0.58, 4.5, 0.58]))
    .add(primitives.torus({
      name: "observation tower signal ring",
      material: material.neon({ color: "#79e7ff", emissive: "#79e7ff", emissiveIntensity: 1.8 })
    }).position(0, 4.25, 0).rotate(Math.PI / 2, 0, 0).scale([1.15, 1.15, 0.08]));
}

function buildTerrainInstances(): { readonly transforms: readonly AuraTransformSpec[]; readonly colors: readonly string[] } {
  const transforms: AuraTransformSpec[] = [];
  const colors: string[] = [];
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < GRID_SIZE; column += 1) {
      const x = (column - (GRID_SIZE - 1) / 2) * 0.31;
      const z = (row - (GRID_SIZE - 1) / 2) * 0.31;
      const radial = Math.hypot(x, z);
      const ridge = Math.sin(x * 1.12) * 0.26 + Math.cos(z * 0.94) * 0.22 + Math.sin((x + z) * 0.58) * 0.17;
      const basin = Math.max(0, 1 - radial / 10) * 0.32;
      const height = Math.max(0.12, 0.36 + ridge + basin);
      transforms.push({
        position: [x, height / 2, z],
        scale: [0.245, height, 0.245]
      });
      const normalized = Math.min(1, Math.max(0, (height - 0.12) / 0.95));
      colors.push(normalized > 0.7 ? "#f2c66d" : normalized > 0.42 ? "#48c4b7" : normalized > 0.2 ? "#287ca0" : "#183f66");
    }
  }
  return { transforms, colors };
}

function bindControls(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => void setView(button.dataset.view as LargeWorldView));
  });
}

async function setView(view: LargeWorldView): Promise<void> {
  if (!app || !(view in views)) return;
  activeView = view;
  revision += 1;
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    const selected = button.dataset.view === view;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  app.setScene(buildScene(view));
  await app.ready();
  app.step(1 / 60);
  publishReady();
}

function publishReady(): void {
  if (!app) return;
  const diagnostics = app.diagnostics();
  const lod = diagnostics.renderer?.runtime.lodSelections.find((entry) => entry.nodeName === "central observation tower distance LOD");
  publish({
    id: "rendering-large-scene",
    status: "ready",
    claim: "createAuraApp-root-instancing-and-distance-lod-example",
    view: activeView,
    revision,
    instanceCount: INSTANCE_COUNT,
    instanceFamilies: 1,
    nativeInstancedSubmissions: diagnostics.renderer?.runtime.nativeInstancedSubmissions,
    activeLod: lod?.levelName,
    lodLevelIndex: lod?.levelIndex,
    drawCalls: diagnostics.drawCalls,
    visibleObjects: diagnostics.renderer?.runtime.visibleObjects,
    culledObjects: diagnostics.renderer?.runtime.culledObjects,
    runtimeBackend: diagnostics.renderer?.runtime.backend,
    errors: diagnostics.errors,
    knownLimits
  });
}

function publish(evidence: LargeWorldEvidence): void {
  window.__AURA3D_LARGE_WORLD__ = evidence;
  document.documentElement.dataset.auraRouteStatus = evidence.status;
  const status = document.querySelector<HTMLElement>("[data-testid='rendering-large-scene-status']");
  if (status) {
    status.innerHTML = evidence.status === "ready"
      ? `<span><strong>${formatNumber(evidence.instanceCount)}</strong> live instances</span><span><strong>${evidence.nativeInstancedSubmissions ?? 0}</strong> native submissions</span><span><strong>${evidence.activeLod ?? "pending"}</strong> active LOD</span><span><strong>${evidence.drawCalls ?? 0}</strong> draw calls</span>`
      : `<span>${evidence.status}</span>`;
  }
  const viewLabel = document.querySelector<HTMLElement>("[data-testid='rendering-large-scene-view']");
  if (viewLabel) viewLabel.textContent = evidence.view;
}

function fail(error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  publish({ id: "rendering-large-scene", status: "error", claim: "createAuraApp-root-instancing-and-distance-lod-example", view: activeView, revision, instanceCount: INSTANCE_COUNT, instanceFamilies: 1, errors: [message], knownLimits, error: message });
}

function installShell(): void {
  document.body.innerHTML = `
    <main>
      <section class="stage" aria-label="Interactive Aura3D instancing and LOD scene">
        <canvas data-testid="rendering-large-scene-canvas" aria-label="Data Highlands large-world visualization"></canvas>
        <div class="eyebrow"><span class="pulse"></span> ROOT API · LIVE WEBGL2</div>
        <div class="title-block">
          <p>INSTANCING + DISTANCE LOD</p>
          <h1>Data Highlands</h1>
          <span>A bounded abstract world built from 2,500 native instances and one camera-sensitive landmark.</span>
        </div>
        <div class="view-badge">CAMERA · <strong data-testid="rendering-large-scene-view">overview</strong></div>
      </section>
      <aside>
        <div>
          <p class="kicker">LARGE-WORLD LAB 01</p>
          <h2>One world.<br>Two scale strategies.</h2>
          <p class="lede">Every terrain cell is real Aura3D geometry submitted through one native instanced family. The central tower swaps detail by camera distance.</p>
        </div>
        <div class="controls" role="group" aria-label="Camera distance">
          <button class="active" data-view="overview" aria-pressed="true">Overview</button>
          <button data-view="near" aria-pressed="false">Near detail</button>
          <button data-view="far" aria-pressed="false">Far LOD</button>
        </div>
        <div class="metrics" data-testid="rendering-large-scene-status" aria-live="polite"><span>loading</span></div>
        <div class="legend">
          <span><i class="low"></i>low elevation</span>
          <span><i class="mid"></i>mid elevation</span>
          <span><i class="high"></i>ridge</span>
        </div>
        <p class="limit">Bounded evidence: generated primitive instances + distance LOD. No streaming, imported-GLB instancing, occlusion-culling, or Three.js performance-parity claim.</p>
      </aside>
    </main>`;
  const style = document.createElement("style");
  style.textContent = `
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #071019; color: #edf7f8; }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #071019; }
    body { overflow: hidden; }
    main { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 25rem; }
    .stage { min-width: 0; position: relative; overflow: hidden; background: radial-gradient(circle at 54% 36%, #183747, #071019 72%); }
    canvas { display: block; width: 100%; height: 100vh; }
    .eyebrow, .title-block, .view-badge { position: absolute; z-index: 2; pointer-events: none; }
    .eyebrow { top: 1.5rem; left: 1.6rem; display: flex; align-items: center; gap: .55rem; font: 700 .68rem/1.2 ui-monospace, SFMono-Regular, monospace; letter-spacing: .14em; color: #a4ccd5; }
    .pulse { width: .48rem; height: .48rem; border-radius: 50%; background: #65e1bf; box-shadow: 0 0 16px #65e1bf; }
    .title-block { left: 1.6rem; bottom: 1.55rem; max-width: 31rem; text-shadow: 0 2px 18px #071019; }
    .title-block p, .kicker { margin: 0 0 .45rem; color: #e4b763; font: 700 .7rem/1.2 ui-monospace, SFMono-Regular, monospace; letter-spacing: .16em; }
    h1 { margin: 0; font-size: clamp(2.5rem, 6vw, 5.8rem); font-weight: 520; letter-spacing: -.065em; line-height: .9; }
    .title-block span { display: block; margin-top: .8rem; color: #c3d8dc; line-height: 1.45; }
    .view-badge { right: 1.4rem; top: 1.35rem; padding: .62rem .75rem; border: 1px solid #4d7180; background: #071019a8; color: #9fbec6; font: 650 .66rem/1 ui-monospace, SFMono-Regular, monospace; letter-spacing: .1em; text-transform: uppercase; backdrop-filter: blur(12px); }
    aside { position: relative; z-index: 3; display: flex; flex-direction: column; gap: 1.8rem; padding: 2.2rem 2rem 1.5rem; border-left: 1px solid #24404b; background: linear-gradient(160deg, #10242b 0%, #09161c 75%); box-shadow: -20px 0 60px #02070a66; }
    h2 { margin: 0; font-size: 2.4rem; font-weight: 520; line-height: 1.02; letter-spacing: -.045em; }
    .lede { color: #9fb9c0; line-height: 1.62; font-size: .96rem; }
    .controls { display: grid; grid-template-columns: repeat(3, 1fr); gap: .45rem; }
    button { min-height: 2.65rem; border: 1px solid #35515c; border-radius: .35rem; background: #10272f; color: #aec8ce; font: 650 .72rem/1.2 inherit; cursor: pointer; transition: .18s ease; }
    button:hover { border-color: #63b5bf; color: #efffff; transform: translateY(-1px); }
    button.active { border-color: #e0b761; background: #e0b761; color: #102027; }
    .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: .65rem; }
    .metrics span { min-height: 4rem; display: flex; flex-direction: column; justify-content: center; padding: .7rem; border: 1px solid #28444e; background: #07151ab8; color: #789aa4; font: 600 .67rem/1.35 ui-monospace, SFMono-Regular, monospace; text-transform: uppercase; letter-spacing: .055em; }
    .metrics strong { color: #edf7f8; font-size: 1rem; letter-spacing: 0; }
    .legend { display: flex; flex-wrap: wrap; gap: .8rem 1.1rem; color: #8cabb2; font-size: .72rem; }
    .legend span { display: flex; gap: .38rem; align-items: center; }
    .legend i { width: .52rem; height: .52rem; display: inline-block; border-radius: 2px; }
    .low { background: #183f66; } .mid { background: #48c4b7; } .high { background: #f2c66d; }
    .limit { margin-top: auto; padding-top: 1rem; border-top: 1px solid #28404a; color: #607f88; font-size: .68rem; line-height: 1.55; }
    @media (max-width: 850px) {
      body { overflow: auto; }
      main { grid-template-columns: 1fr; }
      canvas { height: 68vh; min-height: 30rem; }
      aside { border-left: 0; border-top: 1px solid #24404b; }
      .title-block { max-width: calc(100% - 3.2rem); }
    }
  `;
  document.head.append(style);
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export {};
