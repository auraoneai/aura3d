import { composeMat4 } from "@galileo3d/scene";
import { Geometry, PBRMaterial, createLightingDefault } from "@galileo3d/rendering";
import { createWorkflowDiagnostics } from "./WorkflowDiagnostics";
import type { InteractiveSceneWorkflowOptions, InteractiveSceneWorkflowResult } from "./WorkflowTypes";

export function createInteractiveSceneWorkflow(_options: InteractiveSceneWorkflowOptions = {}): InteractiveSceneWorkflowResult {
  const lighting = createLightingDefault("studioProduct");
  const material = new PBRMaterial({ name: "interactive-workflow-material", baseColor: [0.95, 0.62, 0.18, 1], metallic: 0.25, roughness: 0.36 });
  const createSource = (timeSeconds: number) => {
    const renderItems = [
      {
        label: "interactive-orbit-a",
        geometry: Geometry.uvSphere(0.42, 32, 16, { textured: true }),
        material,
        modelMatrix: composeMat4([Math.cos(timeSeconds) * 0.9, 0, Math.sin(timeSeconds) * 0.35], [0, 0, 0, 1], [1, 1, 1])
      },
      {
        label: "interactive-orbit-b",
        geometry: Geometry.texturedCube(1),
        material: new PBRMaterial({ name: "interactive-workflow-blue", baseColor: [0.2, 0.48, 0.92, 1], metallic: 0.1, roughness: 0.44 }),
        modelMatrix: composeMat4([Math.cos(timeSeconds + Math.PI) * 0.9, 0, Math.sin(timeSeconds + Math.PI) * 0.35], [0, 0, 0, 1], [0.62, 0.62, 0.62])
      }
    ];
    return {
      renderItems,
      cameraPolicy: "auto-frame" as const,
      cameraFrameOptions: { paddingRatio: 0.28, yawRadians: -0.5, pitchRadians: -0.14 },
      environmentLighting: lighting.environmentLighting,
      shadow: false,
      postprocess: { ...lighting.postprocess, targetFormat: "rgba8" as const }
    };
  };
  const source = createSource(0);
  return {
    kind: "interactive-scene",
    source,
    renderItems: source.renderItems,
    diagnostics: createWorkflowDiagnostics("interactive-scene", {
      featureChecklist: ["update-loop", "animated-transforms", "input-ready-scene", "camera-framing", "postprocess"]
    }),
    update: createSource,
    dispose: () => undefined
  };
}
