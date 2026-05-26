import { createMaterialStudioWorkflow } from "@aura3d/workflows";
import { WorkflowWorkbenchApp, type WorkflowScenario } from "../../v3-common/src/WorkflowWorkbench";

const scenarios: readonly WorkflowScenario[] = [
  {
    id: "comparison",
    label: "PBR Comparison",
    description: "Metal, textured PBR, and normal mapped materials rendered side by side.",
    badge: "MAT"
  },
  {
    id: "metals",
    label: "Metal Inspection",
    description: "High specular response scene for checking roughness and environment lighting.",
    badge: "MTL"
  },
  {
    id: "transparent",
    label: "Gallery Light",
    description: "Interior-gallery lighting path with postprocess preserved for material review.",
    badge: "GLR"
  }
];

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root for Material Lab.");

const app = new WorkflowWorkbenchApp(root, {
  appId: "material-lab",
  title: "Material Lab",
  subtitle: "A material authoring workbench for PBR, texture, normal map, lighting, and postprocess review.",
  suiteLabel: "V3 App Suite",
  accent: "#e0a64d",
  scenarios,
  defaultScenarioId: "comparison",
  createWorkflow(scenario) {
    return createMaterialStudioWorkflow({ mode: scenario.id as "comparison" | "metals" | "transparent" });
  }
});

void app.start();
