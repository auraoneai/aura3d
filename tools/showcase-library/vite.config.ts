import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import rootConfig from "../../vite.config";

const routeGateConfigPath = resolve(__dirname, "route-gates.json");
const routeGateConfig = JSON.parse(readFileSync(routeGateConfigPath, "utf8")) as {
  routes?: readonly { id?: string; published?: boolean }[];
};
const showcaseRoutes = new Set(
  (routeGateConfig.routes ?? [])
    .filter((route) => route.published)
    .map((route) => route.id)
    .filter((id): id is string => Boolean(id))
);

const routeId = process.env.A3D_SHOWCASE_APP;
if (!routeId || !showcaseRoutes.has(routeId)) {
  throw new Error(
    `Set A3D_SHOWCASE_APP to one of: ${[...showcaseRoutes].join(", ")}`
  );
}

const auraRoot = resolve(__dirname, "../..");
const appDir = resolve(auraRoot, "apps", routeId);
const rootResolve = rootConfig.resolve ?? {};
const rootAlias = Array.isArray(rootResolve.alias)
  ? rootResolve.alias
  : rootResolve.alias
    ? [rootResolve.alias]
    : [];

export default defineConfig({
  root: auraRoot,
  base: "./",
  plugins: rootConfig.plugins ?? [],
  resolve: {
    ...rootResolve,
    alias: [
      { find: /^@aura3d\/engine\/rendering$/, replacement: resolve(auraRoot, "packages/rendering/src/index.ts") },
      { find: /^@aura3d\/engine\/scene$/, replacement: resolve(auraRoot, "packages/scene/src/index.ts") },
      ...rootAlias
    ]
  },
  optimizeDeps: rootConfig.optimizeDeps,
  publicDir: resolve(auraRoot, "public"),
  build: {
    target: "es2022",
    outDir: resolve(appDir, "dist"),
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      input: resolve(appDir, "index.html")
    }
  }
});
