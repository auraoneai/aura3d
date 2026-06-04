#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const repoRoot = resolve(new URL("../../", import.meta.url).pathname);
const distAgentApi = resolve(repoRoot, "dist/engine/agent-api/index.js");
const reportPath = resolve(process.env.AURA3D_RENDER_MATERIAL_SMOKE_OUT ?? "/tmp/aura3d-render-material-quality-smoke.json");

if (!existsSync(distAgentApi)) {
  console.error(`Missing built agent API at ${distAgentApi}. Run pnpm build first.`);
  process.exit(1);
}

const api = await import(`file://${distAgentApi}`);
const {
  camera,
  collectAuraSceneEvidence,
  effects,
  environments,
  lights,
  material,
  prefabs,
  renderer,
  scene,
  sceneKits
} = api;

const checks = [];
const check = (id, pass, detail) => {
  checks.push({ id, pass: Boolean(pass), detail });
};

const colorManagement = renderer.colorManagementPreset();
check("renderer-color-management-linear-srgb-aces", colorManagement.workflow === "linear" && colorManagement.outputColorSpace === "srgb" && colorManagement.toneMapping === "aces-filmic", colorManagement);

const exposurePresets = renderer.exposurePresets();
const requiredCategories = ["product", "material", "neon", "city-night", "city-day", "space", "physics", "chart", "game"];
check("renderer-exposure-presets-complete", requiredCategories.every((category) => Number.isFinite(exposurePresets[category]?.exposure)), Object.keys(exposurePresets).sort());

const envPresets = environments.presets();
check("environment-ibl-presets-metal-glass-product-studio", ["studio", "material-lab", "product-hero", "metal-studio", "glass-studio"].every((id) => envPresets.some((preset) => preset.id === id)), envPresets.map((preset) => preset.id));

const materialPresets = material.presets();
const requiredMaterialPresets = [
  "chrome",
  "brushedMetal",
  "frostedGlass",
  "clearGlass",
  "blackRubber",
  "matteClay",
  "ceramic",
  "glowingEmissive",
  "clearcoatPaint",
  "sneakerMesh",
  "sneakerRubber",
  "fabric"
];
check("material-presets-complete", requiredMaterialPresets.every((key) => Boolean(materialPresets[key])), Object.keys(materialPresets).sort());

const proceduralTextures = [
  material.proceduralTextures.fabric(),
  material.proceduralTextures.rubber(),
  material.proceduralTextures.brushedMetal(),
  material.proceduralTextures.plastic()
];
check("material-procedural-textures-complete", proceduralTextures.map((texture) => texture.texture).join(",") === "fabric-normal,rubber-roughness,brushed-metal-anisotropy,plastic-micro-scratch", proceduralTextures);

const inspector = material.inspector("clearcoat smoke", material.clearcoatPaint());
check("material-inspector-live-values", inspector.kind === "aura-material-inspector" && inspector.parameters.some((parameter) => parameter.name === "clearcoat") && Number(inspector.liveValues.clearcoat) > 0.9, inspector.liveValues);

const materialNodes = [
  environments.materialLab({ intensity: 1.32 }).toJSON(),
  ...prefabs.materialSwatches(),
  lights.materialLab({ intensity: 1.9 }).toJSON(),
  lights.rect({ name: "material lab front fill rect light", position: [0, 1.58, 2.4], intensity: 0.74, width: 3.2, height: 0.72 }).toJSON(),
  effects.contactOcclusion({ intensity: 0.34, radius: 0.72 }).toJSON()
];
const materialQa = material.visualQA(materialNodes);
check("material-visual-qa-passes", materialQa.passes && materialQa.score >= 4, materialQa);

const materialScene = scene()
  .background("#10151f")
  .camera(camera.materials())
  .addMany(materialNodes)
  .diagnostics(true);
const materialRendererDiagnostics = renderer.diagnostics(materialScene);
check("renderer-diagnostics-material-status", materialRendererDiagnostics.sceneCategory === "material" && materialRendererDiagnostics.environment.enabled && materialRendererDiagnostics.occlusion.enabled && materialRendererDiagnostics.shadows.enabled, materialRendererDiagnostics);

const materialEvidence = collectAuraSceneEvidence(materialScene);
check("scene-evidence-rendering-report", materialEvidence.rendering.toneMapping === "aces-filmic" && materialEvidence.rendering.outputColorSpace === "srgb", materialEvidence.rendering);

const neonBloom = effects.neonBloom({ intensity: 5 }).toJSON();
const neonDiagnostics = renderer.diagnostics(scene().background("#020617").add(neonBloom));
check("bloom-anti-blowout-clamp", neonDiagnostics.bloom.enabled && neonDiagnostics.bloom.antiBlowout && neonDiagnostics.bloom.intensity <= 0.92 && neonDiagnostics.bloom.threshold >= 0.68, neonDiagnostics.bloom);

const screenshotQuality = renderer.screenshotQuality();
check("screenshot-quality-preset", screenshotQuality.id === "screenshot" && screenshotQuality.antialiasing === "msaa-plus-high-dpi" && screenshotQuality.preserveDrawingBuffer === true, screenshotQuality);

const kit = sceneKits.materialLab();
check("scene-kit-material-lab-structural-qa", (kit.diagnostics.structuralScore ?? 0) >= 4 && kit.diagnostics.performance.drawCalls.pass, kit.diagnostics);

const report = {
  schema: "a3d-render-material-quality-smoke/1.0",
  generatedAt: new Date().toISOString(),
  pass: checks.every((entry) => entry.pass),
  checks
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (!report.pass) process.exit(1);
