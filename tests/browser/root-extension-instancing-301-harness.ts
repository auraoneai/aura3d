import { camera, createAuraApp, instances, lights, material, scene } from "@aura3d/engine";
import { assets } from "./fixtures/c1-extension/assets";

// Abstract material swatches: root safe API only. No named object/GLB claim.
const slots = ["clearcoat", "clearcoatRoughness", "clearcoatNormal", "sheenColor", "sheenRoughness", "iridescence", "iridescenceThickness", "anisotropy"] as const;
type Slot = typeof slots[number];
const transforms = Array.from({ length: 6 }, (_, i) => ({ position: [(i % 3 - 1) * 1.5, (Math.floor(i / 3) - .5) * 1.5, 0] as const, scale: 1.1 }));

async function capture(changed?: Slot | "base-only" | "base-only-swapped") {
  const stage = document.querySelector<HTMLDivElement>("#stage")!;
  stage.replaceChildren();
  const canvas = document.createElement("canvas");
  canvas.width = 600; canvas.height = 420; stage.append(canvas);
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("Native WebGL2 required");
  const draws: { method: string; vertexCount: number; instanceCount: number }[] = [];
  const nativeFrameDraws:{method:string;vertexCount:number;instanceCount:number;deviceDraw:boolean;shaderMarkers:string[];stack:string}[]=[];
  function observeDraw(method:string,vertexCount:number,instanceCount:number){
    const program=gl!.getParameter(gl!.CURRENT_PROGRAM) as WebGLProgram|null;
    const sources=program?(gl!.getAttachedShaders(program)??[]).map(shader=>gl!.getShaderSource(shader)??""):[];
    const shaderMarkers=[...new Set(sources.flatMap(source=>[...source.matchAll(/@aura3d-shader:([\w.-]+)/g)].map(match=>match[1]!)))];
    const stack=new Error("Observed native GL submission").stack??"";
    nativeFrameDraws.push({method,vertexCount,instanceCount,deviceDraw:/WebGL2Device\.draw\b/.test(stack),shaderMarkers,stack});
  }
  const singleIndexed=gl.drawElements.bind(gl),singleArrays=gl.drawArrays.bind(gl);
  gl.drawElements=(mode,count,type,offset)=>{observeDraw("drawElements",count,1);singleIndexed(mode,count,type,offset);};
  gl.drawArrays=(mode,first,count)=>{observeDraw("drawArrays",count,1);singleArrays(mode,first,count);};

  const indexed = gl.drawElementsInstanced.bind(gl);
  const arrays = gl.drawArraysInstanced.bind(gl);
  gl.drawElementsInstanced = (mode, count, type, offset, instanceCount) => { observeDraw("drawElementsInstanced",count,instanceCount); draws.push({ method: "drawElementsInstanced", vertexCount: count, instanceCount }); indexed(mode, count, type, offset, instanceCount); };
  gl.drawArraysInstanced = (mode, first, count, instanceCount) => { observeDraw("drawArraysInstanced",count,instanceCount); draws.push({ method: "drawArraysInstanced", vertexCount: count, instanceCount }); arrays(mode, first, count, instanceCount); };
  const app = createAuraApp(canvas, {
    pixelRatio: 1, resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene().background("#05070d")
      .camera(camera.perspective({ position: [0, .7, 7.5], target: [0, 0, 0], fov: 42 }))
      .add(instances.sphere({ name: "extension-instanced-swatches", transforms,
        material: changed?.startsWith("base-only") ? material.pbr({ color: "#ffffff", roughness: .35, metallic: .2, texture: changed === "base-only-swapped" ? assets.swapped : assets.rgba, clearcoat: 0, sheen: 0, iridescence: 0, anisotropy: 0 }) : material.pbr({ color: "#a17b53", roughness: .35, metallic: .2, texture: assets.white,
          normal: assets.normal, roughnessMap: assets.rough, occlusionMap: assets.occlusion,
          emissiveMap: assets.emissive, emissiveIntensity: .08,
          clearcoat: 1, clearcoatRoughness: .65, clearcoatNormalScale: 1,
          sheen: 1, sheenColor: "#e88cce", sheenRoughness: .7,
          iridescence: 1, iridescenceThicknessRange: [100, 800], anisotropy: .9,
          ...Object.fromEntries(slots.map(slot => [`${slot}Map`, slot === changed ? assets.swapped : assets.rgba])) }) }))
      .add(lights.directional({ name: "fixed key", position: [2.6, 4.2, 2.4], intensity: 2.2 }))
  });
  try {
    const deadline = performance.now() + 30_000;
    while (performance.now() < deadline && !app.diagnostics().renderer?.runtime.texturedMaterials?.some(entry => entry.nodeName === "extension-instanced-swatches" && entry.pixelBacked)) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const textured = app.diagnostics().renderer?.runtime.texturedMaterials ?? [];
    if (!textured.some(entry => entry.nodeName === "extension-instanced-swatches" && entry.pixelBacked)) throw new Error(`Textured upgrade failed: ${JSON.stringify(app.diagnostics())}`);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    app.pause();
    const nativeInstancedBefore=app.diagnostics().renderer?.runtime.nativeInstancedSubmissions ?? 0;
    draws.length = 0;nativeFrameDraws.length=0;app.step(1 / 60);
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const diagnostics = app.diagnostics();
    return { id: changed ?? "all", width: canvas.width, height: canvas.height, pixels: Array.from(pixels), nativeDraws: draws, nativeFrameDraws,
      nativeInstancedBefore,nativeInstancedFrameDelta:(diagnostics.renderer?.runtime.nativeInstancedSubmissions??0)-nativeInstancedBefore,
      drawCalls: diagnostics.drawCalls, nativeInstancedSubmissions: diagnostics.renderer?.runtime.nativeInstancedSubmissions,
      backend: /^WebGL 2\.0/.test(String(gl.getParameter(gl.VERSION))) ? "webgl2" : "unknown",
      runtimeSurface: diagnostics.renderer?.runtime.backend, graphicsVersion: String(gl.getParameter(gl.VERSION)), texturedMaterials: textured,
      warnings: [...diagnostics.warnings, ...(diagnostics.renderer?.runtime.warnings ?? [])], errors: diagnostics.errors,
      glError: gl.getError() };
  } finally { app.dispose(); }
}
(window as unknown as { extensionInstancing301: { capture: typeof capture } }).extensionInstancing301 = { capture };
