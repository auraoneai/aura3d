import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({ publicDir: resolve(import.meta.dirname, "../../../public"), server: { fs: { allow: [resolve(import.meta.dirname, "../../..") ] } } });
