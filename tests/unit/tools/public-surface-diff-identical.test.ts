import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { allDeclarationsIdentical } from "../../../tools/public-surface-diff/index";

const dirs: string[] = [];
function pkg(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "a3d-decl-"));
  dirs.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("allDeclarationsIdentical", () => {
  it("ignores runtime files and versions but sees any declaration byte change", () => {
    const a = new Map([["@x/a", pkg({ "dist/index.d.ts": "export declare const a: 1;\n", "dist/index.js": "1", "package.json": "{\"version\":\"1.0.0\"}" })]]);
    const same = new Map([["@x/a", pkg({ "dist/index.d.ts": "export declare const a: 1;\n", "dist/index.js": "2", "package.json": "{\"version\":\"1.0.1\"}" })]]);
    const changed = new Map([["@x/a", pkg({ "dist/index.d.ts": "export declare const a: 2;\n" })]]);
    const extra = new Map([["@x/a", pkg({ "dist/index.d.ts": "export declare const a: 1;\n", "dist/more.d.ts": "export {};\n" })]]);
    expect(allDeclarationsIdentical(a, same)).toBe(true);
    expect(allDeclarationsIdentical(a, changed)).toBe(false);
    expect(allDeclarationsIdentical(a, extra)).toBe(false);
    expect(allDeclarationsIdentical(a, new Map())).toBe(false);
  });
});
