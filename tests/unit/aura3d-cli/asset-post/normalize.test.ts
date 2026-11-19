import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getBounds } from "@gltf-transform/core";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeGlb } from "../../../../packages/aura3d-cli/src/commands/asset-post/index.js";
import { cliCommandFor } from "../../../../packages/aura3d-cli/src/contracts/commands.js";
import "../../../../packages/aura3d-cli/src/commands/registry.js";
import { captureIo, cleanupTmp, io, tmp, writeFixture } from "./fixtures.js";

afterEach(cleanupTmp);

async function readBack(path: string) {
  const doc = await io.read(path);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0]!;
  const node = (name: string) => root.listNodes().find((n) => n.getName() === name)!;
  return { doc, root, scene, node, bounds: getBounds(scene) };
}

describe("assets normalize (normalizeGlb)", () => {
  it("turns a +X-facing model to +Z, grounds it, centres it, sizes it by height and bakes static transforms", async () => {
    const dir = tmp();
    const input = await writeFixture(dir, "in.glb", { nested: true });
    const output = join(dir, "out.glb");
    const result = await normalizeGlb(input, output, { front: "+x", size: { height: 2 }, provenance: { generator: "test" } });

    // Source: 5 long (x -2..3), 1 tall, 2 wide, scaled x2 by the parent; height 2 → wrapper scale 1.
    expect(result.yawDeg).toBe(-90);
    expect(result.minY).toBe(0);
    expect(result.size[1]).toBeCloseTo(2, 3);
    expect(result.size[2]).toBeCloseTo(10, 3); // the long axis now runs along Z
    expect(result.size[0]).toBeCloseTo(4, 3);

    const { root, node, bounds, doc } = await readBack(output);
    expect(bounds.min[1]).toBeCloseTo(0, 5);
    expect((bounds.min[0] + bounds.max[0]) / 2).toBeCloseTo(0, 5);
    expect((bounds.min[2] + bounds.max[2]) / 2).toBeCloseTo(0, 5);
    // The nose (front) ends up toward +Z.
    expect(getBounds(node("nose")).min[2]).toBeGreaterThan(getBounds(node("body")).max[2] - 1e-6);
    // Static meshes carry identity transforms: the vertices hold the box, so accessor bounds are the true bounds.
    for (const mesh of root.listNodes().filter((n) => n.getMesh())) {
      expect(mesh.getParentNode()).toBeNull();
      expect(mesh.getTranslation()).toEqual([0, 0, 0]);
      expect(mesh.getRotation()).toEqual([0, 0, 0, 1]);
      expect(mesh.getScale()).toEqual([1, 1, 1]);
    }
    const ys = root.listAccessors().filter((a) => a.getType() === "VEC3").map((a) => a.getMin([])[1]!);
    expect(Math.min(...ys)).toBeCloseTo(0, 5);
    const extras = doc.getRoot().getAsset().extras as { aura3d: Record<string, unknown> };
    expect(extras.aura3d).toMatchObject({ orientation: { forwardAxis: "+z", upAxis: "+y" }, grounded: true, generator: "test" });
  });

  it("sizes by length (Z after turning), width and maxDim", async () => {
    const dir = tmp();
    const input = await writeFixture(dir, "in.glb");
    expect((await normalizeGlb(input, join(dir, "l.glb"), { front: "+x", size: { length: 6 } })).size[2]).toBeCloseTo(6, 3);
    expect((await normalizeGlb(input, join(dir, "w.glb"), { front: "+x", size: { width: 1 } })).size[0]).toBeCloseTo(1, 3);
    const max = await normalizeGlb(input, join(dir, "m.glb"), { size: { maxDim: 2.5 } });
    expect(Math.max(...max.size)).toBeCloseTo(2.5, 3);
    // Default front is +z: no turn, the long axis stays on X.
    expect(max.yawDeg).toBe(0);
    expect(max.size[0]).toBeCloseTo(2.5, 3);
  });

  it("keeps the auraRoot wrapper for skinned meshes and reports sceneScale with keepScale", async () => {
    const dir = tmp();
    const input = await writeFixture(dir, "rig.glb", { skinned: true });
    const output = join(dir, "rig-out.glb");
    const result = await normalizeGlb(input, output, { front: "+x", size: { height: 1.8 }, keepScale: true });
    expect(result.scale).toBe(1);
    expect(result.sceneScale).toBeCloseTo(1.8, 3);
    expect(result.minY).toBe(0);
    const { scene, node, doc } = await readBack(output);
    const wrapper = scene.listChildren();
    expect(wrapper.map((n) => n.getName())).toEqual(["auraRoot"]);
    const rotation = node("auraRoot").getRotation();
    expect(rotation[1]).toBeCloseTo(-Math.SQRT1_2, 5);
    expect(node("auraRoot").getScale()).toEqual([1, 1, 1]);
    expect(node("body").getParentNode()?.getName()).toBe("auraRoot");
    expect((doc.getRoot().getAsset().extras as { aura3d: { sceneScale?: number } }).aura3d.sceneScale).toBeCloseTo(1.8, 3);
  });

  it("rejects an unknown --front and a missing input with messages that name the fix", async () => {
    const dir = tmp();
    const input = await writeFixture(dir, "in.glb");
    await expect(normalizeGlb(input, join(dir, "o.glb"), { front: "up" })).rejects.toThrow(/\+z, -z, \+x, -x/);
    await expect(normalizeGlb(join(dir, "nope.glb"), join(dir, "o.glb"))).rejects.toThrow(/File not found/);
  });

  it("CLI: --help writes nothing, missing --out is a usage error (2), --json prints one object", async () => {
    const dir = tmp();
    await writeFixture(dir, "in.glb");
    const command = cliCommandFor("assets normalize")!;
    const help = captureIo(dir);
    expect(await command.run(["in.glb", "--out", "out.glb", "--help"], help.io)).toBe(0);
    expect(help.out.join("\n")).toMatch(/^Usage: aura3d assets normalize/);
    expect(existsSync(join(dir, "out.glb"))).toBe(false);

    const usage = captureIo(dir);
    expect(await command.run(["in.glb"], usage.io)).toBe(2);
    expect(await command.run(["in.glb", "--out", "o.glb", "--height", "1", "--length", "2"], usage.io)).toBe(2);
    expect(readdirSync(dir)).toEqual(["in.glb"]);

    const run = captureIo(dir);
    expect(await command.run(["in.glb", "--out", "out.glb", "--front", "+x", "--length", "3", "--json"], run.io)).toBe(0);
    expect(run.out).toHaveLength(1);
    const json = JSON.parse(run.out[0]!);
    expect(json).toMatchObject({ ok: true, yawDeg: -90, minY: 0 });
    expect(json.size[2]).toBeCloseTo(3, 3);
    expect(existsSync(join(dir, "out.glb"))).toBe(true);
  });
});
