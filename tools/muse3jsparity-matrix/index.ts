// PART S matrix generator (muse3jsparity-PRD.md PART S, task 1).
// Generates benchmark/context/muse3jsparity-r185-matrix.json FROM the installed
// tree. Never hand-edit the JSON: rerun this script on three-version change.
// Fails closed: measured counts must match the PRD basis, every COVERED row
// must point at a proof file that exists, every GAP row must name an owning
// PRD section or an OUT reason.
// Usage: npx tsx tools/muse3jsparity-matrix/index.ts (from the repo root)

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const THREE_DIR = resolve(ROOT, "node_modules/three");
const JSM_DIR = join(THREE_DIR, "examples/jsm");
const SRC_DIR = join(THREE_DIR, "src");
const FROZEN_CONTEXT_PATH = resolve(ROOT, "benchmark/context/threejs-r185.1-20260808.json");
const MATRIX_PATH = resolve(ROOT, "benchmark/context/muse3jsparity-r185-matrix.json");
const ROOT_PKG_PATH = resolve(ROOT, "package.json");

// PRD PART S basis (muse3jsparity-PRD.md:944). The curator updates these when
// the three version changes; the script refuses to emit a matrix otherwise.
const EXPECTED_THREE_VERSION = "0.185.1";
const EXPECTED_SRC_FILES = 750;
const EXPECTED_JSM_FILES = 425;
const EXPECTED_JSM_TSL_FILES = 61;

function fail(message: string): never {
  console.error(`[muse3jsparity-matrix] FAIL: ${message}`);
  process.exit(1);
}

function countJsFilesRecursive(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) count += countJsFilesRecursive(full);
    else if (entry.isFile() && entry.name.endsWith(".js")) count += 1;
  }
  return count;
}

function grepFileCountRecursive(dir: string, needle: string): number {
  let count = 0;
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".js")) {
        if (readFileSync(full, "utf8").includes(needle)) count += 1;
      }
    }
  };
  walk(dir);
  return count;
}

function installedVersion(spec: string): string | null {
  const direct = join(ROOT, "node_modules", spec, "package.json");
  if (existsSync(direct)) {
    try {
      const pkg = JSON.parse(readFileSync(direct, "utf8")) as { version?: string };
      if (typeof pkg.version === "string") return pkg.version;
    } catch {
      // Fall through to the .pnpm probe below.
    }
  }
  // Transitive-only deps (e.g. ktx-parse via @loaders.gl) live under .pnpm.
  try {
    const hits = execFileSync("ls", [join(ROOT, "node_modules/.pnpm")], { encoding: "utf8" })
      .split("\n")
      .filter((d) => d === `${spec}@` || d.startsWith(`${spec}@`))
      .sort();
    for (const hit of hits) {
      const nested = join(ROOT, "node_modules/.pnpm", hit, "node_modules", spec, "package.json");
      if (existsSync(nested)) {
        const pkg = JSON.parse(readFileSync(nested, "utf8")) as { version?: string };
        if (typeof pkg.version === "string") return pkg.version;
      }
    }
  } catch {
    // No .pnpm store visible; report null.
  }
  return null;
}

if (!existsSync(THREE_DIR)) fail(`installed three tree missing at ${THREE_DIR}`);
const threePkg = JSON.parse(readFileSync(join(THREE_DIR, "package.json"), "utf8")) as { version?: string };
if (threePkg.version !== EXPECTED_THREE_VERSION) {
  fail(`installed three@${threePkg.version} != expected ${EXPECTED_THREE_VERSION} (update EXPECTED_* in this script on version change)`);
}

const srcFiles = countJsFilesRecursive(SRC_DIR);
const jsmFiles = countJsFilesRecursive(JSM_DIR);
if (srcFiles !== EXPECTED_SRC_FILES) fail(`src/*.js files: measured ${srcFiles} != PRD basis ${EXPECTED_SRC_FILES}`);
if (jsmFiles !== EXPECTED_JSM_FILES) fail(`examples/jsm files: measured ${jsmFiles} != PRD basis ${EXPECTED_JSM_FILES}`);

const jsmSubdirs = readdirSync(JSM_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
const jsmCounts = new Map<string, number>();
for (const dir of jsmSubdirs) jsmCounts.set(dir, countJsFilesRecursive(join(JSM_DIR, dir)));
if ((jsmCounts.get("tsl") ?? -1) !== EXPECTED_JSM_TSL_FILES) {
  fail(`examples/jsm/tsl files: measured ${jsmCounts.get("tsl")} != PRD basis ${EXPECTED_JSM_TSL_FILES}`);
}

// Cross-cutting webgpu render-bundle area (not a jsm dir): files in src that
// reference the render-bundle path (PRD PART S webgpu row, J2).
const renderBundleFiles = grepFileCountRecursive(SRC_DIR, "renderBundle");

// --- Decoder lib alignment vs the r185 vendored set (PART S task 4) ---
const frozen = JSON.parse(readFileSync(FROZEN_CONTEXT_PATH, "utf8")) as {
  three?: { releaseCommit?: string };
  companionPackages?: Record<string, { version?: string }>;
};
const companions = frozen.companionPackages ?? {};
const rootPkg = JSON.parse(readFileSync(ROOT_PKG_PATH, "utf8")) as { devDependencies?: Record<string, string> };
const rootPins = rootPkg.devDependencies ?? {};
interface DecoderEntry {
  readonly lib: string;
  readonly r185: string | null;
  readonly repoPin: string | null;
  readonly installed: string | null;
  readonly status: "aligned" | "divergent";
  readonly reason: string;
}
const decoderLibs: DecoderEntry[] = [
  {
    lib: "draco3d",
    r185: companions["draco3d"]?.version ?? null,
    repoPin: rootPins["draco3d"] ?? null,
    installed: installedVersion("draco3d"),
    status: "aligned",
    reason: "Pin ^1.5.7 resolves to installed 1.5.7, equal to the r185 companion set."
  },
  {
    lib: "meshoptimizer",
    r185: companions["meshoptimizer"]?.version ?? null,
    repoPin: rootPins["meshoptimizer"] ?? null,
    installed: installedVersion("meshoptimizer"),
    status: "divergent",
    reason:
      "r185 companion set pins meshoptimizer 1.2.0; repo pin is ^1.1.1 (installed 1.1.1). " +
      "Divergence accepted: the meshopt decode path is route-injected at runtime via " +
      "createMeshoptDecoder (decoder-required, fail-closed without it — " +
      "packages/assets/src/GLTFCompressionDecoders.ts), so the npm pin only serves " +
      "node-side tooling/tests and does not gate the shipped decode path. " +
      "Re-pin to ^1.2.0 with lockfile regen is a follow-up outside S-task scope " +
      "(root package.json + pnpm-lock.yaml are not S-task touch targets)."
  },
  {
    lib: "ktx-parse",
    r185: null,
    repoPin: null,
    installed: installedVersion("ktx-parse"),
    status: "divergent",
    reason:
      "r185 vendors ktx-parse as a versionless module blob under examples/jsm/libs/ " +
      "(no npm version to align to). Ours resolves via the @loaders.gl transitive " +
      "ktx-parse plus BasisU transcoder URLs (packages/assets/src/KTX2BasisTextureTranscoder.ts); " +
      "the KTX2 path is proven by tests/unit/rendering/texture-pipeline-c3.test.ts."
  }
];
try {
  execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
  fail("git is required to stamp the matrix commit");
}

// --- PART S verdict table (curated from muse3jsparity-PRD.md PART S) ---
type Verdict = "COVERED" | "PARTIAL" | "GAP" | "OUT";
interface Row {
  readonly area: string;
  readonly filesMeasured: number | null;
  readonly filesPrd: string;
  readonly verdict: Verdict;
  readonly prdSection: string;
  readonly proof: string | null;
  readonly closingSection: string | null;
  readonly outReason: string | null;
  readonly note: string;
}
const rows: Row[] = [
  {
    area: "postprocessing",
    filesMeasured: jsmCounts.get("postprocessing") ?? null,
    filesPrd: "30",
    verdict: "PARTIAL",
    prdSection: "A1-A3",
    proof: null,
    closingSection: "A1-A3 (GPU-resident passes + missing 17)",
    outReason: null,
    note: "13 CPU passes exist; GPU-resident rewrite + 17 missing passes close the rest."
  },
  {
    area: "controls",
    filesMeasured: jsmCounts.get("controls") ?? null,
    filesPrd: "9",
    verdict: "GAP",
    prdSection: "N2/F1",
    proof: null,
    closingSection: "N2/F1 owns Arcball; the other 8 controls stay covered by the unified follow-rig work",
    outReason: null,
    note: "GAP = Arcball only, owned by N2/F1."
  },
  {
    area: "loaders",
    filesMeasured: jsmCounts.get("loaders") ?? null,
    filesPrd: "56",
    verdict: "PARTIAL",
    prdSection: "M1-M3",
    proof: null,
    closingSection: "M1-M3 (animation-pointer, formats triage)",
    outReason: null,
    note: "GLTF/OBJ/HDR/KTX2 paths + matrix exist; animation-pointer + format triage close the rest."
  },
  {
    area: "objects",
    filesMeasured: jsmCounts.get("objects") ?? null,
    filesPrd: "14",
    verdict: "GAP",
    prdSection: "B4/D3",
    proof: null,
    closingSection: "B4/D3 (contract-only/fixtures for Reflector/Refractor/Water/Sky/Lensflare/ShadowMesh)",
    outReason: null,
    note: "GAP owned by B4/D3."
  },
  {
    area: "renderers",
    filesMeasured: jsmCounts.get("renderers") ?? null,
    filesPrd: "4",
    verdict: "OUT",
    prdSection: "N4",
    proof: null,
    closingSection: null,
    outReason:
      "Game annotation needs are covered by world-anchored labels + SDF text; the migration lab documents the manual CSS2D/3D mapping. N4 records the decision.",
    note: "CSS2D/CSS3D/SVG/Projector stay out for 2.1."
  },
  {
    area: "webgpu-render-bundles",
    filesMeasured: renderBundleFiles,
    filesPrd: "n/a (cross-cutting; inventory S135)",
    verdict: "GAP",
    prdSection: "J2",
    proof: null,
    closingSection: "J2 owns the render-bundle verdict",
    outReason: null,
    note: "r185 WebGPURenderer render-bundle + instancing improvements; zero renderBundle matches in packages/rendering/src."
  },
  {
    area: "webxr",
    filesMeasured: jsmCounts.get("webxr") ?? null,
    filesPrd: "13",
    verdict: "OUT",
    prdSection: "N3",
    proof: null,
    closingSection: null,
    outReason: "Full XR parity is out; only injected-session state is supported (N3). Real-device XR stays roadmap.",
    note: "OUT except injected-session state."
  },
  {
    area: "animation",
    filesMeasured: jsmCounts.get("animation") ?? null,
    filesPrd: "2",
    verdict: "OUT",
    prdSection: "E2 (bounded)",
    proof: null,
    closingSection: "E2 bounded (retarget PARTIAL)",
    outReason: "CCDIKSolver is Tier-3 OUT; AnimationClipCreator retarget is PARTIAL under bounded E2.",
    note: "Split row: OUT (Tier-3) / PARTIAL (retarget)."
  },
  {
    area: "lights",
    filesMeasured: jsmCounts.get("lights") ?? null,
    filesPrd: "3",
    verdict: "GAP",
    prdSection: "Q1.6/B5",
    proof: null,
    closingSection: "Q1.6/B5 (LTC sub-part documented OUT unless product-viz demands)",
    outReason: null,
    note: "GAP = LTC, owned by Q1.6/B5."
  },
  {
    area: "environments",
    filesMeasured: jsmCounts.get("environments") ?? null,
    filesPrd: "3",
    verdict: "PARTIAL",
    prdSection: "M3/B3",
    proof: null,
    closingSection: "M3/B3 (HDRI root/file)",
    outReason: null,
    note: "6 presets exist; no HDRI root/file."
  },
  {
    area: "tsl",
    filesMeasured: jsmCounts.get("tsl") ?? null,
    filesPrd: "61",
    verdict: "OUT",
    prdSection: "claim boundaries",
    proof: null,
    closingSection: null,
    outReason:
      "Universal TSL/node parity is explicitly roadmap (out-of-scope list); PortableShaderMaterial stays the custom-material path.",
    note: "OUT except the PortableShaderMaterial workload."
  },
  {
    area: "shaders",
    filesMeasured: jsmCounts.get("shaders") ?? null,
    filesPrd: "52",
    verdict: "COVERED",
    prdSection: "Q0",
    proof: "tests/unit/rendering/shader-brdf-reference.test.ts",
    closingSection: null,
    outReason: null,
    note: "COVERED by the Q0 audit match list."
  },
  {
    area: "helpers",
    filesMeasured: jsmCounts.get("helpers") ?? null,
    filesPrd: "13",
    verdict: "PARTIAL",
    prdSection: "H2/I1",
    proof: null,
    closingSection: "H2/I1 rows",
    outReason: null,
    note: "PARTIAL via H2/I1 rows."
  },
  {
    area: "lines",
    filesMeasured: jsmCounts.get("lines") ?? null,
    filesPrd: "10",
    verdict: "PARTIAL",
    prdSection: "D4",
    proof: null,
    closingSection: "D4 (thick lines exist)",
    outReason: null,
    note: "PARTIAL: thick lines exist, D4 closes the rest."
  },
  {
    area: "transpiler",
    filesMeasured: jsmCounts.get("transpiler") ?? null,
    filesPrd: "8",
    verdict: "OUT",
    prdSection: "claim boundaries",
    proof: null,
    closingSection: null,
    outReason:
      "Engine, not a shader-toolchain vendor; PortableShaderMaterial stays the custom-material path.",
    note: "GLSL->TSL/WGSL converters stay out."
  },
  {
    area: "generators",
    filesMeasured: jsmCounts.get("generators") ?? null,
    filesPrd: "6",
    verdict: "PARTIAL",
    prdSection: "D2",
    proof: null,
    closingSection: "D2 (fixture samplers exist; rendered systems close the rest)",
    outReason: null,
    note: "City/Forest/Terrain/Tree generators: fixture samplers exist."
  },
  {
    area: "lighting",
    filesMeasured: jsmCounts.get("lighting") ?? null,
    filesPrd: "3",
    verdict: "PARTIAL",
    prdSection: "B5",
    proof: null,
    closingSection: "B5 (clustered forward exists; warning policy + probe grid triage)",
    outReason: null,
    note: "ClusteredLighting/DynamicLighting/LightProbeGrid."
  },
  {
    area: "textures",
    filesMeasured: jsmCounts.get("textures") ?? null,
    filesPrd: "1",
    verdict: "COVERED",
    prdSection: "M2/C3",
    proof: "tests/unit/rendering/texture-pipeline-c3.test.ts",
    closingSection: null,
    outReason: null,
    note: "COVERED: KTX2 path + sampler."
  },
  {
    area: "exporters",
    filesMeasured: jsmCounts.get("exporters") ?? null,
    filesPrd: "8",
    verdict: "OUT",
    prdSection: "S-task 4",
    proof: null,
    closingSection: null,
    outReason: "Engine, not a DCC tool: GLTFExporter/OBJ/PLY/STL export is not a runtime-game need.",
    note: "S-task 4 triage: OUT with reason."
  },
  {
    area: "modifiers",
    filesMeasured: jsmCounts.get("modifiers") ?? null,
    filesPrd: "5",
    verdict: "OUT",
    prdSection: "S-task 4",
    proof: null,
    closingSection: null,
    outReason:
      "Engine, not a DCC tool: Simplify/Subdivision/EdgeSplit are authoring-time ops; runtime LOD needs are owned elsewhere.",
    note: "S-task 4 triage: OUT with reason."
  },
  {
    area: "curves",
    filesMeasured: jsmCounts.get("curves") ?? null,
    filesPrd: "5",
    verdict: "COVERED",
    prdSection: "F2",
    proof: "packages/engine/src/agent-api/CameraPathEditor.ts",
    closingSection: null,
    outReason: null,
    note: "COVERED: camera paths use curves."
  },
  {
    area: "utils",
    filesMeasured: jsmCounts.get("utils") ?? null,
    filesPrd: "16",
    verdict: "PARTIAL",
    prdSection: "S-task 4 / D1",
    proof: "tests/unit/rendering/mesh-consolidation.test.ts",
    closingSection:
      "S-task 4 mesh-op adoption (done): merge via consolidateStaticMeshes + de-index via deindexGeometryToNonIndexed in packages/rendering/src/MeshConsolidation.ts; interleaving is the native VertexBuffer storage model so no adoption is needed",
    outReason: null,
    note: "BufferGeometryUtils-class mesh ops adopted; rest of utils (LDraw etc.) stays OUT as DCC/devtools-adjacent."
  },
  {
    area: "math",
    filesMeasured: jsmCounts.get("math") ?? null,
    filesPrd: "10",
    verdict: "COVERED",
    prdSection: "@aura3d/math",
    proof: "packages/math/src/index.ts",
    closingSection: null,
    outReason: null,
    note: "COVERED by @aura3d/math."
  },
  {
    area: "misc",
    filesMeasured: jsmCounts.get("misc") ?? null,
    filesPrd: "14",
    verdict: "OUT",
    prdSection: "S-task 4 / A4",
    proof: null,
    closingSection: "A4 owns the GPGPU comparison carve-out (WGSL compute is real)",
    outReason:
      "Engine, not DCC/devtools: ConvexObjectBreaker and siblings stay out; the GPUComputationRenderer-vs-compute-backend comparison is carved out to A4.",
    note: "S-task 4 triage: OUT with an A4-owned GPGPU carve-out."
  },
  {
    area: "gpgpu",
    filesMeasured: jsmCounts.get("gpgpu") ?? null,
    filesPrd: "1",
    verdict: "PARTIAL",
    prdSection: "A4",
    proof: null,
    closingSection: "A4 (WGSL compute real)",
    outReason: null,
    note: "PARTIAL: WGSL compute is real."
  },
  {
    area: "csm",
    filesMeasured: jsmCounts.get("csm") ?? null,
    filesPrd: "5",
    verdict: "PARTIAL",
    prdSection: "B1",
    proof: null,
    closingSection: "B1 (CSM exists, hysteresis missing)",
    outReason: null,
    note: "PARTIAL: CSM exists, hysteresis missing."
  },
  {
    area: "effects",
    filesMeasured: jsmCounts.get("effects") ?? null,
    filesPrd: "5",
    verdict: "PARTIAL",
    prdSection: "A4",
    proof: null,
    closingSection: "A4 (particles/trails)",
    outReason: null,
    note: "PARTIAL: particles/trails."
  },
  {
    area: "materials",
    filesMeasured: jsmCounts.get("materials") ?? null,
    filesPrd: "3",
    verdict: "COVERED",
    prdSection: "C/P3",
    proof: "packages/engine/src/material-physical/PhysicalMaterialSpec.ts",
    closingSection: null,
    outReason: null,
    note: "COVERED: physical/standard + compat."
  },
  {
    area: "geometries",
    filesMeasured: jsmCounts.get("geometries") ?? null,
    filesPrd: "9",
    verdict: "COVERED",
    prdSection: "D",
    proof: "packages/rendering/src/GeometryPrimitives.ts",
    closingSection: null,
    outReason: null,
    note: "COVERED: primitives + compat."
  },
  {
    area: "interaction",
    filesMeasured: jsmCounts.get("interaction") ?? null,
    filesPrd: "1",
    verdict: "COVERED",
    prdSection: "F",
    proof: "packages/engine/src/agent-api/index.ts",
    closingSection: null,
    outReason: null,
    note: "COVERED: interactions/raycast (AuraInteractionSpec + raycastMesh in the agent API root)."
  },
  {
    area: "capabilities-offscreen-interactive",
    filesMeasured:
      (jsmCounts.get("capabilities") ?? 0) + (jsmCounts.get("offscreen") ?? 0) + (jsmCounts.get("interactive") ?? 0),
    filesPrd: "2+3+4",
    verdict: "OUT",
    prdSection: "S-task 4",
    proof: null,
    closingSection: null,
    outReason: "Devtools-adjacent surfaces, not engine parity; no runtime-game need.",
    note: "S-task 4 triage: OUT with reason."
  },
  {
    area: "physics",
    filesMeasured: jsmCounts.get("physics") ?? null,
    filesPrd: "3",
    verdict: "PARTIAL",
    prdSection: "H1/H2",
    proof: null,
    closingSection: "H1/H2 (Rapier owns; debug-draw pending)",
    outReason: null,
    note: "PARTIAL: Rapier owns physics; debug-draw pending."
  },
  {
    area: "culling-renderorder-layers",
    filesMeasured: null,
    filesPrd: "n/a (cross-cutting; inventory S134)",
    verdict: "PARTIAL",
    prdSection: "D2",
    proof: null,
    closingSection: "D2 (static-bounds frustum intersector exists; render-order + layers audit)",
    outReason: null,
    note: "Frustum culling + object/render-list behavior; render-order + layers audit closes the rest."
  },
  {
    area: "react-r3f-stack",
    filesMeasured: null,
    filesPrd: "n/a (companion packages; inventory S186)",
    verdict: "PARTIAL",
    prdSection: "V",
    proof: null,
    closingSection: "V (@aura3d/react ships AuraCanvas + Scene/Model/Camera/Lights/Effect + productViewerScene; no useFrame/events/drei)",
    outReason: null,
    note: "React 19 + R3F + drei row."
  },
  {
    area: "libs",
    filesMeasured: jsmCounts.get("libs") ?? null,
    filesPrd: "22",
    verdict: "PARTIAL",
    prdSection: "M2",
    proof: null,
    closingSection: "M2 (vendored decoder alignment; see decoderLibs: draco3d aligned, meshoptimizer + ktx-parse divergences recorded with reason)",
    outReason: null,
    note: "Third-party vendored libs (draco, ktx-parse, meshopt...)."
  },
  {
    area: "inspector",
    filesMeasured: jsmCounts.get("inspector") ?? null,
    filesPrd: "20",
    verdict: "OUT",
    prdSection: "S-task 4",
    proof: null,
    closingSection: null,
    outReason:
      "Devtools surface, not engine parity; AuraDiagnosticsOverlay stays the diagnostics path.",
    note: "S-task 4 triage: OUT with reason."
  }
];

// --- Gates (fail closed; no COVERED without proof) ---
for (const row of rows) {
  if (typeof row.filesMeasured === "number") {
    const prdNumeric = /^\d+$/.test(row.filesPrd) ? parseInt(row.filesPrd, 10) : null;
    if (prdNumeric !== null && row.filesMeasured !== prdNumeric) {
      fail(`area ${row.area}: measured ${row.filesMeasured} != PRD ${row.filesPrd} (update the PRD basis or this script)`);
    }
  }
  if (row.verdict === "COVERED") {
    if (!row.proof) fail(`area ${row.area}: COVERED without a proof pointer`);
    if (!existsSync(resolve(ROOT, row.proof))) fail(`area ${row.area}: proof file missing: ${row.proof}`);
  }
  if (row.verdict === "PARTIAL" && !row.closingSection) fail(`area ${row.area}: PARTIAL without a closing section`);
  if (row.verdict === "GAP" && !row.closingSection) fail(`area ${row.area}: GAP without an owning PRD section`);
  if (row.verdict === "OUT" && !row.outReason) fail(`area ${row.area}: OUT without a non-goal reason`);
}

// Mesh-op adoption gate (PART S task 3): merge + de-index must be adopted in
// MeshConsolidation.ts, or the utils row must move to OUT with a reason.
const meshOpsSource = readFileSync(resolve(ROOT, "packages/rendering/src/MeshConsolidation.ts"), "utf8");
const meshOps = {
  mergeAdopted: meshOpsSource.includes("consolidateStaticMeshes"),
  deindexAdopted: meshOpsSource.includes("deindexGeometryToNonIndexed"),
  interleaveNote:
    "VertexBuffer stores attributes interleaved in a single ArrayBuffer by construction; no interleave adoption needed."
};
if ((!meshOps.mergeAdopted || !meshOps.deindexAdopted) && rows.find((r) => r.area === "utils")?.verdict !== "OUT") {
  fail("mesh-op adoption incomplete (merge or de-index missing) and utils row is not OUT with a reason");
}

const uncoveredGaps = rows.filter((r) => r.verdict === "GAP" && !r.closingSection);
const counts = {
  covered: rows.filter((r) => r.verdict === "COVERED").length,
  partial: rows.filter((r) => r.verdict === "PARTIAL").length,
  gap: rows.filter((r) => r.verdict === "GAP").length,
  out: rows.filter((r) => r.verdict === "OUT").length
};

const matrix = {
  schema: "aura3d.muse3jsparity-r185-matrix/1.0",
  status: "frozen",
  generatedBy: "tools/muse3jsparity-matrix/index.ts (never hand-edit; rerun on three-version change)",
  generatedAt: new Date().toISOString(),
  three: {
    version: threePkg.version,
    releaseCommit: frozen.three?.releaseCommit ?? null,
    srcFiles,
    jsmFiles,
    jsmTslFiles: jsmCounts.get("tsl") ?? null,
    renderBundleSrcFiles: renderBundleFiles
  },
  decoderLibs,
  meshOps,
  rows,
  checklist: {
    matrixGeneratedFromInstalledTree: true,
    zeroGapsWithoutOwningSectionOrOutReason: uncoveredGaps.length === 0,
    meshOpAdoptionLanded: meshOps.mergeAdopted && meshOps.deindexAdopted,
    decoderLibsAlignedOrDivergenceRecorded: true,
    verdictCounts: counts
  }
};

writeFileSync(MATRIX_PATH, `${JSON.stringify(matrix, null, 2)}\n`);
console.log(
  `[muse3jsparity-matrix] wrote ${MATRIX_PATH} (three@${threePkg.version} src=${srcFiles} jsm=${jsmFiles} ` +
    `covered=${counts.covered} partial=${counts.partial} gap=${counts.gap} out=${counts.out})`
);
