import { composeMat4 } from "@aura3d/scene";
import { Geometry, NormalMappedPBRMaterial, PBRMaterial, TexturedPBRMaterial, Texture, createLightingDefault } from "@aura3d/rendering";
import { createWorkflowDiagnostics } from "./WorkflowDiagnostics";
import type { MaterialStudioWorkflowOptions, MaterialStudioWorkflowResult } from "./WorkflowTypes";

export function createMaterialStudioWorkflow(options: MaterialStudioWorkflowOptions = {}): MaterialStudioWorkflowResult {
  const white = new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([240, 236, 220, 255]) });
  const rough = new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([255, 128, 255, 255]) });
  const normal = new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([128, 128, 255, 255]) });
  const lighting = createLightingDefault(options.mode === "transparent" ? "interiorGallery" : "studioProduct");
  const renderItems = [
    {
      label: "workflow-polished-metal",
      geometry: Geometry.uvSphere(0.58, 48, 24, { textured: true }),
      material: new PBRMaterial({ name: "workflow-polished-metal", baseColor: [0.86, 0.82, 0.72, 1], metallic: 1, roughness: 0.18 }),
      modelMatrix: composeMat4([-1.25, 0, 0], [0, 0, 0, 1], [1, 1, 1])
    },
    {
      label: "workflow-textured-pbr",
      geometry: Geometry.uvSphere(0.58, 48, 24, { textured: true }),
      material: new TexturedPBRMaterial({ name: "workflow-textured-pbr", baseColorTexture: white, metallicRoughnessTexture: rough, normalTexture: normal, roughness: 0.45 }),
      modelMatrix: composeMat4([0, 0, 0], [0, 0, 0, 1], [1, 1, 1])
    },
    {
      label: "workflow-normal-material",
      geometry: Geometry.texturedCube(1),
      material: new NormalMappedPBRMaterial({ name: "workflow-normal-material", normalTexture: normal, baseColor: [0.28, 0.58, 0.9, 1], normalScale: 0.8 }),
      modelMatrix: composeMat4([1.25, 0, 0], [0, 0, 0, 1], [0.85, 0.85, 0.85])
    }
  ];
  const source = {
    renderItems,
    cameraPolicy: "auto-frame" as const,
    cameraFrameOptions: { paddingRatio: 0.18, yawRadians: -0.36, pitchRadians: -0.12 },
    environmentLighting: lighting.environmentLighting,
    shadow: false,
    postprocess: { ...lighting.postprocess, targetFormat: "rgba8" as const }
  };
  return {
    kind: "material-studio",
    source,
    renderItems,
    diagnostics: createWorkflowDiagnostics("material-studio", {
      featureChecklist: ["pbr", "textured-pbr", "normal-mapped-pbr", "material-comparison", "postprocess"]
    }),
    dispose: () => undefined
  };
}
