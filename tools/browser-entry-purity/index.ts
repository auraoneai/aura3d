/**
 * WS-2.3 — the binding requirement, enforced: **no `node:` import reachable from any browser entry.**
 *
 * ## Why a tool and not a comment
 *
 * `tools/bundle-size/index.ts` carries a long-standing comment marking four `node:` specifiers external
 * "for every browser bundle measurement", explaining that `FfmpegFrameEncoder` reaches
 * `node:child_process` behind a capability probe and that esbuild resolves `await import()` at build
 * time regardless. The comment is accurate and it is a workaround: it made the *measurement* succeed
 * while leaving Node builtins in the browser dependency graph.
 *
 * The PRD's requirement is not "the bundle builds" — it is that the reachability itself is gone. So this
 * tool bundles each browser entry with **no `node:` externals at all**. If a Node builtin is reachable,
 * esbuild fails to resolve it and the gate reports which entry and which specifier.
 *
 * A comment cannot fail a build. This can.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { build, type Plugin } from "esbuild";
import { writeReport, type ReleaseCheck } from "../check-common";

const REPORT_PATH = "tests/reports/browser-entry-purity.json";

/** Entry points a browser consumer is documented to import. */
const BROWSER_ENTRIES = [
  { id: "engine-agent-api", path: "packages/engine/src/agent-api/index.ts", label: "@aura3d/engine (root public entry)" },
  { id: "engine-barrel", path: "packages/engine/src/index.ts", label: "@aura3d/engine/engine" },
  { id: "rendering", path: "packages/rendering/src/index.ts", label: "@aura3d/engine/rendering" },
  { id: "rendering-webgpu", path: "packages/rendering/src/webgpu.ts", label: "@aura3d/engine/rendering/webgpu" },
  { id: "physics", path: "packages/physics/src/index.ts", label: "@aura3d/engine/physics" },
  { id: "physics-solverless", path: "packages/physics/src/solverless.ts", label: "@aura3d/engine/physics/solverless" },
  { id: "physics-world", path: "packages/physics/src/world.ts", label: "@aura3d/engine/physics/world" },
  { id: "assets-browser", path: "packages/assets/src/browser-index.ts", label: "@aura3d/engine/assets/browser" },
  { id: "animation-browser", path: "packages/animation/src/browser-index.ts", label: "@aura3d/engine/animation/browser" },
  { id: "scene", path: "packages/scene/src/index.ts", label: "@aura3d/engine/scene" },
  { id: "input", path: "packages/input/src/index.ts", label: "@aura3d/engine/input" },
  { id: "audio", path: "packages/audio/src/index.ts", label: "@aura3d/engine/audio" },
  { id: "controls", path: "packages/controls/src/index.ts", label: "@aura3d/engine/controls" }
] as const;

/**
 * Entries that are legitimately Node, listed so the distinction is explicit rather than implied by
 * absence. These are *expected* to reach `node:` builtins and are not checked for purity.
 */
const NODE_ENTRIES = [
  { id: "media-node", path: "packages/engine/src/agent-api/media-node.ts", label: "@aura3d/engine/media-node", expects: "node:child_process, node:fs/promises, node:os, node:path" }
] as const;

function auraSourceAlias(): Plugin {
  const aliases = new Map([
    ["@aura3d/engine", "packages/engine/src/agent-api/index.ts"],
    ["@aura3d/engine/media-node", "packages/engine/src/agent-api/media-node.ts"],
    ["@aura3d/rendering", "packages/rendering/src/index.ts"],
    ["@aura3d/engine/rendering", "packages/rendering/src/index.ts"],
    ["@aura3d/engine/rendering/webgpu", "packages/rendering/src/webgpu.ts"],
    ["@aura3d/assets", "packages/assets/src/browser-index.ts"],
    ["@aura3d/assets/browser", "packages/assets/src/browser-index.ts"],
    ["@aura3d/scene", "packages/scene/src/index.ts"],
    ["@aura3d/core", "packages/core/src/index.ts"],
    ["@aura3d/math", "packages/math/src/index.ts"],
    ["@aura3d/physics", "packages/physics/src/index.ts"],
    ["@aura3d/physics/solverless", "packages/physics/src/solverless.ts"],
    ["@aura3d/physics/world", "packages/physics/src/world.ts"],
    ["@aura3d/product-studio", "packages/product-studio/src/index.ts"],
    ["@aura3d/apps", "packages/apps/src/index.ts"],
    ["@aura3d/animation", "packages/animation/src/browser-index.ts"],
    ["@aura3d/input", "packages/input/src/index.ts"],
    ["@aura3d/audio", "packages/audio/src/index.ts"],
    ["@aura3d/controls", "packages/controls/src/index.ts"],
    ["@aura3d/ecs", "packages/ecs/src/index.ts"],
    ["@aura3d/workflows", "packages/workflows/src/index.ts"],
    ["@aura3d/editor-runtime", "packages/editor-runtime/src/index.ts"],
    ["@aura3d/editor", "packages/editor/src/index.ts"],
    ["@aura3d/debug", "packages/debug/src/index.ts"],
    ["@aura3d/scripting", "packages/scripting/src/index.ts"],
    ["@aura3d/materials", "packages/materials/src/index.ts"],
    ["@aura3d/environments", "packages/environments/src/index.ts"],
    ["@aura3d/asset-index", "packages/asset-index/src/index.ts"],
    ["@aura3d/three-compat", "packages/three-compat/src/index.ts"],
    ["@aura3d/test-utils", "packages/test-utils/src/index.ts"]
  ]);
  return {
    name: "aura3d-source-alias",
    setup(api) {
      api.onResolve({ filter: /^@aura3d\// }, (args) => {
        const target = aliases.get(args.path);
        return target === undefined ? undefined : { path: resolve(process.cwd(), target) };
      });
    }
  };
}

interface PurityResult {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly pure: boolean;
  /** Node builtins esbuild could not resolve, i.e. the ones actually reachable. */
  readonly reachableNodeBuiltins: readonly string[];
  readonly detail: string;
}

async function checkEntry(entry: { readonly id: string; readonly label: string; readonly path: string }): Promise<PurityResult> {
  if (!existsSync(resolve(entry.path))) {
    return { id: entry.id, label: entry.label, path: entry.path, pure: false, reachableNodeBuiltins: [], detail: `entry does not exist: ${entry.path}` };
  }
  try {
    /*
     * No `node:` externals, on purpose. `platform: "browser"` means esbuild will not silently resolve a
     * Node builtin, so an unresolvable one becomes a build error naming the specifier and the importer —
     * which is exactly the evidence this gate needs.
     */
    await build({
      absWorkingDir: process.cwd(),
      entryPoints: [entry.path],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
      logLevel: "silent",
      plugins: [auraSourceAlias()]
    });
    return { id: entry.id, label: entry.label, path: entry.path, pure: true, reachableNodeBuiltins: [], detail: `${entry.label}: no node: builtin is reachable` };
  } catch (error) {
    const messages = (error as { readonly errors?: readonly { readonly text?: string; readonly notes?: readonly { readonly text?: string }[] }[] }).errors ?? [];
    const texts = messages.map((message) => message.text ?? "").join(" | ");
    const builtins = [...new Set([...texts.matchAll(/"(node:[a-z/]+)"/g)].map((match) => match[1]!))];
    const other = builtins.length === 0 ? texts.slice(0, 400) : "";
    return {
      id: entry.id,
      label: entry.label,
      path: entry.path,
      pure: false,
      reachableNodeBuiltins: builtins,
      detail: builtins.length > 0
        ? `${entry.label}: reaches ${builtins.join(", ")} — a browser entry must not. Move the Node-only module behind its own entry point (see @aura3d/engine/media-node).`
        : `${entry.label}: bundle failed for a non-purity reason: ${other}`
    };
  }
}

async function main(): Promise<void> {
  const results = await Promise.all(BROWSER_ENTRIES.map(checkEntry));
  const nodeResults = await Promise.all(NODE_ENTRIES.map(async (entry) => {
    const result = await checkEntry(entry);
    /*
     * Inverted expectation. A Node entry SHOULD reach Node builtins; if it stops, either the capability
     * was deleted or it drifted back onto a browser-safe path, and both deserve a failing check rather
     * than a silent pass.
     */
    return {
      ...result,
      pure: !result.pure,
      detail: result.pure
        ? `${entry.label}: expected to reach ${entry.expects} but reached no node: builtin. Either the Node capability was removed, or it drifted browser-side — both need review.`
        : `${entry.label}: correctly reaches ${result.reachableNodeBuiltins.join(", ") || "node builtins"}`
    };
  }));

  const checks: ReleaseCheck[] = [
    ...results.map((result) => ({ id: `browser-entry:${result.id}`, pass: result.pure, detail: result.detail })),
    ...nodeResults.map((result) => ({ id: `node-entry:${result.id}`, pass: result.pure, detail: result.detail }))
  ];

  writeReport(REPORT_PATH, "a3d-browser-entry-purity", checks, {
    rule: "WS-2.3 — no `node:` import may be reachable from any browser entry, and no browser-only API from a Node entry. Enforced by bundling each entry with NO node: externals, so a reachable builtin becomes a resolution failure naming the specifier. tools/bundle-size marks four node: specifiers external to make its measurement succeed; that is a workaround for reachability, not proof of its absence — which is why this gate exists separately.",
    browserEntries: results,
    nodeEntries: nodeResults
  });
  for (const check of checks) console.log(`${check.pass ? "ok  " : "FAIL"} ${check.detail}`);
  console.log(`report: ${REPORT_PATH}`);
}

await main();
