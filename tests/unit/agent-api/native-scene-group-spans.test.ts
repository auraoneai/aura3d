import { describe, expect, it, vi } from "vitest";
import { flattenSceneNodes, type SceneGroupSpan } from "../../../packages/engine/src/agent-api/sceneMath";
import { getLookLowering, setLookLowering, type AuraLookLowering } from "../../../packages/engine/src/agent-api/sceneMath.lookLowering";
import {
  flattenAuraSceneNodes,
  flattenAuraSceneSnapshot,
  flattenNodesWithLineWorldMatrices,
  flattenSceneNodesV2
} from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import type { AuraGroupNode, AuraLineNode, AuraPrimitiveNode, AuraSceneNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

type SpanObserver = (span: SceneGroupSpan) => void;
type Flattener = (nodes: readonly AuraSceneNode[], observer?: SpanObserver) => AuraSceneNode[];

const box = (name: string, position?: readonly [number, number, number]): AuraPrimitiveNode => ({
  kind: "primitive", primitive: "box", name, ...(position ? { position } : {})
});
const group = (name: string | undefined, children: readonly AuraSceneNode[], position?: readonly [number, number, number]): AuraGroupNode => ({
  kind: "group", ...(name === undefined ? {} : { name }), children, ...(position ? { position } : {})
});
const look = (name: string): AuraSceneNode => ({ kind: "look", look: name } as unknown as AuraSceneNode);
const line = (name: string): AuraLineNode => ({ kind: "line", line: "line", name, positions: [0, 0, 0, 1, 0, 0] });
const names = (nodes: readonly AuraSceneNode[]): string[] => nodes.map((node) => {
  const named = node as { readonly kind: string; readonly name?: string; readonly look?: string };
  return named.name ?? named.look ?? named.kind;
});
const shape = (spans: readonly SceneGroupSpan[]) => spans.map(({ group: node, ancestors, start, end }) => ({
  name: node.name ?? "(anonymous)", ancestors: ancestors.map((parent) => parent.name ?? "(anonymous)"), start, end
}));

const flatteners: readonly [string, Flattener][] = [
  ["legacy", (nodes, onGroupSpan) => flattenSceneNodes(nodes, {}, { onGroupSpan })],
  ["hierarchical", (nodes, onGroupSpan) => flattenSceneNodesV2(nodes, { onGroupSpan })],
  ["flag off", (nodes, onGroupSpan) => flattenAuraSceneNodes(nodes, false, { onGroupSpan })],
  ["flag on", (nodes, onGroupSpan) => flattenAuraSceneNodes(nodes, true, { onGroupSpan })],
  ["hybrid line", (nodes, onGroupSpan) => flattenNodesWithLineWorldMatrices(nodes, { onGroupSpan })]
];

function withLowering<T>(lowering: AuraLookLowering, run: () => T): T {
  const previous = getLookLowering();
  setLookLowering(lowering);
  try { return run(); }
  finally { setLookLowering(previous); }
}

describe("scene flatten group spans", () => {
  it.each(flatteners)("reports pre-order authored ranges without changing %s output", (_label, flatten) => {
    const before = box("before");
    const a = box("a", [1, 0, 0]);
    const empty = group("empty", []);
    const b = box("b");
    const deepEmpty = group(undefined, []);
    const c = box("c");
    const inner = group("inner", [b, deepEmpty, c]);
    const outer = group("outer", [a, empty, inner], [3, 0, 0]);
    const after = box("after");
    const nodes = [before, outer, after] as const;
    const spans: SceneGroupSpan[] = [];

    const baseline = flatten(nodes);
    const flattened = flatten(nodes, (span) => spans.push(span));

    expect(flattened).toEqual(baseline);
    expect(names(flattened)).toEqual(["before", "a", "b", "c", "after"]);
    expect((flattened[1] as AuraPrimitiveNode).position).toEqual([4, 0, 0]);
    expect(shape(spans)).toEqual([
      { name: "outer", ancestors: [], start: 1, end: 4 },
      { name: "empty", ancestors: ["outer"], start: 2, end: 2 },
      { name: "inner", ancestors: ["outer"], start: 2, end: 4 },
      { name: "(anonymous)", ancestors: ["outer", "inner"], start: 3, end: 3 }
    ]);
    expect(spans.map((span) => span.group)).toEqual([outer, empty, inner, deepEmpty]);
    [outer, empty, inner, deepEmpty].forEach((node, index) => expect(spans[index]!.group).toBe(node));
    expect(spans[3]!.ancestors[0]).toBe(outer);
    expect(spans[3]!.ancestors[1]).toBe(inner);
    expect(outer.children).toEqual([a, empty, inner]);
    expect(a.position).toEqual([1, 0, 0]);
  });

  it.each([false, true])("forwards observer ranges through snapshot flatten with core=%s", (core) => {
    const nested = group("nested", [box("child")]);
    const input = { nodes: [group("root", [nested])] } as unknown as AuraSceneSnapshot;
    const spans: SceneGroupSpan[] = [];
    const result = flattenAuraSceneSnapshot(input, core, { onGroupSpan: (span) => spans.push(span) });
    expect(names(result.nodes)).toEqual(["child"]);
    expect(shape(spans)).toEqual([
      { name: "root", ancestors: [], start: 0, end: 1 },
      { name: "nested", ancestors: ["root"], start: 0, end: 1 }
    ]);
    expect(input.nodes[0]!.kind).toBe("group");
  });

  it.each(flatteners)("counts each look occurrence once when reporting %s spans", (_label, flatten) => {
    const repeated = look("repeated");
    const root = group("root", [repeated, repeated, line("force-hybrid")]);
    let sequence = 0;
    const lower = vi.fn((node: AuraSceneNode): readonly AuraSceneNode[] | undefined =>
      node === repeated ? [box(`lowered-${++sequence}`)] : undefined);
    const spans: SceneGroupSpan[] = [];
    withLowering(lower, () => {
      const result = flatten([root], (span) => spans.push(span));
      expect(names(result)).toEqual(["repeated", "lowered-1", "repeated", "lowered-2", "force-hybrid"]);
    });
    expect(lower).toHaveBeenCalledTimes(2);
    expect(shape(spans)).toEqual([{ name: "root", ancestors: [], start: 0, end: 5 }]);
  });

  it.each(flatteners)("counts generated look groups without reporting them as authored in %s", (_label, flatten) => {
    const authoredLook = look("look");
    const generated = group("generated", [box("from-look"), group("generated-empty", [])]);
    const authored = group("authored", [authoredLook, box("after-look")]);
    const spans: SceneGroupSpan[] = [];
    const lower = vi.fn((node: AuraSceneNode): readonly AuraSceneNode[] | undefined =>
      node === authoredLook ? [generated] : undefined);
    withLowering(lower, () => {
      const flattened = flatten([authored], (span) => spans.push(span));
      expect(names(flattened)).toEqual(["look", "from-look", "after-look"]);
    });
    expect(lower).toHaveBeenCalledTimes(1);
    expect(shape(spans)).toEqual([{ name: "authored", ancestors: [], start: 0, end: 3 }]);
  });

  it.each(flatteners)("does not publish %s group spans if look lowering fails", (_label, flatten) => {
    const bad = look("bad");
    const root = group("root", [group("already-walked", []), bad]);
    const seen = vi.fn();
    withLowering((node) => {
      if (node === bad) throw new Error("look lowering failed");
      return undefined;
    }, () => {
      expect(() => flatten([root], seen)).toThrow("look lowering failed");
    });
    expect(seen).not.toHaveBeenCalled();
  });

  it("keeps reentrant observer calls and their ranges isolated", () => {
    const outer = group("outer", [box("a"), group("inner", [box("b")])]);
    const nested = group("nested", [box("x"), box("y")]);
    const outerSpans: SceneGroupSpan[] = [];
    const nestedSpans: SceneGroupSpan[] = [];
    const result = flattenAuraSceneNodes([outer], true, { onGroupSpan(span) {
      outerSpans.push(span);
      if (span.group === outer) {
        expect(names(flattenAuraSceneNodes([nested], true, { onGroupSpan: (inner) => nestedSpans.push(inner) }))).toEqual(["x", "y"]);
      }
    } });
    expect(names(result)).toEqual(["a", "b"]);
    expect(shape(outerSpans)).toEqual([
      { name: "outer", ancestors: [], start: 0, end: 2 },
      { name: "inner", ancestors: ["outer"], start: 1, end: 2 }
    ]);
    expect(shape(nestedSpans)).toEqual([{ name: "nested", ancestors: [], start: 0, end: 2 }]);
  });

  it("keeps a reentrant look lowering separate from hybrid replay state", () => {
    const mainLook = look("main-look"), innerLook = look("inner-look");
    const main = group("main", [mainLook, line("main-line")]);
    const inner = group("inner", [innerLook, line("inner-line")]);
    const lower = vi.fn((node: AuraSceneNode): readonly AuraSceneNode[] | undefined => {
      if (node === mainLook) {
        const nested = flattenNodesWithLineWorldMatrices([inner]);
        expect(names(nested)).toEqual(["inner-look", "inner-value", "inner-line"]);
        return [box("main-value")];
      }
      if (node === innerLook) return [box("inner-value")];
      return undefined;
    });
    withLowering(lower, () => {
      const spans: SceneGroupSpan[] = [];
      const result = flattenNodesWithLineWorldMatrices([main], { onGroupSpan: (span) => spans.push(span) });
      expect(names(result)).toEqual(["main-look", "main-value", "main-line"]);
      expect(shape(spans)).toEqual([{ name: "main", ancestors: [], start: 0, end: 3 }]);
    });
    expect(lower).toHaveBeenCalledTimes(2);
  });

  it("propagates an observer error without poisoning later flatten calls", () => {
    const input = [group("root", [box("child")])];
    expect(() => flattenAuraSceneNodes(input, false, { onGroupSpan() { throw new Error("observer failed"); } }))
      .toThrow("observer failed");
    const spans: SceneGroupSpan[] = [];
    const later = flattenAuraSceneNodes(input, false, { onGroupSpan: (span) => spans.push(span) });
    expect(names(later)).toEqual(["child"]);
    expect(shape(spans)).toEqual([{ name: "root", ancestors: [], start: 0, end: 1 }]);
  });
});
