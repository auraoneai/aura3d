import { describe, expect, it } from "vitest";
import {
  GLTFLoaderV5,
  HDRLoaderV5,
  KTX2LoaderV5,
  MTLLoaderV5,
  OBJLoaderV5,
  TextureLoaderV5
} from "../../packages/assets/src";
import { GLTFLoaderCompat, OBJLoaderCompat, ThreeCompatTextureLoader } from "../../packages/three-compat/src";

describe("V5 loader corpus", () => {
  it("loads real local GLB, OBJ/MTL, HDR, KTX2, and browser texture samples with diagnostics", () => {
    const gltf = new GLTFLoaderV5().load("fixtures/three-compat/assets/corpus/damaged-helmet.glb");
    const obj = new OBJLoaderV5().load("fixtures/three-compat/loaders/sample.obj");
    const mtl = new MTLLoaderV5().load("fixtures/three-compat/loaders/sample.mtl");
    const hdr = new HDRLoaderV5().load("fixtures/three-compat/environments/hdri/studio_small_08_1k.hdr");
    const ktx2 = new KTX2LoaderV5().load("tests/assets/corpus/ktx2/Rib_N.ktx2");
    const texture = new TextureLoaderV5().load("tests/reports/external-parity-hdr-visual-parity/aura3d-hdr.png");
    const compatGltf = new GLTFLoaderCompat().load("fixtures/three-compat/assets/corpus/boom-box.glb");
    const compatObj = new OBJLoaderCompat().load("fixtures/three-compat/loaders/sample.obj");
    const compatTexture = new ThreeCompatTextureLoader().load("tests/reports/external-parity-hdr-visual-parity/aura3d-hdr.png");

    expect(gltf.diagnostic.status).toBe("loaded");
    expect(gltf.capabilities).toEqual(expect.arrayContaining(["pbr", "animations", "skins", "morph-targets", "extension-diagnostics"]));
    expect(gltf.diagnostic.decoderNeeds).toEqual(expect.arrayContaining(["draco-if-extension-present", "meshopt-if-extension-present", "ktx2-if-extension-present"]));
    expect(obj.vertices).toBeGreaterThanOrEqual(5);
    expect(obj.faces).toBeGreaterThanOrEqual(4);
    expect(obj.mtllibs).toEqual(["sample.mtl"]);
    expect(mtl.materials).toEqual(["sample_clearcoat"]);
    expect(hdr.status).toBe("loaded");
    expect(ktx2.status).toBe("loaded");
    expect(ktx2.decoderNeeds).toEqual(["basis-universal-transcoder"]);
    expect(texture.status).toBe("loaded");
    expect(texture.warnings).toEqual([]);
    expect(compatGltf.diagnostic.status).toBe("loaded");
    expect(compatObj.faces).toBe(obj.faces);
    expect(compatTexture.status).toBe("loaded");
  });
});
