import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { read as readKtx } from "ktx-parse";
import { describe, expect, it } from "vitest";
import { encodeRadianceHdr, encodeRgb9e5CubeKtx2, optimizeHdriFile } from "../../../../packages/aura3d-cli/src/commands/assets/optimize.js";
import { optimizeFileVerb } from "../../../../packages/aura3d-cli/src/commands/assets/optimizeVerb.js";
import { runEnvironmentsBake } from "../../../../packages/aura3d-cli/src/commands/prd02/environmentsBake.js";
import { standardProbePrimaries } from "../../../../packages/aura3d-cli/src/commands/prd02/probeFormatOptions.js";
import { readRgb9e5Cube } from "../../../../packages/rendering/src/environment/Rgb9e5Cube.js";

const identifier = Uint8Array.of(0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a);
const image = { width: 2, height: 1, data: new Float32Array([1, .5, .25, 1, .5, .25]) };

function capture(cwd: string): { cwd: string; stdout(s: string): void; stderr(s: string): void; out: string[]; err: string[] } {
  return { cwd, out: [], err: [], stdout(s) { this.out.push(s); }, stderr(s) { this.err.push(s); } };
}

function legacySinglePixel(): Uint8Array {
  const bytes = new Uint8Array(116);
  const view = new DataView(bytes.buffer);
  bytes.set(identifier);
  view.setUint32(12, 142, true);
  view.setUint32(16, 4, true);
  view.setUint32(20, 1, true);
  view.setUint32(24, 1, true);
  view.setUint32(36, 6, true);
  view.setUint32(40, 1, true);
  view.setUint32(48, 68, true);
  view.setUint32(56, 68, true);
  view.setBigUint64(68, 92n, true);
  view.setBigUint64(76, 24n, true);
  view.setBigUint64(84, 24n, true);
  for (let face = 0; face < 6; face += 1) view.setUint32(92 + face * 4, 0x81010100, true);
  return bytes;
}

const lanes = {
  equirectToCubeFaces: () => Array.from({ length: 6 }, () => new Float32Array([1, .5, .25, 1])),
  packRgb9e5: () => 0x81010100,
  KTX2_MAGIC: identifier,
  VK_FORMAT_E5B9G9R9_UFLOAT_PACK32: 142
} as unknown as Parameters<typeof encodeRgb9e5CubeKtx2>[0];

describe("explicit standard RGB9E5 CLI output", () => {
  it("retains the exact historical default bytes and opts into standard BT.709 separately", () => {
    const legacy = encodeRgb9e5CubeKtx2(lanes, image, 1);
    expect(legacy.mipCount).toBe(1);
    expect(legacy.bytes).toEqual(legacySinglePixel());

    const standard = encodeRgb9e5CubeKtx2(lanes, image, 1, { standardKtx2Primaries: "bt709" });
    const parsed = readKtx(standard.bytes);
    expect(parsed.vkFormat).toBe(123);
    expect(parsed.dataFormatDescriptor[0]!.colorPrimaries).toBe(1);
    const decoded = readRgb9e5Cube(standard.bytes);
    expect(Array.from(decoded.levels[0]![0]!)).toEqual([1, .5, .25, 1]);
  });

  it("requires an explicit valid declaration and never claims unspecified input is BT.709", () => {
    expect(standardProbePrimaries([])).toBeUndefined();
    expect(standardProbePrimaries(["--standard-ktx2-primaries", "bt709"])).toBe("bt709");
    expect(() => standardProbePrimaries(["--standard-ktx2-primaries"])).toThrow(/requires bt709 or unspecified/);
    expect(() => standardProbePrimaries(["--standard-ktx2-primaries", "display-p3"])).toThrow(/requires bt709 or unspecified/);
    expect(() => standardProbePrimaries(["--standard-ktx2-primaries", "bt709", "--standard-ktx2-primaries", "unspecified"])).toThrow(/only once/);
    const unspecified = encodeRgb9e5CubeKtx2(lanes, image, 1, { standardKtx2Primaries: "unspecified" });
    expect(readKtx(unspecified.bytes).dataFormatDescriptor[0]!.colorPrimaries).toBe(0);
    expect(() => readRgb9e5Cube(unspecified.bytes)).toThrow(/ENV_KTX2_DESCRIPTOR/);
  });

  it("writes standard environment-bake output only on opt-in and records its color declaration", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aura3d-probe-cli-"));
    try {
      const hdr = join(dir, "source.hdr");
      writeFileSync(hdr, encodeRadianceHdr(image));
      const legacyIo = capture(dir);
      await runEnvironmentsBake(["--hdr", hdr, "--face-size", "1", "--samples", "1", "--out", dir, "--name", "legacy"], legacyIo);
      const legacy = readFileSync(join(dir, "legacy.specular.ktx2"));
      expect(legacy.readUInt32LE(12)).toBe(142);
      const legacyManifest = JSON.parse(readFileSync(join(dir, "legacy.manifest.json"), "utf8"));
      expect(legacyManifest.container).toBeUndefined();
      expect(legacyIo.err).toEqual([]);

      const standardIo = capture(dir);
      await runEnvironmentsBake(["--hdr", hdr, "--face-size", "1", "--samples", "1", "--out", dir, "--name", "std", "--standard-ktx2-primaries", "bt709"], standardIo);
      const standard = readFileSync(join(dir, "std.specular.ktx2"));
      const manifest = JSON.parse(readFileSync(join(dir, "std.manifest.json"), "utf8"));
      expect(readKtx(standard).vkFormat).toBe(123);
      expect(manifest).toMatchObject({ container: "standard-ktx2", colorPrimaries: "bt709", auraProbeReaderSupportsPrimaries: true });
      expect(readRgb9e5Cube(standard).faceSize).toBe(1);
      expect(standardIo.err).toEqual([]);

      const unknownIo = capture(dir);
      await runEnvironmentsBake(["--hdr", hdr, "--face-size", "1", "--samples", "1", "--out", dir, "--name", "unknown", "--standard-ktx2-primaries", "unspecified"], unknownIo);
      const unknown = readFileSync(join(dir, "unknown.specular.ktx2"));
      expect(readKtx(unknown).dataFormatDescriptor[0]!.colorPrimaries).toBe(0);
      expect(unknownIo.err.join(" ")).toMatch(/reader currently requires BT\.709.*No color conversion/);
      expect(JSON.parse(readFileSync(join(dir, "unknown.manifest.json"), "utf8"))).toMatchObject({ colorPrimaries: "unspecified", auraProbeReaderSupportsPrimaries: false });

      await expect(runEnvironmentsBake(["--hdr", hdr, "--out", dir, "--name", "invalid", "--standard-ktx2-primaries"], capture(dir))).rejects.toThrow(/requires bt709 or unspecified/);
      expect(existsSync(join(dir, "invalid.specular.ktx2"))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("validates optimize flags before writing and reports unspecified reader support in JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aura3d-probe-optimize-"));
    try {
      const hdr = join(dir, "source.hdr");
      writeFileSync(hdr, encodeRadianceHdr(image));
      const missingCube = capture(dir);
      expect(await optimizeFileVerb(["--file", hdr, "--out", "no-cube.hdr", "--hdri", "1k", "--standard-ktx2-primaries", "bt709"], missingCube)).toBe(2);
      expect(missingCube.err.join(" ")).toMatch(/requires --rgb9e5-cube/);
      expect(existsSync(join(dir, "no-cube.hdr"))).toBe(false);

      const malformed = capture(dir);
      expect(await optimizeFileVerb(["--file", hdr, "--out", "bad.hdr", "--hdri", "1k", "--rgb9e5-cube", "--standard-ktx2-primaries"], malformed)).toBe(2);
      expect(malformed.err.join(" ")).toMatch(/requires bt709 or unspecified/);
      expect(existsSync(join(dir, "bad.hdr"))).toBe(false);

      const noHdri = capture(dir);
      expect(await optimizeFileVerb(["--file", hdr, "--out", "no-hdri.hdr", "--standard-ktx2-primaries", "bt709"], noHdri)).toBe(2);
      expect(noHdri.err.join(" ")).toMatch(/needs --hdri and --rgb9e5-cube/);
      expect(existsSync(join(dir, "no-hdri.hdr"))).toBe(false);

      const selected = capture(dir);
      expect(await optimizeFileVerb(["--file", hdr, "--out", "selected.hdr", "--hdri", "1k", "--rgb9e5-cube", "--standard-ktx2-primaries", "unspecified", "--json"], selected)).toBe(0);
      const report = JSON.parse(selected.out.join("\n"));
      expect(report.cube).toMatchObject({ container: "standard-ktx2", colorPrimaries: "unspecified", auraProbeReaderSupportsPrimaries: false });
      expect(selected.err.join(" ")).toMatch(/reader currently requires BT\.709/);
      expect(readKtx(readFileSync(report.cube.output)).dataFormatDescriptor[0]!.colorPrimaries).toBe(0);

      const tooBright = join(dir, "bright.hdr");
      writeFileSync(tooBright, encodeRadianceHdr({ width: 2, height: 1, data: new Float32Array(6).fill(100_000) }));
      await expect(optimizeHdriFile({ input: tooBright, output: join(dir, "too-bright.hdr"), size: "1k", rgb9e5Cube: true, standardKtx2Primaries: "bt709" })).rejects.toThrow(/65408|65,408/);
      expect(existsSync(join(dir, "too-bright.hdr"))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
