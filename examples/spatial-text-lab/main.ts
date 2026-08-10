import {
  camera,
  createAuraApp,
  effects,
  labels,
  lights,
  material,
  primitives,
  scene,
  text3D,
  type AuraApp,
  type AuraCameraSpec,
  type AuraSceneBuilder
} from "@aura3d/engine";

type TextLabView = "front" | "oblique";

interface LabelReading {
  readonly id: string;
  readonly text: string;
  readonly visible: boolean;
  readonly occluded: boolean;
  readonly x: number;
  readonly y: number;
}

interface SpatialTextEvidence {
  readonly id: "spatial-text-lab";
  readonly status: "loading" | "ready" | "error";
  readonly claim: "root-mesh-text-and-accessible-world-label-scope-example";
  readonly view: TextLabView;
  readonly revision: number;
  readonly runtimeBackend?: string;
  readonly drawCalls?: number;
  readonly meshText: {
    readonly nodeCount: number;
    readonly glyphCount: number;
    readonly method: string;
    readonly indexedTriangleCount: number;
    readonly depthRange: number;
    readonly normalCount: number;
    readonly unsupportedCharacters: readonly string[];
    readonly canvasRendered: boolean;
  };
  readonly worldLabels: {
    readonly authoredCount: number;
    readonly mountedCount: number;
    readonly visibleCount: number;
    readonly roleNoteCount: number;
    readonly layerOutsideCanvas: boolean;
    readonly readings: readonly LabelReading[];
  };
  readonly errors: readonly string[];
  readonly knownLimits: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_SPATIAL_TEXT_LAB__?: SpatialTextEvidence;
    __AURA3D_SPATIAL_TEXT_SET_VIEW__?: (view: TextLabView) => Promise<void>;
  }
}

const views: Record<TextLabView, AuraCameraSpec> = {
  front: camera.perspective({ position: [0.2, 1.15, 13.2], target: [0, 0.72, 0], fov: 37 }),
  oblique: camera.perspective({ position: [7.2, 2.85, 10.8], target: [-0.25, 0.72, 0], fov: 39 })
};
const knownLimits = [
  "Mesh text is the bounded built-in extruded uppercase alphanumeric catalog; it does not claim arbitrary fonts, Unicode shaping, kerning, SDF/MSDF, or troika-three-text parity.",
  "World labels are accessible screen-facing DOM UI projected from world anchors. They are not lit, extruded, depth-tested mesh text and are not counted as 3D text."
] as const;

let app: AuraApp | undefined;
let activeView: TextLabView = "front";
let revision = 0;

installShell();
publish(loadingEvidence());
void boot().catch(fail);

async function boot(): Promise<void> {
  const canvas = requiredElement<HTMLCanvasElement>("[data-testid='spatial-text-canvas']");
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
  window.__AURA3D_SPATIAL_TEXT_SET_VIEW__ = setView;
  publishReady();
}

function buildScene(view: TextLabView): AuraSceneBuilder {
  return scene()
    .background("#080b12")
    .camera(views[view])
    .add(effects.fog({ name: "typography gallery depth haze", color: "#0b1120", density: 0.012, intensity: 0.18 }))
    .add(effects.bloom({ name: "typography edge bloom", intensity: 0.18, threshold: 0.86, radius: 0.24 }))
    .add(lights.ambient({ name: "gallery ambient", color: "#b8d4f0", intensity: 0.5 }))
    .add(lights.directional({ name: "warm type key", position: [-4, 7, 6], color: "#ffe0ad", intensity: 4.8 }))
    .add(lights.directional({ name: "cool extrusion rim", position: [6, 4, 2], color: "#8fc8ff", intensity: 2.25 }))
    .add(primitives.box({
      name: "gallery back wall",
      material: material.pbr({ color: "#111827", roughness: 0.88, metallic: 0.05 })
    }).position(0, 1.45, -0.9).scale([8.6, 4.9, 0.18]))
    .add(primitives.box({
      name: "gallery floor",
      material: material.pbr({ color: "#151a24", roughness: 0.32, metallic: 0.34 })
    }).position(0, -1.1, 0.2).scale([9, 0.18, 5.4]))
    .add(primitives.box({
      name: "mesh text amber rail",
      material: material.neon({ color: "#f4b85b", emissive: "#f4b85b", emissiveIntensity: 1.55 })
    }).position(-1.05, -0.49, 0.08).scale([5.9, 0.045, 0.06]))
    .add(primitives.box({
      name: "world label cyan rail",
      material: material.neon({ color: "#60d9e9", emissive: "#60d9e9", emissiveIntensity: 1.3 })
    }).position(3.55, 0.2, -0.28).scale([0.045, 3.25, 0.06]))
    .add(text3D("AURA3D", {
      name: "hero extruded mesh text",
      size: 0.9,
      depth: 0.38,
      position: [-4.1, 0.2, 0],
      rotation: [-0.05, 0.04, 0],
      material: material.pbr({ color: "#ffd276", metallic: 0.24, roughness: 0.22 })
    }))
    .add(text3D("MESH", {
      name: "secondary extruded mesh text",
      size: 0.48,
      depth: 0.2,
      position: [-3.82, -0.82, 0.08],
      rotation: [-0.03, 0.04, 0],
      material: material.pbr({ color: "#ecf4ff", metallic: 0.18, roughness: 0.3 })
    }))
    .add(primitives.sphere({
      name: "accessible annotation anchor",
      material: material.neon({ color: "#61e4ef", emissive: "#61e4ef", emissiveIntensity: 2.1 })
    }).position(2.82, 1.58, 0.05).scale(0.12))
    .add(primitives.torus({
      name: "world anchor orbit",
      material: material.pbr({ color: "#4e7188", metallic: 0.35, roughness: 0.38 })
    }).position(2.82, 1.58, -0.08).rotate(Math.PI / 2, 0, 0).scale([0.68, 0.68, 0.08]))
    .add(primitives.box({
      name: "annotation target plinth",
      material: material.pbr({ color: "#1b4150", metallic: 0.25, roughness: 0.38 })
    }).position(2.82, -0.46, -0.05).scale([1.55, 0.16, 1.15]))
    .add(labels.callout("Accessible DOM label", "accessible annotation anchor", {
      name: "accessible annotation callout",
      position: [1.48, 2.28, 0.05],
      anchorWorldPosition: [2.82, 1.58, 0.05],
      color: "#dffcff",
      background: "#0b2730",
      size: 0.35,
      collisionAvoidance: true,
      occlusionAware: true
    }))
    .add(labels.anchor("Tracks its world anchor", "annotation target plinth", {
      name: "world anchor tracking label",
      position: [1.56, 0.22, -0.05],
      color: "#d5f8ff",
      background: "#10202c",
      size: 0.31,
      collisionAvoidance: true,
      occlusionAware: true
    }))
    .add(labels.axisTick("Always screen-facing", {
      name: "screen facing label",
      position: [1.82, -0.72, 0.02],
      color: "#b8eaf2",
      background: "#111c29",
      size: 0.28,
      collisionAvoidance: true,
      occlusionAware: false
    }));
}

function bindControls(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => void setView(button.dataset.view as TextLabView));
  });
}

async function setView(view: TextLabView): Promise<void> {
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
  const snapshot = buildScene(activeView).toJSON();
  const textNodes = snapshot.nodes.filter((node) => node.kind === "primitive" && node.text3D);
  const labelNodes = snapshot.nodes.filter((node) => node.kind === "label");
  const layer = document.querySelector<HTMLElement>(".aura-world-label-layer");
  const notes = [...document.querySelectorAll<HTMLElement>(".aura-world-label-layer [role='note']")];
  const readings = (diagnostics.labels ?? []).map((entry) => ({
    id: entry.id,
    text: notes.find((note) => note.dataset.auraLabelId === entry.id)?.textContent ?? "",
    visible: entry.visible,
    occluded: entry.occluded ?? false,
    x: Math.round(entry.x),
    y: Math.round(entry.y)
  }));
  const meshText = textNodes.map((node) => node.text3D).filter(Boolean);
  const meshGeometries = textNodes.map((node) => node.geometry).filter(Boolean);
  const zValues = meshGeometries.flatMap((geometry) => geometry?.positions.map((position) => position[2]) ?? []);
  publish({
    id: "spatial-text-lab",
    status: diagnostics.errors.length === 0 ? "ready" : "error",
    claim: "root-mesh-text-and-accessible-world-label-scope-example",
    view: activeView,
    revision,
    runtimeBackend: diagnostics.renderer?.runtime.backend,
    drawCalls: diagnostics.drawCalls,
    meshText: {
      nodeCount: meshText.length,
      glyphCount: meshText.reduce((total, entry) => total + (entry?.glyphCount ?? 0), 0),
      method: meshText[0]?.method ?? "missing",
      indexedTriangleCount: meshGeometries.reduce((total, geometry) => total + (geometry?.indices.length ?? 0) / 3, 0),
      depthRange: zValues.length > 0 ? Math.max(...zValues) - Math.min(...zValues) : 0,
      normalCount: meshGeometries.reduce((total, geometry) => total + (geometry?.normals?.length ?? 0), 0),
      unsupportedCharacters: meshText.flatMap((entry) => entry?.unsupportedCharacters ?? []),
      canvasRendered: diagnostics.drawCalls > 0
    },
    worldLabels: {
      authoredCount: labelNodes.length,
      mountedCount: notes.length,
      visibleCount: readings.filter((entry) => entry.visible).length,
      roleNoteCount: notes.filter((note) => note.getAttribute("role") === "note").length,
      layerOutsideCanvas: Boolean(layer && !layer.closest("canvas") && layer.parentElement?.querySelector("canvas")),
      readings
    },
    errors: diagnostics.errors,
    knownLimits
  });
}

function loadingEvidence(): SpatialTextEvidence {
  return {
    id: "spatial-text-lab",
    status: "loading",
    claim: "root-mesh-text-and-accessible-world-label-scope-example",
    view: activeView,
    revision,
    meshText: { nodeCount: 0, glyphCount: 0, method: "pending", indexedTriangleCount: 0, depthRange: 0, normalCount: 0, unsupportedCharacters: [], canvasRendered: false },
    worldLabels: { authoredCount: 0, mountedCount: 0, visibleCount: 0, roleNoteCount: 0, layerOutsideCanvas: false, readings: [] },
    errors: [],
    knownLimits
  };
}

function publish(evidence: SpatialTextEvidence): void {
  window.__AURA3D_SPATIAL_TEXT_LAB__ = evidence;
  document.documentElement.dataset.auraRouteStatus = evidence.status;
  document.body.dataset.aura3dReady = String(evidence.status === "ready");
  const view = document.querySelector<HTMLElement>("[data-testid='spatial-text-view']");
  if (view) view.textContent = evidence.view;
  const metrics = document.querySelector<HTMLElement>("[data-testid='spatial-text-metrics']");
  if (metrics && evidence.status === "ready") {
    metrics.innerHTML = `<span><strong>${evidence.meshText.glyphCount}</strong> mesh glyphs</span><span><strong>${evidence.worldLabels.visibleCount}/${evidence.worldLabels.authoredCount}</strong> visible labels</span><span><strong>${evidence.drawCalls ?? 0}</strong> draw calls</span><span><strong>${evidence.runtimeBackend ?? "pending"}</strong> renderer</span>`;
  }
}

function fail(error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  publish({ ...loadingEvidence(), status: "error", errors: [message], error: message });
}

function installShell(): void {
  document.body.innerHTML = `
    <main>
      <section class="stage" aria-label="Interactive Aura3D mesh text and world label comparison">
        <canvas data-testid="spatial-text-canvas" aria-label="Lit extruded Aura3D mesh text gallery"></canvas>
        <div class="eyebrow"><span></span> ROOT API · TWO TEXT SURFACES</div>
        <div class="view-badge">CAMERA · <strong data-testid="spatial-text-view">front</strong></div>
        <div class="caption">
          <p>WHAT THE CANVAS OWNS</p>
          <strong>Lit geometry, real depth,<br>material response.</strong>
        </div>
      </section>
      <aside>
        <div>
          <p class="kicker">SPATIAL TYPE LAB 02</p>
          <h1>Mesh text is not<br>a world label.</h1>
          <p class="lede">Aura3D exposes both because they solve different jobs. Rotate the camera to reveal physical extrusion while the accessible DOM annotations stay screen-facing and track the scene.</p>
        </div>
        <div class="controls" role="group" aria-label="Typography lab camera">
          <button class="active" data-view="front" aria-pressed="true">Front proof</button>
          <button data-view="oblique" aria-pressed="false">Reveal depth</button>
        </div>
        <div class="scope-grid">
          <article><span class="amber"></span><p>MESH TEXT</p><strong>Canvas geometry</strong><small>Extruded · lit · depth tested · transformed in 3D</small></article>
          <article><span class="cyan"></span><p>WORLD LABEL</p><strong>Accessible DOM UI</strong><small>Crisp · screen-facing · collision + occlusion aware</small></article>
        </div>
        <div class="metrics" data-testid="spatial-text-metrics" aria-live="polite"><span>loading</span></div>
        <p class="limit">Bounded proof: built-in uppercase alphanumeric mesh glyphs plus projected accessible annotations. No arbitrary-font, Unicode-shaping, SDF/MSDF, curved-text, or troika parity claim.</p>
      </aside>
    </main>`;
  const style = document.createElement("style");
  style.textContent = `
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #080b12; color: #f3f6fa; }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #080b12; }
    body { overflow: hidden; }
    main { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 26rem; }
    .stage { min-width: 0; position: relative; overflow: hidden; background: radial-gradient(circle at 45% 35%, #172235, #080b12 72%); }
    canvas { display: block; width: 100%; height: 100vh; }
    .eyebrow, .view-badge, .caption { position: absolute; z-index: 7; pointer-events: none; }
    .eyebrow { top: 1.45rem; left: 1.55rem; display: flex; align-items: center; gap: .55rem; color: #9fb3c8; font: 700 .67rem/1.2 ui-monospace, SFMono-Regular, monospace; letter-spacing: .14em; }
    .eyebrow span { width: .5rem; height: .5rem; border-radius: 50%; background: #61e4ef; box-shadow: 0 0 18px #61e4ef; }
    .view-badge { top: 1.35rem; right: 1.4rem; padding: .62rem .75rem; border: 1px solid #42536b; background: #090d15c7; color: #9db0c6; font: 650 .66rem/1 ui-monospace, SFMono-Regular, monospace; letter-spacing: .1em; text-transform: uppercase; backdrop-filter: blur(12px); }
    .caption { left: 1.6rem; bottom: 1.55rem; text-shadow: 0 2px 18px #080b12; }
    .caption p, .kicker { margin: 0 0 .5rem; color: #e4b45d; font: 700 .68rem/1.2 ui-monospace, SFMono-Regular, monospace; letter-spacing: .16em; }
    .caption strong { font-size: 1.05rem; line-height: 1.35; font-weight: 560; color: #dce6f0; }
    aside { position: relative; z-index: 9; display: flex; flex-direction: column; gap: 1.5rem; padding: 2.1rem 1.9rem 1.45rem; border-left: 1px solid #263448; background: linear-gradient(155deg, #121a28 0%, #0a0f18 78%); box-shadow: -20px 0 60px #02050a66; }
    h1 { margin: 0; font-size: 2.55rem; line-height: 1; letter-spacing: -.052em; font-weight: 540; }
    .lede { color: #9aaabe; line-height: 1.58; font-size: .92rem; }
    .controls { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
    button { min-height: 2.75rem; border: 1px solid #35465c; border-radius: .35rem; background: #111b29; color: #b2c0d1; font: 650 .74rem/1.2 inherit; cursor: pointer; transition: .18s ease; }
    button:hover { border-color: #6d89ab; color: #fff; transform: translateY(-1px); }
    button.active { border-color: #e7b85e; background: #e7b85e; color: #15120c; }
    .scope-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .65rem; }
    article { position: relative; min-height: 8.2rem; padding: .9rem .8rem .78rem; border: 1px solid #29384c; background: #0b121ddb; }
    article > span { display: block; width: 1.8rem; height: .16rem; margin-bottom: .75rem; }
    .amber { background: #e7b85e; box-shadow: 0 0 12px #e7b85e88; } .cyan { background: #61e4ef; box-shadow: 0 0 12px #61e4ef77; }
    article p { margin: 0 0 .35rem; color: #778da5; font: 700 .61rem/1.2 ui-monospace, SFMono-Regular, monospace; letter-spacing: .12em; }
    article strong { display: block; margin-bottom: .42rem; font-size: .86rem; }
    article small { color: #8395aa; font-size: .68rem; line-height: 1.42; }
    .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: .52rem; }
    .metrics span { min-height: 3.6rem; display: flex; flex-direction: column; justify-content: center; padding: .65rem; border: 1px solid #25354a; background: #080e17bf; color: #71869e; font: 600 .62rem/1.32 ui-monospace, SFMono-Regular, monospace; text-transform: uppercase; letter-spacing: .05em; }
    .metrics strong { color: #eef4fb; font-size: .92rem; letter-spacing: 0; text-transform: none; }
    .limit { margin-top: auto; padding-top: .95rem; border-top: 1px solid #26364a; color: #60738a; font-size: .66rem; line-height: 1.5; }
    @media (max-width: 860px) {
      body { overflow: auto; }
      main { grid-template-columns: 1fr; }
      canvas { height: 68vh; min-height: 30rem; }
      aside { border-left: 0; border-top: 1px solid #263448; }
      .scope-grid { grid-template-columns: 1fr; }
    }
  `;
  document.head.append(style);
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

export {};
