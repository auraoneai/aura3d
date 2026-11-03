import { describe, expect, it } from "vitest";
import { prd06IkSlope } from "../../../../benchmarks/quality-rebuild/scenes/prd06/ik-slope";
import { historicalRegistrations, parseHistoricalRegistry, readHistoricalRegistrySource } from "./historical-registry-source";

const source = readHistoricalRegistrySource();
const slopeEntry = '  { id: "prd06-ik-slope", spec: prd06IkSlope, admittedAsReference: false },';

function replaceOnce(text: string, before: string, after: string): string {
  if (text.split(before).length !== 2) throw new Error(`Expected exactly one occurrence: ${before}`);
  return text.replace(before, after);
}

describe("historical PRD-06 registry source contract", () => {
  it("reads real registrations and resolves their shared spec identity", () => {
    const entries = historicalRegistrations();
    expect(entries).toHaveLength(9);
    expect(entries.find((entry) => entry.id === "prd06-ik-slope")).toEqual({
      id: "prd06-ik-slope", spec: prd06IkSlope, admittedAsReference: false
    });
    expect(entries.find((entry) => entry.id === "prd06-ik-slope")?.spec).toBe(prd06IkSlope);
  });

  it("resolves an explicitly aliased import to the original shared object", () => {
    const aliased = replaceOnce(
      replaceOnce(source, "import { prd06IkSlope }", "import { prd06IkSlope as slope }"),
      "spec: prd06IkSlope,", "spec: slope,"
    );
    expect(parseHistoricalRegistry(aliased).find((entry) => entry.id === "prd06-ik-slope")?.spec).toBe(prd06IkSlope);
  });

  it("preserves changed and absent admission values for the caller's assertions", () => {
    const changed = replaceOnce(source, slopeEntry, slopeEntry.replace("admittedAsReference: false", "admittedAsReference: true"));
    const absent = replaceOnce(source, slopeEntry, slopeEntry.replace(", admittedAsReference: false", ""));
    expect(parseHistoricalRegistry(changed).find((entry) => entry.id === "prd06-ik-slope")?.admittedAsReference).toBe(true);
    expect(parseHistoricalRegistry(absent).find((entry) => entry.id === "prd06-ik-slope")?.admittedAsReference).toBeUndefined();
  });

  it("rejects duplicate and missing entries", () => {
    expect(() => parseHistoricalRegistry(replaceOnce(source, slopeEntry, `${slopeEntry}\n${slopeEntry}`))).toThrow(/duplicate/i);
    expect(() => parseHistoricalRegistry(replaceOnce(source, slopeEntry, ""))).toThrow(/missing/i);
  });

  it("rejects a wrong id, unknown spec and changed import source", () => {
    expect(() => parseHistoricalRegistry(replaceOnce(source, 'id: "prd06-ik-slope"', 'id: "prd06-wrong"'))).toThrow(/mismatched/i);
    expect(() => parseHistoricalRegistry(replaceOnce(source, "spec: prd06IkSlope,", "spec: missingSpec,"))).toThrow(/missing/i);
    expect(() => parseHistoricalRegistry(replaceOnce(source, '"../../../scenes/prd06/ik-slope"', '"../../../scenes/prd06/character-hero"'))).toThrow(/binding/i);
  });

  it("rejects expressions, duplicate properties and statements that could alter the registry", () => {
    expect(() => parseHistoricalRegistry(replaceOnce(source, slopeEntry, "  ...otherEntries,"))).toThrow(/entry/i);
    expect(() => parseHistoricalRegistry(replaceOnce(source, slopeEntry, slopeEntry.replace("spec: prd06IkSlope", "spec: makeSpec()")))).toThrow(/id or spec/i);
    expect(() => parseHistoricalRegistry(replaceOnce(source, slopeEntry, slopeEntry.replace("admittedAsReference: false", "admittedAsReference: flag")))).toThrow(/admission/i);
    expect(() => parseHistoricalRegistry(replaceOnce(source, slopeEntry, slopeEntry.replace("spec: prd06IkSlope", "spec: prd06IkSlope, spec: prd06IkSlope")))).toThrow(/duplicate/i);
    expect(() => parseHistoricalRegistry(`${source}\nscenes.reverse();`)).toThrow(/statement/i);
    expect(() => parseHistoricalRegistry(`${source}\nimport * as other from "three";`)).toThrow(/import/i);
    expect(() => parseHistoricalRegistry(replaceOnce(source, slopeEntry, "  { id: ,"))).toThrow(/syntax/i);
  });
});
