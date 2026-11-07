// usage: node measure.mjs <consumerRoot> <out.json>. Lists every emitted JS/WASM chunk (bytes, gzip bytes) per consumer build and marks the Rapier chunk.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
const [root, out] = process.argv.slice(2);
const result = {};
for (const variant of ["published", "branch"]) {
  for (const dist of ["dist-nophys-absent", "dist-nophys-present", "dist-nophys-notla-present", "dist-phys-absent", "dist-phys-present"]) {
    const dir = path.join(root, variant, dist, "assets");
    if (!fs.existsSync(dir)) continue;
    const chunks = fs.readdirSync(dir).filter((f) => /\.(js|wasm)$/.test(f)).sort().map((f) => {
      const buf = fs.readFileSync(path.join(dir, f));
      const text = f.endsWith(".js") ? buf.toString("utf8") : "";
      return { file: f, bytes: buf.length, gzipBytes: zlib.gzipSync(buf, { level: 9 }).length, rapier: /RAPIER|rapier_wasm|RawIntegrationParameters/.test(text) };
    });
    const log = fs.readFileSync(path.join(root, variant, `build-${dist.replace(/^dist-/, "")}.log`), "utf8");
    result[`${variant}/${dist}`] = {
      buildExit: (log.match(/exit (\d+)/) ?? [])[1],
      totalJsBytes: chunks.reduce((s, c) => s + c.bytes, 0),
      totalGzipBytes: chunks.reduce((s, c) => s + c.gzipBytes, 0),
      rapierChunks: chunks.filter((c) => c.rapier).map((c) => ({ file: c.file, kB: +(c.bytes / 1000).toFixed(2), gzip_kB: +(c.gzipBytes / 1000).toFixed(2) })),
      chunks
    };
  }
}
fs.writeFileSync(out, JSON.stringify(result, null, 1) + "\n");
for (const [k, v] of Object.entries(result)) console.log(k, "exit", v.buildExit, "js", v.totalJsBytes, "gz", v.totalGzipBytes, "rapier", JSON.stringify(v.rapierChunks));
