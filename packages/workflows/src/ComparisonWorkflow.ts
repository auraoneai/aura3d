import { composeMat4 } from "@aura3d/scene";
import { Geometry, PBRMaterial, createLightingDefault } from "@aura3d/rendering";
import { createWorkflowDiagnostics } from "./WorkflowDiagnostics";
import type { ComparisonWorkflowOptions, ComparisonWorkflowResult } from "./WorkflowTypes";

export function createComparisonWorkflow(options: ComparisonWorkflowOptions = {}): ComparisonWorkflowResult {
  const focus = options.focus ?? "setup";
  const lighting = createLightingDefault("studioProduct");
  const a3dMaterial = new PBRMaterial({ name: "comparison-a3d", baseColor: [0.12, 0.48, 0.82, 1], metallic: 0.1, roughness: 0.34 });
  const threeMaterial = new PBRMaterial({ name: "comparison-three-baseline", baseColor: [0.75, 0.75, 0.75, 1], metallic: 0.05, roughness: 0.5 });
  const migrationMaterial = new PBRMaterial({ name: "comparison-migration", baseColor: [0.88, 0.56, 0.2, 1], metallic: 0.18, roughness: 0.38 });
  const renderItems = [
    {
      label: "comparison-a3d-workflow",
      geometry: Geometry.uvSphere(0.48, 40, 20, { textured: true }),
      material: a3dMaterial,
      modelMatrix: composeMat4([-1.15, 0.05, 0], [0, 0, 0, 1], [1, 1, 1])
    },
    {
      label: "comparison-threejs-reference",
      geometry: Geometry.texturedCube(0.88),
      material: threeMaterial,
      modelMatrix: composeMat4([0, 0, 0], [0, 0.25, 0, 0.97], [1, 1, 1])
    },
    {
      label: "comparison-migration-output",
      geometry: Geometry.cylinder({ radius: 0.36, height: 1, segments: 32, textured: true }),
      material: migrationMaterial,
      modelMatrix: composeMat4([1.15, 0, 0], [0, 0, 0, 1], [1, 1, 1])
    }
  ];
  const comparison = {
    focus,
    a3dSteps: [
      "create workflow render source",
      "load optional asset/environment through public package APIs",
      "render through Renderer.create with diagnostics"
    ],
    threeJsSteps: [
      "create scene, camera, renderer, lights, controls, loader, material setup, and animation loop separately",
      "wire resource disposal and resize handling manually",
      "add diagnostics through user-land instrumentation"
    ],
    migrationNotes: [
      "A3D comparison workflow renders a A3D-owned parity scene; it does not embed Three.js at runtime.",
      "Use @aura3d/three-compat for adapter coverage and warnings when moving Three.js example code."
    ]
  };
  const source = {
    renderItems,
    cameraPolicy: "auto-frame" as const,
    cameraFrameOptions: { paddingRatio: 0.22, yawRadians: -0.36, pitchRadians: -0.1 },
    environmentLighting: lighting.environmentLighting,
    shadow: false,
    postprocess: { ...lighting.postprocess, targetFormat: "rgba8" as const }
  };
  return {
    kind: "comparison",
    source,
    renderItems,
    comparison,
    diagnostics: createWorkflowDiagnostics("comparison", {
      warnings: ["Comparison workflow summarizes migration/setup parity; same-scene Three.js visual superiority still requires benchmark reports."],
      featureChecklist: ["a3d-workflow-source", "threejs-setup-comparison", "migration-notes", "render-diagnostics", "postprocess"]
    }),
    dispose: () => undefined
  };
}
