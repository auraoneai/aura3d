import {
  createEnvironmentBackgroundUniforms,
  type EnvironmentBackgroundEncoding,
  type EnvironmentBackgroundOptions
} from "./EnvironmentBackgroundPass";
import { RenderDeviceError } from "./RenderDevice";
import { Texture, bytesPerPixel, type TextureColorSpace, type TextureCubeFace, type TextureFormat, type TexturePixelData } from "./Texture";
import { TextureBinding } from "./TextureBinding";

export type EnvironmentBackgroundPixelFormat = Extract<TextureFormat, "rgba8" | "rgba16f" | "rgba32f">;

export interface EnvironmentBackgroundResourceOptions {
  readonly encoding?: EnvironmentBackgroundEncoding;
  readonly intensity?: number;
  readonly rotation?: number;
  readonly outputColorSpace?: "linear" | "srgb";
  readonly format?: EnvironmentBackgroundPixelFormat;
  readonly colorSpace?: TextureColorSpace;
  readonly textureLabel?: string;
  readonly bindingName?: string;
}

export interface EquirectEnvironmentBackgroundResourceOptions extends EnvironmentBackgroundResourceOptions {
  readonly width: number;
  readonly height: number;
  readonly data: TexturePixelData;
}

export interface CubemapEnvironmentBackgroundFacePixels {
  readonly face: TextureCubeFace;
  readonly data: TexturePixelData;
}

export interface CubemapEnvironmentBackgroundResourceOptions extends EnvironmentBackgroundResourceOptions {
  readonly size: number;
  readonly faces: readonly CubemapEnvironmentBackgroundFacePixels[];
}

export const ENVIRONMENT_BACKGROUND_CUBE_FACES: readonly TextureCubeFace[] = ["px", "nx", "py", "ny", "pz", "nz"];

export function createEquirectEnvironmentBackgroundOptions(
  options: EquirectEnvironmentBackgroundResourceOptions
): EnvironmentBackgroundOptions {
  const format = options.format ?? "rgba8";
  const encoding = options.encoding ?? "linear";
  const colorSpace = options.colorSpace ?? textureColorSpaceForEncoding(encoding);
  validateEquirectPixelSource(options.width, options.height, options.data, format);
  validateEncodingFormat(encoding, format);

  const texture = new Texture({
    width: options.width,
    height: options.height,
    dimension: "2d",
    format,
    colorSpace,
    label: options.textureLabel ?? "environment-background-equirect",
    data: options.data
  });
  const background: EnvironmentBackgroundOptions = {
    projection: "equirect",
    texture: new TextureBinding({
      name: options.bindingName ?? "u_environmentBackgroundTexture",
      texture,
      required: true,
      expectedColorSpace: colorSpace
    }),
    encoding,
    intensity: options.intensity,
    rotation: options.rotation,
    outputColorSpace: options.outputColorSpace
  };
  return validateEnvironmentBackgroundResourceOptions(background);
}

export function createCubemapEnvironmentBackgroundOptions(
  options: CubemapEnvironmentBackgroundResourceOptions
): EnvironmentBackgroundOptions {
  const format = options.format ?? "rgba8";
  const encoding = options.encoding ?? "linear";
  const colorSpace = options.colorSpace ?? textureColorSpaceForEncoding(encoding);
  validateCubemapPixelSource(options.size, options.faces, format);
  validateEncodingFormat(encoding, format);

  const texture = new Texture({
    width: options.size,
    height: options.size,
    dimension: "cube",
    format,
    colorSpace,
    label: options.textureLabel ?? "environment-background-cubemap",
    cubeFaces: ENVIRONMENT_BACKGROUND_CUBE_FACES.map((face) => ({
      face,
      mipLevels: [{
        width: options.size,
        height: options.size,
        data: options.faces.find((candidate) => candidate.face === face)!.data
      }]
    }))
  });
  const background: EnvironmentBackgroundOptions = {
    projection: "cubemap",
    texture: new TextureBinding({
      name: options.bindingName ?? "u_environmentBackgroundCubeTexture",
      texture,
      required: true,
      expectedColorSpace: colorSpace
    }),
    encoding,
    intensity: options.intensity,
    rotation: options.rotation,
    outputColorSpace: options.outputColorSpace
  };
  return validateEnvironmentBackgroundResourceOptions(background);
}

export function validateEnvironmentBackgroundResourceOptions(options: EnvironmentBackgroundOptions): EnvironmentBackgroundOptions {
  const texture = options.texture.texture;
  if (texture) {
    if (options.projection === "equirect") {
      validateEquirectTexture(texture.width, texture.height, texture.dimension, texture.format);
    } else if (options.projection === "cubemap") {
      validateCubemapTexture(texture.width, texture.height, texture.dimension, texture.cubeFaces.map((face) => face.face), texture.format);
    }
  }
  createEnvironmentBackgroundUniforms(options);
  return options;
}

function validateEquirectPixelSource(
  width: number,
  height: number,
  data: TexturePixelData,
  format: EnvironmentBackgroundPixelFormat
): void {
  validateEquirectTexture(width, height, "2d", format);
  validatePixelData(width, height, data, format, "Equirect environment background pixels");
}

function validateCubemapPixelSource(
  size: number,
  faces: readonly CubemapEnvironmentBackgroundFacePixels[],
  format: EnvironmentBackgroundPixelFormat
): void {
  validatePositiveInteger(size, "Cubemap environment background size");
  if (faces.length !== 6) {
    throw new RenderDeviceError("Cubemap environment background requires exactly six faces", "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
      faceCount: faces.length
    });
  }
  const seen = new Set<TextureCubeFace>();
  for (const face of faces) {
    validateCubeFace(face.face);
    if (seen.has(face.face)) {
      throw new RenderDeviceError("Duplicate cubemap environment background face", "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
        face: face.face
      });
    }
    seen.add(face.face);
    validatePixelData(size, size, face.data, format, `Cubemap environment background face ${face.face}`);
  }
  for (const face of ENVIRONMENT_BACKGROUND_CUBE_FACES) {
    if (!seen.has(face)) {
      throw new RenderDeviceError("Cubemap environment background is missing a required face", "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
        face
      });
    }
  }
}

function validateEquirectTexture(width: number, height: number, dimension: string, format: TextureFormat): void {
  validateSupportedBackgroundFormat(format);
  validatePositiveInteger(width, "Equirect environment background width");
  validatePositiveInteger(height, "Equirect environment background height");
  if (dimension !== "2d") {
    throw new RenderDeviceError("Equirect environment background requires a 2D texture", "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
      textureDimension: dimension
    });
  }
  if (width !== height * 2) {
    throw new RenderDeviceError("Equirect environment background pixels must use a 2:1 width-to-height ratio", "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
      width,
      height
    });
  }
}

function validateCubemapTexture(
  width: number,
  height: number,
  dimension: string,
  faces: readonly TextureCubeFace[],
  format: TextureFormat
): void {
  validateSupportedBackgroundFormat(format);
  validatePositiveInteger(width, "Cubemap environment background width");
  validatePositiveInteger(height, "Cubemap environment background height");
  if (dimension !== "cube") {
    throw new RenderDeviceError("Cubemap environment background requires a cube texture", "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
      textureDimension: dimension
    });
  }
  if (width !== height) {
    throw new RenderDeviceError("Cubemap environment background faces must be square", "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
      width,
      height
    });
  }
  if (faces.length !== 6) {
    throw new RenderDeviceError("Cubemap environment background requires exactly six faces", "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
      faceCount: faces.length
    });
  }
  const seen = new Set<TextureCubeFace>();
  for (const face of faces) {
    validateCubeFace(face);
    if (seen.has(face)) {
      throw new RenderDeviceError("Duplicate cubemap environment background face", "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
        face
      });
    }
    seen.add(face);
  }
  for (const face of ENVIRONMENT_BACKGROUND_CUBE_FACES) {
    if (!seen.has(face)) {
      throw new RenderDeviceError("Cubemap environment background is missing a required face", "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
        face
      });
    }
  }
}

function validatePixelData(
  width: number,
  height: number,
  data: TexturePixelData,
  format: EnvironmentBackgroundPixelFormat,
  label: string
): void {
  validateSupportedBackgroundFormat(format);
  const expectedBytes = width * height * bytesPerPixel(format);
  if (data.byteLength !== expectedBytes) {
    throw new RenderDeviceError(`${label} for ${format} must contain exactly ${expectedBytes} bytes`, "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
      width,
      height,
      format,
      byteLength: data.byteLength,
      expectedBytes
    });
  }
  if (format === "rgba8" && !(data instanceof Uint8Array) && !(data instanceof Uint8ClampedArray)) {
    throw new RenderDeviceError(`${label} for rgba8 must be Uint8Array or Uint8ClampedArray`, "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
      format
    });
  }
  if (format === "rgba16f" && !(data instanceof Uint16Array)) {
    throw new RenderDeviceError(`${label} for rgba16f must be Uint16Array half-float data`, "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
      format
    });
  }
  if (format === "rgba32f") {
    if (!(data instanceof Float32Array)) {
      throw new RenderDeviceError(`${label} for rgba32f must be Float32Array data`, "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
        format
      });
    }
    if (!Array.from(data).every(Number.isFinite)) {
      throw new RenderDeviceError(`${label} for rgba32f must contain finite values`, "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
        format
      });
    }
  }
}

function validateCubeFace(face: TextureCubeFace): void {
  if (!ENVIRONMENT_BACKGROUND_CUBE_FACES.includes(face)) {
    throw new RenderDeviceError("Unsupported cubemap environment background face", "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
      face
    });
  }
}

function validateEncodingFormat(encoding: EnvironmentBackgroundEncoding, format: EnvironmentBackgroundPixelFormat): void {
  if ((encoding === "srgb" || encoding === "rgbe") && format !== "rgba8") {
    throw new RenderDeviceError("sRGB and RGBe environment background encodings require rgba8 pixel data", "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
      encoding,
      format
    });
  }
}

function validateSupportedBackgroundFormat(format: TextureFormat): asserts format is EnvironmentBackgroundPixelFormat {
  if (format !== "rgba8" && format !== "rgba16f" && format !== "rgba32f") {
    throw new RenderDeviceError("Environment background pixel format must be rgba8, rgba16f, or rgba32f", "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
      format
    });
  }
}

function validatePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RenderDeviceError(`${label} must be a positive integer`, "ENVIRONMENT_BACKGROUND_RESOURCE_CONTRACT", {
      value
    });
  }
}

function textureColorSpaceForEncoding(encoding: EnvironmentBackgroundEncoding): TextureColorSpace {
  return encoding === "srgb" ? "srgb" : "linear";
}
