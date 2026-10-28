// Beat-three.js WP-S.1 / WP-S.2 (contract 3.3, decision 5, target D3): no builder accepts an option and ignores it.
//
// Three layers, all driven by the coverage metadata in `compiler/optionCoverage.ts` (so a new option cannot ship uncovered):
//  1. Documented options: every option key in a `docs/api/*.md` or `docs/agents/recipes.md` code block that calls a
//     covered builder has a coverage row, and that row is not on the diagnostic-only (declared-but-not-consumed) list.
//  2. Guard: every covered primitive / instance / interaction option is accepted, reaches the node, and an option the
//  2. Guard: every covered primitive / instance / interaction option is read, and an option the builder does not
//     read is reported on the node (`OPTION_IGNORED ... Valid options: ...`) and surfaced by the compiler as an
//     `option-ignored` degradation, not thrown, so an existing app that passes a stray key keeps mounting.
//  3. Spot checks for the two silent no-ops found in the 4.1.2 benchmark: plane segments subdivide, `orbit` is typed
//     and its point / position / autoRotate configure the orbit camera on every camera path.
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
import { compileScene } from "@aura3d/engine/contracts";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { resolveCameraFrame } from "../../../packages/engine/src/agent-api/compiler/camera";
import { createFromSpecRig } from "../../../packages/engine/src/agent-api/camera/rigs/fromSpec";
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

  it("every covered option is read: the node carries no ignored-option note", () => {
    const noted: string[] = [];
    for (const row of guarded) {
      const node = invoke(row, { [row.field]: row.probeValueA }).toJSON() as { ignoredOptions?: readonly string[] };
      if (node.ignoredOptions) noted.push(`${row.builder}.${row.field}: ${node.ignoredOptions.join(" | ")}`);
    }
    expect(noted).toEqual([]);
  });

  it("an option the builder does not read is reported (not thrown) with the valid keys", () => {
    for (const builder of new Set(guarded.map((row) => row.builder))) {
      const row = guarded.find((candidate) => candidate.builder === builder)!;
      const node = invoke(row, { notAnOption: 1 }).toJSON() as { ignoredOptions?: readonly string[] };
      expect(node.ignoredOptions, `${builder} must report an unknown option`).toHaveLength(1);
      expect(node.ignoredOptions![0]).toMatch(/^OPTION_IGNORED /);
      expect(node.ignoredOptions![0]).toContain('"notAnOption"');
      expect(node.ignoredOptions![0]).toContain(`Valid options: `);
      expect(node.ignoredOptions![0]).toContain(row.field);
    }
  });

  it("the compiler turns the note into an option-ignored degradation instead of failing the mount", async () => {
    const degraded: { code: string; message: string }[] = [];
    const node = primitives.plane({ segments: 8 } as never);
    const snapshot = scene().add(node).toJSON();
    const compiled = await compileScene(snapshot, {
      renderer: undefined, assets: undefined, quality: { tier: "high" } as never, strict: false,
      flags: resolveQrFlags({ options: ["compiler"] }), degrade: (entry: { code: string; message: string }) => { degraded.push(entry); },
      canvas: { width: 800, height: 600 } as unknown as HTMLCanvasElement,
      environmentLighting: () => ({}), collectedLights: [], runtimeWarnings: new Set<string>()
    } as never);
    expect(compiled).toBeTruthy();
    expect(degraded).toHaveLength(1);
    expect(degraded[0]).toMatchObject({ code: "option-ignored" });
    expect(degraded[0]!.message).toMatch(/^OPTION_IGNORED primitives\.plane: option "segments" is not read[\s\S]*Valid options: name, position/);
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
  });

  it("orbit takes a node name or a world point through typed overloads", () => {
    expect(interactions.orbit().toJSON()).toMatchObject({ kind: "interaction", mode: "orbit" });
    expect(interactions.orbit({ target: "cube" }).toJSON()).toMatchObject({ target: "cube" });
    expect(interactions.orbit("cube").toJSON()).toMatchObject({ target: "cube" });
    expect(interactions.orbit([0, 1, 0]).toJSON()).toMatchObject({ targetPoint: [0, 1, 0] });
    expect(interactions.orbit({ target: [0, 1, 0], position: [1, 2, 3], autoRotate: true }).toJSON()).toMatchObject({
      targetPoint: [0, 1, 0], orbitPosition: [1, 2, 3], autoRotate: 0.5
    });
    expect((interactions.orbit({ target: "cube" }).toJSON() as { ignoredOptions?: unknown }).ignoredOptions).toBeUndefined();
    // Unknown keys are reported, not dropped.
    expect((interactions.orbit({ speed: 2 } as never).toJSON() as { ignoredOptions?: string[] }).ignoredOptions?.[0]).toMatch(/"speed"[\s\S]*Valid options: target, position, autoRotate/);
  });

  describe("interactions.orbit configures the orbit camera", () => {
    const base = camera.orbit({ target: [0, 0.8, 0], position: [3, 2, 3], distance: 4 });
    const frameOf = (spec: ReturnType<typeof camera.orbit>, nodes: unknown[], timeMs = 0) => {
      const builder = scene().camera(spec);
      for (const node of nodes) builder.add(node as never);
      const snapshot = builder.toJSON();
      return { spec: snapshot.camera, frame: resolveCameraFrame(snapshot, snapshot.camera, timeMs) };
    };

    it("a world point becomes the pivot and the eye keeps its offset", () => {
      const { frame } = frameOf(base, [interactions.orbit([1, 0, 2])]);
      expect(frame.target).toEqual([1, 0, 2]);
      expect(frame.eye).toEqual([4, 1.2, 5]);
    });

    it("position pins the eye", () => {
      const { frame } = frameOf(base, [interactions.orbit({ target: [1, 0, 2], position: [9, 9, 9] })]);
      expect(frame.target).toEqual([1, 0, 2]);
      expect(frame.eye).toEqual([9, 9, 9]);
    });

    it("autoRotate turns the eye around the pivot at radians per second, keeping its radius and height", () => {
      const rotating = [interactions.orbit({ autoRotate: Math.PI / 2 })];
      const start = frameOf(base, rotating, 0).frame;
      const quarter = frameOf(base, rotating, 1000).frame;
      const radius = (eye: readonly number[], target: readonly number[]) => Math.hypot(eye[0]! - target[0]!, eye[2]! - target[2]!);
      expect(start.eye).toEqual([3, 2, 3]);
      expect(quarter.eye[0]).toBeCloseTo(3, 6);
      expect(quarter.eye[2]).toBeCloseTo(-3, 6);
      expect(quarter.eye[1]).toBe(2);
      expect(radius(quarter.eye, quarter.target)).toBeCloseTo(radius(start.eye, start.target), 6);
    });

    it("the camera rig path produces the same pose as resolveCameraFrame", () => {
      const { spec, frame } = frameOf(base, [interactions.orbit({ target: [1, 0, 2], autoRotate: 1 })], 2500);
      const rig = createFromSpecRig(spec as never);
      expect(rig.continuous).toBe(true);
      const pose = rig.update({ time: 2500, subject: () => undefined } as never);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(pose.position[axis]).toBeCloseTo(frame.eye[axis]!, 9);
        expect(pose.target[axis]).toBeCloseTo(frame.target[axis]!, 9);
      }
    });

    it("leaves non-orbit cameras and scenes without an orbit interaction untouched", () => {
      const perspective = camera.perspective({ position: [0, 1, 4], target: [0, 1, 0] });
      expect(frameOf(perspective as never, [interactions.orbit([5, 5, 5])]).spec).toBe(perspective);
      expect(frameOf(base, [interactions.orbit("cube")]).spec).toBe(base);
    });
  });
});
