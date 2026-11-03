/** Metadata supplied by the asset admission process for a font. */
export interface FontAssetMetadata {
  readonly family: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly source?: string;
}

export interface FontAsset {
  readonly data: ArrayBuffer | Uint8Array;
  readonly metadata: FontAssetMetadata;
}

/** The bytes have been decoded and registered with the browser's font set. */
export interface LoadedFont {
  readonly family: string;
  readonly metadata: FontAssetMetadata;
  readonly disposed: boolean;
  dispose(): void;
}

interface FontFaceLike { load(): Promise<FontFaceLike> }
interface FontSetLike { add(face: FontFaceLike): unknown; delete(face: FontFaceLike): boolean }

/** An injectable platform also permits deterministic, browser-free source tests. */
export interface FontLoaderPlatform {
  createFace(family: string, bytes: ArrayBuffer): FontFaceLike;
  readonly fonts: FontSetLike;
}

export interface FontLoadOptions {
  /** Upper bound before the platform decoder is invoked. Default 16 MiB. */
  readonly maxBytes?: number;
  readonly platform?: FontLoaderPlatform;
}

const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
let nextFamilyId = 0;

/**
 * Register admitted OpenType/TrueType/WOFF bytes. Font decoding is performed by
 * the platform, while input size, format and provenance metadata are checked
 * before invoking it. Call dispose after the last user releases the font.
 */
export async function loadFont(asset: FontAsset, options: FontLoadOptions = {}): Promise<LoadedFont> {
  const limit = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > DEFAULT_MAX_BYTES) {
    throw new RangeError("Aura3D font maxBytes must be a positive integer no greater than 16 MiB.");
  }
  const metadata = asset?.metadata;
  if (!metadata || !metadata.family?.trim() || !metadata.license?.trim() || !metadata.licenseUrl?.trim()) {
    throw new Error("Aura3D fonts require admitted family, license and licenseUrl metadata.");
  }
  let url: URL;
  try { url = new URL(metadata.licenseUrl); } catch { throw new Error("Aura3D font licenseUrl must be an absolute HTTP(S) URL."); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Aura3D font licenseUrl must be an absolute HTTP(S) URL.");
  if (!(asset.data instanceof Uint8Array) && !(asset.data instanceof ArrayBuffer)) throw new Error("Aura3D font data must be bytes.");
  const input = asset.data instanceof Uint8Array ? asset.data : new Uint8Array(asset.data);
  if (input.byteLength < 12 || input.byteLength > limit) throw new RangeError("Aura3D font byte length is outside the permitted range.");
  const signature = String.fromCharCode(...input.subarray(0, 4));
  if (signature !== "OTTO" && signature !== "wOFF" && signature !== "wOF2" &&
      !(input[0] === 0 && input[1] === 1 && input[2] === 0 && input[3] === 0) && signature !== "true") {
    throw new Error("Aura3D font format must be OpenType, TrueType, WOFF or WOFF2.");
  }
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (signature === "wOFF" || signature === "wOF2") {
    const minimum = signature === "wOFF" ? 44 : 48;
    if (input.length < minimum || view.getUint32(8) !== input.length || view.getUint32(16) > limit || view.getUint32(16) < 12) {
      throw new RangeError("Aura3D compressed font declares an invalid or oversized decoded length.");
    }
  } else {
    const tables = view.getUint16(4);
    if (tables < 1 || tables > 4096 || 12 + tables * 16 > input.length) throw new Error("Aura3D font has an invalid table directory.");
    let total = 0;
    for (let i = 0; i < tables; i += 1) {
      const offset = view.getUint32(12 + i * 16 + 8);
      const length = view.getUint32(12 + i * 16 + 12);
      total += length;
      if (offset > input.length || length > input.length - offset || total > limit) throw new RangeError("Aura3D font table exceeds bounded input.");
    }
  }
  const platform = options.platform ?? browserFontPlatform();
  // Unique internal names avoid collisions between two admitted assets with
  // the same display family and do not interpolate untrusted CSS strings.
  const family = `AuraFont${++nextFamilyId}`;
  const bytes = new Uint8Array(input).buffer;
  const face = platform.createFace(family, bytes);
  await face.load();
  platform.fonts.add(face);
  let disposed = false;
  return {
    family,
    metadata: { ...metadata },
    get disposed() { return disposed; },
    dispose() {
      if (disposed) return;
      platform.fonts.delete(face);
      disposed = true;
    }
  };
}

function browserFontPlatform(): FontLoaderPlatform {
  const scope = globalThis as typeof globalThis & { fonts?: FontFaceSet };
  const fonts = typeof document !== "undefined" ? document.fonts : scope.fonts;
  if (typeof FontFace === "undefined" || !fonts) {
    throw new Error("Aura3D font loading requires FontFace and a document or worker font set.");
  }
  // Some TypeScript DOM lib versions omit the mutable FontFaceSet methods.
  const registry = fonts as unknown as { add(face: FontFace): unknown; delete(face: FontFace): boolean };
  if (typeof registry.add !== "function" || typeof registry.delete !== "function") throw new Error("Aura3D requires a mutable font set.");
  return {
    createFace: (family, bytes) => new FontFace(family, bytes),
    fonts: {
      add: (face) => registry.add(face as FontFace),
      delete: (face) => registry.delete(face as FontFace)
    }
  };
}
