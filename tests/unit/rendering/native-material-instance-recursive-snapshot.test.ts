import { describe, expect, it } from "vitest";
import { Material } from "../../../packages/rendering/src/Material";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import type { RecursiveUniformValue, UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";

class StructuredMaterial extends Material {
  setStructuredParameter(name: string, value: RecursiveUniformValue): void {
    this.setParameterValue(name, value);
  }
}

describe("MaterialInstance recursive snapshots", () => {
  it("merges owned nested values without losing flat or borrowed texture bindings", () => {
    const base = new StructuredMaterial({ shaderKey: "recursive-snapshot" });
    const inherited = { config: { tint: new Float32Array([0.25, 0.5]), flags: [true, false] } };
    const original = { layers: [{ enabled: true, weights: new Uint32Array([16_777_217, 0xffffffff]) }] };
    const override = { layers: [{ enabled: false, weights: new Uint32Array([7, 11]) }] };
    const extra = { values: [[true, false], [false, true]] };
    const texture = new TextureBinding({ name: "borrowed" });
    base.setStructuredParameter("inherited", inherited);
    base.setStructuredParameter("choice", original);
    base.setParameter("flat", [1, 2]);
    base.setParameter("texture", texture);

    const instance = new MaterialInstance(base);
    try {
      instance.setOverride("choice", override);
      instance.setOverride("extra", extra);
      // Keep the existing flat generic API while explicitly requesting recursive values.
      const flat: ReadonlyMap<string, UniformValue> = instance.getParameters();
      const first: ReadonlyMap<string, RecursiveUniformValue> = instance.getParameters<RecursiveUniformValue>();
      const second = instance.getRecursiveParameters();
      expect([...first.keys()]).toEqual(["inherited", "choice", "flat", "texture", "extra"]);
      expect(flat.get("texture")).toBe(texture);
      expect(first.get("texture")).toBe(texture);
      expect(second.get("texture")).toBe(texture);

      inherited.config.tint[0] = 99;
      original.layers[0]!.weights[0] = 99;
      override.layers[0]!.weights[0] = 99;
      extra.values[0]![0] = false;
      const firstInherited = first.get("inherited") as typeof inherited;
      const firstChoice = first.get("choice") as typeof override;
      expect(Array.from(firstInherited.config.tint)).toEqual([0.25, 0.5]);
      expect(Array.from(firstChoice.layers[0]!.weights)).toEqual([7, 11]);
      expect(first.get("extra")).toEqual({ values: [[true, false], [false, true]] });

      firstInherited.config.tint[1] = 88;
      firstChoice.layers[0]!.weights[1] = 88;
      const secondInherited = second.get("inherited") as typeof inherited;
      const secondChoice = second.get("choice") as typeof override;
      expect(Array.from(secondInherited.config.tint)).toEqual([0.25, 0.5]);
      expect(Array.from(secondChoice.layers[0]!.weights)).toEqual([7, 11]);
      expect(Array.from((instance.getRecursiveParameter("choice") as typeof override).layers[0]!.weights)).toEqual([7, 11]);

      instance.clearOverride("choice");
      expect(Array.from((instance.getRecursiveParameters().get("choice") as typeof original).layers[0]!.weights))
        .toEqual([16_777_217, 0xffffffff]);
    } finally {
      base.dispose();
    }
  });
});
