import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `tests/assets/**` is a vitest suite that the 3.0.1 obligation ledger names as
    // production-path evidence (for example tests/assets/gltf-extension-support.test.ts for
    // M1). It was absent from `include`, so passing such a file on the command line matched
    // nothing: vitest treats positional arguments as filters against `include`, reported
    // "No test files found", and existing scripts silently ran fewer files than they named
    // (animation-runtime:unit:raw named three files and executed two).
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/assets/**/*.test.ts", "tests/qr/**/*.test.ts"],
    setupFiles: [],
    // Workspace packages publish `exports` to ./dist, which does not exist in a
    // source checkout; externalizing them would bypass the resolve.alias entries
    // below that map every @aura3d specifier to src/. Inline so aliases win.
    server: { deps: { inline: [/^@aura3d\//, /^@aura3d$/] } },
    coverage: {
      reporter: ["text", "json"]
    }
  },
  resolve: {
    alias: {
      "@aura3d/math": new URL("./packages/math/src/index.ts", import.meta.url).pathname,
      "@aura3d/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@aura3d/scene/math": new URL("./packages/scene/src/MathTypes.ts", import.meta.url).pathname,
      "@aura3d/scene": new URL("./packages/scene/src/index.ts", import.meta.url).pathname,
      "@aura3d/ecs": new URL("./packages/ecs/src/index.ts", import.meta.url).pathname,
      // @aura3d/lean* subpaths precede the package root (prefix match, declaration order).
      "@aura3d/lean/product": new URL("./packages/lean/src/product.ts", import.meta.url).pathname,
      "@aura3d/lean/game": new URL("./packages/lean/src/game.ts", import.meta.url).pathname,
      "@aura3d/lean": new URL("./packages/lean/src/index.ts", import.meta.url).pathname,
      /*
       * Aura3D Quality Rebuild contract subpaths (CONTRACTS.md §3.8). Prefix
       * matching is declaration-ordered, so every key here sits before its
       * package root for the same reason documented below.
       */
      "@aura3d/rendering/contracts/flags.state": new URL("./packages/rendering/src/contracts/flags.state.ts", import.meta.url).pathname,
      "@aura3d/rendering/contracts": new URL("./packages/rendering/src/contracts/index.ts", import.meta.url).pathname,
      "@aura3d/rendering/lanes": new URL("./packages/rendering/src/lanes/index.ts", import.meta.url).pathname,
      // PRD-15 T5.6 — package specifiers the deprecated engine stubs re-export
      // through (deeper-first before the bare package row: prefix matching).
      "@aura3d/rendering/production-runtime": new URL("./packages/rendering/src/production-runtime/index.ts", import.meta.url).pathname,
      "@aura3d/rendering/advanced-runtime": new URL("./packages/rendering/src/advanced-runtime/index.ts", import.meta.url).pathname,
      "@aura3d/rendering/webgpu": new URL("./packages/rendering/src/webgpu.ts", import.meta.url).pathname,
      "@aura3d/rendering": new URL("./packages/rendering/src/index.ts", import.meta.url).pathname,
      "@aura3d/controls": new URL("./packages/controls/src/index.ts", import.meta.url).pathname,
      /*
       * These `@aura3d/engine/*` subpaths MUST sit above the bare "@aura3d/engine" below.
       *
       * Vitest matches string aliases by prefix in declaration order, so with the bare specifier first,
       * `@aura3d/engine/media-node` resolves to `packages/engine/src/index.ts/media-node` and every
       * importing module fails with "Cannot find module". Caught by WS-3.4: the animation-studio render
       * scripts import the media-node entry, and render-quality-phase-m.test.ts could not load at all.
       *
       * PRD-15 §6.1: live subpaths resolve to their aura.exports.json entry
       * sources; removed subpaths resolve to the deprecated stubs (which
       * re-export their old `of` source and console.warn once until 4.0.0).
       */
      // deprecated subpaths whose prefix collides with a live parent MUST
      // precede that parent (assets/*, animation/browser, workflows/*,
      // scene-kits/*, rendering/*).
      "@aura3d/engine/rendering/production-runtime": new URL("./packages/engine/src/deprecated/rendering-production-runtime.ts", import.meta.url).pathname,
      "@aura3d/engine/rendering/advanced-runtime": new URL("./packages/engine/src/deprecated/rendering-advanced-runtime.ts", import.meta.url).pathname,
      "@aura3d/engine/rendering/webgpu": new URL("./packages/engine/src/deprecated/rendering-webgpu.ts", import.meta.url).pathname,
      "@aura3d/engine/rendering": new URL("./packages/engine/src/deprecated/rendering.ts", import.meta.url).pathname,
      "@aura3d/engine/assets/asset-corpus": new URL("./packages/engine/src/deprecated/assets-asset-corpus.ts", import.meta.url).pathname,
      "@aura3d/engine/assets/advanced-gallery": new URL("./packages/engine/src/deprecated/assets-advanced-gallery.ts", import.meta.url).pathname,
      "@aura3d/engine/assets/production-runtime": new URL("./packages/engine/src/deprecated/assets-production-runtime.ts", import.meta.url).pathname,
      "@aura3d/engine/assets/gltf-runtime": new URL("./packages/engine/src/deprecated/assets-gltf-runtime.ts", import.meta.url).pathname,
      "@aura3d/engine/assets/browser": new URL("./packages/engine/src/deprecated/assets-browser.ts", import.meta.url).pathname,
      "@aura3d/engine/animation/browser": new URL("./packages/engine/src/deprecated/animation-browser.ts", import.meta.url).pathname,
      "@aura3d/engine/workflows/production-runtime": new URL("./packages/engine/src/deprecated/workflows-production-runtime.ts", import.meta.url).pathname,
      "@aura3d/engine/workflows/production": new URL("./packages/engine/src/deprecated/workflows-production.ts", import.meta.url).pathname,
      "@aura3d/engine/scene-kits/particle-fountain": new URL("./packages/engine/src/deprecated/scene-kits-particle-fountain.ts", import.meta.url).pathname,
      "@aura3d/engine/scene-kits/humanoid-walk": new URL("./packages/engine/src/deprecated/scene-kits-humanoid-walk.ts", import.meta.url).pathname,
      "@aura3d/engine/scene-kits/product-viewer": new URL("./packages/engine/src/deprecated/scene-kits-product-viewer.ts", import.meta.url).pathname,
      // live §6.1 subpaths — deeper-first
      "@aura3d/engine/scene/math": new URL("./packages/scene/src/MathTypes.ts", import.meta.url).pathname,
      "@aura3d/engine/physics/solverless": new URL("./packages/physics/src/solverless.ts", import.meta.url).pathname,
      "@aura3d/engine/physics/world": new URL("./packages/physics/src/world.ts", import.meta.url).pathname,
      "@aura3d/engine/renderer": new URL("./packages/engine/src/public/renderer.ts", import.meta.url).pathname,
      "@aura3d/engine/devtools": new URL("./packages/engine/src/public/devtools.ts", import.meta.url).pathname,
      "@aura3d/engine/assets": new URL("./packages/assets/src/index.ts", import.meta.url).pathname,
      "@aura3d/engine/animation": new URL("./packages/animation/src/index.ts", import.meta.url).pathname,
      "@aura3d/engine/physics": new URL("./packages/physics/src/index.ts", import.meta.url).pathname,
      "@aura3d/engine/audio": new URL("./packages/audio/src/index.ts", import.meta.url).pathname,
      "@aura3d/engine/input": new URL("./packages/input/src/index.ts", import.meta.url).pathname,
      "@aura3d/engine/controls": new URL("./packages/controls/src/index.ts", import.meta.url).pathname,
      "@aura3d/engine/scene": new URL("./packages/scene/src/index.ts", import.meta.url).pathname,
      "@aura3d/engine/math": new URL("./packages/math/src/index.ts", import.meta.url).pathname,
      "@aura3d/engine/scripting": new URL("./packages/scripting/src/index.ts", import.meta.url).pathname,
      "@aura3d/engine/editor-runtime": new URL("./packages/editor-runtime/src/index.ts", import.meta.url).pathname,
      "@aura3d/engine/workflows": new URL("./packages/workflows/src/index.ts", import.meta.url).pathname,
      "@aura3d/engine/ecs": new URL("./packages/ecs/src/index.ts", import.meta.url).pathname,
      // deprecated single-level subpaths → re-export stubs (T5.6)
      "@aura3d/engine/production-runtime": new URL("./packages/engine/src/deprecated/production-runtime.ts", import.meta.url).pathname,
      "@aura3d/engine/advanced-runtime": new URL("./packages/engine/src/deprecated/advanced-runtime.ts", import.meta.url).pathname,
      "@aura3d/engine/media-node": new URL("./packages/engine/src/deprecated/media-node.ts", import.meta.url).pathname,
      "@aura3d/engine/lean-product": new URL("./packages/engine/src/deprecated/lean-product.ts", import.meta.url).pathname,
      "@aura3d/engine/lean-game": new URL("./packages/engine/src/deprecated/lean-game.ts", import.meta.url).pathname,
      "@aura3d/engine/lean": new URL("./packages/engine/src/deprecated/lean.ts", import.meta.url).pathname,
      "@aura3d/engine/contracts": new URL("./packages/engine/src/deprecated/contracts.ts", import.meta.url).pathname,
      "@aura3d/engine/core": new URL("./packages/engine/src/deprecated/core.ts", import.meta.url).pathname,
      "@aura3d/engine/environments": new URL("./packages/engine/src/deprecated/environments.ts", import.meta.url).pathname,
      "@aura3d/engine/materials": new URL("./packages/engine/src/deprecated/materials.ts", import.meta.url).pathname,
      "@aura3d/engine/product-studio": new URL("./packages/engine/src/deprecated/product-studio.ts", import.meta.url).pathname,
      "@aura3d/engine/apps": new URL("./packages/engine/src/deprecated/apps.ts", import.meta.url).pathname,
      "@aura3d/engine/engine": new URL("./packages/engine/src/deprecated/engine.ts", import.meta.url).pathname,
      "@aura3d/engine/create-aura3d": new URL("./packages/engine/src/deprecated/create-aura3d.ts", import.meta.url).pathname,
      "@aura3d/engine/editor": new URL("./packages/engine/src/deprecated/editor.ts", import.meta.url).pathname,
      "@aura3d/engine/debug": new URL("./packages/engine/src/deprecated/debug.ts", import.meta.url).pathname,
      "@aura3d/engine-runtime/contracts": new URL("./packages/engine/src/contracts/index.ts", import.meta.url).pathname,
      "@aura3d/engine-runtime": new URL("./packages/engine/src/deprecated/engine-runtime.ts", import.meta.url).pathname,
      "@aura3d/engine/lanes": new URL("./packages/engine/src/lanes/index.ts", import.meta.url).pathname,
      "@aura3d/engine-runtime/lanes": new URL("./packages/engine/src/lanes/index.ts", import.meta.url).pathname,
      "@aura3d/animation/pose": new URL("./packages/animation/src/contracts/pose.ts", import.meta.url).pathname,
      "@aura3d/animation/contracts": new URL("./packages/animation/src/contracts/pose.ts", import.meta.url).pathname,
      "@aura3d/game/art": new URL("./packages/game/src/art/index.ts", import.meta.url).pathname,
      "@aura3d/game/capture": new URL("./packages/game/src/capture/index.ts", import.meta.url).pathname,
      "@aura3d/game": new URL("./packages/game/src/index.ts", import.meta.url).pathname,
      "@aura3d/audio/contracts": new URL("./packages/audio/src/contracts/gameSound.ts", import.meta.url).pathname,
      "@aura3d/assets/contracts": new URL("./packages/assets/src/contracts/decoders.ts", import.meta.url).pathname,
      "@aura3d/cli/contracts": new URL("./packages/aura3d-cli/src/contracts/commands.ts", import.meta.url).pathname,
      "@aura3d/engine": new URL("./packages/engine/src/public/index.ts", import.meta.url).pathname,
      "@aura3d/cli": new URL("./packages/aura3d-cli/src/index.ts", import.meta.url).pathname,
      "@aura3d/react": new URL("./packages/react/src/index.ts", import.meta.url).pathname,
      "@aura3d/three-compat": new URL("./packages/three-compat/src/index.ts", import.meta.url).pathname,
      "@aura3d/apps": new URL("./packages/apps/src/index.ts", import.meta.url).pathname,
      "@aura3d/create-aura3d": new URL("./packages/create-aura3d/src/index.ts", import.meta.url).pathname,
      "create-aura3d": new URL("./packages/create-aura3d/src/index.ts", import.meta.url).pathname,
      "@aura3d/product-studio": new URL("./packages/product-studio/src/index.ts", import.meta.url).pathname,
      /*
       * WS-2.2 subpaths. Order matters here: Vitest matches string aliases by prefix, so the more
       * specific "@aura3d/physics/solverless" must be listed BEFORE "@aura3d/physics" or it resolves to
       * "packages/physics/src/index.ts/solverless" and every importing test fails to load.
       */
      "@aura3d/physics/world": new URL("./packages/physics/src/world.ts", import.meta.url).pathname,
      "@aura3d/physics/solverless": new URL("./packages/physics/src/solverless.ts", import.meta.url).pathname,
      "@aura3d/physics-rapier": new URL("./packages/physics-rapier/src/index.ts", import.meta.url).pathname,
      "@aura3d/navigation-recast": new URL("./packages/navigation-recast/src/index.ts", import.meta.url).pathname,
      "@aura3d/physics": new URL("./packages/physics/src/index.ts", import.meta.url).pathname,
      // PRD-15 T5.6 — deeper package specifiers the deprecated engine stubs
      // re-export through; must precede the bare package rows (prefix match).
      "@aura3d/animation/browser": new URL("./packages/animation/src/browser-index.ts", import.meta.url).pathname,
      "@aura3d/workflows/production-runtime": new URL("./packages/workflows/src/production-runtime/index.ts", import.meta.url).pathname,
      "@aura3d/environments": new URL("./packages/environments/src/index.ts", import.meta.url).pathname,
      "@aura3d/materials": new URL("./packages/materials/src/index.ts", import.meta.url).pathname,
      "@aura3d/animation": new URL("./packages/animation/src/index.ts", import.meta.url).pathname,
      "@aura3d/assets/asset-corpus": new URL("./packages/assets/src/asset-corpus/index.ts", import.meta.url).pathname,
      "@aura3d/assets/advanced-gallery": new URL("./packages/assets/src/advanced-gallery/index.ts", import.meta.url).pathname,
      "@aura3d/assets/gltf-runtime": new URL("./packages/assets/src/gltf-runtime.ts", import.meta.url).pathname,
      "@aura3d/assets/browser": new URL("./packages/assets/src/browser-index.ts", import.meta.url).pathname,
      "@aura3d/assets": new URL("./packages/assets/src/index.ts", import.meta.url).pathname,
      "@aura3d/input": new URL("./packages/input/src/index.ts", import.meta.url).pathname,
      "@aura3d/audio": new URL("./packages/audio/src/index.ts", import.meta.url).pathname,
      "@aura3d/scripting": new URL("./packages/scripting/src/index.ts", import.meta.url).pathname,
      "@aura3d/workflows": new URL("./packages/workflows/src/index.ts", import.meta.url).pathname,
      "@aura3d/editor-runtime": new URL("./packages/editor-runtime/src/index.ts", import.meta.url).pathname,
      "@aura3d/editor": new URL("./packages/editor/src/index.ts", import.meta.url).pathname,
      "@aura3d/debug": new URL("./packages/debug/src/index.ts", import.meta.url).pathname,
      "@aura3d/asset-index": new URL("./packages/asset-index/src/index.ts", import.meta.url).pathname
    }
  }
});
