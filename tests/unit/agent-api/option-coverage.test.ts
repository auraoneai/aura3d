// Beat-three.js WP-S.1 / WP-S.2 (contract 3.3, decision 5, target D3): no builder accepts an option and ignores it.
//
// Three layers, all driven by the coverage metadata in `compiler/optionCoverage.ts` (so a new option cannot ship uncovered):
//  1. Documented options: every option key in a `docs/api/*.md` or `docs/agents/recipes.md` code block that calls a
//     covered builder has a coverage row, and that row is not on the diagnostic-only (declared-but-not-consumed) list.
//  2. Guard: every covered primitive / instance / interaction option is accepted, reaches the node, and an option the
//     builder does not read raises `OPTION_IGNORED` naming the valid keys.
//  3. Spot checks for the two silent no-ops found in the 4.1.2 benchmark: plane segments subdivide, `orbit` is typed.
//
// The compile-level proof that each covered option changes the compiled scene is `tests/qr/prd15/compiler/optionCoverage.test.ts`.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "@aura3d/engine/lanes"; // registers every lane's coverage rows and diagnostic-only entries
import "../../../packages/engine/src/agent-api/compiler/optionCoverage"; // the scaffolded + hand-written rows register on import
import { DIAGNOSTIC_ONLY_FIELDS, optionCoverageRows } from "../../../packages/engine/src/contracts/compiler";
import type { OptionCoverageRow } from "../../../packages/engine/src/contracts/compiler";
import { primitives, primitive } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { instances } from "../../../packages/engine/src/agent-api/nodes/instances";
import { interactions } from "../../../packages/engine/src/agent-api/nodes/interactions";
import { qrPrimitiveGeometryOptions } from "../../../packages/engine/src/agent-api/compiler/geometry";
import { qrPrimitiveMeshFor } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { AuraPrimitiveNode } from "../../../packages/engine/src/agent-api/nodes/types";

const root = process.cwd();
const rows: readonly OptionCoverageRow[] = optionCoverageRows();
const rowKeys = new Set(rows.map((row) => `${row.builder}.${row.field}`));
const builderNames = new Set(rows.map((row) => row.builder));

/* --------------------------- docs code-block scan --------------------------- */

const docFiles = [
  ...readdirSync(join(root, "docs/api")).filter((name) => name.endsWith(".md")).map((name) => join(root, "docs/api", name)),
  join(root, "docs/agents/recipes.md")
];

function codeBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const fence = /```(?:ts|typescript|tsx|js|javascript)\n([\s\S]*?)```/g;
  for (let match = fence.exec(markdown); match; match = fence.exec(markdown)) blocks.push(match[1]!);
  return blocks;
}

/** Top-level keys of the object literal whose `{` is at `open` (string, comment and nesting aware). */
function topLevelKeys(source: string, open: number): string[] {
  const keys: string[] = [];
  let depth = 0;
  let expectKey = false;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i]!;
    if (char === "'" || char === '"' || char === "`") {
      const quote = char;
      const start = i;
      i += 1;
      while (i < source.length && source[i] !== quote) { if (source[i] === "\\") i += 1; i += 1; }
      if (depth === 1 && expectKey && /^\s*:/.test(source.slice(i + 1, i + 6))) keys.push(source.slice(start + 1, i));
      if (depth === 1) expectKey = false;
      continue;
    }
    if (char === "/" && source[i + 1] === "/") { while (i < source.length && source[i] !== "\n") i += 1; continue; }
    if (char === "{" || char === "[" || char === "(") { depth += 1; if (depth === 1) expectKey = true; continue; }
    if (char === "}" || char === "]" || char === ")") { depth -= 1; if (depth === 0) break; continue; }
    if (depth !== 1) continue;
    if (char === ",") { expectKey = true; continue; }
    if (!expectKey) continue;
    const identifier = /^(\.\.\.)?([A-Za-z_$][\w$]*)\s*(:|,|\}|\()?/.exec(source.slice(i));
    if (identifier) {
      if (!identifier[1]) keys.push(identifier[2]!);
      i += identifier[0].length - 1 - (identifier[3] === "," || identifier[3] === "}" || identifier[3] === "(" ? 1 : 0);
      expectKey = false;
    } else if (!/\s/.test(char)) {
      expectKey = false;
    }
  }
  return keys;
}

/** `callee -> option keys` for every covered builder called with an options object in the docs. */
function documentedOptions(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  const call = /\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\(\s*(?:[^(){}]*?,\s*)?\{/g;
  for (const file of docFiles) {
    for (const block of codeBlocks(readFileSync(file, "utf8"))) {
      call.lastIndex = 0;
      for (let match = call.exec(block); match; match = call.exec(block)) {
        const callee = match[1]!;
        if (!builderNames.has(callee)) continue;
        const keys = found.get(callee) ?? new Set<string>();
        for (const key of topLevelKeys(block, block.indexOf("{", match.index + callee.length))) keys.add(key);
        found.set(callee, keys);
      }
    }
  }
  return found;
}

const isDiagnosticOnly = (row: OptionCoverageRow): boolean => {
  const key = `${row.builder}.${row.field}`;
  return Object.keys(DIAGNOSTIC_ONLY_FIELDS).some((entry) =>
    entry === key || entry === `${row.builder}.*` || entry === `*.${row.field}` ||
    (entry.startsWith("transform.") && entry.slice("transform.".length) === row.field)
  );
};

describe("documented options are honoured (contract 3.3)", () => {
  const documented = documentedOptions();

  it("finds documented option objects for the builders the docs teach", () => {
    expect(documented.size).toBeGreaterThanOrEqual(8);
    expect(documented.has("primitives.box")).toBe(true);
    expect(documented.has("instances.cylinder")).toBe(true);
  });

  it("every documented option has a coverage row", () => {
    const missing: string[] = [];
    for (const [callee, keys] of documented) for (const key of keys) if (!rowKeys.has(`${callee}.${key}`)) missing.push(`${callee}.${key}`);
    expect(missing, "documented options with no option-coverage row").toEqual([]);
  });

  it("no documented option is declared-but-not-consumed", () => {
    const unconsumed: string[] = [];
    for (const [callee, keys] of documented) {
      for (const key of keys) {
        const row = rows.find((candidate) => candidate.builder === callee && candidate.field === key);
        if (row && isDiagnosticOnly(row)) unconsumed.push(`${callee}.${key}`);
      }
    }
    expect(unconsumed, "documented options the compiler does not consume").toEqual([]);
  });
});

/* ------------------------------ builder guard ------------------------------ */

const TRANSFORMS = [{ position: [0, 0, 0] as const }];
const guarded = rows.filter((row) =>
  /^primitives\./.test(row.builder) || row.builder === "primitive" || /^instances\.(box|sphere|plane|cylinder|capsule|torus)$/.test(row.builder) || /^interactions\./.test(row.builder)
);

function resolve(builder: string): (...args: unknown[]) => { toJSON(): Record<string, unknown> } {
  const [head, name] = builder.split(".");
  const table: Record<string, Record<string, unknown>> = { primitives, instances, interactions } as never;
  const target = name === undefined ? (builder === "primitive" ? primitive : undefined) : table[head!]?.[name];
  if (typeof target !== "function") throw new Error(`builder ${builder} did not resolve`);
  return target as never;
}

function invoke(row: OptionCoverageRow, options: Record<string, unknown>) {
  const defaults = /^instances\./.test(row.builder) ? { transforms: TRANSFORMS } : {};
  const before = row.builder === "primitive" ? ["box"] : [];
  return resolve(row.builder)(...before, { ...defaults, ...options });
}

describe("builders accept every covered option and reject the rest (decision 5)", () => {
  it("has guarded rows for primitives, instances and interactions", () => {
    expect(new Set(guarded.map((row) => row.builder.split(".")[0])).size).toBe(4);
    expect(guarded.length).toBeGreaterThan(150);
  });

  it("every covered option is accepted", () => {
    const rejected: string[] = [];
    for (const row of guarded) {
      try { invoke(row, { [row.field]: row.probeValueA }); } catch (error) { rejected.push(`${row.builder}.${row.field}: ${(error as Error).message}`); }
    }
    expect(rejected).toEqual([]);
  });

  it("an option the builder does not read raises OPTION_IGNORED naming the valid keys", () => {
    for (const builder of new Set(guarded.map((row) => row.builder))) {
      const row = guarded.find((candidate) => candidate.builder === builder)!;
      let thrown: { code?: string; message: string } | undefined;
      try { invoke(row, { notAnOption: 1 }); } catch (error) { thrown = error as { code?: string; message: string }; }
      expect(thrown?.code, `${builder} must reject an unknown option`).toBe("OPTION_IGNORED");
      expect(thrown?.message).toContain('"notAnOption"');
      expect(thrown?.message).toContain(row.field);
    }
  });

  it("primitive transform extras and params reach the node (they used to be dropped)", () => {
    const node = primitives.box({
      renderOrder: 3, frustumCulled: false, layers: 2, userData: { tag: "x" }, rotationOrder: "XYZ", quaternion: [0, 0, 0, 1], params: { widthSegments: 4 }
    }).toJSON() as unknown as Record<string, unknown>;
    expect(node).toMatchObject({
      renderOrder: 3, frustumCulled: false, layers: 2, userData: { tag: "x" }, rotationOrder: "XYZ", quaternion: [0, 0, 0, 1], params: { widthSegments: 4 }
    });
  });
});

/* -------------------- the two 4.1.2 silent no-ops (WP-S.2) ------------------- */

describe("WP-S.2 spot checks", () => {
  const options = qrPrimitiveGeometryOptions(resolveQrFlags({}), undefined, {});
  const planeVertices = (params?: Record<string, number>): number => {
    const node = primitives.plane(params ? { params } : {}).toJSON() as unknown as AuraPrimitiveNode;
    return qrPrimitiveMeshFor(node, options)!.positions.length / 3;
  };

  it("plane widthSegments / heightSegments subdivide the mesh", () => {
    expect(planeVertices()).toBe(4);
    expect(planeVertices({ widthSegments: 8, heightSegments: 4 })).toBe((8 + 1) * (4 + 1));
    expect(planeVertices({ widthSegments: 2 })).toBe((2 + 1) * (1 + 1));
  });

  it("plane rejects a shape key that has no effect, naming the supported params", () => {
    expect(() => primitives.plane({ params: { radius: 2 } as never })).toThrow(/Supported params: widthSegments, heightSegments/);
    expect(() => primitives.plane({ segments: 8 } as never)).toThrow(/OPTION_IGNORED|"segments"/);
  });

  it("orbit takes a node name through typed overloads and rejects what it ignores", () => {
    expect(interactions.orbit().toJSON()).toMatchObject({ kind: "interaction", mode: "orbit" });
    expect(interactions.orbit({ target: "cube" }).toJSON()).toMatchObject({ target: "cube" });
    expect(interactions.orbit("cube").toJSON()).toMatchObject({ target: "cube" });
    // @ts-expect-error `position` / `autoRotate` are camera options; orbit used to need `as never` and then ignore them.
    expect(() => interactions.orbit({ position: [1, 2, 3], autoRotate: true })).toThrow(/"position", "autoRotate" are not read[\s\S]*Valid options: target/);
    // @ts-expect-error a world point belongs on camera.orbit({ target }).
    expect(() => interactions.orbit([0, 1, 0])).toThrow(/camera\.orbit/);
  });
});
