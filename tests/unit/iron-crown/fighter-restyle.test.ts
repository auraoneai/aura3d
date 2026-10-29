import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const APP = path.resolve("apps/showcase-iron-crown");
const manifest = JSON.parse(readFileSync(path.join(APP, "aura.assets.json"), "utf8"));
const entries: Array<{ id: string; source: string; url: string; hash: string; sizeBytes: number }> = manifest.assets ?? manifest;

function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx === 0 ? 0 : d / mx, mx];
}

async function textureFractions(glb: string): Promise<{ red: number; white: number }> {
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(glb);
  const image = Buffer.from(doc.getRoot().listTextures()[0]!.getImage()!);
  const { data } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let red = 0, white = 0, lit = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, v] = hsv(data[i]! / 255, data[i + 1]! / 255, data[i + 2]! / 255);
    if (v < 0.04) continue;
    lit += 1;
    if ((h >= 340 || h <= 15) && s > 0.55 && v > 0.25) red += 1;
    if (s < 0.3 && v > 0.8) white += 1;
  }
  return { red: red / lit, white: white / lit };
}

describe("iron crown fighter restyle", () => {
  for (const id of ["ironcrownKenji", "ironcrownVolt"]) {
    it(`${id}: manifest hash, size and evidence match the shipped file`, () => {
      const entry = entries.find((e) => e.id === id)!;
      const file = path.join(APP, entry.source);
      const buf = readFileSync(file);
      expect(entry.hash).toBe(`sha256-${createHash("sha256").update(buf).digest("hex")}`);
      expect(entry.sizeBytes).toBe(buf.length);
      expect(entry.url).toBe(`/aura-assets/${path.basename(entry.source)}`);
      expect(existsSync(path.join(APP, "aura-evidence/restyle", `${id}.restyle.json`))).toBe(true);
    });
  }

  it("Kenji no longer carries the white gi or the red headband in his texture", async () => {
    const kenji = entries.find((e) => e.id === "ironcrownKenji")!;
    const { red, white } = await textureFractions(path.join(APP, kenji.source));
    // the original atlas was about 53% white cloth and 1.7% red band pixels
    expect(white).toBeLessThan(0.02);
    expect(red).toBeLessThan(0.002);
  });
});
