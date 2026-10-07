// Fixture for PRD-15 T5.6. Some deprecated subpaths re-export modules that
// legitimately use node builtins (asset corpus, threejs-compat registry) —
// they were node-only before the collapse too. T5.6 restores *resolution*,
// not browser-safety, so the fixture externalizes node: builtins.
import { defineConfig } from "vite";
export default defineConfig({
  build: {
    rollupOptions: {
      external: [/^node:/, "fs", "path", "url", "os", "crypto", "stream", "util", "buffer", "events", "child_process", "worker_threads"]
    }
  }
});
