import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { loadGltfToolkit } from "../../../../packages/aura3d-cli/src/commands/assets/gltfToolkit.js";
import { OPTIMIZE_BUDGETS, optimizeGlbFile, planOptimize } from "../../../../packages/aura3d-cli/src/commands/assets/optimize.js";
import { mergeGlbClips, parseClipSpec } from "../../../../packages/aura3d-cli/src/commands/assets/mergeClips.js";

const dir = mkdtempSync(join(tmpdir(), "aura3d-gltf-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let toolkit: ReturnType<typeof loadGltfToolkit> | undefined;
try {
  toolkit = loadGltfToolkit(process.cwd());
} catch {
  toolkit = undefined;
}
const needsToolkit = toolkit ? test : test.skip;

describe("assets optimize (planning)", () => {
  test("role budgets and overrides", () => {
    expect(planOptimize({ role: "prop" })).toMatchObject({ maxVerts: OPTIMIZE_BUDGETS.prop.maxVerts, tex: 1024, simplify: true, meshopt: false });
    expect(planOptimize({ role: "hero" })).toMatchObject({ maxVerts: 40000, tex: 2048 });
    expect(planOptimize({ role: "vehicle", maxVerts: 12000, tex: 512, simplify: false, meshopt: true })).toMatchObject({ maxVerts: 12000, tex: 512, simplify: false, meshopt: true });
    expect(planOptimize({})).toMatchObject({ role: "prop" });
  });

  test("rejects out-of-range overrides", () => {
    expect(() => planOptimize({ tex: 8192 })).toThrowError(/--tex/);
    expect(() => planOptimize({ maxVerts: 10 })).toThrowError(/--max-verts/);
    expect(() => planOptimize({ error: 0 })).toThrowError(/--error/);
    expect(() => planOptimize({ role: "boss" as never })).toThrowError(/Unknown optimize role/);
  });
});

describe("assets optimize and merge-clips (real glTF documents)", () => {
  needsToolkit("optimize simplifies a dense mesh to its role budget and refuses to overwrite its input", async () => {
    const { NodeIO } = toolkit!;
    const doc = new toolkit!.Document();
    const buffer = doc.createBuffer();
    const n = 90;
    const positions = new Float32Array(n * n * 3);
    const indices: number[] = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) positions.set([x, Math.sin(x * 0.3) * Math.cos(y * 0.3), y], (y * n + x) * 3);
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) indices.push(y * n + x, (y + 1) * n + x, y * n + x + 1, y * n + x + 1, (y + 1) * n + x, (y + 1) * n + x + 1);
    const prim = doc
      .createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(indices)).setBuffer(buffer));
    const mesh = doc.createMesh("terrain").addPrimitive(prim);
    doc.createScene("s").addChild(doc.createNode("n").setMesh(mesh));
    const input = join(dir, "dense.glb");
    await new NodeIO().write(input, doc);
    const output = join(dir, "out", "dense.opt.glb");
    const result = await optimizeGlbFile({ input, output, role: "prop", maxVerts: 1500, toolkit: toolkit! });
    expect(result.vertsBefore).toBe(n * n);
    expect(result.simplified).toBe(true);
    expect(result.vertsAfter).toBeLessThan(result.vertsBefore);
    expect(existsSync(output) && statSync(output).size).toBeGreaterThan(0);
    await expect(optimizeGlbFile({ input, output: input, toolkit: toolkit! })).rejects.toThrowError(/never overwrites/);
    const skipped = await optimizeGlbFile({ input, output: join(dir, "out", "dense.keep.glb"), maxVerts: 1500, simplify: false, toolkit: toolkit! });
    expect(skipped.simplified).toBe(false);
    expect(skipped.vertsAfter).toBe(skipped.vertsBefore);
  });

  needsToolkit("merge-clips copies clips onto a base rig by node name and rejects a foreign skeleton", async () => {
    const io = new toolkit!.NodeIO();
    const makeRig = (names: string[], clip?: { name: string; node: string; length: number }) => {
      const doc = new toolkit!.Document();
      const buffer = doc.createBuffer();
      const nodes = names.map((name) => doc.createNode(name));
      const scene = doc.createScene("s");
      for (const node of nodes) scene.addChild(node);
      if (clip) {
        const target = nodes.find((node) => node.getName() === clip.node)!;
        const input = doc.createAccessor().setType("SCALAR").setArray(new Float32Array([0, clip.length])).setBuffer(buffer);
        const output = doc.createAccessor().setType("VEC3").setArray(new Float32Array([0, 0, 0, 0, 1, 0])).setBuffer(buffer);
        const sampler = doc.createAnimationSampler().setInput(input).setOutput(output);
        doc.createAnimation(clip.name).addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath("translation").setSampler(sampler));
      }
      return doc;
    };
    await io.write(join(dir, "base.glb"), makeRig(["hip", "spine"], { name: "rest", node: "hip", length: 0.1 }));
    await io.write(join(dir, "run.glb"), makeRig(["hip", "spine"], { name: "x", node: "hip", length: 0.8 }));
    await io.write(join(dir, "idle.glb"), makeRig(["hip", "spine"], { name: "y", node: "spine", length: 2 }));
    await io.write(join(dir, "foreign.glb"), makeRig(["ghost"], { name: "z", node: "ghost", length: 1 }));
    const out = join(dir, "merged.glb");
    const result = await mergeGlbClips({ base: join(dir, "base.glb"), output: out, clips: [parseClipSpec(`run=${join(dir, "run.glb")}`), parseClipSpec(`idle=${join(dir, "idle.glb")}`)], toolkit: toolkit! });
    expect(result.animations.sort()).toEqual(["idle", "run"]);
    expect(result.clips.find((clip) => clip.name === "run")).toMatchObject({ channels: 1, sourceChannels: 1, missingNodes: 0 });
    expect(result.clips.find((clip) => clip.name === "idle")?.duration).toBeCloseTo(2, 5);
    const reread = await io.read(out);
    expect(reread.getRoot().listAnimations().map((a) => a.getName()).sort()).toEqual(["idle", "run"]);
    await expect(mergeGlbClips({ base: join(dir, "base.glb"), output: join(dir, "bad.glb"), clips: [parseClipSpec(`walk=${join(dir, "foreign.glb")}`)], toolkit: toolkit! })).rejects.toThrowError(/different skeleton/);
    const kept = await mergeGlbClips({ base: join(dir, "base.glb"), output: join(dir, "kept.glb"), clips: [parseClipSpec(`run=${join(dir, "run.glb")}`)], keepBaseAnimations: true, toolkit: toolkit! });
    expect(kept.animations.sort()).toEqual(["rest", "run"]);
  });

  test("clip specs validate their shape", () => {
    expect(parseClipSpec("run=a.glb")).toEqual({ name: "run", file: "a.glb" });
    expect(() => parseClipSpec("run")).toThrowError(/name=file/);
    expect(() => parseClipSpec("1run=a.glb")).toThrowError(/must start with a letter/);
    expect(() => parseClipSpec("=a.glb")).toThrowError(/name=file/);
  });
});
