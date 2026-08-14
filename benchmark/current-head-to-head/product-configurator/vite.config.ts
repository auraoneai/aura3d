import { resolve } from "node:path";
import { createReadStream } from "node:fs";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: resolve(import.meta.dirname, "../../../public"),
  plugins: [{
    name: "aura3d-product-configurator-fixtures",
    configureServer(server) {
      server.middlewares.use("/fixtures", (request, response, next) => {
        const relativePath = request.url?.split("?", 1)[0]?.replace(/^\//, "");
        if (!relativePath || relativePath.includes("..")) return next();
        const fixture = resolve(import.meta.dirname, "../../../fixtures", relativePath);
        response.setHeader("content-type", fixture.endsWith(".hdr") ? "application/octet-stream" : "application/octet-stream");
        createReadStream(fixture).on("error", next).pipe(response);
      });
    }
  }],
  server: { fs: { allow: [resolve(import.meta.dirname, "../../..")] } }
});
