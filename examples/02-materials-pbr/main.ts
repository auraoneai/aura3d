import { Geometry, PBRMaterial } from "@galileo3d/rendering";
import { createExample, drawLabel, installExampleStyles, type ExampleMetadata } from "../shared/exampleHarness.js";

const metadata: ExampleMetadata = {
  id: "02-materials-pbr",
  title: "02 Materials PBR",
  purpose: "Use the public material path to render a visible comparison grid in the PBR example slot.",
  acceptance: "A material grid is visible; PBR-specific roughness/metalness replaces it when public PBRMaterial exists.",
};

const swatches = [
  { label: "dielectric low rough", color: [0.9, 0.9, 0.86, 1] as const },
  { label: "dielectric high rough", color: [0.45, 0.58, 0.7, 1] as const },
  { label: "metal warm", color: [0.95, 0.64, 0.24, 1] as const },
  { label: "metal cool", color: [0.62, 0.74, 0.86, 1] as const },
];

if (typeof document !== "undefined") {
  installExampleStyles();
  void createExample(metadata, () => ({
    renderItems: swatches.map((swatch) => ({
      geometry: Geometry.litCube(1),
      material: new PBRMaterial({
        name: swatch.label,
        baseColor: swatch.color,
        metallic: swatch.label.includes("metal") ? 1 : 0,
        roughness: swatch.label.includes("high") ? 0.9 : 0.25,
      }),
      label: swatch.label,
    })),
    metrics: { materials: swatches.length, pbrPublicApi: true },
    draw(context, canvas) {
      const cell = 150;
      const startX = canvas.width / 2 - cell * 1.1;
      const startY = canvas.height / 2 - cell * 0.75;
      swatches.forEach((swatch, index) => {
        const x = startX + (index % 2) * cell * 1.35;
        const y = startY + Math.floor(index / 2) * cell * 1.15;
        context.fillStyle = `rgba(${swatch.color[0] * 255}, ${swatch.color[1] * 255}, ${swatch.color[2] * 255}, 1)`;
        context.beginPath();
        context.arc(x + cell / 2, y + cell / 2, 48, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "#f5f7fa";
        context.lineWidth = 2;
        context.stroke();
        drawLabel(context, swatch.label, x, y + cell + 8);
      });
    },
  }));
}
