import { runProductionExample } from "@aura3d/engine/workflows/production";

void runProductionExample({
  appId: "production-runtime-example-boom-box-textures",
  sceneId: "boom-box-textures",
  title: "Boom Box Textures",
  workflow: "large textured product GLB metadata plus a visible PBR primary asset for pixel proof",
  assets: [
    { id: "damaged-helmet", label: "Damaged Helmet", file: "damaged-helmet.glb", role: "primary" },
    { id: "boom-box", label: "Boom Box", file: "boom-box.glb", role: "secondary" }
  ],
  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1, intensity: 1.15, rotation: 0.15 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
});
