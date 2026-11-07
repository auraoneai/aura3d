// usage: node measure519.mjs <consumerRoot> <out.json>. Every emitted JS/WASM chunk per consumer build (bytes, gzip -9 bytes), the Rapier
// chunk marked by content (RAPIER / rapier_wasm / RawIntegrationParameters), plus whether the entry chunk statically imports it.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
const [root, out] = process.argv.slice(2);
const result = {};
for (const variant of ["published", "branch"]) {
  const vdir = path.join(root, variant);
  if (!fs.existsSync(vdir)) continue;
  for (const dist of fs.readdirSync(vdir).filter((d) => d.startsWith("dist-")).sort()) {
    const dir = path.join(vdir, dist, "assets");
    if (!fs.existsSync(dir)) continue;
    const chunks = fs.readdirSync(dir).filter((f) => /\.(js|wasm)$/.test(f)).sort().map((f) => {
      const buf = fs.readFileSync(path.join(dir, f));
      const text = f.endsWith(".js") ? buf.toString("utf8") : "";
      return { file: f, bytes: buf.length, gzipBytes: zlib.gzipSync(buf, { level: 9 }).length, rapier: /RAPIER|rapier_wasm|RawIntegrationParameters/.test(text), strippedStub: text.includes("physics was stripped at build time") };
    });
    const html = fs.readFileSync(path.join(vdir, dist, "index.html"), "utf8");
    const log = fs.readFileSync(path.join(vdir, `build-${dist.replace(/^dist-/, "")}.log`), "utf8");
    result[`${variant}/${dist}`] = {
      buildExit: (log.match(/exit (\d+)/) ?? [])[1],
      pluginLog: (log.match(/\[aura3d\][^\n]*/) ?? [null])[0],
      entry: (html.match(/src="\/assets\/([^"]+\.js)"/) ?? [])[1] ?? null,
      totalJsBytes: chunks.reduce((s, c) => s + c.bytes, 0),
      totalGzipBytes: chunks.reduce((s, c) => s + c.gzipBytes, 0),
      rapierChunks: chunks.filter((c) => c.rapier).map((c) => ({ file: c.file, kB: +(c.bytes / 1000).toFixed(2), gzip_kB: +(c.gzipBytes / 1000).toFixed(2) })),
      strippedStubPresent: chunks.some((c) => c.strippedStub),
      chunks
    };
  }
}
fs.writeFileSync(out, JSON.stringify(result, null, 1) + "\n");
for (const [k, v] of Object.entries(result)) console.log(k.padEnd(48), "exit", v.buildExit, "js", v.totalJsBytes, "gz", v.totalGzipBytes, "rapier", JSON.stringify(v.rapierChunks), v.strippedStubPresent ? "STUB" : "");
