import { describe, expect, it } from "vitest";
import { VertexFormat } from "../../../packages/rendering/src";

describe("VertexFormat", () => {
  it("defines canonical P3N3T4T2 offsets and stride", () => {
    const format = VertexFormat.P3N3T4T2;

    expect(format.stride).toBe(48);
    expect(format.getAttribute("position").offset).toBe(0);
    expect(format.getAttribute("normal").offset).toBe(12);
    expect(format.getAttribute("tangent").offset).toBe(24);
    expect(format.getAttribute("uv").offset).toBe(40);
  });

  it("rejects duplicate semantics", () => {
    expect(
      () =>
        new VertexFormat([
          { semantic: "position", components: 3, offset: 0 },
          { semantic: "position", components: 3, offset: 12 }
        ])
    ).toThrow(/Duplicate vertex semantic/);
  });

  it("rejects stride smaller than attributes require", () => {
    expect(() => new VertexFormat([{ semantic: "position", components: 3, offset: 0 }], 8)).toThrow(/smaller/);
  });
});
