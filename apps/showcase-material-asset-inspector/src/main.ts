import {
  camera,
  collectAuraSceneEvidence,
  createAuraApp,
  createAuraRouteHealthSnapshot,
  group,
  interactions,
  labels,
  lights,
  material,
  model,
  placedBoundsFromAsset,
  prefabs,
  primitives,
  resolveBoundsAnchor,
  scene,
  timeline,
  type AuraApp,
  type AuraMaterialSpec,
  type AuraSceneNode,
  type AuraSceneSnapshot
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

type ViewMode = "compare" | "asset" | "grid" | "exploded";
type LightingMode = "material" | "studio" | "metal" | "glass";

interface InspectorState {
  view: ViewMode;
  lighting: LightingMode;
}

declare global {
  interface Window {
    __AURA3D_SHOWCASE_MATERIAL_ASSET_INSPECTOR__?: InspectorEvidence;
  }
}

interface InspectorEvidence {
  readonly schema: "aura3d-showcase-material-asset-inspector/1.0";
  readonly appId: "showcase-material-asset-inspector";
  readonly status: "loading" | "ready" | "error";
  readonly updatedAt: string;
  readonly state: InspectorState;
  readonly interactionState: {
    readonly lastChanged: string;
    readonly revision: number;
    readonly frameCount: number;
  };
  readonly telemetry: {
    readonly nodeCount: number;
    readonly modelCount: number;
    readonly labelCount: number;
    readonly drawCalls: number;
    readonly view: ViewMode;
    readonly lighting: LightingMode;
  };
  readonly asset: {
    readonly id: string;
    readonly typedRef: "assets.showcaseHeadphones";
    readonly url: string;
    readonly hash?: string;
    readonly license: string;
    readonly author: string;
    readonly materialNames: readonly string[];
    readonly textureCount: number;
    readonly nodeCount: number;
    readonly bounds: readonly number[];
  };
  readonly controls: readonly string[];
  readonly systems: readonly string[];
  readonly claimBoundary: string;
  readonly readiness: readonly ReadinessItem[];
  readonly extensionPanels: readonly ExtensionItem[];
  readonly materialInspectors: readonly unknown[];
  readonly materialVisualQA: unknown;
  readonly auraSceneEvidence: unknown;
  readonly routeHealth?: unknown;
  readonly diagnostics?: {
    readonly backend: string;
    readonly drawCalls: number;
    readonly fps: number;
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  };
  readonly proceduralStatus: readonly string[];
}

interface ReadinessItem {
  readonly label: string;
  readonly status: "pass" | "review";
  readonly detail: string;
}

interface ExtensionItem {
  readonly label: string;
  readonly value: string;
}

interface MaterialCard {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly source: string;
  readonly spec: AuraMaterialSpec;
}

const inspectedAsset = assets.showcaseHeadphones;

const previewScale = normalizedModelScale(0.4583);
/**
 * Placed bounds of the inspected asset for the current view.
 *
 * The route renders the asset with `model(...).position(x, y, z).scale(scale)`, so the
 * exploded layers must be anchored to that placement rather than to literals tuned against
 * one view at one scale. `AURA_NORMALIZED_MODEL_MAX_DIMENSION` is the size the safe renderer
 * normalizes a typed GLB to before node scale is applied.
 */
function inspectedAssetBounds(nextState: InspectorState) {
  const previewX = nextState.view === "compare" ? -0.34 : 0.18;
  const previewScaleFactor = nextState.view === "compare" ? 0.9 : 1.06;
  const previewY = nextState.view === "exploded" ? 0.66 : 0.64;
  return placedBoundsFromAsset(inspectedAsset, {
    targetMaxDimension: 1.55 * previewScale * previewScaleFactor,
    position: [previewX, previewY + 0.02, -0.34],
    floorY: previewY + 0.02
  });
}
const assetMetadata = inspectedAsset.metadata;
const assetProvenance = assetMetadata.provenance;
const materialMetadata = assetMetadata.materialMetadata;


const materialCards: readonly MaterialCard[] = [
  {
    id: "authored",
    label: materialMetadata[0]?.name ?? "Authored material",
    color: "#252627",
    source: "typed asset material metadata",
    spec: material.pbr({ name: "authored headphones PBR reference", color: "#252627", roughness: 0.48, metallic: 0.08 })
  },
  {
    id: "chrome",
    label: "Chrome response",
    color: "#dce8f2",
    source: "material.inspector chrome preset",
    spec: material.chrome({ color: "#dce8f2", roughness: 0.018 })
  },
  {
    id: "rubber",
    label: "Cushion rubber",
    color: "#111317",
    source: "material.inspector rubber preset",
    spec: material.blackRubber({ color: "#111317", roughness: 0.98 })
  },
  {
    id: "glass",
    label: "Clear lens",
    color: "#bceeff",
    source: "material.inspector glass preset",
    spec: material.clearGlass({ color: "#bceeff", opacity: 0.2, transmission: 1 })
  }
];

const state: InspectorState = {
  view: "asset",
  lighting: "studio"
};

const controls = [
  "view segmented control",
  "lighting preset segmented control",
  "orbit interaction in scene graph",
  "asset passport",
  "material card dock",
  "inspection evidence summary"
] as const;

let app: AuraApp;
let frameTick = 0;
let lastInteraction = "initial-load";
let interactionRevision = 0;

const initialScene = buildInspectorScene(state);
publishEvidence("loading", initialScene.toJSON());
renderStaticPanels();

app = createAuraApp("#aura-stage", {
  diagnostics: { overlay: false, assetPanel: false, performancePanel: false },
  pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
  scene: initialScene
});
publishEvidence(app.diagnostics().errors.length > 0 ? "error" : "ready", app.scene);

app.onFrame(() => {
  frameTick += 1;
  if (frameTick <= 4 || frameTick % 45 === 0) {
    publishEvidence(app.diagnostics().errors.length > 0 ? "error" : "ready", app.scene);
    renderHealth();
  }
});

bindControls();
renderControls();
renderHealth();

function buildInspectorScene(nextState: InspectorState) {
  const nodes: AuraSceneNode[] = [
    ...inspectorStageNodes(nextState),
    ...assetPreviewNodes(nextState),
    ...comparisonNodes(nextState),
    ...lightingNodes(nextState),
    interactions.orbit({ target: "typed inspected headphones asset" }).toJSON()
  ];

  return scene()
    .background("#080a09")
    .addMany(nodes)
    .camera(cameraFor(nextState))
    .timeline(timeline.loop({ seconds: 10 }));
}

function inspectorStageNodes(_nextState: InspectorState): readonly AuraSceneNode[] {
  return [
    primitives.cylinder({
      name: "polished asset inspection plinth",
      material: material.clearcoatPaint({ color: "#1d2322", roughness: 0.38, metallic: 0.04, clearcoat: 0.52 })
    }).position(0.18, 0.08, -0.42).scale([1.02, 0.045, 0.52]).toJSON()
  ];
}

function assetPreviewNodes(nextState: InspectorState): readonly AuraSceneNode[] {
  if (nextState.view === "grid") {
    return [
      model(inspectedAsset, { name: "typed inspected headphones asset small reference", material: material.pbr({ color: "#252627", roughness: 0.5, metallic: 0.08 }) })
        .position(-2.78, 0.46, 0.12)
        .rotate(0, -0.42, 0)
        .scale(previewScale * 0.56)
        .runtime({ id: "inspected-headphones-reference", tags: ["typed-asset", "showcaseHeadphones", "reference"] })
        .toJSON()
    ];
  }

  const x = nextState.view === "compare" ? -0.34 : 0.18;
  const scale = nextState.view === "compare" ? previewScale * 0.9 : previewScale * 1.06;
  const y = nextState.view === "exploded" ? 0.66 : 0.64;
  const previewMaterial = nextState.lighting === "metal"
    ? material.brushedMetal({ color: "#d9e1e7", roughness: 0.2, anisotropy: 0.74 })
    : nextState.lighting === "glass"
      ? material.clearGlass({ color: "#bceeff", opacity: 0.3, transmission: 0.86 })
      : nextState.lighting === "studio"
        ? material.clearcoatPaint({ name: "warm inspected headphones studio material", color: "#b98263", roughness: 0.18, metallic: 0.04, clearcoat: 0.82 })
        : material.pbr({ name: "authored headphones material preview", color: "#252627", roughness: 0.48, metallic: 0.08 });

  const nodes: AuraSceneNode[] = [
    model(inspectedAsset, { name: "typed inspected headphones asset", material: previewMaterial })
      .position(x, y + 0.02, -0.34)
      .rotate(0, nextState.view === "exploded" ? -0.22 : -0.38, 0)
      .scale(scale)
      .animate({ clip: "turntable", speed: 0.18, duration: 10, captureTime: 0.42 })
      .runtime({ id: "inspected-headphones", tags: ["typed-asset", "showcaseHeadphones", "inspected-asset"] })
      .toJSON()
  ];

  if (nextState.view === "exploded") {
    nodes.push(group("procedural exploded asset inspection layers", explodedInspectionNodes(nextState), {
      animation: { clip: "explode-preview", duration: 2.6, captureTime: 1.5, easing: "easeInOut" }
    }).toJSON());
  }

  return nodes;
}

function comparisonNodes(nextState: InspectorState): readonly AuraSceneNode[] {
  if (nextState.view === "asset") {
    return [];
  }
  if (nextState.view === "grid") {
    return [
      group("full material comparison grid", prefabs.materialSwatches(), {
        position: [0.28, 0.18, -0.28],
        scale: 0.5
      }).toJSON()
    ];
  }
  return [
    group("visible material comparison grid beside asset", prefabs.materialSwatches(), {
      position: [1.44, 0.2, -0.34],
      scale: 0.26
    }).toJSON()
  ];
}

function compactMaterialStrip(): readonly AuraSceneNode[] {
  return materialCards.map((card, index) =>
    primitives.sphere({
      name: `compact inspected material card swatch ${card.id}`,
      material: card.spec
    }).position(-1.2 + index * 0.8, 0.36, 0.52).scale(0.2).toJSON()
  );
}

/**
 * Exploded inspection layers, anchored to the inspected asset.
 *
 * Every proxy previously carried a literal world position tuned against one asset at one
 * preview scale. Deriving them from the asset's placed bounds means an asset swap, a scale
 * change, or a different preview position moves the whole exploded view together instead of
 * leaving proxies stranded beside the product.
 */
function explodedInspectionNodes(nextState: InspectorState): readonly AuraSceneNode[] {
  const bounds = inspectedAssetBounds(nextState);
  const left = resolveBoundsAnchor(bounds, "left", { offset: bounds.size[0] * 0.35 }).position;
  const right = resolveBoundsAnchor(bounds, "right", { offset: bounds.size[0] * 0.2 }).position;
  const midY = bounds.center[1];
  const rear = bounds.center[2] - bounds.size[2] * 0.3;
  return [
    primitives.box({ name: "procedural material layer shell proxy", material: material.clearcoatPaint({ color: "#252627", roughness: 0.16, clearcoat: 0.78 }) })
      .position(left[0], midY + bounds.size[1] * 0.1, rear).scale([bounds.size[0] * 0.2, bounds.size[1] * 0.46, bounds.size[2] * 0.14]).toJSON(),
    primitives.box({ name: "procedural material layer inner foam proxy", material: material.blackRubber({ color: "#10100f", roughness: 0.98 }) })
      .position(left[0] * 0.5, midY, bounds.center[2] - bounds.size[2] * 0.1).scale([bounds.size[0] * 0.18, bounds.size[1] * 0.35, bounds.size[2] * 0.11]).toJSON(),
    primitives.cylinder({ name: "procedural material layer driver metal proxy", material: material.chrome({ color: "#dbe2e8", roughness: 0.04 }) })
      .position(bounds.center[0], midY, bounds.center[2]).rotate(1.5708, 0, 0).scale([bounds.size[0] * 0.19, bounds.size[1] * 0.032, bounds.size[0] * 0.19]).toJSON(),
    primitives.box({ name: "procedural material layer cable strain relief proxy", material: material.blackRubber({ color: "#080807" }) })
      .position(right[0], midY - bounds.size[1] * 0.24, bounds.center[2] - bounds.size[2] * 0.06).scale([bounds.size[0] * 0.09, bounds.size[1] * 0.28, bounds.size[2] * 0.11]).toJSON(),
    primitives.box({ name: "exploded inspection layer connector line one", material: material.emissive({ color: "#82d3bc", emissive: "#82d3bc" }) })
      .position(left[0] * 0.75, midY + bounds.size[1] * 0.08, rear * 0.7).rotate(0, -0.22, 0).scale([bounds.size[0] * 0.34, 0.018, 0.018]).toJSON(),
    primitives.box({ name: "exploded inspection layer connector line two", material: material.emissive({ color: "#e7bd6c", emissive: "#e7bd6c" }) })
      .position(left[0] * 0.28, midY, bounds.center[2] - bounds.size[2] * 0.06).rotate(0, -0.12, 0).scale([bounds.size[0] * 0.31, 0.018, 0.018]).toJSON(),
    labels.callout("Authored GLB plus procedural layer proxies", "typed inspected headphones asset", {
      name: "exploded preview provenance callout",
      position: [right[0] + bounds.size[0] * 0.2, bounds.max[1] + bounds.size[1] * 0.3, bounds.center[2]],
      // Anchored to the asset, so the leader line points at the product rather than at the
      // label's own position.
      anchorWorldPosition: [bounds.center[0], bounds.center[1], bounds.center[2]],
      size: 0.15,
      collisionAvoidance: true,
      occlusionAware: true
    }).toJSON()
  ];
}

function lightingNodes(nextState: InspectorState): readonly AuraSceneNode[] {
  return [
    lights.materialLab({ intensity: nextState.lighting === "material" ? 1.95 : 1.55 }).toJSON(),
    lights.rect({
      name: "left inspector softbox",
      position: [-2.6, 2.25, 1.6],
      intensity: nextState.lighting === "glass" ? 0.78 : 0.58,
      width: 2.4,
      height: 1.2,
      color: "#f8fbff"
    }).toJSON(),
    lights.rect({
      name: "right inspector grazing strip",
      position: [2.6, 1.72, 1.4],
      intensity: nextState.lighting === "metal" ? 0.92 : 0.52,
      width: 2.1,
      height: 0.82,
      color: nextState.lighting === "metal" ? "#f0d7a6" : "#d8f7ff"
    }).toJSON()
  ];
}

function cameraFor(nextState: InspectorState) {
  if (nextState.view === "grid") {
    return camera.perspective({ position: [0.24, 1.92, 5.25], target: [0.25, 0.76, -0.78], fov: 36 });
  }
  if (nextState.view === "asset") {
    return camera.perspective({ position: [1.18, 1, 2.24], target: [0.18, 0.64, -0.3], fov: 28 });
  }
  if (nextState.view === "exploded") {
    return camera.perspective({ position: [1.55, 1.14, 2.85], target: [0.1, 0.76, -0.34], fov: 30 });
  }
  return camera.perspective({ position: [0.88, 1.18, 3.18], target: [0.02, 0.74, -0.58], fov: 30 });
}

function readinessItems(): readonly ReadinessItem[] {
  return [
    { label: "Typed GLB", status: "pass", detail: "showcaseHeadphones" },
    { label: "License", status: "pass", detail: `${assetProvenance.license} | ${assetProvenance.author}` },
    { label: "Materials", status: "pass", detail: `${materialMetadata.length} readable record` },
    { label: "Textures", status: "pass", detail: `${assetMetadata.textures.length} embedded slots` },
    { label: "Animation", status: "review", detail: "Not required for product inspection" }
  ];
}

function extensionItems(): readonly ExtensionItem[] {
  return [
    { label: "Material path", value: "Root-safe material comparison" },
    { label: "Texture slots", value: `${assetMetadata.textures.length} retained typed entries` },
    { label: "Skeleton", value: assetMetadata.skeleton.messages.join(" ") },
    { label: "Morph targets", value: assetMetadata.morphTargets.messages.join(" ") }
  ];
}

/**
 * Multiplier that lands an already-normalized typed model at a target world size.
 *
 * `model(asset)` normalizes a typed GLB to a fixed max dimension before applying
 * `.scale()`, so the multiplier must NOT be derived from the asset's raw bounds. The
 * previous helper divided a target by the raw max bound, which only appeared to work
 * because the manifest bounds were themselves wrong: once bounds were corrected to real
 * scene space, an asset carrying a 100x node scale reported ~937 units and the derived
 * multiplier collapsed, rendering the product as a dot. This route uses a fixed
 * perspective camera rather than auto-framing, so the rendered world size has to be
 * stated directly.
 */
function normalizedModelScale(targetWorldSize: number): number {
  const normalizedMaxDimension = 1.55;
  return Number((targetWorldSize / normalizedMaxDimension).toPrecision(6));
}

function bindControls(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      if (view === "compare" || view === "asset" || view === "grid" || view === "exploded") {
        state.view = view;
        updateScene(`view:${view}`);
      }
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-lighting]").forEach((button) => {
    button.addEventListener("click", () => {
      const lighting = button.dataset.lighting;
      if (lighting === "material" || lighting === "studio" || lighting === "metal" || lighting === "glass") {
        state.lighting = lighting;
        updateScene(`lighting:${lighting}`);
      }
    });
  });
}

function updateScene(change: string): void {
  lastInteraction = change;
  interactionRevision += 1;
  const nextScene = buildInspectorScene(state);
  app.setScene(nextScene);
  renderControls();
  publishEvidence("ready", nextScene.toJSON());
  renderHealth();
}

function renderStaticPanels(): void {
  const readiness = document.querySelector("#readiness-list");
  if (readiness) {
    readiness.innerHTML = readinessItems()
      .map((item) => `
        <li data-status="${escapeHtml(item.status)}">
          <span class="readiness-label">${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.detail)}</strong>
        </li>
      `)
      .join("");
  }

  const cards = document.querySelector("#material-cards");
  if (cards) {
    cards.innerHTML = materialCards
      .map((card) => `
        <article class="material-card">
          <div class="material-chip" style="--chip: ${escapeHtml(card.color)}"></div>
          <div>
            <strong>${escapeHtml(card.label)}</strong>
            <span>${escapeHtml(card.source)}</span>
          </div>
        </article>
      `)
      .join("");
  }

  const extensions = document.querySelector("#extension-list");
  if (extensions) {
    extensions.innerHTML = extensionItems()
      .map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`)
      .join("");
  }
}

function renderControls(): void {
  setActive("[data-view]", state.view);
  setActive("[data-lighting]", state.lighting);
}

function renderHealth(): void {
  const diagnostics = app.diagnostics();
  const status = diagnostics.errors.length > 0 ? "error" : "ready";
  setText("#health-state", status);
  setText("#health-draws", `${diagnostics.drawCalls} draws`);
  document.body.dataset.showcaseMaterialAssetInspector = status;
}

function publishEvidence(status: InspectorEvidence["status"], snapshot: AuraSceneSnapshot): void {
  const diagnostics = typeof app !== "undefined" ? app.diagnostics() : undefined;
  const routeHealth = typeof app !== "undefined" ? createAuraRouteHealthSnapshot(app) : undefined;
  const materialInspectors = materialCards.map((card) => material.inspector(card.label, card.spec));
  const materialVisualQA = material.visualQA(materialQaNodes(snapshot));
  const evidence: InspectorEvidence = {
    schema: "aura3d-showcase-material-asset-inspector/1.0",
    appId: "showcase-material-asset-inspector",
    status,
    updatedAt: new Date().toISOString(),
    state: { ...state },
    interactionState: {
      lastChanged: lastInteraction,
      revision: interactionRevision,
      frameCount: frameTick
    },
    telemetry: {
      nodeCount: snapshot.nodes.length,
      modelCount: snapshot.nodes.filter((node) => node.kind === "model").length,
      labelCount: snapshot.nodes.filter((node) => node.kind === "label").length,
      drawCalls: diagnostics?.drawCalls ?? 0,
      view: state.view,
      lighting: state.lighting
    },
    asset: {
      id: inspectedAsset.id,
      typedRef: "assets.showcaseHeadphones",
      url: inspectedAsset.url,
      hash: inspectedAsset.hash,
      license: assetProvenance.license,
      author: assetProvenance.author,
      materialNames: assetMetadata.materials,
      textureCount: assetMetadata.textures.length,
      nodeCount: assetMetadata.nodeNames.length,
      bounds: inspectedAsset.bounds ?? []
    },
    controls,
    systems: [
      "typed inspected model(assets.showcaseHeadphones)",
      "asset provenance and metadata panel",
      "material inspector cards",
      "texture and animation diagnostics",
      "material visual QA",
      "lighting and compare controls",
      "route-health evidence global"
    ],
    claimBoundary: "Typed asset and material inspection showcase using Aura3D public APIs and generated asset metadata. It does not claim external asset editing, private loaders, or launch acceptance before route-health, screenshot, asset validation, visual review, and deploy checks.",
    readiness: readinessItems(),
    extensionPanels: extensionItems(),
    materialInspectors,
    materialVisualQA,
    auraSceneEvidence: diagnostics?.evidence ?? collectAuraSceneEvidence(snapshot),
    ...(routeHealth ? { routeHealth } : {}),
    ...(diagnostics ? {
      diagnostics: {
        backend: diagnostics.backend,
        drawCalls: diagnostics.drawCalls,
        fps: diagnostics.fps,
        warnings: diagnostics.warnings,
        errors: diagnostics.errors
      }
    } : {}),
    proceduralStatus: [
      "Primary inspected model is model(assets.showcaseHeadphones).",
      "Comparison spheres, extension rails, exploded layers, and labels are procedural inspection geometry.",
      "No raw GLB URLs or string asset ids are used by the route."
    ]
  };
  window.__AURA3D_SHOWCASE_MATERIAL_ASSET_INSPECTOR__ = evidence;
  renderEvidencePanel(evidence);
}

function materialQaNodes(snapshot: AuraSceneSnapshot): readonly AuraSceneNode[] {
  const comparisonGroups = snapshot.nodes.filter((node) =>
    node.kind === "group" && String(node.name ?? "").includes("material comparison grid")
  );
  return comparisonGroups.length > 0 ? comparisonGroups : prefabs.materialSwatches();
}

function renderEvidencePanel(evidence: InspectorEvidence): void {
  const visualQa = materialVisualQaSummary(evidence.materialVisualQA);
  const evidencePanel = document.querySelector("#evidence-summary");
  if (!evidencePanel) return;
  const rows = [
    ["Route", evidence.status],
    ["View", `${evidence.state.view} / ${evidence.state.lighting}`],
    ["Renderer", `${evidence.diagnostics?.backend ?? "pending"} / ${evidence.diagnostics?.drawCalls ?? 0} draws`],
    ["Material QA", visualQa.passes === true ? `pass ${String(visualQa.score ?? "")}`.trim() : "bounded"]
  ] as const;
  evidencePanel.innerHTML = rows
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`)
    .join("");
}

function materialVisualQaSummary(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return { status: "unavailable" };
  const record = value as Record<string, unknown>;
  const classes = Array.isArray(record.classes) ? record.classes.filter((entry): entry is string => typeof entry === "string") : [];
  return {
    passes: record.passes === true,
    score: typeof record.score === "number" ? record.score : undefined,
    classes: classes.slice(0, 4)
  };
}

function setActive(selector: string, value: string): void {
  document.querySelectorAll<HTMLButtonElement>(selector).forEach((button) => {
    const active = Object.values(button.dataset).includes(value);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setText(selector: string, value: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
