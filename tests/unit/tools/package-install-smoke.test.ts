import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { findUnresolvedInternalAuraImports } from "../../../tools/package-install-smoke/index.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function packageFixture(source: string): string {
  const root = mkdtempSync(join(tmpdir(), "a3d-package-import-scan-"));
  temporaryDirectories.push(root);
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "dist", "index.js"), source);
  return root;
}

describe("packed root internal import scan", () => {
  it("accepts relative and external package imports", () => {
    const root = packageFixture([
      'export { Scene } from "./scene/index.js";',
      'import "cannon-es";'
    ].join("\n"));

    expect(findUnresolvedInternalAuraImports(root)).toEqual([]);
  });

  it("rejects static, side-effect, and dynamic Aura3D workspace imports", () => {
    const root = packageFixture([
      'export { Scene } from "@aura3d/scene";',
      'import "@aura3d/rendering";',
      'const physics = import("@aura3d/physics/world");'
    ].join("\n"));

    expect(findUnresolvedInternalAuraImports(root)).toEqual([
      "dist/index.js -> @aura3d/physics/world",
      "dist/index.js -> @aura3d/rendering",
      "dist/index.js -> @aura3d/scene"
    ]);
  });
});
