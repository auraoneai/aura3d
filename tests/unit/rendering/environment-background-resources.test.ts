import { describe, expect, it } from "vitest";
import {
  ENVIRONMENT_BACKGROUND_CUBE_FACES,
  Texture,
  TextureBinding,
  createCubemapEnvironmentBackgroundOptions,
  createEnvironmentBackgroundUniforms,
  createEquirectEnvironmentBackgroundOptions,
  validateEnvironmentBackgroundResourceOptions,
  type CubemapEnvironmentBackgroundFacePixels
} from "../../../packages/rendering/src";

describe("environment background resource helpers", () => {
  it("creates TextureBinding-backed equirect background options from raw pixels", () => {
    const background = createEquirectEnvironmentBackgroundOptions({
      width: 4,
      height: 2,
      data: solidRgbaPixels(4, 2, [24, 64, 128, 255]),
      encoding: "srgb",
      intensity: 0.75,
      rotation: 0.125,
      outputColorSpace: "linear",
      textureLabel: "unit-equirect-background"
    });

    expect(validateEnvironmentBackgroundResourceOptions(background)).toBe(background);
    expect(background.projection).toBe("equirect");
    expect(background.texture).toBeInstanceOf(TextureBinding);
    expect(background.texture.name).toBe("u_environmentBackgroundTexture");
    expect(background.texture.expectedColorSpace).toBe("srgb");
    expect(background.texture.texture).toBeInstanceOf(Texture);
    expect(background.texture.texture?.label).toBe("unit-equirect-background");
    expect(background.texture.texture?.dimension).toBe("2d");
    expect(background.texture.texture?.colorSpace).toBe("srgb");

    const uniforms = createEnvironmentBackgroundUniforms(background);
    expect(uniforms.get("u_environmentBackgroundProjection")).toBe(1);
    expect(uniforms.get("u_environmentBackgroundTexture")).toBe(background.texture);
    expect((uniforms.get("u_environmentBackgroundCubeTexture") as TextureBinding).texture).toBeNull();
    expect(uniforms.get("u_environmentBackgroundIntensity")).toBe(0.75);
    expect(uniforms.get("u_environmentBackgroundRotation")).toBe(0.125);
    expect(uniforms.get("u_outputColorSpace")).toBe(0);
  });

  it("creates TextureBinding-backed cubemap background options from raw face pixels", () => {
    const background = createCubemapEnvironmentBackgroundOptions({
      size: 2,
      faces: [...createCubeFaces(2)].reverse(),
      encoding: "rgbe",
      outputColorSpace: "srgb",
      textureLabel: "unit-cubemap-background"
    });

    expect(background.projection).toBe("cubemap");
    expect(background.texture).toBeInstanceOf(TextureBinding);
    expect(background.texture.name).toBe("u_environmentBackgroundCubeTexture");
    expect(background.texture.expectedColorSpace).toBe("linear");
    expect(background.texture.texture).toBeInstanceOf(Texture);
    expect(background.texture.texture?.label).toBe("unit-cubemap-background");
    expect(background.texture.texture?.dimension).toBe("cube");
    expect(background.texture.texture?.cubeFaces.map((face) => face.face)).toEqual(ENVIRONMENT_BACKGROUND_CUBE_FACES);

    const uniforms = createEnvironmentBackgroundUniforms(background);
    expect(uniforms.get("u_environmentBackgroundProjection")).toBe(2);
    expect((uniforms.get("u_environmentBackgroundTexture") as TextureBinding).texture).toBeNull();
    expect(uniforms.get("u_environmentBackgroundCubeTexture")).toBe(background.texture);
    expect(uniforms.get("u_environmentBackgroundEncoding")).toBe(2);
    expect(uniforms.get("u_outputColorSpace")).toBe(1);
  });

  it("rejects wrong equirect dimensions and malformed cubemap faces", () => {
    expect(() => createEquirectEnvironmentBackgroundOptions({
      width: 4,
      height: 4,
      data: solidRgbaPixels(4, 4, [0, 0, 0, 255])
    })).toThrow(/2:1/);

    const squareTexture = new Texture({
      width: 2,
      height: 2,
      data: solidRgbaPixels(2, 2, [0, 0, 0, 255])
    });
    expect(() => validateEnvironmentBackgroundResourceOptions({
      projection: "equirect",
      texture: new TextureBinding({ name: "manual-square-equirect", texture: squareTexture, required: true })
    })).toThrow(/2:1/);

    expect(() => createCubemapEnvironmentBackgroundOptions({
      size: 2,
      faces: createCubeFaces(2).slice(0, 5)
    })).toThrow(/six faces/);

    const duplicateFaces = createCubeFaces(2);
    duplicateFaces[5] = { face: "px", data: solidRgbaPixels(2, 2, [255, 255, 255, 255]) };
    expect(() => createCubemapEnvironmentBackgroundOptions({
      size: 2,
      faces: duplicateFaces
    })).toThrow(/Duplicate cubemap/);

    const wrongFaceBytes = createCubeFaces(2);
    wrongFaceBytes[0] = { face: "px", data: new Uint8Array(4) };
    expect(() => createCubemapEnvironmentBackgroundOptions({
      size: 2,
      faces: wrongFaceBytes
    })).toThrow(/must contain exactly 16 bytes/);
  });

  it("rejects invalid intensity, rotation, and output color settings", () => {
    const background = createEquirectEnvironmentBackgroundOptions({
      width: 4,
      height: 2,
      data: solidRgbaPixels(4, 2, [16, 32, 64, 255])
    });

    expect(() => validateEnvironmentBackgroundResourceOptions({
      ...background,
      intensity: -0.01
    })).toThrow(/intensity/);
    expect(() => validateEnvironmentBackgroundResourceOptions({
      ...background,
      rotation: Number.NaN
    })).toThrow(/rotation/);
    expect(() => validateEnvironmentBackgroundResourceOptions({
      ...background,
      outputColorSpace: "display-p3" as "srgb"
    })).toThrow(/outputColorSpace/);
  });
});

function solidRgbaPixels(width: number, height: number, rgba: readonly [number, number, number, number]): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data.set(rgba, offset);
  }
  return data;
}

function createCubeFaces(size: number): CubemapEnvironmentBackgroundFacePixels[] {
  return ENVIRONMENT_BACKGROUND_CUBE_FACES.map((face, index) => ({
    face,
    data: solidRgbaPixels(size, size, [20 + index * 15, 40 + index * 10, 80 + index * 8, 255])
  }));
}
