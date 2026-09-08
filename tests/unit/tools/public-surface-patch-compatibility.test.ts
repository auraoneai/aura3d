import { describe, expect, it } from "vitest";
import { classifyPatchDeclarationChange } from "../../../tools/public-surface-diff/patch-compatibility.js";

describe("patch declaration compatibility", () => {
  it.each([
    ["export interface Options { readonly enabled?: boolean; }", "export interface Options { readonly enabled?: boolean; readonly limit?: number; }"],
    ["function render(input: Input):Result", "function render(input: Input,limit = 1):Result"],
    ["function inspect():{ readonly ok: boolean; }", "function inspect():{ readonly ok: boolean; readonly details: string; }"],
    ["class Renderer{render(input: Input):Result}", "class Renderer{render(input: Input):Result;reset(reason = 'manual'):void}"],
    ["export type Mode = 'a' | 'b';", "export type Mode = 'a' | 'b' | 'c';"]
  ])("accepts source-compatible additions", (before, after) => {
    expect(classifyPatchDeclarationChange(before, after)).toBe("compatible-addition");
  });

  it.each([
    ["export interface Options { readonly enabled?: boolean; }", "export interface Options { readonly enabled?: boolean; readonly limit: number; }"],
    ["function render(input: Input):Result", "function render(input: NarrowInput):Result"],
    ["class Renderer{render(input: Input):Result}", "class Renderer{render(input: NarrowInput):Result}"],
    ["export type Mode = 'a' | 'b';", "export type Mode = 'a' | 'c';"]
  ])("rejects breaking declaration mutations", (before, after) => {
    expect(classifyPatchDeclarationChange(before, after)).toBe("incompatible-change");
  });
});
