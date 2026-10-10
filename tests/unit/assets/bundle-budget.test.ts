/**
 * PRD-16 05-S11 — decoder bundle budgets on the default model() path:
 *   - initial growth ≤ 3 KB gz (decoder wiring delta on the engine entry)
 *   - meshopt decoder lazy, ≤ 20 KB gz (vendored file, runtime URL fetch)
 *   - draco + basis + wasm decoders never enter an initial JS chunk —
 *     they load through `${basePath}...` dynamic-import URLs, so esbuild
 *     must not attribute any packages/assets/vendor/ input to the bundle.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build, type Plugin } from "esbuild";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..", "..", "..");
const MESHOPT_VENDOR = "packages/assets/vendor/meshopt/meshopt_decoder.mjs";
const BUDGET_INITIAL_GROWTH_GZ = 3 * 1024;
const BUDGET_MESHOPT_GZ = 20 * 1024;

function loadGeneratedAliases(): Map<string, string> {
  const generated = JSON.parse(readFileSync(resolve(root, "tsconfig.paths.generated.json"), "utf8")) as {
    compilerOptions?: { paths?: Record<string, string[]> };
  };
  const aliases = new Map<string, string>();
  for (const [specifier, targets] of Object.entries(generated.compilerOptions?.paths ?? {})) {
    const target = targets[0];
    if (!target || specifier.includes("*") || target.includes("*")) continue;
    aliases.set(specifier, resolve(root, target));
  }
  return aliases;
}

const aliasPlugin: Plugin = {
  name: "aura3d-source-alias",
  setup(buildApi) {
    const aliases = loadGeneratedAliases();
    buildApi.onResolve({ filter: /^@aura3d\// }, (args) => {
      const target = aliases.get(args.path);
      return target ? { path: target } : undefined;
    });
  },
};

async function bundle(stdinContents: string) {
  const result = await build({
    stdin: { contents: stdinContents, resolveDir: root, loader: "ts" },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    minify: true,
    metafile: true,
    plugins: [aliasPlugin],
    external: ["three", "node:*"],
  });
  return {
    gzipBytes: gzipSync(result.outputFiles[0]!.contents).length,
    inputs: Object.keys(result.metafile?.inputs ?? {}),
  };
}

const ENGINE_ENTRY = 'export * from "./packages/engine/src/public/index.ts";';
const DECODER_ENTRY = `${ENGINE_ENTRY}\nexport { createAppAssetDecoders } from "./packages/engine/src/agent-api/AssetDecoders";`;

describe("PRD-05 bundle budgets", () => {
  it("decoder wiring adds ≤ 3 KB gz to the initial engine bundle", async () => {
    const base = await bundle(ENGINE_ENTRY);
    const withDecoders = await bundle(DECODER_ENTRY);
    expect(withDecoders.gzipBytes - base.gzipBytes).toBeLessThanOrEqual(BUDGET_INITIAL_GROWTH_GZ);
  }, 120_000);

  it("keeps vendored decoders (draco/basis/meshopt + wasm) out of the bundle", async () => {
    const { inputs } = await bundle(DECODER_ENTRY);
    const vendored = inputs.filter((input) => input.replaceAll("\\", "/").includes("packages/assets/vendor/"));
    expect(vendored).toEqual([]);
    const wasm = inputs.filter((input) => input.endsWith(".wasm"));
    expect(wasm).toEqual([]);
  }, 120_000);

  it("vendored meshopt decoder stays ≤ 20 KB gz", () => {
    const file = resolve(root, MESHOPT_VENDOR);
    expect(existsSync(file)).toBe(true);
    expect(gzipSync(readFileSync(file)).length).toBeLessThanOrEqual(BUDGET_MESHOPT_GZ);
  });
});
