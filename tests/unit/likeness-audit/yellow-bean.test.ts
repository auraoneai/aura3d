import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function baseColourImage(glb: Buffer): Buffer {
  const jsonLen = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString("utf8"));
  const binStart = 20 + jsonLen + 8;
  const t = json.materials[0].pbrMetallicRoughness.baseColorTexture.index as number;
  const image = json.images[json.textures[t].source] as { bufferView: number };
  const view = json.bufferViews[image.bufferView] as { byteOffset?: number; byteLength: number };
  const start = binStart + (view.byteOffset ?? 0);
  return glb.subarray(start, start + view.byteLength);
}

describe("bean brawl yellow bean", () => {
  const dir = "apps/showcase-bean-brawl-race/public/aura-assets";

  it("the original face (black eyes, red cheeks, red leg patch) is gone and manifests match", async () => {
    const files = readdirSync(path.join(ROOT, dir)).filter((f) => /^yellowBean\.[0-9a-f]{8}\.glb$/.test(f));
    expect(files).toHaveLength(1);
    expect(files[0]).not.toContain("ee109f19");
    const buf = readFileSync(path.join(ROOT, dir, files[0]!));
    const manifest = JSON.parse(read("apps/showcase-bean-brawl-race/aura.assets.json")) as { assets: Array<{ id: string; url: string; hash: string; sizeBytes: number }> };
    const entry = manifest.assets.find((a) => a.id === "yellowBean")!;
    expect(entry.url).toBe(`/aura-assets/${files[0]}`);
    expect(entry.hash).toBe(`sha256-${createHash("sha256").update(buf).digest("hex")}`);
    expect(entry.sizeBytes).toBe(buf.length);
    const typed = read("apps/showcase-bean-brawl-race/src/aura-assets.ts");
    expect(typed).toContain(`/aura-assets/${files[0]}`);
    expect(typed).not.toContain("ee109f19");
    const sharp = (await import("sharp")).default;
    const image = baseColourImage(buf);
    const meta = await sharp(image).metadata();
    const raw = await sharp(image).removeAlpha().raw().toBuffer();
    const px = (x: number, y: number) => { const o = (y * meta.width! + x) * 3; return [raw[o]!, raw[o + 1]!, raw[o + 2]!]; };
    // the old cheeks were saturated red-orange (R high, G low) at these texels; now they are the body yellow (G high)
    for (const [x, y] of [[45, 282], [215, 290], [367, 866]] as const) {
      const [r, g] = px(x, y);
      expect(g, `texel ${x},${y} rgb ${px(x, y)}`).toBeGreaterThan(150);
      expect(r).toBeGreaterThan(200);
    }
  });
});
