// Writes evidence/physics-519/{bundle-sizes.json, consumer-captures.json, consumer-frames/*.png} from the lane 519 consumer builds
// (/tmp/phys519/bundle-sizes-raw.json, measure519.mjs) and captures (/tmp/phys519/frames, ccap519.mjs). Byte-identical frames are stored once.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const E = "/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_5b8956aa-712-1/evidence/physics-519";
const F = "/tmp/phys519/frames";
const raw = JSON.parse(fs.readFileSync("/tmp/phys519/bundle-sizes-raw.json", "utf8"));
const sha1 = (v) => fs.readFileSync(`/tmp/phys519/consumer/${v}/engine-tarball.sha1`, "utf8").trim().split(/\s+/)[0];
const cap = (name) => { const f = `${F}/${name}.json`; return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };
const runtime = (name) => {
  const c = cap(name);
  if (!c) return "not captured";
  const rapier = c.networkTimeline.filter((e) => /\/rapier-[^/]+\.js$/.test(e.url));
  return {
    rapierChunkFetched: rapier.length > 0,
    rapierFetchedAtMs: rapier[0]?.ms ?? null,
    scriptsFetched: c.fetchedScripts,
    networkTimelineMs: c.networkTimeline,
    appTimelineMs: c.recipe?.timeline ?? null,
    physicsState: c.recipe ? { stats: c.recipe.stats, positions: c.recipe.positions } : null,
    consoleErrors: c.consoleErrors,
    exceptions: c.exceptions
  };
};
const row = (key, capture) => {
  const s = raw[key];
  return {
    buildExit: s.buildExit, pluginLog: s.pluginLog, totalJsBytes: s.totalJsBytes, totalGzip9Bytes: s.totalGzipBytes,
    rapierChunks: s.rapierChunks, strippedStubPresent: s.strippedStubPresent,
    ...(capture ? { runtime: runtime(capture) } : {}),
    chunks: s.chunks.map((c) => ({ file: c.file, bytes: c.bytes, gzip9Bytes: c.gzipBytes }))
  };
};
const out = {
  question: "Can an app that never uses physics avoid downloading Rapier once @dimforge/rapier3d-compat is installed, and can an app that uses physics later download it only then, without changing any app that uses physics today?",
  answer: "Yes. With aura3d() from @aura3d/assets/vite (physics: 'auto'), the no-physics app emits no Rapier chunk: 6,551,866 B JS (1,927,837 B gzip -9) instead of 9,405,568 B (3,010,601 B gzip), and the browser fetches no Rapier script. With physics: 'lazy' the Rapier chunk is emitted but fetched only on first physics use (2,776 ms after navigation for a scene switched in after 2.5 s), and the physics state after 140 steps is identical. Without the plugin the no-physics app is unchanged against 5.0.2 apart from +4,365 B of engine code (+1,692 B gzip); the physics app built with the plugin is byte-identical to the build without it.",
  setup: {
    consumer: "Clean Vite 8 project (node_modules = npm install of the @aura3d/engine@5.0.2 dependency tree + vite 8 + typescript + @dimforge/rapier3d-compat@0.20.0; the tree from lane 514), @aura3d/engine replaced by the tarball under test. 'absent' = node_modules/@dimforge moved away before the build. Plugin = auraPhysicsPlugin from this branch's packages/assets/dist/vite/auraPhysics.js (what aura3d() adds next to the decoder plugin).",
    apps: {
      nophys: "src/main.ts: createAuraApp with one lit box, no physics (lane 514's consumer app)",
      phys: "phys/main.ts: recipe 16 (docs/agents/recipes-src/physics-basics), physics at startup, ?steps=140 freezes after 140 fixed steps",
      lazy: "lazy/main.ts: recipe 16 scene and calls, but the app starts with a no-physics intro scene and calls app.setScene(physicsScene) after ?delay=2500 ms, then await app.physics.ready()",
      lazyrecipe: "lazyrecipe/main.ts: recipe 16 with one added line, await app.physics.ready(), before its imperative app.physics calls"
    },
    engineTarballs: { published: { source: "npm pack @aura3d/engine@5.0.2", sha1: sha1("published") }, branch: { source: "pnpm build && npm pack of lane/519-physics-on-demand", sha1: sha1("branch") } },
    gzip: "zlib level 9 over each emitted file",
    fetch: "headless Chrome (real GPU, ANGLE Metal) via loopback CDP; Network.requestWillBeSent over 8-9 s after navigation; networkTimelineMs is relative to the first request (the HTML), appTimelineMs is performance.now() in the page",
    tools: "evidence/physics-519/tools/{consumer519.sh,measure519.mjs,ccap519.mjs,capture519.sh,compose519.mjs}"
  },
  noPhysicsApp: {
    "published 5.0.2, rapier installed, no plugin": row("published/dist-nophys-present", "published-nophys-present"),
    "branch, rapier installed, no plugin": row("branch/dist-nophys-present", "branch-nophys-present"),
    "branch, rapier installed, aura3d() physics auto": row("branch/dist-nophys-plugin-auto-present", "branch-nophys-plugin-auto-present"),
    "branch, rapier installed, aura3d({ physics: 'lazy' })": row("branch/dist-nophys-plugin-lazy-present", "branch-nophys-plugin-lazy-present"),
    "branch, rapier absent, no plugin": row("branch/dist-nophys-absent"),
    "branch, rapier absent, aura3d() physics auto": row("branch/dist-nophys-plugin-auto-absent")
  },
  physicsApp: {
    "published 5.0.2, recipe 16, no plugin": row("published/dist-phys-present", "published-phys-present-steps140"),
    "branch, recipe 16, no plugin": row("branch/dist-phys-present", "branch-phys-present-steps140"),
    "branch, recipe 16, aura3d() physics auto (kept)": row("branch/dist-phys-plugin-auto-present", "branch-phys-plugin-auto-present-steps140"),
    "branch, recipe 16, aura3d({ physics: false }) (forced strip: what a wrongly stripped app shows)": row("branch/dist-phys-plugin-false-present", "branch-phys-plugin-false-present")
  },
  lazyApps: {
    "branch, lazy app (physics after 2.5 s), aura3d({ physics: 'lazy' })": row("branch/dist-lazy-plugin-lazy-present", "branch-lazy-plugin-lazy-steps140"),
    "branch, lazy app (physics after 2.5 s), aura3d() auto (kept, eager)": row("branch/dist-lazy-plugin-auto-present", "branch-lazy-plugin-auto-steps140"),
    "branch, recipe 16 + await app.physics.ready(), aura3d({ physics: 'lazy' })": row("branch/dist-lazyrecipe-plugin-lazy-present", "branch-lazyrecipe-plugin-lazy-steps140")
  }
};
fs.mkdirSync(path.join(E, "consumer-frames"), { recursive: true });
fs.writeFileSync(path.join(E, "bundle-sizes.json"), JSON.stringify(out, null, 1) + "\n");
const frames = {};
const stored = new Map();
for (const f of fs.readdirSync(F).filter((n) => n.endsWith(".png")).sort()) {
  const png = fs.readFileSync(path.join(F, f));
  const hash = crypto.createHash("sha256").update(png).digest("hex");
  if (!stored.has(hash)) { stored.set(hash, f); fs.writeFileSync(path.join(E, "consumer-frames", f), png); }
  frames[f] = { sha256: hash, storedAs: `consumer-frames/${stored.get(hash)}`, report: cap(f.replace(/\.png$/, "")) };
}
fs.writeFileSync(path.join(E, "consumer-captures.json"), JSON.stringify(frames, null, 1) + "\n");
console.log("ok", stored.size, "unique frames");
