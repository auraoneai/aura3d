// Product viewer: a typed GLB on a plinth under the `product-studio` look
// (studio HDRI + key light + neutral backdrop + contrast grade), framed by
// camera.frameAsset — the orbit autoframe that fits the product at 45–70% of
// frame height. Orbit interaction is the only pointer control.
import {
  camera,
  createAuraApp,
  interactions,
  looks,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";
import { assets } from "./aura-assets";

declare global {
  interface Window {
    __AURA3D_PRODUCT_VIEWER__?: ProductViewerEvidence;
    __AURA3D_ROUTE_READY__?: unknown;
  }
}

interface ProductViewerEvidence {
  readonly look: { readonly id: string; readonly category: string };
  readonly camera: {
    readonly mode: string;
    readonly fov: number;
    readonly distance: number;
    readonly subjectHeightFraction: readonly [number, number];
    readonly orbit: boolean;
  };
  readonly product: { readonly assetId: string; readonly url: string; readonly metres: readonly [number, number, number] };
  readonly evidence: { readonly entry: string };
}

const LOOK_ID = "product-studio" as const;

// The look supplies the studio backdrop, HDRI environment and key light; the
// scene adds only the plinth/deck and the typed product — no adoption-preset
// material shells, ambient/fill overrides, or .background() calls.
const plinthMaterial = material.pbr({ color: "#3a3f47", roughness: 0.34, metalness: 0.4 });
const deckMaterial = material.pbr({ color: "#24272e", roughness: 0.62, metalness: 0.1 });

// frameAsset fits the product to ~1/padding of frame height; padding 1.6 puts
// the subject at ~60% — inside the look's 45–70% framing band.
const autoframe = camera.frameAsset(assets.quaterniusSportsCar, {
  targetHeight: 1.62,
  padding: 1.6,
  fov: 32,
  azimuth: 0.62,
  elevation: 0.28,
  position: [0, 0.18, -0.62]
});

const productScene = scene()
  .add(looks.preset(LOOK_ID))
  .add(
    primitives.plane({ name: "studio deck floor", material: deckMaterial })
      .position(0, -0.05, -0.62)
      .scale([6.2, 1, 5.2])
  )
  .add(
    primitives.box({ name: "car plinth", material: plinthMaterial })
      .position(0, 0.06, -0.62)
      .scale([1.82, 0.18, 1.4])
  )
  .add(
    model(assets.quaterniusSportsCar, { name: "typed studio car", castShadow: true })
      .position(0, 1.08, -0.62)
      .scale(0.66)
  )
  .add(interactions.orbit({ target: "typed studio car" }))
  .camera(autoframe);

const app = createAuraApp("#app", { scene: productScene });

window.__AURA3D_PRODUCT_VIEWER__ = {
  look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
  camera: {
    mode: autoframe.mode,
    fov: autoframe.fov ?? 32,
    distance: autoframe.distance ?? 0,
    subjectHeightFraction: [0.45, 0.7],
    orbit: true
  },
  product: { assetId: assets.quaterniusSportsCar.id, url: assets.quaterniusSportsCar.url, metres: assets.quaterniusSportsCar.bounds },
  evidence: { entry: "@aura3d/engine" }
};

void app.ready().then(() => {
  const diagnostics = app.diagnostics();
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.aura3dRuntimeBackend = diagnostics.backend;
  document.body.dataset.aura3dDrawCalls = String(diagnostics.drawCalls);
  window.__AURA3D_ROUTE_READY__ = { ready: true, diagnostics };
}).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});
