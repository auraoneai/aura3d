import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const MAX_DETAIL = 6; // see soft-cabinet.test.ts: photographs score ~17, softened textures ~3

// Face-scan athletes (photographic skin, jerseys with numbers) that used to be served from /aura-assets. Their original
// file hashes must never come back; their replacements keep only the colour layout of the atlas.
const ROOFTOP_STEMS = ["rooftopAthleteDefender", "rooftopAthleteShooter", "rooftopDefender", "rooftopLayupScorer", "rooftopShooter"];
const ROOFTOP_ORIGINALS = ["c0947539", "49b62313", "6c43f9e1", "03a093f2"];

function glbImages(glb: Buffer): { baseColour: Buffer[] } {
  const jsonLen = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString("utf8"));
  const binStart = 20 + jsonLen + 8;
  const out: Buffer[] = [];
  for (const m of (json.materials ?? []) as Array<{ pbrMetallicRoughness?: { baseColorTexture?: { index: number } } }>) {
    const t = m.pbrMetallicRoughness?.baseColorTexture;
    if (!t) continue;
    const image = json.images[json.textures[t.index].source] as { bufferView: number };
    const view = json.bufferViews[image.bufferView] as { byteOffset?: number; byteLength: number };
    const start = binStart + (view.byteOffset ?? 0);
    out.push(glb.subarray(start, start + view.byteLength));
  }
  return { baseColour: out };
}

async function detail(image: Buffer): Promise<number> {
  const sharp = (await import("sharp")).default;
  const full = await sharp(image).resize(512, 512, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const small = await sharp(image).resize(48, 48, { kernel: "lanczos3", fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const soft = await sharp(small.data, { raw: small.info }).resize(512, 512, { kernel: "cubic", fit: "fill" }).raw().toBuffer();
  let sum = 0;
  for (let i = 0; i < full.length; i += 1) sum += Math.abs(full[i]! - soft[i]!);
  return sum / full.length;
}

describe("rooftop face-scan athletes", () => {
  const files = readdirSync(path.join(ROOT, "public/aura-assets")).filter((f) => ROOFTOP_STEMS.some((s) => f.startsWith(`${s}.`)) && f.endsWith(".glb"));

  it("the photographic originals are gone", () => {
    expect(files.filter((f) => ROOFTOP_ORIGINALS.some((h) => f.includes(`.${h}.`)))).toEqual([]);
    for (const rel of ["aura.assets.json", "src/aura-assets.ts"]) for (const h of ROOFTOP_ORIGINALS) expect(read(rel), `${rel} ${h}`).not.toMatch(new RegExp(`rooftop[A-Za-z]+\\.${h}\\.glb`));
  });

  it("every remaining textured rooftop model has a low-detail base-colour image", async () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      for (const image of glbImages(readFileSync(path.join(ROOT, "public/aura-assets", f))).baseColour) {
        expect(await detail(image), f).toBeLessThan(MAX_DETAIL);
      }
    }
  });

  it("manifest entries match the files on disk", () => {
    const manifest = JSON.parse(read("aura.assets.json")) as { assets: Array<{ id: string; url: string; hash: string; sizeBytes: number }> };
    for (const a of manifest.assets.filter((x) => ROOFTOP_STEMS.some((s) => x.url.includes(`/aura-assets/${s}.`)))) {
      const file = path.join(ROOT, "public", a.url);
      expect(existsSync(file), a.url).toBe(true);
      const buf = readFileSync(file);
      expect(a.hash, a.id).toBe(`sha256-${createHash("sha256").update(buf).digest("hex")}`);
      expect(a.sizeBytes, a.id).toBe(buf.length);
    }
  });
});
