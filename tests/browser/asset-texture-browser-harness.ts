import { AssetManager, GLTFLoader, ImageLoader, TextureLoader, createGLTFRenderResources } from "@galileo3d/assets";
import { InstancedUnlitMaterial, Renderer, analyzeRgbaFrameVisualMetrics, type FrameVisualMetrics, type RenderDeviceDiagnostics } from "@galileo3d/rendering";

interface AssetTextureBrowserResult {
  readonly status: "ready" | "error";
  readonly textureSize?: readonly [number, number];
  readonly pixel?: readonly number[];
  readonly gltfRenderTextureSize?: readonly [number, number];
  readonly gltfRenderPixel?: readonly number[];
  readonly gltfRenderDiagnostics?: RenderDeviceDiagnostics;
  readonly gltfDefaultSourcePixel?: readonly number[];
  readonly gltfDefaultSourceDiagnostics?: RenderDeviceDiagnostics;
  readonly gltfHdrPreviewPixel?: readonly number[];
  readonly gltfHdrPreviewDiagnostics?: RenderDeviceDiagnostics;
  readonly gltfHdrPreviewStats?: FrameVisualMetrics;
  readonly gltfHdrPreviewPostprocessTargetFormat?: string;
  readonly gltfHdrPreviewEnvironmentMapTexture?: boolean;
  readonly gltfHdrPreviewBrdfLutTexture?: boolean;
  readonly gltfInstancedDiagnostics?: RenderDeviceDiagnostics;
  readonly gltfInstancedLeftPixel?: readonly number[];
  readonly gltfInstancedRightPixel?: readonly number[];
  readonly error?: string;
}

declare global {
  interface Window {
    __GALILEO3D_ASSET_TEXTURE_BROWSER_TEST__?: AssetTextureBrowserResult;
  }
}

function publish(result: AssetTextureBrowserResult): void {
  window.__GALILEO3D_ASSET_TEXTURE_BROWSER_TEST__ = result;
}

function createSourceImage(): string {
  const image = document.createElement("canvas");
  image.width = 2;
  image.height = 2;
  const context = image.getContext("2d");
  if (!context) throw new Error("2D canvas context is unavailable for source image.");
  context.fillStyle = "rgb(230, 40, 20)";
  context.fillRect(0, 0, image.width, image.height);
  return image.toDataURL("image/png");
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compile failed");
  }
  return shader;
}

try {
  const canvas = document.querySelector<HTMLCanvasElement>("#asset-texture-surface");
  const gl = canvas?.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!canvas || !gl) throw new Error("WebGL2 texture surface is unavailable.");

  const assets = new AssetManager();
  assets.register(new ImageLoader());
  assets.register(new TextureLoader());
  const textureAsset = await assets.load(createSourceImage(), { type: "texture" });

  const texture = gl.createTexture();
  if (!texture) throw new Error("Unable to create WebGL texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureAsset.value.source);

  const vertex = compile(gl, gl.VERTEX_SHADER, `#version 300 es
    const vec2 positions[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
    out vec2 v_uv;
    void main() {
      vec2 position = positions[gl_VertexID];
      v_uv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    uniform sampler2D u_texture;
    in vec2 v_uv;
    out vec4 outColor;
    void main() {
      outColor = texture(u_texture, v_uv);
    }
  `);
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create WebGL program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Program link failed");
  }
  gl.useProgram(program);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const pixel = new Uint8Array(4);
  gl.readPixels(16, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  const gltfRender = await renderGLTFTextureBinding();
  const gltfDefaultSource = await renderGLTFDefaultPbrSource();
  const gltfHdrPreview = await renderGLTFHdrStudioPreviewInput();
  const gltfInstanced = await renderGLTFInstancing();

  publish({
    status: "ready",
    textureSize: [textureAsset.value.width, textureAsset.value.height],
    pixel: [...pixel],
    gltfRenderTextureSize: gltfRender.textureSize,
    gltfRenderPixel: gltfRender.pixel,
    gltfRenderDiagnostics: gltfRender.diagnostics,
    gltfDefaultSourcePixel: gltfDefaultSource.pixel,
    gltfDefaultSourceDiagnostics: gltfDefaultSource.diagnostics,
    gltfHdrPreviewPixel: gltfHdrPreview.pixel,
    gltfHdrPreviewDiagnostics: gltfHdrPreview.diagnostics,
    gltfHdrPreviewStats: gltfHdrPreview.stats,
    gltfHdrPreviewPostprocessTargetFormat: gltfHdrPreview.postprocessTargetFormat,
    gltfHdrPreviewEnvironmentMapTexture: gltfHdrPreview.environmentMapTexture,
    gltfHdrPreviewBrdfLutTexture: gltfHdrPreview.brdfLutTexture,
    gltfInstancedDiagnostics: gltfInstanced.diagnostics,
    gltfInstancedLeftPixel: gltfInstanced.leftPixel,
    gltfInstancedRightPixel: gltfInstanced.rightPixel
  });
  await assets.release(textureAsset);
  gl.deleteTexture(texture);
  gl.deleteProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
} catch (error) {
  publish({
    status: "error",
    error: error instanceof Error ? error.message : String(error)
  });
}

async function renderGLTFDefaultPbrSource(): Promise<{
  readonly pixel: readonly number[];
  readonly diagnostics: RenderDeviceDiagnostics;
}> {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  document.body.append(canvas);
  const asset = await new GLTFLoader().load({ url: createTexturedGLTFUrl() }, { throwIfAborted: () => undefined } as never);
  const resources = await createGLTFRenderResources(asset, {
    imageDecoder: (_image, imageIndex) => ({
      width: 1,
      height: 1,
      colorSpace: "srgb",
      data: [
        new Uint8Array([30, 220, 60, 255]),
        new Uint8Array([128, 128, 255, 255]),
        new Uint8Array([255, 255, 0, 255]),
        new Uint8Array([255, 255, 255, 255]),
        new Uint8Array([0, 0, 0, 255])
      ][imageIndex] ?? new Uint8Array([255, 255, 255, 255])
    })
  });
  const renderer = await Renderer.create({ backend: "webgl2", canvas, width: 64, height: 64, clearColor: [0, 0, 0, 1], antialias: false });
  const rendererInput = resources.toRendererInput({ width: 64, height: 64 });
  const diagnostics = renderer.render(rendererInput.source, rendererInput.camera);
  const pixel = Array.from(renderer.device.readPixels(32, 32, 1, 1));
  renderer.dispose();
  resources.dispose();
  canvas.remove();
  return { pixel, diagnostics };
}

async function renderGLTFHdrStudioPreviewInput(): Promise<{
  readonly pixel: readonly number[];
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly stats: FrameVisualMetrics;
  readonly postprocessTargetFormat: string;
  readonly environmentMapTexture: boolean;
  readonly brdfLutTexture: boolean;
}> {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  document.body.append(canvas);
  const asset = await new GLTFLoader().load({ url: createTexturedGLTFUrl() }, { throwIfAborted: () => undefined } as never);
  const resources = await createGLTFRenderResources(asset, {
    imageDecoder: (_image, imageIndex) => ({
      width: 1,
      height: 1,
      colorSpace: "srgb",
      data: [
        new Uint8Array([30, 220, 60, 255]),
        new Uint8Array([128, 128, 255, 255]),
        new Uint8Array([255, 255, 0, 255]),
        new Uint8Array([255, 255, 255, 255]),
        new Uint8Array([0, 0, 0, 255])
      ][imageIndex] ?? new Uint8Array([255, 255, 255, 255])
    })
  });
  const renderer = await Renderer.create({ backend: "webgl2", canvas, width: 96, height: 96, clearColor: [0, 0, 0, 1], antialias: false });
  const rendererInput = resources.toRendererInput({ width: 96, height: 96 }, { qualityPreset: "hdr-studio-preview" });
  const postprocess = rendererInput.source.postprocess && typeof rendererInput.source.postprocess === "object"
    ? rendererInput.source.postprocess
    : {};
  const environmentLighting = rendererInput.source.environmentLighting && typeof rendererInput.source.environmentLighting === "object"
    ? rendererInput.source.environmentLighting
    : {};
  const diagnostics = renderer.render(rendererInput);
  const pixels = renderer.device.readPixels(0, 0, 96, 96);
  const pixel = Array.from(renderer.device.readPixels(48, 48, 1, 1));
  const stats = analyzeRgbaFrameVisualMetrics(pixels, 96, 96);
  renderer.dispose();
  resources.dispose();
  canvas.remove();
  return {
    pixel,
    diagnostics,
    stats,
    postprocessTargetFormat: String(postprocess.targetFormat ?? ""),
    environmentMapTexture: Boolean("environmentMapTexture" in environmentLighting),
    brdfLutTexture: Boolean("environmentBrdfLutTexture" in environmentLighting)
  };
}

async function renderGLTFInstancing(): Promise<{
  readonly leftPixel: readonly number[];
  readonly rightPixel: readonly number[];
  readonly diagnostics: RenderDeviceDiagnostics;
}> {
  const canvas = document.querySelector<HTMLCanvasElement>("#gltf-instancing-surface");
  if (!canvas) throw new Error("glTF instancing canvas is unavailable.");
  const asset = await new GLTFLoader().load({ url: createInstancedGLTFUrl() }, { throwIfAborted: () => undefined } as never);
  const resources = await createGLTFRenderResources(asset);
  const materialLibrary = new Map(resources.materialLibrary);
  materialLibrary.set("browser-instanced-material", new InstancedUnlitMaterial({ color: [0.05, 0.82, 0.22, 1] }));
  const renderer = await Renderer.create({ backend: "webgl2", canvas, width: 64, height: 64, clearColor: [0, 0, 0, 1], antialias: false });
  const diagnostics = renderer.render({
    scene: resources.scene,
    geometryLibrary: resources.geometryLibrary,
    materialLibrary,
    morphTargetLibrary: resources.morphTargetLibrary,
    cameraPolicy: "identity"
  });
  const leftPixel = Array.from(renderer.device.readPixels(18, 32, 1, 1));
  const rightPixel = Array.from(renderer.device.readPixels(46, 32, 1, 1));
  renderer.dispose();
  resources.dispose();
  return { leftPixel, rightPixel, diagnostics };
}

async function renderGLTFTextureBinding(): Promise<{
  readonly textureSize: readonly [number, number];
  readonly pixel: readonly number[];
  readonly diagnostics: RenderDeviceDiagnostics;
}> {
  const canvas = document.querySelector<HTMLCanvasElement>("#gltf-render-resource-surface");
  if (!canvas) throw new Error("glTF render resource canvas is unavailable.");
  const asset = await new GLTFLoader().load({ url: createTexturedGLTFUrl() }, { throwIfAborted: () => undefined } as never);
  const resources = await createGLTFRenderResources(asset, {
    imageDecoder: (_image, imageIndex) => ({
      width: 1,
      height: 1,
      colorSpace: "srgb",
      data: [
        new Uint8Array([30, 220, 60, 255]),
        new Uint8Array([128, 128, 255, 255]),
        new Uint8Array([255, 255, 0, 255]),
        new Uint8Array([255, 255, 255, 255]),
        new Uint8Array([0, 0, 0, 255])
      ][imageIndex] ?? new Uint8Array([255, 255, 255, 255])
    })
  });
  const renderer = await Renderer.create({ backend: "webgl2", canvas, width: 64, height: 64, clearColor: [0, 0, 0, 1], antialias: false });
  const diagnostics = renderer.render(resources.toRenderSource({
    qualityPreset: "default",
    cameraPolicy: "identity",
    environmentLighting: { color: [1, 1, 1], intensity: 0.75 }
  }));
  const pixel = Array.from(renderer.device.readPixels(32, 32, 1, 1));
  const texture = resources.textureLibrary.get("browser-gltf-base-color");
  const textureSize = [texture?.width ?? 0, texture?.height ?? 0] as const;
  renderer.dispose();
  resources.dispose();
  return { textureSize, pixel, diagnostics };
}

function createInstancedGLTFUrl(): string {
  const positions = floatBytes([-0.22, -0.22, 0, 0.22, -0.22, 0, 0, 0.22, 0]);
  const translations = floatBytes([-0.45, 0, 0, 0.45, 0, 0]);
  const buffer = concatBytes(positions, translations);
  const gltf = {
    asset: { version: "2.0" },
    extensionsRequired: ["EXT_mesh_gpu_instancing"],
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: translations.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 2, type: "VEC3" }
    ],
    materials: [{ name: "browser-instanced-material", extensions: { KHR_materials_unlit: {} } }],
    meshes: [{ name: "browser-instanced-triangle", primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    nodes: [{
      name: "browser-instanced-node",
      mesh: 0,
      extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 1 } } }
    }],
    scenes: [{ nodes: [0] }]
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function createTexturedGLTFUrl(): string {
  const positions = floatBytes([-1, -1, 0, 1, -1, 0, 0, 1, 0]);
  const uvs = floatBytes([0, 0, 1, 0, 0.5, 1]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, uvs, indices);
  const gltf = {
    asset: { version: "2.0" },
    extensionsRequired: ["KHR_texture_transform"],
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: uvs.byteLength },
      { buffer: 0, byteOffset: positions.byteLength + uvs.byteLength, byteLength: indices.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    images: [
      { name: "browser-gltf-base-color-image", uri: "data:image/png;base64,AAAA" },
      { name: "browser-gltf-normal-image", uri: "data:image/png;base64,AAAA" },
      { name: "browser-gltf-metallic-roughness-image", uri: "data:image/png;base64,AAAA" },
      { name: "browser-gltf-occlusion-image", uri: "data:image/png;base64,AAAA" },
      { name: "browser-gltf-emissive-image", uri: "data:image/png;base64,AAAA" }
    ],
    samplers: [{ magFilter: 9728, minFilter: 9728, wrapS: 33071, wrapT: 33071 }],
    textures: [
      { name: "browser-gltf-base-color", source: 0, sampler: 0 },
      { name: "browser-gltf-normal", source: 1, sampler: 0 },
      { name: "browser-gltf-metallic-roughness", source: 2, sampler: 0 },
      { name: "browser-gltf-occlusion", source: 3, sampler: 0 },
      { name: "browser-gltf-emissive", source: 4, sampler: 0 }
    ],
    materials: [
      {
        name: "browser-gltf-material",
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          baseColorTexture: {
            index: 0,
            extensions: {
              KHR_texture_transform: { offset: [0, 0], scale: [1, 1], rotation: 0 }
            }
          },
          metallicRoughnessTexture: { index: 2 },
          metallicFactor: 0,
          roughnessFactor: 0.5
        },
        normalTexture: { index: 1, scale: 1 },
        occlusionTexture: { index: 3, strength: 1 },
        emissiveFactor: [1, 1, 1],
        emissiveTexture: { index: 4 }
      }
    ],
    meshes: [{ name: "browser-gltf-triangle", primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    nodes: [{ name: "browser-gltf-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function floatBytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  new Float32Array(bytes.buffer).set(values);
  return bytes;
}

function uint16Bytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2);
  new Uint16Array(bytes.buffer).set(values);
  return bytes;
}

function concatBytes(...chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function bytesDataUri(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:application/octet-stream;base64,${btoa(binary)}`;
}
