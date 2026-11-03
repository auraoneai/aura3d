import { describe, expect, it } from "vitest";
import { inspectNRRDDataReference as rootInspector } from "../../packages/assets/src";
import { inspectNRRDDataReference, parseNRRD, ScientificImportError } from "../../packages/assets/src/loaders/ScientificFormatLoaders";

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const detached = (reference: string): string =>
  `NRRD0005\ntype: uint8\ndimension: 1\nsizes: 1\nencoding: raw\ndata file: ${reference}\n`;

describe("bounded NRRD dependency-reference inspection", () => {
  it("exposes the same synchronous inspector at the assets root and preserves error identity", async () => {
    expect(rootInspector).toBe(inspectNRRDDataReference);
    expect(() => rootInspector("bad magic\n")).toThrow(ScientificImportError);
    await expect(parseNRRD("bad magic\n")).rejects.toBeInstanceOf(ScientificImportError);
  });

  it("returns the declared reference unchanged for string, byte-view and buffer inputs", () => {
    const text = detached("../voxels.raw?version=2"), bytes = encode(text);
    expect(inspectNRRDDataReference(text)).toBe("../voxels.raw?version=2");
    const padded = new Uint8Array(bytes.length + 2);
    padded.set(bytes, 1);
    expect(inspectNRRDDataReference(padded.subarray(1, -1))).toBe("../voxels.raw?version=2");
    expect(inspectNRRDDataReference(Uint8Array.from(bytes).buffer)).toBe("../voxels.raw?version=2");
  });

  it("recognizes the datafile alias and CRLF without resolving or fetching a path", () => {
    const source = "NRRD0004\r\ntype: uint8\r\ndimension: 1\r\nsizes: 1\r\nencoding: raw\r\ndatafile: nested/voxels.raw\r\n";
    expect(inspectNRRDDataReference(source)).toBe("nested/voxels.raw");
  });

  it("does not mistake embedded data or a namespaced metadata key for a detached reference", () => {
    const source = "NRRD0005\ntype: uint8\ndimension: 1\nsizes: 1\nencoding: raw\ndata file:=metadata only\n\nA";
    expect(inspectNRRDDataReference(source)).toBeUndefined();
  });

  it.each([
    ["NOT-NRRD\ndata file: voxels.raw\n", /unsupported/i],
    ["NRRD0005\nmalformed line\n", /malformed/i],
    ["NRRD0005\ndata file: one.raw\ndatafile: two.raw\n", /duplicate/i],
    ["NRRD0005\ndata file: LIST\n", /unsupported/i],
    ["NRRD0005\ndata file: slice%03d.raw 0 3 1\n", /unsupported/i],
    ["NRRD0005\ndata file:\n", /unsupported/i],
    ["NRRD0005\ntype: uint8\n", /truncated/i]
  ] as const)("rejects malformed or unsupported headers: %#", (source, error) => {
    expect(() => inspectNRRDDataReference(source)).toThrow(error);
  });

  it("enforces the input, line and total-header bounds", () => {
    expect(() => inspectNRRDDataReference(detached("voxels.raw"), { maxBytes: 10 })).toThrow(/input_limit/i);
    expect(() => inspectNRRDDataReference(detached("voxels.raw"), { maxBytes: 0 })).toThrow(/invalid_limit/i);
    expect(() => inspectNRRDDataReference(`NRRD0005\n#${"x".repeat(65_536)}\n`)).toThrow(/line is too long/i);
    const comments = Array.from({ length: 17 }, () => `#${"x".repeat(65_530)}`).join("\n");
    expect(() => inspectNRRDDataReference(`NRRD0005\n${comments}\ndata file: voxels.raw\n`)).toThrow(/header exceeds/i);
  });

  it("rejects invalid UTF-8 in a header without interpreting its bytes as a path", () => {
    const prefix = encode("NRRD0005\ndata file: ");
    const input = new Uint8Array(prefix.length + 2);
    input.set(prefix); input.set([0xff, 0x0a], prefix.length);
    expect(() => inspectNRRDDataReference(input)).toThrow(/UTF-8/i);
  });
});
