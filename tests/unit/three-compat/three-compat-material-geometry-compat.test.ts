import { describe, expect, it } from "vitest";
import {
  BoxGeometryCompat,
  BufferGeometryCompat,
  CircleGeometryCompat,
  ConeGeometryCompat,
  CylinderGeometryCompat,
  InstancedBufferGeometryCompat,
  LineBasicMaterialCompat,
  MeshBasicMaterialCompat,
  MeshLambertMaterialCompat,
  MeshPhongMaterialCompat,
  MeshPhysicalMaterialCompat,
  MeshStandardMaterialCompat,
  PlaneGeometryCompat,
  PointsCompat,
  PointsMaterialCompat,
  ShaderMaterialCompat,
  SphereGeometryCompat,
  SpriteBatchCompat,
  SpriteCompat,
  SpriteMaterialCompat,
  TextureLoaderCompat,
  TorusGeometryCompat,
  THREE_COMPAT_COMPAT_GEOMETRY_TYPES,
  THREE_COMPAT_COMPAT_MATERIAL_TYPES,
  THREE_COMPAT_COMPAT_TEXTURE_SETTINGS,
  WebGLMultipleRenderTargetsCompat,
  WebGLRenderTargetCompat
} from "../../../packages/three-compat/src";

describe("ThreeCompat material and geometry compatibility", () => {
  it("covers common Three.js geometry, material, texture, and render target APIs", () => {
    const geometries = [
      new BoxGeometryCompat(),
      new SphereGeometryCompat(),
      new PlaneGeometryCompat(),
      new CylinderGeometryCompat(),
      new TorusGeometryCompat(),
      new ConeGeometryCompat(),
      new CircleGeometryCompat(),
      new BufferGeometryCompat().setAttribute("position", { array: [0, 0, 0], itemSize: 3 }),
      new InstancedBufferGeometryCompat()
    ];
    const materials = [
      new MeshBasicMaterialCompat(),
      new MeshLambertMaterialCompat(),
      new MeshPhongMaterialCompat(),
      new MeshStandardMaterialCompat(),
      new MeshPhysicalMaterialCompat(),
      new ShaderMaterialCompat(),
      new PointsMaterialCompat({ size: 2, sizeAttenuation: false }),
      new LineBasicMaterialCompat(),
      new SpriteMaterialCompat({ rotation: 0.25, sizeAttenuation: false })
    ];
    const bufferGeometry = geometries[7] as BufferGeometryCompat;
    const points = new PointsCompat(bufferGeometry, materials[6]);
    const spriteBatch = new SpriteBatchCompat();
    const sprite = new SpriteCompat(materials[8]);
    sprite.position.set(1, 2, 3);
    sprite.scale.set(0.5, 0.75, 1);
    spriteBatch.addSprite(sprite);
    const texture = new TextureLoaderCompat().load("checked-public-texture.png");
    texture.wrapS = "RepeatWrapping";
    texture.wrapT = "MirroredRepeatWrapping";
    bufferGeometry.setDrawRange(3, 6).setAttribute("normal", { array: [0, 1, 0], itemSize: 3 });
    const target = new WebGLRenderTargetCompat(512, 512, 4);
    const mrt = new WebGLMultipleRenderTargetsCompat(256, 256, 4);
    target.setSize(1024, 512);

    expect(geometries.map((geometry) => geometry.type)).toEqual([...THREE_COMPAT_COMPAT_GEOMETRY_TYPES]);
    expect(bufferGeometry.getAttribute("normal")?.array).toEqual([0, 1, 0]);
    expect(bufferGeometry.drawRange).toEqual({ start: 3, count: 6 });
    bufferGeometry.deleteAttribute("normal");
    expect(bufferGeometry.getAttribute("normal")).toBeUndefined();
    expect(() => bufferGeometry.setDrawRange(-1, 2)).toThrow(/drawRange/);
    expect(materials.map((material) => material.type)).toEqual([...THREE_COMPAT_COMPAT_MATERIAL_TYPES]);
    expect((materials[6] as PointsMaterialCompat).sizeAttenuation).toBe(false);
    expect((materials[8] as SpriteMaterialCompat).rotation).toBe(0.25);
    expect(points.type).toBe("Points");
    expect(spriteBatch.buildInstanceData()).toEqual([expect.objectContaining({
      position: [1, 2, 3],
      scale: [0.5, 0.75],
      rotation: 0.25
    })]);
    expect(spriteBatch.children).toContain(sprite);
    expect(THREE_COMPAT_COMPAT_TEXTURE_SETTINGS).toEqual(["wrapS", "wrapT", "magFilter", "minFilter", "colorSpace", "flipY"]);
    expect(texture.needsUpdate).toBe(true);
    expect(target.width).toBe(1024);
    expect(mrt.textures).toHaveLength(4);
  });
});
