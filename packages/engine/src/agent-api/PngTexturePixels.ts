/** Preserve data-map RGBA bytes without a premultiplied canvas round trip.
 * Other PNG layouts return undefined and retain the browser decoder fallback.
 */
export async function decodePngTexturePixels(bytes: Uint8Array): Promise<{ width: number; height: number; data: Uint8Array } | undefined> {
  if (bytes.length < 33 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71 || typeof DecompressionStream === "undefined") return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20), depth = bytes[24], color = bytes[25];
  if (depth !== 8 || (color !== 6 && color !== 2) || bytes[28] !== 0) return undefined;
  if (width < 1 || height < 1 || width * height > 67_108_864) throw new Error("PNG data-map dimensions exceed decode limit");
  const chunks: Uint8Array[] = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset);
    if (offset + length + 12 > bytes.length) throw new Error("Truncated PNG data-map chunk");
    if (bytes[offset + 4] === 73 && bytes[offset + 5] === 68 && bytes[offset + 6] === 65 && bytes[offset + 7] === 84) chunks.push(bytes.slice(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const compressed = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0; for (const chunk of chunks) { compressed.set(chunk, offset); offset += chunk.length; }
  const raw = new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
  const channels = color === 6 ? 4 : 3, stride = width * channels;
  if (raw.length !== height * (stride + 1)) throw new Error("Invalid PNG data-map scanline length");
  const decoded = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    if (filter > 4) throw new Error("Invalid PNG data-map scanline filter");
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? decoded[y * stride + x - channels]! : 0;
      const b = y > 0 ? decoded[(y - 1) * stride + x]! : 0;
      const c = y > 0 && x >= channels ? decoded[(y - 1) * stride + x - channels]! : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : filter === 4 ? pa <= pb && pa <= pc ? a : pb <= pc ? b : c : 0;
      decoded[y * stride + x] = (raw[y * (stride + 1) + x + 1]! + predictor) & 255;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) { data.set(decoded.subarray(pixel * channels, pixel * channels + 3), pixel * 4); data[pixel * 4 + 3] = channels === 4 ? decoded[pixel * 4 + 3]! : 255; }
  return { width, height, data };
}
