import { defineConfig } from "vite";
import rootConfig from "../../vite.config";

// Build config for audit frame checks: the root alias set, no public dir copy (stage-dist.mjs stages the assets the app uses).
export default defineConfig({
  plugins: rootConfig.plugins ?? [],
  resolve: rootConfig.resolve,
  optimizeDeps: rootConfig.optimizeDeps,
  publicDir: false
});
