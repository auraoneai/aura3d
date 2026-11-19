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
    const file = await writeFixture(dir, "hero.glb", { texture: true, normalMap: true });
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
    const file = await writeFixture(dir, "hero.glb", { normalMap: true });
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
});
