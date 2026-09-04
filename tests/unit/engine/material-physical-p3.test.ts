import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  createPhysicalMaterialSpec,
  PHYSICAL_EXTENSION_MATRIX
} from "../../../packages/engine/src/material-physical/PhysicalMaterialSpec.js";
import {
  EXTERNAL_PARITY_MATERIAL_EXTENSION_SUPPORT,
  getExternalParityMaterialExtensionState
} from "../../../packages/rendering/src/materials/MaterialExtensions.js";

describe("P3 root material.physical spec path", () => {
  test("bare physical spec carries explicit defaults, no aliasing", () => {
    const { spec, requestedExtensions, boundedWarnings } = createPhysicalMaterialSpec();
    assert.equal(spec.clearcoat, 0);
    assert.equal(spec.sheen, 0);
    assert.equal(spec.iridescence, 0);
    assert.equal(spec.anisotropy, 0);
    assert.equal(spec.transmission, 0);
    assert.equal(spec.ior, 1.5);
    assert.deepEqual(requestedExtensions, []);
    assert.deepEqual(boundedWarnings, []);
  });

  test("requested extensions emit bounded matrix diagnostics, never silent acceptance", () => {
    const { spec, requestedExtensions, boundedWarnings } = createPhysicalMaterialSpec({
      color: "#8a1a1a",
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      sheen: 0.5,
      iridescence: 0.3,
      anisotropy: 0.8,
      transmission: 0.9,
      thickness: 0.5,
      ior: 1.52
    });
    assert.equal(spec.color, "#8a1a1a");
    for (const extension of ["clearcoat", "sheen", "iridescence", "anisotropy", "transmission", "volume", "ior"] as const) {
      assert.ok(requestedExtensions.includes(extension), `missing requested extension: ${extension}`);
      assert.ok(
        boundedWarnings.some((warning) => warning.startsWith(`${extension}:`)),
        `missing bounded warning: ${extension}`
      );
    }
  });

  test("local matrix mirrors the MaterialExtensions support table per extension", () => {
    for (const entry of PHYSICAL_EXTENSION_MATRIX) {
      const source = getExternalParityMaterialExtensionState(entry.extension);
      assert.equal(entry.support, source.support, `matrix drift: ${entry.extension}`);
      assert.equal(entry.diagnostic, source.diagnostic, `diagnostic drift: ${entry.extension}`);
    }
    assert.ok(
      PHYSICAL_EXTENSION_MATRIX.every((entry) => entry.support === "bounded"),
      "every physical extension stays bounded until pixel proof lands"
    );
    assert.ok(EXTERNAL_PARITY_MATERIAL_EXTENSION_SUPPORT.length >= PHYSICAL_EXTENSION_MATRIX.length);
  });

  test("volume intent via attenuation params also warns", () => {
    const { requestedExtensions, boundedWarnings } = createPhysicalMaterialSpec({ attenuationDistance: 2.5 });
    assert.ok(requestedExtensions.includes("volume"));
    assert.ok(boundedWarnings.some((warning) => warning.startsWith("volume:")));
  });

  test("every extension propagates its exact requested value, never a default", () => {
    const cases = [
      { options: { clearcoat: 1 }, extension: "clearcoat", key: "clearcoat", value: 1 },
      { options: { sheen: 0.5 }, extension: "sheen", key: "sheen", value: 0.5 },
      { options: { iridescence: 0.3 }, extension: "iridescence", key: "iridescence", value: 0.3 },
      { options: { anisotropy: 0.8 }, extension: "anisotropy", key: "anisotropy", value: 0.8 },
      { options: { transmission: 0.9 }, extension: "transmission", key: "transmission", value: 0.9 },
      { options: { thickness: 0.5 }, extension: "volume", key: "thickness", value: 0.5 },
      { options: { ior: 1.52 }, extension: "ior", key: "ior", value: 1.52 },
      { options: { specularIntensity: 0.7 }, extension: "specular", key: "specularIntensity", value: 0.7 }
    ] as const;
    for (const { options, extension, key, value } of cases) {
      const result = createPhysicalMaterialSpec(options);
      assert.ok(result.requestedExtensions.includes(extension), `missing requested extension: ${extension}`);
      assert.equal(result.spec[key], value, `dropped ${key} value`);
      assert.ok(
        result.boundedWarnings.some((warning) => warning.startsWith(`${extension}:`)),
        `missing bounded warning: ${extension}`
      );
    }
  });

  test("physical is its own spec path, not a pbr alias: extension params warn only through physical", () => {
    // If `physical` regresses to the bare `(o) => material.pbr(o)` alias, the
    // warning assertion below fails while values still pass — the spec path,
    // not just the values, is earned here.
    const { spec } = createPhysicalMaterialSpec({ clearcoat: 1 });
    assert.equal(spec.clearcoat, 1);
    assert.ok(createPhysicalMaterialSpec({ clearcoat: 1 }).boundedWarnings.length > 0);
    assert.deepEqual(createPhysicalMaterialSpec().boundedWarnings, []);
  });
});
