import { createInteractiveSceneWorkflow } from "@aura3d/workflows";
import { mountFoundationExample } from "../foundation-example-shell";

void mountFoundationExample({
  id: "foundation-interactive-scene",
  title: "Interactive Scene Foundation",
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
