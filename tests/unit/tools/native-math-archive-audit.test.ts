import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { inspectMathArchive, type ArchiveEntry, type MathArchiveKind } from "../../../tools/native-math-archive-audit/index.js";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const bytes = (value: string) => Buffer.from(value, "utf8");
const rules = [
  { name: "OBB", target: "OrientedBox", exports: "OBB" },
  { name: "ConvexHull", target: "ConvexHull", exports: "ConvexHull, ConvexHullFace, HalfEdge, VertexNode, VertexList" },
  { name: "ShapeUtils", target: "PolygonTriangulation", exports: "earcut, shapeArea, isClockWise, triangulateShape, ShapeUtils" }
] as const;

function fixture(kind: MathArchiveKind, withMutable = false) {
  const root = kind === "engine" ? "package/dist/math" : "package/dist";
  const entries: ArchiveEntry[] = [];
  const sourceDigests: Record<string, string> = {};
  const put = (path: string, value: string) => {
    const old = entries.findIndex((entry) => entry.path === path);
    if (old >= 0) entries.splice(old, 1);
    entries.push({ path, bytes: bytes(value) });
  };
  const mapped = (path: string, sourcePath: string, source: string, emitted: string, embedded = true) => {
    sourceDigests[sourcePath] = sha(source);
    put(path, emitted);
    put(`${path}.map`, JSON.stringify({ version: 3, file: path.split("/").at(-1), sources: [`../../../../${sourcePath}`],
      ...(embedded ? { sourcesContent: [source] } : {}), names: [], mappings: "AAAA" }));
  };
  put("package/package.json", JSON.stringify({ name: kind === "engine" ? "@aura3d/engine" : "@aura3d/math" }));
  put("package/LICENSE", "A synthetic notice, retained independently of any implementation.");
  for (const rule of rules) {
    const wrapper = `export { ${rule.exports} } from "./independent/${rule.target}.js";\n`;
    const replacement = `export const ${rule.target} = 1;\n`;
    for (const ext of ["js", "d.ts"]) {
      mapped(`${root}/${rule.name}.${ext}`, `packages/math/src/${rule.name}.ts`, wrapper, wrapper);
      mapped(`${root}/independent/${rule.target}.${ext}`, `packages/math/src/independent/${rule.target}.ts`, replacement, replacement);
    }
  }
  if (withMutable) {
    const wrapper = 'export { Vector2 } from "../independent/mutable/index.js";\n';
    const replacement = "export class Vector2 {}\n";
    for (const ext of ["js", "d.ts"]) {
      mapped(`${root}/three/index.${ext}`, "packages/math/src/three/index.ts", wrapper, wrapper);
      mapped(`${root}/independent/mutable/index.${ext}`, "packages/math/src/independent/mutable/index.ts", replacement, replacement);
    }
  }
  return { root, entries, sourceDigests, put, mapped };
}

describe("candidate math archive structural inspection", () => {
  it.each(["engine", "math"] as const)("accepts a synthetic %s archive while leaving authorship unestablished", (kind) => {
    const { entries, sourceDigests, root } = fixture(kind, true);
    const report = inspectMathArchive({ kind, entries, sourceDigests });
    expect(report.issues).toEqual([]);
    expect(report.packageName).toBe(kind === "engine" ? "@aura3d/engine" : "@aura3d/math");
    expect(report.independence).toBe("not-established");
    expect(report.notices.map((item) => item.path)).toEqual(["package/LICENSE"]);
    expect(report.mutablePaths).toEqual([`${root}/three/index.d.ts`, `${root}/three/index.js`]);
    expect(report.files.find((item) => item.path === `${root}/OBB.js`)?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each(["engine", "math"] as const)("rejects stale public and mutable bodies in a synthetic %s archive", (kind) => {
    const f = fixture(kind, true);
    f.put(`${f.root}/OBB.js`, "export class OBB { oldBody() {} }\n");
    f.put(`${f.root}/ShapeUtils.d.ts`, "export declare function oldBody(): void;\n");
    f.put(`${f.root}/three/index.js`, "export class Vector2 {}\n");
    const report = inspectMathArchive({ kind, entries: f.entries, sourceDigests: f.sourceDigests });
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "RETIRED_PUBLIC_BODY", path: `${f.root}/OBB.js` }),
      expect.objectContaining({ code: "RETIRED_PUBLIC_BODY", path: `${f.root}/ShapeUtils.d.ts` }),
      expect.objectContaining({ code: "RETIRED_MUTABLE_BODY", path: `${f.root}/three/index.js` })
    ]));
  });

  it("rejects empty, wrong-target, type-only and incomplete public wrappers", () => {
    const f = fixture("engine");
    f.put(`${f.root}/OBB.js`, 'export {} from "./independent/OrientedBox.js";');
    f.put(`${f.root}/OBB.d.ts`, 'export type { OBB } from "./independent/OrientedBox.js";');
    f.put(`${f.root}/ConvexHull.js`, 'export { ConvexHull } from "./independent/ConvexHull.js";');
    f.put(`${f.root}/ShapeUtils.js`, 'export * from "./independent/Other.js";');
    const report = inspectMathArchive({ kind: "engine", entries: f.entries, sourceDigests: f.sourceDigests });
    expect(report.issues.filter(({ code }) => code === "RETIRED_PUBLIC_BODY")).toHaveLength(4);
  });

  it("detects stale or orphaned maps and verifies embedded sources against staged hashes", () => {
    const f = fixture("math");
    const old = { version: 3, file: "OBB.js", sources: ["../../../../packages/math/src/OBB.ts"],
      sourcesContent: ["synthetic retired content"], names: [], mappings: "AAAA;AAAA;AAAA;AAAA;AAAA" };
    f.put(`${f.root}/OBB.js.map`, JSON.stringify(old));
    f.put(`${f.root}/orphan.js.map`, JSON.stringify(old));
    f.put(`${f.root}/ConvexHull.js.map`, "not-json");
    f.put(`${f.root}/ShapeUtils.js.map`, JSON.stringify({ ...old, file: "ShapeUtils.js", sources: ["unknown.ts"] }));
    const report = inspectMathArchive({ kind: "math", entries: f.entries, sourceDigests: f.sourceDigests });
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "STALE_MAP_SOURCE", path: `${f.root}/OBB.js.map` }),
      expect.objectContaining({ code: "STALE_MAP", path: `${f.root}/OBB.js.map` }),
      expect.objectContaining({ code: "ORPHAN_MAP", path: `${f.root}/orphan.js.map` }),
      expect.objectContaining({ code: "INVALID_MAP", path: `${f.root}/ConvexHull.js.map` }),
      expect.objectContaining({ code: "UNBOUND_MAP_SOURCE", path: `${f.root}/ShapeUtils.js.map` })
    ]));
  });

  it("inspects synthetic retired markers in renamed files and decoded inline source maps", () => {
    const f = fixture("engine");
    const marker = "synthetic-retired-body-marker";
    f.put("package/dist/other/copied.cjs", `const copied = "${marker}";`);
    const inline = JSON.stringify({ version: 3, file: "extra.js", sources: ["../../../../packages/math/src/OBB.ts"],
      sourcesContent: [marker], names: [], mappings: "AAAA" });
    f.put(`${f.root}/extra.js`, `export {};\n//# sourceMappingURL=data:application/json;base64,${bytes(inline).toString("base64")}\n`);
    const report = inspectMathArchive({ kind: "engine", entries: f.entries, sourceDigests: f.sourceDigests,
      retiredMarkers: [{ id: "synthetic", bytes: bytes(marker) }] });
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "RETIRED_MARKER", path: "package/dist/other/copied.cjs", detail: "synthetic" }),
      expect.objectContaining({ code: "RETIRED_MARKER", path: `${f.root}/extra.js#inline-0`, detail: "synthetic" }),
      expect.objectContaining({ code: "STALE_MAP_SOURCE", path: `${f.root}/extra.js#inline-0` })
    ]));
  });

  it("reports maps without embedded sources instead of claiming their bytes were verified", () => {
    const f = fixture("math");
    const source = 'export { OBB } from "./independent/OrientedBox.js";\n';
    f.mapped(`${f.root}/OBB.js`, "packages/math/src/OBB.ts", source, source, false);
    const report = inspectMathArchive({ kind: "math", entries: f.entries, sourceDigests: f.sourceDigests });
    expect(report.issues).toEqual([]);
    expect(report.mapsWithoutEmbeddedSources).toContain(`${f.root}/OBB.js.map#0`);
    expect(report.limitations.join(" ")).toContain("cannot prove the original source bytes");
  });

  it("fails closed for missing targets, maps, duplicate paths and invalid markers", () => {
    const f = fixture("engine");
    const entries = f.entries.filter((entry) => ![`${f.root}/independent/OrientedBox.js`, `${f.root}/OBB.d.ts.map`].includes(entry.path));
    const report = inspectMathArchive({ kind: "engine", entries, sourceDigests: f.sourceDigests });
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MISSING_REPLACEMENT", path: `${f.root}/independent/OrientedBox.js` }),
      expect.objectContaining({ code: "MISSING_MAP", path: `${f.root}/OBB.d.ts.map` })
    ]));
    expect(() => inspectMathArchive({ kind: "engine", entries: [...entries, entries[0]!], sourceDigests: f.sourceDigests })).toThrow(/duplicate/);
    expect(() => inspectMathArchive({ kind: "engine", entries, sourceDigests: f.sourceDigests,
      retiredMarkers: [{ id: "bad", bytes: new Uint8Array() }] })).toThrow(/nonempty/);
  });
});
