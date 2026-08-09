import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const text = (path: string): string => readFileSync(resolve(path), "utf8");
const baseline = json("tests/reports/current-threejs-baseline.json");
const context = json("benchmark/context/threejs-r185.1-20260808.json");
const browser = json("tests/reports/current-head-to-head/cinematic-architecture/report.json");
const source = text("benchmark/current-head-to-head/cinematic-architecture/src/main.tsx");
const expectedAsset = context.assets.architecture;
const actualAssetHash = createHash("sha256")
  .update(readFileSync(resolve(expectedAsset.path)))
  .digest("hex");
const requiredControlStack = context.workloads.find(
  (entry: { id: string }) => entry.id === "cinematic-architecture"
)?.stack ?? [];
const conditions = browser.before?.conditions;
const checks = [
  {
    id: "current-three-r185",
    pass: baseline.pass === true
      && baseline.three?.version === "0.185.1"
      && browser.before?.three?.revision === "185"
  },
  {
    id: "exact-frozen-asset",
    pass: browser.assetSha256 === expectedAsset.sha256
      && actualAssetHash === expectedAsset.sha256
      && browser.before?.asset?.id === expectedAsset.id
  },
  {
    id: "frozen-native-viewport",
    pass: browser.before?.viewport?.width === context.commonRenderContract.viewport.width
      && browser.before?.viewport?.height === context.commonRenderContract.viewport.height
      && browser.before?.viewport?.dpr === context.commonRenderContract.devicePixelRatio
      && statSync(resolve("tests/reports/current-head-to-head/cinematic-architecture/aura.png")).size > 10_000
      && statSync(resolve("tests/reports/current-head-to-head/cinematic-architecture/three.png")).size > 10_000
  },
  {
    id: "same-camera-scale-lighting-intent",
    pass: conditions?.targetMaxDimension === 1.58
      && JSON.stringify(conditions?.cameraTarget) === JSON.stringify([0, 0, 0])
      && conditions?.cameraPath?.length === 2
      && conditions?.cameraPath?.every((shot: { fov: number }) => shot.fov === 45)
      && conditions?.ambientIntensity === 0.35
      && conditions?.directional?.intensity === 2.6
  },
  {
    id: "public-idiomatic-stacks",
    pass: requiredControlStack.every((dependency: string) =>
      source.includes(`from "${dependency}"`) || source.includes(`from "${dependency}/`)
    )
      && source.includes('from "@aura3d/engine"')
      && !source.includes("packages/")
      && browser.before?.aura?.publicPackageOnly === true
      && browser.before?.aura?.publicApi === "createAuraApp + defineAuraAssets + model"
      && browser.before?.three?.actualR3F === true
      && browser.before?.three?.actualDrei === true
      && browser.before?.three?.actualRenderer === true
  },
  {
    id: "real-architecture-output",
    pass: browser.before?.aura?.backend === "webgl2"
      && browser.before?.aura?.drawCalls > 100
      && browser.before?.aura?.assetState?.status === "ready"
      && browser.before?.aura?.assetState?.provenance?.source === "typed-aura-assets-manifest"
      && browser.before?.three?.drawCalls > 100
      && browser.before?.three?.triangles > 10_000
      && browser.before?.three?.nodeCount > 500
  },
  {
    id: "paired-camera-path-changes-pixels",
    pass: browser.after?.interaction?.applied === true
      && browser.before?.aura?.pixelHash !== browser.after?.aura?.pixelHash
      && browser.before?.three?.pixelHash !== browser.after?.three?.pixelHash
  }
];
const failures = checks.filter((entry) => !entry.pass);
const auraDrawCalls = browser.before?.aura?.drawCalls ?? 0;
const threeDrawCalls = browser.before?.three?.drawCalls ?? 0;
const report = {
  schema: "aura3d.current-head-to-head-cinematic-architecture/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  workload: "cinematic-architecture",
  verdict: "both-render-and-interact-with-visible-aura-losses",
  checks,
  failures,
  comparison: {
    auraDrawCalls,
    threeDrawCalls,
    auraToThreeDrawCallRatio: threeDrawCalls > 0 ? Number((auraDrawCalls / threeDrawCalls).toFixed(3)) : null,
    observedLosses: [
      "Aura submits materially more draw calls for the same imported scene.",
      "The retained Aura capture has a lighter background response than the retained Three.js capture under the shared authored color.",
      "The retained Aura capture exposes detached/underside geometry below the city platform that is not visible in the Three.js control."
    ],
    claimBoundary: "This proves a public typed-asset architecture render and deterministic camera-path interaction. It does not claim visual parity, draw-call parity, postprocess parity, or defect-free glTF hierarchy rendering."
  },
  browser
};
const output = resolve("tests/reports/current-head-to-head/cinematic-architecture/aggregate.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) {
  console.error(`Cinematic architecture head-to-head UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Cinematic architecture head-to-head PASS: ${checks.length}/${checks.length} checks with explicit losses; ${output}`);
}
