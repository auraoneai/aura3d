import { createInteractiveSceneWorkflow } from "@galileo3d/workflows";
import { mountV3Example } from "../v3-example-shell";

void mountV3Example({
  id: "interactive-scene-v3",
  title: "Interactive Scene V3",
  summary: "Run a public interactive workflow with an update loop, animated transforms, camera framing, and renderer diagnostics.",
  notes: [
    "The workflow exposes an update(timeSeconds) function that returns a RenderSource.",
    "The example renders through Renderer.startAnimationLoop() and publishes frame diagnostics.",
    "Use it as the starting point for interactive tools and realtime viewport products."
  ],
  dynamic: true,
  createWorkflow() {
    return createInteractiveSceneWorkflow({ preset: "orbiting-products" });
  }
});
