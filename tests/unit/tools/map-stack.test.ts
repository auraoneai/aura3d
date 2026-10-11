import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transformSync } from "esbuild";
import { afterAll, describe, expect, it } from "vitest";
import { decodeVlqSegment, mapStack } from "../../../tools/quality-rebuild-capture/map-stack.mjs";

const dir = mkdtempSync(join(tmpdir(), "map-stack-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("T0-29 map-stack", () => {
  it("decodes VLQ segments", () => {
    expect(decodeVlqSegment("AAAA")).toEqual([0, 0, 0, 0]);
    expect(decodeVlqSegment("AACA")).toEqual([0, 0, 1, 0]);
    expect(decodeVlqSegment("D")).toEqual([-1]);
    expect(decodeVlqSegment("gB")).toEqual([16]);
  });

  it("maps a minified frame back to the original source line", () => {
    const source = ["export function a() { return 1; }", "", "export function boom() {", "  throw new Error(\"unique_marker_29\");", "}"].join("\n");
    const out = transformSync(source, { loader: "ts", minify: true, sourcemap: "external", sourcefile: "game/boom.ts", format: "esm" });
    writeFileSync(join(dir, "aura-engine-test.js"), out.code);
    writeFileSync(join(dir, "aura-engine-test.js.map"), out.map);
    const lines = out.code.split("\n");
    const lineIndex = lines.findIndex((l) => l.includes("unique_marker_29"));
    const col = lines[lineIndex]!.indexOf("new Error") + 1;
    const [mapped] = mapStack(`at boom (aura-engine-test.js:${lineIndex + 1}:${col})`, dir);
    expect(mapped).toMatch(/-> game\/boom\.ts:4:\d+$/);
  });

  it("never guesses without a sourcemap", () => {
    expect(mapStack("at x (other-chunk.js:1:10)", dir)).toEqual(["other-chunk.js:1:10 -> (no sourcemap)"]);
  });
});
