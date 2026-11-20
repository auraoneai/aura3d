import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { slimGlb } from "../../../../packages/aura3d-cli/src/commands/asset-post/index.js";
import { cliCommandFor } from "../../../../packages/aura3d-cli/src/contracts/commands.js";
import "../../../../packages/aura3d-cli/src/commands/registry.js";
import { captureIo, cleanupTmp, io, tmp, writeFixture } from "./fixtures.js";

afterEach(cleanupTmp);

describe("assets slim (slimGlb)", () => {
  it("re-encodes a PNG normal map as JPEG, shrinks the file, and leaves the PNG base colour alone", async () => {
    const dir = tmp();
    const file = await writeFixture(dir, "hero.glb", { texture: true, normalMap: true, metallic: 0, roughness: 0.8 });
    const before = statSync(file).size;
    const result = await slimGlb(file);
    expect(result.written).toBe(true);
    expect(result.reencoded).toBe(1);
    expect(result.before).toBe(before);
    expect(result.after).toBeLessThan(before);
    expect(statSync(file).size).toBe(result.after);
    const doc = await io.read(file);
    const material = doc.getRoot().listMaterials()[0]!;
    expect(material.getNormalTexture()!.getMimeType()).toBe("image/jpeg");
    expect(material.getBaseColorTexture()!.getMimeType()).toBe("image/png");
  });

  it("does not touch a file without PNG textures in the selected slots", async () => {
    const dir = tmp();
    const file = await writeFixture(dir, "prop.glb", { texture: true });
    const bytes = readFileSync(file);
    const result = await slimGlb(file);
    expect(result).toMatchObject({ written: false, reencoded: 0, after: bytes.length });
    expect(readFileSync(file).equals(bytes)).toBe(true);
  });

  it("CLI: --help writes nothing; --out writes a copy; bad --quality is a usage error", async () => {
    const dir = tmp();
    const file = await writeFixture(dir, "hero.glb", { normalMap: true, metallic: 0, roughness: 0.8 });
    const original = readFileSync(file);
    const command = cliCommandFor("assets slim")!;
    const help = captureIo(dir);
    expect(await command.run(["hero.glb", "--help"], help.io)).toBe(0);
    expect(readFileSync(file).equals(original)).toBe(true);
    expect(await command.run(["hero.glb", "--quality", "101"], captureIo(dir).io)).toBe(2);

    const run = captureIo(dir);
    expect(await command.run(["hero.glb", "--out", "slim.glb", "--quality", "80", "--json"], run.io)).toBe(0);
    const json = JSON.parse(run.out.join("\n"));
    expect(json.ok).toBe(true);
    expect(json.after).toBeLessThan(json.before);
    expect(existsSync(join(dir, "slim.glb"))).toBe(true);
    expect(readFileSync(file).equals(original)).toBe(true);
  });

  it("keeps normal maps on glossy materials PNG and reports why; --allow-glossy restores the old behaviour", async () => {
    const dir = tmp();
    const glossy = await writeFixture(dir, "car.glb", { normalMap: true, metallic: 0, roughness: 0.2 });
    const original = readFileSync(glossy);
    const result = await slimGlb(glossy);
    expect(result).toMatchObject({ written: false, reencoded: 0 });
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({ material: "paint" });
    expect(result.skipped[0]!.reason).toMatch(/glossy \(roughness median 0\.20/);
    expect(readFileSync(glossy).equals(original)).toBe(true);

    const metal = await writeFixture(dir, "chrome.glb", { normalMap: true, metallic: 1, roughness: 0.9 });
    const metalResult = await slimGlb(metal);
    expect(metalResult.skipped[0]!.reason).toMatch(/^normal map on metallic/);
    expect(metalResult.written).toBe(false);

    const forced = await slimGlb(glossy, { allowGlossy: true });
    expect(forced).toMatchObject({ written: true, reencoded: 1, skipped: [] });
    expect(forced.after).toBeLessThan(forced.before);
    const doc = await io.read(glossy);
    expect(doc.getRoot().listMaterials()[0]!.getNormalTexture()!.getMimeType()).toBe("image/jpeg");
  });

  it("CLI reports each glossy skip and accepts --allow-glossy", async () => {
    const dir = tmp();
    await writeFixture(dir, "car.glb", { normalMap: true, metallic: 0, roughness: 0.1 });
    const command = cliCommandFor("assets slim")!;
    const run = captureIo(dir);
    expect(await command.run(["car.glb"], run.io)).toBe(0);
    expect(run.out.join("\n")).toMatch(/unchanged: every candidate is on a glossy material/);
    expect(run.out.join("\n")).toMatch(/skipped normal \(material paint\): normal map on glossy/);
    const forced = captureIo(dir);
    expect(await command.run(["car.glb", "--allow-glossy", "--json"], forced.io)).toBe(0);
    expect(JSON.parse(forced.out.join("\n")).files[0]).toMatchObject({ written: true, reencoded: 1 });
  });
});
