import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultProbeLoader } from "../../../packages/rendering/src/environment/EnvironmentCache.js";
import { readEmbeddedNeutralKtx2 } from "../../../packages/rendering/src/environment/neutralEmbeddedLoader.js";
import { NEUTRAL_SPECULAR_SHA256 } from "../../../packages/rendering/src/environment/neutralEmbedded.js";
import { readRgb9e5Cube } from "../../../packages/rendering/src/environment/Rgb9e5Cube.js";
import { buildNeutralFloorProbe } from "../../../packages/rendering/src/environment/probeBuild.js";

const file = readFileSync("public/aura-environments/neutral.specular.ktx2");
const manifest = JSON.parse(readFileSync("public/aura-environments/neutral.manifest.json", "utf8")) as { sha256: { specular: string } };

afterEach(() => vi.unstubAllGlobals());

describe("embedded neutral environment", () => {
  it("decodes to the exact baked specular bytes", async () => {
    const bytes = await readEmbeddedNeutralKtx2();
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(manifest.sha256.specular);
    expect(NEUTRAL_SPECULAR_SHA256).toBe(manifest.sha256.specular);
    expect(Buffer.compare(Buffer.from(bytes), file)).toBe(0);
  });

  it("yields the same cube levels as reading the baked file", async () => {
    const embedded = readRgb9e5Cube(await readEmbeddedNeutralKtx2());
    const baked = readRgb9e5Cube(new Uint8Array(file.buffer, file.byteOffset, file.byteLength));
    expect(embedded.faceSize).toBe(baked.faceSize);
    expect(embedded.mipCount).toBe(baked.mipCount);
    for (let m = 0; m < baked.mipCount; m += 1) for (let f = 0; f < 6; f += 1) expect(embedded.levels[m]![f]).toEqual(baked.levels[m]![f]);
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

  it("still fetches other presets from /aura-environments", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response("nope", { status: 404 })));
    vi.stubGlobal("fetch", fetchSpy);
    const loader = defaultProbeLoader(() => ({}) as never);
    await expect(loader({ preset: "studio", tier: "balanced" } as never)).rejects.toThrow(/ENV_FETCH_FAILED/);
    expect(fetchSpy).toHaveBeenCalledWith("/aura-environments/studio.manifest.json");
  });
});
