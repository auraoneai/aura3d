import { composeMat4 } from "@aura3d/scene";
import { Geometry, PBRMaterial, createLightingDefault } from "@aura3d/rendering";
import { createWorkflowDiagnostics } from "./WorkflowDiagnostics";
import type { SceneShowcaseWorkflowOptions, SceneShowcaseWorkflowResult } from "./WorkflowTypes";

export function createSceneShowcaseWorkflow(options: SceneShowcaseWorkflowOptions = {}): SceneShowcaseWorkflowResult {
  const lighting = createLightingDefault(options.preset === "dramatic" ? "gameNight" : options.preset === "gallery" ? "interiorGallery" : "studioProduct");
  const renderItems = [
    {
      label: "showcase-center",
      geometry: Geometry.uvSphere(0.72, 48, 24, { textured: true }),
      material: new PBRMaterial({ name: "showcase-center-material", baseColor: [0.9, 0.3, 0.16, 1], metallic: 0.35, roughness: 0.32 }),
      modelMatrix: composeMat4([0, 0.25, 0], [0, 0, 0, 1], [1, 1, 1])
    },
    {
      label: "showcase-left",
      geometry: Geometry.texturedCube(1),
      material: new PBRMaterial({ name: "showcase-left-material", baseColor: [0.18, 0.45, 0.9, 1], metallic: 0.1, roughness: 0.48 }),
      modelMatrix: composeMat4([-1.25, -0.15, -0.2], [0, 0.18, 0, 0.98], [0.72, 0.72, 0.72])
    },
    {
      label: "showcase-right",
      geometry: Geometry.cylinder({ radius: 0.42, height: 1.1, textured: true }),
      material: new PBRMaterial({ name: "showcase-right-material", baseColor: [0.2, 0.72, 0.42, 1], metallic: 0.05, roughness: 0.55 }),
      modelMatrix: composeMat4([1.25, -0.1, -0.15], [0, 0, 0, 1], [1, 1, 1])
    }
  ];
  const source = {
    renderItems,
    cameraPolicy: "auto-frame" as const,
    cameraFrameOptions: { paddingRatio: 0.2, yawRadians: -0.42, pitchRadians: -0.16 },
    environmentLighting: lighting.environmentLighting,
    shadow: false,
    postprocess: { ...lighting.postprocess, targetFormat: "rgba8" as const }
  };
  return {
    kind: "scene-showcase",
    source,
    renderItems,
    diagnostics: createWorkflowDiagnostics("scene-showcase", {
      featureChecklist: ["multi-object-scene", "pbr", "lighting-preset", "camera-framing", "postprocess"]
    }),
    dispose: () => undefined
  };
}
