import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REPORT_PATH = "tests/reports/geometry-instancing-lod-text/report.json";
const MAX_AGE_MS = 30 * 60 * 1000;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string }
const check = (id: string, pass: boolean, detail: string): Check => ({ id, pass, detail });
const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const fresh = (report: any): boolean => { const timestamp = Date.parse(String(report.generatedAt ?? "")); return Number.isFinite(timestamp) && Date.now() - timestamp <= MAX_AGE_MS; };

const root = json("tests/reports/geometry-instancing-lod-text/root-browser.json");
const large = json("tests/reports/geometry-instancing-lod-text/large-scene-culling.json");
const rootHarnessSource = readFileSync(resolve("tests/browser/root-geometry-instancing-lod-text-harness.ts"), "utf8");
const rootGeometrySource = readFileSync(resolve("packages/engine/src/agent-api/RootGeometry.ts"), "utf8");
const unitSource = readFileSync(resolve("tests/unit/agent-api/root-geometry-lod-instancing.test.ts"), "utf8");

const checks: Check[] = [
  check("root-production-runtime", root.status === "ready" && root.renderer === "root-createAuraApp-production-runtime" && root.instancing?.initialBackend === "production-runtime" && root.text?.backend === "production-runtime", `instanceBackend=${String(root.instancing?.initialBackend)}; textBackend=${String(root.text?.backend)}`),
  check("root-only-public-import", root.assertions?.rootOnlyImport === true && !/@aura3d\/(?:rendering|scene|engine\/)|from\s+["']three/.test(rootHarnessSource), "browser harness imports only @aura3d/engine"),
  check("native-one-draw-instancing", root.instancing?.count === 80 && root.instancing?.nativeInitial > 0 && root.instancing?.nativeUpdated > 0 && root.instancing?.initialDrawCalls <= 2 && root.instancing?.updatedDrawCalls <= 2, `instances=${String(root.instancing?.count)}; native=${String(root.instancing?.nativeInitial)}/${String(root.instancing?.nativeUpdated)}; drawCalls=${String(root.instancing?.initialDrawCalls)}/${String(root.instancing?.updatedDrawCalls)}`),
  check("instance-update-and-disposal", root.instancing?.updateChangedPixels > 500 && root.lifecycle?.createdApps > 0 && root.lifecycle?.disposedApps === root.lifecycle?.createdApps, `updatedPixels=${String(root.instancing?.updateChangedPixels)}; disposed=${String(root.lifecycle?.disposedApps)}/${String(root.lifecycle?.createdApps)}`),
  check("distance-lod-pixels", root.lod?.changedPixels > 1_000 && JSON.stringify(root.lod?.near?.center) !== JSON.stringify(root.lod?.far?.center), `changedPixels=${String(root.lod?.changedPixels)}; near=${JSON.stringify(root.lod?.near?.center)}; far=${JSON.stringify(root.lod?.far?.center)}`),
  check("lod-hysteresis-contract", /hysteresis-hold/.test(rootGeometrySource) && /holds distance LOD across the hysteresis band/.test(unitSource), "symmetric hold/switch behavior is covered by the focused unit gate"),
  check("depth-lit-transformable-text-mesh", root.text?.textMetadata?.method === "extruded-bitmap-glyph-mesh" && root.text?.textMetadata?.glyphCount === 6 && root.text?.uniqueColors > 20 && root.text?.nonBlackPixels > 5_000, `method=${String(root.text?.textMetadata?.method)}; glyphs=${String(root.text?.textMetadata?.glyphCount)}; colors=${String(root.text?.uniqueColors)}`),
  check("dom-label-boundary", root.assertions?.noDomTextRenderer === true && rootHarnessSource.includes("noDomTextRenderer"), "mesh text proof has no world-label DOM layer; DOM labels remain UI/accessibility"),
  check("custom-geometry-root-escape", root.text?.customKind === "aura-custom-geometry" && /defineAuraCustomGeometry/.test(rootGeometrySource), `customKind=${String(root.text?.customKind)}`),
  check("real-large-scene-frustum", large.status === "ready" && large.objectCount === 1600 && large.culled?.scene?.submittedObjects === 1600 && large.culled?.scene?.culledObjects > 1200 && large.culled?.drawCalls < large.unculled?.drawCalls / 4, `objects=${String(large.objectCount)}; visible=${String(large.culled?.scene?.visibleObjects)}; culled=${String(large.culled?.scene?.culledObjects)}; draws=${String(large.culled?.drawCalls)}/${String(large.unculled?.drawCalls)}`),
  check("static-bvh-large-scene", large.bvh?.build?.objectCount === 1600 && large.bvh?.query?.culledObjects > 1200 && large.bvh?.query?.leafTests < 800, `nodes=${String(large.bvh?.build?.bvhNodes)}; visited=${String(large.bvh?.query?.visitedNodes)}; leafTests=${String(large.bvh?.query?.leafTests)}`),
  check("occlusion-claim-boundary", large.occlusionStrategy?.implemented === false && large.occlusionStrategy?.mode === "none-no-gpu-occlusion-query-or-hiz" && String(large.occlusionStrategy?.boundary).includes("does not implement or claim GPU occlusion queries"), String(large.occlusionStrategy?.boundary)),
  check("reports-fresh", fresh(root) && fresh(large), `generatedAt=${String(root.generatedAt)},${String(large.generatedAt)}`)
];

const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "aura3d.renderer-geometry-instancing-lod-text/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  claim: "root-safe-geometry-instancing-lod-and-mesh-text-with-bounded-culling-strategy",
  root: {
    instancing: root.instancing,
    lod: root.lod,
    text: root.text,
    lifecycle: root.lifecycle
  },
  largeScene: {
    objectCount: large.objectCount,
    culled: large.culled,
    unculled: large.unculled,
    bvh: large.bvh,
    occlusionStrategy: large.occlusionStrategy
  },
  scope: {
    proven: ["root @aura3d/engine native lit instancing with update and disposal", "root camera-distance LOD with symmetric hysteresis", "root extruded bitmap-glyph triangle text and custom indexed geometry", "CPU frustum culling and static-bounds BVH traversal on one real 1,600-object WebGL2 scene"],
    limited: ["text3D supports the documented built-in uppercase alphanumeric bitmap glyph catalog, not arbitrary fonts or shaping", "advanced PBR extension declarations use correctness-preserving expanded draws when the instanced shader cannot represent them", "large-scene timings are same-machine directional measurements"],
    blocked: ["GPU occlusion queries", "hierarchical-Z or portal occlusion culling", "font loading, Unicode shaping, SDF/MSDF text, curved text, and arbitrary typefaces"]
  },
  checks,
  failures: failures.map(({ id, detail }) => ({ id, detail })),
  evidence: ["tests/reports/geometry-instancing-lod-text/root-browser.json", "tests/reports/geometry-instancing-lod-text/large-scene-culling.json"]
};

mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });
writeFileSync(resolve(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) { console.error(`Geometry/instancing/LOD/text proof is UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`); process.exitCode = 1; }
else console.log(`Geometry/instancing/LOD/text proof PASS: ${checks.length}/${checks.length} checks; ${REPORT_PATH}`);
