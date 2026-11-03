import { describe, expect, it } from "vitest";
import { checkG11TextureRows, type G11NamedTexture } from "./g11-synchronized-texture-check";

const required: G11NamedTexture[] = [
  { name: "f0 walls", slots: ["baseColor", "normal"] },
  { name: "bunker floor scorch 0", slots: ["baseColor"] }
];
const ready = (nodeName: string, slots = ["baseColor", "normal"]) => ({
  nodeName, levelName: "level-0", status: "textured", pixelBacked: true, slots, warnings: []
});
const plain = { nodeName: "lamp", levelName: "level-0", status: "none", pixelBacked: false, slots: [], warnings: [] };
const validRows = () => [ready("f0 walls"), ready("bunker floor scorch 0", ["baseColor"]), plain];

describe("G11 synchronized named texture diagnostics", () => {
  it("records named pixel-backed rows and allows a genuinely map-free scalar", () => {
    const result = checkG11TextureRows(validRows(), required);
    expect(result.issues).toEqual([]);
    expect(result.pixelBacked.map((row) => row.nodeName)).toEqual(["f0 walls", "bunker floor scorch 0"]);
    expect(result.required.every((entry) => entry.verified)).toBe(true);
  });

  it("does not accept the same count when an expected name or normal slot is missing", () => {
    const rows = [ready("wrong wall", ["baseColor", "normal"]), ready("bunker floor scorch 0", ["baseColor"]), plain];
    expect(checkG11TextureRows(rows, required).issues.join("\n")).toContain("required texture f0 walls");
    expect(checkG11TextureRows([ready("f0 walls", ["baseColor"]), rows[1], plain], required).issues.join("\n")).toContain("f0 walls");
  });

  it("reports every pending, fallback and invalid row, even outside the named surfaces", () => {
    const rows = [
      ...validRows(),
      { ...ready("queued A"), status: "pending", pixelBacked: false, slots: [], stage: "queued", pendingMs: 50 },
      { ...ready("queued B"), status: "pending", pixelBacked: false, slots: [] },
      { ...ready("failed"), status: "fallback", pixelBacked: false, slots: [] },
      { ...ready("corrupt"), status: "mystery" }
    ];
    const result = checkG11TextureRows(rows, required);
    expect(result.pending.map((row) => row.nodeName)).toEqual(["queued A", "queued B"]);
    expect(result.fallback.map((row) => row.nodeName)).toEqual(["failed"]);
    expect(result.invalid.map((row) => row.nodeName)).toEqual(["corrupt"]);
    expect(result.issues.join("\n")).toContain("queued A");
    expect(result.issues.join("\n")).toContain("queued B");
    expect(result.issues.join("\n")).toContain("failed");
    expect(result.issues.join("\n")).toContain("corrupt");
  });

  it.each([
    ["pixelBacked false", { pixelBacked: false }],
    ["pixelBacked missing", { pixelBacked: undefined }],
    ["slots absent", { slots: undefined }],
    ["empty slots", { slots: [] }],
    ["failed warning", { warnings: ["texture load failed"] }]
  ])("rejects an unverified textured row: %s", (_label, change) => {
    const result = checkG11TextureRows([{ ...ready("f0 walls"), ...change }, validRows()[1], plain], required);
    expect(result.unverified).toHaveLength(1);
    expect(result.issues.join("\n")).toContain("required texture f0 walls");
  });

  it("does not confuse a map-free placeholder with the required mapped row", () => {
    const result = checkG11TextureRows([
      { ...plain, nodeName: "f0 walls" }, ready("f0 walls"), validRows()[1]
    ], required);
    expect(result.issues).toEqual([]);
    expect(result.required[0]?.observed).toHaveLength(2);
  });

  it("rejects duplicate textured matches, broken scalar fields, and missing diagnostics", () => {
    expect(checkG11TextureRows([...validRows(), ready("f0 walls")], required).issues.join("\n")).toContain("f0 walls");
    expect(checkG11TextureRows([...validRows(), { ...plain, slots: ["baseColor"] }], required).invalid).toHaveLength(1);
    expect(checkG11TextureRows(undefined, required).issues.join("\n")).toContain("missing or empty");
    expect(checkG11TextureRows([], required).required.every((entry) => !entry.verified)).toBe(true);
  });
});
