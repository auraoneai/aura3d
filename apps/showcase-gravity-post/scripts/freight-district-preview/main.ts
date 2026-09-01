import {
  camera,
  createAuraApp,
  defineAuraAssets,
  effects,
  lights,
  model,
  scene
} from "@aura3d/engine";

const candidateAssets = defineAuraAssets({
  gravityPostFreightDistrictCandidate: {
    type: "model",
    format: "glb",
    url: "/apps/showcase-gravity-post/assets/candidates/gravityPostFreightDistrict.candidate.glb",
    bounds: [4.3, 3.036, 3.658655],
    hash: "sha256-fafd38b804ab82b997df79c01f393f7920438b123e9a9c038d597ad1372d2bdc",
    metadata: {
      materials: [
        "GPFD deck graphite",
        "GPFD structural alloy",
        "GPFD machinery navy",
        "GPFD oxidized cargo cladding",
        "GPFD cargo blue",
        "GPFD cargo cream",
        "GPFD operations glass",
        "GPFD cyan guidance",
        "GPFD amber hazard"
      ],
      animations: [],
      textures: []
    }
  }
} as const);

const app = createAuraApp("#preview", {
  diagnostics: { overlay: false, assetPanel: false },
  scene: scene()
    .background("#07131f")
    .add(model(candidateAssets.gravityPostFreightDistrictCandidate, {
      name: "isolated Gravity Post freight district candidate",
      role: "setDressing"
    }))
    .add(lights.ambient({ color: "#b8d8e8", intensity: 0.52 }))
    .add(lights.directional({ position: [-2.8, 5.4, 4.8], color: "#e7f7ff", intensity: 2.1 }))
    .add(lights.directional({ position: [4.6, 2.7, -4.0], color: "#ffb46a", intensity: 1.08 }))
    .add(lights.point({ position: [2.7, 1.1, 0.0], color: "#4be7ff", intensity: 1.8, range: 5.2 }))
    .add(effects.bloom({ intensity: 0.16 }))
    .camera(camera.perspective({
      position: [-1.9, 2.35, 4.8],
      target: [1.62, 0.62, 0.0],
      fov: 42,
      near: 0.05,
      far: 30
    }))
});

void app.ready().then(() => {
  app.step(1 / 60);
  app.step(1 / 60);
  const diagnostics = app.diagnostics();
  (window as Window & { __GRAVITY_FREIGHT_DISTRICT_PREVIEW__?: unknown }).__GRAVITY_FREIGHT_DISTRICT_PREVIEW__ = {
    ready: true,
    renderer: "createAuraApp root safe API",
    typedAsset: "candidateAssets.gravityPostFreightDistrictCandidate",
    sharedRegistrationUsed: false,
    diagnostics: {
      drawCalls: diagnostics.drawCalls,
      renderSize: diagnostics.renderSize,
      backend: diagnostics.renderer?.runtime.backend
    }
  };
});
