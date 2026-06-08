/**
 * procedural-hdri.ts — bake a per-set equirectangular HDRI and wire it as real IBL (Phase M3).
 *
 * M3's remaining optional item was "load an HDRI *bitmap* per set" for image-based lighting in PBR
 * mode. Rather than ship licensed .hdr files, we GENERATE an equirectangular environment IMAGE
 * procedurally from each set's `EnvironmentHdriSpec` (a sky→horizon→ground vertical gradient plus an
 * optional sun disc) and build a real `@aura3d/rendering` `Texture` + `TextureBinding` from it. The
 * engine's forward pass already samples `environmentMapTexture` as a 2D equirect map for both diffuse
 * irradiance and specular reflection (`u_environmentMapTexture*` uniforms in ForwardPass), so this is
 * genuine IBL — not just a richer procedural ambient. The baked map composes ON TOP of the existing
 * `proceduralMap` ambient: the procedural map remains the floor, the sampled HDRI adds image-based
 * specular/diffuse detail and a directional sun highlight.
 *
 * The bitmap is generated in-memory (1024×512 RGBA8) so there is no asset to ship or fetch; it is
 * deterministic from the spec. A PNG encoder is included so a set's HDRI can optionally be written to
 * `public/hdri/<id>.png` for inspection/debug, but the render path uses the in-memory pixels directly.
 */

// I1 clean-room correctness: import the rendering primitives (Sampler/Texture/TextureBinding) from
// the engine's OWN rendering subpath — the same copy the A3DRenderer validates against — NOT the
// standalone `@aura3d/rendering` package. In a clean-room (tarball) install the standalone package is
// a SECOND copy, so a `TextureBinding` built from it is a different class than the renderer's and is
// rejected by `MaterialBinding.bind` (`value instanceof TextureBinding`). Going through the engine
// keeps the baked HDRI's binding the same class as the renderer's, so IBL binds across the install.
import { Sampler, Texture, TextureBinding } from "@aura3d/engine/rendering";
import type { EnvironmentHdriSpec, Vec3 } from "./episode-document";

export const HDRI_WIDTH = 1024;
export const HDRI_HEIGHT = 512;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Linear interpolate between two RGB triples. */
function mixRgb(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Convert a linear 0..1+ channel to an 8-bit sRGB-ish byte (gamma 2.2), clamped. */
function toByte(linear: number): number {
  const g = Math.pow(clamp01(linear), 1 / 2.2);
  return Math.round(clamp01(g) * 255);
}

/**
 * Bake the equirectangular RGBA8 pixel buffer for a set HDRI. Row 0 is the zenith (sky), the middle
 * row is the horizon, the bottom row is the nadir (ground bounce). The sun disc, if present, is drawn
 * into the sky hemisphere as a soft bright spot for a directional specular highlight.
 */
export function bakeEquirectHdriPixels(spec: EnvironmentHdriSpec): Uint8Array {
  const data = new Uint8Array(HDRI_WIDTH * HDRI_HEIGHT * 4);
  const sun = spec.sun;
  // Precompute the sun's world direction (unit) so each texel can dot against it.
  let sunDir: Vec3 | null = null;
  if (sun) {
    const ce = Math.cos(sun.elevation);
    sunDir = [ce * Math.sin(sun.azimuth), Math.sin(sun.elevation), ce * Math.cos(sun.azimuth)];
  }
  const cosSunRadius = sun ? Math.cos(sun.angularRadius) : 1;

  for (let y = 0; y < HDRI_HEIGHT; y++) {
    // v: 0 at top (zenith) → 1 at bottom (nadir). Equirect latitude = (0.5 - v) * π.
    const v = (y + 0.5) / HDRI_HEIGHT;
    const lat = (0.5 - v) * Math.PI; // +π/2 zenith, 0 horizon, -π/2 nadir.
    // Vertical gradient: sky→horizon over the top hemisphere, horizon→ground over the bottom.
    let base: Vec3;
    if (lat >= 0) {
      base = mixRgb(spec.horizonColor, spec.skyColor, clamp01(lat / (Math.PI / 2)));
    } else {
      base = mixRgb(spec.horizonColor, spec.groundColor, clamp01(-lat / (Math.PI / 2)));
    }
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    for (let x = 0; x < HDRI_WIDTH; x++) {
      // u: 0..1 around the sphere; longitude = (u - 0.5) * 2π.
      const u = (x + 0.5) / HDRI_WIDTH;
      const lon = (u - 0.5) * 2 * Math.PI;
      let r = base[0];
      let g = base[1];
      let b = base[2];
      if (sunDir && lat > -0.05) {
        // Texel direction on the unit sphere.
        const dx = cosLat * Math.sin(lon);
        const dy = sinLat;
        const dz = cosLat * Math.cos(lon);
        const dot = dx * sunDir[0] + dy * sunDir[1] + dz * sunDir[2];
        if (dot > cosSunRadius) {
          // Inside the disc: full sun. Add a soft glow falloff just outside via smoothstep.
          const k = sun!.intensity;
          r += sun!.color[0] * k;
          g += sun!.color[1] * k;
          b += sun!.color[2] * k;
        } else if (dot > cosSunRadius - 0.04) {
          const t = (dot - (cosSunRadius - 0.04)) / 0.04;
          const halo = t * t * 0.5 * sun!.intensity;
          r += sun!.color[0] * halo;
          g += sun!.color[1] * halo;
          b += sun!.color[2] * halo;
        }
      }
      const i = (y * HDRI_WIDTH + x) * 4;
      data[i] = toByte(r);
      data[i + 1] = toByte(g);
      data[i + 2] = toByte(b);
      data[i + 3] = 255;
    }
  }
  return data;
}

export interface BakedHdri {
  readonly texture: Texture;
  readonly binding: TextureBinding;
  readonly intensity: number;
  readonly specularIntensity: number;
  readonly pixels: Uint8Array;
}

/**
 * Bake a set's HDRI spec into a real engine IBL: an equirect `Texture` + a `TextureBinding`
 * (`u_environmentMapTexture`, equirect → repeat U / clamp V like the engine's parity preset). The
 * returned `intensity`/`specularIntensity` feed the engine's `environmentMapIntensity` /
 * `environmentMapSpecularIntensity`.
 */
export function bakeSetHdri(id: string, spec: EnvironmentHdriSpec): BakedHdri {
  const pixels = bakeEquirectHdriPixels(spec);
  const texture = new Texture({
    width: HDRI_WIDTH,
    height: HDRI_HEIGHT,
    colorSpace: "srgb",
    label: `animation-studio-hdri-${id}`,
    data: pixels
  });
  const binding = new TextureBinding({
    name: "u_environmentMapTexture",
    texture,
    // Equirect: wrap horizontally (longitude is periodic), clamp vertically (poles).
    sampler: new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "repeat", addressV: "clamp-to-edge" }),
    expectedColorSpace: "srgb",
    expectedDimension: "2d",
    required: true
  });
  return {
    texture,
    binding,
    intensity: spec.intensity ?? 1,
    specularIntensity: spec.specularIntensity ?? 0.4,
    pixels
  };
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder (debug only) — lets `public/hdri/<id>.png` be written for inspection. The
// render path does NOT depend on this; it samples the in-memory pixels directly.
// ---------------------------------------------------------------------------

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]!;
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function chunk(type: string, payload: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)]);
  const body = new Uint8Array(typeBytes.length + payload.length);
  body.set(typeBytes, 0);
  body.set(payload, typeBytes.length);
  const out = new Uint8Array(4 + body.length + 4);
  out.set(u32(payload.length), 0);
  out.set(body, 4);
  out.set(u32(crc32(body)), 4 + body.length);
  return out;
}

/** Encode an RGBA8 buffer to an (uncompressed-deflate) PNG. For debug export only. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  // Raw scanlines with a 0 (none) filter byte per row.
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const dst = y * (1 + width * 4);
    raw[dst] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), dst + 1);
  }
  // zlib stream: 0x78 0x01 header, stored (uncompressed) deflate blocks, adler32 trailer.
  const blocks: Uint8Array[] = [];
  const MAX = 0xffff;
  for (let off = 0; off < raw.length; off += MAX) {
    const len = Math.min(MAX, raw.length - off);
    const final = off + len >= raw.length ? 1 : 0;
    const header = new Uint8Array([final, len & 0xff, (len >>> 8) & 0xff, ~len & 0xff, (~len >>> 8) & 0xff]);
    blocks.push(header, raw.subarray(off, off + len));
  }
  let zlibLen = 2 + 4;
  for (const blk of blocks) zlibLen += blk.length;
  const zlib = new Uint8Array(zlibLen);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  let p = 2;
  for (const blk of blocks) {
    zlib.set(blk, p);
    p += blk.length;
  }
  zlib.set(u32(adler32(raw)), p);

  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // 10,11,12 = compression/filter/interlace = 0.

  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const idat = chunk("IDAT", zlib);
  const ihdrChunk = chunk("IHDR", ihdr);
  const iend = chunk("IEND", new Uint8Array(0));
  const out = new Uint8Array(sig.length + ihdrChunk.length + idat.length + iend.length);
  let q = 0;
  for (const part of [sig, ihdrChunk, idat, iend]) {
    out.set(part, q);
    q += part.length;
  }
  return out;
}
