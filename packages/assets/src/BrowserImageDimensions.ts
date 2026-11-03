import { redactAssetUrl } from "./AssetLoader";
import { AssetPolicyError, AssetSizeError } from "./LoaderFetch";

/** The native decoder may use additional memory for frames, profiles and scratch space. */
export const MAX_BROWSER_IMAGE_PIXELS = 32 * 1024 * 1024;
export const MAX_BROWSER_IMAGE_BYTES = 64 * 1024 * 1024;

// Bound work on inputs made up of millions of tiny chunks or JPEG markers.
const MAX_INSPECTION_PARTS = 1_000_000;
type InspectedFormat = "PNG" | "JPEG" | "GIF" | "WebP";

export function assertBrowserImageDimensions(width: number, height: number, url: string): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new AssetPolicyError(`Invalid image dimensions for ${redactAssetUrl(url)}`);
  }
  // Division avoids trusting an overflowing product for hostile dimensions.
  if (width > MAX_BROWSER_IMAGE_PIXELS / height) {
    throw new AssetSizeError(`Image dimensions exceed maxPixels (${MAX_BROWSER_IMAGE_PIXELS}) for ${redactAssetUrl(url)}`);
  }
}

/**
 * Inspect recognized raster containers before giving their bytes to a native
 * decoder. This checks the declared canvas and frame dimensions, not decoded
 * memory, animation storage, compressed metadata, or decoder scratch space.
 *
 * AVIF requires interpreting AV1 items/tracks, grids and their associations;
 * an arbitrary `ispe` box alone is not a reliable bound. Uncommon JPEG coding
 * variants, SVG and other browser-specific formats also lack a reliable
 * preflight here. They return undefined rather than pretending a post-decode
 * check is a preflight.
 */
export function inspectBrowserImageDimensions(buffer: ArrayBuffer, url: string): InspectedFormat | undefined {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    inspectPng(bytes, view, url);
    return "PNG";
  }
  if (matches(bytes, 0, [0xff, 0xd8])) {
    return inspectJpeg(bytes, view, url) ? "JPEG" : undefined;
  }
  if (matches(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
      matches(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) {
    inspectGif(bytes, view, url);
    return "GIF";
  }
  if (matches(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && matches(bytes, 8, [0x57, 0x45, 0x42, 0x50])) {
    inspectWebp(bytes, view, url);
    return "WebP";
  }
  return undefined;
}

function matches(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  for (let index = 0; index < expected.length; index++) {
    if (bytes[offset + index] !== expected[index]) return false;
  }
  return true;
}

function invalid(format: InspectedFormat, url: string, reason: string): never {
  throw new AssetPolicyError(`Cannot inspect ${format} image dimensions for ${redactAssetUrl(url)}: ${reason}`);
}

function budget(format: InspectedFormat, url: string): () => void {
  let parts = 0;
  return () => {
    if (++parts > MAX_INSPECTION_PARTS) invalid(format, url, "image structure exceeds inspection limit");
  };
}

function inspectPng(bytes: Uint8Array, view: DataView, url: string): void {
  const step = budget("PNG", url);
  let offset = 8;
  let width = 0;
  let height = 0;
  let header = false;
  let ended = false;
  let sawCgbi = false;
  while (offset < bytes.length) {
    step();
    if (bytes.length - offset < 12) invalid("PNG", url, "truncated chunk");
    const size = view.getUint32(offset);
    if (size > bytes.length - offset - 12) invalid("PNG", url, "truncated chunk data");
    const data = offset + 8;
    const kind = view.getUint32(offset + 4);
    const ihdr = kind === 0x49484452; // IHDR
    const cgbi = kind === 0x43674249; // CgBI
    const frame = kind === 0x6663544c; // fcTL
    const end = kind === 0x49454e44; // IEND
    if (!header) {
      // iOS CgBI PNGs place this optional chunk immediately before IHDR.
      if (cgbi && !sawCgbi && size === 4) sawCgbi = true;
      else {
        if (!ihdr || size !== 13) invalid("PNG", url, "missing IHDR");
        width = view.getUint32(data);
        height = view.getUint32(data + 4);
        assertBrowserImageDimensions(width, height, url);
        header = true;
      }
    } else if (ihdr || cgbi) {
      invalid("PNG", url, "duplicate image header");
    } else if (frame) {
      // APNG frame-control dimensions must fit the logical canvas as well.
      if (size !== 26) invalid("PNG", url, "invalid animation frame");
      const frameWidth = view.getUint32(data + 4);
      const frameHeight = view.getUint32(data + 8);
      const x = view.getUint32(data + 12);
      const y = view.getUint32(data + 16);
      assertBrowserImageDimensions(frameWidth, frameHeight, url);
      if (x > width || y > height || frameWidth > width - x || frameHeight > height - y) {
        invalid("PNG", url, "animation frame exceeds canvas");
      }
    }
    if (end) {
      if (!header || size !== 0) invalid("PNG", url, "invalid IEND");
      ended = true;
      break;
    }
    offset += size + 12;
  }
  if (!header || !ended) invalid("PNG", url, "missing image header or end");
}

function inspectJpeg(bytes: Uint8Array, view: DataView, url: string): boolean {
  const step = budget("JPEG", url);
  let offset = 2;
  let inScan = false;
  let sawFrame = false;
  let sawScan = false;
  let frameWidth = 0;
  let unresolvedHeight = false;
  while (offset < bytes.length) {
    step();
    const wasInScan: boolean = inScan;
    if (inScan) {
      // Entropy data may contain stuffed FF00 and restart markers. Skip it
      // without interpreting coefficients, but inspect later SOF/DNL markers.
      const markerOffset = bytes.indexOf(0xff, offset);
      if (markerOffset < 0) invalid("JPEG", url, "truncated scan");
      offset = markerOffset + 1;
    } else {
      if (bytes[offset++] !== 0xff) invalid("JPEG", url, "invalid marker");
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) invalid("JPEG", url, "truncated marker");
    const marker = bytes[offset++];
    if (wasInScan && (marker === 0 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7))) {
      continue;
    }
    inScan = false;
    if (marker === 0xd9) {
      if (!sawFrame || !sawScan || unresolvedHeight) invalid("JPEG", url, "missing frame dimensions or scan");
      return true;
    }
    if (marker === 0xd8 || marker === 0) invalid("JPEG", url, "invalid marker");
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (bytes.length - offset < 2) invalid("JPEG", url, "truncated segment");
    const size = view.getUint16(offset);
    if (size < 2 || size > bytes.length - offset) invalid("JPEG", url, "invalid segment length");
    // JPEG extension markers can alter the coding process or add image
    // dimensions that this inspector does not understand.
    if (marker === 0xc8 || (marker >= 0xf0 && marker <= 0xfd && marker !== 0xf7)) return false;
    const isFrame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf) || marker === 0xf7;
    if (marker === 0xde) {
      // A hierarchical JPEG can declare a canvas larger than its individual
      // frame headers. A zero DHP height is not safely inspectable here.
      if (size < 8) invalid("JPEG", url, "invalid hierarchical dimensions");
      const height = view.getUint16(offset + 3);
      if (height === 0) return false;
      assertBrowserImageDimensions(view.getUint16(offset + 5), height, url);
    } else if (isFrame) {
      if (size < 8 || unresolvedHeight) invalid("JPEG", url, "invalid frame");
      const height = view.getUint16(offset + 3);
      frameWidth = view.getUint16(offset + 5);
      // Zero height is allowed only when a later DNL supplies the line count.
      if (height === 0) {
        assertBrowserImageDimensions(frameWidth, 1, url);
        unresolvedHeight = true;
      } else {
        assertBrowserImageDimensions(frameWidth, height, url);
      }
      // Baseline, extended sequential and progressive Huffman JPEG use the
      // FF00 byte-stuffing handled below. JPEG-LS and other coding processes
      // can use different entropy framing; don't certify them as inspected.
      if (marker !== 0xc0 && marker !== 0xc1 && marker !== 0xc2) return false;
      sawFrame = true;
    } else if (marker === 0xdc) {
      if (size !== 4 || !frameWidth) invalid("JPEG", url, "invalid DNL");
      assertBrowserImageDimensions(frameWidth, view.getUint16(offset + 2), url);
      unresolvedHeight = false;
      // DNL may be embedded within a scan, after which entropy data resumes.
      inScan = wasInScan;
    } else if (marker === 0xda) {
      if (!sawFrame || size < 6) invalid("JPEG", url, "invalid scan");
      sawScan = true;
      inScan = true;
    }
    offset += size;
  }
  invalid("JPEG", url, "missing image end");
}

function inspectGif(bytes: Uint8Array, view: DataView, url: string): void {
  const step = budget("GIF", url);
  if (bytes.length < 13) invalid("GIF", url, "truncated screen descriptor");
  assertBrowserImageDimensions(view.getUint16(6, true), view.getUint16(8, true), url);
  const colorTableSize = (packed: number): number => (packed & 0x80) ? 3 * 2 ** ((packed & 7) + 1) : 0;
  let offset = 13 + colorTableSize(bytes[10]);
  if (offset > bytes.length) invalid("GIF", url, "truncated color table");
  const skipBlocks = (): void => {
    for (;;) {
      step();
      if (offset >= bytes.length) invalid("GIF", url, "truncated data blocks");
      const size = bytes[offset++];
      if (size === 0) return;
      if (size > bytes.length - offset) invalid("GIF", url, "truncated data block");
      offset += size;
    }
  };
  while (offset < bytes.length) {
    step();
    const tag = bytes[offset++];
    if (tag === 0x3b) return;
    if (tag === 0x21) {
      if (offset >= bytes.length) invalid("GIF", url, "truncated extension");
      const label = bytes[offset++];
      // A plain-text extension has its own potentially rendered grid.
      if (label === 0x01) {
        if (bytes.length - offset < 13 || bytes[offset] !== 12) invalid("GIF", url, "invalid text grid");
        const x = view.getUint16(offset + 1, true);
        const y = view.getUint16(offset + 3, true);
        const width = view.getUint16(offset + 5, true);
        const height = view.getUint16(offset + 7, true);
        assertBrowserImageDimensions(width, height, url);
        assertBrowserImageDimensions(x + width, y + height, url);
      }
      // All extension payloads, including the fixed text header, use sub-blocks.
      skipBlocks();
      continue;
    }
    if (tag !== 0x2c || bytes.length - offset < 9) invalid("GIF", url, "invalid image descriptor");
    const x = view.getUint16(offset, true);
    const y = view.getUint16(offset + 2, true);
    const width = view.getUint16(offset + 4, true);
    const height = view.getUint16(offset + 6, true);
    assertBrowserImageDimensions(width, height, url);
    // Bound a tolerant decoder that expands the canvas to contain a frame.
    assertBrowserImageDimensions(x + width, y + height, url);
    offset += 9 + colorTableSize(bytes[offset + 8]);
    if (offset >= bytes.length) invalid("GIF", url, "truncated image data");
    offset++; // LZW minimum code size.
    skipBlocks();
  }
  invalid("GIF", url, "missing trailer");
}

function inspectWebp(bytes: Uint8Array, view: DataView, url: string): void {
  const step = budget("WebP", url);
  const end = view.getUint32(4, true) + 8;
  if (end < 12 || end > bytes.length) invalid("WebP", url, "invalid RIFF size");
  let canvasWidth = 0;
  let canvasHeight = 0;
  let hasImage = false;
  const read24 = (offset: number): number => bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;

  const scan = (start: number, limit: number, frameSize?: { width: number; height: number }): boolean => {
    let offset = start;
    let hasFrameImage = false;
    const checkCodedSize = (width: number, height: number): void => {
      assertBrowserImageDimensions(width, height, url);
      const expectedWidth = frameSize?.width ?? canvasWidth;
      const expectedHeight = frameSize?.height ?? canvasHeight;
      if (expectedWidth && (width !== expectedWidth || height !== expectedHeight)) {
        invalid("WebP", url, "coded image dimensions disagree with canvas or frame");
      }
    };
    while (offset < limit) {
      step();
      if (limit - offset < 8) invalid("WebP", url, "truncated chunk");
      const size = view.getUint32(offset + 4, true);
      const data = offset + 8;
      if (size > limit - data || size % 2 > limit - data - size) invalid("WebP", url, "truncated chunk data");
      const chunkEnd = data + size;
      const kind = view.getUint32(offset);
      if (kind === 0x56503858) { // VP8X
        if (frameSize || canvasWidth || hasImage || size !== 10) invalid("WebP", url, "invalid extended header");
        canvasWidth = read24(data + 4) + 1;
        canvasHeight = read24(data + 7) + 1;
        assertBrowserImageDimensions(canvasWidth, canvasHeight, url);
      } else if (kind === 0x56503820) { // VP8
        if (size < 10 || (bytes[data] & 1) !== 0 ||
            bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) {
          invalid("WebP", url, "invalid VP8 frame header");
        }
        const w = view.getUint16(data + 6, true);
        const h = view.getUint16(data + 8, true);
        // WebP requires the VP8 scaling bits to be zero.
        if ((w & 0xc000) || (h & 0xc000)) invalid("WebP", url, "unsupported VP8 scaling");
        checkCodedSize(w & 0x3fff, h & 0x3fff);
        hasFrameImage = true;
        hasImage = true;
      } else if (kind === 0x5650384c) { // VP8L
        if (size < 5 || bytes[data] !== 0x2f) invalid("WebP", url, "invalid VP8L frame header");
        const dimensions = view.getUint32(data + 1, true);
        if ((dimensions >>> 29) !== 0) invalid("WebP", url, "unsupported VP8L version");
        checkCodedSize((dimensions & 0x3fff) + 1, ((dimensions >>> 14) & 0x3fff) + 1);
        hasFrameImage = true;
        hasImage = true;
      } else if (kind === 0x414e4d46) { // ANMF
        if (frameSize || !canvasWidth || size < 16) invalid("WebP", url, "invalid animation frame");
        const x = read24(data) * 2;
        const y = read24(data + 3) * 2;
        const width = read24(data + 6) + 1;
        const height = read24(data + 9) + 1;
        assertBrowserImageDimensions(width, height, url);
        if (x > canvasWidth || y > canvasHeight || width > canvasWidth - x || height > canvasHeight - y) {
          invalid("WebP", url, "animation frame exceeds canvas");
        }
        if (!scan(data + 16, chunkEnd, { width, height })) invalid("WebP", url, "animation frame has no image");
      }
      offset = chunkEnd + size % 2;
    }
    return hasFrameImage;
  };
  scan(12, end);
  if (!hasImage) invalid("WebP", url, "missing image data");
}
