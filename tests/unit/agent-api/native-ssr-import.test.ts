import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const require = createRequire(import.meta.url);
const fixture = pathToFileURL(join(root, "tests/fixtures/native-consumer/react-ssr.tsx")).href;

describe("native Node imports for React server rendering", () => {
  let tempDir: string;
  let tsconfig: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "aura3d-native-ssr-"));
    tsconfig = join(tempDir, "tsconfig.json");
    const base = JSON.parse(readFileSync(join(root, "tsconfig.base.json"), "utf8")) as {
      compilerOptions: { paths: Record<string, string[]> };
    };
    // The React adapter declares React as a peer. A source checkout can have a
    // different React symlink under packages/react; model a consumer's single
    // peer instance while still resolving the Aura3D packages to source.
    writeFileSync(tsconfig, JSON.stringify({
      extends: join(root, "tsconfig.base.json"),
      compilerOptions: {
        baseUrl: root,
        paths: {
          ...base.compilerOptions.paths,
          react: [require.resolve("react")],
          "react/jsx-runtime": [require.resolve("react/jsx-runtime")],
          "react/jsx-dev-runtime": [require.resolve("react/jsx-dev-runtime")]
        }
      }
    }));
  });

  afterAll(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  function runInFreshNode(source: string): void {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", source], {
      cwd: root,
      env: { ...process.env, NODE_OPTIONS: "", TSX_TSCONFIG_PATH: tsconfig },
      encoding: "utf8",
      timeout: 30_000
    });
    const output = [result.error?.message, result.stdout, result.stderr].filter(Boolean).join("\n");
    expect(result.status, output).toBe(0);
    expect(result.stdout, output).toContain("SSR_IMPORT_COMPLETE");
  }

  it("executes the actual SSR consumer fixture without DOM globals", () => {
    runInFreshNode(`
      import assert from "node:assert/strict";
      assert.equal(typeof globalThis.window, "undefined");
      assert.equal(typeof globalThis.document, "undefined");
      await import(${JSON.stringify(fixture)});
      assert.equal(typeof globalThis.window, "undefined");
      assert.equal(typeof globalThis.document, "undefined");
      console.log("SSR_IMPORT_COMPLETE");
    `);
  }, 40_000);

  it("imports the React entry first and preserves primitive and instance builders", () => {
    runInFreshNode(`
      import assert from "node:assert/strict";
      assert.equal(typeof globalThis.window, "undefined");
      assert.equal(typeof globalThis.document, "undefined");
      const react = await import("@aura3d/react");
      const engine = await import("@aura3d/engine");
      assert.equal(typeof react.AuraCanvas, "function");
      const transforms = [{ position: [1, 2, 3] }];
      const box = engine.primitives.box({ size: 2 }).toJSON();
      const instanced = engine.instances.box({ transforms, colors: ["#f00"] }).toJSON();
      assert.equal(box.primitive, "box");
      assert.equal(box.size, 2);
      assert.deepEqual(instanced.instances, transforms);
      assert.deepEqual(instanced.instanceColors, ["#f00"]);
      assert.equal(instanced.ignoredOptions, undefined);
      const invalid = engine.instances.box({ transforms, unknownOption: true }).toJSON();
      assert.match(invalid.ignoredOptions[0], /^OPTION_IGNORED instances\\.box:/);
      assert.throws(() => engine.primitives.box({ params: { radius: 1 } }), /no effect/);
      assert.equal(typeof globalThis.document, "undefined");
      console.log("SSR_IMPORT_COMPLETE");
    `);
  }, 40_000);
});
