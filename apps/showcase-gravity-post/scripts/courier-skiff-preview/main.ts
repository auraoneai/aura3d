import {
  camera,
  createAuraApp,
  defineAuraAssets,
  effects,
  game,
  lights,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";

const candidateAssets = defineAuraAssets({
  gravityPostCourierSkiffCandidate: {
    type: "model",
    format: "glb",
    url: "/apps/showcase-gravity-post/assets/candidates/gravityPostCourierSkiff.candidate.glb",
    bounds: [1.67, 0.978, 2.37],
    hash: "sha256-a32c76ede1b0aa0276a0f10794b3663413db6b689cd50381868dc40c8ecdb1fc",
    metadata: {
      materials: [
        "GPCS amber drive light",
        "GPCS brushed alloy",
        "GPCS cyan canopy",
        "GPCS cyan running light",
        "GPCS graphite armored hull",
        "GPCS landing skid",
        "GPCS parcel amber",
        "GPCS parcel cream",
        "GPCS postal identity",
        "GPCS postal navy"
      ],
      animations: [],
      textures: []
    }
  },
  gravityPostFreightDistrictCandidate: {
    type: "model",
    format: "glb",
    url: "/apps/showcase-gravity-post/assets/candidates/gravityPostFreightDistrict.candidate.glb",
    bounds: [15.985, 9.898, 16.056],
    hash: "sha256-cb33a415e9193fd00f3b3f5efa6c69515f7bbc429c74272f20cf094c5d4547db",
    metadata: { materials: [], animations: [], textures: [] }
  }
} as const);

const cyan = material.emissive({ color: "#063244", emissive: "#67e8f9", emissiveIntensity: 1.55 });
const amber = material.emissive({ color: "#411908", emissive: "#fb923c", emissiveIntensity: 1.48 });
const cream = material.emissive({ color: "#5b4923", emissive: "#fff0b5", emissiveIntensity: 1.2 });
let auditionScene = scene()
  .background("#06101a")
  .add(model(candidateAssets.gravityPostFreightDistrictCandidate, {
    name: "isolated typed-candidate freight district",
    role: "setDressing"
  }).position(-1.9, 0.06, 0).scale(0.34))
  .add(model(candidateAssets.gravityPostCourierSkiffCandidate, {
    name: "gravity-post-courier-skiff-audition"
  }).position(0.08, 0.145, 0).rotate(0, Math.PI / 2, 0).scale(0.62)
    .runtime(game.runtimeNode("audition-skiff", { tags: ["candidate", "courier", "grounded-contact"] })))
  .add(primitives.box({ name: "live courier contact wake", size: [1.44, 0.014, 0.07], material: cream })
    .position(-0.9, 0.13, 0).runtime(game.runtimeNode("contact-wake")))
  .add(lights.ambient({ color: "#b8d8e8", intensity: 0.5 }))
  .add(lights.directional({ position: [-2.8, 5.4, 4.8], color: "#e7f7ff", intensity: 2.15 }))
  .add(lights.directional({ position: [4.6, 2.7, -4], color: "#ffb46a", intensity: 1.1 }))
  .add(lights.point({ position: [0.3, 1.1, 0.2], color: "#4be7ff", intensity: 2.2, range: 5.2 }))
  .add(lights.point({ position: [-0.9, 0.5, -0.1], color: "#ff8a2b", intensity: 1.8, range: 3.5 }))
  .add(effects.bloom({ intensity: 0.13 }));

for (let index = 0; index < 6; index += 1) {
  auditionScene = auditionScene.add(
    primitives.box({
      name: `velocity-aligned scene trail ${index}`,
      size: [0.34 - index * 0.035, 0.025, 0.04],
      material: index < 2 ? amber : cyan
    }).position(-0.62 - index * 0.25, 0.22 + index * 0.003, 0)
  );
}

const app = createAuraApp("#preview", {
  diagnostics: { overlay: false, assetPanel: false },
  scene: auditionScene.camera(camera.perspective({
    position: [-2.5, 2.2, 3.25],
    target: [0.1, 0.2, 0],
    fov: 39,
    near: 0.05,
    far: 40
  }))
});

void app.ready().then(() => {
  // Deterministic route-motion audition. The runtime node advances along the
  // district's real +X direction and then settles on its four contact pods;
  // this does not claim imported animation or physical vehicle dynamics.
  const skiff = app.nodes.require("audition-skiff");
  const wake = app.nodes.require("contact-wake");
  for (let index = 0; index < 28; index += 1) {
    const x = -0.42 + index * 0.018;
    skiff.setPosition(x, 0.145, 0);
    wake.setPosition(x - 0.9, 0.13, 0).setScale([0.78 + index * 0.012, 1, 1]);
    app.step(1 / 60);
  }
  app.pause();
  const diagnostics = app.diagnostics();
  (window as Window & { __GRAVITY_COURIER_SKIFF_PREVIEW__?: unknown }).__GRAVITY_COURIER_SKIFF_PREVIEW__ = {
    ready: true,
    renderer: "createAuraApp root safe API isolated candidate audition",
    typedCandidate: "candidateAssets.gravityPostCourierSkiffCandidate",
    sharedRegistrationUsed: false,
    movement: { axis: "+X", authoredDistance: 0.486, fixedSteps: 28, dt: 1 / 60 },
    grounded: { playPlaneY: 0.14, assetMinY: 0, fourContactDrivePods: true },
    cargoIdentity: { detachableParcel: true, raisedEnvelopeBadge: true },
    diagnostics: {
      drawCalls: diagnostics.drawCalls,
      renderSize: diagnostics.renderSize,
      backend: diagnostics.renderer?.runtime.backend
    }
  };
});
