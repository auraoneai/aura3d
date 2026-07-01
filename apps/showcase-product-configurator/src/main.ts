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
  primitives,
  product,
  scene,
  timeline,
  type AuraApp,
  type AuraMaterialSpec,
  type AuraSceneNode,
  type AuraSceneSnapshot
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

type VariantId = "graphite" | "ceramic" | "copper";
type FinishId = "satin" | "gloss" | "titanium";
type FocusId = "overview" | "earcups" | "headband" | "cushions";

interface ConfiguratorState {
  variant: VariantId;
  finish: FinishId;
  focus: FocusId;
  exploded: boolean;
  turntable: boolean;
}

declare global {
  interface Window {
    __AURA3D_SHOWCASE_PRODUCT_CONFIGURATOR__?: ConfiguratorEvidence;
  }
}

interface ConfiguratorEvidence {
  readonly schema: "aura3d-showcase-product-configurator/1.0";
  readonly appId: "showcase-product-configurator";
  readonly status: "loading" | "ready" | "error";
  readonly updatedAt: string;
  readonly state: ConfiguratorState;
  readonly interactionState: {
    readonly lastChanged: string;
    readonly revision: number;
    readonly frameCount: number;
  };
  readonly telemetry: {
    readonly nodeCount: number;
    readonly modelCount: number;
    readonly drawCalls: number;
    readonly materialOverride: string;
    readonly focus: FocusId;
    readonly exploded: boolean;
    readonly turntable: boolean;
  };
  readonly asset: {
    readonly id: string;
    readonly typedRef: "assets.showcaseHeadphones";
    readonly url: string;
    readonly hash?: string;
    readonly license: string;
    readonly author: string;
    readonly sourceFamily: string;
    readonly materialCount: number;
    readonly textureCount: number;
    readonly bounds: readonly number[];
  };
  readonly controls: readonly string[];
  readonly systems: readonly string[];
  readonly claimBoundary: string;
  readonly proceduralStatus: readonly string[];
  readonly scene: {
    readonly nodes: number;
    readonly modelCount: number;
    readonly materialOverride: string;
    readonly partFocus: FocusId;
    readonly explodedPreview: boolean;
    readonly turntable: boolean;
  };
  readonly productDiagnostics: unknown;
  readonly productVisualQA: unknown;
  readonly auraSceneEvidence: unknown;
  readonly routeHealth?: unknown;
  readonly diagnostics?: {
    readonly backend: string;
    readonly drawCalls: number;
    readonly fps: number;
    readonly renderSize: readonly [number, number];
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  };
}

const productAsset = assets.showcaseHeadphones;
const assetMetadata = productAsset.metadata;
const assetProvenance = assetMetadata.provenance;
const materialMetadata = assetMetadata.materialMetadata;
const productScale = normalizedAssetScale(productAsset.bounds, 3);

const variants: Record<VariantId, { readonly label: string; readonly color: string; readonly accent: string }> = {
  graphite: { label: "Graphite Studio", color: "#252627", accent: "#cdbd99" },
  ceramic: { label: "Ceramic Pearl", color: "#eee8db", accent: "#2f3334" },
  copper: { label: "Copper Limited", color: "#a85634", accent: "#f2c06d" }
};

const finishes: Record<FinishId, { readonly label: string; readonly roughness: number; readonly metallic: number; readonly clearcoat: number; readonly accentMaterial: AuraMaterialSpec }> = {
  satin: {
    label: "Satin polymer",
    roughness: 0.62,
    metallic: 0.04,
    clearcoat: 0.24,
    accentMaterial: material.blackRubber({ color: "#111111", roughness: 0.94 })
  },
  gloss: {
    label: "Gloss clearcoat",
    roughness: 0.09,
    metallic: 0.03,
    clearcoat: 0.96,
    accentMaterial: material.clearGlass({ color: "#f8fbff", opacity: 0.18, transmission: 0.72 })
  },
  titanium: {
    label: "Brushed titanium",
    roughness: 0.27,
    metallic: 0.86,
    clearcoat: 0.18,
    accentMaterial: material.brushedMetal({ color: "#b7bec6", roughness: 0.28, anisotropy: 0.72 })
  }
};

const state: ConfiguratorState = {
  variant: "copper",
  finish: "gloss",
  focus: "overview",
  exploded: false,
  turntable: false
};

const controls = [
  "variant segmented control",
  "material finish swatches",
  "part focus segmented control",
  "exploded mode toggle",
  "turntable toggle",
  "orbit interaction in scene graph"
] as const;

let app: AuraApp;
let frameTick = 0;
let lastInteraction = "initial-load";
let interactionRevision = 0;

const initialScene = buildConfiguratorScene(state);
const initialSnapshot = initialScene.toJSON();

publishEvidence("loading", initialSnapshot);
renderStaticAssetPanel();

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
    renderMetrics();
  }
});

bindControls();
renderControls();
renderMetrics();

function buildConfiguratorScene(nextState: ConfiguratorState) {
  const activeVariant = variants[nextState.variant];
  const activeFinish = finishes[nextState.finish];
  const productMaterial = productMaterialFor(nextState);
  const productModel = model(productAsset, {
    name: "configured typed headphones product",
    material: productMaterial,
    castShadow: true,
    receiveShadow: true
  })
    .position(0, 0.46, -0.22)
    .rotate(0, focusYaw(nextState.focus), 0)
    .scale(productScale)
    .runtime({ id: "configured-headphones", tags: ["typed-asset", "showcaseHeadphones", "configurable-product"] });

  const builder = scene()
    .background("#050607")
    .addMany(compactProductStageNodes(nextState))
    .add(nextState.turntable
      ? productModel.animate({ clip: "turntable", speed: 0.36, duration: 9, captureTime: 0.36 })
      : productModel)
    .addMany(configuratorSceneAccents(nextState))
    .add(lights.ambient({ name: "product configurator ambient fill", intensity: 0.3, color: "#f4efe6" }))
    .add(lights.point({ name: "large product key light", position: [-1.8, 2.2, 2.1], intensity: 2.35, color: "#fff8ee" }))
    .add(lights.point({ name: "cool product rim light", position: [1.8, 1.45, 0.2], intensity: 0.86, color: "#b9e7ff" }))
    .add(lights.rect({
      name: "long warm showroom reflection card",
      position: [2.75, 1.62, 1.72],
      intensity: nextState.variant === "copper" ? 0.78 : 0.5,
      color: activeVariant.accent,
      width: 2.6,
      height: 0.72
    }))
    .add(interactions.orbit({ target: "configured typed headphones product" }))
    .camera(cameraFor(nextState))
    .timeline(timeline.loop({ seconds: 9 }));

  return builder;
}

function compactProductStageNodes(nextState: ConfiguratorState): readonly AuraSceneNode[] {
  const warmStudioMaterial = material.pbr({
    name: "warm product studio plinth material",
    color: nextState.variant === "ceramic" ? "#d8d2c4" : "#27231e",
    roughness: 0.58,
    metallic: 0.04,
    opacity: 0.94
  });
  return [
    primitives.cylinder({
      name: "low oval product studio plinth",
      material: warmStudioMaterial
    }).position(0, -0.1, -0.18).scale([0.92, 0.045, 0.56]).toJSON()
  ];
}

function configuratorSceneAccents(nextState: ConfiguratorState): readonly AuraSceneNode[] {
  const activeVariant = variants[nextState.variant];
  const activeFinish = finishes[nextState.finish];
  const nodes: AuraSceneNode[] = [
    primitives.box({
      name: "selected variant finish sample",
      material: material.clearcoatPaint({ color: activeVariant.color, roughness: activeFinish.roughness, metallic: activeFinish.metallic, clearcoat: activeFinish.clearcoat })
    }).position(-0.36, -0.02, 0.36).scale([0.12, 0.028, 0.08]).toJSON(),
    primitives.box({
      name: "selected acoustic cushion sample",
      material: activeFinish.accentMaterial
    }).position(-0.2, -0.02, 0.36).scale([0.12, 0.028, 0.08]).toJSON(),
    primitives.box({
      name: "compact release evidence status rail",
      material: material.emissive({ color: "#9bd37a", emissive: "#9bd37a", emissiveIntensity: 0.52 })
    }).position(0.34, -0.02, 0.36).scale([0.16, 0.012, 0.014]).toJSON()
  ];

  if (nextState.focus !== "overview") {
    nodes.push(...focusNodes(nextState.focus, activeVariant.accent));
  }

  if (nextState.exploded) {
    nodes.push(
      group("procedural exploded headphones part proxies", explodedProxyNodes(nextState), {
        position: [0, 0, 0],
        animation: { clip: "explode-preview", duration: 2.4, captureTime: 1.6, easing: "easeInOut" }
      }).toJSON()
    );
  }

  return nodes;
}

function focusNodes(focus: FocusId, color: string): readonly AuraSceneNode[] {
  const focusMap: Record<Exclude<FocusId, "overview">, { readonly label: string; readonly position: readonly [number, number, number]; readonly scale: readonly [number, number, number] }> = {
    earcups: { label: "Earcup acoustic housings", position: [0, 0.55, -0.05], scale: [1.22, 0.08, 0.78] },
    headband: { label: "Headband structure", position: [0, 1.12, -0.62], scale: [1.06, 0.06, 0.22] },
    cushions: { label: "Soft cushion contact area", position: [0, 0.36, -0.18], scale: [0.96, 0.06, 0.62] }
  };
  if (focus === "overview") return [];
  const active = focusMap[focus];
  return [
    primitives.torus({
      name: `${focus} focus halo`,
      material: material.emissive({ color, emissive: color, emissiveIntensity: 0.6, opacity: 0.58 })
    }).position(...active.position).rotate(1.5708, 0, 0).scale(active.scale).toJSON(),
    labels.callout(active.label, "configured typed headphones product", {
      name: `${focus} focus part callout`,
      position: [active.position[0] + 0.72, active.position[1] + 0.34, active.position[2] + 0.18],
      size: 0.16,
      collisionAvoidance: true,
      occlusionAware: true
    }).toJSON()
  ];
}

function explodedProxyNodes(nextState: ConfiguratorState): readonly AuraSceneNode[] {
  const variant = variants[nextState.variant];
  const finish = finishes[nextState.finish];
  const shell = material.clearcoatPaint({
    name: "procedural shell proxy material",
    color: variant.color,
    roughness: finish.roughness,
    metallic: finish.metallic,
    clearcoat: finish.clearcoat
  });
  const cushion = material.blackRubber({ color: "#0d0c0b", roughness: 0.96 });
  const driver = material.brushedMetal({ color: "#c7c3b8", roughness: 0.24, anisotropy: 0.64 });
  return [
    primitives.box({ name: "procedural exploded left earcup shell proxy", material: shell }).position(-1.05, 0.62, -0.56).rotate(0, 0.18, 0).scale([0.26, 0.48, 0.12]).toJSON(),
    primitives.box({ name: "procedural exploded right earcup shell proxy", material: shell }).position(1.05, 0.62, -0.56).rotate(0, -0.18, 0).scale([0.26, 0.48, 0.12]).toJSON(),
    primitives.torus({ name: "procedural exploded left cushion proxy", material: cushion }).position(-0.64, 0.5, -0.2).rotate(1.5708, 0, 0).scale([0.36, 0.52, 0.08]).toJSON(),
    primitives.torus({ name: "procedural exploded right cushion proxy", material: cushion }).position(0.64, 0.5, -0.2).rotate(1.5708, 0, 0).scale([0.36, 0.52, 0.08]).toJSON(),
    primitives.cylinder({ name: "procedural exploded left driver disc proxy", material: driver }).position(-0.42, 0.53, -0.04).rotate(1.5708, 0, 0).scale([0.22, 0.035, 0.22]).toJSON(),
    primitives.cylinder({ name: "procedural exploded right driver disc proxy", material: driver }).position(0.42, 0.53, -0.04).rotate(1.5708, 0, 0).scale([0.22, 0.035, 0.22]).toJSON(),
    primitives.box({ name: "procedural exploded headband strap proxy", material: shell }).position(0, 1.28, -0.5).scale([1.1, 0.08, 0.14]).toJSON(),
    primitives.box({ name: "exploded assembly offset guide left", material: material.emissive({ color: "#f3c46f", emissive: "#f3c46f", opacity: 0.62 }) }).position(-0.8, 0.64, -0.42).rotate(0, -0.4, 0).scale([0.52, 0.018, 0.018]).toJSON(),
    primitives.box({ name: "exploded assembly offset guide right", material: material.emissive({ color: "#f3c46f", emissive: "#f3c46f", opacity: 0.62 }) }).position(0.8, 0.64, -0.42).rotate(0, 0.4, 0).scale([0.52, 0.018, 0.018]).toJSON()
  ];
}

function productMaterialFor(nextState: ConfiguratorState): AuraMaterialSpec {
  const activeVariant = variants[nextState.variant];
  const activeFinish = finishes[nextState.finish];
  if (nextState.finish === "titanium") {
    return material.brushedMetal({
      name: `${activeVariant.label} brushed titanium override`,
      color: nextState.variant === "ceramic" ? "#d8d7d0" : activeVariant.color,
      roughness: activeFinish.roughness,
      metallic: activeFinish.metallic,
      clearcoat: activeFinish.clearcoat,
      envMapIntensity: 1.44
    });
  }
  return material.clearcoatPaint({
    name: `${activeVariant.label} ${activeFinish.label}`,
    color: activeVariant.color,
    roughness: activeFinish.roughness,
    metallic: activeFinish.metallic,
    clearcoat: activeFinish.clearcoat,
    clearcoatRoughness: nextState.finish === "gloss" ? 0.018 : 0.12,
    envMapIntensity: nextState.finish === "gloss" ? 1.65 : 1.08
  });
}

function cameraFor(nextState: ConfiguratorState) {
  if (nextState.exploded) {
    return camera.perspective({ position: [1.42, 1.2, 2.52], target: [0, 0.82, -0.24], fov: 27 });
  }
  if (nextState.focus === "headband") {
    return camera.perspective({ position: [0.72, 1.46, 2.34], target: [0, 1.0, -0.22], fov: 24 });
  }
  if (nextState.focus !== "overview") {
    return camera.perspective({ position: [1.04, 0.98, 2.28], target: [0, 0.62, -0.16], fov: 24 });
  }
  return camera.perspective({ position: [0.82, 0.88, 2.7], target: [0, 0.72, -0.22], fov: 24 });
}

function focusYaw(focus: FocusId): number {
  if (focus === "headband") return -0.18;
  if (focus === "cushions") return -0.52;
  if (focus === "earcups") return -0.36;
  return -0.38;
}

function normalizedAssetScale(bounds: readonly number[] | undefined, targetMaxDimension: number): number {
  const maxDimension = Math.max(0.001, ...(bounds ?? [1, 1, 1]));
  return Number(Math.max(0.04, Math.min(0.56, targetMaxDimension / maxDimension)).toFixed(4));
}

function updateScene(change: string): void {
  lastInteraction = change;
  interactionRevision += 1;
  const nextScene = buildConfiguratorScene(state);
  app.setScene(nextScene);
  renderControls();
  publishEvidence("ready", nextScene.toJSON());
  renderMetrics();
}

function bindControls(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-variant]").forEach((button) => {
    button.addEventListener("click", () => {
      const variant = button.dataset.variant;
      if (variant === "graphite" || variant === "ceramic" || variant === "copper") {
        state.variant = variant;
        updateScene(`variant:${variant}`);
      }
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-finish]").forEach((button) => {
    button.addEventListener("click", () => {
      const finish = button.dataset.finish;
      if (finish === "satin" || finish === "gloss" || finish === "titanium") {
        state.finish = finish;
        updateScene(`finish:${finish}`);
      }
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-focus]").forEach((button) => {
    button.addEventListener("click", () => {
      const focus = button.dataset.focus;
      if (focus === "overview" || focus === "earcups" || focus === "headband" || focus === "cushions") {
        state.focus = focus;
        updateScene(`focus:${focus}`);
      }
    });
  });
  document.querySelector<HTMLButtonElement>("#toggle-exploded")?.addEventListener("click", () => {
    state.exploded = !state.exploded;
    updateScene(state.exploded ? "exploded:on" : "exploded:off");
  });
  document.querySelector<HTMLButtonElement>("#toggle-turntable")?.addEventListener("click", () => {
    state.turntable = !state.turntable;
    updateScene(state.turntable ? "turntable:on" : "turntable:off");
  });
}

function renderControls(): void {
  setActive("[data-variant]", state.variant);
  setActive("[data-finish]", state.finish);
  setActive("[data-focus]", state.focus);
  setPressed("#toggle-exploded", state.exploded);
  setPressed("#toggle-turntable", state.turntable);
}

function setActive(selector: string, value: string): void {
  document.querySelectorAll<HTMLButtonElement>(selector).forEach((button) => {
    const active = Object.values(button.dataset).includes(value);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setPressed(selector: string, pressed: boolean): void {
  const button = document.querySelector<HTMLButtonElement>(selector);
  if (!button) return;
  button.classList.toggle("is-active", pressed);
  button.setAttribute("aria-pressed", String(pressed));
}

function renderStaticAssetPanel(): void {
  setText("#asset-id", productAsset.id);
  setText("#asset-license", assetProvenance.license);
  setText("#asset-author", assetProvenance.author);
  setText("#asset-textures", String(assetMetadata.textures.length));
}

function renderMetrics(): void {
  const diagnostics = app.diagnostics();
  const status = diagnostics.errors.length > 0 ? "error" : "ready";
  setText("#metric-status", status);
  setText("#metric-backend", diagnostics.backend);
  setText("#metric-draw-calls", String(diagnostics.drawCalls));
  setText("#metric-fps", String(diagnostics.fps));
  document.body.dataset.showcaseProductConfigurator = status;
}

function publishEvidence(status: ConfiguratorEvidence["status"], snapshot: AuraSceneSnapshot): void {
  const diagnostics = typeof app !== "undefined" ? app.diagnostics() : undefined;
  const productDiagnostics = product.diagnostics(productAsset, snapshot.nodes, {
    stageStyle: state.exploded ? "inspection" : "hero-clean",
    captureFrame: 0.36,
    provenanceBadge: true
  });
  const productVisualQA = product.visualQA(snapshot.nodes, productDiagnostics);
  const routeHealth = typeof app !== "undefined" ? createAuraRouteHealthSnapshot(app) : undefined;
  const auraSceneEvidence = diagnostics?.evidence ?? collectAuraSceneEvidence(snapshot);
  const evidence: ConfiguratorEvidence = {
    schema: "aura3d-showcase-product-configurator/1.0",
    appId: "showcase-product-configurator",
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
      drawCalls: diagnostics?.drawCalls ?? 0,
      materialOverride: productMaterialFor(state).name ?? finishes[state.finish].label,
      focus: state.focus,
      exploded: state.exploded,
      turntable: state.turntable
    },
    asset: {
      id: productAsset.id,
      typedRef: "assets.showcaseHeadphones",
      url: productAsset.url,
      hash: productAsset.hash,
      license: assetProvenance.license,
      author: assetProvenance.author,
      sourceFamily: assetProvenance.sourceFamily,
      materialCount: materialMetadata.length,
      textureCount: assetMetadata.textures.length,
      bounds: productAsset.bounds ?? []
    },
    controls,
    systems: [
      "typed product model(assets.showcaseHeadphones)",
      "product-stage scene kit",
      "variant and finish controls",
      "part focus and exploded preview",
      "turntable timeline",
      "product diagnostics and visual QA",
      "route-health evidence global"
    ],
    claimBoundary: "Typed GLB product configurator showcase using Aura3D public APIs and procedural staging. It does not claim production commerce integration or launch acceptance before route-health, screenshot, asset validation, visual review, and deploy checks.",
    proceduralStatus: [
      "Primary product is model(assets.showcaseHeadphones).",
      "Exploded pieces, focus halos, labels, and metric plinths are procedural staging geometry.",
      "No raw GLB URLs or string asset ids are used by the route."
    ],
    scene: {
      nodes: snapshot.nodes.length,
      modelCount: snapshot.nodes.filter((node) => node.kind === "model").length,
      materialOverride: productMaterialFor(state).name ?? finishes[state.finish].label,
      partFocus: state.focus,
      explodedPreview: state.exploded,
      turntable: state.turntable
    },
    productDiagnostics,
    productVisualQA,
    auraSceneEvidence,
    ...(routeHealth ? { routeHealth } : {}),
    ...(diagnostics ? {
      diagnostics: {
        backend: diagnostics.backend,
        drawCalls: diagnostics.drawCalls,
        fps: diagnostics.fps,
        renderSize: diagnostics.renderSize,
        warnings: diagnostics.warnings,
        errors: diagnostics.errors
      }
    } : {})
  };
  window.__AURA3D_SHOWCASE_PRODUCT_CONFIGURATOR__ = evidence;
  renderEvidencePanel(evidence);
}

function renderEvidencePanel(evidence: ConfiguratorEvidence): void {
  const compact = {
    status: evidence.status,
    asset: evidence.asset.typedRef,
    lastChanged: evidence.interactionState.lastChanged,
    revision: evidence.interactionState.revision,
    variant: evidence.state.variant,
    finish: evidence.state.finish,
    focus: evidence.state.focus,
    exploded: evidence.scene.explodedPreview,
    drawCalls: evidence.diagnostics?.drawCalls ?? 0,
    backend: evidence.diagnostics?.backend ?? "pending",
    modelCount: evidence.scene.modelCount,
    productVisualQA: evidence.productVisualQA
  };
  setText("#evidence-json", JSON.stringify(compact, null, 2));
  setText("#proof-status", evidence.status);
  setText("#proof-asset", evidence.asset.typedRef);
  setText("#proof-renderer", `${evidence.diagnostics?.backend ?? "pending"} / ${evidence.diagnostics?.drawCalls ?? 0} draws`);
  setText("#proof-config", `${variants[evidence.state.variant].label} / ${finishes[evidence.state.finish].label}`);
  setText("#proof-license", evidence.asset.license);
}

function setText(selector: string, value: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
}
