/**
 * @aura3d/cli 5.6.0 A6 — G6 texture sanity loads sharp like the glTF toolkit (project, then the CLI's own install),
 * so `assets admit` measures textures in a project that is not the Aura3D repo (no tools/asset-optimize).
 */
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { measureTextureSanity } from "../../../../packages/aura3d-cli/src/admission/textureStats";

const sharp = createRequire(import.meta.url)("sharp") as (input: Buffer | { create: { width: number; height: number; channels: 3; background: { r: number; g: number; b: number } } }) => { png(): { toBuffer(): Promise<Buffer> } };

describe("G6 sharp resolution", () => {
  it("decodes an embedded PNG from a project directory without tools/asset-optimize", async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 128, g: 128, b: 128 } } }).png().toBuffer();
    const json = {
      asset: { version: "2.0" },
      buffers: [{ byteLength: png.length }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: png.length }],
      images: [{ bufferView: 0, mimeType: "image/png" }],
      textures: [{ source: 0 }],
      materials: [{ name: "grey", pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }]
    };
    const projectDir = mkdtempSync(join(tmpdir(), "a3d-g6-"));
    const report = await measureTextureSanity(json as never, png, projectDir, projectDir);
    expect(report.available).toBe(true);
    expect(report.textures).toHaveLength(1);
    expect(report.textures[0]!.slot).toBe("baseColor");
  });
});
