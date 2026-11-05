import { createRequire } from "node:module";
import { join } from "node:path";
import { createServer as createViteServer, type Alias, type InlineConfig, type ViteDevServer } from "vite";

/**
 * Candidate fixture servers use `root: process.cwd()`, so Vite's default watcher registers every
 * file of the repository (including assets/packs). The ACR container's inotify limit is smaller
 * than that, and the resulting ENOSPC kills the test worker. Fixture servers serve static files
 * and never need HMR, so file watching is disabled (`ignored: ["**"]`; `watch: null` is not honoured after config merging).
 */
export function createServer(config: InlineConfig): Promise<ViteDevServer> {
  return createViteServer({
    ...config,
    resolve: { ...config.resolve, alias: [...aliasList(config.resolve?.alias), ...missingOptionalPeerAliases()] },
    // `watch: null` is dropped by Vite's mergeConfig (null/undefined overrides are skipped) whenever a vite.config.ts
    // defines `server`, which re-enables the default watcher over the whole repository. Ignore every path instead.
    server: { ...config.server, watch: { ...config.server?.watch, ignored: ["**"] } }
  });
}

function aliasList(alias: NonNullable<InlineConfig["resolve"]>["alias"]): Alias[] {
  if (!alias) return [];
  return Array.isArray(alias) ? [...alias] : Object.entries(alias).map(([find, replacement]) => ({ find, replacement }));
}

/**
 * Optional peers of the packed engine (physics-rapier, navigation-recast) are not installed in the
 * restored candidate consumer. When the consumer cannot resolve one, serve the repository's pinned
 * third-party copy. Aura3D packages are never aliased here.
 */
function missingOptionalPeerAliases(): Array<{ find: RegExp; replacement: string }> {
  const consumer = process.env.A3D_INSTALLED_PACKAGE_ROOT;
  if (!consumer) return [];
  const fromConsumer = createRequire(join(consumer, "package.json"));
  const fromRepository = createRequire(join(process.cwd(), "package.json"));
  const aliases: Array<{ find: RegExp; replacement: string }> = [];
  for (const name of ["@dimforge/rapier3d-compat", "recast-navigation"]) {
    try { fromConsumer.resolve(name); continue; } catch { /* absent from the consumer */ }
    try { aliases.push({ find: new RegExp(`^${name.replace(/[/@.-]/g, "\\$&")}$`), replacement: fromRepository.resolve(name) }); } catch { /* absent from the repository too */ }
  }
  return aliases;
}
