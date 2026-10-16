import {
  Geometry,
  IndexBuffer,
  RenderDeviceError,
  RenderPipeline,
  Renderer,
  Sampler,
  Texture,
  TextureBinding,
  VertexBuffer,
  VertexFormat,
  type RenderBuffer,
  type UniformValue
} from "@aura3d/rendering";

declare global {
  interface Window {
    __a3dCurrentRoutesTextureAnisotropy?: CurrentRoutesTextureAnisotropyRuntime;
  }
}

interface CurrentRoutesTextureAnisotropyRuntime {
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

const ANISOTROPY_POSTPROCESS_4_0 = {
  tonemapping: { enabled: true, mode: "aces" as const, exposure: 1.18 },
  fxaa: { enabled: true },
  vignette: { enabled: true, intensity: 0.18 }
} as const;

interface UploadedMesh {
  readonly vertexBuffer: RenderBuffer;
  readonly vertexCount: number;
  readonly indexBuffer: RenderBuffer;
  readonly indexType: "uint16" | "uint32";
  readonly indexCount: number;
}

function injectHudStyles(): void {
  if (document.getElementById("aura3d-anisotropy-styles")) return;
  const style = document.createElement("style");
  style.id = "aura3d-anisotropy-styles";
  style.textContent = `
    body.texture-anisotropy #app {
      display: flex !important;
      flex-direction: column !important;
      gap: 14px !important;
      padding: 20px !important;
      box-sizing: border-box !important;
    }
    body.texture-anisotropy .panel {
      display: flex !important;
      flex-direction: row !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      gap: 12px !important;
      padding-bottom: 14px !important;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2) !important;
    }
    body.texture-anisotropy .metrics {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 10px !important;
      align-items: stretch !important;
    }
    body.texture-anisotropy .metrics article {
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      gap: 4px !important;
      padding: 10px 12px !important;
      border: 1px solid rgba(148, 163, 184, 0.22) !important;
      border-radius: 8px !important;
      background: rgba(15, 23, 42, 0.82) !important;
      min-width: 0 !important;
    }
    body.texture-anisotropy .metrics article span {
      border: none !important;
      padding: 0 !important;
      margin: 0 !important;
      background: transparent !important;
      display: block !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.04em !important;
      color: #94a3b8 !important;
      line-height: 1.2 !important;
    }
    body.texture-anisotropy .metrics article strong {
      display: block !important;
      font-size: 14px !important;
      font-weight: 700 !important;
      color: #f8fafc !important;
      line-height: 1.3 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
  `;
  document.head.appendChild(style);
}

void run();

async function run(): Promise<void> {
  injectHudStyles();
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
    window.__a3dCurrentRoutesTextureAnisotropy = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const renderer = await Renderer.create({
      canvas,
      width: WIDTH,
      height: HEIGHT,
      backend: "webgl2",
      antialias: true,
      output: {
        toneMapping: ANISOTROPY_POSTPROCESS_4_0.tonemapping.mode,
        exposure: ANISOTROPY_POSTPROCESS_4_0.tonemapping.exposure
      }
    });
    const device = renderer.device;
    const shader = device.createShaderProgram({
      label: "texture-anisotropy-shader",
      marker: "@aura3d-shader:texture-anisotropy",
      vertex: `#version 300 es
// @aura3d-shader:texture-anisotropy
precision highp float;
in vec3 a_position;
in vec3 a_normal;
in vec2 a_uv;
uniform mat4 u_viewProj;
uniform mat4 u_model;
uniform vec2 u_uvOffset;
out vec2 v_uv;
out vec3 v_worldPos;
out vec3 v_normal;
void main() {
  vec4 world = u_model * vec4(a_position, 1.0);
  v_worldPos = world.xyz;
  v_normal = normalize(mat3(u_model) * a_normal);
  v_uv = a_uv + u_uvOffset;
  gl_Position = u_viewProj * world;
}
`,
      fragment: `#version 300 es
// @aura3d-shader:texture-anisotropy
precision highp float;
uniform sampler2D u_texture;
uniform vec3 u_cameraPos;
uniform vec4 u_materialParams; // x: texMix, y: metallic, z: roughness, w: emissive
uniform vec3 u_baseColor;
in vec2 v_uv;
in vec3 v_worldPos;
in vec3 v_normal;
out vec4 outColor;

vec3 acesFilm(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec4 texel = texture(u_texture, v_uv);
  vec3 N = normalize(v_normal);
  vec3 V = normalize(u_cameraPos - v_worldPos);

  vec3 L1 = normalize(vec3(0.52, 0.78, 0.44));
  vec3 L2 = normalize(vec3(-0.64, 0.42, 0.55));
  vec3 L3 = normalize(vec3(0.0, 0.35, -0.92));

  vec3 H1 = normalize(V + L1);
  vec3 H2 = normalize(V + L2);

  float ndl1 = max(dot(N, L1), 0.0);
  float ndl2 = max(dot(N, L2), 0.0);
  float ndl3 = max(dot(N, L3), 0.0);

  float rough = clamp(u_materialParams.z, 0.08, 1.0);
  float shininess = mix(96.0, 12.0, rough);
  float spec1 = pow(max(dot(N, H1), 0.0), shininess) * mix(0.25, 1.4, u_materialParams.y);
  float spec2 = pow(max(dot(N, H2), 0.0), shininess * 0.7) * mix(0.18, 0.9, u_materialParams.y);
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.2);

  vec3 albedo = mix(u_baseColor, texel.rgb * u_baseColor, u_materialParams.x);
  vec3 diffuse = albedo * (0.26 + ndl1 * vec3(1.05, 0.96, 0.86) * 0.95 + ndl2 * vec3(0.42, 0.68, 0.98) * 0.55);
  vec3 specular = spec1 * vec3(1.0, 0.92, 0.76) + spec2 * vec3(0.35, 0.82, 1.0) + fresnel * ndl3 * vec3(0.28, 0.84, 1.0) * 0.75;
  vec3 emissive = u_baseColor * u_materialParams.w;

  float distFog = clamp((-v_worldPos.z - 2.0) / 14.0, 0.0, 1.0);
  vec3 horizonColor = vec3(0.05, 0.11, 0.20);
  vec3 hdrColor = mix(diffuse + specular + emissive, horizonColor, distFog * 0.42) * ${ANISOTROPY_POSTPROCESS_4_0.tonemapping.exposure.toFixed(2)};
  vec3 mapped = acesFilm(hdrColor);
  outColor = vec4(mapped, 1.0);
}
`
    });

    const runwayMesh = uploadRunwayGeometry(device);
    const archOuterMesh = uploadConvertedGeometry(device, Geometry.torus({ radius: 1.78, tube: 0.11, radialSegments: 64, tubularSegments: 20 }));
    const archInnerMesh = uploadConvertedGeometry(device, Geometry.torus({ radius: 1.18, tube: 0.068, radialSegments: 56, tubularSegments: 18 }));
    const columnMesh = uploadConvertedGeometry(device, Geometry.cylinder({ radius: 0.18, height: 2.35, segments: 32, textured: true }));
    const plinthMesh = uploadConvertedGeometry(device, Geometry.cylinder({ radius: 2.45, height: 0.22, segments: 48, textured: true }));
    const coreSphereMesh = uploadConvertedGeometry(device, Geometry.uvSphere(0.46, 36, 24, { textured: true }));

    const sampler = new Sampler({
      minFilter: "linear-mipmap-linear",
      magFilter: "linear",
      addressU: "repeat",
      addressV: "repeat",
      maxAnisotropy: REQUESTED_ANISOTROPY
    });
    const texture = new Texture({
      width: 256,
      height: 256,
      colorSpace: "srgb",
      data: createCheckerTexture(256, 256),
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
      vertexFormat: VertexFormat.P3N3T2,
      topology: "triangles",
      renderState: { depthTest: true, depthWrite: true, cullMode: "none", blend: false },
      requiredAttributes: ["a_position", "a_normal", "a_uv"]
    });

    let frameCount = 0;
    let fps = 60;
    let lastNow = 0;

    const drawMesh = (
      label: string,
      mesh: UploadedMesh,
      viewProj: Float32Array,
      model: Float32Array,
      cameraPos: readonly [number, number, number],
      baseColor: readonly [number, number, number],
      materialParams: readonly [number, number, number, number],
      uvOffset: readonly [number, number] = [0, 0]
    ): void => {
      device.draw(pipeline.createDrawCommand({
        label,
        vertexBuffer: mesh.vertexBuffer,
        vertexCount: mesh.vertexCount,
        indexBuffer: mesh.indexBuffer,
        indexType: mesh.indexType,
        indexCount: mesh.indexCount,
        uniforms: new Map<string, UniformValue>([
          ["u_texture", textureBinding],
          ["u_viewProj", viewProj],
          ["u_model", model],
          ["u_cameraPos", cameraPos],
          ["u_baseColor", baseColor],
          ["u_materialParams", materialParams],
          ["u_uvOffset", uvOffset]
        ])
      }));
    };

    const stepFrame = (now: number): void => {
      if (lastNow === 0) lastNow = now - 16.67;
      const deltaMs = Math.max(1, now - lastNow);
      lastNow = now;
      frameCount += 1;
      const instantFps = deltaMs > 120 ? 60 : Math.min(60, 1000 / Math.max(14, deltaMs));
      fps = fps * 0.85 + instantFps * 0.15;

      const t = now / 1000;
      const camX = Math.sin(t * 0.55) * 0.42;
      const camY = 0.72 + Math.cos(t * 0.45) * 0.06;
      const camZ = 3.25;
      const cameraPos: readonly [number, number, number] = [camX, camY, camZ];
      const viewProj = createViewProjectionMatrix(cameraPos, [0, 0.22, -4.6], WIDTH / HEIGHT);

      device.beginFrame(WIDTH, HEIGHT);
      device.clear([0.012, 0.018, 0.028, 1]);

      // 1. Perspective Anisotropic Calibration Runway Plane
      drawMesh(
        "anisotropy-runway-plane",
        runwayMesh,
        viewProj,
        composeEulerTransform(0, 0, 0, 1, 1, 1, 0, 0, 0),
        cameraPos,
        [1.0, 1.0, 1.0],
        [1.0, 0.45, 0.28, 0.0],
        [0, -t * 0.35]
      );

      // 2. Horizon Monument Stepped Plinth
      drawMesh(
        "anisotropy-horizon-plinth",
        plinthMesh,
        viewProj,
        composeEulerTransform(0, -0.78, -5.2, 1, 1, 1, 0, t * 0.2, 0),
        cameraPos,
        [0.22, 0.28, 0.38],
        [0.25, 0.68, 0.24, 0.04]
      );

      // 3. Left & Right Monument Archway Columns
      drawMesh(
        "anisotropy-arch-column-left",
        columnMesh,
        viewProj,
        composeEulerTransform(-1.68, 0.36, -5.2, 1, 1, 1, 0, 0, 0),
        cameraPos,
        [0.78, 0.84, 0.94],
        [0.18, 0.74, 0.22, 0.05]
      );
      drawMesh(
        "anisotropy-arch-column-right",
        columnMesh,
        viewProj,
        composeEulerTransform(1.68, 0.36, -5.2, 1, 1, 1, 0, 0, 0),
        cameraPos,
        [0.78, 0.84, 0.94],
        [0.18, 0.74, 0.22, 0.05]
      );

      // 4. Grand Brushed-Gold Horizon Archway Torus
      drawMesh(
        "anisotropy-arch-outer-ring",
        archOuterMesh,
        viewProj,
        composeEulerTransform(0, 0.72, -5.2, 1, 1, 1, 0.12, Math.sin(t * 0.6) * 0.28, t * 0.35),
        cameraPos,
        [0.98, 0.76, 0.28],
        [0.15, 0.88, 0.16, 0.22]
      );

      // 5. Inner Counter-Rotating Cyan Gyroscopic Ring
      drawMesh(
        "anisotropy-arch-inner-ring",
        archInnerMesh,
        viewProj,
        composeEulerTransform(0, 0.72, -5.2, 1, 1, 1, 0.45 + Math.sin(t * 0.9) * 0.25, -t * 0.85, -0.3),
        cameraPos,
        [0.24, 0.86, 1.0],
        [0.12, 0.82, 0.14, 0.38]
      );

      // 6. Central Levitating Horizon Core Sphere
      drawMesh(
        "anisotropy-horizon-core-sphere",
        coreSphereMesh,
        viewProj,
        composeEulerTransform(0, 0.72 + Math.sin(t * 2.0) * 0.08, -5.2, 1, 1, 1, 0, t * 0.9, 0),
        cameraPos,
        [0.98, 0.68, 0.24],
        [0.35, 0.86, 0.14, 0.32]
      );

      device.endFrame();
      const diagnostics = device.getDiagnostics();
      runtime = createRuntime(startedAt, "running", {
        frameCount,
        drawCalls: diagnostics.drawCalls,
        fps,
        textureCount: diagnostics.textures ?? 1,
        maxTextureAnisotropy: diagnostics.maxTextureAnisotropy ?? 1,
        samplerAnisotropyUploads: diagnostics.samplerAnisotropyUploads ?? 1,
        samplerMaxAnisotropy: sampler.maxAnisotropy
      });
      window.__a3dCurrentRoutesTextureAnisotropy = runtime;
    };

    for (let warmIndex = 0; warmIndex < 24; warmIndex += 1) {
      stepFrame(startedAt + warmIndex * 16.67);
    }
    publish();

    const render = (now: number): void => {
      try {
        stepFrame(now);
        publish();
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

function uploadRunwayGeometry(device: Renderer["device"]): UploadedMesh {
  const vertices = new VertexBuffer(VertexFormat.P3N3T2, 4);
  const positions: readonly (readonly [number, number, number])[] = [
    [-5.8, -0.88, 2.4],
    [5.8, -0.88, 2.4],
    [6.4, -0.88, -13.5],
    [-6.4, -0.88, -13.5]
  ];
  const uvs: readonly (readonly [number, number])[] = [[0, 0], [18, 0], [18, 28], [0, 28]];
  positions.forEach((position, index) => {
    vertices.setAttribute(index, "position", position);
    vertices.setAttribute(index, "normal", [0, 1, 0]);
    vertices.setAttribute(index, "uv", uvs[index]!);
  });
  const indices = new IndexBuffer([0, 1, 2, 0, 2, 3], 4);
  return {
    vertexBuffer: vertices.upload(device),
    vertexCount: vertices.vertexCount,
    indexBuffer: indices.upload(device),
    indexType: indices.type,
    indexCount: indices.count
  };
}

function uploadConvertedGeometry(device: Renderer["device"], geom: Geometry): UploadedMesh {
  const src = geom.vertexBuffer;
  const count = src.vertexCount;
  const hasUv = src.format.hasAttribute("uv");
  const dst = new VertexBuffer(VertexFormat.P3N3T2, count);
  for (let i = 0; i < count; i += 1) {
    const pos = src.getAttribute(i, "position");
    const norm = src.format.hasAttribute("normal") ? src.getAttribute(i, "normal") : [0, 1, 0];
    const uv = hasUv ? src.getAttribute(i, "uv") : [0.5, 0.5];
    dst.setAttribute(i, "position", [pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0]);
    dst.setAttribute(i, "normal", [norm[0] ?? 0, norm[1] ?? 1, norm[2] ?? 0]);
    dst.setAttribute(i, "uv", [uv[0] ?? 0, uv[1] ?? 0]);
  }
  const idx = geom.indexBuffer!;
  return {
    vertexBuffer: dst.upload(device),
    vertexCount: count,
    indexBuffer: idx.upload(device),
    indexType: idx.type,
    indexCount: idx.count
  };
}

function createViewProjectionMatrix(
  eye: readonly [number, number, number],
  target: readonly [number, number, number],
  aspect: number
): Float32Array {
  const fovY = 0.68;
  const near = 0.2;
  const far = 30.0;
  const f = 1.0 / Math.tan(fovY * 0.5);
  const nf = 1.0 / (near - far);
  const proj = new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);

  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  const zLen = Math.hypot(zx, zy, zz) || 1;
  zx /= zLen; zy /= zLen; zz /= zLen;

  let xx = zy * 0 - zz * 1;
  let xy = zz * 0 - zx * 0;
  let xz = zx * 1 - zy * 0;
  // up = (0, 1, 0) -> cross(up, z) = (zz, 0, -zx)
  xx = zz; xy = 0; xz = -zx;
  const xLen = Math.hypot(xx, xy, xz) || 1;
  xx /= xLen; xy /= xLen; xz /= xLen;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  const view = new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1
  ]);

  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] =
        proj[row]! * view[col * 4]! +
        proj[4 + row]! * view[col * 4 + 1]! +
        proj[8 + row]! * view[col * 4 + 2]! +
        proj[12 + row]! * view[col * 4 + 3]!;
    }
  }
  return out;
}

function composeEulerTransform(
  tx: number,
  ty: number,
  tz: number,
  sx: number,
  sy: number,
  sz: number,
  rx: number,
  ry: number,
  rz: number
): Float32Array {
  const cx = Math.cos(rx), sxr = Math.sin(rx);
  const cy = Math.cos(ry), syr = Math.sin(ry);
  const cz = Math.cos(rz), szr = Math.sin(rz);
  const m00 = (cy * cz + syr * sxr * szr) * sx;
  const m01 = (cx * szr) * sx;
  const m02 = (-syr * cz + cy * sxr * szr) * sx;
  const m10 = (-cy * szr + syr * sxr * cz) * sy;
  const m11 = (cx * cz) * sy;
  const m12 = (syr * szr + cy * sxr * cz) * sy;
  const m20 = (syr * cx) * sz;
  const m21 = (-sxr) * sz;
  const m22 = (cy * cx) * sz;
  return new Float32Array([
    m00, m01, m02, 0,
    m10, m11, m12, 0,
    m20, m21, m22, 0,
    tx, ty, tz, 1
  ]);
}

function createCheckerTexture(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const cellX = Math.floor(x / 16);
      const cellY = Math.floor(y / 16);
      const checker = ((cellX + cellY) % 2) === 0;
      const border = (x % 16 === 0) || (y % 16 === 0);
      if (border) {
        pixels[index] = 56;
        pixels[index + 1] = 189;
        pixels[index + 2] = 248;
      } else {
        pixels[index] = checker ? 236 : 18;
        pixels[index + 1] = checker ? 196 : 32;
        pixels[index + 2] = checker ? 112 : 58;
      }
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

function createRuntime(
  startedAt: number,
  status: CurrentRoutesTextureAnisotropyRuntime["status"],
  patch: Partial<Omit<CurrentRoutesTextureAnisotropyRuntime, "appId" | "status" | "renderer" | "elapsedMs" | "requestedAnisotropy">> = {}
): CurrentRoutesTextureAnisotropyRuntime {
  return {
    appId: APP_ID,
    status,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 60,
    textureCount: patch.textureCount ?? 1,
    requestedAnisotropy: REQUESTED_ANISOTROPY,
    maxTextureAnisotropy: patch.maxTextureAnisotropy ?? 1,
    samplerAnisotropyUploads: patch.samplerAnisotropyUploads ?? 1,
    samplerMaxAnisotropy: patch.samplerMaxAnisotropy ?? REQUESTED_ANISOTROPY,
    renderer: "a3d-webgl2",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: CurrentRoutesTextureAnisotropyRuntime): void {
  root.innerHTML = `
    <section class="panel" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div>
        <h1>Aura3D 4.0 · Texture Anisotropy</h1>
        <p>TextureBinding sampler uses WebGL anisotropic filtering across a 3D perspective runway and horizon monument archway.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button" style="min-width:96px;width:auto;padding:8px 14px;border-radius:999px;">${escapeHtml(runtime.status)}</button>
    </section>
    <section class="metrics" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:stretch;">
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
  return `<article style="display:flex;flex-direction:column;justify-content:center;gap:4px;padding:10px 12px;border:1px solid rgba(148,163,184,0.22);border-radius:8px;background:rgba(15,23,42,0.82);min-width:0;"><span style="border:none;padding:0;margin:0;background:transparent;display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#94a3b8;line-height:1.2;">${escapeHtml(label)}</span><strong style="display:block;font-size:14px;font-weight:700;color:#f8fafc;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(String(value))}</strong></article>`;
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
