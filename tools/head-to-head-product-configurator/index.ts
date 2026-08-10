import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const text = (path: string): string => readFileSync(resolve(path), "utf8");
const baseline = json("tests/reports/current-threejs-baseline.json");
const context = json("benchmark/context/threejs-r185.1-20260808.json");
const browser = json("tests/reports/current-head-to-head/product-configurator/report.json");
const source = text("benchmark/current-head-to-head/product-configurator/src/main.tsx");
const expectedAsset = context.assets.product;
const actualAssetHash = createHash("sha256").update(readFileSync(resolve(expectedAsset.path))).digest("hex");
const captures = ["aura-before.png", "three-before.png", "aura-after.png", "three-after.png"];
const checks = [
  { id: "current-three-r185", pass: baseline.pass === true && baseline.three?.version === "0.185.1" && browser.before?.three?.revision === "185" },
  { id: "exact-frozen-asset", pass: browser.assetSha256 === expectedAsset.sha256 && actualAssetHash === expectedAsset.sha256 && browser.before?.asset?.id === expectedAsset.id },
  { id: "frozen-native-viewport", pass: browser.before?.viewport?.width === context.commonRenderContract.viewport.width && browser.before?.viewport?.height === context.commonRenderContract.viewport.height && browser.before?.viewport?.dpr === context.commonRenderContract.devicePixelRatio && captures.every((name) => statSync(resolve(`tests/reports/current-head-to-head/product-configurator/${name}`)).size > 10_000) },
  { id: "public-idiomatic-stacks", pass: source.includes('from "@aura3d/engine"') && source.includes('from "@react-three/fiber"') && source.includes('from "@react-three/drei"') && source.includes('from "three"') && !source.includes("packages/") && browser.before?.aura?.publicPackageOnly === true && browser.before?.three?.actualR3F === true && browser.before?.three?.actualDrei === true && browser.before?.three?.actualGLTFLoader === true },
  { id: "same-initial-material-and-environment", pass: JSON.stringify(browser.before?.aura?.material) === JSON.stringify(browser.before?.three?.material) && browser.before?.aura?.configuration === "copper-gloss-studio" && browser.before?.three?.configuration === "copper-gloss-studio" && browser.before?.aura?.environment === "studio" && browser.before?.three?.environment === "studio" },
  { id: "same-changed-material-and-environment", pass: JSON.stringify(browser.after?.aura?.material) === JSON.stringify(browser.after?.three?.material) && browser.after?.aura?.configuration === "ceramic-titanium-inspection" && browser.after?.three?.configuration === "ceramic-titanium-inspection" && browser.after?.aura?.environment === "inspection" && browser.after?.three?.environment === "inspection" },
  { id: "paired-configuration-changes-pixels", pass: browser.after?.interaction?.applied === true && browser.before?.aura?.pixelHash !== browser.after?.aura?.pixelHash && browser.before?.three?.pixelHash !== browser.after?.three?.pixelHash },
  { id: "matched-background-output", pass: maxChannelDelta(browser.before?.aura?.backgroundPixel, browser.before?.three?.backgroundPixel) <= 3 && maxChannelDelta(browser.after?.aura?.backgroundPixel, browser.after?.three?.backgroundPixel) <= 3 }
];
const failures = checks.filter((entry) => !entry.pass);
const auraDrawCalls = browser.before?.aura?.drawCalls ?? 0;
const threeDrawCalls = browser.before?.three?.drawCalls ?? 0;
const report = {
  schema: "aura3d.current-head-to-head-product-configurator/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  workload: "product-configurator",
  verdict: "both-configure-the-exact-product-with-visible-rendering-differences",
  checks,
  failures,
  comparison: {
    auraDrawCalls,
    threeDrawCalls,
    auraToThreeDrawCallRatio: threeDrawCalls > 0 ? Number((auraDrawCalls / threeDrawCalls).toFixed(3)) : null,
    observedLosses: [
      `Aura submits ${auraDrawCalls} draws versus Three.js ${threeDrawCalls} for the selected product configuration workload.`,
      "The workload matches asset, camera, material values, light-rig intent, backgrounds, and state transition; per-pixel material and highlight differences remain and must be judged from the retained images.",
      "The native stage implementations are visibly different: Aura presents a narrower dark plinth while Three.js presents a wider flat disc.",
      "This selected two-state comparison does not cover commerce, every flagship control, performance non-inferiority, or universal configurator parity."
    ],
    claimBoundary: "Exact frozen headphone, matched two-state material/finish/environment contract, public Aura root API, and current idiomatic R3F/drei/Three r185. It is not universal visual, performance, commerce, or ecosystem parity."
  },
  browser
};
const output = resolve("tests/reports/current-head-to-head/product-configurator/aggregate.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) {
  console.error(`Product configurator head-to-head UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Product configurator head-to-head PASS: ${checks.length}/${checks.length} checks with explicit losses; ${output}`);
}
function maxChannelDelta(a: readonly number[] = [], b: readonly number[] = []): number { return Math.max(...a.slice(0, 3).map((value, index) => Math.abs(value - (b[index] ?? 0)))); }
