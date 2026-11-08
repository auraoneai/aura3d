/**
 * B1 three.js asset bridge: the headless runtime pieces.
 *
 * three's GLTFExporter is written for a browser: it reads Blobs through
 * `FileReader` and rasterises DataTexture pixels through a 2D canvas. Node has
 * Blob but neither of the other two, so the bridge installs a narrow shim for
 * the duration of one export and removes it afterwards. The canvas shim only
 * supports what the exporter does to a DataTexture (optional vertical flip,
 * putImageData, convertToBlob as PNG); drawing an HTML image or another canvas
 * throws, and the bridge reports that texture as unsupported.
 *
 * The seeded random source replaces Math.random while the factory runs and
 * while its assets settle, so the same seed produces the same GLB bytes.
 */

import { deflateSync } from "node:zlib";

/** mulberry32: small, fast, and the same sequence on every platform. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Run `fn` with Math.random replaced by `random`; always restores it. */
export async function withRandom<T>(random: () => number, fn: () => Promise<T>): Promise<T> {
  const original = Math.random;
  Math.random = random;
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Encode straight RGBA8 pixels (row 0 at the top) as a PNG. Deterministic. */
export function encodePng(width: number, height: number, rgba: ArrayLike<number>): Uint8Array {
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    for (let i = 0; i < width * 4; i += 1) raw[y * (width * 4 + 1) + 1 + i] = rgba[y * width * 4 + i]!;
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", new Uint8Array(deflateSync(raw, { level: 9 }))),
    pngChunk("IEND", new Uint8Array(0))
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

class HeadlessImageData {
  constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {}
}

class HeadlessContext2D {
  private flipY = false;
  constructor(private readonly canvas: HeadlessCanvas) {}
  translate(_x: number, _y: number): void { /* only the exporter's flip pair is supported */ }
  scale(_sx: number, sy: number): void { if (sy < 0) this.flipY = !this.flipY; }
  putImageData(image: HeadlessImageData, dx: number, dy: number): void {
    const { width, height, pixels } = this.canvas;
    for (let y = 0; y < image.height; y += 1) {
      const ty = this.flipY ? height - 1 - (y + dy) : y + dy;
      if (ty < 0 || ty >= height) continue;
      for (let x = 0; x < image.width; x += 1) {
        const tx = x + dx;
        if (tx < 0 || tx >= width) continue;
        for (let c = 0; c < 4; c += 1) pixels[(ty * width + tx) * 4 + c] = image.data[(y * image.width + x) * 4 + c]!;
      }
    }
  }
  drawImage(): void {
    throw new Error("IMPORT_THREE_HEADLESS_IMAGE: only DataTexture pixels can be baked headless; image, canvas and video textures are unsupported.");
  }
}

class HeadlessCanvas {
  private w = 1;
  private h = 1;
  pixels = new Uint8ClampedArray(4);
  constructor(width = 1, height = 1) { this.w = width; this.h = height; this.resize(); }
  get width(): number { return this.w; }
  set width(v: number) { this.w = v; this.resize(); }
  get height(): number { return this.h; }
  set height(v: number) { this.h = v; this.resize(); }
  private resize(): void { this.pixels = new Uint8ClampedArray(this.w * this.h * 4); }
  getContext(): HeadlessContext2D { return new HeadlessContext2D(this); }
  async convertToBlob(): Promise<Blob> {
    return new Blob([encodePng(this.w, this.h, this.pixels) as BlobPart], { type: "image/png" });
  }
}

class HeadlessFileReader {
  result: ArrayBuffer | string | null = null;
  onload: ((event: { target: HeadlessFileReader }) => void) | null = null;
  onloadend: ((event: { target: HeadlessFileReader }) => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((buffer) => this.finish(buffer));
  }
  readAsDataURL(blob: Blob): void {
    void blob.arrayBuffer().then((buffer) => this.finish(`data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buffer).toString("base64")}`));
  }
  private finish(result: ArrayBuffer | string): void {
    this.result = result;
    this.onload?.({ target: this });
    this.onloadend?.({ target: this });
  }
}

/**
 * Install FileReader / OffscreenCanvas / ImageData where the host lacks them.
 * Returns a restore function that removes only what this call added.
 */
export function installHeadlessExportShims(): () => void {
  const scope = globalThis as Record<string, unknown>;
  const added: string[] = [];
  const shims: Record<string, unknown> = { FileReader: HeadlessFileReader, OffscreenCanvas: HeadlessCanvas, ImageData: HeadlessImageData };
  for (const [key, value] of Object.entries(shims)) {
    if (scope[key] === undefined) { scope[key] = value; added.push(key); }
  }
  return () => { for (const key of added) delete scope[key]; };
}
