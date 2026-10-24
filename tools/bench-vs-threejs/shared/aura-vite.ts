/* Vite config every Aura3D bench app needs to produce a browser build from the published packages (see README: "build failures"). */
import { defineConfig } from "vite";
import { auraDecodersPlugin } from "@aura3d/assets/vite";

const NODE_BUILTINS = /^(node:)?(fs|path|crypto|url|os|zlib|stream|util|buffer|module|child_process|worker_threads)$/;
const nodeBuiltinStubs = () => ({
  name: "node-builtin-stubs",
  enforce: "pre" as const,
  resolveId(id: string) { if (NODE_BUILTINS.test(id)) return `\0stub:${id}`; },
  load(id: string) { if (id.startsWith("\0stub:")) return { code: "export default {};", syntheticNamedExports: true }; }
});

export default defineConfig({ plugins: [nodeBuiltinStubs(), auraDecodersPlugin()] });
