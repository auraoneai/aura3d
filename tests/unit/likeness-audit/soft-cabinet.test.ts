import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const KEY = "billiardsTrophyCabinetMeshy";
// The original model's base-colour atlas held small framed photographs of people. Its sha256 prefix must never come back.
const ORIGINAL_PREFIX = "db74320a";
// High-frequency detail (mean abs difference between the texture and a 48x48 version of itself): the original scored
// about 17.5, the softened replacement about 3.1. Photographs, faces and lettering cannot survive below this bound.
const MAX_DETAIL = 6;

function baseColourImage(glb: Buffer): Buffer {
  const jsonLen = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString("utf8"));
  const binStart = 20 + jsonLen + 8;
  const tex = json.materials[0].pbrMetallicRoughness.baseColorTexture.index as number;
  const image = json.images[json.textures[tex].source] as { bufferView: number };
  const view = json.bufferViews[image.bufferView] as { byteOffset?: number; byteLength: number };
  const start = binStart + (view.byteOffset ?? 0);
  return glb.subarray(start, start + view.byteLength);
}

describe("trophy cabinet base-colour texture", () => {
  const manifest = JSON.parse(read("aura.assets.json")) as { assets: Array<{ id: string; url: string; hash: string; sizeBytes: number; outputPath: string; path: string; sha256: string }> };
  const entry = manifest.assets.find((a) => a.id === KEY)!;

  it("manifests name the softened file with a matching hash and size", () => {
    expect(entry.url).not.toContain(ORIGINAL_PREFIX);
    expect(entry.outputPath).toBe(`public${entry.url}`);
    expect(entry.path).toBe(entry.outputPath);
    const buf = readFileSync(path.join(ROOT, "public", entry.url));
    const sha = createHash("sha256").update(buf).digest("hex");
    expect(entry.hash).toBe(`sha256-${sha}`);
    expect(entry.sha256).toBe(sha);
    expect(entry.sizeBytes).toBe(buf.length);
    const typed = read("src/aura-assets.ts");
    const block = typed.slice(typed.indexOf(`"${KEY}": {`), typed.indexOf("\n  },", typed.indexOf(`"${KEY}": {`)));
    expect(block).toContain(`url: "${entry.url}"`);
    expect(block).toContain(`hash: "sha256-${sha}"`);
    expect(block).toContain(`sizeBytes: ${buf.length}`);
  });

  it("the original photographic model is gone from the served assets and from source", () => {
    const files = readdirSync(path.join(ROOT, "public/aura-assets"));
    expect(files.filter((f) => f.includes(ORIGINAL_PREFIX))).toEqual([]);
    expect(files.filter((f) => f.startsWith(`${KEY}.`) && f.endsWith(".glb"))).toHaveLength(1);
    for (const rel of ["aura.assets.json", "src/aura-assets.ts"]) expect(read(rel), rel).not.toContain(ORIGINAL_PREFIX);
    expect(existsSync(path.join(ROOT, "public/aura-assets", `${KEY}.${ORIGINAL_PREFIX}.glb`))).toBe(false);
  });

  it("the base-colour image has no fine detail (no photographs, faces or lettering)", async () => {
    const sharp = (await import("sharp")).default;
    const image = baseColourImage(readFileSync(path.join(ROOT, "public", entry.url)));
    const full = await sharp(image).resize(512, 512, { fit: "fill" }).removeAlpha().raw().toBuffer();
    const small = await sharp(image).resize(48, 48, { kernel: "lanczos3", fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const soft = await sharp(small.data, { raw: small.info }).resize(512, 512, { kernel: "cubic", fit: "fill" }).raw().toBuffer();
    let sum = 0;
    for (let i = 0; i < full.length; i += 1) sum += Math.abs(full[i]! - soft[i]!);
    expect(sum / full.length).toBeLessThan(MAX_DETAIL);
  });
});
