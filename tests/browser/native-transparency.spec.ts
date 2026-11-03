import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/** Acceptance only: exercises actual device draws and sampled opaque depth. */
for (const backend of ["webgl2", "webgpu"] as const) {
  test(`weighted transparency composes intersecting layers on ${backend}`, async ({ page }) => {
    const server = await startExampleDevServer();
    try {
      const fixture = `${server.origin}/__weighted_transparency_fixture__.html`;
      await page.route(fixture, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><canvas id='canvas' width='32' height='32'></canvas>" }));
      await page.goto(fixture);
      const result = await page.evaluate(async (selectedBackend) => {
        const load = new Function("url", "return import(url)") as (url: string) => Promise<Record<string, any>>;
        const [glModule, gpuModule, oitModule, vertexModule, formatModule, shaderModule, pipelineModule, generatorModule, featuresModule] = await Promise.all([
          load("/packages/rendering/src/WebGL2Device.ts"), load("/packages/rendering/src/WebGPUDevice.ts"),
          load("/packages/rendering/src/transparency/WeightedTransparency.ts"), load("/packages/rendering/src/VertexBuffer.ts"),
          load("/packages/rendering/src/VertexFormat.ts"), load("/packages/rendering/src/ShaderModule.ts"),
          load("/packages/rendering/src/RenderPipeline.ts"), load("/packages/rendering/src/program/ProgramGenerator.ts"),
          load("/packages/rendering/src/program/ProgramFeatures.ts")
        ]);
        const [rendererModule, geometryModule, pbrModule, unlitModule] = await Promise.all([
          load("/packages/rendering/src/Renderer.ts"), load("/packages/rendering/src/Geometry.ts"),
          load("/packages/rendering/src/PBRMaterial.ts"), load("/packages/rendering/src/UnlitMaterial.ts")
        ]);
        const canvas = document.getElementById("canvas") as HTMLCanvasElement;
        const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
        if (selectedBackend === "webgpu" && !gpu) return { unsupported: "WebGPU adapter unavailable" };
        if (selectedBackend === "webgl2") {
          const gl = canvas.getContext("webgl2");
          if (!gl || !gl.getExtension("EXT_color_buffer_float")) return { unsupported: "RGBA16F render targets unavailable" };
        }
        const adapter = selectedBackend === "webgpu" ? await gpu!.requestAdapter() : null;
        if (selectedBackend === "webgpu" && !adapter) return { unsupported: "WebGPU adapter unavailable" };
        const device: any = selectedBackend === "webgl2" ? glModule.WebGL2Device.create({ canvas, alpha: true, antialias: false, errorCheckMode: "strict" })
          : await gpuModule.WebGPUDevice.create({ gpu, adapter, canvas, requireNativeRendering: true });
        const scene = device.createRenderTarget({ width: 32, height: 32, format: "rgba8", depth: "texture", sampleCount: 1 });
        const pass = new oitModule.WeightedTransparency(device);
        const vertices = new vertexModule.VertexBuffer(formatModule.VertexFormat.P3, 3);
        vertices.setAttribute(0, "position", [-1, -1, 0]);
        vertices.setAttribute(1, "position", [3, -1, 0]);
        vertices.setAttribute(2, "position", [-1, 3, 0]);
        const buffer = vertices.upload(device);
        const vertex = (marker: string) => `#version 300 es
// ${marker}
layout(location=0) in vec3 a_position;
uniform float u_clipZ; uniform float u_slope;
out vec3 v_worldPosition;
void main(){ v_worldPosition=a_position; gl_Position=vec4(a_position.xy,u_clipZ+a_position.x*u_slope,1.); }`;
        const wgslVertex = `// weighted-fixture
/* @aura3d-bindings */
@vertex fn main(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
 let z=aura.u_clipZ+position.x*aura.u_slope;
 return vec4<f32>(position.xy,(z+1.0)*0.5,1.0);
}`;
        const basicBindings = [{ name: "u_clipZ", kind: "float" }, { name: "u_slope", kind: "float" }, { name: "u_baseColor", kind: "vec4" }];
        const opaque = new shaderModule.ShaderModule({ label: "weighted-fixture-opaque", marker: "weighted-fixture",
          vertex: vertex("weighted-fixture"),
          fragment: `#version 300 es
// weighted-fixture
precision highp float;
uniform vec4 u_baseColor; out vec4 outColor;
void main(){ if(gl_FragCoord.x >= 16.) discard; outColor=u_baseColor; }`,
          portableBindings: basicBindings,
          webgpu: { vertex: wgslVertex, fragment: `// weighted-fixture
/* @aura3d-bindings */
@fragment fn main(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
 if(p.x>=16.0){ discard; } return aura.u_baseColor;
}` } });
        const opaquePipeline = new pipelineModule.RenderPipeline({ shader: opaque.compile(device), vertexFormat: formatModule.VertexFormat.P3,
          renderState: { cullMode: "none", depthTest: true, depthWrite: true, blend: false } });
        const modules = new Map<string, any>();
        const weightedPipeline = (phase: "accumulation" | "revealage", state: object) => {
          let module = modules.get(phase);
          if (!module) {
            const generated = generatorModule.generateProgramImpl(featuresModule.normalizeProgramFeatures({ alphaMode: "blend", features: { "a3d.transparency": phase } }));
            if (!generated.fragment.includes("u_a3dOpaqueDepth")) throw new Error(`Generated ${phase} program is missing opaque depth handling`);
            const marker = /a3d-generated-program:[0-9a-f]+/.exec(generated.fragment)?.[0];
            if (!marker) throw new Error("generated shader marker missing");
            const wgslFragment = `// weighted-fixture
/* @aura3d-bindings */
@fragment fn main(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
 let opaqueZ=textureLoad(u_a3dOpaqueDepthTexture,vec2<i32>(p.xy),0);
 if(p.z>opaqueZ){ discard; }
 let a=clamp(aura.u_baseColor.a,0.0,1.0);
 var rgb=aura.u_baseColor.rgb;
 if(aura.u_a3dTransparencyInputPremultiplied>0.5 && a>0.0){ rgb=rgb/a; }
 let w=0.25+0.75*pow(1.0-clamp(p.z,0.0,1.0),3.0);
 ${phase === "accumulation" ? "return vec4<f32>(clamp(rgb,vec3<f32>(-32),vec3<f32>(32))*a*w,a*w);" : "return vec4<f32>(0.0,0.0,0.0,a);"}
}`;
            module = new shaderModule.ShaderModule({ label: `weighted-fixture-${phase}`, marker,
              vertex: vertex(marker), fragment: generated.fragment,
              portableBindings: [...basicBindings, { name: "u_a3dTransparencyInputPremultiplied", kind: "float" }, { name: "u_a3dOpaqueDepth", kind: "depth2d" }],
              webgpu: { vertex: wgslVertex.replace("weighted-fixture", marker), fragment: wgslFragment.replace("weighted-fixture", marker) } });
            modules.set(phase, module);
          }
          return new pipelineModule.RenderPipeline({ shader: module.compile(device), vertexFormat: formatModule.VertexFormat.P3,
            renderState: { ...state, cullMode: "none" } });
        };
        const draw = (pipeline: any, values: Record<string, any>) => device.draw(pipeline.createDrawCommand({ vertexBuffer: buffer, vertexCount: 3, uniforms: new Map(Object.entries(values)) }));
        const layers = [
          { color: [1, 0, 0, 0.5], slope: 0.6 },
          { color: [0, 0, 1, 0.5], slope: -0.6 }
        ];
        const render = async (reverse: boolean, premultiplied: boolean, occluder: boolean, viewId: string,
          view?: { x: number; y: number; width: number; height: number; scissor: { x: number; y: number; width: number; height: number } },
          sourceLayers = layers, clear = true) => {
          device.setRenderTarget(scene);
          if (clear) {
            device.setViewport(0, 0, 32, 32);
            device.setScissorTest(false);
            device.clear([0, 0, 0, 1]);
          }
          if (occluder) draw(opaquePipeline, { u_clipZ: 0, u_slope: 0, u_baseColor: [0, 0.2, 0, 1] });
          const items = reverse ? [...sourceLayers].reverse() : sourceLayers;
          const result = pass.execute({ viewId, width: 32, height: 32, view, sceneTarget: scene, opaqueDepth: scene.depthTexture,
            depthConvention: "standard", sampleCount: 1, maxFragmentsPerPixel: items.length, support: { floatBlend: true, depthTexture: true, shaderVariants: true }, items,
            drawWeighted(phase: "accumulation" | "revealage", drawn: typeof layers, bindings: any) {
              const pipeline = weightedPipeline(phase, bindings.state);
              for (const item of drawn) {
                const color = premultiplied ? item.color.map((c, i) => i === 3 ? c : c * item.color[3]!) : item.color;
                draw(pipeline, { u_clipZ: 0, u_slope: item.slope, u_baseColor: color,
                  u_a3dOpaqueDepth: bindings.depth, u_a3dTransparencyDepthOrigin: [0, 0],
                  u_a3dTransparencyReversedDepth: 0, u_a3dTransparencyInputPremultiplied: premultiplied ? 1 : 0 });
              }
              pipeline.dispose();
            }, drawSorted() { throw new Error("unexpected sorted fallback"); } });
          if (result.mode !== "weighted") throw new Error(`unexpected weighted fallback: ${result.reason}`);
          const pixels = selectedBackend === "webgpu" ? await device.readPixelsAsync(0, 0, 32, 32) : device.readPixels(0, 0, 32, 32);
          return { pixels: Array.from(pixels) as number[], accumulation: result.accumulation, revealage: result.revealage };
        };
        device.beginFrame(32, 32);
        try {
          const forward = await render(false, false, true, "left");
          const reverse = await render(true, false, true, "left");
          const premul = await render(false, true, true, "left");
          const unobstructed = await render(false, false, false, "right");
          const leftRect = { x: 0, y: 0, width: 16, height: 32 };
          const rightRect = { x: 16, y: 0, width: 16, height: 32 };
          await render(false, false, false, "left", { ...leftRect, scissor: leftRect }, [layers[0]!]);
          const split = await render(false, false, false, "right", { ...rightRect, scissor: rightRect }, [layers[1]!], false);
          // A genuinely multisampled scene target: the weighted pass must take
          // the sorted path for it, never resolve or sample its depth.
          let sortedFallback = "";
          const msaa = device.createRenderTarget({ width: 32, height: 32, format: "rgba8", depth: "texture", sampleCount: 4 });
          try {
            if ((msaa.sampleCount ?? 1) !== 4) throw new Error(`expected a 4x multisampled target, got ${msaa.sampleCount}`);
            pass.execute({ viewId: "fallback", width: 32, height: 32, sceneTarget: msaa, opaqueDepth: msaa.depthTexture,
              depthConvention: "standard", sampleCount: msaa.sampleCount, maxFragmentsPerPixel: 2, support: { floatBlend: true, depthTexture: true, shaderVariants: true }, items: layers,
              drawWeighted() { throw new Error("MSAA must not use weighted targets"); }, drawSorted(_items: unknown, reason: string) { sortedFallback = reason; } });
          } finally { msaa.dispose(); }
          // Renderer-driven transmission: a weighted request whose frame contains
          // a refractive material keeps the sorted path after the real capture.
          const transmissionCanvas = document.createElement("canvas");
          transmissionCanvas.width = transmissionCanvas.height = 8;
          const renderer = await rendererModule.Renderer.create({ canvas: transmissionCanvas, width: 8, height: 8, backend: selectedBackend });
          const box = geometryModule.Geometry.box();
          const glass = new pbrModule.PBRMaterial({ transmissionFactor: 0.8 });
          const veil = new unlitModule.UnlitMaterial({ color: [1, 0.2, 0.1, 0.5], renderState: { blend: true, blendMode: "alpha", depthWrite: false } });
          let transmissionFallback = "";
          let transmissionCode = "";
          try {
            await renderer.renderAsync({ source: { cameraPolicy: "identity", transparencyMode: "weighted", postprocess: { sampleCount: 1 },
              renderItems: [{ geometry: box, material: glass }, { geometry: box, material: veil }] }, frameId: 1 });
            const diagnostics = renderer.transparencyDiagnostics;
            if (diagnostics?.mode !== "sorted") throw new Error(`transmission frame used ${diagnostics?.mode ?? "no"} transparency`);
            transmissionFallback = diagnostics.reason ?? "";
            transmissionCode = diagnostics.code ?? "";
          } finally { renderer.dispose(); box.dispose(); glass.dispose(); veil.dispose(); }
          const sample = (pixels: number[], x: number, y: number) => pixels.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 4);
          const left = sample(forward.pixels, 8, 16), right = sample(forward.pixels, 24, 16);
          const result = { unsupported: "", left, right, reverseLeft: sample(reverse.pixels, 8, 16), reverseRight: sample(reverse.pixels, 24, 16),
            premulLeft: sample(premul.pixels, 8, 16), premulRight: sample(premul.pixels, 24, 16), clearLeft: sample(unobstructed.pixels, 8, 16),
            splitLeft: sample(split.pixels, 8, 16), splitRight: sample(split.pixels, 24, 16),
            isolatedViews: forward.accumulation !== unobstructed.accumulation, sortedFallback, transmissionFallback, transmissionCode };
          pass.dispose();
          return { ...result, retired: forward.accumulation.disposed && forward.revealage.disposed && unobstructed.accumulation.disposed, sceneAlive: !scene.disposed };
        } finally {
          device.endFrame();
          pass.dispose();
          opaquePipeline.dispose();
          opaque.dispose();
          for (const module of modules.values()) module.dispose();
          vertices.dispose();
          scene.dispose();
          device.dispose();
        }
      }, backend);
      if (result.unsupported) {
        test.skip(true, result.unsupported);
        return;
      }
      if (!("left" in result) || !result.left || !result.right || !result.reverseLeft || !result.reverseRight || !result.premulLeft || !result.premulRight || !result.clearLeft || !result.splitLeft || !result.splitRight) throw new Error("Transparency fixture did not return pixels");
      const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(Math.abs(v - b[i]!)).toBeLessThanOrEqual(4));
      close(result.left!, result.reverseLeft!);
      close(result.right!, result.reverseRight!);
      close(result.left!, result.premulLeft!);
      close(result.right!, result.premulRight!);
      expect(result.left![0]).toBeGreaterThan(40);
      expect(result.left![2]).toBeLessThan(8); // far blue surface is behind opaque depth
      expect(result.clearLeft![2]).toBeGreaterThan(20);
      expect(result.right![0]).toBeGreaterThan(20);
      expect(result.right![2]).toBeGreaterThan(20);
      expect(result.splitLeft![0]).toBeGreaterThan(80);
      expect(result.splitLeft![2]).toBeLessThan(8);
      expect(result.splitRight![0]).toBeLessThan(8);
      expect(result.splitRight![2]).toBeGreaterThan(80);
      expect(result.sortedFallback).toMatch(/multisampled/);
      expect(result.transmissionFallback).toMatch(/transmission/);
      expect(result.transmissionCode).toBe("WEIGHTED_TRANSPARENCY_TRANSMISSION_SORTED");
      expect(result.isolatedViews && result.retired && result.sceneAlive).toBe(true);
    } finally {
      await server.close();
    }
  });
}
