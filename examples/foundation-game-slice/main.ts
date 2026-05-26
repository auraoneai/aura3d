import { createInteractiveSceneWorkflow } from "@aura3d/workflows";
import { mountV3Example } from "../foundation-example-shell";

void mountV3Example({
  id: "foundation-game-slice",
  title: "Game Slice V3",
  summary: "A small realtime slice that proves the renderer and workflow SDK can drive a product-style game viewport.",
  notes: [
    "This is deliberately scoped as a game slice, not a claim that A3D replaces full game engines.",
    "The public workflow handles scene creation while the renderer owns the frame loop and diagnostics.",
    "Use it to validate animation-loop integration before adding input, physics, or gameplay systems."
  ],
  dynamic: true,
  createWorkflow() {
    return createInteractiveSceneWorkflow({ preset: "input-ready" });
  }
});
