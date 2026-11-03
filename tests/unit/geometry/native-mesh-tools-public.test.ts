import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildUVAtlas,
  createMeshSurfaceSampler,
  interleaveAuraAttributes,
  MeshSurfaceSampler,
  remapAuraGeometryVertices,
  tessellateAuraMesh
} from "@aura3d/engine/geometry-tools";

const triangle = () => ({
  kind: "aura-custom-geometry" as const,
  positions: [0, 0, 0, 2, 0, 0, 0, 2, 0],
  indices: [0, 1, 2]
});

describe("public opt-in geometry tools", () => {
  it("exposes the atlas generator through the public geometry-tools entrypoint", () => {
    const atlas = buildUVAtlas(triangle(), { destination: "uvs", width: 64, height: 64, texelDensity: 8, gutter: 2 });
    expect(atlas.geometry.uvs).toBeDefined();
    expect(atlas.charts).toHaveLength(1);
  });

  it("exposes useful mesh operations without altering their source geometry", () => {
    const source = triangle();
    const remapped = remapAuraGeometryVertices(source, [2, 1, 0], [2, 1, 0]);
    expect(Array.from(remapped.positions)).toEqual([0, 2, 0, 2, 0, 0, 0, 0, 0]);
    expect(source.positions).toEqual([0, 0, 0, 2, 0, 0, 0, 2, 0]);
    expect(tessellateAuraMesh(source, { maxEdgeLength: 1.5, maxTriangles: 32 }).stats.outputTriangles).toBeGreaterThan(1);
    expect(interleaveAuraAttributes({ heat: { itemSize: 1, data: [1, 2, 3] } }).vertexCount).toBe(3);
  });

  it("provides a deterministic sampler through the public subpath", () => {
    const a = createMeshSurfaceSampler(triangle(), { seed: 17 }).sampleMany(4);
    const b = createMeshSurfaceSampler(triangle(), { seed: 17 }).sampleMany(4);
    expect(a).toEqual(b);
    expect(a[0]!.barycentric.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });

  it("interpolates and snapshots every supported morph channel", () => {
    const source = {
      ...triangle(),
      morphTargets: [{
        name: "bend",
        positions: [0, 0, 1, 0, 0, 2, 0, 0, 4],
        normals: [1, 0, 0, 0, 2, 0, 0, 0, 3],
        tangents: [4, 0, 0, 0, 5, 0, 0, 0, 6]
      }]
    };
    const sampler = new MeshSurfaceSampler(source, { seed: 31 });
    const sample = sampler.sample();
    const [a, b, c] = sample.barycentric;
    const morph = sample.morphTargets![0]!;
    expect(morph.name).toBe("bend");
    expect(morph.position[2]).toBeCloseTo(a + 2 * b + 4 * c);
    expect(morph.normal).toEqual([a, 2 * b, 3 * c]);
    expect(morph.tangent).toEqual([4 * a, 5 * b, 6 * c]);
    source.morphTargets[0]!.normals.fill(0);
    source.morphTargets[0]!.tangents.fill(0);
    sampler.reset();
    expect(sampler.sample()).toEqual(sample);
    expect(() => createMeshSurfaceSampler({
      ...triangle(), morphTargets: [{ positions: Array(9).fill(0), normals: [1, 2, 3] }]
    })).toThrow(/morph normals/i);
  });

  it("interpolates directional morphs using the selected indexed face", () => {
    const source = {
      kind: "aura-custom-geometry" as const,
      positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
      indices: [0, 1, 2, 3, 2, 0],
      groups: [{ start: 0, count: 3 }, { start: 3, count: 3 }],
      drawRange: { start: 3, count: 3 },
      morphTargets: [{
        positions: Array(12).fill(0),
        normals: [1, 0, 0, 2, 0, 0, 4, 0, 0, 8, 0, 0]
      }]
    };
    const samples = createMeshSurfaceSampler(source, { seed: 9, group: 1 }).sampleMany(4);
    for (const sample of samples) {
      expect(sample.faceIndex).toBe(1);
      const [a, b, c] = sample.barycentric;
      expect(sample.morphTargets![0]!.normal![0]).toBeCloseTo(8 * a + 4 * b + c);
      expect(sample.morphTargets![0]!.tangent).toBeUndefined();
    }
  });

  it("declares an opt-in package export", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.exports["./geometry-tools"]).toMatchObject({
      types: "./dist/engine/public/geometry-tools.d.ts",
      import: "./dist/engine/public/geometry-tools.js"
    });
  });

  it("keeps the source registry and generated resolution maps aligned", () => {
    const parse = (path: string) => JSON.parse(readFileSync(path, "utf8"));
    const registry = parse("aura.exports.json");
    const mirror = parse("packages/aura3d-cli/data/aura.exports.json");
    const specifier = "@aura3d/engine/geometry-tools";
    const source = "packages/engine/src/public/geometry-tools.ts";
    expect(registry.entries["./geometry-tools"]).toEqual({ source, conditions: true });
    expect(registry.paths).toContainEqual([specifier, source]);
    expect(mirror).toEqual(registry);
    for (const path of ["tsconfig.base.json", "tsconfig.paths.generated.json"]) {
      expect(parse(path).compilerOptions.paths[specifier]).toEqual([source]);
    }
    expect(readFileSync("vite.aliases.generated.ts", "utf8")).toContain(`["${specifier}", "./${source}"]`);
    const manifest = parse("tools/finalize-dist/manifest.generated.json");
    expect(manifest.specifiers).toContainEqual({ name: specifier, file: source });
    expect(manifest.subpaths).toContainEqual({
      name: "./geometry-tools",
      source,
      dist: "./dist/engine/public/geometry-tools.js",
      conditions: true
    });
  });
});
