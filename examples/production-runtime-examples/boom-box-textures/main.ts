import { runV6Example } from "@galileo3d/engine/workflows/production";

void runV6Example({
  appId: "production-runtime-example-boom-box-textures",
  sceneId: "boom-box-textures",
  title: "Boom Box Textures",
  workflow: "large textured product GLB with base color, metallic roughness, occlusion, and normal texture proof",
  assets: [{ id: "boom-box", label: "Boom Box", file: "boom-box.glb", role: "primary" }],
  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1, intensity: 1.15, rotation: 0.15 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
});
