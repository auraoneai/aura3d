// PRD-07 P1-T11 acceptance — VfxAtlas loads the manifest, pages by C-27 tier,
// resolves every AuraVfxBuiltinSequence, and falls back to PNG with
// VFX_ATLAS_PNG_FALLBACK when the KTX2 decoder is unavailable.

import { describe, expect, it } from "vitest";
import { Texture } from "../../../../packages/rendering/src/Texture";
import { VfxAtlas, type VfxAtlasManifest } from "../../../../packages/rendering/src/vfx/VfxAtlas";
import { AURA_VFX_BUILTIN_SEQUENCES } from "../../../../packages/engine/src/agent-api/vfx/atlas";

const SIZE = 2048;
const manifest: VfxAtlasManifest = {
  version: 1,
  pages: [
    { id: "aura-vfx-1k", uri: "aura-vfx-1k.ktx2", size: 1024, premultiplied: true, colorSpace: "srgb" },
    { id: "aura-vfx-2k", uri: "aura-vfx-2k.ktx2", size: 2048, premultiplied: true, colorSpace: "srgb" }
  ],
  sequences: Object.fromEntries(
    AURA_VFX_BUILTIN_SEQUENCES.map((name, i) => [
      name,
      { page: "aura-vfx-2k", rect: [4 + (i % 7) * 260, 4 + Math.floor(i / 7) * 260, 256, 256], columns: 1, rows: 1, frames: 1 }
    ])
  )
};

function fakeFetch(): typeof fetch {
  return (async (url: string | URL | Request) =>
    new Response(JSON.stringify(manifest), { status: 200 })) as typeof fetch;
}

function makeTexture(): Texture {
  return new Texture({ width: 4, height: 4, data: new Uint8Array(4 * 4 * 4).fill(255) });
}

class FakeAssetDecoderUnavailable extends Error {
  override name = "AssetDecoderUnavailable";
}

describe("P1-T11 VfxAtlas", () => {
  it("every AuraVfxBuiltinSequence resolves with a rect inside its page", async () => {
    const atlas = await VfxAtlas.load({
      basePath: "/aura-vfx/",
      tier: "high",
      fetchImpl: fakeFetch(),
      decodeTexture: async () => makeTexture()
    });
    const page = manifest.pages.find((p) => p.id === "aura-vfx-2k")!;
    for (const name of AURA_VFX_BUILTIN_SEQUENCES) {
      const seq = atlas.sequence(name);
      expect(seq, name).not.toBeNull();
      const [x, y, w, h] = seq!.rect;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(page.size);
      expect(y + h).toBeLessThanOrEqual(page.size);
      expect(w / seq!.columns).toBeGreaterThanOrEqual(2); // ≥1px gutter per cell implied by bake pitch
    }
    expect(atlas.sequence("not-a-sequence")).toBeNull();
  });

  it("low tier pages the 1k twin and scales rects", async () => {
    const requested: string[] = [];
    const atlas = await VfxAtlas.load({
      basePath: "/aura-vfx/",
      tier: "low",
      fetchImpl: fakeFetch(),
      decodeTexture: async (url) => { requested.push(url); return makeTexture(); }
    });
    expect(requested).toEqual(["/aura-vfx/aura-vfx-1k.ktx2"]);
    const seq = atlas.sequence("fireball")!;
    // Manifest rects are for the 2k page; the paged 1k twin halves them.
    // "fireball" is index 12 → [4+5*260, 4+260, 256, 256] = [1304,264,256,256] on 2k → halved.
    expect(seq.rect).toEqual([652, 132, 128, 128]);
  });

  it("falls back to PNG with VFX_ATLAS_PNG_FALLBACK when ktx2 decode fails", async () => {
    const requested: string[] = [];
    const notes: string[] = [];
    await VfxAtlas.load({
      basePath: "/aura-vfx/",
      tier: "high",
      fetchImpl: fakeFetch(),
      decodeTexture: async (url) => {
        requested.push(url);
        if (url.endsWith(".ktx2")) throw new FakeAssetDecoderUnavailable("ktx2 gone");
        return makeTexture();
      },
      note: (code, detail) => notes.push(`${code}:${detail}`)
    });
    expect(requested).toEqual(["/aura-vfx/aura-vfx-2k.ktx2", "/aura-vfx/aura-vfx-2k.png"]);
    expect(notes).toEqual(["VFX_ATLAS_PNG_FALLBACK:aura-vfx-2k.ktx2 → aura-vfx-2k.png"]);
  });

  it("missing manifest throws VFX_ATLAS_MANIFEST_MISSING", async () => {
    await expect(
      VfxAtlas.load({
        basePath: "/aura-vfx/",
        tier: "high",
        fetchImpl: (async () => new Response("nope", { status: 404 })) as typeof fetch,
        decodeTexture: async () => makeTexture()
      })
    ).rejects.toThrow("VFX_ATLAS_MANIFEST_MISSING");
  });
});
