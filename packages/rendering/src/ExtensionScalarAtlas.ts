import { Texture } from "./Texture";

export const EXTENSION_SCALAR_ATLAS_SLOTS = ["clearcoat", "clearcoatRoughness", "sheenRoughness", "iridescence", "iridescenceThickness"] as const;
export type ExtensionScalarAtlasSlot = typeof EXTENSION_SCALAR_ATLAS_SLOTS[number];
export interface ExtensionScalarPixels { readonly width: number; readonly height: number; readonly data: Uint8Array | Uint8ClampedArray; }
export type ExtensionScalarAtlas = { readonly texture: Texture; readonly originsY?: Readonly<Record<ExtensionScalarAtlasSlot, number>> } & Readonly<Record<ExtensionScalarAtlasSlot, readonly [number, number, number, number]>>;

/** Each map keeps its own dimensions and complete mip chain in an isolated column.
 * Shader texelFetch performs filtering inside the selected map/level, so adjacent
 * columns and mip levels cannot bleed, including repeat and negative UVs.
 */
export function createExtensionScalarAtlas(inputs: Readonly<Partial<Record<ExtensionScalarAtlasSlot, ExtensionScalarPixels>>>, maxTextureSize = 16384): ExtensionScalarAtlas {
  if (!Number.isSafeInteger(maxTextureSize) || maxTextureSize < 1) throw new Error("Invalid atlas maximum texture size");
  // Validate the complete layout before copying source pixels or allocating mip chains.
  const bounds = EXTENSION_SCALAR_ATLAS_SLOTS.map((slot) => {
    const source = inputs[slot]; const width = source?.width ?? 1, height = source?.height ?? 1;
    if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1 || (source && source.data.length !== width * height * 4)) throw new Error(`Invalid extension atlas pixels for ${slot}`);
    let stripHeight = height, mipWidth = width, mipHeight = height;
    while (mipWidth > 1 || mipHeight > 1) { mipWidth = Math.max(1, Math.floor(mipWidth / 2)); mipHeight = Math.max(1, Math.floor(mipHeight / 2)); stripHeight += mipHeight; }
    if (width > maxTextureSize || stripHeight > maxTextureSize) throw new Error(`Extension atlas source ${slot} exceeds maximum texture size ${maxTextureSize}`);
    return { width, height, stripHeight };
  }).sort((a, b) => b.height - a.height);
  let preflightX = 0, preflightY = 0, preflightRow = 0;
  for (const bound of bounds) {
    if (preflightX + bound.width > maxTextureSize) { preflightY += preflightRow; preflightX = 0; preflightRow = 0; }
    if (preflightY + bound.stripHeight > maxTextureSize) throw new Error(`Extension atlas cannot fit within ${maxTextureSize} square pixels`);
    preflightX += bound.width; preflightRow = Math.max(preflightRow, bound.stripHeight);
  }
  const chains = EXTENSION_SCALAR_ATLAS_SLOTS.map((slot) => {
    const input = inputs[slot] ?? { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) };
    if (!Number.isSafeInteger(input.width) || input.width < 1 || !Number.isSafeInteger(input.height) || input.height < 1 || input.data.length !== input.width * input.height * 4) throw new Error(`Invalid extension atlas pixels for ${slot}`);
    if (input.width > maxTextureSize || input.height > maxTextureSize) throw new Error(`Extension atlas source ${slot} exceeds maximum texture size ${maxTextureSize}`);
    const levels: ExtensionScalarPixels[] = [{ ...input, data: new Uint8Array(input.data) }];
    while (levels.at(-1)!.width > 1 || levels.at(-1)!.height > 1) {
      const source = levels.at(-1)!;
      const width = Math.max(1, Math.floor(source.width / 2));
      const height = Math.max(1, Math.floor(source.height / 2));
      const data = new Uint8Array(width * height * 4);
      // Area-weighted reduction retains the final odd row/column for NPOT maps.
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const left = x * source.width / width, right = (x + 1) * source.width / width;
        const top = y * source.height / height, bottom = (y + 1) * source.height / height;
        const sums = [0, 0, 0, 0]; let weight = 0;
        for (let sy = Math.floor(top); sy < Math.ceil(bottom); sy++) for (let sx = Math.floor(left); sx < Math.ceil(right); sx++) {
          const area = (Math.min(right, sx + 1) - Math.max(left, sx)) * (Math.min(bottom, sy + 1) - Math.max(top, sy));
          weight += area;
          for (let channel = 0; channel < 4; channel++) sums[channel] = sums[channel]! + source.data[(sy * source.width + sx) * 4 + channel]! * area;
        }
        for (let channel = 0; channel < 4; channel++) data[(y * width + x) * 4 + channel] = Math.round(sums[channel]! / weight);
      }
      levels.push({ width, height, data });
    }
    return { slot, levels };
  });
  const placements = new Map<ExtensionScalarAtlasSlot, { x: number; y: number }>();
  let cursorX = 0, cursorY = 0, rowHeight = 0, width = 0;
  for (const { slot, levels } of [...chains].sort((a, b) => b.levels[0]!.height - a.levels[0]!.height)) {
    const stripWidth = levels[0]!.width, stripHeight = levels.reduce((sum, level) => sum + level.height, 0);
    if (stripHeight > maxTextureSize) throw new Error(`Extension atlas mip strip ${slot} exceeds maximum texture size ${maxTextureSize}`);
    if (cursorX + stripWidth > maxTextureSize) { cursorY += rowHeight; cursorX = 0; rowHeight = 0; }
    if (cursorY + stripHeight > maxTextureSize) throw new Error(`Extension atlas cannot fit within ${maxTextureSize} square pixels`);
    placements.set(slot, { x: cursorX, y: cursorY });
    cursorX += stripWidth; rowHeight = Math.max(rowHeight, stripHeight); width = Math.max(width, cursorX);
  }
  const height = cursorY + rowHeight;
  const data = new Uint8Array(width * height * 4);
  const metadata: Partial<Record<ExtensionScalarAtlasSlot, readonly [number, number, number, number]>> = {};
  const originsY: Record<string, number> = {};
  for (const { slot, levels } of chains) {
    const base = levels[0]!;
    const { x, y: originY } = placements.get(slot)!;
    originsY[slot] = originY;
    metadata[slot] = [x, base.width, base.height, levels.length - 1];
    let y = originY;
    for (const level of levels) {
      for (let row = 0; row < level.height; row++) data.set(level.data.subarray(row * level.width * 4, (row + 1) * level.width * 4), ((y + row) * width + x) * 4);
      y += level.height;
    }

  }
  return { texture: new Texture({ width, height, data, colorSpace: "linear", label: "extension-scalar-atlas" }), originsY, ...metadata } as ExtensionScalarAtlas;
}
