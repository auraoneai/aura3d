import {
  camera,
  createAuraApp,
  defineAuraAssets,
  lights,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";

// Temporary route-local typed references for candidate rendering only. These do
// not modify the application's generated manifest or root asset map.
const candidateAssets = defineAuraAssets({
  basketball: {
    type: "model",
    format: "glb",
    url: "/@fs/Users/gurbakshchahal/platforms/aura3d/apps/showcase-rooftop-buckets/.candidate-assets/acquisition-2026-08-31/objaverse-9a1be0ed25f94e9998adee1df3a2d218/basketball-player.glb",
    hash: "sha256-f67f19f62254c825103cf55472a273a470d6bf69164a0cddcbc4e369e92d7523",
    bounds: [29.566, 100.994, 33.152],
    sizeBytes: 22748796
  },
  defender: {
    type: "model",
    format: "glb",
    url: "/@fs/Users/gurbakshchahal/platforms/aura3d/apps/showcase-rooftop-buckets/.candidate-assets/acquisition-2026-08-31/objaverse-9a1be0ed25f94e9998adee1df3a2d218/basketball-defender-derived.glb?v=c09475391c02",
    hash: "sha256-c09475391c023994d708458668c60f667a08159d60d540238bd9398f86d640b8",
    bounds: [0.998484, 1.95, 0.60644],
    sizeBytes: 1935316
  },
  pose: {
    type: "model",
    format: "glb",
    url: "/@fs/Users/gurbakshchahal/platforms/aura3d/apps/showcase-rooftop-buckets/.candidate-assets/acquisition-2026-08-31/objaverse-f01f4cbb957149f3ba2f4b0a7424b4e3/character-basketball-pose.glb",
    hash: "sha256-74590d36f5062f51e7c07e8a58fd199529d2fbbeb246f4f2e4c823244c24c5f2",
    bounds: [70.702, 208.396, 74.45],
    sizeBytes: 8401464
  },
  exam: {
    type: "model",
    format: "glb",
    url: "/@fs/Users/gurbakshchahal/platforms/aura3d/apps/showcase-rooftop-buckets/.candidate-assets/acquisition-2026-08-31/objaverse-04acc673e1b848c6a0c68c87e054ebf4/basketball-player.glb",
    hash: "sha256-bdbaafa19a91665aa53754699cf2aac7f5bfa516e38bd4c644f26f80eaed0b69",
    bounds: [12413.222, 3058.399, 12708.571],
    sizeBytes: 43009708
  },
  isolated: {
    type: "model",
    format: "glb",
    url: "/@fs/Users/gurbakshchahal/platforms/aura3d/apps/showcase-rooftop-buckets/.candidate-assets/acquisition-2026-08-31/objaverse-04acc673e1b848c6a0c68c87e054ebf4/player-isolated.glb",
    hash: "sha256-7a4a62726093c063d06c593117688af6c5a5ca8084c6d2dc2a601274965762dc",
    bounds: [1.322, 1.85, 1.338],
    sizeBytes: 20537156
  },
  scorer: {
    type: "model",
    format: "glb",
    url: "/@fs/Users/gurbakshchahal/platforms/aura3d/apps/showcase-rooftop-buckets/.candidate-assets/acquisition-2026-08-31/objaverse-04acc673e1b848c6a0c68c87e054ebf4/basketball-scorer-ball-free.glb?v=6201dc878534",
    hash: "sha256-6201dc878534a34c1c66d36c7e390552ce09b5d0b5ec2eb32c791b9f3b146431",
    bounds: [1.322, 1.9, 1.338],
    sizeBytes: 20510000
  },
  man: {
    type: "model",
    format: "glb",
    url: "/@fs/Users/gurbakshchahal/platforms/aura3d/apps/showcase-rooftop-buckets/.candidate-assets/acquisition-2026-08-31/objaverse-4c7133dbb06e4136891d59231372d818/man-player.glb",
    hash: "sha256-bb0e9f1ed0147b988d93b7dc6564b480efb05085c3bb78d2d74e7b01cff0d78b",
    bounds: [1.808, 1.863, 0.399],
    sizeBytes: 12123012,
    metadata: {
      animations: [
        "_T Pose", "0_T Pose", "Against Wall_01", "Against Wall_02",
        "Moving_Walk_01", "Moving_Walk_02", "Reclining_Bench",
        "Sitting_Barstool", "Sitting_Bench", "Sitting_Floor", "Sports_Surfing",
        "Standing_01", "Standing_02", "Standing_03", "Standing_04", "Standing_05",
        "Standing_06", "Standing_07", "Standing_08", "Standing_09"
      ]
    }
  }
} as const);

const params = new URLSearchParams(location.search);
const requestedCandidate = params.get("candidate");
const candidate = requestedCandidate === "basketball" || requestedCandidate === "defender" || requestedCandidate === "duo" || requestedCandidate === "pose" || requestedCandidate === "exam" || requestedCandidate === "isolated" || requestedCandidate === "scorer"
  ? requestedCandidate
  : "man";
const side = params.get("side") ?? "front";
const rotation = side === "back"
  ? Math.PI
  : side === "left"
    ? Math.PI / 2
    : side === "right"
      ? -Math.PI / 2
      : 0;
const clip = params.get("clip") || "Standing_06";
const singleCandidate = candidate === "duo" ? "basketball" : candidate;
const source = candidateAssets[singleCandidate];

const candidateNode = model(source, {
  name: singleCandidate === "basketball"
    ? "Basketball Player isolated candidate"
    : singleCandidate === "defender"
      ? "Ball-free contest defender derivative candidate"
      : singleCandidate === "pose"
        ? "Character in Basketball pose isolated candidate"
        : singleCandidate === "exam"
          ? "Basketball player exam isolated candidate"
          : singleCandidate === "isolated"
            ? "Basketball player derivative candidate"
            : singleCandidate === "scorer"
              ? "Ball-free number-24 layup scorer candidate"
            : "Man Player isolated candidate",
  scale: singleCandidate === "man" ? 1.32 : 1.22
})
  .position(0, 0, 0)
  .rotate(0, rotation, 0);

if (singleCandidate === "man") {
  candidateNode.animate({ clip, loop: true, captureTime: 0.8, speed: 1 });
}

const shooterNode = model(candidateAssets.basketball, {
  name: "Verified CC-BY shooter",
  scale: 1.12
})
  .position(-0.66, 0.04, 0.04)
  .rotate(0, -Math.PI / 2, -0.035);

const defenderNode = model(candidateAssets.defender, {
  name: "Derived CC-BY ball-free contest defender",
  scale: 1.12
})
  .position(0.66, 0, -0.02)
  .rotate(0, -Math.PI / 2, 0.035);

const courtMaterial = material.pbr({
  name: "candidate rooftop court",
  color: "#713846",
  roughness: 0.58,
  metallic: 0.04,
  clearcoat: 0.2
});
const edgeMaterial = material.emissive({
  name: "candidate rooftop edge",
  color: "#44d5e7",
  emissive: "#147d96",
  emissiveIntensity: 0.7
});

const content = candidate === "duo"
  ? [
      primitives.box({ name: "rooftop court slab", material: courtMaterial }).position(0, -0.095, 0).scale([3.0, 0.08, 2.1]),
      primitives.box({ name: "rooftop edge glow", material: edgeMaterial }).position(0, -0.004, -1.55).scale([3.0, 0.015, 0.018]),
      shooterNode,
      defenderNode
    ]
  : [candidateNode];

const app = createAuraApp("#stage", {
  autoStart: false,
  pixelRatio: 1,
  resize: false,
  renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
  scene: scene()
    .background(candidate === "duo" ? "#160f2a" : "#07101b")
    .camera(camera.perspective(candidate === "duo"
      ? { position: [3.5, 2.05, 5.3], target: [0, 0.95, 0], fov: 27 }
      : { position: [0, 1.25, 5.35], target: [0, 0.95, 0], fov: 30 }))
    .addMany(content)
    .add(lights.studio())
    .add(lights.point({ name: "rooftop cyan rim", color: "#4dddf8", intensity: 2.2 }).position(-2.5, 3.2, -2.4))
    .add(lights.point({ name: "rooftop warm key", color: "#ffb45f", intensity: 2.5 }).position(2.8, 3.8, 3.2))
});

void app.ready().then(() => {
  app.step(0.8);
  Object.assign(window, {
    __AURA_CANDIDATE_READY__: true,
    __AURA_CANDIDATE__: { candidate, side, clip: singleCandidate === "man" ? clip : null },
    __AURA_CANDIDATE_DIAGNOSTICS__: app.diagnostics()
  });
});
