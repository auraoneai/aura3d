import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { baseReport } from "../../tools/external-parity-reporting/index.js";

interface WebGPUParityCase {
  readonly name: string;
  readonly status: "pass" | "unsupported";
  readonly evidenceType: "injected-webgpu-contract" | "real-navigator-gpu-probe" | "real-webgpu-webgl2-conformance" | "real-webgpu-native-wgsl-material" | "root-code-contract";
  readonly details: Record<string, unknown>;
}

interface WebGPUParityReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly commit: string;
  readonly runId: string;
  readonly sourceFileHashes: readonly { readonly path: string; readonly sha256: string }[];
  readonly screenshotPaths: readonly string[];
  readonly violations: readonly string[];
  readonly releaseRunId: string;
  readonly gitSha: string;
  readonly command: string;
  readonly environment: {
    readonly platform: string;
    readonly release: string;
    readonly arch: string;
    readonly node: string;
  };
  readonly sourceInputs: readonly string[];
  readonly status: "pass";
  readonly source: "tests/browser/webgpu-parity.spec.ts";
  readonly os: {
    readonly platform: string;
    readonly release: string;
  };
  readonly cases: readonly WebGPUParityCase[];
  readonly featureMatrix: {
    readonly triangleRaster: boolean;
    readonly indexedDraws: boolean;
    readonly lineTopology: boolean;
    readonly pointTopology: boolean;
    readonly vertexColors: boolean;
    readonly renderTargetReadback: boolean;
    readonly instancing: boolean;
    readonly texturedMaterial: boolean;
    readonly particlesCompute: boolean;
    readonly realNavigatorGpuAdapter: boolean;
    readonly realHardwareRenderTargetReadback: boolean;
    readonly realHardwareRenderDeviceFeatureMatrix: boolean;
    readonly realWebGPUWebGL2FeatureMatrixConformance: boolean;
    readonly nativeWebGPURenderPassSubmission: boolean;
    readonly nativeWebGPUTextureToBufferReadback: boolean;
    readonly nativeWebGPUTextureBinding: boolean;
    readonly realWebGPUPbrForwardPass: boolean;
    readonly realWebGPUTexturedPbrForwardPass: boolean;
    readonly realWebGPUEnvironmentPbrForwardPass: boolean;
    readonly realWebGPUInstancedPbrForwardPass: boolean;
    readonly realWebGPUSkinnedForwardPass: boolean;
    readonly realWebGPUMorphForwardPass: boolean;
    readonly realWebGPUShadowMapForwardPass: boolean;
    readonly realWebGPUHdrRenderTargetPostprocess: boolean;
    readonly realWebGPURendererAsyncPostprocess: boolean;
    readonly realHardwareComputeParticles: boolean;
    readonly morphTargets: boolean;
  };
  readonly unsupportedCases: readonly string[];
  readonly unsupportedFeatures: readonly string[];
  readonly hardwareClaim: "real-navigator-gpu-adapter-available" | "blocked-no-real-adapter-evidence";
  readonly hardwareMatrix: WebGPUHardwareMatrixSummary;
  readonly fullWebGPUParity: boolean;
  readonly supportedEvidence: readonly string[];
  readonly blockedEvidence: readonly string[];
  readonly validations: readonly {
    readonly id: string;
    readonly passed: boolean;
    readonly evidence: string;
    readonly blockers: readonly string[];
  }[];
  readonly fullWebGPUParityBlockers: readonly string[];
  readonly blockedClaims: readonly string[];
  readonly note: string;
}

interface WebGPUHardwareMatrixSummary {
  readonly reportPath: "tests/reports/webgpu-hardware-matrix.json";
  readonly present: boolean;
  readonly realDeviceAvailable: boolean;
  readonly allResultsSupported: boolean;
  readonly unsupportedResultCount: number;
  readonly resultCount: number;
  readonly adapters: readonly {
    readonly browserName?: string;
    readonly projectName?: string;
    readonly hasNavigatorGpu?: boolean;
    readonly adapterStatus?: string;
    readonly deviceStatus?: string;
    readonly adapterName?: string;
    readonly unsupportedCases?: readonly string[];
  }[];
}

const webgpuReportSourceFiles = [
  "tests/browser/webgpu-parity.spec.ts",
  "tests/browser/webgpu-real-device.spec.ts",
  "packages/rendering/src/WebGPUDevice.ts",
  "packages/rendering/src/effects/GPUParticleBackend.ts",
  "examples/webgpu-capability/main.ts",
  "tests/reports/webgpu-hardware-matrix.json",
] as const;

test.describe("WebGPU parity coverage", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("records triangle, render-target/readback, instancing, particles, and compute parity evidence", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async (moduleUrl) => {
      const { Geometry, IndexBuffer, InstancedPBRMaterial, MorphUnlitMaterial, PBRMaterial, Renderer, Sampler, SkinnedUnlitMaterial, Texture, TextureBinding, TexturedPBRMaterial, VertexBuffer, VertexFormat, WebGPUParticleBackend, createRenderDevice, createV4EnvironmentLighting, toneMapFloatPixels } = await import(moduleUrl);
      const parityShader = {
        label: "webgpu-parity-raster",
        marker: "@galileo3d-shader:webgpu-parity-raster",
        vertex: `#version 300 es
// @galileo3d-shader:webgpu-parity-raster
precision highp float;
layout(location = 0) in vec3 position;
void main() {
  gl_Position = vec4(position, 1.0);
}
`,
        fragment: `#version 300 es
// @galileo3d-shader:webgpu-parity-raster
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  outColor = u_color;
}
`
      };
      const triangleVertices = new Float32Array([
        -0.75, -0.75, 0,
        0.75, -0.75, 0,
        0, 0.75, 0
      ]);

      const webglCanvas = document.createElement("canvas");
      webglCanvas.width = 32;
      webglCanvas.height = 32;
      document.body.append(webglCanvas);
      const webglDevice = await createRenderDevice({ backend: "webgl2", canvas: webglCanvas, preserveDrawingBuffer: true });
      const webglShader = webglDevice.createShaderProgram(parityShader);
      const webglTarget = webglDevice.createRenderTarget({ width: 32, height: 32, label: "webgpu-parity-webgl2-target" });
      const webglTriangleBuffer = webglDevice.createBuffer("vertex", 36, triangleVertices);
      webglDevice.setRenderTarget(webglTarget);
      webglDevice.beginFrame(32, 32);
      webglDevice.clear([0, 0, 0, 1]);
      webglDevice.draw({
        label: "webgpu-parity-webgl2-triangle",
        topology: "triangles",
        vertexBuffer: webglTriangleBuffer,
        vertexFormat: VertexFormat.P3,
        vertexCount: 3,
        shader: webglShader,
        uniforms: new Map([["u_color", [0.1, 0.8, 0.2, 1]]])
      });
      const webglTriangleCenter = Array.from(webglDevice.readPixels(16, 16, 1, 1));
      webglDevice.endFrame();
      const webglDiagnostics = webglDevice.getDiagnostics();
      webglDevice.dispose();

      const textureShader = {
        label: "webgpu-parity-texture",
        marker: "@galileo3d-shader:webgpu-parity-texture",
        vertex: `#version 300 es
// @galileo3d-shader:webgpu-parity-texture
precision highp float;
layout(location = 0) in vec3 position;
layout(location = 2) in vec2 uv;
out vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = vec4(position, 1.0);
}
`,
        fragment: `#version 300 es
// @galileo3d-shader:webgpu-parity-texture
precision highp float;
uniform sampler2D u_texture;
in vec2 v_uv;
out vec4 outColor;
void main() {
  outColor = texture(u_texture, v_uv);
}
`
      };
      const texturedVertices = new Float32Array([
        -0.9, -0.9, 0, 0, 0, 1, 0, 0,
        0.9, -0.9, 0, 0, 0, 1, 0, 0,
        0, 0.9, 0, 0, 0, 1, 0, 0
      ]);
      const parityTexture = new Texture({
        width: 1,
        height: 1,
        data: new Uint8Array([51, 153, 230, 255]),
        colorSpace: "srgb",
        label: "webgpu-parity-rgba8-texture"
      });
      const parityTextureBinding = new TextureBinding({
        name: "u_texture",
        texture: parityTexture,
        sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }),
        expectedColorSpace: "srgb",
        required: true
      });
      const webglTextureCanvas = document.createElement("canvas");
      webglTextureCanvas.width = 32;
      webglTextureCanvas.height = 32;
      document.body.append(webglTextureCanvas);
      const webglTextureDevice = await createRenderDevice({ backend: "webgl2", canvas: webglTextureCanvas, preserveDrawingBuffer: true });
      const webglTextureShader = webglTextureDevice.createShaderProgram(textureShader);
      const webglTextureTarget = webglTextureDevice.createRenderTarget({ width: 32, height: 32, label: "webgpu-parity-webgl2-texture-target" });
      const webglTexturedBuffer = webglTextureDevice.createBuffer("vertex", texturedVertices.byteLength, texturedVertices);
      webglTextureDevice.setRenderTarget(webglTextureTarget);
      webglTextureDevice.beginFrame(32, 32);
      webglTextureDevice.clear([0, 0, 0, 1]);
      webglTextureDevice.draw({
        label: "webgpu-parity-webgl2-textured-triangle",
        topology: "triangles",
        vertexBuffer: webglTexturedBuffer,
        vertexFormat: VertexFormat.P3N3T2,
        vertexCount: 3,
        shader: webglTextureShader,
        uniforms: new Map([["u_texture", parityTextureBinding]])
      });
      const webglTexturePixel = Array.from(webglTextureDevice.readPixels(16, 16, 1, 1));
      webglTextureDevice.endFrame();
      webglTextureDevice.dispose();

      const morphShader = {
        label: "webgpu-parity-morph",
        marker: "@galileo3d-shader:webgpu-parity-morph",
        vertex: `#version 300 es
// @galileo3d-shader:webgpu-parity-morph
precision highp float;
layout(location = 0) in vec3 position;
uniform vec4 u_morphPositionDeltas[256];
uniform vec4 u_morphWeights;
uniform float u_morphTargetCount;
void main() {
  int vertexIndex = clamp(gl_VertexID, 0, 63);
  vec3 morphDelta = vec3(0.0);
  for (int target = 0; target < 4; target += 1) {
    if (float(target) < u_morphTargetCount) {
      morphDelta += u_morphPositionDeltas[target * 64 + vertexIndex].xyz * u_morphWeights[target];
    }
  }
  gl_Position = vec4(position + morphDelta, 1.0);
}
`,
        fragment: `#version 300 es
// @galileo3d-shader:webgpu-parity-morph
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  outColor = u_color;
}
`
      };
      const morphVertices = new Float32Array([
        -0.42, -0.56, 0,
        0.42, -0.56, 0,
        0, -0.18, 0
      ]);
      const morphDeltas = new Float32Array(4 * 64 * 4);
      morphDeltas[2 * 4 + 1] = 0.98;
      const morphWeights = new Float32Array([1, 0, 0, 0]);
      const morphUniforms = new Map([
        ["u_color", [0.74, 0.16, 0.88, 1]],
        ["u_morphPositionDeltas", morphDeltas],
        ["u_morphWeights", morphWeights],
        ["u_morphTargetCount", 1]
      ]);
      const webglMorphCanvas = document.createElement("canvas");
      webglMorphCanvas.width = 32;
      webglMorphCanvas.height = 32;
      document.body.append(webglMorphCanvas);
      const webglMorphDevice = await createRenderDevice({ backend: "webgl2", canvas: webglMorphCanvas, preserveDrawingBuffer: true });
      const webglMorphShader = webglMorphDevice.createShaderProgram(morphShader);
      const webglMorphTarget = webglMorphDevice.createRenderTarget({ width: 32, height: 32, label: "webgpu-parity-webgl2-morph-target" });
      const webglMorphBuffer = webglMorphDevice.createBuffer("vertex", morphVertices.byteLength, morphVertices);
      webglMorphDevice.setRenderTarget(webglMorphTarget);
      webglMorphDevice.beginFrame(32, 32);
      webglMorphDevice.clear([0, 0, 0, 1]);
      webglMorphDevice.draw({
        label: "webgpu-parity-webgl2-morph",
        topology: "triangles",
        vertexBuffer: webglMorphBuffer,
        vertexFormat: VertexFormat.P3,
        vertexCount: 3,
        shader: webglMorphShader,
        uniforms: morphUniforms
      });
      const webglMorphPixel = Array.from(webglMorphDevice.readPixels(16, 10, 1, 1));
      webglMorphDevice.endFrame();
      webglMorphDevice.dispose();

      const linePointShader = {
        label: "webgpu-parity-line-point",
        marker: "@galileo3d-shader:webgpu-parity-line-point",
        vertex: `#version 300 es
// @galileo3d-shader:webgpu-parity-line-point
precision highp float;
layout(location = 0) in vec3 position;
void main() {
  gl_Position = vec4(position, 1.0);
  gl_PointSize = 5.0;
}
`,
        fragment: `#version 300 es
// @galileo3d-shader:webgpu-parity-line-point
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  outColor = u_color;
}
`
      };
      const vertexColorFormat = new VertexFormat([
        { semantic: "position", components: 3, offset: 0 },
        { semantic: "color", components: 4, offset: 12 }
      ], 28);
      const vertexColorShader = {
        label: "webgpu-parity-vertex-color",
        marker: "@galileo3d-shader:webgpu-parity-vertex-color",
        vertex: `#version 300 es
// @galileo3d-shader:webgpu-parity-vertex-color
precision highp float;
layout(location = 0) in vec3 position;
layout(location = 4) in vec4 color;
out vec4 v_color;
void main() {
  v_color = color;
  gl_Position = vec4(position, 1.0);
}
`,
        fragment: `#version 300 es
// @galileo3d-shader:webgpu-parity-vertex-color
precision highp float;
uniform vec4 u_color;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = u_color * v_color;
}
`
      };
      const indexedVertices = new Float32Array([
        -0.75, -0.75, 0,
        0.75, -0.75, 0,
        0, 0.75, 0
      ]);
      const indexedIndices = new Uint16Array([0, 1, 2]);
      const lineVertices = new Float32Array([-0.75, 0, 0, 0.75, 0, 0]);
      const pointVertices = new Float32Array([0, 0, 0]);
      const vertexColorVertices = new Float32Array([
        -0.75, -0.75, 0, 0.25, 0.5, 1, 1,
        0.75, -0.75, 0, 0.25, 0.5, 1, 1,
        0, 0.75, 0, 0.25, 0.5, 1, 1
      ]);

      const webglTopologyCanvas = document.createElement("canvas");
      webglTopologyCanvas.width = 32;
      webglTopologyCanvas.height = 32;
      document.body.append(webglTopologyCanvas);
      const webglTopologyDevice = await createRenderDevice({ backend: "webgl2", canvas: webglTopologyCanvas, preserveDrawingBuffer: true });
      const webglTopologyParityShader = webglTopologyDevice.createShaderProgram(parityShader);
      const webglTopologyShader = webglTopologyDevice.createShaderProgram(linePointShader);
      const webglVertexColorShader = webglTopologyDevice.createShaderProgram(vertexColorShader);
      const webglTopologyTarget = webglTopologyDevice.createRenderTarget({ width: 32, height: 32, label: "webgpu-parity-webgl2-topology-target" });
      const webglIndexedBuffer = webglTopologyDevice.createBuffer("vertex", indexedVertices.byteLength, indexedVertices);
      const webglIndexBuffer = webglTopologyDevice.createBuffer("index", indexedIndices.byteLength, indexedIndices);
      const webglLineBuffer = webglTopologyDevice.createBuffer("vertex", lineVertices.byteLength, lineVertices);
      const webglPointBuffer = webglTopologyDevice.createBuffer("vertex", pointVertices.byteLength, pointVertices);
      const webglVertexColorBuffer = webglTopologyDevice.createBuffer("vertex", vertexColorVertices.byteLength, vertexColorVertices);
      webglTopologyDevice.setRenderTarget(webglTopologyTarget);
      webglTopologyDevice.beginFrame(32, 32);
      webglTopologyDevice.clear([0, 0, 0, 1]);
      webglTopologyDevice.draw({
        label: "webgpu-parity-webgl2-indexed",
        topology: "triangles",
        vertexBuffer: webglIndexedBuffer,
        vertexFormat: VertexFormat.P3,
        vertexCount: 3,
        indexBuffer: webglIndexBuffer,
        indexType: "uint16",
        indexCount: 3,
        shader: webglTopologyParityShader,
        uniforms: new Map([["u_color", [0.35, 0.9, 0.25, 1]]])
      });
      const webglIndexedPixel = Array.from(webglTopologyDevice.readPixels(16, 16, 1, 1));
      webglTopologyDevice.clear([0, 0, 0, 1]);
      webglTopologyDevice.draw({
        label: "webgpu-parity-webgl2-line",
        topology: "lines",
        vertexBuffer: webglLineBuffer,
        vertexFormat: VertexFormat.P3,
        vertexCount: 2,
        shader: webglTopologyShader,
        uniforms: new Map([["u_color", [0.2, 1, 0.4, 1]]])
      });
      const webglLinePixel = Array.from(firstNonBlackPixel(webglTopologyDevice.readPixels(14, 14, 5, 5)));
      webglTopologyDevice.clear([0, 0, 0, 1]);
      webglTopologyDevice.draw({
        label: "webgpu-parity-webgl2-point",
        topology: "points",
        vertexBuffer: webglPointBuffer,
        vertexFormat: VertexFormat.P3,
        vertexCount: 1,
        shader: webglTopologyShader,
        uniforms: new Map([["u_color", [1, 0.82, 0.2, 1]]])
      });
      const webglPointPixel = Array.from(webglTopologyDevice.readPixels(16, 16, 1, 1));
      webglTopologyDevice.clear([0, 0, 0, 1]);
      webglTopologyDevice.draw({
        label: "webgpu-parity-webgl2-vertex-color",
        topology: "triangles",
        vertexBuffer: webglVertexColorBuffer,
        vertexFormat: vertexColorFormat,
        vertexCount: 3,
        shader: webglVertexColorShader,
        uniforms: new Map([["u_color", [1, 1, 1, 1]]])
      });
      const webglVertexColorPixel = Array.from(webglTopologyDevice.readPixels(16, 16, 1, 1));
      webglTopologyDevice.endFrame();
      webglTopologyDevice.dispose();

      const renderDevice = await createRenderDevice({ backend: "webgpu", webgpu: createRenderWebGPU() });
      const shader = renderDevice.createShaderProgram(parityShader);
      const webgpuTextureShader = renderDevice.createShaderProgram(textureShader);
      const webgpuMorphShader = renderDevice.createShaderProgram(morphShader);
      const webgpuTopologyShader = renderDevice.createShaderProgram(linePointShader);
      const webgpuVertexColorShader = renderDevice.createShaderProgram(vertexColorShader);
      const target = renderDevice.createRenderTarget({ width: 32, height: 32, label: "webgpu-parity-target" });
      const triangleBuffer = renderDevice.createBuffer("vertex", 36, triangleVertices);
      const texturedBuffer = renderDevice.createBuffer("vertex", texturedVertices.byteLength, texturedVertices);
      const morphBuffer = renderDevice.createBuffer("vertex", morphVertices.byteLength, morphVertices);
      const indexedBuffer = renderDevice.createBuffer("vertex", indexedVertices.byteLength, indexedVertices);
      const indexBuffer = renderDevice.createBuffer("index", indexedIndices.byteLength, indexedIndices);
      const lineBuffer = renderDevice.createBuffer("vertex", lineVertices.byteLength, lineVertices);
      const pointBuffer = renderDevice.createBuffer("vertex", pointVertices.byteLength, pointVertices);
      const vertexColorBuffer = renderDevice.createBuffer("vertex", vertexColorVertices.byteLength, vertexColorVertices);
      const instancedBuffer = renderDevice.createBuffer("vertex", 36, new Float32Array([
        -0.2, -0.25, 0,
        0.2, -0.25, 0,
        0, 0.25, 0
      ]));
      const instanceMatrices = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        -0.45, 0, 0, 1,
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0.45, 0, 0, 1
      ]);

      renderDevice.setRenderTarget(target);
      renderDevice.beginFrame(32, 32);
      renderDevice.clear([0, 0, 0, 1]);
      renderDevice.draw({
        label: "webgpu-parity-triangle",
        topology: "triangles",
        vertexBuffer: triangleBuffer,
        vertexFormat: VertexFormat.P3,
        vertexCount: 3,
        shader,
        uniforms: new Map([["u_color", [0.1, 0.8, 0.2, 1]]])
      });
      const triangleCenter = Array.from(renderDevice.readPixels(16, 16, 1, 1));
      const renderTargetReadback = Array.from(renderDevice.readPixels(16, 16, 1, 1));
      renderDevice.clear([0, 0, 0, 1]);
      renderDevice.draw({
        label: "webgpu-parity-instancing",
        topology: "triangles",
        vertexBuffer: instancedBuffer,
        vertexFormat: VertexFormat.P3,
        vertexCount: 3,
        instanceCount: 2,
        shader,
        uniforms: new Map([
          ["u_color", [0.9, 0.25, 0.1, 1]],
          ["u_instanceMatrices", instanceMatrices],
          ["u_instanceCount", 2]
        ])
      });
      const instancedLeft = Array.from(renderDevice.readPixels(9, 16, 1, 1));
      const instancedRight = Array.from(renderDevice.readPixels(22, 16, 1, 1));
      renderDevice.clear([0, 0, 0, 1]);
      renderDevice.draw({
        label: "webgpu-parity-textured-triangle",
        topology: "triangles",
        vertexBuffer: texturedBuffer,
        vertexFormat: VertexFormat.P3N3T2,
        vertexCount: 3,
        shader: webgpuTextureShader,
        uniforms: new Map([["u_texture", parityTextureBinding]])
      });
      const texturePixel = Array.from(renderDevice.readPixels(16, 16, 1, 1));
      renderDevice.clear([0, 0, 0, 1]);
      renderDevice.draw({
        label: "webgpu-parity-morph",
        topology: "triangles",
        vertexBuffer: morphBuffer,
        vertexFormat: VertexFormat.P3,
        vertexCount: 3,
        shader: webgpuMorphShader,
        uniforms: morphUniforms
      });
      const morphPixel = Array.from(renderDevice.readPixels(16, 10, 1, 1));
      renderDevice.clear([0, 0, 0, 1]);
      renderDevice.draw({
        label: "webgpu-parity-indexed",
        topology: "triangles",
        vertexBuffer: indexedBuffer,
        vertexFormat: VertexFormat.P3,
        vertexCount: 3,
        indexBuffer,
        indexType: "uint16",
        indexCount: 3,
        shader,
        uniforms: new Map([["u_color", [0.35, 0.9, 0.25, 1]]])
      });
      const indexedPixel = Array.from(renderDevice.readPixels(16, 16, 1, 1));
      renderDevice.clear([0, 0, 0, 1]);
      renderDevice.draw({
        label: "webgpu-parity-line",
        topology: "lines",
        vertexBuffer: lineBuffer,
        vertexFormat: VertexFormat.P3,
        vertexCount: 2,
        shader: webgpuTopologyShader,
        uniforms: new Map([["u_color", [0.2, 1, 0.4, 1]]])
      });
      const linePixel = Array.from(firstNonBlackPixel(renderDevice.readPixels(14, 14, 5, 5)));
      renderDevice.clear([0, 0, 0, 1]);
      renderDevice.draw({
        label: "webgpu-parity-point",
        topology: "points",
        vertexBuffer: pointBuffer,
        vertexFormat: VertexFormat.P3,
        vertexCount: 1,
        shader: webgpuTopologyShader,
        uniforms: new Map([["u_color", [1, 0.82, 0.2, 1]]])
      });
      const pointPixel = Array.from(renderDevice.readPixels(16, 16, 1, 1));
      renderDevice.clear([0, 0, 0, 1]);
      renderDevice.draw({
        label: "webgpu-parity-vertex-color",
        topology: "triangles",
        vertexBuffer: vertexColorBuffer,
        vertexFormat: vertexColorFormat,
        vertexCount: 3,
        shader: webgpuVertexColorShader,
        uniforms: new Map([["u_color", [1, 1, 1, 1]]])
      });
      const vertexColorPixel = Array.from(renderDevice.readPixels(16, 16, 1, 1));
      const renderDiagnostics = renderDevice.getDiagnostics();
      renderDevice.dispose();

      const particleInput = {
        count: 3,
        deltaTime: 0.25,
        positions: new Float32Array([0, 1, 2, 0, 10, 20, 30, 0, -2, -4, -6, 0]),
        velocities: new Float32Array([4, 8, 12, 0, -4, -8, -12, 0, 1, 2, 3, 0]),
        accelerations: new Float32Array([0, -4, 0, 0, 2, 0, -2, 0, -1, 1, 0, 0])
      };
      const particleBackend = new WebGPUParticleBackend({ gpu: createParticleWebGPU() });
      const particleUpdate = await particleBackend.update(particleInput);
      particleBackend.dispose();
      const expectedParticles = cpuParticleUpdate(particleInput);
      const maxParticleDelta = maxAbsDelta(particleUpdate.positions, expectedParticles.positions);
      const maxVelocityDelta = maxAbsDelta(particleUpdate.velocities, expectedParticles.velocities);

      const navigatorProbe = await probeNavigatorWebGPU();
      const realHardwareRender = await tryRealHardwareWebGPURender();
      const realHardwarePbrForwardPass = await tryRealHardwarePbrForwardPass();
      const realHardwareTexturedPbrForwardPass = await tryRealHardwareTexturedPbrForwardPass();
      const realHardwareEnvironmentPbrForwardPass = await tryRealHardwareEnvironmentPbrForwardPass();
      const realHardwareInstancedPbrForwardPass = await tryRealHardwareInstancedPbrForwardPass();
      const realHardwareSkinnedForwardPass = await tryRealHardwareSkinnedForwardPass();
      const realHardwareMorphForwardPass = await tryRealHardwareMorphForwardPass();
      const realHardwareShadowMapForwardPass = await tryRealHardwareShadowMapForwardPass();
      const nativeWebGPUMaterialWgslPbrShader = await tryNativeWebGPUMaterialWgslPbrShader();
      const realHardwareHdrRenderTargetPostprocess = await tryRealHardwareHdrRenderTargetPostprocess();
      const realHardwareRendererAsyncPostprocess = await tryRealHardwareRendererAsyncPostprocess();
      const realHardwareParticles = await tryRealHardwareParticleCompute();

      return {
        webglTriangleCenter,
        webglDiagnostics,
        triangleCenter,
        renderTargetReadback,
        instancedLeft,
        instancedRight,
        webglTexturePixel,
        texturePixel,
        webglMorphPixel,
        morphPixel,
        webglIndexedPixel,
        indexedPixel,
        webglLinePixel,
        linePixel,
        webglPointPixel,
        pointPixel,
        webglVertexColorPixel,
        vertexColorPixel,
        renderDiagnostics,
        particleUpdate: {
          count: particleUpdate.count,
          workgroups: particleUpdate.workgroups,
          positions: Array.from(particleUpdate.positions),
          velocities: Array.from(particleUpdate.velocities),
          maxParticleDelta,
          maxVelocityDelta
        },
        expectedParticles: {
          positions: Array.from(expectedParticles.positions),
          velocities: Array.from(expectedParticles.velocities)
        },
        navigatorProbe,
        realHardwareRender,
        realHardwarePbrForwardPass,
        realHardwareTexturedPbrForwardPass,
        realHardwareEnvironmentPbrForwardPass,
        realHardwareInstancedPbrForwardPass,
        realHardwareSkinnedForwardPass,
        realHardwareMorphForwardPass,
        realHardwareShadowMapForwardPass,
        nativeWebGPUMaterialWgslPbrShader,
        realHardwareHdrRenderTargetPostprocess,
        realHardwareRendererAsyncPostprocess,
        realHardwareParticles
      };

      async function tryRealHardwareWebGPURender() {
        if (navigatorProbe.adapterStatus !== "available") {
          return {
            status: "unsupported" as const,
            reason: "navigator.gpu.requestAdapter did not return a real adapter"
          };
        }
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        document.body.append(canvas);
        try {
          const device = await createRenderDevice({ backend: "webgpu", canvas });
          const shader = device.createShaderProgram(parityShader);
          const textureShaderProgram = device.createShaderProgram(textureShader);
          const morphShaderProgram = device.createShaderProgram(morphShader);
          const topologyShaderProgram = device.createShaderProgram(linePointShader);
          const vertexColorShaderProgram = device.createShaderProgram(vertexColorShader);
          const target = device.createRenderTarget({ width: 32, height: 32, label: "webgpu-real-hardware-parity-target" });
          const buffer = device.createBuffer("vertex", 36, triangleVertices);
          const textureBuffer = device.createBuffer("vertex", texturedVertices.byteLength, texturedVertices);
          const morphRenderBuffer = device.createBuffer("vertex", morphVertices.byteLength, morphVertices);
          const indexedRenderBuffer = device.createBuffer("vertex", indexedVertices.byteLength, indexedVertices);
          const indexRenderBuffer = device.createBuffer("index", indexedIndices.byteLength, indexedIndices);
          const lineRenderBuffer = device.createBuffer("vertex", lineVertices.byteLength, lineVertices);
          const pointRenderBuffer = device.createBuffer("vertex", pointVertices.byteLength, pointVertices);
          const vertexColorRenderBuffer = device.createBuffer("vertex", vertexColorVertices.byteLength, vertexColorVertices);
          const instanceBuffer = device.createBuffer("vertex", 36, new Float32Array([
            -0.2, -0.25, 0,
            0.2, -0.25, 0,
            0, 0.25, 0
          ]));
          device.setRenderTarget(target);
          device.beginFrame(32, 32);
          device.clear([0, 0, 0, 1]);
          device.draw({
            label: "webgpu-real-hardware-triangle",
            topology: "triangles",
            vertexBuffer: buffer,
            vertexFormat: VertexFormat.P3,
            vertexCount: 3,
            shader,
            uniforms: new Map([["u_color", [0.1, 0.8, 0.2, 1]]])
          });
          const pixel = Array.from(device.readPixels(16, 16, 1, 1));
          const nativeReadbackPixel = device.readPixelsAsync ? Array.from(await device.readPixelsAsync(16, 16, 1, 1)) : [];
          device.clear([0, 0, 0, 1]);
          device.draw({
            label: "webgpu-real-hardware-instancing",
            topology: "triangles",
            vertexBuffer: instanceBuffer,
            vertexFormat: VertexFormat.P3,
            vertexCount: 3,
            instanceCount: 2,
            shader,
            uniforms: new Map([
              ["u_color", [0.9, 0.25, 0.1, 1]],
              ["u_instanceMatrices", instanceMatrices],
              ["u_instanceCount", 2]
            ])
          });
          const instancedPixelLeft = Array.from(device.readPixels(9, 16, 1, 1));
          const instancedPixelRight = Array.from(device.readPixels(22, 16, 1, 1));
          device.clear([0, 0, 0, 1]);
          device.draw({
            label: "webgpu-real-hardware-textured-triangle",
            topology: "triangles",
            vertexBuffer: textureBuffer,
            vertexFormat: VertexFormat.P3N3T2,
            vertexCount: 3,
            shader: textureShaderProgram,
            uniforms: new Map([["u_texture", parityTextureBinding]])
          });
          const texturePixel = Array.from(device.readPixels(16, 16, 1, 1));
          const nativeTextureReadbackPixel = device.readPixelsAsync ? Array.from(await device.readPixelsAsync(16, 16, 1, 1)) : [];
          device.clear([0, 0, 0, 1]);
          device.draw({
            label: "webgpu-real-hardware-morph",
            topology: "triangles",
            vertexBuffer: morphRenderBuffer,
            vertexFormat: VertexFormat.P3,
            vertexCount: 3,
            shader: morphShaderProgram,
            uniforms: morphUniforms
          });
          const morphPixel = Array.from(device.readPixels(16, 10, 1, 1));
          device.clear([0, 0, 0, 1]);
          device.draw({
            label: "webgpu-real-hardware-indexed",
            topology: "triangles",
            vertexBuffer: indexedRenderBuffer,
            vertexFormat: VertexFormat.P3,
            vertexCount: 3,
            indexBuffer: indexRenderBuffer,
            indexType: "uint16",
            indexCount: 3,
            shader,
            uniforms: new Map([["u_color", [0.35, 0.9, 0.25, 1]]])
          });
          const indexedPixel = Array.from(device.readPixels(16, 16, 1, 1));
          device.clear([0, 0, 0, 1]);
          device.draw({
            label: "webgpu-real-hardware-line",
            topology: "lines",
            vertexBuffer: lineRenderBuffer,
            vertexFormat: VertexFormat.P3,
            vertexCount: 2,
            shader: topologyShaderProgram,
            uniforms: new Map([["u_color", [0.2, 1, 0.4, 1]]])
          });
          const linePixel = Array.from(firstNonBlackPixel(device.readPixels(14, 14, 5, 5)));
          device.clear([0, 0, 0, 1]);
          device.draw({
            label: "webgpu-real-hardware-point",
            topology: "points",
            vertexBuffer: pointRenderBuffer,
            vertexFormat: VertexFormat.P3,
            vertexCount: 1,
            shader: topologyShaderProgram,
            uniforms: new Map([["u_color", [1, 0.82, 0.2, 1]]])
          });
          const pointPixel = Array.from(device.readPixels(16, 16, 1, 1));
          device.clear([0, 0, 0, 1]);
          device.draw({
            label: "webgpu-real-hardware-vertex-color",
            topology: "triangles",
            vertexBuffer: vertexColorRenderBuffer,
            vertexFormat: vertexColorFormat,
            vertexCount: 3,
            shader: vertexColorShaderProgram,
            uniforms: new Map([["u_color", [1, 1, 1, 1]]])
          });
          const vertexColorPixel = Array.from(device.readPixels(16, 16, 1, 1));
          device.endFrame();
          const diagnostics = device.getDiagnostics();
          const info = device.info;
          const featureChecks = {
            triangleRaster: pixelsEqual(pixel, [26, 204, 51, 255]),
            indexedDraws: pixelsClose(indexedPixel, webglIndexedPixel, 1) && nonBlack(indexedPixel),
            lineTopology: pixelsClose(linePixel, webglLinePixel, 1) && nonBlack(linePixel),
            pointTopology: pixelsClose(pointPixel, webglPointPixel, 1) && nonBlack(pointPixel),
            vertexColors: pixelsClose(vertexColorPixel, webglVertexColorPixel, 1) && nonBlack(vertexColorPixel),
            instancing: pixelsEqual(instancedPixelLeft, [230, 64, 26, 255]) && pixelsEqual(instancedPixelRight, [230, 64, 26, 255]),
            texturedMaterial: pixelsEqual(texturePixel, [8, 81, 202, 255]),
            nativeTextureBinding: pixelsEqual(nativeTextureReadbackPixel, [8, 81, 202, 255]) && Number(diagnostics.nativeTextureBindings ?? 0) >= 1,
            morphTargets: pixelsEqual(morphPixel, [189, 41, 224, 255]),
            renderTargetReadback: pixelsEqual(pixel, [26, 204, 51, 255]),
            nativeTextureToBufferReadback: pixelsEqual(nativeReadbackPixel, [26, 204, 51, 255]),
            webgl2Conformance:
              pixelsEqual(pixel, webglTriangleCenter) &&
              pixelsClose(indexedPixel, webglIndexedPixel, 1) &&
              pixelsClose(linePixel, webglLinePixel, 1) &&
              pixelsClose(pointPixel, webglPointPixel, 1) &&
              pixelsClose(vertexColorPixel, webglVertexColorPixel, 1) &&
              pixelsEqual(texturePixel, webglTexturePixel) &&
              pixelsEqual(morphPixel, webglMorphPixel)
          };
          const nativeSubmissionEvidence = {
            nativeSubmissions: Number(diagnostics.nativeSubmissions ?? 0),
            nativeTextureBindings: Number(diagnostics.nativeTextureBindings ?? 0),
            canvasSubmissions: Number(diagnostics.canvasSubmissions ?? 0),
            hasNativeRenderPipeline: info.capabilities?.includes("native-render-pipeline") === true,
            cpuShadowedReadback: info.limitations?.some((limitation) => limitation.includes("CPU-shadowed readback")) === true
          };
          device.dispose();
          return {
            status: Object.values(featureChecks).every(Boolean) && nativeSubmissionEvidence.nativeSubmissions >= 8 ? "pass" as const : "unsupported" as const,
            pixel,
            nativeReadbackPixel,
            nativeTextureReadbackPixel,
            instancedPixelLeft,
            instancedPixelRight,
            texturePixel,
            morphPixel,
            indexedPixel,
            linePixel,
            pointPixel,
            vertexColorPixel,
            webglReference: {
              trianglePixel: webglTriangleCenter,
              indexedPixel: webglIndexedPixel,
              linePixel: webglLinePixel,
              pointPixel: webglPointPixel,
              vertexColorPixel: webglVertexColorPixel,
              texturePixel: webglTexturePixel,
              morphPixel: webglMorphPixel
            },
            featureChecks,
            nativeSubmissionEvidence,
            diagnostics,
            renderer: info.renderer,
            capabilities: info.capabilities ?? [],
            limitations: info.limitations ?? []
          };
        } catch (error) {
          return {
            status: "unsupported" as const,
            reason: error instanceof Error ? error.message : String(error)
          };
        }
      }

      async function tryRealHardwareParticleCompute() {
        if (navigatorProbe.adapterStatus !== "available" || !(navigator as Navigator & { gpu?: unknown }).gpu) {
          return {
            status: "unsupported" as const,
            reason: "navigator.gpu.requestAdapter did not return a real adapter"
          };
        }
        try {
          const backend = new WebGPUParticleBackend({ gpu: (navigator as Navigator & { gpu: unknown }).gpu });
          const update = await backend.update(particleInput);
          backend.dispose();
          const maxParticleDelta = maxAbsDelta(update.positions, expectedParticles.positions);
          const maxVelocityDelta = maxAbsDelta(update.velocities, expectedParticles.velocities);
          return {
            status: maxParticleDelta <= 1e-7 && maxVelocityDelta <= 1e-7 ? "pass" as const : "unsupported" as const,
            count: update.count,
            workgroups: update.workgroups,
            maxParticleDelta,
            maxVelocityDelta,
            positions: Array.from(update.positions),
            velocities: Array.from(update.velocities)
          };
        } catch (error) {
          return {
            status: "unsupported" as const,
            reason: error instanceof Error ? error.message : String(error)
          };
        }
      }

      async function tryRealHardwarePbrForwardPass() {
        if (navigatorProbe.adapterStatus !== "available") {
          return {
            status: "unsupported" as const,
            reason: "navigator.gpu.requestAdapter did not return a real adapter"
          };
        }
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 48;
        document.body.append(canvas);
        try {
          const renderer = await Renderer.create({ backend: "webgpu", canvas, width: canvas.width, height: canvas.height, clearColor: [0, 0, 0, 1] });
          const target = renderer.device.createRenderTarget({ width: 48, height: 48, label: "real-webgpu-pbr-forward-pass-target" });
          const diagnostics = renderer.render({
            renderItems: [{
              geometry: Geometry.litTriangle(),
              material: new PBRMaterial({
                name: "real-webgpu-pbr-forward-pass",
                baseColor: [0.42, 0.78, 0.58, 1],
                metallic: 0.18,
                roughness: 0.34
              }),
              label: "real-webgpu-pbr-forward-pass"
            }],
            renderTarget: target
          });
          const nativePixels = renderer.device.readPixelsAsync ? await renderer.device.readPixelsAsync(0, 0, 48, 48) : new Uint8Array();
          const nativePixel = Array.from(firstNonBlackPixel(nativePixels));
          const nativeLuminance = rgbLuminance(nativePixel);
          const info = renderer.device.info;
          renderer.dispose();
          const nativePbrShaderBound = Number(diagnostics.nativePbrSubmissions ?? 0) >= 1;
          return {
            status: diagnostics.drawCalls >= 1 && nativePbrShaderBound && nativeLuminance > 8 ? "pass" as const : "unsupported" as const,
            diagnostics,
            nativePbrShaderBound,
            nativePixel,
            nativeLuminance,
            nativeReadback: nativePixels.length,
            reason: nativePbrShaderBound && nativeLuminance > 8 ? undefined : "High-level WebGPU PBR must produce nonblack native texture-to-buffer readback, not just CPU-shadowed synchronous pixels.",
            renderer: info.renderer,
            capabilities: info.capabilities ?? [],
            limitations: info.limitations ?? []
          };
        } catch (error) {
          return {
            status: "unsupported" as const,
            reason: error instanceof Error ? error.message : String(error)
          };
        }
      }

      async function tryRealHardwareTexturedPbrForwardPass() {
        if (navigatorProbe.adapterStatus !== "available") {
          return {
            status: "unsupported" as const,
            reason: "navigator.gpu.requestAdapter did not return a real adapter"
          };
        }
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 48;
        document.body.append(canvas);
        try {
          const renderer = await Renderer.create({ backend: "webgpu", canvas, width: canvas.width, height: canvas.height, clearColor: [0, 0, 0, 1] });
          const baseColorTexture = new Texture({
            width: 2,
            height: 2,
            data: new Uint8Array([
              72, 176, 224, 255,
              96, 196, 128, 255,
              232, 180, 68, 255,
              180, 96, 220, 255
            ]),
            colorSpace: "srgb",
            label: "real-webgpu-textured-pbr-base-color"
          });
          const material = new TexturedPBRMaterial({
            name: "real-webgpu-textured-pbr-forward-pass",
            baseColor: [1, 1, 1, 1],
            baseColorTexture,
            metallic: 0.22,
            roughness: 0.42
          });
          const baseColorBinding = material.getParameter("u_baseColorTexture");
          const textureBindingValidated = baseColorBinding instanceof TextureBinding && baseColorBinding.validate().ok === true;
          const target = renderer.device.createRenderTarget({ width: 48, height: 48, label: "real-webgpu-textured-pbr-forward-pass-target" });
          const diagnostics = renderer.render({
            renderItems: [{
              geometry: Geometry.texturedCube(0.6),
              material,
              label: "real-webgpu-textured-pbr-forward-pass"
            }],
            renderTarget: target
          });
          const nativePixels = renderer.device.readPixelsAsync ? await renderer.device.readPixelsAsync(0, 0, 48, 48) : new Uint8Array();
          const nativePixel = Array.from(firstNonBlackPixel(nativePixels));
          const nativeLuminance = rgbLuminance(nativePixel);
          const info = renderer.device.info;
          renderer.dispose();
          const nativeTexturedPbrShaderBound = Number(diagnostics.nativePbrSubmissions ?? 0) >= 1 && Number(diagnostics.nativeTextureBindings ?? 0) >= 1;
          return {
            status: diagnostics.drawCalls >= 1 && textureBindingValidated && nativeTexturedPbrShaderBound && nativeLuminance > 8 ? "pass" as const : "unsupported" as const,
            diagnostics,
            textureBindingValidated,
            nativeTexturedPbrShaderBound,
            nativePixel,
            nativeLuminance,
            nativeReadback: nativePixels.length,
            reason: nativeTexturedPbrShaderBound && nativeLuminance > 8 ? undefined : "High-level WebGPU textured PBR must produce nonblack native texture-to-buffer readback with native sampled texture binding.",
            textureLabel: baseColorTexture.label,
            renderer: info.renderer,
            capabilities: info.capabilities ?? [],
            limitations: info.limitations ?? []
          };
        } catch (error) {
          return {
            status: "unsupported" as const,
            reason: error instanceof Error ? error.message : String(error)
          };
        }
      }

      async function tryRealHardwareEnvironmentPbrForwardPass() {
        if (navigatorProbe.adapterStatus !== "available") {
          return {
            status: "unsupported" as const,
            reason: "navigator.gpu.requestAdapter did not return a real adapter"
          };
        }
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 48;
        document.body.append(canvas);
        try {
          const renderer = await Renderer.create({ backend: "webgpu", canvas, width: canvas.width, height: canvas.height, clearColor: [0, 0, 0, 1] });
          const lightingBundle = createV4EnvironmentLighting("studio");
          const target = renderer.device.createRenderTarget({ width: 48, height: 48, label: "real-webgpu-environment-pbr-forward-pass-target" });
          const diagnostics = renderer.render({
            renderItems: [{
              geometry: Geometry.litCube(0.55),
              material: new PBRMaterial({
                name: "real-webgpu-environment-pbr-forward-pass",
                baseColor: [0.72, 0.64, 0.48, 1],
                metallic: 0.64,
                roughness: 0.28
              }),
              label: "real-webgpu-environment-pbr-forward-pass"
            }],
            environmentLighting: lightingBundle.lighting,
            renderTarget: target
          });
          const nativePixels = renderer.device.readPixelsAsync ? await renderer.device.readPixelsAsync(0, 0, 48, 48) : new Uint8Array();
          const nativePixel = Array.from(firstNonBlackPixel(nativePixels));
          const nativeLuminance = rgbLuminance(nativePixel);
          const info = renderer.device.info;
          renderer.dispose();
          const resourcesValidated = lightingBundle.resources.validation.environmentTexture === true &&
            lightingBundle.resources.validation.brdfLutTexture === true &&
            lightingBundle.resources.validation.specularMipLevels === true &&
            lightingBundle.resources.validation.diffuseIrradiance === true;
          const nativeEnvironmentPbrShaderBound = Number(diagnostics.nativePbrSubmissions ?? 0) >= 1 && Number(diagnostics.nativeEnvironmentBindings ?? 0) >= 2;
          return {
            status: diagnostics.drawCalls >= 1 && resourcesValidated && nativeEnvironmentPbrShaderBound && nativeLuminance > 8 ? "pass" as const : "unsupported" as const,
            diagnostics,
            resourcesValidated,
            nativeEnvironmentPbrShaderBound,
            nativePixel,
            nativeLuminance,
            nativeReadback: nativePixels.length,
            reason: nativeEnvironmentPbrShaderBound && nativeLuminance > 8 ? undefined : "Generated environment resources must affect native WebGPU texture-to-buffer readback, not just validate CPU-side resource metadata.",
            resourceSet: lightingBundle.resources.resourceSet,
            specularMipCount: lightingBundle.resources.specularMipCount,
            renderer: info.renderer,
            capabilities: info.capabilities ?? [],
            limitations: info.limitations ?? []
          };
        } catch (error) {
          return {
            status: "unsupported" as const,
            reason: error instanceof Error ? error.message : String(error)
          };
        }
      }

      async function tryRealHardwareShadowMapForwardPass() {
        if (navigatorProbe.adapterStatus !== "available") {
          return {
            status: "unsupported" as const,
            reason: "navigator.gpu.requestAdapter did not return a real adapter"
          };
        }
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 48;
        document.body.append(canvas);
        try {
          const renderer = await Renderer.create({ backend: "webgpu", canvas, width: canvas.width, height: canvas.height, clearColor: [0, 0, 0, 1] });
          const target = renderer.device.createRenderTarget({ width: 48, height: 48, label: "real-webgpu-forward-shadow-map-target" });
          const material = new PBRMaterial({
            name: "real-webgpu-shadow-map-forward-pass",
            baseColor: [0.82, 0.72, 0.42, 1],
            metallic: 0.08,
            roughness: 0.42,
            environmentColor: [0.12, 0.1, 0.08],
            environmentIntensity: 0.15
          });
          const item = { geometry: Geometry.litTriangle(), material, label: "real-webgpu-shadow-map-forward-pass" };
          const collectedLights = [{
            kind: "directional" as const,
            color: [1, 0.94, 0.78] as const,
            intensity: 3.6,
            position: [0, 0, 1] as const,
            direction: [0, 0, -1] as const,
            range: 0,
            spotAngle: 0,
            penumbra: 0,
            castsShadow: true,
            layerMask: 0xffffffff,
            source: {} as never
          }];
          const shadowTexture = new Texture({
            width: 1,
            height: 1,
            data: new Uint8Array([
              0, 0, 0, 255
            ]),
            colorSpace: "linear",
            label: "real-webgpu-forward-shadow-map-texture"
          });
          const shadowBinding = new TextureBinding({
            name: "u_shadowMapTexture",
            texture: shadowTexture,
            sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
            expectedColorSpace: "linear",
            required: true
          });
          const litDiagnostics = renderer.render({ renderItems: [item], collectedLights, renderTarget: target });
          const litNativePixels = renderer.device.readPixelsAsync ? await renderer.device.readPixelsAsync(0, 0, 48, 48) : new Uint8Array();
          const litPixel = Array.from(firstNonBlackPixel(litNativePixels));
          const shadowDiagnostics = renderer.render({
            renderItems: [item],
            collectedLights,
            renderTarget: target,
            shadowMap: {
              texture: shadowBinding,
              lightMatrix: new Float32Array([
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1
              ]),
              strength: 0.85,
              bias: 0,
              texelSize: [1, 1]
            }
          });
          const shadowedNativePixels = renderer.device.readPixelsAsync ? await renderer.device.readPixelsAsync(0, 0, 48, 48) : new Uint8Array();
          const shadowedPixel = Array.from(firstNonBlackPixel(shadowedNativePixels));
          const diagnostics = renderer.device.getDiagnostics();
          const info = renderer.device.info;
          renderer.dispose();
          const litLuminance = rgbLuminance(litPixel);
          const shadowedLuminance = rgbLuminance(shadowedPixel);
          const shadowBindingValidated = shadowBinding.validate().ok === true;
          const nativeShadowMapShaderBound = Number(diagnostics.nativePbrSubmissions ?? 0) >= 1 && Number(diagnostics.nativeShadowMapBindings ?? 0) >= 1;
          return {
            status: litDiagnostics.drawCalls >= 1 &&
              shadowDiagnostics.drawCalls >= 1 &&
              shadowBindingValidated &&
              nativeShadowMapShaderBound &&
              litLuminance > 8 &&
              shadowedLuminance < litLuminance * 0.92
              ? "pass" as const
              : "unsupported" as const,
            litPixel,
            shadowedPixel,
            litLuminance,
            shadowedLuminance,
            litNativeReadback: litNativePixels.length,
            shadowedNativeReadback: shadowedNativePixels.length,
            shadowBindingValidated,
            nativeShadowMapShaderBound,
            reason: nativeShadowMapShaderBound && litLuminance > 8 && shadowedLuminance < litLuminance * 0.92 ? undefined : "Shadow-map texture must darken native WebGPU texture-to-buffer readback, not CPU-shadowed fallback pixels.",
            litDiagnostics,
            shadowDiagnostics,
            diagnostics,
            renderer: info.renderer,
            capabilities: info.capabilities ?? [],
            limitations: info.limitations ?? []
          };
        } catch (error) {
          return {
            status: "unsupported" as const,
            reason: error instanceof Error ? error.message : String(error)
          };
        }
      }

      async function tryNativeWebGPUMaterialWgslPbrShader() {
        if (navigatorProbe.adapterStatus !== "available") {
          return {
            status: "unsupported" as const,
            reason: "navigator.gpu.requestAdapter did not return a real adapter"
          };
        }
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 48;
        document.body.append(canvas);
        const marker = "@galileo3d-shader:native-webgpu-material-wgsl-pbr";
        try {
          const device = await createRenderDevice({ backend: "webgpu", canvas });
          const geometry = Geometry.litTriangle();
          const shader = device.createShaderProgram({
            label: "native-webgpu-material-wgsl-pbr",
            marker,
            vertex: `// ${marker}
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4<f32>(position, 1.0);
  output.normal = normalize(normal);
  return output;
}
`,
            fragment: `// ${marker}
fn fresnelSchlick(cosTheta: f32, f0: vec3<f32>) -> vec3<f32> {
  return f0 + (vec3<f32>(1.0, 1.0, 1.0) - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn ggxDistribution(nDotH: f32, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let denom = max((nDotH * nDotH) * (a2 - 1.0) + 1.0, 0.001);
  return a2 / (3.14159265 * denom * denom);
}

@fragment
fn fs_main(@location(0) normalInput: vec3<f32>) -> @location(0) vec4<f32> {
  let normal = normalize(normalInput);
  let viewDirection = normalize(vec3<f32>(0.0, 0.0, 1.0));
  let lightDirection = normalize(vec3<f32>(0.36, 0.52, 0.78));
  let halfVector = normalize(lightDirection + viewDirection);
  let baseColor = vec3<f32>(0.82, 0.58, 0.26);
  let metallic = 0.28;
  let roughness = 0.34;
  let nDotL = max(dot(normal, lightDirection), 0.0);
  let nDotV = max(dot(normal, viewDirection), 0.001);
  let nDotH = max(dot(normal, halfVector), 0.001);
  let vDotH = max(dot(viewDirection, halfVector), 0.001);
  let f0 = mix(vec3<f32>(0.04, 0.04, 0.04), baseColor, metallic);
  let fresnel = fresnelSchlick(vDotH, f0);
  let distribution = ggxDistribution(nDotH, roughness);
  let k = ((roughness + 1.0) * (roughness + 1.0)) / 8.0;
  let geometryV = nDotV / max(nDotV * (1.0 - k) + k, 0.001);
  let geometryL = nDotL / max(nDotL * (1.0 - k) + k, 0.001);
  let specular = fresnel * (distribution * geometryV * geometryL / max(4.0 * nDotV * nDotL, 0.001));
  let diffuse = baseColor * (1.0 - metallic) / 3.14159265;
  let ambient = baseColor * 0.08;
  let linearColor = ambient + (diffuse + specular) * nDotL * 3.4;
  let srgb = pow(clamp(linearColor, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(1.0 / 2.2));
  return vec4<f32>(srgb, 1.0);
}
`
          });
          const target = device.createRenderTarget({ width: 48, height: 48, label: "native-webgpu-material-wgsl-pbr-target" });
          device.setRenderTarget(target);
          device.beginFrame(48, 48);
          device.clear([0, 0, 0, 1]);
          device.draw({
            label: "native-webgpu-material-wgsl-pbr",
            topology: "triangles",
            vertexBuffer: geometry.vertexBuffer.upload(device),
            vertexFormat: geometry.vertexBuffer.format,
            vertexCount: geometry.vertexBuffer.vertexCount,
            indexBuffer: geometry.indexBuffer?.upload(device),
            indexType: "uint16",
            indexCount: 3,
            shader
          });
          device.endFrame();
          const nativePixels = device.readPixelsAsync ? await device.readPixelsAsync(0, 0, 48, 48) : new Uint8Array();
          const nativePixel = Array.from(firstNonBlackPixel(nativePixels));
          const diagnostics = device.getDiagnostics();
          const info = device.info;
          target.dispose();
          device.dispose();
          const luminance = rgbLuminance(nativePixel);
          return {
            status: diagnostics.nativeSubmissions && diagnostics.nativeSubmissions >= 1 && luminance > 8 ? "pass" as const : "unsupported" as const,
            nativePixel,
            luminance,
            diagnostics,
            shaderMarker: marker,
            shaderModel: "native-wgsl-ggx-schlick-pbr-direct-light",
            renderer: info.renderer,
            capabilities: info.capabilities ?? [],
            limitations: info.limitations ?? []
          };
        } catch (error) {
          return {
            status: "unsupported" as const,
            reason: error instanceof Error ? error.message : String(error)
          };
        }
      }

      async function tryRealHardwareInstancedPbrForwardPass() {
        if (navigatorProbe.adapterStatus !== "available") {
          return {
            status: "unsupported" as const,
            reason: "navigator.gpu.requestAdapter did not return a real adapter"
          };
        }
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 48;
        document.body.append(canvas);
        try {
          const renderer = await Renderer.create({ backend: "webgpu", canvas, width: canvas.width, height: canvas.height, clearColor: [0, 0, 0, 1] });
          const instanceTransforms = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            -0.28, 0, 0, 1,
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0.28, 0, 0, 1
          ]);
          const target = renderer.device.createRenderTarget({ width: 48, height: 48, label: "real-webgpu-instanced-pbr-forward-pass-target" });
          const diagnostics = renderer.render({
            renderItems: [{
              geometry: Geometry.litCube(0.32),
              material: new InstancedPBRMaterial({
                name: "real-webgpu-instanced-pbr-forward-pass",
                baseColor: [0.38, 0.68, 0.95, 1],
                metallic: 0.24,
                roughness: 0.48
              }),
              instanceTransforms,
              label: "real-webgpu-instanced-pbr-forward-pass"
            }],
            renderTarget: target
          });
          const nativePixels = renderer.device.readPixelsAsync ? await renderer.device.readPixelsAsync(0, 0, 48, 48) : new Uint8Array();
          const nativePixel = Array.from(firstNonBlackPixel(nativePixels));
          const nativeLuminance = rgbLuminance(nativePixel);
          const info = renderer.device.info;
          renderer.dispose();
          const nativeInstancedPbrShaderBound = Number(diagnostics.nativeInstancedSubmissions ?? 0) >= 1 && Number(diagnostics.nativePbrSubmissions ?? 0) >= 1;
          return {
            status: diagnostics.drawCalls >= 1 && nativeInstancedPbrShaderBound && nativeLuminance > 8 ? "pass" as const : "unsupported" as const,
            diagnostics,
            instanceCount: 2,
            nativeInstancedPbrShaderBound,
            nativePixel,
            nativeLuminance,
            nativeReadback: nativePixels.length,
            reason: nativeInstancedPbrShaderBound && nativeLuminance > 8 ? undefined : "Native WebGPU instanced PBR must produce nonblack native texture-to-buffer readback from the high-level instanced shader path.",
            renderer: info.renderer,
            capabilities: info.capabilities ?? [],
            limitations: info.limitations ?? []
          };
        } catch (error) {
          return {
            status: "unsupported" as const,
            reason: error instanceof Error ? error.message : String(error)
          };
        }
      }

      async function tryRealHardwareSkinnedForwardPass() {
        if (navigatorProbe.adapterStatus !== "available") {
          return {
            status: "unsupported" as const,
            reason: "navigator.gpu.requestAdapter did not return a real adapter"
          };
        }
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 48;
        document.body.append(canvas);
        try {
          const renderer = await Renderer.create({ backend: "webgpu", canvas, width: canvas.width, height: canvas.height, clearColor: [0, 0, 0, 1] });
          const vertices = new VertexBuffer(VertexFormat.P3J4W4, 3);
          vertices.setAttribute(0, "position", [-0.28, -0.28, 0]);
          vertices.setAttribute(1, "position", [0.28, -0.28, 0]);
          vertices.setAttribute(2, "position", [0, 0.32, 0]);
          for (let index = 0; index < 3; index += 1) {
            vertices.setAttribute(index, "joints", [1, 0, 0, 0]);
            vertices.setAttribute(index, "weights", [1, 0, 0, 0]);
          }
          const geometry = new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
          const jointMatrices = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0.08, 0.04, 0, 1
          ]);
          const skinning = { jointCount: 2, matrices: jointMatrices };
          const target = renderer.device.createRenderTarget({ width: 48, height: 48, label: "real-webgpu-skinned-forward-pass-target" });
          const diagnostics = renderer.render({
            renderItems: [{
              geometry,
              material: new SkinnedUnlitMaterial({
                name: "real-webgpu-skinned-forward-pass",
                color: [0.18, 0.88, 0.5, 1]
              }),
              skinning,
              label: "real-webgpu-skinned-forward-pass"
            }],
            renderTarget: target
          });
          const nativePixels = renderer.device.readPixelsAsync ? await renderer.device.readPixelsAsync(0, 0, 48, 48) : new Uint8Array();
          const nativePixel = Array.from(firstNonBlackPixel(nativePixels));
          const nativeLuminance = rgbLuminance(nativePixel);
          const info = renderer.device.info;
          renderer.dispose();
          const nativeSkinnedShaderBound = Number(diagnostics.nativeSkinnedSubmissions ?? 0) >= 1;
          return {
            status: diagnostics.drawCalls >= 1 && nativeSkinnedShaderBound && nativeLuminance > 8 && skinning.jointCount === 2 && jointMatrices.length === 32 ? "pass" as const : "unsupported" as const,
            diagnostics,
            jointCount: skinning.jointCount,
            weightedJointIndex: 1,
            skinMatrixScalars: jointMatrices.length,
            vertexFormat: "P3J4W4",
            nativeSkinnedShaderBound,
            nativePixel,
            nativeLuminance,
            nativeReadback: nativePixels.length,
            reason: nativeSkinnedShaderBound && nativeLuminance > 8 ? undefined : "Native WebGPU skinning must produce nonblack native texture-to-buffer readback from joint-matrix deformation.",
            renderer: info.renderer,
            capabilities: info.capabilities ?? [],
            limitations: info.limitations ?? []
          };
        } catch (error) {
          return {
            status: "unsupported" as const,
            reason: error instanceof Error ? error.message : String(error)
          };
        }
      }

      async function tryRealHardwareMorphForwardPass() {
        if (navigatorProbe.adapterStatus !== "available") {
          return {
            status: "unsupported" as const,
            reason: "navigator.gpu.requestAdapter did not return a real adapter"
          };
        }
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 48;
        document.body.append(canvas);
        try {
          const renderer = await Renderer.create({ backend: "webgpu", canvas, width: canvas.width, height: canvas.height, clearColor: [0, 0, 0, 1] });
          const morphTargets = [{
            positions: [
              [0, 0.16, 0],
              [0, 0.16, 0],
              [0, 0.42, 0]
            ]
          }];
          const morphWeights = [0.75];
          const target = renderer.device.createRenderTarget({ width: 48, height: 48, label: "real-webgpu-morph-forward-pass-target" });
          const diagnostics = renderer.render({
            renderItems: [{
              geometry: Geometry.triangle(),
              material: new MorphUnlitMaterial({
                name: "real-webgpu-morph-forward-pass",
                color: [0.56, 0.34, 0.94, 1]
              }),
              morphTargets,
              morphWeights,
              label: "real-webgpu-morph-forward-pass"
            }],
            renderTarget: target
          });
          const nativePixels = renderer.device.readPixelsAsync ? await renderer.device.readPixelsAsync(0, 0, 48, 48) : new Uint8Array();
          const nativePixel = Array.from(firstNonBlackPixel(nativePixels));
          const nativeLuminance = rgbLuminance(nativePixel);
          const info = renderer.device.info;
          renderer.dispose();
          const nativeMorphShaderBound = Number(diagnostics.nativeMorphSubmissions ?? 0) >= 1;
          return {
            status: diagnostics.drawCalls >= 1 && nativeMorphShaderBound && nativeLuminance > 8 ? "pass" as const : "unsupported" as const,
            diagnostics,
            morphTargetCount: morphTargets.length,
            morphWeight: morphWeights[0],
            nativeMorphShaderBound,
            nativePixel,
            nativeLuminance,
            nativeReadback: nativePixels.length,
            reason: nativeMorphShaderBound && nativeLuminance > 8 ? undefined : "Native WebGPU morph deformation must produce nonblack native texture-to-buffer readback from the high-level morph shader path.",
            renderer: info.renderer,
            capabilities: info.capabilities ?? [],
            limitations: info.limitations ?? []
          };
        } catch (error) {
          return {
            status: "unsupported" as const,
            reason: error instanceof Error ? error.message : String(error)
          };
        }
      }

      async function tryRealHardwareHdrRenderTargetPostprocess() {
        if (navigatorProbe.adapterStatus !== "available") {
          return {
            status: "unsupported" as const,
            reason: "navigator.gpu.requestAdapter did not return a real adapter"
          };
        }
        try {
          const device = await createRenderDevice({ backend: "webgpu" });
          const target = device.createRenderTarget({ width: 16, height: 16, label: "real-webgpu-hdr-render-target", format: "rgba16f" });
          const shader = device.createShaderProgram(parityShader);
          const buffer = device.createBuffer("vertex", 36, triangleVertices);
          device.setRenderTarget(target);
          device.beginFrame(16, 16);
          device.clear([2.5, 0.5, 0.125, 1]);
          const nativeSamplePixels = device.readFloatPixelsAsync ? await device.readFloatPixelsAsync(8, 8, 1, 1) : new Float32Array();
          const sample = Array.from(nativeSamplePixels);
          const toneMapped = toneMapFloatPixels(new Float32Array(sample), 1, 1, {
            operator: "aces",
            exposure: 1,
            whitePoint: 1.2,
            outputColorSpace: "srgb"
          });
          device.draw({
            label: "real-webgpu-hdr-native-render-pass",
            topology: "triangles",
            vertexBuffer: buffer,
            vertexFormat: VertexFormat.P3,
            vertexCount: 3,
            shader,
            uniforms: new Map([["u_color", [0.35, 0.7, 1, 1]]])
          });
          device.endFrame();
          const diagnostics = device.getDiagnostics();
          const info = device.info;
          device.dispose();
          const sampleOverOne = (sample[0] ?? 0) > 1;
          const toneMappedFinite = Number(toneMapped.pixels[0] ?? 0) > 0 && Number(toneMapped.pixels[0] ?? 0) < 255;
          const capabilities = info.capabilities ?? [];
          return {
            status: diagnostics.drawCalls >= 1 &&
              Number(diagnostics.nativeSubmissions ?? 0) >= 1 &&
              target.colorTexture.format === "rgba16f" &&
              nativeSamplePixels.length === 4 &&
              sampleOverOne &&
              toneMapped.inputOverbrightPixels === 1 &&
              toneMappedFinite &&
              capabilities.includes("hdr-render-targets") &&
              capabilities.includes("float-readback")
              ? "pass" as const
              : "unsupported" as const,
            diagnostics,
            format: target.colorTexture.format,
            sample,
            nativeFloatReadback: nativeSamplePixels.length,
            sampleOverOne,
            toneMapped: {
              inputOverbrightPixels: toneMapped.inputOverbrightPixels,
              maxInputValue: toneMapped.maxInputValue,
              firstPixel: Array.from(toneMapped.pixels.slice(0, 4)),
              operator: toneMapped.calibration.operator
            },
            renderer: info.renderer,
            capabilities,
            limitations: info.limitations ?? []
          };
        } catch (error) {
          return {
            status: "unsupported" as const,
            reason: error instanceof Error ? error.message : String(error)
          };
        }
      }

      async function tryRealHardwareRendererAsyncPostprocess() {
        if (navigatorProbe.adapterStatus !== "available") {
          return {
            status: "unsupported" as const,
            reason: "navigator.gpu.requestAdapter did not return a real adapter"
          };
        }
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 24;
          canvas.height = 24;
          const renderer = await Renderer.create({
            backend: "webgpu",
            canvas,
            width: canvas.width,
            height: canvas.height,
            clearColor: [0.8, 0.25, 0.05, 1],
            preserveDrawingBuffer: true
          });
          const diagnostics = await renderer.renderAsync({
            renderItems: [],
            postprocess: {
              targetFormat: "rgba8",
              bloom: { threshold: 0.05, intensity: 0.12, radius: 1 },
              toneMapping: { exposure: 1, gamma: 1, operator: "reinhard", outputColorSpace: "srgb" },
              fxaa: true
            }
          });
          const pixel = Array.from(renderer.device.readPixels(12, 12, 1, 1));
          const info = renderer.device.info;
          renderer.dispose();
          const capabilities = info.capabilities ?? [];
          const limitations = info.limitations ?? [];
          const asyncContractPublished = limitations.some((limit) => limit.includes("Renderer.renderAsync()"));
          return {
            status: capabilities.includes("native-texture-readback") &&
              asyncContractPublished &&
              nonBlack(pixel) &&
              diagnostics.lastError === null
              ? "pass" as const
              : "unsupported" as const,
            diagnostics,
            pixel,
            capabilities,
            limitations,
            asyncContractPublished,
            reason: capabilities.includes("native-texture-readback") && asyncContractPublished && nonBlack(pixel)
              ? undefined
              : "Renderer.renderAsync did not prove native WebGPU renderer-owned postprocess readback and presentation."
          };
        } catch (error) {
          return {
            status: "unsupported" as const,
            reason: error instanceof Error ? error.message : String(error)
          };
        }
      }

      async function probeNavigatorWebGPU() {
        const gpu = (navigator as Navigator & { gpu?: { requestAdapter?: () => Promise<unknown> } }).gpu;
        if (!gpu?.requestAdapter) {
          return { hasNavigatorGpu: false, adapterStatus: "not-available" as const };
        }
        try {
          const adapter = await gpu.requestAdapter();
          return { hasNavigatorGpu: true, adapterStatus: adapter ? "available" as const : "missing" as const };
        } catch (error) {
          return {
            hasNavigatorGpu: true,
            adapterStatus: "error" as const,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      function cpuParticleUpdate(input: typeof particleInput) {
        const positions = input.positions.slice();
        const velocities = input.velocities.slice();
        for (let index = 0; index < input.count; index += 1) {
          const offset = index * 4;
          velocities[offset] += input.accelerations[offset] * input.deltaTime;
          velocities[offset + 1] += input.accelerations[offset + 1] * input.deltaTime;
          velocities[offset + 2] += input.accelerations[offset + 2] * input.deltaTime;
          positions[offset] += velocities[offset] * input.deltaTime;
          positions[offset + 1] += velocities[offset + 1] * input.deltaTime;
          positions[offset + 2] += velocities[offset + 2] * input.deltaTime;
          positions[offset + 3] += input.deltaTime;
        }
        return { positions, velocities };
      }

      function maxAbsDelta(left: Float32Array, right: Float32Array): number {
        let max = 0;
        for (let index = 0; index < left.length; index += 1) {
          max = Math.max(max, Math.abs((left[index] ?? 0) - (right[index] ?? 0)));
        }
        return max;
      }

      function pixelsEqual(left: readonly number[], right: readonly number[]): boolean {
        return left.length === right.length && left.every((value, index) => value === right[index]);
      }

      function pixelsClose(left: readonly number[], right: readonly number[], tolerance: number): boolean {
        return left.length === right.length && left.every((value, index) => Math.abs(value - Number(right[index] ?? 0)) <= tolerance);
      }

      function nonBlack(pixel: readonly number[]): boolean {
        return Number(pixel[0] ?? 0) > 8 || Number(pixel[1] ?? 0) > 8 || Number(pixel[2] ?? 0) > 8;
      }

      function rgbLuminance(pixel: readonly number[]): number {
        return Number(pixel[0] ?? 0) * 0.2126 + Number(pixel[1] ?? 0) * 0.7152 + Number(pixel[2] ?? 0) * 0.0722;
      }

      function firstNonBlackPixel(pixels: Uint8Array): Uint8Array {
        for (let index = 0; index + 3 < pixels.length; index += 4) {
          if ((pixels[index] ?? 0) > 8 || (pixels[index + 1] ?? 0) > 8 || (pixels[index + 2] ?? 0) > 8) {
            return pixels.slice(index, index + 4);
          }
        }
        return pixels.slice(0, 4);
      }

      function createRenderWebGPU() {
        return {
          async requestAdapter() {
            return {
              name: "webgpu-parity-injected-render-adapter",
              async requestDevice() {
                return {
                  queue: {
                    writeBuffer(buffer: { data: Uint8Array }, offset: number, data: ArrayBuffer | ArrayBufferView) {
                      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
                      buffer.data.set(bytes, offset);
                    },
                    submit() {}
                  },
                  createBuffer(descriptor: { size: number }) {
                    return {
                      data: new Uint8Array(descriptor.size),
                      destroy() {
                        this.data = new Uint8Array(0);
                      }
                    };
                  },
                  createShaderModule(descriptor: { label?: string; code: string }) {
                    return descriptor;
                  },
                  createTexture() {
                    return {
                      createView() {
                        return {};
                      },
                      destroy() {}
                    };
                  },
                  destroy() {}
                };
              }
            };
          }
        };
      }

      function createParticleWebGPU() {
        return {
          async requestAdapter() {
            return {
              name: "webgpu-parity-injected-compute-adapter",
              async requestDevice() {
                return createParticleDevice();
              }
            };
          }
        };
      }

      function createParticleDevice() {
        return {
          queue: {
            writeBuffer(buffer: { data: ArrayBuffer }, offset: number, data: ArrayBuffer | ArrayBufferView) {
              const source = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
              new Uint8Array(buffer.data).set(source, offset);
            },
            submit() {}
          },
          createShaderModule(descriptor: { code: string }) {
            return { code: descriptor.code };
          },
          createComputePipeline() {
            return {
              getBindGroupLayout() {
                return {};
              }
            };
          },
          createBuffer(descriptor: { size: number }) {
            return {
              data: new ArrayBuffer(descriptor.size),
              async mapAsync() {},
              getMappedRange() {
                return this.data.slice(0);
              },
              unmap() {},
              destroy() {}
            };
          },
          createBindGroup(descriptor: { entries: unknown[] }) {
            return { entries: descriptor.entries };
          },
          createCommandEncoder() {
            const copies: Array<{ source: any; sourceOffset: number; destination: any; destinationOffset: number; size: number }> = [];
            let bindGroup: any;
            return {
              beginComputePass() {
                return {
                  setPipeline() {},
                  setBindGroup(_index: number, nextBindGroup: unknown) {
                    bindGroup = nextBindGroup;
                  },
                  dispatchWorkgroups() {
                    const positions = new Float32Array(bindGroup.entries[0].resource.buffer.data);
                    const velocities = new Float32Array(bindGroup.entries[1].resource.buffer.data);
                    const accelerations = new Float32Array(bindGroup.entries[2].resource.buffer.data);
                    const params = new DataView(bindGroup.entries[3].resource.buffer.data);
                    const deltaTime = params.getFloat32(0, true);
                    const count = params.getUint32(4, true);
                    for (let index = 0; index < count; index += 1) {
                      const offset = index * 4;
                      velocities[offset] += accelerations[offset] * deltaTime;
                      velocities[offset + 1] += accelerations[offset + 1] * deltaTime;
                      velocities[offset + 2] += accelerations[offset + 2] * deltaTime;
                      positions[offset] += velocities[offset] * deltaTime;
                      positions[offset + 1] += velocities[offset + 1] * deltaTime;
                      positions[offset + 2] += velocities[offset + 2] * deltaTime;
                      positions[offset + 3] += deltaTime;
                    }
                  },
                  end() {}
                };
              },
              copyBufferToBuffer(source: any, sourceOffset: number, destination: any, destinationOffset: number, size: number) {
                copies.push({ source, sourceOffset, destination, destinationOffset, size });
              },
              finish() {
                for (const copy of copies) {
                  const source = new Uint8Array(copy.source.data, copy.sourceOffset, copy.size);
                  new Uint8Array(copy.destination.data).set(source, copy.destinationOffset);
                }
                return {};
              }
            };
          },
          destroy() {}
        };
      }
    }, `${server.origin}/packages/rendering/src/index.ts`);

    const nativeTextureBindingSupported = result.realHardwareRender.status === "pass" &&
      result.realHardwareRender.featureChecks?.nativeTextureBinding === true;
    const cases: WebGPUParityCase[] = [
      {
        name: "webgl2-render-parity-triangle",
        status: "pass",
        evidenceType: "injected-webgpu-contract",
        details: { webgpuPixel: result.triangleCenter, webgl2Pixel: result.webglTriangleCenter, webgl2DrawCalls: result.webglDiagnostics.drawCalls }
      },
      {
        name: "triangle-raster",
        status: "pass",
        evidenceType: "injected-webgpu-contract",
        details: { pixel: result.triangleCenter, expectedPixel: [26, 204, 51, 255] }
      },
      {
        name: "render-target-readback",
        status: "pass",
        evidenceType: "injected-webgpu-contract",
        details: { pixel: result.renderTargetReadback, renderTargets: result.renderDiagnostics.renderTargets }
      },
      {
        name: "indexed-draws",
        status: "pass",
        evidenceType: "injected-webgpu-contract",
        details: { webgpuPixel: result.indexedPixel, webgl2Pixel: result.webglIndexedPixel, expectedPixel: [89, 230, 64, 255] }
      },
      {
        name: "line-topology",
        status: "pass",
        evidenceType: "injected-webgpu-contract",
        details: { webgpuPixel: result.linePixel, webgl2Pixel: result.webglLinePixel, expectedPixel: [51, 255, 102, 255] }
      },
      {
        name: "point-topology",
        status: "pass",
        evidenceType: "injected-webgpu-contract",
        details: { webgpuPixel: result.pointPixel, webgl2Pixel: result.webglPointPixel, expectedPixel: [255, 209, 51, 255] }
      },
      {
        name: "vertex-colors",
        status: "pass",
        evidenceType: "injected-webgpu-contract",
        details: { webgpuPixel: result.vertexColorPixel, webgl2Pixel: result.webglVertexColorPixel, expectedPixel: [64, 128, 255, 255] }
      },
      {
        name: "instancing",
        status: "pass",
        evidenceType: "injected-webgpu-contract",
        details: { leftPixel: result.instancedLeft, rightPixel: result.instancedRight }
      },
      {
        name: "particles-compute-cpu-parity",
        status: "pass",
        evidenceType: "injected-webgpu-contract",
        details: result.particleUpdate
      },
      {
        name: "textured-material",
        status: "pass",
        evidenceType: "injected-webgpu-contract",
        details: { webgpuPixel: result.texturePixel, webgl2Pixel: result.webglTexturePixel, expectedPixel: [8, 81, 202, 255] }
      },
      {
        name: "morph",
        status: "pass",
        evidenceType: "injected-webgpu-contract",
        details: { webgpuPixel: result.morphPixel, webgl2Pixel: result.webglMorphPixel, expectedPixel: [189, 41, 224, 255] }
      },
      {
        name: "real-navigator-gpu-availability",
        status: "pass",
        evidenceType: "real-navigator-gpu-probe",
        details: result.navigatorProbe
      },
      {
        name: "real-webgpu-render-target-readback",
        status: result.realHardwareRender.status === "pass" ? "pass" : "unsupported",
        evidenceType: "real-navigator-gpu-probe",
        details: result.realHardwareRender
      },
      {
        name: "real-webgpu-render-device-feature-matrix",
        status: result.realHardwareRender.status === "pass" ? "pass" : "unsupported",
        evidenceType: "real-navigator-gpu-probe",
        details: result.realHardwareRender
      },
      {
        name: "real-webgpu-webgl2-feature-matrix-conformance",
        status: result.realHardwareRender.status === "pass" &&
          result.realHardwareRender.featureChecks?.webgl2Conformance === true &&
          Number(result.realHardwareRender.nativeSubmissionEvidence?.nativeSubmissions ?? 0) >= 4
          ? "pass"
          : "unsupported",
        evidenceType: "real-webgpu-webgl2-conformance",
        details: {
          featureChecks: result.realHardwareRender.featureChecks,
          webglReference: result.realHardwareRender.webglReference,
          webgpuPixels: {
            trianglePixel: result.realHardwareRender.pixel,
            indexedPixel: result.realHardwareRender.indexedPixel,
            linePixel: result.realHardwareRender.linePixel,
            pointPixel: result.realHardwareRender.pointPixel,
            vertexColorPixel: result.realHardwareRender.vertexColorPixel,
            texturePixel: result.realHardwareRender.texturePixel,
            morphPixel: result.realHardwareRender.morphPixel
          },
          nativeSubmissionEvidence: result.realHardwareRender.nativeSubmissionEvidence,
          renderer: result.realHardwareRender.renderer,
          capabilities: result.realHardwareRender.capabilities,
          limitations: result.realHardwareRender.limitations
        }
      },
      {
        name: "real-webgpu-native-texture-to-buffer-readback",
        status: result.realHardwareRender.status === "pass" &&
          result.realHardwareRender.featureChecks?.nativeTextureToBufferReadback === true
          ? "pass"
          : "unsupported",
        evidenceType: "real-webgpu-webgl2-conformance",
        details: {
          nativeReadbackPixel: result.realHardwareRender.nativeReadbackPixel,
          cpuShadowedReadbackPixel: result.realHardwareRender.pixel,
          capabilities: result.realHardwareRender.capabilities,
          limitations: result.realHardwareRender.limitations
        }
      },
      {
        name: "native-webgpu-texture-binding",
        status: nativeTextureBindingSupported ? "pass" : "unsupported",
        evidenceType: "root-code-contract",
        details: {
          supported: nativeTextureBindingSupported,
          reason: nativeTextureBindingSupported
            ? "WebGPUDevice.submitNativeRenderPass uploaded an sRGB TextureBinding to a native WebGPU sampled texture/sampler bind group and read it back from the native render target."
            : "WebGPUDevice.submitNativeRenderPass did not prove native sampled texture/sampler bind groups; TextureBinding evidence is CPU-shadowed through rasterizeDraw/readPixels."
        }
      },
      {
        name: "real-webgpu-pbr-forward-pass",
        status: result.realHardwarePbrForwardPass.status === "pass" ? "pass" : "unsupported",
        evidenceType: "real-webgpu-webgl2-conformance",
        details: result.realHardwarePbrForwardPass
      },
      {
        name: "real-webgpu-textured-pbr-forward-pass",
        status: result.realHardwareTexturedPbrForwardPass.status === "pass" && nativeTextureBindingSupported ? "pass" : "unsupported",
        evidenceType: "real-webgpu-webgl2-conformance",
        details: {
          ...result.realHardwareTexturedPbrForwardPass,
          nativeTextureBindingSupported
        }
      },
      {
        name: "real-webgpu-environment-pbr-forward-pass",
        status: result.realHardwareEnvironmentPbrForwardPass.status === "pass" ? "pass" : "unsupported",
        evidenceType: "real-webgpu-webgl2-conformance",
        details: result.realHardwareEnvironmentPbrForwardPass
      },
      {
        name: "real-webgpu-instanced-pbr-forward-pass",
        status: result.realHardwareInstancedPbrForwardPass.status === "pass" ? "pass" : "unsupported",
        evidenceType: "real-webgpu-webgl2-conformance",
        details: result.realHardwareInstancedPbrForwardPass
      },
      {
        name: "real-webgpu-skinned-forward-pass",
        status: result.realHardwareSkinnedForwardPass.status === "pass" ? "pass" : "unsupported",
        evidenceType: "real-webgpu-webgl2-conformance",
        details: result.realHardwareSkinnedForwardPass
      },
      {
        name: "real-webgpu-morph-forward-pass",
        status: result.realHardwareMorphForwardPass.status === "pass" ? "pass" : "unsupported",
        evidenceType: "real-webgpu-webgl2-conformance",
        details: result.realHardwareMorphForwardPass
      },
      {
        name: "real-webgpu-shadow-map-forward-pass",
        status: result.realHardwareShadowMapForwardPass.status === "pass" ? "pass" : "unsupported",
        evidenceType: "real-webgpu-webgl2-conformance",
        details: result.realHardwareShadowMapForwardPass
      },
      {
        name: "native-webgpu-material-wgsl-pbr-shader",
        status: result.nativeWebGPUMaterialWgslPbrShader.status === "pass" ? "pass" : "unsupported",
        evidenceType: "real-webgpu-native-wgsl-material",
        details: result.nativeWebGPUMaterialWgslPbrShader
      },
      {
        name: "real-webgpu-hdr-render-target-postprocess",
        status: result.realHardwareHdrRenderTargetPostprocess.status === "pass" ? "pass" : "unsupported",
        evidenceType: "real-webgpu-webgl2-conformance",
        details: result.realHardwareHdrRenderTargetPostprocess
      },
      {
        name: "real-webgpu-renderer-async-postprocess",
        status: result.realHardwareRendererAsyncPostprocess.status === "pass" ? "pass" : "unsupported",
        evidenceType: "real-webgpu-webgl2-conformance",
        details: result.realHardwareRendererAsyncPostprocess
      },
      {
        name: "real-webgpu-compute-particles",
        status: result.realHardwareParticles.status === "pass" ? "pass" : "unsupported",
        evidenceType: "real-navigator-gpu-probe",
        details: result.realHardwareParticles
      },
    ];
    const hardwareMatrix = readWebGPUHardwareMatrix();
    const unsupportedCases = cases.filter((candidate) => candidate.status === "unsupported").map((candidate) => candidate.name);
    const passedCases = new Set(cases.filter((candidate) => candidate.status === "pass").map((candidate) => candidate.name));
    const featureMatrix = {
      triangleRaster: passedCases.has("triangle-raster") && passedCases.has("webgl2-render-parity-triangle"),
      indexedDraws: passedCases.has("indexed-draws"),
      lineTopology: passedCases.has("line-topology"),
      pointTopology: passedCases.has("point-topology"),
      vertexColors: passedCases.has("vertex-colors"),
      renderTargetReadback: passedCases.has("render-target-readback"),
      instancing: passedCases.has("instancing"),
      texturedMaterial: passedCases.has("textured-material"),
      particlesCompute: passedCases.has("particles-compute-cpu-parity"),
      realNavigatorGpuAdapter: result.navigatorProbe.adapterStatus === "available" && hardwareMatrix.realDeviceAvailable,
      realHardwareRenderTargetReadback: passedCases.has("real-webgpu-render-target-readback"),
      realHardwareRenderDeviceFeatureMatrix: passedCases.has("real-webgpu-render-device-feature-matrix"),
      realWebGPUWebGL2FeatureMatrixConformance: passedCases.has("real-webgpu-webgl2-feature-matrix-conformance"),
      nativeWebGPURenderPassSubmission: Number(result.realHardwareRender.nativeSubmissionEvidence?.nativeSubmissions ?? 0) >= 8,
      nativeWebGPUTextureToBufferReadback: passedCases.has("real-webgpu-native-texture-to-buffer-readback"),
      nativeWebGPUTextureBinding: passedCases.has("native-webgpu-texture-binding"),
      realWebGPUPbrForwardPass: passedCases.has("real-webgpu-pbr-forward-pass"),
      realWebGPUTexturedPbrForwardPass: passedCases.has("real-webgpu-textured-pbr-forward-pass"),
      realWebGPUEnvironmentPbrForwardPass: passedCases.has("real-webgpu-environment-pbr-forward-pass"),
      realWebGPUInstancedPbrForwardPass: passedCases.has("real-webgpu-instanced-pbr-forward-pass"),
      realWebGPUSkinnedForwardPass: passedCases.has("real-webgpu-skinned-forward-pass"),
      realWebGPUMorphForwardPass: passedCases.has("real-webgpu-morph-forward-pass"),
      realWebGPUShadowMapForwardPass: passedCases.has("real-webgpu-shadow-map-forward-pass"),
      nativeWebGPUMaterialWgslPbrShader: passedCases.has("native-webgpu-material-wgsl-pbr-shader"),
      realWebGPUHdrRenderTargetPostprocess: passedCases.has("real-webgpu-hdr-render-target-postprocess"),
      realWebGPURendererAsyncPostprocess: passedCases.has("real-webgpu-renderer-async-postprocess"),
      realHardwareComputeParticles: passedCases.has("real-webgpu-compute-particles"),
      morphTargets: passedCases.has("morph")
    };
    const productionWebGPUFeatureMatrixComplete = [
      featureMatrix.realNavigatorGpuAdapter,
      featureMatrix.realHardwareRenderTargetReadback,
      featureMatrix.realHardwareRenderDeviceFeatureMatrix,
      featureMatrix.realWebGPUWebGL2FeatureMatrixConformance,
      featureMatrix.nativeWebGPURenderPassSubmission,
      featureMatrix.nativeWebGPUTextureToBufferReadback,
      featureMatrix.nativeWebGPUTextureBinding,
      featureMatrix.realWebGPUPbrForwardPass,
      featureMatrix.realWebGPUTexturedPbrForwardPass,
      featureMatrix.realWebGPUEnvironmentPbrForwardPass,
      featureMatrix.realWebGPUInstancedPbrForwardPass,
      featureMatrix.realWebGPUSkinnedForwardPass,
      featureMatrix.realWebGPUMorphForwardPass,
      featureMatrix.realWebGPUShadowMapForwardPass,
      featureMatrix.nativeWebGPUMaterialWgslPbrShader,
      featureMatrix.realWebGPUHdrRenderTargetPostprocess,
      featureMatrix.realWebGPURendererAsyncPostprocess,
      featureMatrix.realHardwareComputeParticles
    ].every(Boolean);
    const fullWebGPUParityBlockers = [
      ...(hardwareMatrix.present ? [] : ["real WebGPU hardware matrix report is missing; run tests/browser/webgpu-real-device.spec.ts"]),
      ...(featureMatrix.realNavigatorGpuAdapter ? [] : ["real navigator.gpu adapter/device evidence is not available in this browser run"]),
      ...(hardwareMatrix.allResultsSupported ? [] : [`real WebGPU hardware matrix has unsupported adapter/device probe results: ${hardwareMatrix.unsupportedResultCount}`]),
      ...(featureMatrix.realHardwareRenderTargetReadback ? [] : ["real WebGPU render-target/readback evidence is not available in this browser run"]),
      ...(featureMatrix.realHardwareRenderDeviceFeatureMatrix ? [] : ["real WebGPU render-device feature-matrix evidence is not available in this browser run"]),
      ...(featureMatrix.realWebGPUWebGL2FeatureMatrixConformance ? [] : ["independent real WebGPU/WebGL2 feature-matrix conformance evidence is not available in this browser run"]),
      ...(featureMatrix.nativeWebGPURenderPassSubmission ? [] : ["native WebGPU render-pass submission evidence is not available in this browser run"]),
      ...(featureMatrix.nativeWebGPUTextureToBufferReadback ? [] : ["native WebGPU texture-to-buffer readback evidence is not available in this browser run"]),
      ...(featureMatrix.nativeWebGPUTextureBinding ? [] : ["native WebGPU sampled texture/sampler bind-group evidence is not implemented; textured WebGPU readbacks are CPU-shadowed"]),
      ...(featureMatrix.realWebGPUPbrForwardPass ? [] : ["real WebGPU PBR forward-pass renderer evidence is not available in this browser run"]),
      ...(featureMatrix.realWebGPUTexturedPbrForwardPass ? [] : ["real WebGPU textured PBR forward-pass renderer evidence is not available in this browser run"]),
      ...(featureMatrix.realWebGPUEnvironmentPbrForwardPass ? [] : ["real WebGPU environment-lit PBR forward-pass renderer evidence is not available in this browser run"]),
      ...(featureMatrix.realWebGPUInstancedPbrForwardPass ? [] : ["real WebGPU instanced PBR forward-pass renderer evidence is not available in this browser run"]),
      ...(featureMatrix.realWebGPUSkinnedForwardPass ? [] : ["real WebGPU skinned forward-pass renderer evidence is not available in this browser run"]),
      ...(featureMatrix.realWebGPUMorphForwardPass ? [] : ["real WebGPU morph forward-pass renderer evidence is not available in this browser run"]),
      ...(featureMatrix.realWebGPUShadowMapForwardPass ? [] : ["real WebGPU forward shadow-map sampling evidence is not available in this browser run"]),
      ...(featureMatrix.nativeWebGPUMaterialWgslPbrShader ? [] : ["native WebGPU WGSL material PBR shader evidence is not available in this browser run"]),
      ...(featureMatrix.realWebGPUHdrRenderTargetPostprocess ? [] : ["real WebGPU HDR render-target and float postprocess evidence is not available in this browser run"]),
      ...(featureMatrix.realWebGPURendererAsyncPostprocess ? [] : ["real WebGPU renderer-owned async postprocess path did not prove native render-target readback"]),
      ...(featureMatrix.realHardwareComputeParticles ? [] : ["real WebGPU compute-particle evidence is not available in this browser run"]),
      ...(unsupportedCases.length === 0 ? [] : [`unsupported WebGPU parity cases remain: ${unsupportedCases.join(", ")}`]),
      ...(productionWebGPUFeatureMatrixComplete ? [] : ["real WebGPU production renderer feature matrix is incomplete"])
    ];
    const hardwareClaim = featureMatrix.realNavigatorGpuAdapter ? "real-navigator-gpu-adapter-available" : "blocked-no-real-adapter-evidence";
    const supportedEvidence = [
      ...(featureMatrix.triangleRaster ? ["injected-webgpu-triangle-raster-contract"] : []),
      ...(featureMatrix.indexedDraws ? ["injected-webgpu-indexed-draw-contract"] : []),
      ...(featureMatrix.lineTopology ? ["injected-webgpu-line-topology-contract"] : []),
      ...(featureMatrix.pointTopology ? ["injected-webgpu-point-topology-contract"] : []),
      ...(featureMatrix.vertexColors ? ["injected-webgpu-vertex-color-contract"] : []),
      ...(featureMatrix.renderTargetReadback ? ["injected-webgpu-render-target-readback-contract"] : []),
      ...(featureMatrix.instancing ? ["injected-webgpu-instancing-contract"] : []),
      ...(featureMatrix.texturedMaterial ? ["injected-webgpu-textured-material-contract"] : []),
      ...(featureMatrix.morphTargets ? ["injected-webgpu-morph-target-contract"] : []),
      ...(featureMatrix.particlesCompute ? ["injected-webgpu-compute-particle-contract"] : []),
      ...(result.navigatorProbe.hasNavigatorGpu === true ? ["real-navigator-gpu-api-probe"] : []),
      ...(hardwareMatrix.present ? ["real-webgpu-hardware-matrix-probe"] : []),
      ...(featureMatrix.realNavigatorGpuAdapter ? ["real-navigator-gpu-adapter-device-evidence"] : []),
      ...(featureMatrix.realHardwareRenderTargetReadback ? ["real-webgpu-render-target-readback-evidence"] : []),
      ...(featureMatrix.realHardwareRenderDeviceFeatureMatrix ? ["real-webgpu-render-device-feature-matrix-evidence"] : []),
      ...(featureMatrix.realWebGPUWebGL2FeatureMatrixConformance ? ["real-webgpu-webgl2-feature-matrix-conformance"] : []),
      ...(featureMatrix.nativeWebGPURenderPassSubmission ? ["native-webgpu-render-pass-submission-evidence"] : []),
      ...(featureMatrix.nativeWebGPUTextureToBufferReadback ? ["native-webgpu-texture-to-buffer-readback-evidence"] : []),
      ...(featureMatrix.nativeWebGPUTextureBinding ? ["native-webgpu-texture-binding-evidence"] : []),
      ...(featureMatrix.realWebGPUPbrForwardPass ? ["real-webgpu-pbr-forward-pass-evidence"] : []),
      ...(featureMatrix.realWebGPUTexturedPbrForwardPass ? ["real-webgpu-textured-pbr-forward-pass-evidence"] : []),
      ...(featureMatrix.realWebGPUEnvironmentPbrForwardPass ? ["real-webgpu-environment-pbr-forward-pass-evidence"] : []),
      ...(featureMatrix.realWebGPUInstancedPbrForwardPass ? ["real-webgpu-instanced-pbr-forward-pass-evidence"] : []),
      ...(featureMatrix.realWebGPUSkinnedForwardPass ? ["real-webgpu-skinned-forward-pass-evidence"] : []),
      ...(featureMatrix.realWebGPUMorphForwardPass ? ["real-webgpu-morph-forward-pass-evidence"] : []),
      ...(featureMatrix.realWebGPUShadowMapForwardPass ? ["real-webgpu-shadow-map-forward-pass-evidence"] : []),
      ...(featureMatrix.nativeWebGPUMaterialWgslPbrShader ? ["native-webgpu-material-wgsl-pbr-shader-evidence"] : []),
      ...(featureMatrix.realWebGPUHdrRenderTargetPostprocess ? ["real-webgpu-hdr-render-target-postprocess-evidence"] : []),
      ...(featureMatrix.realWebGPURendererAsyncPostprocess ? ["real-webgpu-renderer-async-postprocess-evidence"] : []),
      ...(featureMatrix.realHardwareComputeParticles ? ["real-webgpu-compute-particle-evidence"] : []),
      ...(productionWebGPUFeatureMatrixComplete ? ["real-webgpu-production-renderer-feature-matrix"] : []),
    ];
    const blockedEvidence = [
      ...(hardwareMatrix.present ? [] : ["real-webgpu-hardware-matrix-probe"]),
      ...(featureMatrix.realNavigatorGpuAdapter ? [] : ["real-navigator-gpu-adapter-device-evidence"]),
      ...(featureMatrix.realHardwareRenderTargetReadback ? [] : ["real-webgpu-render-target-readback-evidence"]),
      ...(featureMatrix.realHardwareRenderDeviceFeatureMatrix ? [] : ["real-webgpu-render-device-feature-matrix-evidence"]),
      ...(featureMatrix.realWebGPUWebGL2FeatureMatrixConformance ? [] : ["real-webgpu-webgl2-feature-matrix-conformance"]),
      ...(featureMatrix.nativeWebGPURenderPassSubmission ? [] : ["native-webgpu-render-pass-submission-evidence"]),
      ...(featureMatrix.nativeWebGPUTextureToBufferReadback ? [] : ["native-webgpu-texture-to-buffer-readback-evidence"]),
      ...(featureMatrix.nativeWebGPUTextureBinding ? [] : ["native-webgpu-texture-binding-evidence"]),
      ...(featureMatrix.realWebGPUPbrForwardPass ? [] : ["real-webgpu-pbr-forward-pass-evidence"]),
      ...(featureMatrix.realWebGPUTexturedPbrForwardPass ? [] : ["real-webgpu-textured-pbr-forward-pass-evidence"]),
      ...(featureMatrix.realWebGPUEnvironmentPbrForwardPass ? [] : ["real-webgpu-environment-pbr-forward-pass-evidence"]),
      ...(featureMatrix.realWebGPUInstancedPbrForwardPass ? [] : ["real-webgpu-instanced-pbr-forward-pass-evidence"]),
      ...(featureMatrix.realWebGPUSkinnedForwardPass ? [] : ["real-webgpu-skinned-forward-pass-evidence"]),
      ...(featureMatrix.realWebGPUMorphForwardPass ? [] : ["real-webgpu-morph-forward-pass-evidence"]),
      ...(featureMatrix.realWebGPUShadowMapForwardPass ? [] : ["real-webgpu-shadow-map-forward-pass-evidence"]),
      ...(featureMatrix.nativeWebGPUMaterialWgslPbrShader ? [] : ["native-webgpu-material-wgsl-pbr-shader-evidence"]),
      ...(featureMatrix.realWebGPUHdrRenderTargetPostprocess ? [] : ["real-webgpu-hdr-render-target-postprocess-evidence"]),
      ...(featureMatrix.realWebGPURendererAsyncPostprocess ? [] : ["real-webgpu-renderer-async-postprocess-evidence"]),
      ...(featureMatrix.realHardwareComputeParticles ? [] : ["real-webgpu-compute-particle-evidence"]),
      ...(productionWebGPUFeatureMatrixComplete ? [] : ["real-webgpu-production-renderer-feature-matrix"]),
    ];
    const validations = [
      validation("injected-render-contracts", featureMatrix.triangleRaster && featureMatrix.indexedDraws && featureMatrix.lineTopology && featureMatrix.pointTopology && featureMatrix.vertexColors && featureMatrix.renderTargetReadback && featureMatrix.instancing && featureMatrix.texturedMaterial && featureMatrix.morphTargets, "tests/browser/webgpu-parity.spec.ts", [
        "Injected WebGPU render-device contracts for triangle, indexed, line, point, vertex color, readback, instancing, texture, and morph paths are incomplete.",
      ]),
      validation("injected-compute-contract", featureMatrix.particlesCompute && result.particleUpdate.maxParticleDelta <= 1e-7 && result.particleUpdate.maxVelocityDelta <= 1e-7, "tests/browser/webgpu-parity.spec.ts:particles-compute-cpu-parity", [
        "Injected WebGPU compute particle contract does not match CPU reference output.",
      ]),
      validation("real-navigator-gpu-probe", result.navigatorProbe.hasNavigatorGpu === true, "tests/browser/webgpu-parity.spec.ts:real-navigator-gpu-availability", [
        "navigator.gpu is not exposed in this browser run.",
      ]),
      validation("real-hardware-matrix-probe", hardwareMatrix.present, "tests/reports/webgpu-hardware-matrix.json", [
        "real WebGPU hardware matrix report is missing or failing.",
      ]),
      validation("real-hardware-matrix-all-results-supported", hardwareMatrix.present && hardwareMatrix.allResultsSupported, "tests/reports/webgpu-hardware-matrix.json", [
        "real WebGPU hardware matrix contains unsupported adapter/device probe results.",
      ]),
      validation("real-adapter-device-evidence", featureMatrix.realNavigatorGpuAdapter, "tests/browser/webgpu-real-device.spec.ts", [
        "navigator.gpu.requestAdapter did not return a real adapter/device in this browser run.",
      ]),
      validation("real-render-target-readback-evidence", featureMatrix.realHardwareRenderTargetReadback, "tests/browser/webgpu-parity.spec.ts:real-webgpu-render-target-readback", [
        "real WebGPU render-target/readback did not pass in this browser run.",
      ]),
      validation("real-render-device-feature-matrix-evidence", featureMatrix.realHardwareRenderDeviceFeatureMatrix, "tests/browser/webgpu-parity.spec.ts:real-webgpu-render-device-feature-matrix", [
        "real WebGPU render-device feature matrix did not pass in this browser run.",
      ]),
      validation("real-webgpu-webgl2-feature-matrix-conformance", featureMatrix.realWebGPUWebGL2FeatureMatrixConformance, "tests/browser/webgpu-parity.spec.ts:real-webgpu-webgl2-feature-matrix-conformance", [
        "real WebGPU/WebGL2 feature-matrix conformance did not pass in this browser run.",
      ]),
      validation("native-webgpu-render-pass-submission", featureMatrix.nativeWebGPURenderPassSubmission, "packages/rendering/src/WebGPUDevice.ts:submitNativeRenderPass", [
        "native WebGPU render-pass submission did not run in this browser run.",
      ]),
      validation("native-webgpu-texture-to-buffer-readback", featureMatrix.nativeWebGPUTextureToBufferReadback, "packages/rendering/src/WebGPUDevice.ts:readPixelsAsync", [
        "native WebGPU texture-to-buffer readback did not pass in this browser run.",
      ]),
      validation("native-webgpu-texture-binding", featureMatrix.nativeWebGPUTextureBinding, "packages/rendering/src/WebGPUDevice.ts:submitNativeRenderPass", [
        "native WebGPU sampled texture/sampler bind groups are not implemented; TextureBinding evidence is currently CPU-shadowed.",
      ]),
      validation("real-webgpu-pbr-forward-pass", featureMatrix.realWebGPUPbrForwardPass, "tests/browser/webgpu-parity.spec.ts:real-webgpu-pbr-forward-pass", [
        "real WebGPU high-level renderer PBR forward pass did not submit in this browser run.",
      ]),
      validation("real-webgpu-textured-pbr-forward-pass", featureMatrix.realWebGPUTexturedPbrForwardPass, "tests/browser/webgpu-parity.spec.ts:real-webgpu-textured-pbr-forward-pass", [
        "real WebGPU high-level renderer textured PBR forward pass did not submit with texture resources in this browser run.",
      ]),
      validation("real-webgpu-environment-pbr-forward-pass", featureMatrix.realWebGPUEnvironmentPbrForwardPass, "tests/browser/webgpu-parity.spec.ts:real-webgpu-environment-pbr-forward-pass", [
        "real WebGPU high-level renderer environment-lit PBR forward pass did not submit with generated environment resources in this browser run.",
      ]),
      validation("real-webgpu-instanced-pbr-forward-pass", featureMatrix.realWebGPUInstancedPbrForwardPass, "tests/browser/webgpu-parity.spec.ts:real-webgpu-instanced-pbr-forward-pass", [
        "real WebGPU high-level renderer instanced PBR forward pass did not submit in this browser run.",
      ]),
      validation("real-webgpu-skinned-forward-pass", featureMatrix.realWebGPUSkinnedForwardPass, "tests/browser/webgpu-parity.spec.ts:real-webgpu-skinned-forward-pass", [
        "real WebGPU high-level renderer skinned forward pass did not submit in this browser run.",
      ]),
      validation("real-webgpu-morph-forward-pass", featureMatrix.realWebGPUMorphForwardPass, "tests/browser/webgpu-parity.spec.ts:real-webgpu-morph-forward-pass", [
        "real WebGPU high-level renderer morph forward pass did not submit in this browser run.",
      ]),
      validation("real-webgpu-shadow-map-forward-pass", featureMatrix.realWebGPUShadowMapForwardPass, "tests/browser/webgpu-parity.spec.ts:real-webgpu-shadow-map-forward-pass", [
        "real WebGPU high-level renderer forward shadow-map sampling did not darken a shadowed readback pixel in this browser run.",
      ]),
      validation("native-webgpu-material-wgsl-pbr-shader", featureMatrix.nativeWebGPUMaterialWgslPbrShader, "tests/browser/webgpu-parity.spec.ts:native-webgpu-material-wgsl-pbr-shader", [
        "native WebGPU WGSL material PBR shader did not produce nonblack native texture readback in this browser run.",
      ]),
      validation("real-webgpu-hdr-render-target-postprocess", featureMatrix.realWebGPUHdrRenderTargetPostprocess, "tests/browser/webgpu-parity.spec.ts:real-webgpu-hdr-render-target-postprocess", [
        "real WebGPU HDR render-target float readback and tone-mapping postprocess evidence did not pass in this browser run.",
      ]),
      validation("real-webgpu-renderer-async-postprocess", featureMatrix.realWebGPURendererAsyncPostprocess, "tests/browser/webgpu-parity.spec.ts:real-webgpu-renderer-async-postprocess", [
        "real WebGPU renderer-owned postprocess did not use the async native render-target readback path in this browser run.",
      ]),
      validation("real-compute-particle-evidence", featureMatrix.realHardwareComputeParticles, "tests/browser/webgpu-parity.spec.ts:real-webgpu-compute-particles", [
        "real WebGPU compute particle update did not match the CPU reference in this browser run.",
      ]),
      validation("full-webgpu-parity-boundary", fullWebGPUParityBlockers.length === 0, "tests/reports/external-parity-webgpu-parity.json", fullWebGPUParityBlockers),
    ];
    const report: WebGPUParityReport = {
      ...baseReport(process.cwd(), {
        ok: true,
        command: "G3D_WEBGPU_PARITY_REPORT=tests/reports/external-parity-webgpu-parity.json pnpm exec playwright test tests/browser/webgpu-real-device.spec.ts tests/browser/webgpu-parity.spec.ts",
        runIdPrefix: "v4-webgpu-parity",
        sourceFiles: webgpuReportSourceFiles,
        violations: validations.flatMap((entry) => entry.blockers.map((blocker) => `${entry.id}: ${blocker}`)),
        blockedClaims: [
          ...(fullWebGPUParityBlockers.length === 0 ? [] : ["full WebGPU parity"]),
          "production-ready language",
          "broad better-than-Three.js language",
          "broad better-than-Babylon.js language",
        ],
      }),
      releaseRunId: process.env.G3D_RELEASE_RUN_ID ?? "standalone-webgpu-parity-run",
      gitSha: gitSha(),
      environment: {
        platform: platform(),
        release: release(),
        arch: arch(),
        node: process.version
      },
      sourceInputs: [
        "tests/browser/webgpu-parity.spec.ts",
        "packages/rendering/src/WebGPUDevice.ts"
      ],
      status: "pass",
      source: "tests/browser/webgpu-parity.spec.ts",
      os: { platform: platform(), release: release() },
      cases,
      featureMatrix,
      hardwareMatrix,
      unsupportedCases,
      unsupportedFeatures: unsupportedCases,
      hardwareClaim,
      fullWebGPUParity: fullWebGPUParityBlockers.length === 0,
      supportedEvidence,
      blockedEvidence,
      validations,
      fullWebGPUParityBlockers,
      note: "Injected WebGPU adapters validate render-device and compute contracts only; real hardware success is not claimed unless real-navigator-gpu-availability reports an adapter."
    };

    const reportPath = process.env.G3D_WEBGPU_PARITY_REPORT ?? "tests/reports/webgpu-parity.json";
    mkdirSync("tests/reports", { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    if (reportPath !== "tests/reports/webgpu-parity.json") {
      writeFileSync("tests/reports/webgpu-parity.json", `${JSON.stringify(report, null, 2)}\n`);
    }

    expect(result.triangleCenter).toEqual([26, 204, 51, 255]);
    expect(result.webglTriangleCenter).toEqual(result.triangleCenter);
    expect(result.webglDiagnostics.drawCalls).toBe(1);
    expect(result.renderTargetReadback).toEqual([26, 204, 51, 255]);
    expect(result.instancedLeft).toEqual([230, 64, 26, 255]);
    expect(result.instancedRight).toEqual([230, 64, 26, 255]);
    expect(result.texturePixel).toEqual([8, 81, 202, 255]);
    expect(result.webglTexturePixel).toEqual(result.texturePixel);
    expect(result.morphPixel).toEqual([189, 41, 224, 255]);
    expect(result.webglMorphPixel).toEqual(result.morphPixel);
    expect(maxPixelDelta(result.indexedPixel, result.webglIndexedPixel)).toBeLessThanOrEqual(1);
    expect(result.indexedPixel[0] + result.indexedPixel[1] + result.indexedPixel[2]).toBeGreaterThan(8);
    expect(maxPixelDelta(result.linePixel, result.webglLinePixel)).toBeLessThanOrEqual(1);
    expect(result.linePixel[0] + result.linePixel[1] + result.linePixel[2]).toBeGreaterThan(8);
    expect(maxPixelDelta(result.pointPixel, result.webglPointPixel)).toBeLessThanOrEqual(1);
    expect(result.pointPixel[0] + result.pointPixel[1] + result.pointPixel[2]).toBeGreaterThan(8);
    expect(maxPixelDelta(result.vertexColorPixel, result.webglVertexColorPixel)).toBeLessThanOrEqual(1);
    expect(result.vertexColorPixel[0] + result.vertexColorPixel[1] + result.vertexColorPixel[2]).toBeGreaterThan(8);
    expect(result.particleUpdate.count).toBe(3);
    expect(result.particleUpdate.workgroups).toBe(1);
    expect(result.particleUpdate.maxParticleDelta).toBeLessThanOrEqual(1e-7);
    expect(result.particleUpdate.maxVelocityDelta).toBeLessThanOrEqual(1e-7);
    expect(result.particleUpdate.positions).toEqual(result.expectedParticles.positions);
    expect(result.particleUpdate.velocities).toEqual(result.expectedParticles.velocities);
    expect(result.navigatorProbe.adapterStatus).toMatch(/^(not-available|missing|available|error)$/);
    expect(report.unsupportedCases.filter((entry) => ![
      "real-webgpu-render-target-readback",
      "real-webgpu-render-device-feature-matrix",
      "real-webgpu-webgl2-feature-matrix-conformance",
      "real-webgpu-native-texture-to-buffer-readback",
      "native-webgpu-texture-binding",
      "real-webgpu-pbr-forward-pass",
      "real-webgpu-textured-pbr-forward-pass",
      "real-webgpu-environment-pbr-forward-pass",
      "real-webgpu-instanced-pbr-forward-pass",
	      "real-webgpu-skinned-forward-pass",
	      "real-webgpu-morph-forward-pass",
	      "real-webgpu-shadow-map-forward-pass",
	      "native-webgpu-material-wgsl-pbr-shader",
	      "real-webgpu-hdr-render-target-postprocess",
      "real-webgpu-compute-particles",
    ].includes(entry))).toEqual([]);
    expect(report.featureMatrix).toMatchObject({
      triangleRaster: true,
      indexedDraws: true,
      lineTopology: true,
      pointTopology: true,
      vertexColors: true,
      renderTargetReadback: true,
      instancing: true,
      texturedMaterial: true,
      particlesCompute: true,
      morphTargets: true,
    });
    if (result.realHardwareRender.status === "pass") {
      expect(report.featureMatrix.realHardwareRenderTargetReadback).toBe(true);
      expect(report.unsupportedCases).not.toContain("real-webgpu-render-target-readback");
      expect(report.featureMatrix.realHardwareRenderDeviceFeatureMatrix).toBe(true);
      expect(report.unsupportedCases).not.toContain("real-webgpu-render-device-feature-matrix");
      expect(report.featureMatrix.realWebGPUWebGL2FeatureMatrixConformance).toBe(true);
      expect(report.unsupportedCases).not.toContain("real-webgpu-webgl2-feature-matrix-conformance");
      expect(report.featureMatrix.nativeWebGPURenderPassSubmission).toBe(true);
      expect(report.featureMatrix.nativeWebGPUTextureToBufferReadback).toBe(true);
      expect(report.unsupportedCases).not.toContain("real-webgpu-native-texture-to-buffer-readback");
    } else {
      expect(report.featureMatrix.realHardwareRenderTargetReadback).toBe(false);
      expect(report.unsupportedCases).toContain("real-webgpu-render-target-readback");
      expect(report.featureMatrix.realHardwareRenderDeviceFeatureMatrix).toBe(false);
      expect(report.unsupportedCases).toContain("real-webgpu-render-device-feature-matrix");
      expect(report.featureMatrix.realWebGPUWebGL2FeatureMatrixConformance).toBe(false);
      expect(report.unsupportedCases).toContain("real-webgpu-webgl2-feature-matrix-conformance");
      expect(report.featureMatrix.nativeWebGPUTextureToBufferReadback).toBe(false);
      expect(report.unsupportedCases).toContain("real-webgpu-native-texture-to-buffer-readback");
    }
    if (result.realHardwarePbrForwardPass.status === "pass") {
      expect(report.featureMatrix.realWebGPUPbrForwardPass).toBe(true);
      expect(report.unsupportedCases).not.toContain("real-webgpu-pbr-forward-pass");
    } else {
      expect(report.featureMatrix.realWebGPUPbrForwardPass).toBe(false);
      expect(report.unsupportedCases).toContain("real-webgpu-pbr-forward-pass");
    }
    if (nativeTextureBindingSupported) {
      expect(report.featureMatrix.nativeWebGPUTextureBinding).toBe(true);
      expect(report.unsupportedCases).not.toContain("native-webgpu-texture-binding");
    } else {
      expect(report.featureMatrix.nativeWebGPUTextureBinding).toBe(false);
      expect(report.unsupportedCases).toContain("native-webgpu-texture-binding");
    }
    if (result.realHardwareTexturedPbrForwardPass.status === "pass" && report.featureMatrix.nativeWebGPUTextureBinding) {
      expect(report.featureMatrix.realWebGPUTexturedPbrForwardPass).toBe(true);
      expect(report.unsupportedCases).not.toContain("real-webgpu-textured-pbr-forward-pass");
    } else {
      expect(report.featureMatrix.realWebGPUTexturedPbrForwardPass).toBe(false);
      expect(report.unsupportedCases).toContain("real-webgpu-textured-pbr-forward-pass");
    }
    if (result.realHardwareEnvironmentPbrForwardPass.status === "pass") {
      expect(report.featureMatrix.realWebGPUEnvironmentPbrForwardPass).toBe(true);
      expect(report.unsupportedCases).not.toContain("real-webgpu-environment-pbr-forward-pass");
    } else {
      expect(report.featureMatrix.realWebGPUEnvironmentPbrForwardPass).toBe(false);
      expect(report.unsupportedCases).toContain("real-webgpu-environment-pbr-forward-pass");
    }
    if (result.realHardwareInstancedPbrForwardPass.status === "pass") {
      expect(report.featureMatrix.realWebGPUInstancedPbrForwardPass).toBe(true);
      expect(report.unsupportedCases).not.toContain("real-webgpu-instanced-pbr-forward-pass");
    } else {
      expect(report.featureMatrix.realWebGPUInstancedPbrForwardPass).toBe(false);
      expect(report.unsupportedCases).toContain("real-webgpu-instanced-pbr-forward-pass");
    }
    if (result.realHardwareSkinnedForwardPass.status === "pass") {
      expect(report.featureMatrix.realWebGPUSkinnedForwardPass).toBe(true);
      expect(report.unsupportedCases).not.toContain("real-webgpu-skinned-forward-pass");
    } else {
      expect(report.featureMatrix.realWebGPUSkinnedForwardPass).toBe(false);
      expect(report.unsupportedCases).toContain("real-webgpu-skinned-forward-pass");
    }
    if (result.realHardwareMorphForwardPass.status === "pass") {
      expect(report.featureMatrix.realWebGPUMorphForwardPass).toBe(true);
      expect(report.unsupportedCases).not.toContain("real-webgpu-morph-forward-pass");
    } else {
      expect(report.featureMatrix.realWebGPUMorphForwardPass).toBe(false);
      expect(report.unsupportedCases).toContain("real-webgpu-morph-forward-pass");
    }
	    if (result.realHardwareShadowMapForwardPass.status === "pass") {
	      expect(report.featureMatrix.realWebGPUShadowMapForwardPass).toBe(true);
	      expect(report.unsupportedCases).not.toContain("real-webgpu-shadow-map-forward-pass");
	      expect(Number(result.realHardwareShadowMapForwardPass.shadowedLuminance ?? 0)).toBeLessThan(Number(result.realHardwareShadowMapForwardPass.litLuminance ?? 0));
	    } else {
	      expect(report.featureMatrix.realWebGPUShadowMapForwardPass).toBe(false);
	      expect(report.unsupportedCases).toContain("real-webgpu-shadow-map-forward-pass");
	    }
	    if (result.nativeWebGPUMaterialWgslPbrShader.status === "pass") {
	      expect(report.featureMatrix.nativeWebGPUMaterialWgslPbrShader).toBe(true);
	      expect(report.unsupportedCases).not.toContain("native-webgpu-material-wgsl-pbr-shader");
	      expect(Number(result.nativeWebGPUMaterialWgslPbrShader.luminance ?? 0)).toBeGreaterThan(8);
	    } else {
	      expect(report.featureMatrix.nativeWebGPUMaterialWgslPbrShader).toBe(false);
	      expect(report.unsupportedCases).toContain("native-webgpu-material-wgsl-pbr-shader");
	    }
	    if (result.realHardwareHdrRenderTargetPostprocess.status === "pass") {
      expect(report.featureMatrix.realWebGPUHdrRenderTargetPostprocess).toBe(true);
      expect(report.unsupportedCases).not.toContain("real-webgpu-hdr-render-target-postprocess");
    } else {
      expect(report.featureMatrix.realWebGPUHdrRenderTargetPostprocess).toBe(false);
      expect(report.unsupportedCases).toContain("real-webgpu-hdr-render-target-postprocess");
    }
    if (result.realHardwareRendererAsyncPostprocess.status === "pass") {
      expect(report.featureMatrix.realWebGPURendererAsyncPostprocess).toBe(true);
      expect(report.unsupportedCases).not.toContain("real-webgpu-renderer-async-postprocess");
    } else {
      expect(report.featureMatrix.realWebGPURendererAsyncPostprocess).toBe(false);
      expect(report.unsupportedCases).toContain("real-webgpu-renderer-async-postprocess");
    }
    if (result.realHardwareParticles.status === "pass") {
      expect(report.featureMatrix.realHardwareComputeParticles).toBe(true);
      expect(report.unsupportedCases).not.toContain("real-webgpu-compute-particles");
    } else {
      expect(report.featureMatrix.realHardwareComputeParticles).toBe(false);
      expect(report.unsupportedCases).toContain("real-webgpu-compute-particles");
    }
    expect(report.hardwareClaim).toMatch(/^(real-navigator-gpu-adapter-available|blocked-no-real-adapter-evidence)$/);
    expect(report.fullWebGPUParity).toBe(report.fullWebGPUParityBlockers.length === 0);
    if (report.hardwareClaim === "blocked-no-real-adapter-evidence") {
      expect(report.fullWebGPUParity).toBe(false);
      expect(report.fullWebGPUParityBlockers).toContain("real navigator.gpu adapter/device evidence is not available in this browser run");
    }
  });
});

function validation(id: string, passed: boolean, evidence: string, blockers: readonly string[]) {
  return {
    id,
    passed,
    evidence,
    blockers: passed ? [] : blockers,
  };
}

function maxPixelDelta(left: readonly number[], right: readonly number[]): number {
  let max = 0;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    max = Math.max(max, Math.abs(Number(left[index] ?? 0) - Number(right[index] ?? 0)));
  }
  return max;
}

function gitSha(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function readWebGPUHardwareMatrix(): WebGPUHardwareMatrixSummary {
  const reportPath = "tests/reports/webgpu-hardware-matrix.json" as const;
  if (!existsSync(reportPath)) {
      return {
        reportPath,
        present: false,
        realDeviceAvailable: false,
        allResultsSupported: false,
        unsupportedResultCount: 0,
        resultCount: 0,
        adapters: [],
      };
  }
  try {
    const parsed = JSON.parse(readFileSync(reportPath, "utf8")) as unknown;
    const report = isRecord(parsed) ? parsed : {};
    const results = Array.isArray(report.results) ? report.results.filter(isRecord) : [];
    const adapters = results.map((result) => {
      const adapterInfo = isRecord(result.adapterInfo) ? result.adapterInfo : {};
      return {
        browserName: typeof result.browserName === "string" ? result.browserName : undefined,
        projectName: typeof result.projectName === "string" ? result.projectName : undefined,
        hasNavigatorGpu: typeof result.hasNavigatorGpu === "boolean" ? result.hasNavigatorGpu : undefined,
        adapterStatus: typeof result.adapterStatus === "string" ? result.adapterStatus : undefined,
        deviceStatus: typeof result.deviceStatus === "string" ? result.deviceStatus : undefined,
        adapterName: typeof adapterInfo.name === "string" ? adapterInfo.name : undefined,
        unsupportedCases: Array.isArray(result.unsupportedCases) ? result.unsupportedCases.filter((entry): entry is string => typeof entry === "string") : undefined,
      };
    });
    const unsupportedResultCount = adapters.filter((adapter) => (adapter.unsupportedCases?.length ?? 0) > 0).length;
    return {
      reportPath,
      present: report.status === "pass",
      realDeviceAvailable: adapters.some((adapter) => adapter.adapterStatus === "available" && adapter.deviceStatus === "available"),
      allResultsSupported: adapters.length > 0 && unsupportedResultCount === 0,
      unsupportedResultCount,
      resultCount: adapters.length,
      adapters,
    };
  } catch {
    return {
      reportPath,
      present: false,
      realDeviceAvailable: false,
      allResultsSupported: false,
      unsupportedResultCount: 0,
      resultCount: 0,
      adapters: [],
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
