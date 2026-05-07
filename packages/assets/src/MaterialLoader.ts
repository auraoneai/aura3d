import type { AssetLoadRequest, AssetLoader } from "./AssetLoader";
import type { LoadContext } from "./LoadContext";
import {
  Material,
  PBRMaterial,
  UnlitMaterial,
  type PBRMaterialOptions,
  type RenderState,
  type UnlitMaterialOptions
} from "@galileo3d/rendering";

export interface MaterialDescriptorAsset {
  readonly url: string;
  readonly name?: string;
  readonly model: "unlit" | "pbr";
  readonly properties: Readonly<Record<string, unknown>>;
  createMaterial(): Material;
}

export class MaterialLoader implements AssetLoader<MaterialDescriptorAsset> {
  readonly type = "material";

  canLoad(request: AssetLoadRequest): boolean {
    return /\.(?:mat|material)\.json(?:\?.*)?$/i.test(request.url);
  }

  async load(request: AssetLoadRequest, context: LoadContext): Promise<MaterialDescriptorAsset> {
    context.throwIfAborted(request.url);

    if (typeof fetch !== "function") {
      throw new Error("MaterialLoader requires fetch");
    }

    const response = await fetch(request.url, { signal: request.signal });
    if (!response.ok) {
      throw new Error(`Material request failed with ${response.status}`);
    }

    const parsed = (await response.json()) as Partial<MaterialDescriptorAsset>;
    if (parsed.model !== "unlit" && parsed.model !== "pbr") {
      throw new Error(`Unsupported material model for ${request.url}`);
    }

    const descriptor = {
      url: request.url,
      name: parsed.name,
      model: parsed.model,
      properties: parseProperties(parsed.properties, request.url)
    };
    return {
      ...descriptor,
      createMaterial: () => createMaterialFromDescriptor(descriptor)
    };
  }
}

export function createMaterialFromDescriptor(descriptor: Pick<MaterialDescriptorAsset, "name" | "model" | "properties">): Material {
  if (descriptor.model === "unlit") {
    return new UnlitMaterial(toUnlitOptions(descriptor));
  }
  return new PBRMaterial(toPBRMaterialOptions(descriptor));
}

function toUnlitOptions(descriptor: Pick<MaterialDescriptorAsset, "name" | "properties">): UnlitMaterialOptions {
  const color = readVec4(descriptor.properties, ["color", "baseColor", "baseColorFactor"]);
  return {
    name: descriptor.name,
    color: color ?? undefined,
    renderState: readRenderState(descriptor.properties)
  };
}

function toPBRMaterialOptions(descriptor: Pick<MaterialDescriptorAsset, "name" | "properties">): PBRMaterialOptions {
  const properties = descriptor.properties;
  return {
    name: descriptor.name,
    baseColor: readVec4(properties, ["baseColor", "baseColorFactor"]) ?? undefined,
    metallic: readNumber(properties, ["metallic", "metallicFactor"]),
    roughness: readNumber(properties, ["roughness", "roughnessFactor"]),
    emissiveColor: readVec3(properties, ["emissiveColor", "emissiveFactor"]) ?? undefined,
    emissiveStrength: readNumber(properties, ["emissiveStrength"]),
    clearcoatFactor: readNumber(properties, ["clearcoatFactor"]),
    clearcoatRoughnessFactor: readNumber(properties, ["clearcoatRoughnessFactor"]),
    transmissionFactor: readNumber(properties, ["transmissionFactor"]),
    diffuseTransmissionFactor: readNumber(properties, ["diffuseTransmissionFactor"]),
    diffuseTransmissionColorFactor: readVec3(properties, ["diffuseTransmissionColorFactor"]) ?? undefined,
    volumeThicknessFactor: readNumber(properties, ["volumeThicknessFactor"]),
    volumeAttenuationDistance: readNumber(properties, ["volumeAttenuationDistance"]),
    volumeAttenuationColor: readVec3(properties, ["volumeAttenuationColor"]) ?? undefined,
    ior: readNumber(properties, ["ior"]),
    specularFactor: readNumber(properties, ["specularFactor"]),
    specularColorFactor: readVec3(properties, ["specularColorFactor"]) ?? undefined,
    sheenColorFactor: readVec3(properties, ["sheenColorFactor"]) ?? undefined,
    sheenRoughnessFactor: readNumber(properties, ["sheenRoughnessFactor"]),
    anisotropyStrength: readNumber(properties, ["anisotropyStrength"]),
    anisotropyRotation: readNumber(properties, ["anisotropyRotation"]),
    iridescenceFactor: readNumber(properties, ["iridescenceFactor"]),
    iridescenceIor: readNumber(properties, ["iridescenceIor"]),
    iridescenceThicknessMinimum: readNumber(properties, ["iridescenceThicknessMinimum"]),
    iridescenceThicknessMaximum: readNumber(properties, ["iridescenceThicknessMaximum"]),
    dispersion: readNumber(properties, ["dispersion"]),
    renderState: readRenderState(properties)
  };
}

function parseProperties(value: unknown, url: string): Readonly<Record<string, unknown>> {
  if (value === undefined) return {};
  if (!isRecord(value) || Array.isArray(value)) {
    throw new Error(`Material properties for ${url} must be an object`);
  }
  return value;
}

function readNumber(properties: Readonly<Record<string, unknown>>, keys: readonly string[]): number | undefined {
  const value = readFirst(properties, keys);
  if (value === undefined) return undefined;
  if (typeof value !== "number") {
    throw new Error(`Material property ${keys[0]} must be a number`);
  }
  return value;
}

function readVec3(properties: Readonly<Record<string, unknown>>, keys: readonly string[]): readonly [number, number, number] | undefined {
  const value = readFirst(properties, keys);
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`Material property ${keys[0]} must be a vec3`);
  }
  return [readFinite(value[0], keys[0]), readFinite(value[1], keys[0]), readFinite(value[2], keys[0])];
}

function readVec4(properties: Readonly<Record<string, unknown>>, keys: readonly string[]): readonly [number, number, number, number] | undefined {
  const value = readFirst(properties, keys);
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error(`Material property ${keys[0]} must be a vec4`);
  }
  return [readFinite(value[0], keys[0]), readFinite(value[1], keys[0]), readFinite(value[2], keys[0]), readFinite(value[3], keys[0])];
}

function readRenderState(properties: Readonly<Record<string, unknown>>): Partial<RenderState> | undefined {
  const value = properties.renderState;
  if (value === undefined) return undefined;
  if (!isRecord(value) || Array.isArray(value)) {
    throw new Error("Material property renderState must be an object");
  }
  return value as Partial<RenderState>;
}

function readFirst(properties: Readonly<Record<string, unknown>>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (Object.hasOwn(properties, key)) return properties[key];
  }
  return undefined;
}

function readFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Material property ${label} must contain finite numbers`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
