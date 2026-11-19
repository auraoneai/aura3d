import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeGlb, renderPreview, PREVIEW_KIND } from "../../../../packages/aura3d-cli/src/commands/asset-post/index.js";
import { cliCommandFor } from "../../../../packages/aura3d-cli/src/contracts/commands.js";
import "../../../../packages/aura3d-cli/src/commands/registry.js";
import { captureIo, cleanupTmp, tmp, writeFixture } from "./fixtures.js";

afterEach(cleanupTmp);

const BG = [40, 44, 52];

async function cellCoverage(png: string, cells: number, size: number, top: number) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const coverage: number[] = [];
  for (let cell = 0; cell < cells; cell += 1) {
    let lit = 0;
    for (let y = top; y < top + size; y += 1) for (let x = cell * size; x < (cell + 1) * size; x += 1) {
      const o = (y * info.width + x) * info.channels;
      if (data[o] !== BG[0] || data[o + 1] !== BG[1] || data[o + 2] !== BG[2]) lit += 1;
    }
    coverage.push(lit / (size * size));
  }
  return { coverage, data, info };
}

describe("assets preview (renderPreview)", () => {
  it("renders four labelled views deterministically (same GLB → byte-identical PNG)", async () => {
    const dir = tmp();
    const glb = await writeFixture(dir, "car.glb", { texture: true });
    const a = await renderPreview(glb, join(dir, "a.png"), { size: 96 });
    const b = await renderPreview(glb, join(dir, "b.png"), { size: 96 });
    expect(a.kind).toBe(PREVIEW_KIND);
    expect(a.note).toMatch(/not a render/i);
    expect(a.views).toEqual(["front", "side", "back", "three-quarter"]);
    expect([a.width, a.height]).toEqual([96 * 4, 96 + 22]);
    expect(a.triangles).toBe(24);
    expect(a.texturedTriangles).toBe(24);
    expect(a.sha256).toBe(b.sha256);
    expect(createHash("sha256").update(readFileSync(join(dir, "a.png"))).digest("hex")).toBe(a.sha256);
    expect(readFileSync(join(dir, "a.png")).equals(readFileSync(join(dir, "b.png")))).toBe(true);
    const { coverage } = await cellCoverage(join(dir, "a.png"), 4, 96, 22);
    for (const c of coverage) expect(c).toBeGreaterThan(0.05);
  });

  it("frames each view on the model and shows the texture (checker colours present)", async () => {
    const dir = tmp();
    const glb = await writeFixture(dir, "car.glb", { texture: true });
    const out = join(dir, "front.png");
    await renderPreview(glb, out, { size: 64, views: ["front"], label: false });
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([64, 64]);
    let reddish = 0, bluish = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i]! > data[i + 2]! + 40) reddish += 1;
      if (data[i + 2]! > data[i]! + 40) bluish += 1;
    }
    expect(reddish).toBeGreaterThan(20);
    expect(bluish).toBeGreaterThan(20);
  });

  it("previews skinned meshes through their bind matrices (normalized rig stays in frame)", async () => {
    const dir = tmp();
    const rig = await writeFixture(dir, "rig.glb", { skinned: true });
    const norm = join(dir, "rig-norm.glb");
    await normalizeGlb(rig, norm, { front: "+x", size: { height: 1.8 } });
    const result = await renderPreview(norm, join(dir, "rig.png"), { size: 64, label: false });
    const { coverage } = await cellCoverage(join(dir, "rig.png"), 4, 64, 0);
    expect(result.triangles).toBe(24);
    for (const c of coverage) expect(c).toBeGreaterThan(0.05);
  });

  it("CLI: --help writes nothing; previews by asset id; bad --views is a usage error", async () => {
    const dir = tmp();
    await writeFixture(dir, "car.glb");
    writeFileSync(join(dir, "aura.assets.json"), JSON.stringify({
      schema: "aura3d.assets/1.0", assetBasePath: "/assets/", outputDir: "public/assets", typegen: "src/aura-assets.ts",
      assets: [{ id: "car", type: "model", format: "glb", source: "car.glb", outputPath: "car.glb", url: "/assets/car.glb", hash: "sha256-0", sizeBytes: 1, materials: [], animations: [], provenance: { license: "CC0-1.0" }, warnings: [] }]
    }));
    const command = cliCommandFor("assets preview")!;
    const before = readdirSync(dir).sort();
    const help = captureIo(dir);
    expect(await command.run(["car", "--out", "views.png", "--help"], help.io)).toBe(0);
    expect(help.out.join("\n")).toMatch(/CPU base-colour preview/);
    expect(readdirSync(dir).sort()).toEqual(before);
    expect(await command.run(["car", "--out", "v.png", "--views", "top"], captureIo(dir).io)).toBe(2);
    expect(await command.run(["car"], captureIo(dir).io)).toBe(2);
    const missing = captureIo(dir);
    expect(await command.run(["nothing", "--out", "v.png"], missing.io)).toBe(1);
    expect(missing.err.join("\n")).toMatch(/assets list/);

    const run = captureIo(dir);
    expect(await command.run(["car", "--out", "views.png", "--views", "front,three-quarter", "--size", "48", "--json"], run.io)).toBe(0);
    const json = JSON.parse(run.out.join("\n"));
    expect(json).toMatchObject({ ok: true, kind: PREVIEW_KIND, views: ["front", "three-quarter"], width: 96, height: 70 });
    expect(existsSync(join(dir, "views.png"))).toBe(true);
  });
});
