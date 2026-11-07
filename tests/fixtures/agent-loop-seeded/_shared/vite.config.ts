// Builds a seeded or staged scene from monorepo source (the same aliases the repo uses for recipes-src), with cwd = the scene folder.
//   cd tests/fixtures/agent-loop-seeded/<scene> && npm run build
import rootConfig, { createSourceWorkerEntryPlugin } from "../../../../vite.config";

export default {
  base: "./",
  resolve: rootConfig.resolve,
  plugins: [createSourceWorkerEntryPlugin()],
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" }
};
