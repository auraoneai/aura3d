import { describe, expect, it } from "vitest";
import { createAuraRuntimeNodeRegistry, runtimeNodeQueryState } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { createAuraApp } from "../../../packages/engine/src/agent-api/app/createAuraApp.js";
import { lineNodeHandler } from "../../../packages/engine/src/agent-api/compiler/lines.js";
import { realCompilerImpl, type MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene.js";
import { flattenNodesWithLineWorldMatrices, flattenSceneNodesV2 } from "../../../packages/engine/src/agent-api/compiler/sceneGraph.js";
import { flattenTaggingMountedRoots, mountedRootOf } from "../../../packages/engine/src/agent-api/compiler/mountedRoots.js";
import { flattenSceneNodes } from "../../../packages/engine/src/agent-api/sceneMath.js";
import { lines } from "../../../packages/engine/src/agent-api/nodes/lines.js";
import { group } from "../../../packages/engine/src/agent-api/nodes/groups.js";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";
import { bindRuntimeCompiled } from "../../../packages/engine/src/contracts/compiler.js";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice.js";
import type { Material } from "../../../packages/rendering/src/Material.js";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem.js";
import type { RenderSource } from "../../../packages/rendering/src/contracts/renderSource.js";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types.js";
import type { SceneCompileContext } from "../../../packages/engine/src/contracts/compiler.js";

const context = {
  canvas: { width: 800, height: 400, clientWidth: 800 },
  flags: resolveQrFlags({ options: "A3D_PARITY_LINES" }),
  strict: false, quality: { tier: "high" }, renderer: null, assets: null,
  degrade: () => undefined
} as unknown as SceneCompileContext;
/** Narrow a flattened scene node to the line node the line handler compiles. */
function lineOf(node: { readonly kind: string } | undefined): { readonly kind: "line" } {
  if (node?.kind !== "line") throw new Error(`expected a flattened line node, got ${node?.kind ?? "nothing"}`);
  return node as { readonly kind: "line" };
}

const sink = () => {
  const items: RenderItem[] = [];
  return { items, addItems(next: readonly RenderItem[]) { items.push(...next); }, feature() {}, set() {}, addLights() {} };
};

describe("live line geometry and world transforms", () => {
  it("uses the full flattened world matrix for anonymous lines, including shear", () => {
    const node = lines.line({ points: [[0, 0, 0], [1, 0, 0]], position: [1, 0, 0], rotation: [0, 0, Math.PI / 4] }).toJSON();
    const group = { kind: "group", position: [3, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 1, 1], children: [node] };
    const flattened = lineOf(flattenSceneNodesV2([group as never])[0]);
    const out = sink();
    lineNodeHandler.compile(flattened!, context, out as never);
    lineNodeHandler.update!(flattened!, undefined, context, out as never, 0);
    const matrix = out.items[0]!.modelMatrix!;
    expect(matrix[0]).toBeCloseTo(-Math.SQRT1_2);
    expect(matrix[1]).toBeCloseTo(Math.SQRT2);
    expect(matrix[4]).toBeCloseTo(-Math.SQRT1_2);
    expect(matrix[5]).toBeCloseTo(-Math.SQRT2);
    expect(matrix[12]).toBeCloseTo(3);
    expect(matrix[13]).toBeCloseTo(2);
    lineNodeHandler.dispose!(flattened!);
  });

  it("keeps mounted-root tags and legacy non-line nodes when composing line matrices", () => {
    const node = lines.line({ points: [[0, 0, 0], [1, 0, 0]], position: [1, 0, 0] }).toJSON();
    const primitive = { kind: "primitive", primitive: "box", position: [1, 2, 3] };
    const group = { kind: "group", runtime: { id: "root" }, position: [3, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 1, 1], children: [primitive, node] };
    const expectedLegacy = flattenSceneNodes([group as never]);
    const flattened = flattenTaggingMountedRoots([group as never], flattenNodesWithLineWorldMatrices);
    expect(flattened[0]).toEqual(expectedLegacy[0]);
    expect(flattened.map(mountedRootOf)).toEqual(["root", "root"]);
    const out = sink();
    lineNodeHandler.compile(lineOf(flattened[1]), context, out as never);
    lineNodeHandler.update!(lineOf(flattened[1]), undefined, context, out as never, 0);
    expect(out.items[0]!.modelMatrix![12]).toBeCloseTo(3);
    expect(out.items[0]!.modelMatrix![13]).toBeCloseTo(2);
    lineNodeHandler.dispose!(lineOf(flattened[1]));
  });

  it("inherits visibility from entirely anonymous nested groups in both flatten modes", () => {
    const line = lines.line({ points: [[0, 0, 0], [1, 0, 0]] }).toJSON();
    const primitive = { kind: "primitive", primitive: "box" };
    const parent = { kind: "group", visible: false, children: [{ kind: "group", children: [line, primitive] }] };
    for (const flatten of [flattenNodesWithLineWorldMatrices, flattenSceneNodesV2]) {
      const [hiddenNode, unchanged] = flatten([parent as never]);
      expect(unchanged).toEqual(primitive);
      const hidden = lineOf(hiddenNode);
      const out = sink();
      lineNodeHandler.compile(hidden!, context, out as never);
      lineNodeHandler.update!(hidden!, undefined, context, out as never, 0);
      expect(out.items).toHaveLength(0);
      lineNodeHandler.dispose!(hidden!);
    }
  });

  it("populates an initially empty line through a handle, updates color and position, and releases growth buffers", () => {
    const node = lines.segments({ positions: [], runtime: { id: "dynamic" } }).toJSON();
    const registry = createAuraRuntimeNodeRegistry({ nodes: [node] } as unknown as AuraSceneSnapshot);
    const handle = registry.require("dynamic");
    const first = sink();
    lineNodeHandler.compile(node, context, first as never);
    lineNodeHandler.update!(node, handle, context, first as never, 0);
    expect(first.items).toHaveLength(0);

    handle.setGeometry!({ positions: [0, 0, 0, 1, 0, 0] });
    const populated = sink();
    lineNodeHandler.update!(node, handle, context, populated as never, 0);
    const item = populated.items[0]!;
    const geometry = item.geometry;
    const device = new MockRenderDevice();
    const oldBuffer = geometry.vertexBuffer.upload(device);
    expect(geometry.vertexBuffer.getAttribute(1, "position")).toEqual([1, 0, 0]);
    expect(geometry.drawRange?.count).toBe(2);

    handle.updateAttribute!("position", { offset: 1, array: [3, 0, 0] });
    const moved = sink();
    lineNodeHandler.update!(node, handle, context, moved as never, 0);
    expect(moved.items[0]!.geometry).toBe(geometry);
    expect(geometry.vertexBuffer.upload(device)).toBe(oldBuffer);
    expect(geometry.bounds.max).toEqual([3, 0, 0]);

    // A geometry replacement with no color stream still has white vertex
    // colors; writing a color afterward must create/update that stream.
    handle.updateAttribute!("color", { offset: 1, array: [1, 1, 1, .5] });
    const colored = sink();
    lineNodeHandler.update!(node, handle, context, colored as never, 0);
    expect(geometry.vertexBuffer.getAttribute(1, "color")).toEqual([1, 1, 1, .5]);
    expect((colored.items[0]!.material as Material).renderState.blend).toBe(true);

    handle.setGeometry!({ positions: [0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0], colors: new Float32Array([1, 0, 0, .5, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1]) });
    const grown = sink();
    lineNodeHandler.update!(node, handle, context, grown as never, 0);
    expect(geometry.vertexBuffer.getAttribute(0, "color")).toEqual([1, 0, 0, .5]);
    expect((grown.items[0]!.material as Material).renderState.blend).toBe(true);
    expect(oldBuffer.disposed).toBe(true);
    const replacement = geometry.vertexBuffer.upload(device);
    handle.updateAttribute!("color", { offset: 1, array: [1, 1, 0, .25] });
    const recolored = sink();
    lineNodeHandler.update!(node, handle, context, recolored as never, 0);
    expect(geometry.vertexBuffer.getAttribute(1, "color")).toEqual([1, 1, 0, .25]);
    expect(geometry.vertexBuffer.upload(device)).toBe(replacement);

    handle.setGeometry!({ positions: [] });
    const cleared = sink();
    lineNodeHandler.update!(node, handle, context, cleared as never, 0);
    expect(cleared.items).toHaveLength(0);
    expect(geometry.drawRange?.count).toBe(0);
    expect(replacement.disposed).toBe(false);
    handle.setGeometry!({ positions: [0, 0, 0, 1, 1, 0] });
    const repopulated = sink();
    lineNodeHandler.update!(node, handle, context, repopulated as never, 0);
    expect(repopulated.items[0]!.geometry).toBe(geometry);
    expect(geometry.vertexBuffer.upload(device)).toBe(replacement);
    lineNodeHandler.dispose!(node);
    expect(replacement.disposed).toBe(true);
    expect((recolored.items[0]!.material as Material).disposed).toBe(true);
    registry.dispose();
    device.dispose();
  });

  it("uses a live parent matrix for a rotated, nonuniformly scaled dashed line", () => {
    const node = lines.fat({ points: [[0, 0, 0], [1, 0, 0]], position: [1, 0, 0], runtime: { id: "line" }, width: .2, worldUnits: true, dashed: true, dashSize: 1, gapSize: 1 }).toJSON();
    const parent = { kind: "group", runtime: { id: "parent" }, position: [3, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 1, 1], children: [node] };
    const registry = createAuraRuntimeNodeRegistry({ nodes: [parent] } as unknown as AuraSceneSnapshot);
    const handle = registry.require("line");
    const out = sink();
    lineNodeHandler.compile(node, context, out as never);
    lineNodeHandler.update!(node, handle, context, out as never, 0);
    const item = out.items[0]!;
    const matrix = item.modelMatrix!;
    expect(matrix[12]).toBeCloseTo(3);
    expect(matrix[13]).toBeCloseTo(2);
    expect(matrix[0]).toBeCloseTo(0);
    expect(matrix[1]).toBeCloseTo(2);
    expect(item.geometry.vertexBuffer.getAttribute(2, "lineDistance")[0]).toBeCloseTo(2);

    registry.require("parent").setScale([4, 1, 1]);
    const next = sink();
    lineNodeHandler.update!(node, handle, context, next as never, 0);
    expect(next.items[0]!.modelMatrix![13]).toBeCloseTo(4);
    expect(item.geometry.vertexBuffer.getAttribute(2, "lineDistance")[0]).toBeCloseTo(4);
    lineNodeHandler.dispose!(node);
    registry.dispose();
  });

  it("retains anonymous ancestor transforms and inherits live parent visibility", () => {
    const node = lines.line({ points: [[0, 0, 0], [1, 0, 0]], position: [1, 0, 0], runtime: { id: "line" } }).toJSON();
    const anonymous = { kind: "group", position: [1, 0, 0], rotation: [0, 0, Math.PI / 2], children: [node] };
    const parent = { kind: "group", runtime: { id: "parent" }, position: [3, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 1, 1], children: [anonymous] };
    const registry = createAuraRuntimeNodeRegistry({ nodes: [parent] } as unknown as AuraSceneSnapshot);
    const handle = registry.require("line");
    lineNodeHandler.compile(node, context, sink() as never);
    const first = sink();
    lineNodeHandler.update!(node, handle, context, first as never, 0);
    expect(first.items[0]!.modelMatrix![12]).toBeCloseTo(2);
    expect(first.items[0]!.modelMatrix![13]).toBeCloseTo(2);
    registry.require("parent").setScale([4, 1, 1]);
    const moved = sink();
    lineNodeHandler.update!(node, handle, context, moved as never, 0);
    expect(moved.items[0]!.modelMatrix![12]).toBeCloseTo(2);
    expect(moved.items[0]!.modelMatrix![13]).toBeCloseTo(4);
    registry.require("parent").setVisible(false);
    const hidden = sink();
    lineNodeHandler.update!(node, handle, context, hidden as never, 0);
    expect(hidden.items).toHaveLength(0);
    registry.require("parent").setVisible(true);
    const shown = sink();
    lineNodeHandler.update!(node, handle, context, shown as never, 0);
    expect(shown.items).toHaveLength(1);
    lineNodeHandler.dispose!(node);
    registry.dispose();
  });

  it("attaches a dynamically added line to its moving registered parent", () => {
    const parent = { kind: "group", runtime: { id: "parent" }, position: [3, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 1, 1], children: [] };
    const registry = createAuraRuntimeNodeRegistry({ nodes: [parent] } as unknown as AuraSceneSnapshot, {
      flags: resolveQrFlags({ options: "A3D_QR_COMPILER" })
    });
    const additions: string[] = [];
    const compiled = {};
    bindRuntimeCompiled(compiled as never, {
      addSubtree(_node: unknown, parentId: string) { additions.push(parentId); },
      removeSubtree() { return true; }
    } as never);
    registry.attachCompiled(compiled as never);
    const node = lines.line({ points: [[0, 0, 0], [1, 0, 0]], position: [1, 0, 0], runtime: { id: "line" } }).toJSON();
    const handle = registry.add(node, { parent: "parent" });
    expect(additions).toEqual(["parent"]);
    lineNodeHandler.compile(node, context, sink() as never);
    const first = sink();
    lineNodeHandler.update!(node, handle, context, first as never, 0);
    expect(first.items[0]!.modelMatrix![12]).toBeCloseTo(3);
    expect(first.items[0]!.modelMatrix![13]).toBeCloseTo(2);
    registry.require("parent").setScale([4, 1, 1]);
    const moved = sink();
    lineNodeHandler.update!(node, handle, context, moved as never, 0);
    expect(moved.items[0]!.modelMatrix![13]).toBeCloseTo(4);
    expect(registry.remove("parent")).toBe(true);
    expect(registry.has("line")).toBe(false);
    expect(runtimeNodeQueryState(handle)).toBeUndefined();
    lineNodeHandler.dispose!(node);
    registry.dispose();
  });

  it("retains authored line ancestry through app creation and scene reset without changing primitive handles", () => {
    const makeScene = () => scene().add(group("parent", [
      primitives.box().position(1, 0, 0).runtime({ id: "box" }),
      lines.line({ points: [[0, 0, 0], [1, 0, 0]], position: [1, 0, 0], runtime: { id: "line" } })
    ], { position: [3, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 1, 1] }).runtime({ id: "parent" }));
    const app = createAuraApp(null, { autoStart: false, scene: makeScene(), qualityRebuild: { flags: { A3D_QR_CORE: false } } });
    const assertScene = () => {
      // Existing primitive consumers continue to receive legacy flattened TRS.
      expect(app.nodes.require("box").position).toEqual([4, 0, 0]);
      const line = app.nodes.require("line");
      expect(line.getWorldPosition()[0]).toBeCloseTo(3);
      expect(line.getWorldPosition()[1]).toBeCloseTo(2);
      const parent = app.nodes.require("parent");
      parent.setScale([4, 1, 1]);
      expect(line.getWorldPosition()[1]).toBeCloseTo(4);
      parent.setVisible(false);
      const node = lines.line({ points: [[0, 0, 0], [1, 0, 0]] }).toJSON();
      lineNodeHandler.compile(node, context, sink() as never);
      const hidden = sink();
      lineNodeHandler.update!(node, line, context, hidden as never, 0);
      expect(hidden.items).toHaveLength(0);
      lineNodeHandler.dispose!(node);
    };
    assertScene();
    app.setScene(makeScene());
    assertScene();
    app.dispose();
  });

  it("compiles anonymous and dynamically added lines with the same world-transform path", async () => {
    const snapshot = scene().add(group("parent", [
      group("child", [lines.line({ points: [[0, 0, 0], [1, 0, 0]], position: [1, 0, 0] })])
    ], { position: [3, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 1, 1] }).runtime({ id: "parent" })).toJSON();
    const flags = resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_PARITY_LINES: true, A3D_QR_CORE: false } });
    const registry = createAuraRuntimeNodeRegistry(snapshot, { flags });
    // The app supplies an already flattened snapshot to the compiler. The
    // original association must survive this additional compiler pass.
    const renderSnapshot = { ...snapshot, nodes: flattenTaggingMountedRoots(snapshot.nodes, flattenNodesWithLineWorldMatrices) };
    const mount = {
      ...context, flags, runtimeNodes: registry,
      environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }),
      collectedLights: [], runtimeWarnings: new Set<string>()
    } as unknown as MountSceneCompileContext;
    const compiled = await realCompilerImpl.compile(renderSnapshot, mount);
    registry.attachCompiled(compiled);
    const items = (source: unknown): readonly RenderItem[] => {
      const renderSource = source as RenderSource;
      return Array.from(renderSource.collectRenderItems?.() ?? renderSource.renderItems ?? []);
    };
    try {
      const first = items(compiled.source);
      expect(first).toHaveLength(1);
      expect(first[0]!.modelMatrix![12]).toBeCloseTo(3);
      expect(first[0]!.modelMatrix![13]).toBeCloseTo(2);
      registry.add(lines.line({ points: [[0, 0, 0], [1, 0, 0]], position: [1, 0, 0], runtime: { id: "added" } }), { parent: "parent" });
      registry.require("parent").setScale([4, 1, 1]);
      const after = items(realCompilerImpl.update(compiled, renderSnapshot, registry, 0));
      expect(after).toHaveLength(2);
      expect(after.find((item) => item.label === "l6.line.added")!.modelMatrix![13]).toBeCloseTo(4);
      expect(after.find((item) => item.label === "l6.line.anonymous")!.modelMatrix![13]).toBeCloseTo(4);
      registry.add(group("added group", [
        lines.line({ points: [[0, 0, 0], [1, 0, 0]], position: [1, 0, 0] })
      ]).runtime({ id: "nested" }), { parent: "parent" });
      const nested = items(realCompilerImpl.update(compiled, renderSnapshot, registry, 0));
      expect(nested.filter((item) => item.label === "l6.line.anonymous")).toHaveLength(2);
      for (const item of nested.filter((candidate) => candidate.label === "l6.line.anonymous")) expect(item.modelMatrix![13]).toBeCloseTo(4);
      expect([...registry.ids()].sort()).toEqual(["added", "nested", "parent"]);
      registry.require("parent").setVisible(false);
      expect(items(realCompilerImpl.update(compiled, renderSnapshot, registry, 0))).toHaveLength(0);
    } finally {
      compiled.dispose();
      registry.dispose();
    }
  });

  it("handles direct position and RGBA writes without an earlier setGeometry", () => {
    const node = lines.line({ points: [[0, 0, 0], [1, 0, 0]], runtime: { id: "line" } }).toJSON();
    const registry = createAuraRuntimeNodeRegistry({ nodes: [node] } as unknown as AuraSceneSnapshot);
    const handle = registry.require("line");
    lineNodeHandler.compile(node, context, sink() as never);
    handle.updateAttribute!("position", { offset: 1, array: [2, 1, 0] });
    handle.updateAttribute!("color", { offset: 1, array: [1, 0, 0, .5] });
    const out = sink();
    lineNodeHandler.update!(node, handle, context, out as never, 0);
    expect(out.items[0]!.geometry.vertexBuffer.getAttribute(1, "position")).toEqual([2, 1, 0]);
    expect(out.items[0]!.geometry.vertexBuffer.getAttribute(1, "color")).toEqual([1, 0, 0, .5]);
    expect((out.items[0]!.material as Material).renderState.blend).toBe(true);
    lineNodeHandler.dispose!(node);
    registry.dispose();
  });
});
