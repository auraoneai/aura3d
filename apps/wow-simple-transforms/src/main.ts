import { composeMat4 } from "@aura3d/scene";
import { Geometry, PBRMaterial, createLightingDefault } from "@aura3d/rendering";
import { rotationYQuat, simpleBounds, startSimpleGraphicsShowcase } from "/apps/wow-common/src/simple-showcase.ts";

const cube = Geometry.litCube(1);
const sphere = Geometry.uvSphere(0.52, 48, 24);
const lighting = createLightingDefault("studioProduct");
const orange = new PBRMaterial({ name: "transform-orange", baseColor: [0.96, 0.45, 0.14, 1], metallic: 0.08, roughness: 0.42 });
const blue = new PBRMaterial({ name: "transform-blue", baseColor: [0.14, 0.44, 0.95, 1], metallic: 0.12, roughness: 0.36 });

const postProcess = {
  tonemapping: { enabled: true, mode: "aces" as const, exposure: 1.15 },
  bloom: { enabled: true, intensity: 0.22, threshold: 0.8 },
  ssao: { enabled: true, radius: 0.45, intensity: 0.35 },
  fxaa: { enabled: true },
  vignette: { enabled: true, intensity: 0.22 }
};

void startSimpleGraphicsShowcase({
  appId: "wow-simple-transforms",
  title: "A3D Simple Transforms",
  subtitle: "Small transform example showing two primitives animated with model matrices, auto-framed camera, and PBR lighting.",
  labels: {
    concept: "model matrices",
    primitive: "litCube + uvSphere",
    api: "composeMat4 + Renderer"
  },
  lightingRig: {
    keyIntensity: 2.25,
    fillIntensity: 1.0,
    rimIntensity: 1.2
  },
  postProcess,
  createFrame: (timeSeconds) => ({
    renderItems: [
      {
        label: "transform-cube",
        geometry: cube,
        material: orange,
        modelMatrix: composeMat4([-0.68, 0, 0], rotationYQuat(timeSeconds), [0.82, 0.82, 0.82])
      },
      {
        label: "transform-sphere",
        geometry: sphere,
        material: blue,
        modelMatrix: composeMat4([0.72, Math.sin(timeSeconds * 1.5) * 0.18, 0], [0, 0, 0, 1], [1.1, 1.1, 1.1])
      }
    ],
    bounds: simpleBounds(1.7),
    cameraFrameOptions: { paddingRatio: 0.1, yawRadians: -0.35, pitchRadians: -0.12 },
    environmentLighting: lighting.environmentLighting,
    postProcess
  })
});
