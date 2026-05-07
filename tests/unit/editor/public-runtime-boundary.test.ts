import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const editorSourceRoot = join(process.cwd(), "apps/editor/src");

describe("editor public runtime boundary", () => {
  it("keeps editor UI operations behind EditorRuntime public methods", () => {
    const violations: string[] = [];
    for (const file of listTypeScriptFiles(editorSourceRoot)) {
      const source = readFileSync(file, "utf8");
      const relativeFile = relative(process.cwd(), file);
      const forbidden = [
        /runtime\.selection\./g,
        /runtime\.history\b/g,
        /runtime\.diagnostics\./g,
        /new\s+CommandHistory\s*\(/g,
        /new\s+PickingService\s*\(/g,
        /new\s+TranslateGizmo\s*\(/g,
        /new\s+RotateGizmo\s*\(/g,
        /new\s+ScaleGizmo\s*\(/g
      ];

      for (const pattern of forbidden) {
        const matches = source.match(pattern) ?? [];
        for (const match of matches) {
          violations.push(`${relativeFile}: ${match}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

function listTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...listTypeScriptFiles(path));
    } else if (path.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}
