import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const REPORT_PATH = "tests/reports/postprocessing/report.json";
const MAX_AGE_MS = 30 * 60 * 1000;

interface Check { readonly id: string; readonly pass: boolean; readonly detail: string }
const check = (id: string, pass: boolean, detail: string): Check => ({ id, pass, detail });
const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const fresh = (report: any): boolean => { const timestamp = Date.parse(String(report.generatedAt ?? "")); return Number.isFinite(timestamp) && Date.now() - timestamp <= MAX_AGE_MS; };

const baseline = json("tests/reports/current-threejs-baseline.json");
const aura = json("tests/reports/postprocessing/comprehensive-effects.json");
const webgl = json("tests/reports/threejs-parity/unreal-bloom-parity.json");
const node = json("tests/reports/postprocessing/current-three-node.json");

const authored = {
  aura: `import { PostProcessComposer } from "./packages/rendering/src/index.ts";
const composer = new PostProcessComposer({ device, width, height });
composer.setPasses([{ name: "bloom" }, { name: "tone-mapping" }, { name: "fxaa" }]);
composer.render({ source });`,
  threeWebgl: `import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(resolution, 0.82, 0.42, 0.08));
composer.render();`,
  threeNode: `import { RenderPipeline } from "three/webgpu";
import { pass } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
const pipeline = new RenderPipeline(renderer);
const sceneColor = pass(scene, camera).getTextureNode("output");
pipeline.outputNode = sceneColor.add(bloom(sceneColor, 0.82, 0.42, 0.08));
pipeline.render();`
} as const;

const bundles = {
  aura: await bundle(authored.aura),
  threeWebgl: await bundle(authored.threeWebgl),
  threeNode: await bundle(authored.threeNode)
};

const webglPasses = listNamedModules("node_modules/three/examples/jsm/postprocessing", /(?:Pass|Composer)\.js$/);
const nodePasses = listNamedModules("node_modules/three/examples/jsm/tsl/display", /(?:Node|PassNode)\.js$/);
const auraPasses = aura.composition?.passNames ?? [];
const everyEffect = aura.effects?.every((effect: any) => effect.subjectChangedPixels >= 8 && effect.subjectMeanDelta > 0.05 && effect.changedPixels >= effect.subjectChangedPixels);
const sourcePaths = [
  "packages/rendering/src/postprocess/EffectComposer.ts",
  "packages/rendering/src/PostProcessPass.ts",
  "tests/browser/postprocess-comprehensive-harness.ts"
];
const domCssFree = sourcePaths.every((path) => !/filter\s*:\s*(?:blur|drop-shadow|contrast|brightness)|box-shadow\s*:|text-shadow\s*:/i.test(readFileSync(resolve(path), "utf8")));

const checks: Check[] = [
  check("current-three-r185", baseline.pass === true && baseline.three?.version === "0.185.1" && baseline.three?.tag === "r185", `three=${String(baseline.three?.version)}; tag=${String(baseline.three?.tag)}`),
  check("public-composer-complete-catalog", aura.status === "ready" && aura.assertions?.completeAdvertisedComposerCatalog === true && auraPasses.length === 13, `passes=${auraPasses.join(",")}`),
  check("every-effect-subject-region-on-off", aura.assertions?.everyEffectHasSubjectPixels === true && everyEffect === true, `effects=${String(aura.effects?.length)}; minimumSubjectChanged=${String(Math.min(...aura.effects.map((effect: any) => effect.subjectChangedPixels)))}`),
  check("actual-webgl-no-dom-css-effects", aura.renderer === "webgl2" && aura.assertions?.actualWebglBackbuffer === true && aura.assertions?.domOrCssEffectImplementation === false && domCssFree, aura.implementation),
  check("two-target-reuse", aura.composition?.pingPongTargets === 2 && aura.assertions?.reusableTwoTargetPingPong === true, `auraPingPong=${String(aura.composition?.pingPongTargets)}`),
  check("current-three-webgl-quality", webgl.status === "ready" && webgl.assertions?.actualEffectComposer === true && webgl.assertions?.actualUnrealBloomPass === true && webgl.a3d?.pixels?.haloPixels > 3_000 && webgl.threejs?.pixels?.haloPixels > 8_000 && webgl.diff?.structuralSimilarityProxy >= 0.45, `similarity=${String(webgl.diff?.structuralSimilarityProxy)}; auraHalo=${String(webgl.a3d?.pixels?.haloPixels)}; threeHalo=${String(webgl.threejs?.pixels?.haloPixels)}`),
  check("current-three-node-quality", node.status === "ready" && node.actual?.webgpuRenderer === true && node.actual?.renderPipeline === true && node.actual?.nodeBloom === true && node.actual?.webgl2Backend === true && node.pixels?.haloPixels > 1_000, `renderer=${String(node.renderer)}; backend=${String(node.backend)}; halo=${String(node.pixels?.haloPixels)}`),
  check("pass-surface-compared", auraPasses.length === 13 && webglPasses.length >= 20 && nodePasses.length >= 20, `aura=${auraPasses.length}; threeWebglModules=${webglPasses.length}; threeNodeModules=${nodePasses.length}`),
  check("render-targets-compared", webgl.a3d?.postprocess?.renderTargets === 2 && webgl.threejs?.postprocess?.renderTargets >= 13 && node.renderTargets?.minimumTotal >= 7, `aura=${String(webgl.a3d?.postprocess?.renderTargets)}; threeWebgl=${String(webgl.threejs?.postprocess?.renderTargets)}; threeNode=${String(node.renderTargets?.minimumTotal)}`),
  check("bundle-cost-compared", Object.values(bundles).every((entry) => entry.bytes > 0 && entry.gzipBytes > 0), `gzipBytes=${JSON.stringify(Object.fromEntries(Object.entries(bundles).map(([id, value]) => [id, value.gzipBytes])))}`),
  check("frame-cost-compared", webgl.a3d?.postprocess?.frameCost?.samples >= 10 && webgl.threejs?.postprocess?.frameCost?.samples >= 10 && node.frameCost?.samples >= 10 && aura.effects?.every((effect: any) => effect.medianFrameMs >= 0), `bloomMedianMs=aura:${String(webgl.a3d?.postprocess?.frameCost?.medianMs)},threeWebgl:${String(webgl.threejs?.postprocess?.frameCost?.medianMs)},threeNode:${String(node.frameCost?.medianMs)}`),
  check("authored-complexity-compared", Object.values(authored).every((source) => logicalLines(source) >= 4), `logicalLines=${JSON.stringify(Object.fromEntries(Object.entries(authored).map(([id, source]) => [id, logicalLines(source)])))}`),
  check("reports-fresh", [baseline, aura, webgl, node].every(fresh), `generatedAt=${[baseline, aura, webgl, node].map((entry) => entry.generatedAt).join(",")}`)
];

const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "aura3d.renderer-postprocessing/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  claim: "bounded-public-composer-and-current-threejs-postprocess-comparison",
  currentThree: { version: baseline.three?.version, tag: baseline.three?.tag, releaseCommit: baseline.three?.releaseCommit },
  quality: {
    auraAllEffects: aura.effects?.map((entry: any) => ({ effect: entry.effect, subjectChangedPixels: entry.subjectChangedPixels, subjectMeanDelta: entry.subjectMeanDelta, uniqueColorBuckets: entry.uniqueColorBuckets })),
    sameSceneBloom: { meanDelta: webgl.diff?.meanDelta, structuralSimilarityProxy: webgl.diff?.structuralSimilarityProxy, auraHaloPixels: webgl.a3d?.pixels?.haloPixels, threeWebglHaloPixels: webgl.threejs?.pixels?.haloPixels },
    threeNodeBloom: node.pixels
  },
  passes: { aura: auraPasses, threeWebglModules: webglPasses, threeNodeDisplayModules: nodePasses },
  renderTargets: { auraReusablePingPong: 2, threeWebglBloomMinimum: webgl.threejs?.postprocess?.renderTargets, threeNodeBloomMinimum: node.renderTargets?.minimumTotal },
  bundle: bundles,
  frameCost: { units: "browser wall-clock milliseconds after warm-up; local machine, directional comparison only", auraAllEffects: Object.fromEntries(aura.effects.map((entry: any) => [entry.effect, entry.medianFrameMs])), auraBloomChain: webgl.a3d?.postprocess?.frameCost, threeWebglBloomChain: webgl.threejs?.postprocess?.frameCost, threeNodeBloomChain: node.frameCost },
  authoredComplexity: Object.fromEntries(Object.entries(authored).map(([id, source]) => [id, { logicalLines: logicalLines(source), source }])),
  scope: {
    proven: ["public lower-level PostProcessComposer with 13 effect variants", "per-effect WebGL-target on/off subject-region pixels", "current Three.js r185 WebGL EffectComposer and node RenderPipeline bloom execution", "measured target, bundle, frame, and authoring comparisons"],
    limited: ["Aura composer kernels currently include CPU readback/work before WebGL target presentation", "same-scene numeric visual comparison is bloom-only", "frame timings are local directional measurements, not universal performance rankings"],
    blocked: ["root createAuraApp access to outline, SSR, DoF, motion blur, and TAA", "SMAA and a GPU-only node graph equivalent", "blanket quality or performance parity with the full Three.js addon ecosystem"]
  },
  checks,
  failures: failures.map(({ id, detail }) => ({ id, detail })),
  evidence: ["tests/reports/postprocessing/comprehensive-effects.json", "tests/reports/threejs-parity/unreal-bloom-parity.json", "tests/reports/postprocessing/current-three-node.json"]
};

mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });
writeFileSync(resolve(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) { console.error(`Postprocessing proof is UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`); process.exitCode = 1; }
else console.log(`Postprocessing proof PASS: Three.js ${String(report.currentThree.version)}; ${checks.length}/${checks.length} checks; ${REPORT_PATH}`);

async function bundle(contents: string): Promise<{ readonly bytes: number; readonly gzipBytes: number }> {
  const result = await build({ stdin: { contents, resolveDir: resolve(".") }, bundle: true, minify: true, treeShaking: true, write: false, platform: "browser", format: "esm", target: "es2022", logLevel: "silent" });
  const output = result.outputFiles[0]?.contents ?? new Uint8Array();
  return { bytes: output.byteLength, gzipBytes: gzipSync(output).byteLength };
}
function listNamedModules(path: string, pattern: RegExp): string[] { return readdirSync(resolve(path)).filter((name) => pattern.test(name) && statSync(resolve(path, name)).isFile()).sort(); }
function logicalLines(source: string): number { return source.split("\n").filter((line) => line.trim() && !line.trim().startsWith("//")).length; }
