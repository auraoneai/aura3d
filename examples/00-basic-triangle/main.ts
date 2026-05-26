import { Geometry, UnlitMaterial } from "@aura3d/rendering";
import { createExample, installExampleStyles, type ExampleMetadata } from "../shared/exampleHarness.js";

const metadata: ExampleMetadata = {
  id: "00-basic-triangle",
  title: "00 Basic Triangle",
  purpose: "Submit a triangle through the public renderer and show the visible validation target.",
  acceptance: "A colored triangle is visible and the renderer reports one draw call.",
};

if (typeof document !== "undefined") {
  installExampleStyles();
  void createExample(metadata, () => {
    const material = new UnlitMaterial({ name: "triangle-orange", color: [1, 0.36, 0.12, 1] });

    return {
      renderItems: [{ geometry: Geometry.triangle(), material, label: "acceptance-triangle" }],
      metrics: { geometry: "triangle", material: material.name },
      draw(context, canvas) {
        context.save();
        context.fillStyle = "rgb(255, 92, 31)";
        context.beginPath();
        context.moveTo(canvas.width * 0.5, canvas.height * 0.18);
        context.lineTo(canvas.width * 0.22, canvas.height * 0.78);
        context.lineTo(canvas.width * 0.78, canvas.height * 0.78);
        context.closePath();
        context.fill();
        context.strokeStyle = "#ffe2d3";
        context.lineWidth = 4;
        context.stroke();
        context.restore();
      },
    };
  });
}
