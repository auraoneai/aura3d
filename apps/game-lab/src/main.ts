import { createInteractiveSceneWorkflow } from "@aura3d/workflows";
import { WorkflowWorkbenchApp, type WorkflowScenario } from "../../legacy-common/src/WorkflowWorkbench";

const scenarios: readonly WorkflowScenario[] = [
  {
    id: "orbiting-products",
    label: "Orbiting Products",
    description: "Animated render source proving update-loop integration and stable renderer state.",
    badge: "SIM"
  },
  {
    id: "input-ready",
    label: "Input Ready",
    description: "Interactive-scene workflow with frame counters, diagnostics, and app shell controls.",
    badge: "INP"
  }
];

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root for Game Lab.");

const app = new WorkflowWorkbenchApp(root, {
  appId: "game-lab",
  title: "Game Lab",
  subtitle: "A realtime workflow surface for animation loops, renderer diagnostics, and interaction-ready scenes.",
  suiteLabel: "Foundation App Suite",
  accent: "#db6d65",
  scenarios,
  defaultScenarioId: "orbiting-products",
  dynamic: true,
  createWorkflow(scenario) {
    return createInteractiveSceneWorkflow({ preset: scenario.id as "orbiting-products" | "input-ready" });
  }
});

void app.start();
