// Starter: product viewer. A typed GLB on a slow turntable in a dark softbox studio.
// The look (`product-studio`) brings the HDRI reflections, key shadow, rim and grade as one unit;
// the overrides below only darken the backdrop and trim exposure so paint and chrome read instead of washing out.
// camera.frame() places the orbit camera so the product fills ~50% of the frame: no hand-placed camera numbers.
// Swap the product: `npx @aura3d/cli@latest assets resolve "<object>" --name car`, keep everything else.
import { camera, createAuraApp, interactions, looks, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const LOOK_ID = "product-studio" as const;
const PRODUCT_LENGTH = 3.4; // metres; model() fits the GLB to this longest side

const product = model(assets.car, { name: "product", targetMaxDimension: PRODUCT_LENGTH, castShadow: true })
  .position(0, 0.1, 0)
  .runtime({ id: "product", mutable: true });

// Solve the framing for the real window shape (portrait phones need a farther camera than 16:9), and again on resize.
const framing = () => ({ fill: 0.5, azimuth: 0.75, elevation: 0.32, fov: 32, aspect: innerWidth / Math.max(1, innerHeight) }); // angles in radians

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID, {
      background: "#1d2027", // a dark seamless backdrop: bright studio greys wash out glossy paint
      exposureEv: -0.2,
      rim: { intensity: 2.6, color: "#cfe0ff", azimuthDeg: 200 }, // cool rim separates the silhouette from the backdrop
      grade: { contrast: 1.12, saturation: 1.08 }
    }))
    // Floor: large and close to the backdrop colour so its edge never shows; the metal turntable sits on it.
    .add(primitives.plane({ name: "studio floor", size: [400, 1, 400], material: material.pbr({ color: "#25282e", roughness: 0.55 }), receiveShadow: true }))
    .add(primitives.cylinder({ name: "turntable", size: [4.6, 0.1, 4.6], material: material.pbr({ color: "#4a4f58", roughness: 0.25, metallic: 0.7 }), receiveShadow: true }).position(0, 0.05, 0).runtime({ id: "turntable", mutable: true }))
    .add(product)
    .add(interactions.orbit({ target: "product" }))
    .camera(camera.frame(product, framing())),
  ...looks.appOptions(LOOK_ID)
});

addEventListener("resize", () => app.camera?.setPose(camera.framePose(product, framing())));

let angle = 0;
app.onFrame((frame) => {
  angle += frame.dt * 0.35; // slow turntable; orbit drag still works on top
  app.nodes.require("product").setRotation(0, angle, 0);
  app.nodes.require("turntable").setRotation(0, angle, 0);
});

(window as unknown as { __AURA3D_STARTER__?: unknown }).__AURA3D_STARTER__ = {
  starter: "product",
  look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
  hero: { assetId: assets.car.id, url: assets.car.url, license: "CC-BY-4.0 (JUFF, Objaverse)" },
  framing: { helper: "camera.frame", fill: 0.5 }
};

void app.ready().then(() => {
  const diagnostics = app.diagnostics();
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.aura3dDrawCalls = String(diagnostics.drawCalls);
  (window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__ = { ready: true, diagnostics };
}).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});
