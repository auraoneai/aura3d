import { describe, expect, it } from "vitest";
import { exportNativeScenarioGlb, NATIVE_CAPABILITY_SCENARIOS } from "../../../examples/native-capabilities/index";
import { readIndependentGLTF } from "../../support/independent-interchange-readers";

describe("native capability interchange-export scenario", () => {
  it("is indexed and exports the authored triangle and material as GLB readable by an independent reader", () => {
    expect(NATIVE_CAPABILITY_SCENARIOS.map(({ id }) => id)).toEqual(expect.arrayContaining(["worker-render", "interchange-export"]));
    const result = exportNativeScenarioGlb();
    expect(result.mimeType).toBe("model/gltf-binary");
    expect(result.dependencies).toEqual([]);
    const bytes = result.data as Uint8Array;
    expect(bytes).toBeInstanceOf(Uint8Array);
    const document = readIndependentGLTF(bytes);
    const node = document.findNode("export-sample");
    expect([node.world[12], node.world[13], node.world[14]]).toEqual([1, 0.05, 0]);
    const primitive = document.meshes[node.mesh!]!.primitives[0]!;
    expect(primitive.mode).toBe(4);
    expect(primitive.indices).toEqual([0, 1, 2]);
    expect(primitive.attributes.POSITION!.values.flat().map((value) => Math.round(value * 1e6) / 1e6)).toEqual([-0.7, 0, 0, 0.7, 0, 0, 0, 1.4, 0]);
    expect(primitive.attributes.NORMAL!.values).toEqual([[0, 0, 1], [0, 0, 1], [0, 0, 1]]);
    expect(document.materials[primitive.material!]).toMatchObject({
      name: "export-sample", pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.6 }
    });
    // Every warning is structured; this input has nothing the writer must drop.
    expect(result.warnings.every((warning) => typeof warning.code === "string" && warning.code.length > 0)).toBe(true);
  });
});
