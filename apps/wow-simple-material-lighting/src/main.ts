import { composeMat4 } from "/packages/scene/src/index.ts";
import { Geometry, PBRMaterial, createLightingDefault } from "/packages/rendering/src/index.ts";
import { rotationYQuat, simpleBounds, startSimpleGraphicsShowcase } from "/apps/wow-common/src/simple-showcase.ts";

const sphere = Geometry.uvSphere(0.58, 64, 32, { textured: true });
const lighting = createLightingDefault("interiorGallery");
const materials = [
  new PBRMaterial({ name: "matte-clay", baseColor: [0.88, 0.35, 0.18, 1], metallic: 0, roughness: 0.78 }),
  new PBRMaterial({ name: "brushed-gold", baseColor: [0.95, 0.72, 0.3, 1], metallic: 0.8, roughness: 0.28 }),
  new PBRMaterial({ name: "clearcoat-teal", baseColor: [0.08, 0.72, 0.78, 1], metallic: 0.05, roughness: 0.32, clearcoatFactor: 0.6 })
];

void startSimpleGraphicsShowcase({
  appId: "wow-simple-material-lighting",
  title: "A3D Simple Material Lighting",
  subtitle: "A compact PBR material comparison for roughness, metallic, clearcoat, environment lighting, and postprocess defaults.",
  labels: {
    concept: "PBR lighting",
    primitive: "three uvSpheres",
    api: "PBRMaterial + createLightingDefault"
  },
  createFrame: (timeSeconds) => ({
    renderItems: materials.map((material, index) => ({
      label: `material-sphere-${index}`,
      geometry: sphere,
      material,
      modelMatrix: composeMat4([(index - 1) * 1.08, 0, 0], rotationYQuat(timeSeconds * 0.55), [1.08, 1.08, 1.08])
    })),
    bounds: simpleBounds(2.05),
    cameraFrameOptions: { paddingRatio: 0.08, yawRadians: -0.32, pitchRadians: -0.1 },
    environmentLighting: lighting.environmentLighting,
    postprocess: false
  })
});
