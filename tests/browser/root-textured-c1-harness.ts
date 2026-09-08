import { assets as extensionAssets } from "./fixtures/c1-extension/assets";
import {
  camera,
  createAuraApp,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";

/**
 * C1 root textured-PBR probe (muse3jsparity-PRD Phase 1).
 *
 * Variants share one scene body: a single box subject, floor, fixed lighting
 * and camera. The ONLY difference is the box material: scalar baseline,
 * asset-ref textures (baseColor + roughness + normal), the same textures
 * sampling the uv1 set, and a procedural input (recorded + warned, scalar
 * retained). The upgrade runs post-mount, so the harness polls
 * texturedMaterials until the swap lands instead of screenshotting the
 * scalar first frame.
 */

const textures = extensionAssets;

type ExtensionSlot = "clearcoat" | "clearcoatRoughness" | "clearcoatNormal" | "sheenColor" | "sheenRoughness" | "iridescence" | "iridescenceThickness" | "anisotropy";
type C1VariantId = `color:${ExtensionSlot}` | `all:${"on" | ExtensionSlot}` | `all:${ExtensionSlot}:${"uv1" | "xform"}` | `combined:${"sheen" | "iridescence"}:${"off" | "on"}` | `extension:${ExtensionSlot}:${"off" | "on" | "uv1" | "xform" | "disabled" | "disabledOff" | "direction" | "swapped" | "decoy" | "missing"}` | "baseline" | "textured" | "uv1" | "procedural" | "fullmaps" | "xform";

interface C1TexturedMaterial {
  readonly nodeName: string;
  readonly levelName: string;
  readonly status: string;
  readonly slots: readonly string[];
  readonly pixelBacked: boolean;
  readonly warnings: readonly string[];
}

interface C1Capture {
  readonly id: C1VariantId;
  readonly texturedMaterials: readonly C1TexturedMaterial[];
  readonly warnings: readonly string[];
  readonly drawCalls: number;
  readonly backend: string;
  readonly runtimeSurface: string;
  readonly graphicsVersion: string;
  readonly renderer: string;
  readonly colorOracle?: {slot:string;texel:readonly number[];expected:readonly number[];matchingPixels:number;shaderSubstitutions:number};
  readonly pixels: readonly number[];
  readonly width: number;
  readonly height: number;
}

declare global {
  interface Window {
    __AURA3D_C1_RUNNER__?: {
      renderVariant(id: C1VariantId): Promise<C1Capture>;
    };
    __AURA3D_C1_ERROR__?: string;
  }
}

const variantIds: readonly C1VariantId[] = ["baseline", "textured", "uv1", "procedural", "fullmaps", "xform"];

void run().catch((error: unknown) => {
  window.__AURA3D_C1_ERROR__ =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  window.__AURA3D_C1_RUNNER__ = {
    renderVariant: async (id) => renderVariant(id)
  };
}

async function renderVariant(id: C1VariantId): Promise<C1Capture> {
  const stage = requiredElement("c1-stage");
  stage.style.width = "720px";
  stage.style.height = "480px";
  stage.style.minHeight = "0px";
  stage.replaceChildren();
  const colorSlot=id.startsWith("color:")?id.slice(6) as ExtensionSlot:undefined;
  let shaderSubstitutions=0;
  const originalShaderSource=WebGL2RenderingContext.prototype.shaderSource;
  if(colorSlot)WebGL2RenderingContext.prototype.shaderSource=function(this:WebGL2RenderingContext,shader:WebGLShader,source:string){
    if(source.includes("out vec4 outColor;") && source.includes(`uniform sampler2D u_${colorSlot}Texture;`)){
      const expression=colorSlot==="sheenRoughness"?`vec3(texture(u_${colorSlot}Texture,vec2(16.5/32.0)).a)`:`texture(u_${colorSlot}Texture,vec2(16.5/32.0)).rgb`;
      const assignment="outColor = vec4(a3dTexturedPbrEncodeOutput(fogged), alpha);";
      if(!source.includes(assignment))throw new Error("Root color oracle did not locate actual textured output");
      source=source.replace(assignment,`${assignment}\nif(u_baseColor.a >= 0.0) { outColor=vec4(${expression},1.0); }`);shaderSubstitutions++;
    }
    originalShaderSource.call(this,shader,source);
  };
  const app = createAuraApp(stage, {
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: sceneForVariant(id)
  });
  try {
    await waitForAppDraw(app);
    if (id.startsWith("color:") || id.startsWith("all:") || id.startsWith("combined:") || id === "textured" || id === "uv1" || id === "fullmaps" || id === "xform" || (id.startsWith("extension:") && !id.endsWith(":missing"))) {
      await waitForTextured(app);
    }
    if (id.endsWith(":missing")) await waitForWarning(app, "texture fetch failed");
    if (id === "procedural") {
      await waitForWarning(app, "procedural texture");
    }
    const canvas = app.canvas;
    if (!canvas) throw new Error("Aura app did not expose a canvas for the C1 probe.");
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 context unavailable for the C1 probe.");
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const diagnostics = app.diagnostics();
    return {
      id,
      texturedMaterials: [...(diagnostics.renderer?.runtime.texturedMaterials ?? [])],
      warnings: [...new Set([...diagnostics.warnings, ...(diagnostics.renderer?.runtime.warnings ?? [])])],
      drawCalls: diagnostics.drawCalls,
      backend: /^WebGL 2\.0/.test(String(gl.getParameter(gl.VERSION))) ? "webgl2" : "unknown",
      runtimeSurface: diagnostics.renderer?.runtime.backend ?? "unknown",
      graphicsVersion: String(gl.getParameter(gl.VERSION)),
      renderer: String(gl.getParameter(gl.RENDERER)),
      ...(colorSlot?{colorOracle:(()=>{
        const texel=[24+((16*7+16*3)%220),20+((16*3+16*11)%230),32+((16*13+16*5)%208),30+((16*5+16*17)%220)];
        const srgb=(v:number)=>{const c=v/255;return Math.round(255*(c<=.04045?c/12.92:((c+.055)/1.055)**2.4));};
        const expected=colorSlot==="sheenColor"?texel.slice(0,3).map(srgb):colorSlot==="sheenRoughness"?[texel[3]!,texel[3]!,texel[3]!]:texel.slice(0,3);
        let matchingPixels=0;for(let i=0;i<pixels.length;i+=4)if(expected.every((v,c)=>Math.abs(pixels[i+c]!-v)<=1))matchingPixels++;
        return {slot:colorSlot,texel,expected,matchingPixels,shaderSubstitutions};
      })()}:{}),
      pixels: Array.from(pixels),
      width: canvas.width,
      height: canvas.height
    };
  } finally {
    app.dispose();
    WebGL2RenderingContext.prototype.shaderSource=originalShaderSource;
  }
}

function boxMaterial(id: C1VariantId) {
  if(id.startsWith("color:"))return boxMaterial(`extension:${id.slice(6) as ExtensionSlot}:on`);

  if (id.startsWith("all:")) {
    const [, changed, mapMode] = id.split(":");
    const slots = ["clearcoat", "clearcoatRoughness", "clearcoatNormal", "sheenColor", "sheenRoughness", "iridescence", "iridescenceThickness", "anisotropy"];
    return material.pbr({ color: "#a17b53", roughness: 0.35, metallic: 0.2, texture: extensionAssets.white,
      normal: textures.normal, roughnessMap: textures.rough, occlusionMap: textures.occlusion, emissiveMap: textures.emissive, emissiveIntensity: 0.08,
      clearcoat: 1, clearcoatRoughness: 0.65, sheen: 1, sheenColor: "#e88cce", sheenRoughness: 0.7,
      iridescence: 1, iridescenceThicknessRange: [100, 800], anisotropy: 0.9,
      ...Object.fromEntries(slots.map((slot) => [`${slot}Map`, changed === slot && !mapMode ? extensionAssets.swapped : extensionAssets.rgba])),
      ...(mapMode === "uv1" ? { texCoords: { [changed!]: 1 } } : {}),
      ...(mapMode === "xform" ? { texTransforms: { [changed!]: { offset: [0.23, -0.17] as const, scale: [0.43, 0.71] as const, rotation: 0.4 } } } : {}) });
  }
  if (id.startsWith("combined:")) {
    const maps = id.endsWith(":off") ? {} : {
      clearcoatMap: extensionAssets.rgba,
      clearcoatRoughnessMap: extensionAssets.rgba,
      ...(id.includes(":sheen:") ? { sheenColorMap: extensionAssets.rgba, sheenRoughnessMap: extensionAssets.rgba, anisotropyMap: extensionAssets.rgba } : { iridescenceMap: extensionAssets.rgba, iridescenceThicknessMap: extensionAssets.rgba })
    };
    return material.pbr({ color: "#a17b53", roughness: 0.25, metallic: 0.2, texture: extensionAssets.white, clearcoat: 1, clearcoatRoughness: 0.65,
      sheen: 1, sheenColor: "#e88cce", sheenRoughness: 0.7, iridescence: 1, iridescenceThicknessRange: [100, 800], anisotropy: 0.9, ...maps });
  }
  if (id.startsWith("extension:")) {
    const [, slot, mode] = id.split(":") as [string, ExtensionSlot, string];
    const disabled = mode === "disabled" || mode === "disabledOff";
    const map = mode === "direction" ? extensionAssets.direction : mode === "swapped" ? extensionAssets.swapped : mode === "decoy" ? extensionAssets[slot === "clearcoatRoughness" || slot === "iridescenceThickness" ? "decoyG" : slot === "sheenRoughness" ? "decoyA" : "decoyR"] : extensionAssets.rgba;
    return material.pbr({
      color: "#a17b53", roughness: 0.25, metallic: 0.2, texture: extensionAssets.white,
      clearcoat: disabled ? 0 : 1, clearcoatRoughness: 0.65,
      clearcoatNormalScale: 1,
      sheen: disabled ? 0 : 1, sheenColor: "#e88cce", sheenRoughness: 0.7,
      iridescence: disabled ? 0 : 1, iridescenceThicknessRange: [100, 800],
      anisotropy: disabled ? 0 : 0.9,
      ...((mode === "off" || mode === "disabledOff") ? {} : { [`${slot}Map`]: mode === "missing" ? { ...map, url: `${map.url}.missing` } : map }),
      ...(mode === "uv1" ? { texCoords: { [slot]: 1 } } : {}),
      ...(mode === "xform" ? { texTransforms: { [slot]: { offset: [0.23, 0.17] as const, scale: [0.43, 0.71] as const, rotation: 0.4 } } } : {})
    });
  }
  if (id === "textured") {
    return material.pbr({
      color: "#ffffff",
      roughness: 0.6,
      metallic: 0,
      texture: textures.checker,
      roughnessMap: textures.rough,
      normal: textures.normal
    });
  }
  if (id === "uv1") {
    return material.pbr({
      color: "#ffffff",
      roughness: 0.6,
      metallic: 0,
      texture: textures.checker,
      roughnessMap: textures.rough,
      normal: textures.normal,
      texCoords: { baseColor: 1, normal: 1, metallicRoughness: 1 }
    });
  }
  if (id === "procedural") {
    return material.fabric({ color: "#d8dde6" });
  }
  if (id === "fullmaps") {
    return material.pbr({
      color: "#ffffff",
      roughness: 0.6,
      metallic: 0,
      texture: textures.checker,
      roughnessMap: textures.rough,
      normal: textures.normal,
      occlusionMap: textures.occlusion,
      occlusionStrength: 1,
      emissiveMap: textures.emissive,
      emissiveIntensity: 1.6
    });
  }
  if (id === "xform") {
    return material.pbr({
      color: "#ffffff",
      roughness: 0.6,
      metallic: 0,
      texture: textures.checker,
      roughnessMap: textures.rough,
      normal: textures.normal,
      texTransforms: { baseColor: { scale: [0.5, 0.5] } }
    });
  }
  return material.pbr({ color: "#c96a1e", roughness: 0.6, metallic: 0 });
}

function sceneForVariant(id: C1VariantId) {
  return scene()
    .background("#05070d")
    .camera(camera.perspective({ position: [0, 1.6, 3.4], target: [0, 0.6, 0], fov: 42 }))
    .add(primitives.plane({
      name: "c1 floor",
      material: material.pbr({ color: "#3a4350", roughness: 0.9, metallic: 0 })
    }).position(0, 0, 0).scale([9, 1, 9]))
    .add((id.startsWith("all:") ? primitives.sphere : primitives.box)({
      name: "c1 subject box",
      material: boxMaterial(id)
    }).position(0, 0.6, 0).scale([1.2, 1.2, 1.2]))
    .add(lights.directional({ name: "c1 key", position: [2.6, 4.2, 2.4], intensity: 2.2 }));
}

async function waitForAppDraw(app: ReturnType<typeof createAuraApp>): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    if (app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const diagnostics = app.diagnostics();
  if (!(diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0)) {
    throw new Error(`C1 variant never drew: drawCalls=${diagnostics.drawCalls} errors=${JSON.stringify(diagnostics.errors)}`);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitForTextured(app: ReturnType<typeof createAuraApp>): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    const materials = app.diagnostics().renderer?.runtime.texturedMaterials ?? [];
    if (materials.some((entry) => entry.nodeName === "c1 subject box" && entry.pixelBacked)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const materials = app.diagnostics().renderer?.runtime.texturedMaterials ?? [];
  const subject = materials.find((entry) => entry.nodeName === "c1 subject box");
  if (!subject || !subject.pixelBacked) {
    throw new Error(`C1 textured upgrade never landed: ${JSON.stringify(materials)} runtime=${JSON.stringify(app.diagnostics().renderer?.runtime.warnings)} resources=${JSON.stringify(performance.getEntriesByType("resource").filter((entry) => entry.name.includes("c1-extension")).map((entry) => ({ name: entry.name, duration: entry.duration })))} errors=${JSON.stringify(app.diagnostics().errors)}`);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitForWarning(app: ReturnType<typeof createAuraApp>, fragment: string): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    const diagnostics = app.diagnostics();
    if ([...diagnostics.warnings, ...(diagnostics.renderer?.runtime.warnings ?? [])].join(" ").includes(fragment)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`C1 warning ${fragment} never surfaced: ${JSON.stringify({ warnings: app.diagnostics().warnings, runtime: app.diagnostics().renderer?.runtime, errors: app.diagnostics().errors })}`);
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`C1 harness is missing #${id}.`);
  return element;
}

export { variantIds };
