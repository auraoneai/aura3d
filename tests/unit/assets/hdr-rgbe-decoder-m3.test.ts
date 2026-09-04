import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import {
  decodeRadianceHDR,
  describeRadianceHDR,
  HDRLoaderThreeCompat,
  isRadianceHDR
} from "../../../packages/assets/src/loaders/HDRLoader.js";

const FIXTURE = "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr";

describe("M3 HDRI loader/decoders-side RGBE decode", () => {
  test("recognizes Radiance magic and rejects non-HDR bytes", () => {
    const hdr = readFileSync(FIXTURE);
    assert.equal(isRadianceHDR(hdr), true);
    assert.equal(isRadianceHDR(new Uint8Array([1, 2, 3])), false);
    assert.equal(isRadianceHDR(new TextEncoder().encode("#?RADIANCE\n")), true);
    assert.equal(isRadianceHDR(new TextEncoder().encode("#?RGBE\n_____")), true);
    assert.throws(() => decodeRadianceHDR(new TextEncoder().encode("not an hdr file....................")), /magic/);
  });

  test("decodes the real 1K fixture to linear floats with overbright intact", () => {
    const hdr = readFileSync(FIXTURE);
    const image = decodeRadianceHDR(hdr);
    assert.equal(image.width, 1024);
    assert.equal(image.height, 512);
    assert.equal(image.data.length, 1024 * 512 * 3);
    const described = describeRadianceHDR(image);
    assert.equal(described.format, "32-bit_rle_rgbe");
    assert.ok(described.maxChannel > 1, `overbright must survive decode, saw max ${described.maxChannel}`);
    assert.ok(described.overbrightPixelCount > 0, "expected overbright pixels for HDR tone mapping");
    for (let i = 0; i < image.data.length; i += 9973) {
      assert.ok(Number.isFinite(image.data[i]), `non-finite sample at ${i}`);
      assert.ok((image.data[i] ?? -1) >= 0, `negative sample at ${i}`);
    }
  });

  test("compat loader folds decoded metadata into the migration diagnostic", () => {
    const hdr = readFileSync(FIXTURE);
    const loader = new HDRLoaderThreeCompat();
    const diagnostic = loader.load(FIXTURE);
    assert.ok(diagnostic.warnings.length > 0);
    const decoded = loader.loadBytes(FIXTURE, hdr);
    assert.equal(decoded.width, 1024);
    assert.equal(decoded.height, 512);
    assert.equal(decoded.pixelCount, 1024 * 512);
    assert.ok(decoded.maxChannel > 1);
  });

  test("rejects truncated and malformed inputs fail-closed", () => {
    const hdr = readFileSync(FIXTURE);
    assert.throws(() => decodeRadianceHDR(hdr.subarray(0, 200)), /truncated|resolution|header/);
    const badResolution = new TextEncoder().encode("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n+Y 4 +Y 4\n");
    assert.throws(() => decodeRadianceHDR(badResolution), /resolution/);
  });
});
