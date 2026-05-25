import { createMaterialStudioWorkflow } from "@galileo3d/workflows";
import { mountV3Example } from "../foundation-example-shell";

void mountV3Example({
  id: "foundation-material-studio",
  title: "Material Studio V3",
  summary: "Render a compact material review scene with metal, textured PBR, and normal-mapped materials through one public workflow.",
  notes: [
    "The example creates a workflow result, then renders its public RenderSource.",
    "The material scene includes PBR, textured PBR, normal mapping, environment lighting, and postprocess.",
    "Use it as the base for material QA panels and design-system material previews."
  ],
  createWorkflow() {
    return createMaterialStudioWorkflow({ mode: "comparison" });
  }
});
