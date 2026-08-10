import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: resolve(import.meta.dirname, "../../../public"),
  server: { fs: { allow: [resolve(import.meta.dirname, "../../..")] } }
});
