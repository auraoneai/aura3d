// GU47 E-A (WP-1 item 4): `aura3d assets optimize --hdri 1k|2k [--rgb9e5-cube]` on small synthetic Radiance files.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { decodeHdrEquirect, readRgb9e5Cube, type HdrImage } from "../../../../packages/rendering/src/lanes/prd02.js";
import * as lanes from "../../../../packages/rendering/src/lanes/prd02.js";
import {
  HDRI_SIZE_WIDTH,
  downsampleHdrImage,
  encodeRadianceHdr,
  encodeRgb9e5CubeKtx2,
  hdriCubePath,
  isHdriSize,
  optimizeHdriFile
} from "../../../../packages/aura3d-cli/src/commands/assets/optimize.js";
import { optimizeFileVerb } from "../../../../packages/aura3d-cli/src/commands/assets/optimizeVerb.js";

const dir = mkdtempSync(join(tmpdir(), "aura3d-hdri-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A synthetic equirect: a sky gradient with a hot 2x2 "sun" (values well above 1, as real HDRIs have). */
function syntheticSky(width: number, height: number): HdrImage {
  const data = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      const v = 1 - y / height;
      data[i] = 0.2 + 0.6 * v;
      data[i + 1] = 0.3 + 0.5 * v;
      data[i + 2] = 0.5 + 0.9 * v;
    }
  }
  if (width >= 16 && height >= 8) for (const [x, y] of [[10, 4], [11, 4], [10, 5], [11, 5]] as const) data.set([40, 36, 30], (y * width + x) * 3);
  return { width, height, data };
}

function mean(image: HdrImage): [number, number, number] {
  const sum = [0, 0, 0];
  for (let i = 0; i < image.data.length; i += 3) for (let c = 0; c < 3; c += 1) sum[c]! += image.data[i + c]!;
  const n = image.width * image.height;
  return [sum[0]! / n, sum[1]! / n, sum[2]! / n];
}

describe("HDRI encode / downsample", () => {
  test("encodeRadianceHdr round-trips through decodeHdrEquirect (RLE and flat scanlines) within RGBE precision", () => {
    for (const [w, h] of [[64, 32], [4, 2]] as const) {
      const sky = syntheticSky(w, h);
      const bytes = encodeRadianceHdr(sky, ["synthetic"]);
      expect(new TextDecoder().decode(bytes.subarray(0, 10))).toBe("#?RADIANCE");
      const back = decodeHdrEquirect(bytes);
      expect([back.width, back.height]).toEqual([w, h]);
      for (let i = 0; i < sky.data.length; i += 1) {
        expect(Math.abs(back.data[i]! - sky.data[i]!), `texel ${i}`).toBeLessThanOrEqual(sky.data[i]! * 0.008 + 1e-6);
      }
    }
  });

  test("RLE compresses flat rows (runs) and stays within the literal-dump bound on noise", () => {
    const flat: HdrImage = { width: 256, height: 4, data: new Float32Array(256 * 4 * 3).fill(0.5) };
    expect(encodeRadianceHdr(flat).byteLength).toBeLessThan(256 * 4); // 4 bytes/texel raw
    const noise: HdrImage = { width: 256, height: 4, data: Float32Array.from({ length: 256 * 4 * 3 }, (_, i) => ((i * 7919) % 997) / 97) };
    expect(encodeRadianceHdr(noise).byteLength).toBeLessThanOrEqual(200 + 4 * (4 + 4 * (256 + 2)));
    expect(decodeHdrEquirect(encodeRadianceHdr(noise)).width).toBe(256);
  });

  test("downsampleHdrImage is an area average: integer ratios keep the mean radiance, never upsamples", () => {
    const sky = syntheticSky(64, 32);
    const half = downsampleHdrImage(sky, 32, 16);
    expect([half.width, half.height]).toEqual([32, 16]);
    // Pixel (5, 2) averages the 2x2 block holding the sun.
    expect(half.data[(2 * 32 + 5) * 3]).toBeCloseTo((40 * 4) / 4, 5);
    const m0 = mean(sky);
    for (const out of [half, downsampleHdrImage(sky, 16, 8), downsampleHdrImage(sky, 24, 12)]) {
      const m1 = mean(out);
      for (let c = 0; c < 3; c += 1) expect(m1[c]).toBeCloseTo(m0[c]!, 4);
    }
    expect(downsampleHdrImage(sky, 128, 64)).toBe(sky);
  });

  test("the RGB9E5 cube is a KTX2 that readRgb9e5Cube decodes: 6 faces, mip chain to 1x1, mean radiance kept", () => {
    const sky = syntheticSky(64, 32);
    const { bytes, mipCount } = encodeRgb9e5CubeKtx2(lanes, sky, 8);
    expect(mipCount).toBe(4);
    const cube = readRgb9e5Cube(bytes);
    expect(cube.faceSize).toBe(8);
    expect(cube.mipCount).toBe(4);
    expect(cube.levels.map((faces) => faces.length)).toEqual([6, 6, 6, 6]);
    expect(cube.levels[3]![0]!.length).toBe(4);
    // Box mips average their parent: the top mip of each face equals that face's level-0 mean (RGB9E5 precision).
    const face0 = cube.levels[0]![2]!;
    let r = 0;
    for (let t = 0; t < 64; t += 1) r += face0[t * 4]!;
    expect(cube.levels[3]![2]![0]).toBeCloseTo(r / 64, 1);
  });
});

describe("optimizeHdriFile and the CLI verb", () => {
  const source = join(dir, "sky_2k.hdr");
  writeFileSync(source, encodeRadianceHdr(syntheticSky(64, 32)));

  test("sizes: 1k = 1024 and 2k = 2048 wide", () => {
    expect(HDRI_SIZE_WIDTH).toEqual({ "1k": 1024, "2k": 2048 });
    expect(isHdriSize("1k") && isHdriSize("2k") && !isHdriSize("4k")).toBe(true);
    expect(hdriCubePath("/a/sky_1k.hdr")).toBe("/a/sky_1k.rgb9e5.ktx2");
  });

  test("writes a downsized .hdr and the optional cube", async () => {
    const result = await optimizeHdriFile({ input: source, output: join(dir, "out", "sky_small.hdr"), size: "1k", width: 32, rgb9e5Cube: true });
    expect(result).toMatchObject({ widthIn: 64, heightIn: 32, width: 32, height: 16, resized: true });
    const decoded = decodeHdrEquirect(readFileSync(result.output));
    expect([decoded.width, decoded.height]).toEqual([32, 16]);
    expect(result.bytesOut).toBe(readFileSync(result.output).byteLength);
    expect(result.cube).toMatchObject({ output: join(dir, "out", "sky_small.rgb9e5.ktx2"), faceSize: 4, mipCount: 3 });
    expect(readRgb9e5Cube(readFileSync(result.cube!.output)).faceSize).toBe(4);
  });

  test("a source below the target is re-encoded, not upsampled; input and output must differ", async () => {
    const result = await optimizeHdriFile({ input: source, output: join(dir, "sky_1k.hdr"), size: "1k" });
    expect(result).toMatchObject({ width: 64, height: 32, resized: false });
    await expect(optimizeHdriFile({ input: source, output: source, size: "1k" })).rejects.toThrow(/--out must differ/);
  });

  test("verb: --hdri 1k|2k [--rgb9e5-cube] --json, usage errors exit 2", async () => {
    const out: string[] = [];
    const err: string[] = [];
    const io = { cwd: dir, stdout: (line: string) => out.push(line), stderr: (line: string) => err.push(line) };
    expect(await optimizeFileVerb(["--file", "sky_2k.hdr", "--out", "cli/sky_2k_out.hdr", "--hdri", "2k", "--rgb9e5-cube", "--json"], io)).toBe(0);
    const json = JSON.parse(out.join("\n")) as { width: number; cube?: { faceSize: number } };
    expect(json.width).toBe(64);
    expect(json.cube?.faceSize).toBe(8);
    expect(await optimizeFileVerb(["--file", "sky_2k.hdr", "--out", "x.hdr", "--hdri", "4k"], io)).toBe(2);
    expect(await optimizeFileVerb(["--file", "sky_2k.hdr", "--out", "x.hdr", "--hdri"], io)).toBe(2);
    expect(await optimizeFileVerb(["--file", "sky_2k.hdr", "--out", "x.glb", "--rgb9e5-cube"], io)).toBe(2);
    expect(err.join("\n")).toMatch(/Use 1k or 2k/);
    expect(err.join("\n")).toMatch(/--rgb9e5-cube needs --hdri/);
  });
});
