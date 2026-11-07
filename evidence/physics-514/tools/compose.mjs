// Writes evidence/physics-514/{bundle-sizes.json, clean-consumer-*.json/png} from the measured consumer builds and captures.
import fs from "node:fs";
import path from "node:path";
const W = "/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_37e6949c-ca0-1";
const E = path.join(W, "evidence/physics-514");
const O = "/tmp/fx517-phys2";
const sizes = JSON.parse(fs.readFileSync(`${O}/bundle-sizes.json`, "utf8"));
const cap = (n) => { const f = `${O}/consumer-frames/${n}.json`; return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };
const sha = (v) => fs.readFileSync(`${O}/consumer/${v}/engine-tarball.sha1`, "utf8").trim().split(/\s+/)[0];
const fetched = (n) => { const c = cap(n); return c ? { rapierChunkFetchedAtStartup: c.fetchedScripts.some((u) => /\/rapier-[^/]+\.js$/.test(u)), fetchedScripts: c.fetchedScripts } : "not captured"; };
const row = (k) => { const s = sizes[k]; return { buildExit: s.buildExit, totalJsBytes: s.totalJsBytes, totalGzip9Bytes: s.totalGzipBytes, rapierChunks: s.rapierChunks, chunks: s.chunks.map((c) => ({ file: c.file, bytes: c.bytes, gzip9Bytes: c.gzipBytes })) }; };
const out = {
  question: "Does installing @dimforge/rapier3d-compat add an eagerly loaded chunk to apps that never use physics, and does this branch change that?",
  answer: "Yes, and no. With Rapier installed, a no-physics app emits one Rapier chunk of 2853.75 kB (1082.64 kB gzip -9) and the browser fetches it at startup, with the published 5.0.2 engine and with this branch alike (also under the aura3d-no-tla condition). Without Rapier installed nothing Rapier-related is emitted.",
  setup: {
    consumer: "Clean Vite 8 project (node_modules = npm install of the @aura3d/engine@5.0.2 dependency tree + vite + typescript + @dimforge/rapier3d-compat@0.20.0); @aura3d/engine replaced by the tarball under test. 'absent' = node_modules/@dimforge moved away before the build.",
    apps: { nophys: "src/main.ts: createAuraApp with one lit box, no physics", phys: "phys/main.ts: recipe 16 (docs/agents/recipes-src/physics-basics/main.ts)" },
    engineTarballs: { published: { source: "npm pack @aura3d/engine@5.0.2", sha1: sha("published") }, branch: { source: "pnpm build && npm pack of this branch (lane/514-physics-out-of-box, engine source as of 59106f712)", sha1: sha("branch") } },
    gzip: "zlib level 9 over each emitted file",
    fetch: "headless Chrome via loopback CDP, Network.requestWillBeSent over 8 s after navigation (tools/ccap.mjs)",
    tools: "evidence/physics-514/tools/{consumer.sh,measure.mjs,ccap.mjs}"
  },
  noPhysicsApp: {
    "published 5.0.2, rapier absent": { ...row("published/dist-nophys-absent") },
    "published 5.0.2, rapier installed": { ...row("published/dist-nophys-present"), runtime: fetched("published-nophys-present") },
    "branch, rapier absent": { ...row("branch/dist-nophys-absent"), runtime: fetched("branch-nophys-absent") },
    "branch, rapier installed": { ...row("branch/dist-nophys-present"), runtime: fetched("branch-nophys-present") },
    "branch, rapier installed, aura3d-no-tla condition": { ...row("branch/dist-nophys-notla-present"), runtime: fetched("branch-nophys-notla-present") }
  },
  physicsApp: {
    "published 5.0.2, rapier absent": row("published/dist-phys-absent"),
    "published 5.0.2, rapier installed": row("published/dist-phys-present"),
    "branch, rapier absent": row("branch/dist-phys-absent"),
    "branch, rapier installed": row("branch/dist-phys-present")
  }
};
fs.writeFileSync(path.join(E, "bundle-sizes.json"), JSON.stringify(out, null, 1) + "\n");
const report = (name, label) => {
  const c = cap(name);
  return { engine: label, engineTarballSha1: sha(name.startsWith("published") ? "published" : "branch"), app: "phys/main.ts (recipe 16)", ...c, dist: path.basename(c.dist) };
};
fs.writeFileSync(path.join(E, "clean-consumer-absent-report.json"), JSON.stringify({
  note: "Rapier absent. Produced by the branch engine tarball; the message is asserted verbatim by tests/unit/physics/backend-missing.test.ts (EXPECTED_MESSAGE). The published 5.0.2 run is included for comparison (its message is the old untyped one).",
  branch: report("branch-phys-absent", "branch tarball"),
  published_5_0_2: cap("published-phys-absent") ? report("published-phys-absent", "@aura3d/engine@5.0.2 from npm") : "not captured"
}, null, 1) + "\n");
fs.writeFileSync(path.join(E, "clean-consumer-present-report.json"), JSON.stringify({ note: "Rapier installed, ?steps=140 (simulation frozen after 140 fixed steps).", branch: report("branch-phys-present", "branch tarball") }, null, 1) + "\n");
fs.copyFileSync(`${O}/consumer-frames/branch-phys-absent.png`, path.join(E, "clean-consumer-backend-missing.png"));
fs.copyFileSync(`${O}/consumer-frames/branch-phys-present.png`, path.join(E, "clean-consumer-present-steps140.png"));
console.log("ok");
