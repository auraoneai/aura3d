import {
  Geometry,
  PBRMaterial,
  Renderer,
  architecturalMaterialCatalogSummary,
  createArchitecturalLightingFixture,
  createArchitecturalMaterial,
  createLightingDefault,
  type ArchitecturalLightingPresetId,
  type LightingDefaultPreset,
  type RenderItem
} from "@galileo3d/rendering";

declare global {
  interface Window {
    __G3D_V4_INTERIOR_SCENE__?: unknown;
  }
}

type SceneLighting = "golden-hour" | "noon" | "night";

const lightingPresets: readonly SceneLighting[] = ["golden-hour", "noon", "night"];
const claimBoundary = "Milestone 9 interior scene proof only; V4 release still requires same-scene Three.js visual parity, real scanned material assets, and final package/template proof.";

export async function mountInteriorSceneV4(id: string): Promise<void> {
  const root = document.getElementById("app");
  if (!root) throw new Error("Missing #app root.");
  root.innerHTML = `
    <main style="display:grid;grid-template-columns:340px 1fr;height:100vh;background:#111418;color:#f3f0e8;font-family:Inter,system-ui,sans-serif">
      <aside style="border-right:1px solid #323943;padding:18px;overflow:auto">
        <h1 style="font-size:20px;margin:0 0 14px">Scene Studio Pro</h1>
        <label>Lighting <select data-testid="hr4-scene-lighting">${lightingPresets.map((preset) => `<option value="${preset}">${labelLighting(preset)}</option>`).join("")}</select></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:16px" data-testid="hr4-scene-elements">
          ${["Floor", "Back wall", "Curtain wall", "Sofa", "Tables", "Shelving", "Art panels", "Warm lamps", "Shadow receivers", "Retail plinths"].map((label) => `<div style="border:1px solid #323943;padding:7px;background:#191f26">${label}</div>`).join("")}
        </div>
        <pre data-testid="hr4-scene-status" style="white-space:pre-wrap;background:#171b20;padding:12px;margin-top:16px;max-height:42vh;overflow:auto">loading</pre>
      </aside>
      <section style="display:grid;grid-template-rows:1fr 44px;min-width:0">
        <canvas data-testid="hr4-scene-canvas" width="1280" height="820" style="width:100%;height:100%;display:block"></canvas>
        <div style="border-top:1px solid #323943;padding:10px 14px">Interior gallery scene: architectural materials, multi-object layout, tone mapping, and contact-shadow receivers</div>
      </section>
    </main>`;

  const canvas = root.querySelector<HTMLCanvasElement>("[data-testid='hr4-scene-canvas']")!;
  const status = root.querySelector<HTMLElement>("[data-testid='hr4-scene-status']")!;
  const lightingSelect = root.querySelector<HTMLSelectElement>("[data-testid='hr4-scene-lighting']")!;
  const renderer = await Renderer.create({ backend: "webgl2", canvas, width: 1280, height: 820, clearColor: [0.018, 0.021, 0.026, 1], antialias: true, preserveDrawingBuffer: true });

  function render(): void {
    const lightingPreset = lightingSelect.value as SceneLighting;
    const lighting = createLightingDefault(defaultLightingFor(lightingPreset));
    const architecturalLighting = createArchitecturalLightingFixture({ preset: lightingPreset as ArchitecturalLightingPresetId, interiorLightsEnabled: true });
    const renderItems = createInteriorRenderItems(lightingPreset);
    const diagnostics = renderer.render({
      renderItems,
      cameraPolicy: "auto-frame",
      cameraFrameBounds: { min: [-4.2, -1.55, -1.25], max: [4.2, 2.15, 1.35] },
      cameraFrameOptions: { paddingRatio: 0.1, yawRadians: -0.34, pitchRadians: -0.16 },
      environmentLighting: lighting.environmentLighting,
      shadow: false,
      postprocess: lighting.postprocess,
      frustumCulling: false
    });
    const frame = renderer.captureFrame();
    const materialSummary = architecturalMaterialCatalogSummary();
    const state = {
      id,
      status: "ready",
      renderer: "webgl2",
      productSurface: "scene-studio-pro",
      sceneFixture: "fixtures/v4/scenes/interior-gallery/manifest.json",
      sceneClass: "interior-gallery",
      renderItemCount: renderItems.length,
      architecturalMaterialCount: materialSummary.materialCount,
      materialCategories: materialSummary.categories,
      texturedMaterialCount: materialSummary.texturedMaterialCount,
      lightingPreset,
      activeInteriorLightCount: architecturalLighting.activeInteriorLightCount,
      supportedRendererLights: architecturalLighting.supportedCurrentRendererLights,
      shadowStrategy: "contact-shadow-receiver-geometry",
      shadowReceiverCount: renderItems.filter((item) => item.label.includes("shadow")).length,
      spatialDepthMeters: 6.4,
      drawCalls: diagnostics.drawCalls,
      pixelBucketCount: countPixelBuckets(frame.pixels),
      colorManagement: "linear-input-srgb-output",
      toneMapping: lighting.postprocess.toneMapping,
      featureChecklist: ["multi-object-interior", "architectural-materials", "lighting-presets", "tone-mapping", "contact-shadow-receivers", "app-ui"],
      claimBoundary
    };
    window.__G3D_V4_INTERIOR_SCENE__ = state;
    status.textContent = JSON.stringify(state, null, 2);
  }

  lightingSelect.addEventListener("change", render);
  render();
  window.addEventListener("beforeunload", () => renderer.dispose(), { once: true });
}

function createInteriorRenderItems(lightingPreset: SceneLighting): RenderItem[] {
  const cube = Geometry.texturedCube(1);
  const sphere = Geometry.uvSphere(0.24, 32, 16, { textured: true });
  const cylinder = Geometry.cylinder({ radius: 0.22, height: 0.5, textured: true });
  const items: RenderItem[] = [
    item("floor-oak", cube, createArchitecturalMaterial("oak"), [0, -1.12, 0], [8.2, 0.12, 3.8]),
    item("back-wall-limestone", cube, createArchitecturalMaterial("limestone"), [0, 0.55, -1.62], [8.2, 3.3, 0.12]),
    item("left-wall-concrete", cube, createArchitecturalMaterial("concrete"), [-4.15, 0.45, 0], [0.12, 3.1, 3.4]),
    item("right-curtain-wall-glass", cube, createArchitecturalMaterial("glass-tinted"), [4.15, 0.45, 0], [0.1, 2.8, 3.4]),
    item("ceiling-warm-panel", cube, createArchitecturalMaterial("birch"), [0, 2.08, -0.1], [8.1, 0.1, 3.5]),
    item("sofa-left-velvet", cube, createArchitecturalMaterial("velvet"), [-2.3, -0.62, 0.45], [1.5, 0.42, 0.62]),
    item("sofa-back-velvet", cube, createArchitecturalMaterial("velvet"), [-2.3, -0.3, 0.72], [1.55, 0.72, 0.16]),
    item("coffee-table-walnut", cube, createArchitecturalMaterial("walnut"), [-1.05, -0.78, 0.28], [0.9, 0.16, 0.5]),
    item("coffee-table-glass", cube, createArchitecturalMaterial("glass-clear"), [-1.05, -0.64, 0.28], [0.95, 0.06, 0.55]),
    item("gallery-plinth-marble", cube, createArchitecturalMaterial("marble-carrara"), [0.75, -0.68, 0.3], [0.7, 0.8, 0.7]),
    item("gallery-object-copper", sphere, createArchitecturalMaterial("copper"), [0.75, -0.08, 0.3], [1, 1, 1]),
    item("retail-shelf-steel", cube, createArchitecturalMaterial("steel-brushed"), [2.75, -0.15, -0.6], [1.35, 1.8, 0.16]),
    item("retail-shelf-wood-1", cube, createArchitecturalMaterial("teak"), [2.75, -0.55, -0.42], [1.45, 0.08, 0.52]),
    item("retail-shelf-wood-2", cube, createArchitecturalMaterial("teak"), [2.75, 0.05, -0.42], [1.45, 0.08, 0.52]),
    item("retail-shelf-wood-3", cube, createArchitecturalMaterial("teak"), [2.75, 0.65, -0.42], [1.45, 0.08, 0.52]),
    item("art-panel-blue", cube, new PBRMaterial({ name: "art-panel-blue", baseColor: [0.05, 0.2, 0.85, 1], metallic: 0, roughness: 0.28 }), [-2.6, 0.65, -1.53], [0.8, 0.9, 0.04]),
    item("art-panel-gold", cube, createArchitecturalMaterial("brass"), [-1.45, 0.72, -1.52], [0.6, 1.05, 0.04]),
    item("art-panel-terracotta", cube, createArchitecturalMaterial("terracotta"), [-0.45, 0.68, -1.52], [0.56, 0.86, 0.04]),
    item("lamp-left-emissive", sphere, lampMaterial(lightingPreset), [-3.35, 0.35, 0.45], [1, 1, 1]),
    item("lamp-right-emissive", sphere, lampMaterial(lightingPreset), [3.3, 0.95, -0.25], [0.85, 0.85, 0.85]),
    item("lamp-stand-left", cylinder, createArchitecturalMaterial("metal-black"), [-3.35, -0.38, 0.45], [0.35, 1.7, 0.35]),
    item("lamp-stand-right", cylinder, createArchitecturalMaterial("chrome"), [3.3, 0.2, -0.25], [0.28, 1.5, 0.28]),
    item("shadow-receiver-sofa", cube, shadowMaterial(), [-2.3, -1.035, 0.48], [1.9, 0.035, 0.95]),
    item("shadow-receiver-plinth", cube, shadowMaterial(), [0.75, -1.02, 0.28], [1.0, 0.035, 0.9]),
    item("shadow-receiver-shelf", cube, shadowMaterial(), [2.75, -1.02, -0.42], [1.7, 0.035, 0.8])
  ];
  for (let index = 0; index < 8; index += 1) {
    const x = 2.18 + (index % 4) * 0.38;
    const y = -0.35 + Math.floor(index / 4) * 0.58;
    items.push(item(`shelf-object-${index + 1}`, cube, createArchitecturalMaterial(index % 2 === 0 ? "ceramic-white" : "porcelain"), [x, y, -0.14], [0.22, 0.28, 0.18]));
  }
  return items;
}

function item(label: string, geometry: Geometry, material: RenderItem["material"], position: readonly [number, number, number], scale: readonly [number, number, number]): RenderItem {
  return {
    label,
    geometry,
    material,
    modelMatrix: modelMatrix(position[0], position[1], position[2], scale[0], scale[1], scale[2])
  };
}

function lampMaterial(lightingPreset: SceneLighting): PBRMaterial {
  return new PBRMaterial({
    name: `interior-lamp-${lightingPreset}`,
    baseColor: [1, 0.72, 0.38, 1],
    roughness: 0.2,
    metallic: 0,
    emissiveColor: lightingPreset === "night" ? [1, 0.62, 0.28] : [0.85, 0.48, 0.2],
    emissiveStrength: lightingPreset === "night" ? 3.5 : 1.6
  });
}

function shadowMaterial(): PBRMaterial {
  return new PBRMaterial({
    name: "interior-contact-shadow-receiver",
    baseColor: [0.025, 0.022, 0.02, 0.46],
    roughness: 0.9,
    metallic: 0,
    renderState: { blend: true, depthWrite: false, cullMode: "none" }
  });
}

function defaultLightingFor(lighting: SceneLighting): LightingDefaultPreset {
  if (lighting === "night") return "gameNight";
  if (lighting === "noon") return "outdoorDay";
  return "interiorGallery";
}

function countPixelBuckets(pixels: Uint8Array): number {
  const buckets = new Set<string>();
  for (let index = 0; index < pixels.length; index += 16) {
    buckets.add(`${(pixels[index] ?? 0) >> 4}:${(pixels[index + 1] ?? 0) >> 4}:${(pixels[index + 2] ?? 0) >> 4}`);
  }
  return buckets.size;
}

function modelMatrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): Float32Array {
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    tx, ty, tz, 1
  ]);
}

function labelLighting(lighting: SceneLighting): string {
  switch (lighting) {
    case "golden-hour":
      return "Golden Hour Interior";
    case "noon":
      return "Noon Daylight";
    case "night":
      return "Night Gallery";
  }
}
