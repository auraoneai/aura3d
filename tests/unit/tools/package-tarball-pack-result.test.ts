import { describe, expect, it } from "vitest";
import { parseSinglePackResult } from "../../../tools/package-tarball-audit/pack-result";

const result = { id: "@aura3d/engine@3.0.1", name: "@aura3d/engine", version: "3.0.1", size: 10, unpackedSize: 20, filename: "a.tgz", files: [{ path: "package.json", size: 3 }] };

describe("npm pack result parsing", () => {
  it("accepts historical array and npm 11 name-keyed object output", () => {
    expect(parseSinglePackResult(JSON.stringify([result]), result.name)).toEqual(result);
    expect(parseSinglePackResult(JSON.stringify({ [result.name]: result }), result.name)).toEqual(result);
  });
  it("rejects wrong, duplicate, and malformed package results", () => {
    expect(() => parseSinglePackResult(JSON.stringify({ other: { ...result, name: "other" } }), result.name)).toThrow(/observed: other/);
    expect(() => parseSinglePackResult(JSON.stringify([result, result]), result.name)).toThrow(/2 valid/);
    expect(() => parseSinglePackResult(JSON.stringify({ [result.name]: { ...result, files: null } }), result.name)).toThrow(/0 valid/);
  });
});
