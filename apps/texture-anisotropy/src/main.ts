import {
  IndexBuffer,
  RenderDeviceError,
  RenderPipeline,
  Sampler,
  Texture,
  TextureBinding,
  VertexBuffer,
  VertexFormat
} from "@aura3d/rendering";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";

declare global {
  interface Window {
    __a3dV8TextureAnisotropy?: V8TextureAnisotropyRuntime;
  }
}

interface V8TextureAnisotropyRuntime {
  readonly appId: "texture-anisotropy";
  readonly status: "ready" | "running" | "error";
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly textureCount: number;
  readonly requestedAnisotropy: number;
  readonly maxTextureAnisotropy: number;
  readonly samplerAnisotropyUploads: number;
  readonly samplerMaxAnisotropy: number;
  readonly renderer: "a3d-webgl2";
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "texture-anisotropy" as const;
const WIDTH = 1280;
const HEIGHT = 720;
const REQUESTED_ANISOTROPY = 8;

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const startedAt = performance.now();
  let runtime = createRuntime(startedAt, "ready");
  const publish = (): void => {
    window.__a3dV8TextureAnisotropy = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const renderer = await A3DRenderer.create({ canvas, width: WIDTH, height: HEIGHT, backend: "webgl2", antialias: true, preserveDrawingBuffer: true });
    const device = renderer.device;
    const shader = device.createShaderProgram({
      label: "texture-anisotropy-shader",
      marker: "@aura3d-shader:texture-anisotropy-v1",
      vertex: `#version 300 es
// @aura3d-shader:texture-anisotropy-v1
precision highp float;
in vec3 a_position;
in vec2 a_uv;
uniform float u_time;
out vec2 v_uv;
void main() {
  v_uv = a_uv + vec2(u_time * 0.04, 0.0);
  gl_Position = vec4(a_position, 1.0);
}
`,
      fragment: `#version 300 es
// @aura3d-shader:texture-anisotropy-v1
precision highp float;
uniform sampler2D u_texture;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec4 texel = texture(u_texture, v_uv);
  outColor = vec4(texel.rgb, 1.0);
}
`
    });
    const geometry = createSlantedPlaneGeometry();
    const vertexBuffer = geometry.vertices.upload(device);
    const indexBuffer = geometry.indices.upload(device);
    const sampler = new Sampler({
      minFilter: "linear-mipmap-linear",
      magFilter: "linear",
      addressU: "repeat",
      addressV: "repeat",
      maxAnisotropy: REQUESTED_ANISOTROPY
    });
    const texture = new Texture({
      width: 128,
      height: 128,
      colorSpace: "srgb",
      data: createCheckerTexture(128, 128),
      label: "anisotropy-checker"
    });
    const textureBinding = new TextureBinding({
      name: "u_texture",
      texture,
      sampler,
      expectedColorSpace: "srgb"
    });
    const pipeline = new RenderPipeline({
      label: "texture-anisotropy",
      shader,
      vertexFormat: geometry.vertices.format,
      topology: "triangles",
      renderState: { depthTest: false, depthWrite: false, cullMode: "none", blend: false },
      requiredAttributes: ["a_position", "a_uv"]
    });

    let frameCount = 0;
    let fps = 0;
    let fpsFrames = 0;
    let fpsFrom = 0;
    let lastUi = 0;
    const render = (now: number): void => {
      try {
        frameCount += 1;
        fpsFrames += 1;
        if (fpsFrom === 0) fpsFrom = now;
        if (now - fpsFrom >= 500) {
          fps = fpsFrames * 1000 / (now - fpsFrom);
          fpsFrames = 0;
          fpsFrom = now;
        }
        device.beginFrame(WIDTH, HEIGHT);
        device.clear([0.008, 0.01, 0.014, 1]);
        device.draw(pipeline.createDrawCommand({
          label: "texture-anisotropy-draw",
          vertexBuffer,
          vertexCount: geometry.vertices.vertexCount,
          indexBuffer,
          indexType: geometry.indices.type,
          indexCount: geometry.indices.count,
          uniforms: new Map([
            ["u_texture", textureBinding],
            ["u_time", now / 1000]
          ])
        }));
        device.endFrame();
        const diagnostics = device.getDiagnostics();
        runtime = createRuntime(startedAt, frameCount === 1 ? "ready" : "running", {
          frameCount,
          drawCalls: diagnostics.drawCalls,
          fps,
          textureCount: diagnostics.textures ?? 0,
          maxTextureAnisotropy: diagnostics.maxTextureAnisotropy ?? 1,
          samplerAnisotropyUploads: diagnostics.samplerAnisotropyUploads ?? 0,
          samplerMaxAnisotropy: sampler.maxAnisotropy
        });
        window.__a3dV8TextureAnisotropy = runtime;
        if (frameCount === 1 || now - lastUi > 220) {
          publish();
          lastUi = now;
        }
        requestAnimationFrame(render);
      } catch (error) {
        runtime = createRuntime(startedAt, "error", { error: formatError(error) });
        publish();
      }
    };
    requestAnimationFrame(render);
  } catch (error) {
    runtime = createRuntime(startedAt, "error", { error: formatError(error) });
    publish();
  }
}

function createSlantedPlaneGeometry(): { readonly vertices: VertexBuffer; readonly indices: IndexBuffer } {
  const vertices = new VertexBuffer(VertexFormat.P3N3T2, 4);
  const positions: readonly (readonly [number, number, number])[] = [
    [-0.92, -0.82, 0],
    [0.92, -0.62, 0],
    [0.56, 0.84, 0],
    [-0.54, 0.58, 0]
  ];
  const uvs: readonly (readonly [number, number])[] = [[0, 0], [12, 0], [12, 18], [0, 18]];
  positions.forEach((position, index) => {
    vertices.setAttribute(index, "position", position);
    vertices.setAttribute(index, "normal", [0, 0, 1]);
    vertices.setAttribute(index, "uv", uvs[index]!);
  });
  return { vertices, indices: new IndexBuffer([0, 1, 2, 0, 2, 3], 4) };
}

function createCheckerTexture(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const checker = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) === 0;
      pixels[index] = checker ? 236 : 28;
      pixels[index + 1] = checker ? 214 : 68;
      pixels[index + 2] = checker ? 126 : 176;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

function createRuntime(
  startedAt: number,
  status: V8TextureAnisotropyRuntime["status"],
  patch: Partial<Omit<V8TextureAnisotropyRuntime, "appId" | "status" | "renderer" | "elapsedMs" | "requestedAnisotropy">> = {}
): V8TextureAnisotropyRuntime {
  return {
    appId: APP_ID,
    status,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    textureCount: patch.textureCount ?? 0,
    requestedAnisotropy: REQUESTED_ANISOTROPY,
    maxTextureAnisotropy: patch.maxTextureAnisotropy ?? 1,
    samplerAnisotropyUploads: patch.samplerAnisotropyUploads ?? 0,
    samplerMaxAnisotropy: patch.samplerMaxAnisotropy ?? REQUESTED_ANISOTROPY,
    renderer: "a3d-webgl2",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: V8TextureAnisotropyRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>V8 Texture Anisotropy</h1>
        <p>TextureBinding sampler uses WebGL anisotropic filtering when available.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button">${escapeHtml(runtime.status)}</button>
    </section>
    <section class="metrics">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("FPS", runtime.fps.toFixed(1))}
      ${metric("Textures", runtime.textureCount)}
      ${metric("Requested", runtime.requestedAnisotropy)}
      ${metric("Device max", runtime.maxTextureAnisotropy)}
      ${metric("Sampler max", runtime.samplerMaxAnisotropy)}
      ${metric("Aniso uploads", runtime.samplerAnisotropyUploads)}
    </section>
    ${runtime.error ? `<section class="diagnostics">${escapeHtml(runtime.error)}</section>` : ""}
  `;
}

function metric(label: string, value: string | number): string {
  return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></article>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function formatError(error: unknown): string {
  if (error instanceof RenderDeviceError) {
    return `${error.name}: ${error.message} (${error.code})`;
  }
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
