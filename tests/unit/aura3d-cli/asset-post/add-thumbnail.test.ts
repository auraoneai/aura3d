import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addAssetAsync } from "../../../../packages/aura3d-cli/src/index.js";
import { loadGltfToolkit } from "../../../../packages/aura3d-cli/src/commands/assets/gltfToolkit.js";
import { cleanupTmp, tmp, writeFixture } from "./fixtures.js";

afterEach(cleanupTmp);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const licence = { license: "CC0-1.0", author: "test", sourceUrl: "https://example.com/x" } as const;

function project(): string {
  const dir = tmp("aura3d-add-thumb-");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "add-thumb-test", private: true, type: "module" }));
  return dir;
}

function manifest(dir: string) {
  return JSON.parse(readFileSync(join(dir, "aura.assets.json"), "utf8"));
}

describe("assets add writes a real thumbnail (no placeholder card for drawable assets)", () => {
  it("a GLB model gets <id>.thumb.png (CPU base-colour preview) and no .thumb.svg", async () => {
    const dir = project();
    const source = await writeFixture(dir, "car-source.glb", { texture: true });
    const result = await addAssetAsync({ projectDir: dir, file: source, name: "car", type: "model", ...licence });
    expect(result.ok).toBe(true);
    const m = manifest(dir);
    const entry = m.assets.find((a: { id: string }) => a.id === "car");
    expect(entry.thumbnailUrl).toMatch(/car\.thumb\.png$/);
    const png = readFileSync(join(dir, m.outputDir, "car.thumb.png"));
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(existsSync(join(dir, m.outputDir, "car.thumb.svg"))).toBe(false);
    expect(result.messages.some((line) => /CPU base-colour preview/.test(line))).toBe(true);
    expect(result.manifest.assets.find((a) => a.id === "car")?.thumbnailUrl).toBe(entry.thumbnailUrl);
  });

  it("a PNG texture gets a downscaled PNG thumbnail", async () => {
    const dir = project();
    const { sharp } = loadGltfToolkit(dir);
    const texture = join(dir, "grass.png");
    await sharp({ create: { width: 512, height: 256, channels: 4, background: { r: 40, g: 160, b: 60, alpha: 1 } } }).png().toFile(texture);
    const result = await addAssetAsync({ projectDir: dir, file: texture, name: "grass", type: "texture", ...licence });
    expect(result.ok).toBe(true);
    const m = manifest(dir);
    const entry = m.assets.find((a: { id: string }) => a.id === "grass");
    expect(entry.thumbnailUrl).toMatch(/grass\.thumb\.png$/);
    const meta = await sharp(join(dir, m.outputDir, "grass.thumb.png")).metadata();
    expect([meta.width, meta.height]).toEqual([256, 256]);
    expect(existsSync(join(dir, m.outputDir, "grass.thumb.svg"))).toBe(false);
  });
});
