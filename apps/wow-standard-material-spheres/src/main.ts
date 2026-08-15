import { composeMat4 } from "/packages/scene/src/index.ts";
import { Geometry, PBRMaterial, createLightingDefault } from "/packages/rendering/src/index.ts";
import { rotationYQuat, simpleBounds, startSimpleGraphicsShowcase } from "/apps/wow-common/src/simple-showcase.ts";

const sphere = Geometry.uvSphere(0.34, 48, 24);
const plinth = Geometry.litCube(1);
const lighting = createLightingDefault("studioProduct");
const swatches = [
  [0.08, 0.66, 0.98, 1],
  [0.16, 0.92, 0.72, 1],
  [0.98, 0.62, 0.12, 1]
] as const;
const roughnessValues = [0.12, 0.34, 0.58, 0.86] as const;
const materials = swatches.flatMap((baseColor, row) => roughnessValues.map((roughness, column) => new PBRMaterial({
  name: `material-sphere-${row}-${column}`,
  baseColor,
  metallic: row === 0 ? 0.92 : row === 1 ? 0.48 : 0.04,
  roughness
})));
const plinthMaterial = new PBRMaterial({
  name: "material-grid-plinth",
  baseColor: [0.035, 0.05, 0.075, 1],
  metallic: 0.18,
  roughness: 0.62
});

void startSimpleGraphicsShowcase({
  appId: "wow-standard-material-spheres",
  title: "Aura3D Material Spheres",
  subtitle: "A focused Aura3D material grid comparing metallic response and roughness under one consistent studio-lighting setup.",
  labels: {
    concept: "metallic and roughness matrix",
    primitive: "12 lit UV spheres",
    api: "Geometry.uvSphere + PBRMaterial + Renderer"
  },
  createFrame: (timeSeconds) => ({
    renderItems: [
      {
        label: "material-grid-plinth",
        geometry: plinth,
        material: plinthMaterial,
        modelMatrix: composeMat4([0, -1.08, -0.08], [0, 0, 0, 1], [4.6, 0.12, 2.05])
      },
      ...materials.map((material, index) => {
        const row = Math.floor(index / roughnessValues.length);
        const column = index % roughnessValues.length;
        return {
          label: `material-sphere-${row}-${column}`,
          geometry: sphere,
          material,
          modelMatrix: composeMat4(
            [-1.5 + column, 0.74 - row * 0.78 + Math.sin(timeSeconds * 1.2 + index * 0.45) * 0.018, 0],
            rotationYQuat(timeSeconds * 0.18 + column * 0.12),
            [1, 1, 1]
          )
        };
      })
    ],
    bounds: simpleBounds(2.35),
    cameraFrameOptions: { paddingRatio: 0.08, yawRadians: -0.12, pitchRadians: -0.08 },
    environmentLighting: lighting.environmentLighting,
    postprocess: false
  })
});
