import { createSceneShowcaseWorkflow } from "@galileo3d/workflows";
import { WorkflowWorkbenchApp, type WorkflowScenario } from "../../legacy-common/src/WorkflowWorkbench";

const scenarios: readonly WorkflowScenario[] = [
  {
    id: "studio",
    label: "Studio Layout",
    description: "Multi-object product scene with auto camera, studio light, and postprocess.",
    badge: "STD"
  },
  {
    id: "gallery",
    label: "Gallery Layout",
    description: "Interior gallery preset for balanced material and object inspection.",
    badge: "GAL"
  },
  {
    id: "dramatic",
    label: "Dramatic Layout",
    description: "High contrast lighting pass for stress testing color, tone mapping, and object separation.",
    badge: "DRM"
  }
];

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root for Scene Lab.");

const app = new WorkflowWorkbenchApp(root, {
  appId: "scene-lab",
  title: "Scene Lab",
  subtitle: "A scene composition surface for renderer presets, object staging, camera policy, and diagnostics.",
  suiteLabel: "V3 App Suite",
  accent: "#62a9e8",
  scenarios,
  defaultScenarioId: "studio",
  createWorkflow(scenario) {
    return createSceneShowcaseWorkflow({ preset: scenario.id as "studio" | "gallery" | "dramatic" });
  }
});

void app.start();
