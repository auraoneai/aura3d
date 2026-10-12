#!/usr/bin/env node
// Bundle diagnostic (#1140 follow-up): build a scaffolded template once more
// with a plugin that records how Rollup sees the lane barrels — resolved id,
// moduleSideEffects, importers, and whether the module made it into a chunk.
//   node tools/quality-rebuild-capture/bundle-diag.mjs <scaffold-dir> <out.json>
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [dir, outFile] = process.argv.slice(2);
const { build } = await import(pathToFileURL(path.join(dir, "node_modules/vite/dist/node/index.js")).href).catch(
  () => import("vite")
);
const watched = /lanes[\\/](index|prd01)\.js$|ProgramGenerator\.js$|engine[\\/]public[\\/]index\.js$|rendering[\\/]index\.js$/;
const report = { resolves: [], modules: [], chunks: {} };
await build({
  root: dir,
  configFile: path.join(dir, "vite.config.ts"),
  logLevel: "warn",
  build: { outDir: path.join(dir, "dist-diag"), emptyOutDir: true, minify: false },
  plugins: [{
    name: "aura-bundle-diag",
    async resolveId(source, importer, options) {
      if (!/lanes|engine$|public\/index|rendering$/.test(source)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      report.resolves.push({ source, importer: importer && path.relative(dir, importer), id: resolved?.id, moduleSideEffects: resolved?.moduleSideEffects });
      return resolved;
    },
    generateBundle(_options, bundle) {
      for (const id of this.getModuleIds()) {
        if (!watched.test(id)) continue;
        const info = this.getModuleInfo(id);
        report.modules.push({ id, hasModuleSideEffects: info?.moduleSideEffects, importers: info?.importers?.slice(0, 4), dynamicImporters: info?.dynamicImporters?.slice(0, 4), isIncluded: info?.isIncluded });
      }
      for (const [file, chunk] of Object.entries(bundle)) {
        if (chunk.type === "chunk") report.chunks[file] = { isEntry: chunk.isEntry, isDynamicEntry: chunk.isDynamicEntry, laneModules: Object.keys(chunk.modules).filter((m) => watched.test(m)) };
      }
    }
  }]
});
writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(`[bundle-diag] ${report.modules.length} watched modules, ${report.resolves.length} resolves -> ${outFile}`);
