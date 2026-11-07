import { describe, expect, it } from "vitest";
import { diffPackedSurfaces, neutralizeCopyIdentity } from "../../../tools/public-surface-diff/index.js";
import { classifyReleaseChange } from "../../../tools/public-surface-diff/patch-compatibility.js";
import type { PackedPackage } from "../../../tools/public-surface-diff/prepare-baseline.js";

function fixture(declaration: string): PackedPackage {
  const manifest = { name: "@aura3d/test", version: "1.0.0", exports: { ".": { types: "./index.d.ts", import: "./index.js" } } };
  return { manifest, files: new Map([["package.json", Buffer.from(JSON.stringify(manifest))], ["index.d.ts", Buffer.from(declaration)]]), paths: ["index.d.ts", "index.js", "package.json"] };
}
function diff(before: string, after: string, version: string, release: "patch" | "minor" | "major") {
  const a = fixture(before), b = fixture(after);
  return diffPackedSurfaces(new Map([[a.manifest.name, a]]), new Map([[b.manifest.name, b]]), version, release);
}
const dispositions = (report: ReturnType<typeof diff>) => Object.fromEntries(report.changes.map((change) => [change.name, change.classification.disposition]));

// A data union gains a member, a node interface an optional field; an exported
// value whose own declaration is unchanged returns the widened node, behind a
// unique-symbol brand and a class with private members (one comparison copy each).
const WIDEN_BEFORE = `
declare const brand: unique symbol;
export interface AssetRef { readonly [brand]: true; readonly url: string }
export type EffectType = "bloom" | "fog";
export interface EffectNode { readonly kind: "effect"; readonly effect: EffectType; readonly asset?: AssetRef }
export declare class NodeBuilder<T extends EffectNode> {
    private node;
    build(): T;
}
export interface Game<TCue extends string = string> { readonly cue?: TCue; readonly nodes: readonly EffectNode[] }
export declare function effect(type: EffectType): NodeBuilder<EffectNode>;
export declare const effects: { readonly bloom: () => NodeBuilder<EffectNode> };
`;
const WIDEN_AFTER = `
declare const brand: unique symbol;
export interface AssetRef { readonly [brand]: true; readonly url: string }
export type EffectType = "bloom" | "fog" | "god-rays";
export interface EffectNode { readonly kind: "effect"; readonly effect: EffectType; readonly asset?: AssetRef; readonly direction?: readonly [number, number, number] }
export declare class NodeBuilder<T extends EffectNode> {
    #private;
    private node;
    private extra;
    build(): T;
}
export interface Game<TCue extends string = string> { readonly cue?: TCue; readonly nodes: readonly EffectNode[] }
export declare function effect(type: EffectType): NodeBuilder<EffectNode>;
export interface GodRaysOptions { readonly strength?: number }
export declare const effects: { readonly bloom: () => NodeBuilder<EffectNode>; readonly godRays: (options?: GodRaysOptions) => NodeBuilder<EffectNode> };
`;

describe("minor release widening", () => {
  it("accepts widened unions, optional fields and the values that mention them in a minor", () => {
    const report = diff(WIDEN_BEFORE, WIDEN_AFTER, "1.1.0", "minor");
    expect(report.diagnostics).toEqual([]);
    expect(report.changes.length).toBeGreaterThan(0);
    for (const change of report.changes) {
      expect(change.kind).toBe("declaration-change");
      expect({ name: change.name, ...change.classification }).toEqual({ name: change.name, compatible: true, breaking: false, disposition: "compatible-widening" });
      expect(change.classification).toEqual({ compatible: true, breaking: false, disposition: "compatible-widening" });
    }
    // The exported values whose own declaration is unchanged are attributed to the widened types.
    expect(dispositions(report)).toMatchObject({ EffectType: "compatible-widening", EffectNode: "compatible-widening", effects: "compatible-widening" });
  }, 60000);

  it("still fails the same widening in a patch", () => {
    const report = diff(WIDEN_BEFORE, WIDEN_AFTER, "1.0.1", "patch");
    expect(dispositions(report)).toMatchObject({ EffectType: "breaking", EffectNode: "breaking" });
    expect(report.changes.every((change) => !change.classification.compatible)).toBe(true);
  }, 60000);

  it("leaves a major unchanged", () => {
    const report = diff(WIDEN_BEFORE, WIDEN_AFTER, "2.0.0", "major");
    expect(report.changes.length).toBeGreaterThan(0);
    expect(report.changes.every((change) => change.classification.disposition === "major-break")).toBe(true);
  }, 60000);

  it.each([
    ["a narrowed union", 'export type Mode = "a" | "b";', 'export type Mode = "a";', "Mode"],
    ["a narrowed parameter", "export declare function draw(value: string | number): void;", "export declare function draw(value: string): void;", "draw"],
    ["a new required field", "export interface Options { enabled: boolean }", "export interface Options { enabled: boolean; label: string }", "Options"],
    ["an optional field made required", "export interface Options { label?: string }", "export interface Options { label: string }", "Options"],
    ["a widened class instance", "export declare class Box { value: string; }", "export declare class Box { value: string | number; }", "Box"],
    ["a narrowed hidden type behind an unchanged signature", "interface Hidden { mode: \"a\" | \"b\" } export declare function draw(value: Hidden): void;", "interface Hidden { mode: \"a\" } export declare function draw(value: Hidden): void;", "draw"],
    ["a narrowed parameter of a value whose result widened", 'export type Kind = "a"; export declare function make(input: string | number): Kind;', 'export type Kind = "a" | "b"; export declare function make(input: string): Kind;', "make"]
  ])("fails %s in a minor", (_label, before, after, name) => {
    const report = diff(before, after, "1.1.0", "minor");
    const change = report.changes.find((entry) => entry.name === name);
    expect(change?.kind).toBe("declaration-change");
    expect(change?.classification).toEqual({ compatible: false, breaking: true, disposition: "breaking" });
  }, 60000);

  it("fails removals in a minor", () => {
    const report = diff(
      "export declare const kept: number; export declare const lost: number; export interface Options { a: string; b: string; nested: { c: string; d: string } } export interface Deep { nested: { c: string; d: string } }",
      "export declare const kept: number; export interface Options { a: string; nested: { c: string; d: string } } export interface Deep { nested: { c: string } }",
      "1.1.0", "minor");
    expect(report.changes.find((change) => change.name === "lost")).toMatchObject({ kind: "value-removal", classification: { disposition: "breaking" } });
    expect(report.changes.find((change) => change.name === "Options")).toMatchObject({ kind: "declaration-change", classification: { disposition: "breaking" } });
    expect(report.changes.find((change) => change.name === "Deep")).toMatchObject({ kind: "declaration-change", classification: { disposition: "breaking" } });
  }, 60000);

  it("classifies a proven widening by release level, ahead of a deprecation notice", () => {
    const change = { kind: "declaration-change" as const, widening: true, removalVersion: "6.0.0" };
    expect(classifyReleaseChange(change, "minor", "5.1.0")).toEqual({ compatible: true, breaking: false, disposition: "compatible-widening" });
    expect(classifyReleaseChange({ ...change, removalVersion: undefined }, "patch", "5.0.4").disposition).toBe("breaking");
    expect(classifyReleaseChange({ ...change, removalVersion: undefined }, "major", "6.0.0").disposition).toBe("major-break");
    expect(classifyReleaseChange({ kind: "declaration-change" }, "minor", "5.1.0").disposition).toBe("breaking");
    expect(classifyReleaseChange({ kind: "value-removal", widening: true }, "minor", "5.1.0").disposition).toBe("breaking");
  });
});

describe("comparison copy identity", () => {
  it("shares unique-symbol brands by package, path and name, and drops private members", () => {
    const keys: string[] = [];
    const text = neutralizeCopyIdentity(
      "declare const brand: unique symbol;\nexport declare const other: unique symbol;\nexport declare class A {\n    #private;\n    private x;\n    private static readonly y;\n    private constructor();\n    protected z: number;\n    w: string;\n}\n",
      "@aura3d/test\0index.d.ts", "./shared.cjs", (key) => keys.push(key));
    expect(keys).toHaveLength(2);
    expect(text).toContain(`declare const brand: typeof import("./shared.cjs").${keys[0]};`);
    expect(text).toContain(`export declare const other: typeof import("./shared.cjs").${keys[1]};`);
    expect(text).not.toMatch(/#private|private x|private static/);
    expect(text).toContain("private constructor();");
    expect(text).toContain("    z: number;");
    const again: string[] = [];
    neutralizeCopyIdentity("declare const brand: unique symbol;", "@aura3d/test\0index.d.ts", "./x.cjs", (key) => again.push(key));
    neutralizeCopyIdentity("declare const brand: unique symbol;", "@aura3d/test\0moved.d.ts", "./x.cjs", (key) => again.push(key));
    expect(again[0]).toBe(keys[0]);
    expect(again[1]).not.toBe(keys[0]);
  });

  it("does not report an unchanged brand or private class as a change", () => {
    const source = "declare const brand: unique symbol;\nexport interface Ref {\n    readonly [brand]: true;\n}\nexport declare class Viewer {\n    #private;\n    private element;\n    reset(ref: Ref): void;\n}\n";
    expect(diff(source, source.replace("reset(", "readonly label?: string; reset("), "1.0.1", "patch").changes).toEqual([]);
  }, 60000);
});
