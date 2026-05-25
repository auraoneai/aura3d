import { describe, expect, it } from "vitest";
import {
  V4_PHYSICAL_MATERIAL_MATRIX,
  analyzeV4MaterialMatrix,
  createV4MaterialExtensionDiagnostics,
  createV4PhysicalMaterial,
  evaluateV4Transmission,
  sortV4AlphaItems
} from "../../../packages/rendering/src";

describe("V4 physical material matrix", () => {
  it("defines the required twelve material targets", () => {
    expect(V4_PHYSICAL_MATERIAL_MATRIX.map((material) => material.id)).toEqual([
      "chrome",
      "brushed-metal",
      "gold",
      "painted-metal",
      "matte-plastic",
      "glossy-plastic",
      "rubber",
      "glass-transmission",
      "clearcoat-car-paint",
      "fabric-sheen",
      "emissive",
      "textured-ceramic-stone"
    ]);
  });

  it("classifies materials and reports bounded extension diagnostics", () => {
    const matrix = analyzeV4MaterialMatrix();
    const chrome = matrix.find((entry) => entry.descriptor.id === "chrome")!;
    const glass = matrix.find((entry) => entry.descriptor.id === "glass-transmission")!;
    const fabric = matrix.find((entry) => entry.descriptor.id === "fabric-sheen")!;
    const emissive = matrix.find((entry) => entry.descriptor.id === "emissive")!;

    expect(chrome.reflectanceClass).toBe("mirror-metal");
    expect(chrome.requiresIbl).toBe(true);
    expect(glass.reflectanceClass).toBe("transparent");
    expect(glass.requiresTransmissionPass).toBe(true);
    expect(glass.requiresAlphaSorting).toBe(true);
    expect(glass.warnings.join(" ")).toContain("Transmission is bounded");
    expect(fabric.extensionDiagnostics.some((entry) => entry.extension === "sheen" && entry.support === "bounded")).toBe(true);
    expect(emissive.reflectanceClass).toBe("emissive");
  });

  it("creates individual physical material instances", () => {
    const material = createV4PhysicalMaterial("clearcoat-car-paint");
    const analysis = material.analyze();

    expect(analysis.descriptor.extensions).toContain("clearcoat");
    expect(analysis.descriptor.extensions).toContain("specular");
    expect(analysis.reflectanceClass).toBe("rough-metal");
    expect(analysis.requiresIbl).toBe(true);
  });

  it("reports material extension support boundaries", () => {
    const diagnostics = createV4MaterialExtensionDiagnostics(["clearcoat", "emissive-strength", "transmission", "iridescence"]);

    expect(diagnostics.find((entry) => entry.extension === "emissive-strength")?.support).toBe("supported");
    expect(diagnostics.find((entry) => entry.extension === "clearcoat")?.support).toBe("bounded");
    expect(diagnostics.find((entry) => entry.extension === "transmission")?.diagnostic).toContain("refraction parity is not claimed");
    expect(diagnostics.find((entry) => entry.extension === "iridescence")?.diagnostic).toContain("spectral accuracy is not claimed");
  });

  it("sorts alpha items with blended surfaces back-to-front", () => {
    const sorted = sortV4AlphaItems([
      { id: "glass-near", depth: 2, alphaMode: "blend" },
      { id: "opaque-mid", depth: 5, alphaMode: "opaque" },
      { id: "glass-far", depth: 8, alphaMode: "blend" },
      { id: "masked", depth: 1, alphaMode: "mask" }
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["opaque-mid", "masked", "glass-far", "glass-near"]);
  });

  it("evaluates bounded transmission into display color", () => {
    const result = evaluateV4Transmission({
      baseColor: [0.8, 0.95, 1],
      thickness: 0.2,
      attenuationColor: [0.95, 0.98, 1],
      attenuationDistance: 1.2,
      ior: 1.45,
      intensity: 1.6
    });

    expect(result.bounded).toBe(true);
    expect(result.transmittedColor[2]).toBeGreaterThan(result.transmittedColor[0]!);
    expect(result.displayColor[2]).toBeGreaterThan(result.displayColor[0]!);
    expect(result.diagnostic).toContain("full refraction/caustics parity is not claimed");
  });
});
