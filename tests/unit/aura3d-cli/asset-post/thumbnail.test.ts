import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addAsset, createAssetThumbnailsAsync } from "../../../../packages/aura3d-cli/src/index.js";
import { cliCommandFor } from "../../../../packages/aura3d-cli/src/contracts/commands.js";
import "../../../../packages/aura3d-cli/src/commands/registry.js";
import { captureIo, cleanupTmp, tmp, writeFixture } from "./fixtures.js";

afterEach(cleanupTmp);

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else out[relative(dir, path)] = readFileSync(path).toString("base64");
    }
  };
  walk(dir);
  return out;
}

async function project(): Promise<string> {
  const dir = tmp("aura3d-thumb-");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "thumb-test", private: true, type: "module" }));
  const source = await writeFixture(dir, "car-source.glb", { texture: true });
  addAsset({ projectDir: dir, file: source, name: "car", type: "model", license: "CC0-1.0", author: "test", sourceUrl: "https://example.com/car" });
  return dir;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("assets thumbnail (createAssetThumbnailsAsync)", () => {
  it("--help writes nothing and leaves the manifest untouched", async () => {
    const dir = await project();
    const before = snapshot(dir);
    const help = captureIo(dir);
    expect(await cliCommandFor("assets thumbnail")!.run(["--help"], help.io)).toBe(0);
    expect(help.out.join("\n")).toMatch(/^Usage: aura3d assets thumbnail/);
    expect(snapshot(dir)).toEqual(before);
    expect(await cliCommandFor("assets thumbnail")!.run(["--asset", "car", "-h"], captureIo(dir).io)).toBe(0);
    expect(snapshot(dir)).toEqual(before);
  });

  it("writes a real PNG thumbnail, points thumbnailUrl at it and removes the admission placeholder SVG", async () => {
    const dir = await project();
    const manifestBefore = JSON.parse(readFileSync(join(dir, "aura.assets.json"), "utf8"));
    const placeholder = manifestBefore.assets[0].thumbnailUrl as string;
    expect(placeholder).toMatch(/car\.thumb\.svg$/);
    const outputDir = manifestBefore.outputDir as string;
    expect(existsSync(join(dir, outputDir, "car.thumb.svg"))).toBe(true);

    const result = await createAssetThumbnailsAsync({ projectDir: dir, size: 64 });
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("cpu-base-colour-preview");
    expect(result.thumbnails.map((t) => t.id)).toEqual(["car"]);
    const png = readFileSync(join(dir, outputDir, "car.thumb.png"));
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(png.length).toBeGreaterThan(200); // the release thumbnail check's floor
    expect(existsSync(join(dir, outputDir, "car.thumb.svg"))).toBe(false);
    const manifest = JSON.parse(readFileSync(join(dir, "aura.assets.json"), "utf8"));
    expect(manifest.assets[0].thumbnailUrl).toBe(placeholder.replace(/\.svg$/, ".png"));
    expect(readdirSync(join(dir, outputDir)).some((name) => name.endsWith(".svg"))).toBe(false);
  });

  it("CLI: --json prints one object; an unknown --asset is a clear failure; output is deterministic", async () => {
    const dir = await project();
    const command = cliCommandFor("assets thumbnail")!;
    const bad = captureIo(dir);
    expect(await command.run(["--asset", "nope"], bad.io)).toBe(1);
    expect(bad.err.join("\n")).toMatch(/Unknown asset id\(s\): nope/);

    const first = captureIo(dir);
    expect(await command.run(["--asset", "car", "--size", "48", "--json"], first.io)).toBe(0);
    expect(first.out).toHaveLength(1);
    const json = JSON.parse(first.out[0]!);
    expect(json).toMatchObject({ ok: true, kind: "cpu-base-colour-preview", thumbnails: [{ id: "car" }] });
    expect(json.manifest).toBeUndefined();
    const bytes = readFileSync(json.thumbnails[0].path);
    expect(await command.run(["--asset", "car", "--size", "48"], captureIo(dir).io)).toBe(0);
    expect(readFileSync(json.thumbnails[0].path).equals(bytes)).toBe(true);
  });
});
