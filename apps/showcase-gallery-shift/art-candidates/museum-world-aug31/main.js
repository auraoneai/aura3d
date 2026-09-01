import {
  camera,
  createAuraApp,
  defineAuraAssets,
  effects,
  lights,
  model,
  scene
} from "@aura3d/engine";

const assets = defineAuraAssets({
  galleryShiftMuseumWorldCandidate: {
    type: "model",
    format: "glb",
    url: "/galleryShiftMuseumWorldCandidate.glb",
    hash: "sha256-9773fa0df6fe19c1c3d2145548af78c91943a0f14d6879154c95dee4cdf124c2",
    bounds: [20.8, 1.9, 14.8],
    metadata: {
      license: "CC0-1.0",
      author: "Aura3D original synthesis",
      materials: [
        "Limestone Walls", "Graphite Wall Caps", "Shadow Gap Floor", "Foyer Terrazzo",
        "Rotunda Ivory Marble", "Archive Smoked Oak", "Treasury Garnet Carpet",
        "Vault Blue Slate", "Aged Brass Wayfinding", "Walnut Furniture",
        "Travertine Plinths", "Museum Bronze", "Exit Jade Light", "Cobalt Artwork"
      ],
      boundsMetadata: {
        min: [-10.4, -0.22, -7.4],
        max: [10.4, 1.90, 7.4],
        size: [20.8, 2.12, 14.8],
        center: [0, 0.84, 0]
      },
      provenance: {
        sourceUrl: "generate_museum_world.py",
        license: "CC0-1.0",
        registrationStatus: "unregistered-art-candidate"
      }
    }
  }
});

const asset = assets.galleryShiftMuseumWorldCandidate;

run().catch((error) => {
  window.__GALLERY_MUSEUM_CANDIDATE_ERROR__ = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
});

async function run() {
  const app = createAuraApp("#preview", {
    pixelRatio: 1,
    resize: true,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#071018")
      .camera(camera.perspective({ position: [0, 31, 7.5], target: [0, 0.15, 0.1], fov: 39 }))
      .add(model(asset, {
        name: "gallery-shift-museum-world-candidate",
        role: "primaryWorld",
        scaleMode: "world"
      }).runtime({ id: "gallery-shift-museum-world-candidate" }))
      .add(effects.fog({ name: "museum candidate depth haze", density: 0.0025, color: "#152836", intensity: 0.08 }))
      .add(lights.ambient({ name: "museum soft ambient", color: "#9bb8c3", intensity: 0.64 }))
      .add(lights.directional({ name: "museum warm key", color: "#fff0d2", intensity: 2.35 }).position(-7, 15, 10))
      .add(lights.directional({ name: "museum cool rim", color: "#79cbe4", intensity: 1.15 }).position(10, 9, -7))
      .add(lights.point({ name: "north exit jade practical", color: "#63f5cc", intensity: 4.8 }).position(0, 2.2, -6.3))
      .add(lights.point({ name: "archive warm practical", color: "#ffbd75", intensity: 3.2 }).position(-6.5, 2.6, -4.2))
      .add(lights.point({ name: "treasury warm practical", color: "#ffd68a", intensity: 3.2 }).position(6.5, 2.6, -4.2))
  });

  await waitFor(() => app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0, 30_000);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const diagnostics = app.diagnostics();
  window.__GALLERY_MUSEUM_CANDIDATE_PREVIEW__ = {
    renderer: "createAuraApp root safe API",
    asset: {
      typed: "assets.galleryShiftMuseumWorldCandidate",
      url: asset.url,
      hash: asset.hash,
      license: asset.metadata?.license
    },
    camera: { position: [0, 31, 7.5], target: [0, 0.15, 0.1], fov: 39 },
    diagnostics: {
      backend: diagnostics.renderer?.runtime.backend,
      drawCalls: diagnostics.drawCalls,
      triangles: diagnostics.triangles,
      renderSize: diagnostics.renderSize
    },
    constraints: {
      routeIntegrated: false,
      manifestRegistered: false,
      cameraChanged: false,
      gameplayChanged: false,
      openRoof: true
    }
  };
}

async function waitFor(predicate, timeoutMs) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for isolated museum candidate draw.");
}
