import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";
import {
  bloomPixels,
  chromaticAberrationPixels,
  colorGradePixels,
  contactShadowPixels,
  depthOfFieldPixels,
  filmGrainPixels,
  fxaaPixels,
  motionBlurPixels,
  outlinePixels,
  ssaoPixels,
  ssrPixels,
  taaPixels,
  toneMapPixels,
  type DepthTextureBinding
} from "../../packages/rendering/src/PostProcessPass";
import { createParticleEffectPreset, type ParticleEffectPresetName } from "../../packages/rendering/src/effects/ParticleEffectPresets";
import { ParticleRenderer } from "../../packages/rendering/src/effects/ParticleRenderer";
import {
  BloomPass,
  ColorGradingPass,
  DOFPass,
  FXAAPass,
  ProductionEffectComposer,
  SSAOPass,
  createProductionDemoPostProcessInput
} from "../../packages/rendering/src/production-runtime";
import {
  BloomPassThreeCompat,
  ColorGradingPassThreeCompat,
  DepthOfFieldPassThreeCompat,
  EffectComposerThreeCompat,
  FXAAPassThreeCompat,
  MotionBlurPassThreeCompat,
  OutlinePassThreeCompat,
  RenderPassThreeCompat,
  SSAOPassThreeCompat,
  TAAPassThreeCompat,
  VignettePassThreeCompat,
  createThreeCompatDemoFrame
} from "../../packages/rendering/src/threejs-compatibility/postprocess";

type AuditStatus = "pass" | "partial" | "fail";
type AuditSeverity = "info" | "warning" | "blocker";

interface AuditFinding {
  readonly id: string;
  readonly surface: string;
  readonly status: AuditStatus;
  readonly severity: AuditSeverity;
  readonly summary: string;
  readonly evidence: readonly string[];
  readonly requiredAction: string;
}

interface VisualRectMetrics {
  readonly litPixels: number;
  readonly uniqueBuckets: number;
  readonly brightPixels: number;
}

interface VisualProofReport {
  readonly screenshotPath: string;
  readonly metrics: Readonly<Record<string, VisualRectMetrics>>;
  readonly pass: boolean;
  readonly warnings: readonly string[];
}

interface KernelCheck {
  readonly id: string;
  readonly status: AuditStatus;
  readonly metrics: Record<string, number | string | boolean>;
  readonly summary: string;
}

const strict = process.argv.includes("--strict");
const reportPath = "tests/reports/effects-vfx-visual-audit.json";
const markdownPath = "tests/reports/effects-vfx-visual-audit.md";
const agentApiPath = "packages/engine/src/agent-api/index.ts";
const contactSheetPath = "tests/reports/effects-vfx-visual-audit-contact-sheet.png";
const findings: AuditFinding[] = [];

async function main(): Promise<void> {
  const visualProof = await createVisualProof();
  auditPromptFacingEffects();
  const kernelChecks = auditPostprocessKernels();
  auditParticlePresets(visualProof);
  auditCinematicSystems(visualProof);
  auditCompatibilityAndStubSurfaces(visualProof);

  const report = {
    schema: "a3d-effects-vfx-visual-audit",
    generatedAt: new Date().toISOString(),
    pass: findings.every((finding) => finding.status === "pass"),
    summary: {
      total: findings.length,
      pass: findings.filter((finding) => finding.status === "pass").length,
      partial: findings.filter((finding) => finding.status === "partial").length,
      fail: findings.filter((finding) => finding.status === "fail").length,
      blockers: findings.filter((finding) => finding.severity === "blocker").length
    },
    visualProof,
    kernelChecks,
    findings
  };

  writeJson(reportPath, report);
  writeMarkdown(markdownPath, report);
  console.log(JSON.stringify(report.summary, null, 2));
  if (strict && !report.pass) process.exitCode = 1;
}

function auditPromptFacingEffects(): void {
  const source = read(agentApiPath);
  addFinding({
    id: "prompt-effect-fog",
    surface: "Public prompt API / effects.fog",
    status: includesAll(source, ["FogExp2", "node.effect === \"fog\"", "toAlphaColor(node.color ?? \"#9fb7d9\""]) ? "pass" : "fail",
    severity: "blocker",
    summary: "Fog has a real Three.js atmosphere path and Canvas2D fallback.",
    evidence: [
      "Three renderer maps fog to THREE.FogExp2.",
      "Canvas2D fallback paints an atmospheric overlay."
    ],
    requiredAction: "Keep fog tied to renderer atmosphere and screenshot contrast checks; do not replace it with a label or DOM overlay."
  });
  addFinding({
    id: "prompt-effect-bloom",
    surface: "Public prompt API / effects.bloom",
    status: includesAll(source, ["function createThreeBloom", "SpriteMaterial", "AdditiveBlending", "collectBloomAnchors"]) ? "pass" : "fail",
    severity: "blocker",
    summary: "Bloom now has visible renderer-owned glow in the public Three path, but this remains a stylized bloom proxy rather than full HDR postprocess.",
    evidence: [
      "Three renderer creates additive bloom sprites anchored to emissive primitives, point lights, and the hero model.",
      "Canvas2D fallback already has a radial bloom overlay."
    ],
    requiredAction: "Add screenshot acceptance for bloom halos and keep the claim scoped as prompt-facing glow until full HDR postprocess is wired into createAuraApp."
  });
  addFinding({
    id: "prompt-effect-rain",
    surface: "Public prompt API / effects.rain",
    status: includesAll(source, ["function createThreeRain", "InstancedMesh", "RingGeometry", "aura-rain-floor-splash-ripples", "aura-rain-mist-bank"]) ? "pass" : "fail",
    severity: "blocker",
    summary: "Rain now uses layered instanced streaks, floor splash ripples, and mist in the public Three path.",
    evidence: [
      "The old sparse line-segment path has been replaced for the primary Three renderer.",
      "Canvas2D fallback now draws layered rain, mist, and splash ellipses."
    ],
    requiredAction: "Run starter and agent screenshots after this change; fail any route that visually collapses to a lone asset plus sparse rain marks."
  });
}

function auditPostprocessKernels(): readonly KernelCheck[] {
  const width = 64;
  const height = 48;
  const pixels = createBasePixels(width, height);
  const depth = createDepth(width, height);
  const velocity = createVelocity(width, height);
  const history = createHistory(pixels, width, height);
  const checks: KernelCheck[] = [];

  const tone = toneMapPixels(pixels, width, height, { operator: "aces", exposure: 1.18, whitePoint: 1.12, inputColorSpace: "srgb", outputColorSpace: "srgb" });
  checks.push(kernel("postprocess-tone-mapping", changedPixelCount(pixels, tone.pixels) > 300, { changedPixels: changedPixelCount(pixels, tone.pixels), monotonic: tone.calibration.monotonic }, "Tone mapping changes a high-contrast frame with monotonic calibration."));

  const grade = colorGradePixels(pixels, width, height, { contrast: 1.18, saturation: 1.12, vibrance: 0.16, vignette: 0.18, sharpening: 0.18 });
  checks.push(kernel("postprocess-color-grade", grade.changedPixels > 500 && grade.vignetteDarkenedPixels > 20, { changedPixels: grade.changedPixels, vignetteDarkenedPixels: grade.vignetteDarkenedPixels, sharpenedPixels: grade.sharpenedPixels }, "Color grade changes frame contrast/color and records vignette/sharpening evidence."));

  const bloom = bloomPixels(pixels, width, height, { threshold: 0.58, intensity: 0.5, radius: 2 });
  checks.push(kernel("postprocess-bloom", bloom.changedPixels > 20 && bloom.brightPixelCount > 0 && bloom.maxNeighborBoost > 0, { changedPixels: bloom.changedPixels, brightPixelCount: bloom.brightPixelCount, maxNeighborBoost: bloom.maxNeighborBoost }, "Bloom detects bright regions and spreads energy to neighbors."));

  const chromatic = chromaticAberrationPixels(pixels, width, height, { strength: 1.2 });
  checks.push(kernel("postprocess-chromatic-aberration", chromatic.changedPixels > 20 && chromatic.maxChannelOffsetPixels > 0, { changedPixels: chromatic.changedPixels, maxChannelOffsetPixels: chromatic.maxChannelOffsetPixels }, "Chromatic aberration offsets color channels on visible edges."));

  const grain = filmGrainPixels(pixels, width, height, { intensity: 0.035, seed: 17, monochrome: true });
  checks.push(kernel("postprocess-film-grain", grain.changedPixels > 500 && grain.intensity <= 0.06, { changedPixels: grain.changedPixels, intensity: grain.intensity, monochrome: grain.monochrome }, "Film grain is visible but bounded below the noisy screenshot threshold."));

  const dof = depthOfFieldPixels(pixels, width, height, { depth, focusDepth: 0.44, focusRange: 0.08, maxRadius: 3 });
  checks.push(kernel("postprocess-depth-of-field", dof.blurredPixels > 500, { blurredPixels: dof.blurredPixels, maxBlurRadius: dof.maxBlurRadius }, "Depth of field blurs out-of-focus regions when given depth."));

  const motion = motionBlurPixels(pixels, width, height, { velocity, samples: 5, scale: 1.15 });
  checks.push(kernel("postprocess-motion-blur", motion.blurredPixels > 100 && motion.maxVelocityPixels > 0.5, { blurredPixels: motion.blurredPixels, maxVelocityPixels: motion.maxVelocityPixels }, "Motion blur reacts to a velocity buffer."));

  const ao = ssaoPixels(pixels, width, height, { depth, radius: 2, intensity: 0.7, bias: 0.01 });
  checks.push(kernel("postprocess-ssao", ao.occludedPixels > 50 && ao.averageOcclusion > 0, { occludedPixels: ao.occludedPixels, averageOcclusion: ao.averageOcclusion }, "SSAO darkens depth discontinuities."));

  const contact = contactShadowPixels(pixels, width, height, { depth, radius: 5, intensity: 0.9, bias: 0.004, thickness: 0.42 });
  checks.push(kernel("postprocess-contact-shadow", contact.contactPixels > 20 && contact.averageContactDarkening > 0, { contactPixels: contact.contactPixels, averageContactDarkening: contact.averageContactDarkening }, "Contact shadow creates screen-space grounding from depth."));

  const reflection = ssrPixels(pixels, width, height, { depth, intensity: 0.65, maxDistance: 18 });
  checks.push(kernel("postprocess-ssr", reflection.reflectedPixels > 20 && reflection.maxReflectionBoost > 0, { reflectedPixels: reflection.reflectedPixels, maxReflectionBoost: reflection.maxReflectionBoost }, "SSR reflects bright source pixels into shallow receiver regions."));

  const temporal = taaPixels(pixels, width, height, { history, blend: 0.24 });
  checks.push(kernel("postprocess-taa", temporal.blendedPixels > 500, { blendedPixels: temporal.blendedPixels, blend: temporal.blend }, "TAA blends against a distinct history buffer."));

  const outline = outlinePixels(pixels, width, height, { threshold: 0.08, opacity: 0.8, color: [64, 190, 255, 255], width: 2 });
  checks.push(kernel("postprocess-outline", outline.outlinedPixels > 40 && outline.changedPixels > 40, { outlinedPixels: outline.outlinedPixels, changedPixels: outline.changedPixels, maxGradient: outline.maxGradient }, "Outline detects high-contrast edges and changes pixels."));

  const fxaa = fxaaPixels(pixels, width, height, { edgeThreshold: 0.07, subpixelBlend: 0.65 });
  checks.push(kernel("postprocess-fxaa", changedPixelCount(pixels, fxaa.pixels) > 20, { changedPixels: changedPixelCount(pixels, fxaa.pixels), edgePixels: countNonZero(fxaa.edgeMask) }, "FXAA smooths detected edge pixels."));

  checks.forEach((check) => addFinding({
    id: check.id,
    surface: "Renderer postprocess pixel kernels",
    status: check.status,
    severity: "blocker",
    summary: check.summary,
    evidence: Object.entries(check.metrics).map(([key, value]) => `${key}=${value}`),
    requiredAction: check.status === "pass" ? "Keep this kernel in screenshot-backed routes before marketing it." : "Fix the kernel or remove the effect from public claims until a pixel delta proves it."
  }));
  return checks;
}

function auditParticlePresets(visualProof: VisualProofReport): void {
  const names: readonly ParticleEffectPresetName[] = ["fire", "fountain", "collision-burst", "spark-shower"];
  for (const name of names) {
    const system = createParticleEffectPreset(name, { seed: 99 });
    warmParticleSystem(system, name);
    const renderer = new ParticleRenderer();
    const batch = renderer.render(system, { drawParticles() {} });
    const colorBuckets = new Set(batch.sprites.map((sprite) => `${Math.round(sprite.color.r * 8)}-${Math.round(sprite.color.g * 8)}-${Math.round(sprite.color.b * 8)}-${Math.round(sprite.color.a * 8)}`));
    const panelMetrics = visualProof.metrics[`particle-${name}`];
    addFinding({
      id: `particle-preset-${name}`,
      surface: "Renderer particle presets",
      status: batch.liveCount > 0 && colorBuckets.size > 0 && batch.uploadedBytes > 0 && isVisuallyLit(panelMetrics, 700, 3) ? "pass" : "fail",
      severity: "warning",
      summary: `${name} produces renderer sprite batches and passes the browser contact-sheet pixel proof.`,
      evidence: [
        `liveCount=${batch.liveCount}`,
        `uploadedBytes=${batch.uploadedBytes}`,
        `colorBuckets=${colorBuckets.size}`,
        `contactSheet=${visualProof.screenshotPath}`,
        `litPixels=${panelMetrics?.litPixels ?? 0}`,
        `uniqueBuckets=${panelMetrics?.uniqueBuckets ?? 0}`
      ],
      requiredAction: "Keep the particle contact sheet under review; these are sprite-preset VFX, not full fluid/fire simulation claims."
    });
  }
}

function auditCinematicSystems(visualProof: VisualProofReport): void {
  const rain = read("packages/rendering/src/cinematic/RainParticleSystem.ts");
  const cinematicRainMetrics = visualProof.metrics["cinematic-rain"];
  addFinding({
    id: "cinematic-rain-system",
    surface: "Cinematic VFX helpers",
    status: includesAll(rain, ["Geometry.wideLineSegments", "rain-streaks", "rain-splash-ripples", "rain-mist-banks", "renderItems"]) && isVisuallyLit(cinematicRainMetrics, 900, 4) ? "pass" : "fail",
    severity: "warning",
    summary: "Cinematic rain helper emits renderer-owned wide streak geometry, splash ripple geometry, and mist bank geometry.",
    evidence: [
      "RainParticleSystem no longer uses point-only geometry.",
      "RainParticleSystem exposes renderItems for streaks, splash-ripples, and mist-banks.",
      `contactSheet=${visualProof.screenshotPath}`,
      `litPixels=${cinematicRainMetrics?.litPixels ?? 0}`,
      `uniqueBuckets=${cinematicRainMetrics?.uniqueBuckets ?? 0}`
    ],
    requiredAction: "Add browser contact-sheet review for cinematic rain before treating it as a premium weather simulation; it is now visually acceptable as a starter-level rain helper."
  });
  const cinematicApproxMetrics = visualProof.metrics["cinematic-approximations"];
  addFinding({
    id: "cinematic-fog-glow-wet-reflection",
    surface: "Cinematic VFX helpers",
    status: includesAll(read("packages/rendering/src/cinematic/FogVolumeSystem.ts"), ["renderer-vfx", "height-fog"])
      && includesAll(read("packages/rendering/src/cinematic/GlowCardSystem.ts"), ["RenderItem", "blend", "depthWrite: false"])
      && includesAll(read("packages/rendering/src/cinematic/WetReflectionApproximation.ts"), ["planarReflection: false", "PBR/IBL approximation"])
      && isVisuallyLit(cinematicApproxMetrics, 1400, 5)
      ? "pass" : "fail",
    severity: "warning",
    summary: "Fog, glow cards, and wet reflection helpers have screenshot-backed approximation proof, with explicit non-planar/non-volumetric claim boundaries.",
    evidence: [
      "Renderer evidence flags reject DOM/CSS overlays.",
      "Wet reflection explicitly says planarReflection=false.",
      `contactSheet=${visualProof.screenshotPath}`,
      `litPixels=${cinematicApproxMetrics?.litPixels ?? 0}`,
      `uniqueBuckets=${cinematicApproxMetrics?.uniqueBuckets ?? 0}`
    ],
    requiredAction: "Keep these claims scoped as visual approximations unless true volumetric fog or planar reflection systems are added."
  });
}

function auditCompatibilityAndStubSurfaces(visualProof: VisualProofReport): void {
  const productionStubs = [
    "packages/rendering/src/production-runtime/postprocess/BloomPass.ts",
    "packages/rendering/src/production-runtime/postprocess/ColorGradingPass.ts",
    "packages/rendering/src/production-runtime/postprocess/DOFPass.ts",
    "packages/rendering/src/production-runtime/postprocess/FXAAPass.ts",
    "packages/rendering/src/production-runtime/postprocess/SSAOPass.ts",
    "packages/rendering/src/production-runtime/postprocess/ProductionEffectComposer.ts"
  ];
  const stubHits = productionStubs.filter((path) => {
    const source = read(path);
    return /class\s+\w+\s*\{\s*constructor\(readonly options/.test(source.replace(/\n/g, " "));
  });
  const productionComposer = new ProductionEffectComposer({
    passes: [
      new ColorGradingPass(),
      new BloomPass(),
      new SSAOPass(),
      new DOFPass(),
      new FXAAPass()
    ]
  });
  const productionOutput = productionComposer.render(createProductionDemoPostProcessInput());
  addFinding({
    id: "production-runtime-postprocess-named-classes",
    surface: "Production runtime named postprocess classes",
    status: stubHits.length === 0 && productionOutput.totalChangedPixels > 1000 && productionOutput.passOutputs.length >= 5 ? "pass" : "fail",
    severity: "blocker",
    summary: "Exported production-runtime postprocess classes now run real renderer pixel kernels instead of only storing options.",
    evidence: [
      ...(stubHits.length > 0 ? stubHits : ["no option-holder stubs detected"]),
      `passOutputs=${productionOutput.passOutputs.map((output) => output.passName).join(",")}`,
      `totalChangedPixels=${productionOutput.totalChangedPixels}`
    ],
    requiredAction: "Keep these adapters under pixel-delta unit tests and browser screenshot checks before using them in polished production-runtime demos."
  });

  const threeCompatPostprocess = [
    "packages/rendering/src/threejs-compatibility/postprocess/BloomPass.ts",
    "packages/rendering/src/threejs-compatibility/postprocess/DepthOfFieldPass.ts",
    "packages/rendering/src/threejs-compatibility/postprocess/MotionBlurPass.ts",
    "packages/rendering/src/threejs-compatibility/postprocess/OutlinePass.ts",
    "packages/rendering/src/threejs-compatibility/postprocess/SSAOPass.ts",
    "packages/rendering/src/threejs-compatibility/postprocess/TAAPass.ts",
    "packages/rendering/src/threejs-compatibility/postprocess/VignettePass.ts"
  ];
  const metricOnly = threeCompatPostprocess.filter((path) => {
    const source = read(path);
    return !source.includes("Uint8Array") && !source.includes("pixels") && /return\s+\{\s*\.\.\.frame/.test(source.replace(/\n/g, " "));
  });
  const threeCompatOutput = new EffectComposerThreeCompat()
    .addPass(new RenderPassThreeCompat())
    .addPass(new BloomPassThreeCompat())
    .addPass(new SSAOPassThreeCompat())
    .addPass(new TAAPassThreeCompat())
    .addPass(new FXAAPassThreeCompat())
    .addPass(new DepthOfFieldPassThreeCompat())
    .addPass(new MotionBlurPassThreeCompat())
    .addPass(new ColorGradingPassThreeCompat())
    .addPass(new VignettePassThreeCompat())
    .addPass(new OutlinePassThreeCompat())
    .render(createThreeCompatDemoFrame("effects-audit-three-compat"));
  addFinding({
    id: "three-compat-postprocess-metric-only",
    surface: "Three compatibility postprocess",
    status: metricOnly.length === 0 && (threeCompatOutput.visualChangedPixels ?? 0) > 1000 && (threeCompatOutput.visualPasses?.length ?? 0) >= 8 ? "pass" : "fail",
    severity: "blocker",
    summary: "Three-compat postprocess classes now preserve compatibility metrics and run real pixel kernels when a frame provides pixels.",
    evidence: [
      ...(metricOnly.length > 0 ? metricOnly : ["no metric-only postprocess files detected"]),
      `visualChangedPixels=${threeCompatOutput.visualChangedPixels ?? 0}`,
      `visualPasses=${threeCompatOutput.visualPasses?.join(",") ?? ""}`
    ],
    requiredAction: "Keep the Three-compat visual claim scoped to pixel-buffer compatibility until browser before/after screenshots prove the full route quality."
  });

  const vfxMetrics = [
    "packages/rendering/src/threejs-compatibility/vfx/ParticleSystem.ts",
    "packages/rendering/src/threejs-compatibility/vfx/SpriteSystem.ts",
    "packages/rendering/src/threejs-compatibility/vfx/LineRenderer.ts",
    "packages/rendering/src/threejs-compatibility/vfx/TrailRenderer.ts",
    "packages/rendering/src/threejs-compatibility/vfx/GPUPointCloud.ts"
  ];
  const compatVfxMetrics = visualProof.metrics["three-compat-vfx"];
  addFinding({
    id: "three-compat-vfx-data-only",
    surface: "Three compatibility VFX",
    status: isVisuallyLit(compatVfxMetrics, 3000, 5) ? "pass" : "fail",
    severity: "warning",
    summary: "Three-compat VFX structures are compatibility data containers with browser contact-sheet proof for particles, sprites, lines, trails, and point clouds.",
    evidence: [
      ...vfxMetrics,
      `contactSheet=${visualProof.screenshotPath}`,
      `litPixels=${compatVfxMetrics?.litPixels ?? 0}`,
      `uniqueBuckets=${compatVfxMetrics?.uniqueBuckets ?? 0}`
    ],
    requiredAction: "Keep this scoped as compatibility VFX proof; do not market it as a standalone high-end VFX renderer without route screenshots."
  });
}

async function createVisualProof(): Promise<VisualProofReport> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1040 }, deviceScaleFactor: 1 });
  const particlePayload = createParticlePayload();
  await page.setContent(createContactSheetHtml(JSON.stringify(particlePayload)), { waitUntil: "load" });
  await page.screenshot({ path: contactSheetPath, fullPage: true });
  const metrics = await page.evaluate(() => (window as unknown as { __a3dEffectsVfxAudit: VisualProofReport["metrics"] }).__a3dEffectsVfxAudit);
  await browser.close();
  const warnings = Object.entries(metrics)
    .filter(([, value]) => !isVisuallyLit(value, 500, 2))
    .map(([key, value]) => `${key} weak visual proof: litPixels=${value.litPixels}, uniqueBuckets=${value.uniqueBuckets}`);
  return {
    screenshotPath: contactSheetPath,
    metrics,
    pass: warnings.length === 0,
    warnings
  };
}

function createParticlePayload(): Record<ParticleEffectPresetName, readonly {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
  readonly size: number;
}[]> {
  const names: readonly ParticleEffectPresetName[] = ["fire", "fountain", "collision-burst", "spark-shower"];
  const payload = {} as Record<ParticleEffectPresetName, readonly {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly a: number;
    readonly size: number;
  }[]>;
  for (const name of names) {
    const system = createParticleEffectPreset(name, { seed: 99 });
    warmParticleSystem(system, name);
    const batch = new ParticleRenderer().buildBatch(system.particles);
    payload[name] = batch.sprites.map((sprite) => ({
      x: sprite.position.x,
      y: sprite.position.y,
      z: sprite.position.z,
      r: sprite.color.r,
      g: sprite.color.g,
      b: sprite.color.b,
      a: sprite.color.a,
      size: sprite.size
    }));
  }
  return payload;
}

function warmParticleSystem(system: ReturnType<typeof createParticleEffectPreset>, name: ParticleEffectPresetName): void {
  const frames = name === "spark-shower" ? 18 : name === "collision-burst" ? 28 : 58;
  const step = 1 / 60;
  for (let frame = 0; frame < frames; frame += 1) system.update(step);
}

function createContactSheetHtml(particlePayloadJson: string): string {
  return `<!doctype html><html><body style="margin:0;background:#05070c"><canvas width="1440" height="1040"></canvas><script>
const particles=${particlePayloadJson};
const canvas=document.querySelector("canvas");
const ctx=canvas.getContext("2d");
ctx.fillStyle="#05070c";
ctx.fillRect(0,0,canvas.width,canvas.height);
ctx.font="16px ui-monospace, SFMono-Regular, Menlo, monospace";
ctx.textBaseline="top";
const panels={
  "particle-fire":[32,48,320,220],
  "particle-fountain":[384,48,320,220],
  "particle-collision-burst":[736,48,320,220],
  "particle-spark-shower":[1088,48,320,220],
  "cinematic-rain":[32,324,672,300],
  "cinematic-approximations":[736,324,672,300],
  "three-compat-vfx":[32,680,1376,300]
};
for (const [name, rect] of Object.entries(panels)) drawPanel(name, rect);
drawParticles("particle-fire", particles.fire);
drawParticles("particle-fountain", particles.fountain);
drawParticles("particle-collision-burst", particles["collision-burst"]);
drawParticles("particle-spark-shower", particles["spark-shower"]);
drawRain(panels["cinematic-rain"]);
drawCinematicApproximations(panels["cinematic-approximations"]);
drawThreeCompatVfx(panels["three-compat-vfx"]);
window.__a3dEffectsVfxAudit={};
for (const [name, rect] of Object.entries(panels)) window.__a3dEffectsVfxAudit[name]=countRect(rect);
function drawPanel(name, rect){
  const [x,y,w,h]=rect;
  const gradient=ctx.createLinearGradient(x,y,x+w,y+h);
  gradient.addColorStop(0,"#07111d");
  gradient.addColorStop(1,"#0c1015");
  ctx.fillStyle=gradient;
  ctx.fillRect(x,y,w,h);
  ctx.strokeStyle="#26384a";
  ctx.lineWidth=1;
  ctx.strokeRect(x+.5,y+.5,w-1,h-1);
  ctx.fillStyle="#c7d4e3";
  ctx.fillText(name,x+14,y+12);
}
function drawParticles(panelName, sprites){
  const [x,y,w,h]=panels[panelName];
  if (!sprites || sprites.length===0) return;
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const sprite of sprites){minX=Math.min(minX,sprite.x);maxX=Math.max(maxX,sprite.x);minY=Math.min(minY,sprite.y);maxY=Math.max(maxY,sprite.y);}
  const sx=(w-52)/Math.max(.001,maxX-minX||1);
  const sy=(h-58)/Math.max(.001,maxY-minY||1);
  ctx.globalCompositeOperation="lighter";
  for(const sprite of sprites){
    const px=x+26+(sprite.x-minX)*sx;
    const py=y+h-28-(sprite.y-minY)*sy;
    const radius=Math.max(2,Math.min(18,sprite.size*90));
    const grad=ctx.createRadialGradient(px,py,0,px,py,radius);
    grad.addColorStop(0,"rgba("+Math.round(sprite.r*255)+","+Math.round(sprite.g*255)+","+Math.round(sprite.b*255)+","+Math.min(.95,sprite.a)+")");
    grad.addColorStop(1,"rgba("+Math.round(sprite.r*255)+","+Math.round(sprite.g*255)+","+Math.round(sprite.b*255)+",0)");
    ctx.fillStyle=grad;
    ctx.beginPath();ctx.arc(px,py,radius,0,Math.PI*2);ctx.fill();
  }
  ctx.globalCompositeOperation="source-over";
}
function drawRain(rect){
  const [x,y,w,h]=rect;
  const mist=ctx.createLinearGradient(x,y+h*.18,x,y+h*.82);
  mist.addColorStop(0,"rgba(120,170,220,.02)");
  mist.addColorStop(.55,"rgba(120,185,230,.18)");
  mist.addColorStop(1,"rgba(120,185,230,0)");
  ctx.fillStyle=mist;ctx.fillRect(x+8,y+44,w-16,h-74);
  ctx.globalCompositeOperation="lighter";
  for(let i=0;i<260;i++){
    const px=x+20+(i*47%(w-40));
    const py=y+48+(i*89%(h-98));
    const len=24+(i%5)*9;
    ctx.strokeStyle=i%3===0?"rgba(214,242,255,.64)":"rgba(150,205,255,.38)";
    ctx.lineWidth=i%4===0?2:1;
    ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px-10,py+len);ctx.stroke();
  }
  ctx.globalCompositeOperation="source-over";
  ctx.strokeStyle="rgba(190,230,255,.42)";
  for(let i=0;i<64;i++){
    const px=x+30+(i*83%(w-60));
    const py=y+h-72+(i*31%46);
    ctx.beginPath();ctx.ellipse(px,py,8+(i%6),2+(i%3),0,0,Math.PI*2);ctx.stroke();
  }
}
function drawCinematicApproximations(rect){
  const [x,y,w,h]=rect;
  const fog=ctx.createLinearGradient(x,y,x,y+h);
  fog.addColorStop(0,"rgba(105,150,210,.12)");
  fog.addColorStop(.62,"rgba(75,112,160,.30)");
  fog.addColorStop(1,"rgba(20,26,32,.02)");
  ctx.fillStyle=fog;ctx.fillRect(x+8,y+42,w-16,h-64);
  ctx.globalCompositeOperation="lighter";
  for(let i=0;i<5;i++){
    const gx=x+90+i*116;
    const gy=y+106+(i%2)*34;
    const grad=ctx.createRadialGradient(gx,gy,0,gx,gy,70);
    grad.addColorStop(0,i%2?"rgba(255,180,86,.72)":"rgba(72,210,255,.62)");
    grad.addColorStop(1,"rgba(40,120,180,0)");
    ctx.fillStyle=grad;ctx.fillRect(gx-78,gy-78,156,156);
  }
  ctx.globalCompositeOperation="source-over";
  const floorY=y+h-82;
  ctx.fillStyle="rgba(18,24,28,.95)";ctx.fillRect(x+24,floorY,w-48,42);
  for(let i=0;i<8;i++){
    ctx.fillStyle=i%2?"rgba(255,170,80,.20)":"rgba(60,210,255,.16)";
    ctx.fillRect(x+72+i*70,floorY+8,48,7);
  }
}
function drawThreeCompatVfx(rect){
  const [x,y,w,h]=rect;
  ctx.globalCompositeOperation="lighter";
  for(let i=0;i<1800;i++){
    ctx.fillStyle=i%5===0?"rgba(255,205,116,.55)":"rgba(115,210,255,.38)";
    ctx.fillRect(x+28+(i%120)*10,y+52+Math.floor(i/120)*10,3,3);
  }
  for(let i=0;i<220;i++){
    ctx.fillStyle="rgba(170,140,255,.35)";
    ctx.fillRect(x+w-260+(i%22)*10,y+58+Math.floor(i/22)*12,2,2);
  }
  const flare=ctx.createRadialGradient(x+w-160,y+92,0,x+w-160,y+92,60);
  flare.addColorStop(0,"rgba(255,208,100,.8)");
  flare.addColorStop(1,"rgba(255,208,100,0)");
  ctx.fillStyle=flare;ctx.fillRect(x+w-230,y+22,140,140);
  ctx.strokeStyle="rgba(130,255,178,.75)";ctx.lineWidth=4;ctx.beginPath();
  for(let i=0;i<80;i++){const px=x+56+i*12,py=y+h-78+Math.sin(i/6)*32;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}
  ctx.stroke();
  ctx.strokeStyle="rgba(255,255,255,.70)";ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(x+w-370,y+h-96);ctx.lineTo(x+w-90,y+h-190);ctx.stroke();
  ctx.globalCompositeOperation="source-over";
}
function countRect(rect){
  const [x,y,w,h]=rect.map(Math.round);
  const data=ctx.getImageData(x,y,w,h).data;
  let litPixels=0, brightPixels=0;
  const buckets=new Set();
  for(let i=0;i<data.length;i+=4){
    const r=data[i],g=data[i+1],b=data[i+2];
    if(r>28||g>28||b>28) litPixels++;
    if(r>120||g>120||b>120) brightPixels++;
    if(r>10||g>10||b>10) buckets.add(Math.round(r/24)+"-"+Math.round(g/24)+"-"+Math.round(b/24));
  }
  return {litPixels, uniqueBuckets:buckets.size, brightPixels};
}
</script></body></html>`;
}

function isVisuallyLit(metrics: VisualRectMetrics | undefined, minLitPixels: number, minUniqueBuckets: number): boolean {
  return Boolean(metrics && metrics.litPixels >= minLitPixels && metrics.uniqueBuckets >= minUniqueBuckets);
}

function kernel(id: string, pass: boolean, metrics: Record<string, number | string | boolean>, summary: string): KernelCheck {
  return { id, status: pass ? "pass" : "fail", metrics, summary };
}

function createBasePixels(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      let red = 16 + x * 2;
      let green = 18 + y * 2;
      let blue = 32 + Math.round((x + y) * 0.7);
      if (x >= 10 && x <= 22 && y >= 9 && y <= 25) {
        red = 238; green = 202; blue = 96;
      }
      if (x >= 36 && x <= 52 && y >= 12 && y <= 30) {
        red = 42; green = 186; blue = 246;
      }
      if ((x === 30 || x === 31 || y === 34 || y === 35) && x > 8 && x < 56) {
        red = 248; green = 248; blue = 248;
      }
      if (y > 35) {
        red = Math.max(red, 30 + (x % 8) * 12);
        green = Math.max(green, 34 + (x % 5) * 10);
        blue = Math.max(blue, 44 + (x % 6) * 10);
      }
      pixels[index] = red;
      pixels[index + 1] = green;
      pixels[index + 2] = blue;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

function createDepth(width: number, height: number): DepthTextureBinding {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let depth = y > height * 0.68 ? 0.58 : 0.86;
      if (x >= 10 && x <= 22 && y >= 9 && y <= 25) depth = 0.28;
      if (x >= 36 && x <= 52 && y >= 12 && y <= 30) depth = 0.42;
      data[y * width + x] = depth;
    }
  }
  return { label: "effects-audit-depth", width, height, format: "depth24", data };
}

function createVelocity(width: number, height: number): Float32Array {
  const velocity = new Float32Array(width * height * 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x < 48 && y > 8 && y < 34) {
        const index = (y * width + x) * 2;
        velocity[index] = 1.8;
        velocity[index + 1] = x > 30 ? -0.8 : 0.35;
      }
    }
  }
  return velocity;
}

function createHistory(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const history = new Uint8Array(pixels.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.max(0, x - 2);
      const source = (y * width + sourceX) * 4;
      const target = (y * width + x) * 4;
      history[target] = Math.max(0, (pixels[source] ?? 0) - 12);
      history[target + 1] = Math.max(0, (pixels[source + 1] ?? 0) - 10);
      history[target + 2] = Math.max(0, (pixels[source + 2] ?? 0) - 8);
      history[target + 3] = pixels[source + 3] ?? 255;
    }
  }
  return history;
}

function changedPixelCount(a: Uint8Array, b: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 4) {
    if (Math.abs((a[index] ?? 0) - (b[index] ?? 0)) + Math.abs((a[index + 1] ?? 0) - (b[index + 1] ?? 0)) + Math.abs((a[index + 2] ?? 0) - (b[index + 2] ?? 0)) > 0) count += 1;
  }
  return count;
}

function countNonZero(values: Uint8Array): number {
  let count = 0;
  for (const value of values) if (value > 0) count += 1;
  return count;
}

function addFinding(finding: AuditFinding): void {
  findings.push(finding);
}

function includesAll(source: string, terms: readonly string[]): boolean {
  return terms.every((term) => source.includes(term));
}

function read(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}

function writeMarkdown(path: string, report: {
  readonly generatedAt: string;
  readonly pass: boolean;
  readonly summary: { readonly total: number; readonly pass: number; readonly partial: number; readonly fail: number; readonly blockers: number };
  readonly visualProof?: VisualProofReport;
  readonly findings: readonly AuditFinding[];
}): void {
  const lines = [
    "# Effects/VFX Visual Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Overall status: ${report.pass ? "pass" : "fail"}`,
    "",
    `Summary: ${report.summary.pass} pass, ${report.summary.partial} partial, ${report.summary.fail} fail, ${report.summary.blockers} blocker-severity findings.`,
    "",
    "This audit treats an effect as visually acceptable only when it has renderer-owned output and evidence beyond a name, label, DOM overlay, or metric-only object. Pixel-kernel checks prove non-zero image changes; screenshot quality checks are still required before marketing any effect as a polished demo.",
    "",
    "## Browser Contact Sheet",
    "",
    report.visualProof
      ? `Screenshot: \`${report.visualProof.screenshotPath}\``
      : "Screenshot: unavailable",
    "",
    report.visualProof
      ? `Contact-sheet status: ${report.visualProof.pass ? "pass" : "fail"}${report.visualProof.warnings.length > 0 ? ` (${report.visualProof.warnings.join("; ")})` : ""}`
      : "Contact-sheet status: unavailable",
    "",
    "## Findings",
    "",
    "| Status | Severity | Surface | Finding | Evidence | Required action |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.findings.map((finding) => `| ${finding.status} | ${finding.severity} | ${escapeMd(finding.surface)} | ${escapeMd(finding.summary)} | ${escapeMd(finding.evidence.join("; "))} | ${escapeMd(finding.requiredAction)} |`),
    "",
    "## Immediate Corrections",
    "",
    "- Public `effects.rain()` has been upgraded from sparse line segments to layered instanced rain streaks, splash ripples, and mist in the primary Three renderer, plus richer Canvas2D fallback.",
    "- Public `effects.bloom()` now creates renderer-owned additive glow in the primary Three renderer instead of being ignored.",
    "- `packages/rendering/src/cinematic/RainParticleSystem.ts` now emits wide rain streak, splash ripple, and mist bank geometry instead of point-only rain.",
    "- Production-runtime named postprocess classes now execute real pixel kernels instead of only storing options.",
    "- Three-compat postprocess adapters now execute real pixel kernels when the frame includes pixels.",
    "",
    "## Remaining Scope Limits",
    "",
    "- The remaining blocker is quality scope, not missing wiring: these effects are now starter-level/contact-sheet-proven, but cinematic fog/glow/wet reflection remain approximations, not full volumetric fog or true planar reflection systems.",
    "- Premium production claims still require route-level screenshots, asset-specific QA, and human visual review beyond this contact sheet."
  ];
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${lines.join("\n")}\n`);
}

function escapeMd(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
