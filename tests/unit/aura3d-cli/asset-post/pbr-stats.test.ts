import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Document } from "@gltf-transform/core";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { isMetalLikeColor, looksLikeVehicleName, measurePbrStats, rgbToHsv } from "../../../../packages/aura3d-cli/src/admission/pbrStats.js";
import { pbrValidationWarnings } from "../../../../packages/aura3d-cli/src/admission/pbrValidate.js";
import { boxGeometry, cleanupTmp, io, tmp } from "./fixtures.js";

afterEach(cleanupTmp);

const repo = resolve(__dirname, "../../../..");

async function solid(size: number, rgb: readonly [number, number, number], format: "png" | "jpeg" = "png", noise = 0): Promise<Uint8Array> {
  const data = Buffer.alloc(size * size * 3);
  let state = 0x2545f491;
  for (let i = 0; i < size * size; i += 1) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    const jitter = noise ? ((state >>> 0) % (2 * noise + 1)) - noise : 0;
    data.set([Math.max(0, Math.min(255, rgb[0] + jitter)), Math.max(0, Math.min(255, rgb[1] - jitter)), rgb[2]], i * 3);
  }
  const pipeline = sharp(data, { raw: { width: size, height: size, channels: 3 } });
  return new Uint8Array(await (format === "png" ? pipeline.png() : pipeline.jpeg({ quality: 92 })).toBuffer());
}

interface MaterialSpec {
  readonly name: string;
  readonly color: readonly [number, number, number];
  /** metallicRoughness texture as [roughness 0-255, metalness 0-255]. */
  readonly mr?: readonly [number, number];
  readonly metallic?: number;
  readonly roughness?: number;
  readonly normal?: { readonly rgb: readonly [number, number, number]; readonly format: "png" | "jpeg"; readonly noise?: number; readonly scale?: number };
  readonly boxes?: number;
}

async function writeModel(dir: string, name: string, materials: readonly MaterialSpec[]): Promise<string> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("scene");
  for (const spec of materials) {
    const material = doc.createMaterial(spec.name)
      .setBaseColorTexture(doc.createTexture(`${spec.name}-color`).setMimeType("image/png").setImage(await solid(32, spec.color)))
      .setMetallicFactor(spec.metallic ?? 1)
      .setRoughnessFactor(spec.roughness ?? 1);
    if (spec.mr) material.setMetallicRoughnessTexture(doc.createTexture(`${spec.name}-mr`).setMimeType("image/png").setImage(await solid(32, [0, spec.mr[0], spec.mr[1]])));
    if (spec.normal) {
      material.setNormalTexture(doc.createTexture(`${spec.name}-normal`).setMimeType(`image/${spec.normal.format}`).setImage(await solid(64, spec.normal.rgb, spec.normal.format, spec.normal.noise ?? 0)));
      if (spec.normal.scale !== undefined) material.setNormalScale(spec.normal.scale);
    }
    for (let b = 0; b < (spec.boxes ?? 1); b += 1) {
      const g = boxGeometry([b, 0, 0], [b + 1, 1, 1]);
      const prim = doc.createPrimitive()
        .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(g.positions).setBuffer(buffer))
        .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(g.uvs).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType("SCALAR").setArray(g.indices).setBuffer(buffer))
        .setMaterial(material);
      scene.addChild(doc.createNode(`${spec.name}-${b}`).setMesh(doc.createMesh(`${spec.name}-${b}`).addPrimitive(prim)));
    }
  }
  const path = join(dir, name);
  await io.write(path, doc);
  return path;
}

describe("PBR statistics (assets inspect --pbr / validate --pbr)", () => {
  it("measures metalness, roughness, normal tilt, encodings and sizes per material", async () => {
    const dir = tmp();
    const file = await writeModel(dir, "prop.glb", [
      { name: "paint", color: [150, 20, 25], mr: [40, 200], normal: { rgb: [128, 128, 254], format: "jpeg" } },
      { name: "rubber", color: [30, 30, 30], metallic: 0, roughness: 0.9, normal: { rgb: [128, 128, 255], format: "png" } }
    ]);
    const report = await measurePbrStats(file, { projectDir: repo });
    expect(report.decoded).toBe(true);
    const [paint, rubber] = report.materials;
    expect(paint!.metalness).toMatchObject({ source: "texture", p50: expect.closeTo(200 / 255, 2) });
    expect(paint!.roughness.p50).toBeCloseTo(40 / 255, 2);
    expect(paint!.glossy).toBe(true);
    expect(paint!.normal).toMatchObject({ encoding: "jpeg", width: 64, height: 64, scale: 1 });
    expect(paint!.textures.map((t) => [t.slot, t.encoding, t.width])).toEqual([["baseColor", "png", 32], ["metallicRoughness", "png", 32], ["normal", "jpeg", 64]]);
    expect(rubber!.metalness).toMatchObject({ source: "factor", p5: 0, p50: 0, p95: 0 });
    expect(rubber!.roughness.p50).toBeCloseTo(0.9, 5);
    expect(rubber!.glossy).toBe(false);
    expect(rubber!.normal!.tiltDeg.p50).toBe(0);
    expect(rubber!.triangles).toBe(12);
  });

  it("A11 tilt formula: a flat texel stored at z = 254 reads 7.2 degrees; normalScale scales it", async () => {
    const dir = tmp();
    const file = await writeModel(dir, "panel.glb", [
      { name: "full", color: [150, 20, 25], metallic: 0, roughness: 0.2, normal: { rgb: [128, 128, 254], format: "png" } },
      { name: "soft", color: [150, 20, 25], metallic: 0, roughness: 0.2, normal: { rgb: [128, 128, 254], format: "png", scale: 0.3 } }
    ]);
    const [full, soft] = (await measurePbrStats(file, { projectDir: repo })).materials;
    expect(full!.normal!.tiltDeg.p50).toBeCloseTo(7.18, 1);
    expect(full!.normal!.shadingTiltDeg.p50).toBeLessThan(1);
    expect(soft!.normal!.tiltDeg.p50).toBeCloseTo(7.18 * 0.3, 1);
  });

  it("warns PBR_PAINT_METALLIC, PBR_NORMAL_LOSSY_GLOSSY, PBR_NORMAL_NOISY and PBR_SINGLE_MATERIAL_VEHICLE only where they apply", async () => {
    const dir = tmp();
    const bad = await writeModel(dir, "sportsCoupe.glb", [
      { name: "body", color: [140, 15, 20], mr: [40, 200], normal: { rgb: [128, 128, 250], format: "jpeg", noise: 6 }, boxes: 420 }
    ]);
    const codes = (await measurePbrStats(bad, { projectDir: repo })).warnings.map((w) => w.code);
    expect(codes).toEqual(["PBR_PAINT_METALLIC", "PBR_NORMAL_LOSSY_GLOSSY", "PBR_NORMAL_NOISY", "PBR_SINGLE_MATERIAL_VEHICLE"]);

    const good = await writeModel(dir, "crate.glb", [
      // Chrome: metallic on a bright neutral base colour is a real metal.
      { name: "chrome", color: [210, 210, 215], metallic: 1, roughness: 0.1, normal: { rgb: [128, 128, 255], format: "png" } },
      // Gold trim.
      { name: "gold", color: [255, 195, 86], metallic: 1, roughness: 0.3 },
      // Rough painted wood with a JPEG normal map and intentional relief: not glossy, so no lossy or noisy warning.
      { name: "wood", color: [140, 90, 40], metallic: 0, roughness: 0.85, normal: { rgb: [150, 110, 230], format: "jpeg", noise: 6 } }
    ]);
    expect((await measurePbrStats(good, { projectDir: repo })).warnings).toEqual([]);
  });

  it("colour and vehicle-name heuristics", () => {
    expect(isMetalLikeColor(rgbToHsv(0.8, 0.8, 0.82))).toBe(true);
    expect(isMetalLikeColor(rgbToHsv(0.25, 0.25, 0.27))).toBe(true);
    expect(isMetalLikeColor(rgbToHsv(1, 0.76, 0.34))).toBe(true);
    expect(isMetalLikeColor(rgbToHsv(0.55, 0.06, 0.08))).toBe(false);
    expect(isMetalLikeColor(rgbToHsv(0.1, 0.2, 0.6))).toBe(false);
    expect(looksLikeVehicleName("coupe.glb")).toBe(true);
    expect(looksLikeVehicleName("courierTrafficSedan")).toBe(true);
    expect(looksLikeVehicleName("ao_SuvNW")).toBe(true);
    expect(looksLikeVehicleName("scarecrow.glb")).toBe(false);
    expect(looksLikeVehicleName("cartoonTree")).toBe(false);
  });

  it("validate --pbr: warns per manifest model, prefixed with the asset id, and honours --asset", async () => {
    const dir = tmp();
    await writeModel(dir, "car.glb", [{ name: "body", color: [140, 15, 20], mr: [40, 200], normal: { rgb: [128, 128, 254], format: "jpeg" } }]);
    await writeModel(dir, "rock.glb", [{ name: "stone", color: [120, 120, 120], metallic: 0, roughness: 0.9 }]);
    writeFileSync(join(dir, "aura.assets.json"), JSON.stringify({
      schema: "aura3d.assets/1.0", assetBasePath: "/aura-assets/", outputDir: "public/aura-assets", typegen: "src/aura-assets.ts",
      assets: [
        { id: "car", type: "model", format: "glb", role: "vehicle", source: "car.glb", outputPath: "car.glb" },
        { id: "rock", type: "model", format: "glb", role: "prop", source: "rock.glb", outputPath: "rock.glb" }
      ]
    }));
    const warnings = await pbrValidationWarnings(dir);
    expect(warnings.map((w) => w.slice(0, w.indexOf(":", 5)))).toEqual(["car: PBR_PAINT_METALLIC", "car: PBR_NORMAL_LOSSY_GLOSSY", "car: PBR_NORMAL_NOISY"]);
    expect(await pbrValidationWarnings(dir, ["rock"])).toEqual([]);
  });
});

/** Calibration on real files (lessons A11): the shipped Vesper GT coupe must trip every warning; known-good assets stay clean. */
describe("PBR statistics calibration on repo assets", () => {
  const coupe = join(repo, "marketing/public/models/vesper-gt/coupe.glb");
  const calibrated = existsSync(coupe) ? it : it.skip;

  calibrated("Vesper GT coupe: metalness 0.77, roughness 0.17, tilt 7.2 deg, JPEG normals; all four warnings", async () => {
    const report = await measurePbrStats(coupe, { projectDir: repo });
    const [body] = report.materials;
    expect(body!.metalness.p50).toBeCloseTo(0.77, 2);
    expect(body!.roughness.p50).toBeCloseTo(0.17, 1);
    expect(body!.normal!.tiltDeg.p50).toBeCloseTo(7.2, 1);
    expect(body!.normal!.encoding).toBe("jpeg");
    expect(report.warnings.map((w) => w.code)).toEqual(["PBR_PAINT_METALLIC", "PBR_NORMAL_LOSSY_GLOSSY", "PBR_NORMAL_NOISY", "PBR_SINGLE_MATERIAL_VEHICLE"]);
  });

  const good = [
    "public/aura-assets/courierTrafficSedan.69f41bfa.glb",
    "public/aura-assets/courierTrafficHatch.ee239312.glb",
    "public/aura-assets/cdBoulder.5cfa8a27.glb"
  ].map((file) => join(repo, file));
  (good.every((file) => existsSync(file)) ? it : it.skip)("known-good glossy vehicles (PNG normals) and a rough prop stay clean", async () => {
    for (const file of good) expect((await measurePbrStats(file, { projectDir: repo })).warnings, file).toEqual([]);
  }, 60_000);

  calibrated("CLI: assets inspect --pbr prints the statistics and the coded warnings", () => {
    let stdout = "";
    try {
      execFileSync(join(repo, "node_modules/.bin/tsx"), ["--tsconfig", join(repo, "tsconfig.base.json"), join(repo, "packages/aura3d-cli/src/cli.ts"), "assets", "inspect", "marketing/public/models/vesper-gt/coupe.glb", "--pbr"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
    } catch (error) {
      stdout = String((error as { stdout?: string }).stdout ?? "");
    }
    const report = JSON.parse(stdout);
    expect(report.ok).toBe(false);
    expect(report.pbr.materials[0].metalness.p50).toBeCloseTo(0.77, 2);
    expect(report.warnings.filter((w: string) => w.startsWith("PBR_")).map((w: string) => w.split(":")[0])).toEqual(["PBR_PAINT_METALLIC", "PBR_NORMAL_LOSSY_GLOSSY", "PBR_NORMAL_NOISY", "PBR_SINGLE_MATERIAL_VEHICLE"]);
  }, 60_000);
});
