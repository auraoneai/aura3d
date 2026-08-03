import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { analyzeForegroundPng } from "../../browser/showcase-visual-quality";
// @ts-expect-error - untyped .mjs verifier module
import { readPngForegroundMetrics } from "../../../tools/showcase-library/png-foreground.mjs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/*
 * `analyzeForegroundPng` (producer, tests/browser) and `readPngForegroundMetrics` (verifier, tools/)
 * measure the same PNG independently, and the showcase gates compare their outputs for exact
 * equality. Two copies of a pixel algorithm silently drift, and when they drift the gate either
 * blocks a good frame or admits a broken one. These tests pin them together.
 */

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** Encodes 8-bit RGBA scanlines as a filter-0 PNG, matching what both decoders expect. */
function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/**
 * A vertical gradient "sky" with a solid subject block near the lower centre.
 *
 * The gradient is the whole point: a single four-corner background average cannot describe it, so
 * rows far from the sampled corners get scored against the wrong background and sky is admitted as
 * subject. Per-row background sampling tracks the gradient.
 */
function gradientSkyWithSubject(width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const t = y / Math.max(1, height - 1);
    const skyR = Math.round(28 + t * 150);
    const skyG = Math.round(46 + t * 120);
    const skyB = Math.round(96 + t * 60);
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const inSubject = x > width * 0.35 && x < width * 0.65 && y > height * 0.55 && y < height * 0.85;
      rgba[index] = inSubject ? 214 : skyR;
      rgba[index + 1] = inSubject ? 96 : skyG;
      rgba[index + 2] = inSubject ? 32 : skyB;
      rgba[index + 3] = 255;
    }
  }
  return rgba;
}

function withTempPng(buffer: Buffer, run: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "aura3d-png-parity-"));
  try {
    const path = join(dir, "frame.png");
    writeFileSync(path, buffer);
    run(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("png foreground producer/verifier parity", () => {
  it("reports identical metrics for a gradient sky with a subject", () => {
    const width = 320;
    const height = 200;
    const buffer = encodePng(width, height, gradientSkyWithSubject(width, height));

    withTempPng(buffer, (path) => {
      const producer = analyzeForegroundPng(buffer);
      const verifier = readPngForegroundMetrics(path);

      expect(producer.nonBlankPixels).toBe(verifier.nonBlankPixels);
      expect(producer.colorBuckets).toBe(verifier.colorBuckets);
      expect(producer.clipped).toBe(verifier.clipped);
      expect(producer.nonBackgroundRatio).toBe(verifier.nonBackgroundRatio);
      expect(producer.readabilityScore).toBe(verifier.readabilityScore);
      expect(producer.foregroundBounds).toEqual(verifier.foregroundBounds);
    });
  });

  it("isolates the subject instead of counting the gradient sky as foreground", () => {
    const width = 320;
    const height = 200;
    const buffer = encodePng(width, height, gradientSkyWithSubject(width, height));
    const producer = analyzeForegroundPng(buffer);

    // The subject block covers 30% x 30% of the frame; a background-blind measurement would
    // report a foreground spanning most of the image instead.
    expect(producer.nonBackgroundRatio).toBeLessThan(0.2);
    expect(producer.foregroundBounds?.height).toBeLessThan(height * 0.5);
    expect(producer.nonBlankPixels).toBeGreaterThan(0);
  });

  it("agrees on a flat background with an off-centre subject", () => {
    const width = 200;
    const height = 160;
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const inSubject = x > 20 && x < 70 && y > 90 && y < 140;
        rgba[index] = inSubject ? 240 : 18;
        rgba[index + 1] = inSubject ? 240 : 18;
        rgba[index + 2] = inSubject ? 240 : 22;
        rgba[index + 3] = 255;
      }
    }
    const buffer = encodePng(width, height, rgba);

    withTempPng(buffer, (path) => {
      const producer = analyzeForegroundPng(buffer);
      const verifier = readPngForegroundMetrics(path);
      expect(producer.readabilityScore).toBe(verifier.readabilityScore);
      expect(producer.foregroundBounds).toEqual(verifier.foregroundBounds);
    });
  });

  it("agrees when an analysis crop excludes a HUD strip", () => {
    const width = 240;
    const height = 180;
    const rgba = gradientSkyWithSubject(width, height);
    // Paint an opaque HUD band across the top; the crop should exclude it from both measurements.
    for (let y = 0; y < 24; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        rgba[index] = 255;
        rgba[index + 1] = 255;
        rgba[index + 2] = 0;
        rgba[index + 3] = 255;
      }
    }
    const buffer = encodePng(width, height, rgba);
    const crop = { x: 0, y: 24, width, height: height - 24 };

    withTempPng(buffer, (path) => {
      const producer = analyzeForegroundPng(buffer, crop);
      const verifier = readPngForegroundMetrics(path, crop);
      expect(producer.crop).toEqual(verifier.crop);
      expect(producer.nonBlankPixels).toBe(verifier.nonBlankPixels);
      expect(producer.readabilityScore).toBe(verifier.readabilityScore);
    });
  });
});
