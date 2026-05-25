export { createAssetViewerWorkflow } from "../AssetViewerWorkflow";
export { createProductConfiguratorWorkflow } from "../ProductConfiguratorWorkflow";
export { createMaterialStudioWorkflow } from "../MaterialStudioWorkflow";
export { createSceneShowcaseWorkflow } from "../SceneShowcaseWorkflow";
export { createInteractiveSceneWorkflow } from "../InteractiveSceneWorkflow";
export { createAnimationLabWorkflow } from "../AnimationLabWorkflow";
export { createComparisonWorkflow } from "../ComparisonWorkflow";
export { createWorkflowDiagnostics } from "../WorkflowDiagnostics";
export type * from "../WorkflowTypes";

import { createAnimationLabWorkflow } from "../AnimationLabWorkflow";
import { createAssetViewerWorkflow } from "../AssetViewerWorkflow";
import { createComparisonWorkflow } from "../ComparisonWorkflow";
import { createInteractiveSceneWorkflow } from "../InteractiveSceneWorkflow";
import { createMaterialStudioWorkflow } from "../MaterialStudioWorkflow";
import { createProductConfiguratorWorkflow } from "../ProductConfiguratorWorkflow";
import { createSceneShowcaseWorkflow } from "../SceneShowcaseWorkflow";

export const workflows = {
  assetViewer: createAssetViewerWorkflow,
  productConfigurator: createProductConfiguratorWorkflow,
  materialStudio: createMaterialStudioWorkflow,
  sceneShowcase: createSceneShowcaseWorkflow,
  interactiveScene: createInteractiveSceneWorkflow,
  animationLab: createAnimationLabWorkflow,
  comparison: createComparisonWorkflow
} as const;
