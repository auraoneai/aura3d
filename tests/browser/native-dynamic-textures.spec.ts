import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createServer, type Plugin, type ViteDevServer } from "vite";
import { installedAuraPackageAliases } from "./installed-package-resolve";

// Phase B only. The fixture is authored here from primary-color pixels and
// a live canvas stream. Both imported packages must be the packed candidate;
// a source alias or a CPU-generated substitute cannot satisfy this test.
const moduleName = "virtual:aura3d-native-dynamic-textures";
const moduleId = `\0${moduleName}`;
const script = String.raw`
import { camera, createAuraApp, lights, material, primitives, scene, texture as textureApi } from "@aura3d/engine";
import { Texture, TextureBinding, Sampler, VertexFormat, RenderPipeline, createRenderDevice } from "@aura3d/rendering";

const color = (r, g, b, a = 255) => [r, g, b, a];
const red = color(255, 0, 0), green = color(0, 255, 0), blue = color(0, 0, 255);
const yellow = color(255, 255, 0), magenta = color(255, 0, 255);
const fill = (pixel, count) => new Uint8Array(Array.from({ length: count }, () => pixel).flat());
const vertexGL = [
  "#version 300 es", "// wp32-dynamic-textures", "layout(location=0) in vec3 a_position;",
  "void main(){ gl_Position=vec4(a_position,1.0); }"
].join("\n");
const vertexGPU = [
  "// wp32-dynamic-textures", "/* @aura3d-bindings */",
  "@vertex fn main(@location(0) p: vec3<f32>) -> @builtin(position) vec4<f32> { return vec4<f32>(p, 1.0); }"
].join("\n");

function shaderSource(dimension) {
  const glType = dimension === "2d-array" ? "sampler2DArray" : dimension === "3d" ? "sampler3D" : dimension === "cube" ? "samplerCube" : "sampler2D";
  const glCoord = dimension === "2d" ? "u_coord.xy" : "u_coord";
  const gpuCoord = dimension === "2d-array" ? "aura.u_coord.xy, i32(aura.u_coord.z)" : dimension === "3d" || dimension === "cube" ? "aura.u_coord" : "aura.u_coord.xy";
  const kind = dimension === "2d-array" ? "texture2d-array" : dimension === "3d" ? "texture3d" : dimension === "cube" ? "texture-cube" : "texture2d";
  return {
    label: "wp32-dynamic-textures-" + dimension,
    marker: "wp32-dynamic-textures",
    vertex: vertexGL,
    fragment: ["#version 300 es", "// wp32-dynamic-textures", "precision highp float;", "precision highp " + glType + ";",
      "uniform " + glType + " u_texture;", "uniform vec3 u_coord;", "uniform float u_lod;", "out vec4 outColor;",
      "void main(){outColor=textureLod(u_texture," + glCoord + ",u_lod);}"].join("\n"),
    portableBindings: [{ name: "u_coord", kind: "vec3" }, { name: "u_lod", kind: "float" }, { name: "u_texture", kind, required: true }],
    webgpu: { vertex: vertexGPU, fragment: ["// wp32-dynamic-textures", "/* @aura3d-bindings */",
      "@fragment fn main() -> @location(0) vec4<f32> { return textureSampleLevel(u_textureTexture, u_textureSampler, " + gpuCoord + ", aura.u_lod); }"] .join("\n") }
  };
}

async function makeRenderer(backend) {
  const canvas = document.createElement("canvas");
  canvas.width = 4; canvas.height = 4;
  document.body.append(canvas);
  const gl = backend === "webgl2" ? canvas.getContext("webgl2", { antialias: false, alpha: true, preserveDrawingBuffer: true }) : null;
  const nativeHandles = new Set(), createdHandles = [];
  const createTexture = gl?.createTexture.bind(gl), deleteTexture = gl?.deleteTexture.bind(gl);
  if (gl && createTexture && deleteTexture) {
    gl.createTexture = () => { const handle = createTexture(); if (handle) { nativeHandles.add(handle); createdHandles.push(handle); } return handle; };
    gl.deleteTexture = (handle) => { if (handle) nativeHandles.delete(handle); deleteTexture(handle); };
  }
  // WebGPU: observe every native GPUTexture the selected device allocates and
  // destroys. The real adapter and device are used; only their texture factory
  // is instrumented, so presentation and validation stay native.
  let webgpu;
  if (backend === "webgpu" && navigator.gpu) {
    const gpu = navigator.gpu;
    webgpu = {
      getPreferredCanvasFormat: () => gpu.getPreferredCanvasFormat(),
      get wgslLanguageFeatures() { return gpu.wgslLanguageFeatures; },
      async requestAdapter(options) {
        const adapter = await gpu.requestAdapter(options);
        if (!adapter) return adapter;
        const requestDevice = adapter.requestDevice.bind(adapter);
        adapter.requestDevice = async (descriptor) => {
          const native = await requestDevice(descriptor);
          const createGpuTexture = native.createTexture.bind(native);
          native.createTexture = (textureDescriptor) => {
            const handle = createGpuTexture(textureDescriptor);
            nativeHandles.add(handle);
            const destroy = handle.destroy.bind(handle);
            handle.destroy = () => { nativeHandles.delete(handle); destroy(); };
            return handle;
          };
          return native;
        };
        return adapter;
      }
    };
  }
  const device = await createRenderDevice({ backend, canvas, antialias: false, alpha: true, preserveDrawingBuffer: true, errorCheckMode: "strict", ...(webgpu ? { webgpu } : {}) });
  if (device.kind !== backend || !device.info.capabilities?.includes("rasterization")) {
    device.dispose(); canvas.remove();
    throw new Error("Native requested backend was not created: " + backend);
  }
  const target = device.createRenderTarget({ width: 4, height: 4, format: "rgba8", depth: false });
  const data = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);
  const vertexBuffer = device.createBuffer("vertex", data.byteLength, data);
  const sampler = new Sampler({ minFilter: "nearest-mipmap-nearest", magFilter: "nearest" });
  const programs = new Map();
  const pipelineFor = (dimension) => {
    let current = programs.get(dimension);
    if (!current) {
      const shader = device.createShaderProgram(shaderSource(dimension));
      const pipeline = new RenderPipeline({ shader, vertexFormat: VertexFormat.P3,
        renderState: { cullMode: "none", depthTest: false, depthWrite: false, blend: false } });
      current = { shader, pipeline }; programs.set(dimension, current);
    }
    return current.pipeline;
  };
  return {
    canvas, device,
    nativeTexture(tex) { return device.getNativeTexture ? device.getNativeTexture(tex) : createdHandles.at(-1); },
    async sample(tex, coord = [0.5, 0.5, 0], lod = 0) {
      const pipeline = pipelineFor(tex.dimension);
      const uniforms = new Map([["u_texture", new TextureBinding({ name: "u_texture", texture: tex, sampler, required: true })],
        ["u_coord", coord], ["u_lod", lod]]);
      device.beginFrame(4, 4);
      try {
        device.setRenderTarget(target); device.clear([0, 0, 0, 0]);
        device.draw(pipeline.createDrawCommand({ vertexBuffer, vertexCount: 3, uniforms }));
      } finally { device.endFrame(); }
      await device.waitForSubmittedWork?.();
      const pixels = device.readPixelsAsync ? await device.readPixelsAsync(1, 1, 1, 1) : device.readPixels(1, 1, 1, 1);
      return Array.from(pixels);
    },
    async dispose() {
      // Beginning a fresh frame retires disposed sampled resources on WebGPU
      // and clears an expected rejected-draw diagnostic before counting.
      device.beginFrame(4, 4); device.endFrame();
      for (const { shader, pipeline } of programs.values()) { pipeline.dispose(); shader.dispose(); }
      vertexBuffer.dispose(); target.dispose();
      const resources = device.getDiagnostics();
      device.dispose();
      // Strict retirement contract: WebGPU textures are destroyed only after
      // their fences resolve, so count native handles once disposal settles.
      await device.whenDisposed?.();
      canvas.remove();
      return { buffers: resources.buffers, shaders: resources.shaders, targets: resources.renderTargets,
        textures: resources.textures, disposedTextures: resources.disposedTextures, lastError: resources.lastError,
        nativeHandlesAfterDispose: gl || webgpu ? nativeHandles.size : null };
    }
  };
}

function makeBytes() {
  // Four identical pixels provide controls for independently edited regions.
  return new Uint8Array([...red, ...red, ...red, ...red]);
}

async function dataAndIsolation(backend) {
  const first = await makeRenderer(backend), second = await makeRenderer(backend);
  const tex = new Texture({ width: 2, height: 2, data: makeBytes(), dynamic: true, colorSpace: "linear", generateMipmaps: false });
  let firstDisposed = false;
  try {
    const initialA = await first.sample(tex, [0.25, 0.25, 0]);
    const initialB = await second.sample(tex, [0.25, 0.25, 0]);
    const storageA = first.nativeTexture(tex), storageB = second.nativeTexture(tex);
    tex.update(new Uint8Array(green), { x: 0, y: 0, width: 1, height: 1 });
    const aGreen = await first.sample(tex, [0.25, 0.25, 0]);
    // A second edit occurs before B consumes the first revision.
    tex.update(new Uint8Array(blue), { x: 1, y: 1, width: 1, height: 1 });
    const bGreen = await second.sample(tex, [0.25, 0.25, 0]);
    const bBlue = await second.sample(tex, [0.75, 0.75, 0]);
    const aBlue = await first.sample(tex, [0.75, 0.75, 0]);
    const storageReusedA = first.nativeTexture(tex) === storageA;
    const storageReusedB = second.nativeTexture(tex) === storageB;
    const separateStorage = storageA !== storageB;
    const firstCleanup = await first.dispose(); firstDisposed = true;
    tex.update(new Uint8Array(yellow), { x: 0, y: 1, width: 1, height: 1 });
    const bAfterFirstDispose = await second.sample(tex, [0.25, 0.75, 0]);
    tex.dispose();
    let rejected = false;
    try { await second.sample(tex); } catch { rejected = true; }
    const cleanup = await second.dispose();
    return { initialA, initialB, aGreen, bGreen, bBlue, aBlue, bAfterFirstDispose, rejected,
      textureDisposed: tex.disposed, firstCleanup, cleanup, storageReusedA, storageReusedB, separateStorage,
      backend: second.device.kind, adapter: second.device.info.renderer };
  } catch (error) {
    if (!tex.disposed) tex.dispose();
    if (!firstDisposed) await first.dispose().catch(() => {});
    await second.dispose().catch(() => {});
    throw error;
  }
}

async function canvasChanges(backend) {
  const renderer = await makeRenderer(backend);
  const source = document.createElement("canvas"); source.width = 2; source.height = 2;
  let ctx = source.getContext("2d");
  ctx.fillStyle = "#ff0000"; ctx.fillRect(0, 0, 2, 1);
  ctx.fillStyle = "#0000ff"; ctx.fillRect(0, 1, 2, 1);
  const handle = textureApi.canvas({ canvas: source, colorSpace: "linear", flipY: true });
  handle.generateMipmaps = false;
  try {
    const top = await renderer.sample(handle.texture, [0.25, 0.75, 0]);
    const bottom = await renderer.sample(handle.texture, [0.25, 0.25, 0]);
    const storage = renderer.nativeTexture(handle.texture);
    ctx.fillStyle = "#00ff00"; ctx.fillRect(0, 1, 2, 1); handle.needsUpdate = true;
    const changed = await renderer.sample(handle.texture, [0.25, 0.25, 0]);
    const untouched = await renderer.sample(handle.texture, [0.25, 0.75, 0]);
    const storageReused = renderer.nativeTexture(handle.texture) === storage;
    source.width = 4; source.height = 4; ctx = source.getContext("2d");
    ctx.fillStyle = "#ff00ff"; ctx.fillRect(0, 0, 4, 4); handle.needsUpdate = true;
    const resized = await renderer.sample(handle.texture, [0.75, 0.75, 0]);
    const dimensions = [source.width, source.height];
    handle.dispose();
    const cleanup = await renderer.dispose();
    return { top, bottom, changed, untouched, resized, dimensions, storageReused, disposed: handle.texture.disposed, cleanup };
  } catch (error) { handle.dispose(); await renderer.dispose().catch(() => {}); throw error; }
}

async function subresources(backend) {
  const renderer = await makeRenderer(backend);
  const array = new Texture({ width: 2, height: 2, dimension: "2d-array", layers: 2, mipLevelCount: 2,
    data: new Uint8Array([...fill(red, 4), ...fill(blue, 4)]), colorSpace: "linear", generateMipmaps: false });
  const volume = new Texture({ width: 2, height: 2, depth: 2, dimension: "3d", mipLevelCount: 2,
    data: new Uint8Array([...fill(red, 4), ...fill(blue, 4)]), colorSpace: "linear", generateMipmaps: false });
  try {
    const array0 = await renderer.sample(array, [0.25, 0.25, 0]);
    const array1 = await renderer.sample(array, [0.25, 0.25, 1]);
    array.update(new Uint8Array(green), { x: 0, y: 0, width: 1, height: 1, layer: 1 });
    const arrayChanged = await renderer.sample(array, [0.25, 0.25, 1]);
    const arrayOtherLayer = await renderer.sample(array, [0.25, 0.25, 0]);
    const arrayOtherPixel = await renderer.sample(array, [0.75, 0.75, 1]);
    array.updateMip(1, new Uint8Array([...yellow, ...magenta]));
    const arrayMip0 = await renderer.sample(array, [0.5, 0.5, 0], 1);
    const arrayMip1 = await renderer.sample(array, [0.5, 0.5, 1], 1);
    const baseAfterMip = await renderer.sample(array, [0.25, 0.25, 1]);
    const volumeFront = await renderer.sample(volume, [0.25, 0.25, 0.25]);
    const volumeBack = await renderer.sample(volume, [0.25, 0.25, 0.75]);
    volume.updateMip(1, new Uint8Array(green));
    const volumeMip = await renderer.sample(volume, [0.5, 0.5, 0.5], 1);
    const volumeBase = await renderer.sample(volume, [0.25, 0.25, 0.75]);
    let invalidRegion = false, invalidMip = false, invalidBlock = false;
    try { array.update(new Uint8Array(green), { x: 2, y: 0, width: 1, height: 1, layer: 0 }); } catch { invalidRegion = true; }
    try { volume.updateMip(1, new Uint8Array(8)); } catch { invalidMip = true; }
    try { new Texture({ width: 4, height: 4, format: "etc2-rgb8unorm", mipLevels: [{ width: 4, height: 4, data: new Uint8Array(7) }] }); } catch { invalidBlock = true; }
    array.dispose(); volume.dispose();
    return { array0, array1, arrayChanged, arrayOtherLayer, arrayOtherPixel, arrayMip0, arrayMip1, baseAfterMip,
      volumeFront, volumeBack, volumeMip, volumeBase, invalidRegion, invalidMip, invalidBlock, cleanup: await renderer.dispose() };
  } catch (error) { array.dispose(); volume.dispose(); await renderer.dispose().catch(() => {}); throw error; }
}

async function compressedCube() {
  const renderer = await makeRenderer("webgl2");
  const gl = renderer.canvas.getContext("webgl2");
  if (!gl.getExtension("WEBGL_compressed_texture_s3tc")) {
    await renderer.dispose();
    return { unavailable: "WEBGL_compressed_texture_s3tc unavailable on this WebGL2 context" };
  }
  // BC1 block: two independent RGB565 endpoints followed by sixteen zero
  // indices. Every decoded texel therefore equals endpoint 0. Alpha is 1.
  const block = (rgb565) => new Uint8Array([rgb565 & 255, rgb565 >> 8, 0, 0, 0, 0, 0, 0]);
  const faces = ["px", "nx", "py", "ny", "pz", "nz"];
  const tex = new Texture({ width: 4, height: 4, dimension: "cube", format: "bc1-rgba-unorm", colorSpace: "linear",
    generateMipmaps: false, cubeFaces: faces.map((face) => ({ face, mipLevels: [
      { width: 4, height: 4, data: block(0xf800) }, { width: 2, height: 2, data: block(0x001f) }
    ] })) });
  try {
    const baseBefore = await renderer.sample(tex, [1, 0, 0], 0);
    const mipBefore = await renderer.sample(tex, [1, 0, 0], 1);
    const storage = renderer.nativeTexture(tex);
    tex.updateMip(1, block(0x07e0), { face: "px" });
    const mipChanged = await renderer.sample(tex, [1, 0, 0], 1);
    const otherFace = await renderer.sample(tex, [-1, 0, 0], 1);
    const baseAfter = await renderer.sample(tex, [1, 0, 0], 0);
    const storageReused = renderer.nativeTexture(tex) === storage;
    let invalidBlock = false;
    try { tex.updateMip(1, new Uint8Array(7), { face: "px" }); } catch { invalidBlock = true; }
    tex.dispose();
    return { baseBefore, mipBefore, mipChanged, otherFace, baseAfter, storageReused, invalidBlock, cleanup: await renderer.dispose() };
  } catch (error) { tex.dispose(); await renderer.dispose().catch(() => {}); throw error; }
}

async function nextVideoFrame(video) {
  if (typeof video.requestVideoFrameCallback !== "function") throw new Error("video frame callbacks unavailable");
  return new Promise((resolve, reject) => {
    const callback = video.requestVideoFrameCallback((_now, metadata) => { clearTimeout(timer); resolve(metadata.mediaTime); });
    const timer = setTimeout(() => { video.cancelVideoFrameCallback(callback); reject(new Error("timed out waiting for video frame")); }, 5000);
  });
}

async function videoChanges(backend) {
  const source = document.createElement("canvas"); source.width = 16; source.height = 16;
  if (!source.captureStream || typeof HTMLVideoElement.prototype.requestVideoFrameCallback !== "function") {
    return { unavailable: "Canvas captureStream or video frame callbacks are not available" };
  }
  const ctx = source.getContext("2d"); ctx.fillStyle = "#ff0000"; ctx.fillRect(0, 0, 16, 16);
  const stream = source.captureStream(15), video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.srcObject = stream;
  let renderer, handle;
  try {
    renderer = await makeRenderer(backend);
    await video.play(); await nextVideoFrame(video);
    handle = textureApi.video({ video, colorSpace: "linear" });
    const firstTime = video.currentTime, first = await renderer.sample(handle.texture);
    ctx.fillStyle = "#0000ff"; ctx.fillRect(0, 0, 16, 16);
    let secondTime = firstTime;
    for (let attempt = 0; attempt < 8 && secondTime <= firstTime; attempt++) { await nextVideoFrame(video); secondTime = video.currentTime; }
    // A decoded frame after repaint is required; sampling itself polls revision.
    await nextVideoFrame(video); secondTime = video.currentTime;
    const second = await renderer.sample(handle.texture);
    handle.dispose();
    video.pause(); video.srcObject = null; stream.getTracks().forEach((track) => track.stop());
    return { first, second, firstTime, secondTime, stopped: stream.getTracks().every((track) => track.readyState === "ended"),
      disposed: handle.texture.disposed, cleanup: await renderer.dispose() };
  } catch (error) {
    handle?.dispose(); video.pause(); video.srcObject = null; stream.getTracks().forEach((track) => track.stop()); await renderer?.dispose().catch(() => {}); throw error;
  }
}

async function appIsolation(backend) {
  const sources = [document.createElement("canvas"), document.createElement("canvas")];
  const contexts = sources.map((source) => { source.width = 2; source.height = 2; return source.getContext("2d"); });
  const fillSource = (index, color) => { contexts[index].fillStyle = color; contexts[index].fillRect(0, 0, 2, 2); };
  fillSource(0, "#ff0000"); fillSource(1, "#0000ff");
  const handles = sources.map((source) => textureApi.canvas({ canvas: source, colorSpace: "srgb" }));
  const canvases = sources.map(() => { const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64;
    canvas.style.width = "64px"; canvas.style.height = "64px"; document.body.append(canvas); return canvas; });
  const apps = [];
  const makeScene = (handle) => scene()
    .background("#000000")
    .camera(camera.perspective({ position: [0, 0, 4], target: [0, 0, 0], fov: 45 }))
    .add(lights.ambient({ color: "#ffffff", intensity: 1.5 }))
    .add(lights.directional({ color: "#ffffff", position: [1, 2, 4], intensity: 1 }))
    .add(primitives.box({ name: "dynamic-card", material: material.pbr({ color: "#ffffff", texture: handle, metallic: 0, roughness: 1 }) }).scale([1.5, 1.5, 1.5]));
  const sample = async (app) => {
    await app.stepAsync(1 / 60);
    const shot = await app.screenshotAsync();
    const image = new Image(); image.src = shot.dataUrl; await image.decode();
    const copy = document.createElement("canvas"); copy.width = shot.width; copy.height = shot.height;
    const context = copy.getContext("2d"); context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(Math.floor(copy.width / 2), Math.floor(copy.height / 2), 1, 1).data);
  };
  try {
    for (let i = 0; i < 2; i++) apps.push(createAuraApp(canvases[i], { scene: makeScene(handles[i]), autoStart: false,
      resize: false, pixelRatio: 1, preserveDrawingBuffer: true, renderer: { backend, allowFallback: false, qualityProfile: "production" } }));
    await Promise.all(apps.map((app) => app.ready()));
    const backends = apps.map((app) => app.backend);
    const first = await sample(apps[0]), second = await sample(apps[1]);
    fillSource(0, "#00ff00"); handles[0].needsUpdate = true;
    const firstChanged = await sample(apps[0]), secondUnchanged = await sample(apps[1]);
    await apps[0].disposeAsync();
    fillSource(1, "#ffff00"); handles[1].needsUpdate = true;
    const secondAfterDispose = await sample(apps[1]);
    const diagnostics = apps[1].diagnostics();
    await apps[1].disposeAsync(); handles.forEach((handle) => handle.dispose()); canvases.forEach((canvas) => canvas.remove());
    return { first, second, firstChanged, secondUnchanged, secondAfterDispose,
      backends, errors: diagnostics.errors, disposed: handles.map((handle) => handle.texture.disposed) };
  } catch (error) {
    await Promise.all(apps.map((app) => app.disposeAsync())); handles.forEach((handle) => handle.dispose()); canvases.forEach((canvas) => canvas.remove()); throw error;
  }
}

window.runNativeDynamicTextures = async (backend, probe) => {
  if (backend === "webgpu") {
    if (!navigator.gpu) return { unavailable: "WebGPU API unavailable" };
    if (!(await navigator.gpu.requestAdapter())) return { unavailable: "WebGPU adapter unavailable" };
  } else if (!document.createElement("canvas").getContext("webgl2")) return { unavailable: "WebGL2 context unavailable" };
  if (probe === "data") return dataAndIsolation(backend);
  if (probe === "canvas") return canvasChanges(backend);
  if (probe === "subresources") return subresources(backend);
  if (probe === "video") return videoChanges(backend);
  if (probe === "app-isolation") return appIsolation(backend);
  if (probe === "compressed-cube") return compressedCube();
  throw new Error("Unknown probe: " + probe);
};
`;

function fixturePlugin(): Plugin {
  return {
    name: "native-dynamic-textures-fixture",
    resolveId(id) { return id === moduleName ? moduleId : undefined; },
    load(id) { return id === moduleId ? script : undefined; },
    configureServer(server) {
      server.middlewares.use("/wp32-dynamic-textures.html", (_req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.end('<!doctype html><html><body><script type="module" src="/@id/__x00__virtual:aura3d-native-dynamic-textures"></script></body></html>');
      });
    }
  };
}

test("webgl2: supported BC1 cube faces and mips update independently", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}wp32-dynamic-textures.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof (window as unknown as { runNativeDynamicTextures?: unknown }).runNativeDynamicTextures === "function");
  const result = await page.evaluate(() =>
    (window as unknown as { runNativeDynamicTextures(backend: string, probe: string): Promise<ProbeResult> }).runNativeDynamicTextures("webgl2", "compressed-cube"));
  await testInfo.attach("webgl2-bc1-cube-result", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  expect(result.unavailable, result.unavailable ?? "BC1 available").toBeUndefined();
  expect(errors).toEqual([]); expectCleanup(result.cleanup);
  expectPixel(result.baseBefore, expected.red); expectPixel(result.baseAfter, expected.red);
  expectPixel(result.mipBefore, expected.blue); expectPixel(result.otherFace, expected.blue);
  expectPixel(result.mipChanged, expected.green);
  expect(result).toMatchObject({ invalidBlock: true, storageReused: true });
});

interface ProbeResult {
  readonly unavailable?: string;
  readonly [key: string]: unknown;
}

let server: ViteDevServer;
let origin: string;
test.beforeAll(async () => {
  const root = process.env.A3D_INSTALLED_PACKAGE_ROOT;
  if (!root) throw new Error("A3D_INSTALLED_PACKAGE_ROOT must identify the validated packed candidate consumer");
  const aliases = installedAuraPackageAliases();
  for (const name of ["@aura3d/engine", "@aura3d/rendering"]) {
    const entry = aliases.find((alias) => alias.find === name);
    if (!entry || realpathSync(entry.replacement).includes("/packages/")) throw new Error(`Expected packed ${name} entrypoint`);
  }
  server = await createServer({ root: process.cwd(), logLevel: "error", resolve: { alias: [...aliases] },
    server: { fs: { allow: [process.cwd(), resolve(root)] } }, plugins: [fixturePlugin()] });
  await server.listen(0);
  origin = server.resolvedUrls?.local[0] ?? "";
  if (!origin) throw new Error("Candidate test server has no local origin");
});
test.afterAll(async () => { await server?.close(); });

const expected = {
  red: [255, 0, 0, 255], green: [0, 255, 0, 255], blue: [0, 0, 255, 255],
  yellow: [255, 255, 0, 255], magenta: [255, 0, 255, 255]
} as const;

function expectPixel(actual: unknown, reference: readonly number[], tolerance = 3): void {
  expect(Array.isArray(actual)).toBe(true);
  const pixel = actual as number[];
  expect(pixel).toHaveLength(4);
  reference.forEach((channel, index) => expect(Math.abs(pixel[index]! - channel), `channel ${index}: ${JSON.stringify(pixel)}`).toBeLessThanOrEqual(tolerance));
}

function expectCleanup(value: unknown): void {
  expect(value).toMatchObject({ buffers: 0, shaders: 0, targets: 0, textures: 0, lastError: null });
  // Both backends count real native texture handles (WebGL objects or GPUTextures).
  expect((value as { nativeHandlesAfterDispose: number | null }).nativeHandlesAfterDispose).toBe(0);
}

for (const backend of ["webgl2", "webgpu"] as const) {
  for (const probe of ["data", "canvas", "subresources", "video", "app-isolation"] as const) {
    test(`${backend}: dynamic ${probe} reaches sampled pixels and releases owned resources`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${origin}wp32-dynamic-textures.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof (window as unknown as { runNativeDynamicTextures?: unknown }).runNativeDynamicTextures === "function");
      const result = await page.evaluate(({ selectedBackend, selectedProbe }) =>
        (window as unknown as { runNativeDynamicTextures(backend: string, probe: string): Promise<ProbeResult> }).runNativeDynamicTextures(selectedBackend, selectedProbe),
      { selectedBackend: backend, selectedProbe: probe });
      await testInfo.attach(`${backend}-${probe}-result`, { body: JSON.stringify(result, null, 2), contentType: "application/json" });
      // A missing backend or media facility is retained in the attachment and
      // fails this required matrix entry; it is never reported as a pass.
      expect(result.unavailable, result.unavailable ?? "backend and media available").toBeUndefined();
      expect(errors).toEqual([]);
      if (probe !== "app-isolation") expectCleanup(result.cleanup);
      if (probe === "data") {
        for (const name of ["initialA", "initialB"]) expectPixel(result[name], expected.red);
        for (const name of ["aGreen", "bGreen"]) expectPixel(result[name], expected.green);
        for (const name of ["aBlue", "bBlue"]) expectPixel(result[name], expected.blue);
        expectPixel(result.bAfterFirstDispose, expected.yellow);
        expect(result).toMatchObject({ backend, rejected: true, textureDisposed: true, storageReusedA: true, storageReusedB: true, separateStorage: true });
        const firstCleanup = result.firstCleanup as { buffers: number; shaders: number; targets: number; nativeHandlesAfterDispose: number | null };
        expect(firstCleanup).toMatchObject({ buffers: 0, shaders: 0, targets: 0 });
        expect(firstCleanup.nativeHandlesAfterDispose).toBe(0);
      } else if (probe === "canvas") {
        expectPixel(result.top, expected.red); expectPixel(result.bottom, expected.blue);
        expectPixel(result.changed, expected.green); expectPixel(result.untouched, expected.red);
        expectPixel(result.resized, expected.magenta);
        expect(result).toMatchObject({ dimensions: [4, 4], storageReused: true, disposed: true });
      } else if (probe === "subresources") {
        expectPixel(result.array0, expected.red); expectPixel(result.array1, expected.blue);
        expectPixel(result.arrayChanged, expected.green); expectPixel(result.arrayOtherLayer, expected.red);
        expectPixel(result.arrayOtherPixel, expected.blue); expectPixel(result.arrayMip0, expected.yellow);
        expectPixel(result.arrayMip1, expected.magenta); expectPixel(result.baseAfterMip, expected.green);
        expectPixel(result.volumeFront, expected.red); expectPixel(result.volumeBack, expected.blue);
        expectPixel(result.volumeMip, expected.green); expectPixel(result.volumeBase, expected.blue);
        expect(result).toMatchObject({ invalidRegion: true, invalidMip: true, invalidBlock: true });
      } else if (probe === "video") {
        expectPixel(result.first, expected.red, 24); expectPixel(result.second, expected.blue, 24);
        expect(result.secondTime as number).toBeGreaterThan(result.firstTime as number);
        expect(result).toMatchObject({ stopped: true, disposed: true });
      } else {
        const red = result.first as number[], blue = result.second as number[], green = result.firstChanged as number[];
        const retained = result.secondUnchanged as number[], yellow = result.secondAfterDispose as number[];
        expect(red[0]!).toBeGreaterThan(red[1]! + 20); expect(red[0]!).toBeGreaterThan(red[2]! + 20);
        expect(blue[2]!).toBeGreaterThan(blue[0]! + 20); expect(blue[2]!).toBeGreaterThan(blue[1]! + 20);
        expect(green[1]!).toBeGreaterThan(green[0]! + 20); expect(green[1]!).toBeGreaterThan(green[2]! + 20);
        expect(retained[2]!).toBeGreaterThan(retained[0]! + 20); expect(retained[2]!).toBeGreaterThan(retained[1]! + 20);
        expect(yellow[0]!).toBeGreaterThan(yellow[2]! + 20); expect(yellow[1]!).toBeGreaterThan(yellow[2]! + 20);
        expect(result).toMatchObject({ backends: [backend, backend], errors: [], disposed: [true, true] });
      }
    });
  }
}
