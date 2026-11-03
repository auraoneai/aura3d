import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultProbeLoader } from "../../../packages/rendering/src/environment/EnvironmentCache.js";
import { readEmbeddedNeutralKtx2 } from "../../../packages/rendering/src/environment/neutralEmbeddedLoader.js";
import {
  NEUTRAL_SPECULAR_MANTISSA_BITS_DROPPED,
  NEUTRAL_SPECULAR_SHA256,
  NEUTRAL_SPECULAR_SOURCE_SHA256
} from "../../../packages/rendering/src/environment/neutralEmbedded.js";
import { quantizeCube } from "../../../tools/environments/embed-neutral.mjs";
import { readRgb9e5Cube } from "../../../packages/rendering/src/environment/Rgb9e5Cube.js";
import { buildNeutralFloorProbe } from "../../../packages/rendering/src/environment/probeBuild.js";
import { createRoomEnvironmentScene, sampleRoomEnvironment } from "../../../packages/rendering/src/environment/RoomEnvironmentScene.js";
import { KTX2_MAGIC, VK_FORMAT_E5B9G9R9_UFLOAT_PACK32 } from "../../../packages/rendering/src/environment/Rgb9e5Cube.js";

const file = readFileSync("public/aura-environments/neutral.specular.ktx2");
const manifest = JSON.parse(readFileSync("public/aura-environments/neutral.manifest.json", "utf8")) as { sha256: { specular: string } };

afterEach(() => vi.unstubAllGlobals());

const embeddedBytesMatchQuantizedSource = (bytes: Uint8Array): boolean => Buffer.compare(Buffer.from(bytes), quantizeCube(file)) === 0;

const bakedCube = () => readRgb9e5Cube(new Uint8Array(file.buffer, file.byteOffset, file.byteLength));

describe("embedded neutral environment", () => {
  it("is the baked cube with the documented mantissa rounding, same container layout", async () => {
    const bytes = await readEmbeddedNeutralKtx2();
    expect(bytes.byteLength).toBe(file.byteLength);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(NEUTRAL_SPECULAR_SHA256);
    expect(NEUTRAL_SPECULAR_SOURCE_SHA256).toBe(manifest.sha256.specular);
    expect(createHash("sha256").update(file).digest("hex")).toBe(manifest.sha256.specular);
    const levelCount = new DataView(file.buffer, file.byteOffset).getUint32(40, true);
    const firstLevelOffset = Number(new DataView(file.buffer, file.byteOffset).getBigUint64(68 + 0, true));
    expect(levelCount).toBe(5);
    // header, descriptor and level index are untouched; only texel words change
    expect(Buffer.compare(Buffer.from(bytes.subarray(0, Math.min(firstLevelOffset, 512))), file.subarray(0, Math.min(firstLevelOffset, 512)))).toBe(0);
    expect(embeddedBytesMatchQuantizedSource(bytes)).toBe(true);
  });

  it("stays within the stated tolerance of the baked file at every texel", { timeout: 60_000 }, async () => {
    const embedded = readRgb9e5Cube(await readEmbeddedNeutralKtx2());
    const baked = bakedCube();
    expect(embedded.faceSize).toBe(baked.faceSize);
    expect(embedded.mipCount).toBe(baked.mipCount);
    let sumRel = 0, count = 0, worst = 0;
    for (let m = 0; m < baked.mipCount; m += 1) {
      const bits = NEUTRAL_SPECULAR_MANTISSA_BITS_DROPPED[Math.min(m, NEUTRAL_SPECULAR_MANTISSA_BITS_DROPPED.length - 1)]!;
      // worst case: half a quantization step against the smallest normalised max-channel mantissa (256 of 511)
      const bound = (2 ** (bits - 1) + 1) / 256;
      for (let f = 0; f < 6; f += 1) {
        const a = embedded.levels[m]![f]!, b = baked.levels[m]![f]!;
        for (let t = 0; t < a.length; t += 4) {
          const peak = Math.max(b[t]!, b[t + 1]!, b[t + 2]!);
          if (peak <= 0) continue;
          for (let c = 0; c < 3; c += 1) {
            const rel = Math.abs(a[t + c]! - b[t + c]!) / peak;
            worst = Math.max(worst, rel / bound);
          }
          sumRel += Math.abs(a[t]! - b[t]!) / peak; count += 1;
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
    // the bake itself is about 1.7% neighbour noise; the average rounding error must stay below that
    expect(sumRel / count).toBeLessThan(0.015);
  });

  it("loads the neutral preset without any network request", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("fetch must not be called")));
    vi.stubGlobal("fetch", fetchSpy);
    const loader = defaultProbeLoader(() => ({ fromEquirect: () => { throw new Error("unused"); }, fromScene: () => { throw new Error("unused"); } }) as never);
    const probe = await loader({ preset: "neutral", tier: "balanced" } as never);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(probe.mipCount).toBe(5);
    expect(probe.faceSize).toBe(256);
    expect(Array.from(probe.sh9!.slice(0, 3))).toEqual(Array.from(buildNeutralFloorProbe(128).sh9!.slice(0, 3)));
  });

  it("reports how to provide an unavailable optional preset", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response("nope", { status: 404 })));
    vi.stubGlobal("fetch", fetchSpy);
    const loader = defaultProbeLoader(() => ({}) as never);
    await expect(loader({ preset: "studio", tier: "balanced" } as never)).rejects.toThrow(/ENV_PRESET_UNAVAILABLE:studio:.*\/aura-environments.*ENV_FETCH_FAILED/);
    expect(fetchSpy).toHaveBeenCalledWith("/aura-environments/studio.manifest.json");
  });

  it("loads an admitted optional preset and its independent SH data", async () => {
    const manifest = { name: "fixture", faceSize: 128, mipCount: 1, specular: "fixture.ktx2", sh9: "fixture.sh9" };
    // Independently authored, uncompressed 128-square black cube with one mip.
    const cube = new Uint8Array(92 + 6 * 128 * 128 * 4);
    cube.set(KTX2_MAGIC);
    const header = new DataView(cube.buffer);
    header.setUint32(12, VK_FORMAT_E5B9G9R9_UFLOAT_PACK32, true);
    header.setUint32(16, 4, true);
    header.setUint32(20, 128, true);
    header.setUint32(24, 128, true);
    header.setUint32(36, 6, true);
    header.setUint32(40, 1, true);
    header.setBigUint64(68, 92n, true);
    header.setBigUint64(76, BigInt(cube.byteLength - 92), true);
    const sh = new Uint8Array(27 * 4);
    new DataView(sh.buffer).setFloat32(0, 0.75, true);
    const fetchSpy = vi.fn((input: string) => {
      if (input.endsWith("fixture.manifest.json")) return Promise.resolve(new Response(JSON.stringify(manifest)));
      if (input.endsWith("fixture.ktx2")) return Promise.resolve(new Response(cube));
      if (input.endsWith("fixture.sh9")) return Promise.resolve(new Response(sh));
      return Promise.resolve(new Response("missing", { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchSpy);
    const probe = await defaultProbeLoader(() => ({}) as never)({ preset: "fixture", tier: "high" });
    expect(probe.faceSize).toBe(128);
    expect(probe.mipCount).toBe(1);
    expect(probe.sh9[0]).toBe(0.75);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    probe.dispose();
  });

  it("rejects unsafe preset names and malformed manifests before loading assets", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ name: "fixture", faceSize: 128, mipCount: 1, specular: "../outside", sh9: "fixture.sh9" }))));
    vi.stubGlobal("fetch", fetchSpy);
    const loader = defaultProbeLoader(() => ({}) as never);
    await expect(loader({ preset: "../outside", tier: "high" })).rejects.toThrow(/ENV_PRESET_INVALID/);
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(loader({ preset: "fixture", tier: "high" })).rejects.toThrow(/ENV_PRESET_INVALID:fixture/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("explains how to fix a preset whose manifest exists but an asset is missing", async () => {
    const manifest = { name: "fixture", faceSize: 128, mipCount: 1, specular: "fixture.ktx2", sh9: "fixture.sh9" };
    vi.stubGlobal("fetch", vi.fn((input: string) => Promise.resolve(
      input.endsWith(".manifest.json") ? new Response(JSON.stringify(manifest)) : new Response("missing", { status: 404 })
    )));
    await expect(defaultProbeLoader(() => ({}) as never)({ preset: "fixture", tier: "high" }))
      .rejects.toThrow(/ENV_PRESET_UNAVAILABLE:fixture: install both assets.*ENV_FETCH_FAILED/);
  });

  it("samples the independently designed room from panel and diffuse surfaces", () => {
    const room = createRoomEnvironmentScene();
    expect(room.panels).toHaveLength(5);
    expect(sampleRoomEnvironment([0, 1, 0])).toEqual([64, 64, 64]);
    const floor = sampleRoomEnvironment([0, -1, 0]);
    // From the origin the floor is y=-9, source is y=7: r=16, cos(theta)=1.
    const expected = 0.8 / Math.PI * 240 * (1 - 16 / 40) ** 2 / 16 ** 2;
    expect(floor[0]).toBeCloseTo(expected, 12);
    expect(floor[1]).toBeCloseTo(expected, 12);
    expect(sampleRoomEnvironment([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
