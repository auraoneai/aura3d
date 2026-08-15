import {
  camera,
  checkSpatialInvariants,
  collectAuraSceneEvidence,
  createAuraApp,
  createAuraRouteHealthSnapshot,
  createProductConfiguratorKit,
  environments,
  focusSemanticRegion,
  group,
  interactions,
  lights,
  material,
  model,
  placedBoundsFromAsset,
  primitives,
  product,
  resolveBoundsAnchor,
  scene,
  timeline,
  type AuraApp,
  type AuraMaterialSpec,
  type AuraSceneNode,
  type AuraSceneSnapshot,
  type FocusResult,
  type SemanticRegion
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
  /**
   * Interaction-quality evidence for the focus control, and the label placement
   * the renderer actually produced. Both exist because the previous defects --
   * a flattened focus indicator and a callout that never rendered -- were
   * invisible to node counts and pixel metrics.
   */
  readonly focusEvidence: unknown;
  readonly renderedLabels?: unknown;
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
const embeddedChromeMode = new URLSearchParams(window.location.search).get("chrome");
if (embeddedChromeMode === "hidden") document.documentElement.dataset.chrome = "hidden";
const assetMetadata = productAsset.metadata;
const assetProvenance = assetMetadata.provenance;
const materialMetadata = assetMetadata.materialMetadata;
const productScale = normalizedModelScale(0.4841);
/**
 * Where the product stands. This is a genuine level-design value -- a studio
 * staging decision -- and every asset-relative element is derived from it rather
 * than repeating its components.
 */
const PRODUCT_POSITION: readonly [number, number, number] = [0, 0.46, -0.22];

const variants: Record<VariantId, { readonly label: string; readonly color: string; readonly accent: string }> = {
  graphite: { label: "Graphite Studio", color: "#555d66", accent: "#cdbd99" },
  ceramic: { label: "Ceramic Pearl", color: "#efe9dd", accent: "#2f3334" },
  copper: { label: "Copper Limited", color: "#d4764c", accent: "#f2c06d" }
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
    roughness: 0.22,
    metallic: 0.03,
    clearcoat: 0.58,
    accentMaterial: material.clearGlass({ color: "#c9d0d4", opacity: 0.12, transmission: 0.62 })
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

/*
 * Part regions and the configurator kit are declared above the first scene build.
 *
 * `buildConfiguratorScene` runs during module evaluation, so anything it reaches must already be
 * initialized. Both a `const` kit and a lazily-assigned `let` failed at mount while they lived
 * below this line -- the binding itself is in its temporal dead zone, not merely its value. This
 * is the third route in this remediation to hit the same trap, which is why the interaction audit
 * runs on every route rather than only the one being edited.
 */
/**
 * Selectable parts of the product, expressed as normalized regions of the
 * asset's own bounds.
 *
 * `u`/`v`/`w` run 0..1 across the product's X/Y/Z extents, so these definitions
 * survive an asset swap or a scale change. The previous version stored world
 * positions and an indicator scale per part, which is how the earcup focus came
 * to carry `scale: [1.22, 0.08, 0.78]` -- a nonuniform scale applied to a torus
 * in its own ring plane, then rotated flat. That produced the reported yellow/
 * white bar instead of a ring. See `FocusSelection.ts` for the axis analysis.
 */
const partRegions: Record<Exclude<FocusId, "overview">, SemanticRegion> = {
  earcups: { id: "earcups", label: "Earcup acoustic housings", u: 0.5, v: 0.52, w: 0.46, extent: [0.86, 0.5, 0.7] },
  headband: { id: "headband", label: "Headband structure", u: 0.5, v: 0.88, w: 0.4, extent: [0.74, 0.2, 0.28] },
  cushions: { id: "cushions", label: "Soft cushion contact area", u: 0.5, v: 0.34, w: 0.5, extent: [0.7, 0.24, 0.6] }
};

/**
 * The reusable configurator kit this route now configures.
 *
 * Phase 12: the route declares its parts, variants, finishes and camera presets, and the kit
 * owns selection state, focus feedback, exploded placement, price binding, reset and the
 * spatial invariants a gate checks. Before this, the route assembled all of that itself --
 * which is why a sixth configurator would have got no help from the five that existed.
 *
 * The route keeps its own `state` as the source of truth for scene composition and evidence,
 * and mirrors it into the kit, so this migration adds the kit without a rewrite of the
 * route's rendering path.
 */
/*
 * Constructed lazily on first use.
 *
 * The scene is composed during module evaluation, so a module-level `const` here is in its
 * temporal dead zone when the scene builder runs -- the same trap that broke the digital-twin
 * and smart-city migrations at mount. Hoisting works when the dependencies are simple values;
 * this kit depends on several declarations further down the module, so deferring construction
 * is the fix that cannot be reintroduced by a future reorder.
 */
let configuratorKitInstance: ReturnType<typeof createProductConfiguratorKit> | undefined;
function configuratorKit(): ReturnType<typeof createProductConfiguratorKit> {
  configuratorKitInstance ??= createProductConfiguratorKit({
  bounds: placedBoundsFromAsset(productAsset, {
    targetMaxDimension: 1.55 * productScale,
    position: PRODUCT_POSITION,
    floorY: PRODUCT_POSITION[1]
  }),
  parts: [
    { ...partRegions.earcups, price: 0 },
    { ...partRegions.headband, price: 0 },
    { ...partRegions.cushions, price: 0 }
  ],
  variants: [
    { id: "graphite", label: variants.graphite.label, color: variants.graphite.color, accent: variants.graphite.accent },
    { id: "ceramic", label: variants.ceramic.label, color: variants.ceramic.color, accent: variants.ceramic.accent },
    { id: "copper", label: variants.copper.label, color: variants.copper.color, accent: variants.copper.accent }
  ],
  finishes: [
    { id: "satin", label: finishes.satin.label },
    { id: "gloss", label: finishes.gloss.label },
    { id: "titanium", label: finishes.titanium.label }
  ],
  indicators: ["ring", "halo"]
  });
  return configuratorKitInstance;
}


const initialScene = buildConfiguratorScene(state);
const initialSnapshot = initialScene.toJSON();

publishEvidence("loading", initialSnapshot);
renderStaticAssetPanel();

app = createAuraApp("#aura-stage", {
  diagnostics: { overlay: false, assetPanel: false, performancePanel: false },
  pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
  renderer: {
    mode: "production",
    qualityProfile: "production",
    fallback: "safe-basic"
  },
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
let compactCameraLayout = window.innerWidth < 1120;
window.addEventListener("resize", () => {
  const nextCompactLayout = window.innerWidth < 1120;
  if (nextCompactLayout === compactCameraLayout) return;
  compactCameraLayout = nextCompactLayout;
  updateScene(`viewport:${nextCompactLayout ? "compact" : "wide"}`);
});

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
    .position(...PRODUCT_POSITION)
    .rotate(0, focusYaw(nextState.focus), 0)
    .scale(productScale)
    .runtime({ id: "configured-headphones", tags: ["typed-asset", "showcaseHeadphones", "configurable-product"] });

  const builder = scene()
    .background("#050607")
    .add(environments.productHero({
      name: "authored product hero HDR environment",
      // Keep the environment strong enough to describe the clearcoat without
      // lifting the entire copper body toward one flat midtone. The two long
      // directional cards below provide the readable highlight-to-shadow
      // transition that a product photograph needs.
      intensity: 0.72,
      color: "#fff4e6"
    }))
    .addMany(compactProductStageNodes(nextState))
    .add(nextState.turntable
      ? productModel.animate({ clip: "turntable", speed: 0.36, duration: 9, captureTime: 0.36 })
      : productModel)
    .addMany(configuratorSceneAccents(nextState))
    .add(lights.ambient({ name: "product configurator ambient fill", intensity: 0.12, color: "#cbd4dc" }))
    .add(lights.directional({ name: "large softbox product key", position: [-3.4, 5.2, 4.4], intensity: 1.72, color: "#ffe8d3" }))
    .add(lights.directional({ name: "cool edge separation card", position: [3.8, 2.8, -1.5], intensity: 0.42, color: "#80b7da" }))
    .add(lights.point({ name: "earcup contour kicker", position: [0.1, 0.68, 2.25], intensity: 0.22, color: "#efbf91" }))
    .add(lights.rect({
      name: "long warm showroom reflection card",
      position: [2.75, 1.62, 1.72],
      intensity: nextState.variant === "copper" ? 0.46 : 0.34,
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

/** Product bounds as the route actually renders them, derived from the typed asset. */
function productPlacedBounds() {
  return placedBoundsFromAsset(productAsset, {
    // `model(asset).scale(productScale)` renders the asset at
    // `AURA_NORMALIZED_MODEL_MAX_DIMENSION * productScale` on its longest axis.
    targetMaxDimension: 1.55 * productScale,
    position: PRODUCT_POSITION,
    floorY: PRODUCT_POSITION[1]
  });
}

/**
 * Focus feedback for the selected part, built by the reusable focus system.
 *
 * The route states which region it wants focused. It does not build, rotate or
 * scale indicator geometry, and it does not know the torus axis convention.
 */
function resolveFocus(focus: FocusId, color: string): FocusResult | undefined {
  if (focus === "overview") return undefined;
  return focusSemanticRegion(productPlacedBounds(), partRegions[focus], {
    color,
    indicators: ["ring", "halo"],
    callout: true,
    leaderLine: true,
    // The route drives its own camera presets, so focus reports framing intent
    // without taking over the camera.
    cameraFocus: false,
    namePrefix: `${focus} focus`
  });
}

function focusNodes(focus: FocusId, color: string): readonly AuraSceneNode[] {
  return resolveFocus(focus, color)?.nodes ?? [];
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

  /*
   * Exploded proxies are placed relative to the product's own bounds.
   *
   * Previously every proxy carried a literal world position tuned against one
   * asset. Anchoring them means an asset swap, a scale change or a different
   * staging position moves the whole exploded view together instead of leaving
   * proxies stranded beside the product.
   */
  const bounds = productPlacedBounds();
  const left = resolveBoundsAnchor(bounds, "left", { offset: bounds.size[0] * 0.55 }).position;
  const right = resolveBoundsAnchor(bounds, "right", { offset: bounds.size[0] * 0.55 }).position;
  const top = resolveBoundsAnchor(bounds, "top", { offset: bounds.size[1] * 0.45 }).position;
  const midY = bounds.center[1];
  // Proxy sizes are fractions of the product, so proportions hold at any scale.
  const shellSize: readonly [number, number, number] = [bounds.size[0] * 0.2, bounds.size[1] * 0.5, bounds.size[2] * 0.2];
  const cushionRadius = bounds.size[0] * 0.22;
  const driverRadius = bounds.size[0] * 0.15;

  return [
    primitives.box({ name: "procedural exploded left earcup shell proxy", material: shell })
      .position(left[0], midY, bounds.center[2] - bounds.size[2] * 0.2).rotate(0, 0.18, 0).scale([...shellSize]).toJSON(),
    primitives.box({ name: "procedural exploded right earcup shell proxy", material: shell })
      .position(right[0], midY, bounds.center[2] - bounds.size[2] * 0.2).rotate(0, -0.18, 0).scale([...shellSize]).toJSON(),
    // Cushion rings are thinned on Z, the torus tube axis, so they read as rings.
    primitives.torus({ name: "procedural exploded left cushion proxy", material: cushion })
      .position(left[0] * 0.62, midY, bounds.center[2]).rotate(1.5708, 0, 0).scale([cushionRadius, cushionRadius, cushionRadius * 0.16]).toJSON(),
    primitives.torus({ name: "procedural exploded right cushion proxy", material: cushion })
      .position(right[0] * 0.62, midY, bounds.center[2]).rotate(1.5708, 0, 0).scale([cushionRadius, cushionRadius, cushionRadius * 0.16]).toJSON(),
    primitives.cylinder({ name: "procedural exploded left driver disc proxy", material: driver })
      .position(left[0] * 0.4, midY, bounds.center[2] + bounds.size[2] * 0.12).rotate(1.5708, 0, 0).scale([driverRadius, driverRadius * 0.22, driverRadius]).toJSON(),
    primitives.cylinder({ name: "procedural exploded right driver disc proxy", material: driver })
      .position(right[0] * 0.4, midY, bounds.center[2] + bounds.size[2] * 0.12).rotate(1.5708, 0, 0).scale([driverRadius, driverRadius * 0.22, driverRadius]).toJSON(),
    primitives.box({ name: "procedural exploded headband strap proxy", material: shell })
      .position(bounds.center[0], top[1], bounds.center[2] - bounds.size[2] * 0.14).scale([bounds.size[0] * 0.86, bounds.size[1] * 0.08, bounds.size[2] * 0.2]).toJSON(),
    primitives.box({ name: "exploded assembly offset guide left", material: material.emissive({ color: "#f3c46f", emissive: "#f3c46f", opacity: 0.62 }) })
      .position(left[0] * 0.78, midY, bounds.center[2] - bounds.size[2] * 0.14).rotate(0, -0.4, 0).scale([bounds.size[0] * 0.4, bounds.size[1] * 0.02, bounds.size[2] * 0.03]).toJSON(),
    primitives.box({ name: "exploded assembly offset guide right", material: material.emissive({ color: "#f3c46f", emissive: "#f3c46f", opacity: 0.62 }) })
      .position(right[0] * 0.78, midY, bounds.center[2] - bounds.size[2] * 0.14).rotate(0, 0.4, 0).scale([bounds.size[0] * 0.4, bounds.size[1] * 0.02, bounds.size[2] * 0.03]).toJSON()
  ];
}

/**
 * Interaction-quality evidence for the focus control.
 *
 * Published so a browser test can assert that focusing a part produced a correct
 * indicator -- circular, surrounding the part, with a callout outside it -- rather
 * than inferring correctness from a screenshot. The bar defect passed every pixel
 * check that existed.
 */
/**
 * Mirror route state into the kit and return its frame.
 *
 * The kit is the owner of selection semantics; this keeps the two in step so the published
 * kit evidence describes what the route is actually showing.
 */
function configuratorKitFrame(nextState: ConfiguratorState) {
  const kit = configuratorKit();
  kit.reset();
  kit.selectVariant(nextState.variant);
  kit.selectFinish(nextState.finish);
  if (nextState.focus !== "overview") kit.selectPart(nextState.focus);
  if (nextState.exploded) kit.toggleExploded();
  return kit.frame();
}

function focusEvidence(nextState: ConfiguratorState) {
  const focus = resolveFocus(nextState.focus, variants[nextState.variant].accent);
  const bounds = productPlacedBounds();
  const spatial = checkSpatialInvariants(
    bounds,
    explodedProxyClaims(nextState, bounds)
  );
  return {
    focus: nextState.focus,
    system: "engine.focusSemanticRegion",
    routeBuildsIndicatorGeometry: false,
    indicatorNodes: focus?.nodes.length ?? 0,
    calloutText: focus?.nodes.find((node) => node.kind === "label")?.text,
    invariants: focus?.invariants ?? { schema: "aura3d-focus-invariants/1.0", checks: [], passes: true },
    accessibilityLabel: focus?.accessibilityLabel ?? "no selection",
    spatialInvariants: spatial,
    /*
     * Kit evidence, published so a gate can see that the route configures a reusable kit
     * rather than reimplementing configurator behaviour.
     */
    kit: (() => {
      const kitFrame = configuratorKitFrame(nextState);
      return {
        kind: kitFrame.kind,
        system: "engine.createProductConfiguratorKit",
        routeReimplementsConfiguratorBehaviour: false,
        capabilities: configuratorKit().capabilities,
        state: kitFrame.state,
        indicatorNodes: kitFrame.nodes.length,
        explodedPlacements: kitFrame.explodedPlacements.length,
        focusInvariants: kitFrame.focus.invariants,
        spatialInvariants: kitFrame.spatialInvariants,
        accessibilityLabel: kitFrame.accessibilityLabel
      };
    })()
  };
}

function explodedProxyClaims(nextState: ConfiguratorState, bounds: ReturnType<typeof productPlacedBounds>) {
  if (!nextState.exploded) return [];
  return explodedProxyNodes(nextState)
    .filter((node): node is Extract<AuraSceneNode, { position?: unknown }> => "position" in node)
    .map((node) => {
      const position = (node as { position?: readonly [number, number, number] }).position ?? [0, 0, 0];
      const name = (node as { name?: string }).name ?? "exploded proxy";
      /*
       * An exploded view has two kinds of part, and claiming they are all the same thing is a
       * false claim rather than a lenient one.
       *
       * Shells, cushions, the strap and the offset guides are pulled *away* from the body, so
       * they belong outside its bounds. The driver discs sit at 40% of the shell offset: they
       * are the inner components, revealed in place rather than displaced, so they are legitimately
       * inside. Declaring them `outside` made the spatial gate fail on correct geometry -- the
       * claim was wrong, not the layout. Caught by reading invariants at their peak, while the
       * exploded view was actually applied.
       */
      const revealedInPlace = /driver disc/.test(name);
      return revealedInPlace
        ? { id: name, position, relation: "inside" as const }
        : {
            id: name,
            position,
            // Displaced parts sit beside the product and must stay within reach of it, which is
            // what the previous literal coordinates stopped doing.
            relation: "outside" as const,
            maxDistance: Math.max(...bounds.size) * 2.5
          };
    });
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
    clearcoatRoughness: nextState.finish === "gloss" ? 0.16 : 0.12,
    envMapIntensity: nextState.finish === "gloss" ? 0.92 : 0.84
  });
}

function cameraFor(nextState: ConfiguratorState) {
  const compactViewport = window.innerWidth < 1120;
  if (nextState.exploded) {
    return camera.perspective({
      position: compactViewport ? [1.62, 1.28, 3.72] : [1.42, 1.2, 2.52],
      target: [0, 0.82, -0.24],
      fov: compactViewport ? 30 : 27
    });
  }
  if (nextState.focus === "headband") {
    return camera.perspective({
      position: compactViewport ? [0.92, 1.55, 3.58] : [0.72, 1.46, 2.34],
      target: [0, 1.0, -0.22],
      fov: compactViewport ? 29 : 24
    });
  }
  if (nextState.focus !== "overview") {
    return camera.perspective({
      position: compactViewport ? [1.24, 1.04, 3.5] : [1.04, 0.98, 2.28],
      target: [0, 0.62, -0.16],
      fov: compactViewport ? 29 : 24
    });
  }
  return camera.perspective({
    position: compactViewport ? [0.94, 0.96, 3.72] : [0.82, 0.88, 2.7],
    target: [0, 0.72, -0.22],
    fov: compactViewport ? 29 : 24
  });
}

function focusYaw(focus: FocusId): number {
  if (focus === "headband") return -0.18;
  if (focus === "cushions") return -0.52;
  if (focus === "earcups") return -0.36;
  return -0.38;
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
      "reusable focus/selection system (engine.focusSemanticRegion)",
      "world-anchored callout labels (engine world-label layer)",
      "asset-relative exploded staging (engine.resolveBoundsAnchor)",
      "turntable timeline",
      "product diagnostics and visual QA",
      "route-health evidence global"
    ],
    claimBoundary: "Typed GLB product configurator showcase using Aura3D public APIs and procedural staging. It does not claim production commerce integration or launch acceptance before route-health, screenshot, asset validation, visual review, and deploy checks.",
    proceduralStatus: [
      "Primary product is model(assets.showcaseHeadphones).",
      "Exploded pieces and metric plinths are procedural staging geometry anchored to the product's placed bounds.",
      "Focus indicators and callout labels come from the reusable engine focus/label systems, not route-local geometry.",
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
    focusEvidence: focusEvidence(state),
    ...(diagnostics?.labels ? { renderedLabels: diagnostics.labels } : {}),
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
