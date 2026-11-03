import { describe, expect, it } from "vitest";
import { assertDecoderVersion, assertKtxProvenance } from "../../../tools/muse3jsparity-matrix/decoder-alignment.js";

describe("3.0.1 installed decoder alignment", () => {
  it.each(["1.2.0", "1.2.1", "1.10.0", "2.0.0"])("accepts equal or newer stable decoder %s", version => {
    expect(() => assertDecoderVersion("meshoptimizer", version, "1.2.0")).not.toThrow();
  });
  it.each([null, "1.1.1", "1.2.0-beta.1", "unknown", "^1.2.0"])("rejects missing, older, unverified installed version %s", version => {
    expect(() => assertDecoderVersion("meshoptimizer", version, "1.2.0")).toThrow();
  });
  it("rejects a versionless reference with no verified mapping", () => {
    expect(() => assertDecoderVersion("ktx-parse", "1.0.1", null)).toThrow(/unverified/);
    expect(() => assertKtxProvenance("", "", null)).toThrow(/provenance/);
  });
  // Retired 2026-11-02 (docs/project/status/retired-tests.md §6): the two cases that compared the
  // installed ktx-parse against three's vendored copy (node_modules/three/examples/jsm/libs) need three
  // installed, which S5-WP19-07 removed from the workspace install graph.
});
