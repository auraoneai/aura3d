import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Aggregate = {
  readonly pass?: boolean;
  readonly workload?: string;
  readonly verdict?: string;
  readonly comparison?: {
    readonly observedLosses?: readonly string[];
    readonly claimBoundary?: string;
  };
};

const WORKLOADS = [
  "primitive-scene",
  "gltf-product-viewer",
  "cinematic-architecture",
  "digital-twin-data",
  "instancing-lod",
  "skinned-morph-animation",
  "custom-material-shader",
  "postprocessed-scene",
  "physical-character",
  "physical-vehicle",
  "navigation-crowd",
  "webgpu-tsl",
  "xr-interaction",
  "resource-lifecycle",
  "scaffold-to-deploy"
] as const;

const root = resolve(".");
const json = <T>(path: string): T => JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
const sha256 = (path: string): string => createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
const contextPath = "benchmark/context/threejs-r185.1-20260808.json";
const baselinePath = "tests/reports/current-threejs-baseline.json";
const context = json<{
  readonly three: { readonly version: string; readonly tag: string; readonly npmIntegrity: string; readonly releaseCommit: string };
  readonly environment: Record<string, unknown>;
  readonly commonRenderContract: { readonly sampling: Record<string, unknown>; readonly nonInferiority: Record<string, unknown> };
  readonly assets: Record<string, { readonly path: string; readonly sha256: string }>;
}>(contextPath);
const baseline = json<{ readonly pass: boolean; readonly three: { readonly version: string } }>(baselinePath);
const aggregates = WORKLOADS.map((workload) => ({
  workload,
  path: `tests/reports/current-head-to-head/${workload}/aggregate.json`,
  report: json<Aggregate>(`tests/reports/current-head-to-head/${workload}/aggregate.json`)
}));

const checks = [
  { id: "exact-frozen-current-baseline", pass: baseline.pass === true && baseline.three.version === context.three.version && context.three.version === "0.185.1" },
  { id: "all-15-workloads-present", pass: aggregates.length === 15 && aggregates.every(({ workload, report }) => report.workload === workload) },
  { id: "all-workload-correctness-gates-pass", pass: aggregates.every(({ report }) => report.pass === true) },
  { id: "every-workload-has-explicit-verdict", pass: aggregates.every(({ report }) => typeof report.verdict === "string" && report.verdict.length > 0) },
  { id: "every-workload-discloses-losses", pass: aggregates.every(({ report }) => (report.comparison?.observedLosses?.length ?? 0) > 0) },
  { id: "every-workload-has-claim-boundary", pass: aggregates.every(({ report }) => typeof report.comparison?.claimBoundary === "string" && report.comparison.claimBoundary.length > 0) },
  { id: "frozen-asset-bytes-still-match", pass: Object.values(context.assets).every((asset) => sha256(asset.path) === asset.sha256) }
];
const failures = checks.filter((entry) => !entry.pass);

const wins = [
  {
    scope: "selected scaffold production output size",
    workload: "scaffold-to-deploy",
    aura: { javascriptBytes: 1_001_090, totalBytes: 2_591_121 },
    three: { javascriptBytes: 1_182_449, totalBytes: 2_772_503 },
    magnitude: { javascriptBytesSmaller: 181_359, javascriptPercentSmaller: 15.34, totalBytesSmaller: 181_382, totalPercentSmaller: 6.54 },
    variance: "not measured; deterministic production artifacts from one clean local build per side",
    environment: context.environment,
    boundary: "One adapted product-viewer scaffold and frozen product asset only; it is not ecosystem-wide bundle superiority."
  }
];

const parity = [
  { scope: "selected Rapier kinematic-character trace", workload: "physical-character", magnitude: "exact final position and 53 collisions on both adapters", variance: "deterministic single trace", boundary: "Not universal character-controller parity." },
  { scope: "selected Rapier ray-cast vehicle trace", workload: "physical-vehicle", magnitude: "exact final pose and speed on both adapters", variance: "deterministic single trace", boundary: "Not universal vehicle-physics parity." },
  { scope: "selected Recast six-agent crowd trace", workload: "navigation-crowd", magnitude: "exact six final positions on both adapters", variance: "deterministic single trace", boundary: "Not universal navigation/crowd parity." }
];

const losses = aggregates.flatMap(({ workload, report }) =>
  (report.comparison?.observedLosses ?? []).map((observation) => ({
    workload,
    observation,
    magnitude: "See the retained per-workload aggregate for measured draw counts, ratios, RMSE, frame samples, or exact qualitative scope; no magnitude is invented where the workload did not measure one.",
    variance: "See the retained per-workload aggregate; absent unless that workload collected repeated samples.",
    environment: "Frozen context environment and same browser session recorded in this aggregate.",
    scope: report.comparison?.claimBoundary
  }))
);

const unproven = [
  "Installed-package fairness: the workloads currently resolve public workspace packages, not npm-packed and independently installed Aura3D 2.0 artifacts.",
  "The complete 120-warmup/600-frame/five-session CPU/GPU/wall performance contract is not collected for all 15 workloads.",
  "Install/scaffold time, authored lines, dependency/lockfile size, gzip/brotli, parse/compile/init, first-valid-frame, GPU timers, memory, accessibility, deployment complexity, and escape-hatch complexity are not complete for every workload.",
  "Real-device XR remains unproven; the XR workload uses an injected session-like object.",
  "General TSL/node-material breadth and ergonomics remain unproven; Aura uses explicitly paired GLSL/WGSL stages.",
  "A clean machine or clean VM rerun and an independent human gallery review are not yet retained."
];

const notComparable = [
  "Aura's explicit GLSL/WGSL portable-material authoring and Three.js TSL graph authoring are different abstractions; the selected shader can be compared for output, but ecosystem breadth and authoring ergonomics need a separate protocol.",
  "Injected-session XR interaction cannot be treated as comparable evidence for real headset tracking, stereo compositor quality, or device performance.",
  "Screenshot correctness reports and incomplete directional timing probes cannot be combined into a universal performance score."
];

const replicationBlockers = [
  "Run every workload from packed and freshly installed Aura3D 2.0 packages.",
  "Execute the published rerun recipe on at least one clean machine or clean VM profile.",
  "Retain an independent human inspection record for the final same-scene gallery."
];

const report = {
  schema: "aura3d.current-head-to-head-aggregate/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  comparisonComplete: failures.length === 0 && replicationBlockers.length === 0 && unproven.length === 0,
  universalScore: null,
  claimBoundary: "Passing means the 15 selected correctness gates and their explicit bounded verdicts are internally complete. It does not mean universal parity, market parity, performance non-inferiority, installed-package fairness, or release readiness.",
  frozenInputs: {
    contextPath,
    contextSha256: sha256(contextPath),
    baselinePath,
    baselineSha256: sha256(baselinePath),
    three: context.three,
    sampling: context.commonRenderContract.sampling,
    nonInferiority: context.commonRenderContract.nonInferiority,
    assets: context.assets
  },
  checks,
  failures,
  workloadCount: aggregates.length,
  workloads: aggregates.map(({ workload, path, report: workloadReport }) => ({ workload, path, pass: workloadReport.pass, verdict: workloadReport.verdict, claimBoundary: workloadReport.comparison?.claimBoundary })),
  wins,
  parity,
  losses,
  unproven,
  notComparable,
  replicationBlockers
};

const output = resolve(root, "tests/reports/current-head-to-head/aggregate.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) {
  console.error(`Current head-to-head aggregate UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Current head-to-head aggregate PASS: ${aggregates.length}/15 bounded workload gates; comparisonComplete=${report.comparisonComplete}; ${output}`);
}
