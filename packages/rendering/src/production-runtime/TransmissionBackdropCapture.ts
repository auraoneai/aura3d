import { type RenderMaterial } from "../ForwardPass";
import { Material } from "../Material";
import { MaterialInstance } from "../MaterialInstance";
import type { RenderSource } from "../Renderer";
import { Texture } from "../Texture";
import { TextureBinding } from "../TextureBinding";
import type { ProductionRendererInput, RuntimeParityTransmissionBackdropCaptureOptions } from "./ProductionRendererTypes";

export function normalizeTransmissionBackdropCapture(
  options: ProductionRendererInput["transmissionBackdropCapture"]
): Required<RuntimeParityTransmissionBackdropCaptureOptions> | null {
  if (!options) return null;
  const mode = options.mode ?? "scene-color-readback";
  if (mode !== "scene-color-readback") {
    throw new Error(`Unsupported transmission backdrop capture mode: ${mode}`);
  }
  const strength = options.strength ?? 0.82;
  const refractionScale = options.refractionScale ?? 0.032;
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new RangeError("transmissionBackdropCapture.strength must be finite and within [0, 1]");
  }
  if (!Number.isFinite(refractionScale) || refractionScale < 0) {
    throw new RangeError("transmissionBackdropCapture.refractionScale must be finite and non-negative");
  }
  return { mode, strength, refractionScale };
}

export function bindTransmissionBackdropCapture(
  source: RenderSource,
  texture: Texture,
  options: Required<RuntimeParityTransmissionBackdropCaptureOptions>
): number {
  const binding = new TextureBinding({
    name: "u_transmissionBackdropTexture",
    texture,
    expectedColorSpace: "srgb",
    required: true
  });
  let count = 0;
  for (const material of collectSourceMaterials(source)) {
    setMaterialTransmissionBackdrop(material, binding, options);
    count += 1;
  }
  return count;
}

export function createSceneColorMipLevels(source: Uint8Array, width: number, height: number): readonly {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}[] {
  const levels: { width: number; height: number; data: Uint8Array }[] = [{ width, height, data: new Uint8Array(source) }];
  let previous = levels[0]!;
  while (previous.width > 1 || previous.height > 1) {
    const nextWidth = Math.max(1, Math.floor(previous.width / 2));
    const nextHeight = Math.max(1, Math.floor(previous.height / 2));
    const next = new Uint8Array(nextWidth * nextHeight * 4);
    for (let y = 0; y < nextHeight; y += 1) {
      for (let x = 0; x < nextWidth; x += 1) {
        const targetOffset = (y * nextWidth + x) * 4;
        const samples: number[] = [0, 0, 0, 0];
        let sampleCount = 0;
        for (let dy = 0; dy < 2; dy += 1) {
          for (let dx = 0; dx < 2; dx += 1) {
            const sourceX = Math.min(previous.width - 1, x * 2 + dx);
            const sourceY = Math.min(previous.height - 1, y * 2 + dy);
            const sourceOffset = (sourceY * previous.width + sourceX) * 4;
            samples[0]! += previous.data[sourceOffset] ?? 0;
            samples[1]! += previous.data[sourceOffset + 1] ?? 0;
            samples[2]! += previous.data[sourceOffset + 2] ?? 0;
            samples[3]! += previous.data[sourceOffset + 3] ?? 255;
            sampleCount += 1;
          }
        }
        next[targetOffset] = Math.round(samples[0]! / sampleCount);
        next[targetOffset + 1] = Math.round(samples[1]! / sampleCount);
        next[targetOffset + 2] = Math.round(samples[2]! / sampleCount);
        next[targetOffset + 3] = Math.round(samples[3]! / sampleCount);
      }
    }
    previous = { width: nextWidth, height: nextHeight, data: next };
    levels.push(previous);
  }
  return levels;
}

function setMaterialTransmissionBackdrop(
  material: RenderMaterial,
  binding: TextureBinding,
  options: Required<RuntimeParityTransmissionBackdropCaptureOptions>
): void {
  const target = material instanceof MaterialInstance ? material : material instanceof Material ? material : null;
  if (!target) return;
  const set = (name: string, value: Parameters<Material["setParameter"]>[1]) => {
    if (target instanceof MaterialInstance) {
      target.setOverride(name, value);
    } else {
      target.setParameter(name, value);
    }
  };
  set("u_transmissionBackdropTexture", binding);
  set("u_transmissionBackdropEnabled", 1);
  set("u_transmissionBackdropStrength", options.strength);
  set("u_transmissionBackdropResolution", [binding.texture?.width ?? 1, binding.texture?.height ?? 1]);
  set("u_transmissionBackdropMipCount", binding.texture?.textureLevels.length ?? 1);
  set("u_transmissionBackdropRefractionScale", options.refractionScale);
}

function collectSourceMaterials(source: RenderSource): readonly RenderMaterial[] {
  const materials: RenderMaterial[] = [];
  const seen = new Set<RenderMaterial>();
  const add = (material: RenderMaterial | undefined) => {
    if (!material || seen.has(material)) return;
    seen.add(material);
    materials.push(material);
  };
  const library = source.materialLibrary;
  if (library instanceof Map) {
    for (const material of library.values()) add(material);
  } else if (library) {
    for (const material of Object.values(library)) add(material);
  }
  if (source.renderItems) {
    for (const item of source.renderItems) add(item.material);
  }
  if (source.collectRenderItems) {
    for (const item of source.collectRenderItems()) add(item.material);
  }
  return materials;
}
