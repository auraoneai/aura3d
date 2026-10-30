/** Types for the authored-texture generator (`gen-textures.mjs`). */
export function encodePngRgba(width: number, height: number, rgba: Uint8Array): Buffer;
export function netAlphaPixels(cells?: number, cellPx?: number, stringPx?: number): { readonly size: number; readonly rgba: Uint8Array };
