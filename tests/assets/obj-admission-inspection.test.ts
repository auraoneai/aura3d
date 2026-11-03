import { describe, expect, it } from "vitest";
import { OBJLoader } from "../../packages/assets/src/OBJLoader";

const triangle = ["mtllib materials/test.mtl", "v 0 0 0", "v 2 0 0", "v 0 3 0", "vt 0 0", "vt 1 0", "vt 0 1", "usemtl painted", "f 1/1 2/2 3/3", ""].join("\n");

describe("bounded OBJ admission inspection", () => {
  it("uses the runtime geometry parser and reports unmapped directives", () => {
    const loader = new OBJLoader();
    expect(loader.inspect(`${triangle}curv 0 1 1 2 3\n`)).toMatchObject({
      materialLibraries: ["materials/test.mtl"], materialNames: ["painted"], vertexCount: 3, primitiveCount: 1,
      min: [0, 0, 0], max: [2, 3, 0], diagnostics: [expect.stringContaining("curv")]
    });
    expect(() => loader.inspect(triangle.replace("f 1/1 2/2 3/3", "f 1/1 2/2 9/3"))).toThrow(/index/i);
  });

  it("uses the runtime MTL parser and resolves maps relative to the material library", () => {
    const materials = new OBJLoader().inspectMaterialLibrary("newmtl painted\nKd 1 0 0\nmap_Kd textures/red.png\nmap_d alpha.png\n", "https://example.test/models/materials/test.mtl");
    expect(materials).toEqual([{
      name: "painted", textures: ["https://example.test/models/materials/textures/red.png"],
      textureReferences: ["textures/red.png"],
      diagnostics: [expect.stringContaining("map_d")]
    }]);
    expect(() => new OBJLoader().inspectMaterialLibrary("newmtl painted\nmap_Kd -unknown red.png\n", "https://example.test/test.mtl")).toThrow(/unsupported texture option/);
  });
});
