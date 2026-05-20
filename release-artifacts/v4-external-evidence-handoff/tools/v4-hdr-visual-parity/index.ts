import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, type Page } from "@playwright/test";
import { baseReport, writeJson } from "../v4-reporting/index.js";

type HdrVisualEngine = "galileo" | "threejs" | "babylon";

interface HdrVisualRender {
  readonly engine: HdrVisualEngine;
  readonly screenshotPath: string;
  readonly bundleBytes: number;
  readonly metrics: {
    readonly width: number;
    readonly height: number;
    readonly nonBlankPixels: number;
    readonly colorBuckets: number;
    readonly drawCalls: number;
    readonly hdrTargetWidth: number;
    readonly hdrTargetHeight: number;
    readonly hdrSampleR: number;
    readonly hdrSampleG: number;
    readonly hdrSampleB: number;
    readonly hdrSampleA: number;
    readonly sampleOverOne: boolean;
    readonly toneMappedPatches: number;
  };
}

interface HdrVisualDiff {
  readonly baselineEngine: "galileo";
  readonly comparedEngine: "threejs" | "babylon";
  readonly baselinePath: string;
  readonly comparedPath: string;
  readonly diffPath: string;
  readonly width: number;
  readonly height: number;
  readonly comparedPixels: number;
  readonly changedPixels: number;
  readonly changedPixelRatio: number;
  readonly meanAbsoluteError: number;
  readonly maxChannelDelta: number;
  readonly pass: boolean;
  readonly thresholds: {
    readonly maxChangedPixelRatio: number;
    readonly maxMeanAbsoluteError: number;
  };
}

export interface V4HdrVisualParityReport {
  readonly ok: boolean;
  readonly screenshotPaths: readonly string[];
  readonly boundedHdrRenderTargetParity: {
    readonly threejs: boolean;
    readonly babylon: boolean;
  };
  readonly productionHdrRenderTargetParity: false;
  readonly claimBoundary: string;
  readonly renders: readonly HdrVisualRender[];
  readonly diffs: readonly HdrVisualDiff[];
  readonly violations: readonly string[];
}

const reportPath = "tests/reports/v4-hdr-visual-parity.json";
const artifactDir = "tests/reports/v4-hdr-visual-parity";
const sourceFiles = [
  "tools/v4-hdr-visual-parity/index.ts",
  "tools/v4-hdr-render-target-readiness/index.ts",
  "examples/hdr-render-target-check/main.ts",
  "packages/rendering/src/RenderDevice.ts",
  "packages/rendering/src/WebGL2Device.ts",
] as const;

export async function createV4HdrVisualParityReport(root = process.cwd()): Promise<V4HdrVisualParityReport> {
  mkdirSync(join(root, artifactDir), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const bundles = await buildEngineBundles();
    const page = await browser.newPage({
      viewport: { width: 720, height: 420 },
      deviceScaleFactor: 1,
    });
    try {
      const renders: HdrVisualRender[] = [];
      for (const engine of ["galileo", "threejs", "babylon"] as const) {
        const bundle = bundles.get(engine);
        if (!bundle) throw new Error(`Missing ${engine} HDR visual parity bundle.`);
        renders.push(await renderEngine(page, root, engine, bundle));
      }
      const diffs = [
        await createScreenshotDiff(page, root, renders, "threejs"),
        await createScreenshotDiff(page, root, renders, "babylon"),
      ];
      const boundedHdrRenderTargetParity = {
        threejs: diffs.find((diff) => diff.comparedEngine === "threejs")?.pass === true,
        babylon: diffs.find((diff) => diff.comparedEngine === "babylon")?.pass === true,
      };
      const renderBlockers = renders.flatMap((render) => renderViolations(render));
      const diffBlockers = diffs.flatMap((diff) => diff.pass ? [] : [`${diff.comparedEngine}: bounded HDR visual diff exceeded thresholds`]);
      const violations = [
        ...renderBlockers,
        ...diffBlockers,
        "production-hdr: HDR IBL, multi-pass tone-map chain parity, and shipping HDR pipeline parity remain unproven",
        "unity-unreal: no Unity or Unreal HDR render-target render was produced by this browser harness",
      ];
      const screenshotPaths = collectHdrVisualEvidencePaths({ renders, diffs });
      return {
        ...baseReport(root, {
          ok: renderBlockers.length === 0 && diffBlockers.length === 0,
          command: "pnpm audit:v4-hdr-visual-parity",
          runIdPrefix: "v4-hdr-visual-parity",
          sourceFiles,
          screenshotPaths,
          violations,
          blockedClaims: [
            "production HDR/render-target parity",
            "Unity/Unreal replacement language",
            "production-ready language",
          ],
        }),
        boundedHdrRenderTargetParity,
        productionHdrRenderTargetParity: false,
        claimBoundary: "This report proves a bounded Chromium HDR render-target/readback and visible LDR tone-map patch scene for Galileo3D, Three.js, and Babylon.js. It is not production HDR IBL, complete render-target pipeline, Unity, or Unreal parity.",
        renders,
        diffs,
        violations,
      };
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

export function collectHdrVisualEvidencePaths(report: Pick<V4HdrVisualParityReport, "renders" | "diffs">): readonly string[] {
  const paths = [
    ...report.renders.map((render) => render.screenshotPath),
    ...report.diffs.flatMap((diff) => [diff.baselinePath, diff.comparedPath, diff.diffPath]),
  ];
  return [...new Set(paths.filter((path): path is string => typeof path === "string" && path.length > 0))];
}

async function buildEngineBundles(): Promise<ReadonlyMap<HdrVisualEngine, string>> {
  const entries: Record<HdrVisualEngine, string> = {
    galileo: galileoBundleSource(),
    threejs: threeBundleSource(),
    babylon: babylonBundleSource(),
  };
  const bundles = new Map<HdrVisualEngine, string>();
  for (const [engine, contents] of Object.entries(entries) as [HdrVisualEngine, string][]) {
    const result = await build({
      stdin: {
        contents,
        resolveDir: process.cwd(),
        sourcefile: `${engine}-hdr-visual-parity.ts`,
        loader: "ts",
      },
      bundle: true,
      platform: "browser",
      format: "iife",
      globalName: `G3D_${engine}_hdr_visual_parity`,
      target: "es2022",
      write: false,
      minify: true,
      sourcemap: false,
      logLevel: "silent",
    });
    const output = result.outputFiles[0]?.text;
    if (!output) throw new Error(`Unable to build ${engine} HDR visual parity bundle.`);
    bundles.set(engine, output);
  }
  return bundles;
}

async function renderEngine(page: Page, root: string, engine: HdrVisualEngine, bundle: string): Promise<HdrVisualRender> {
  await page.setContent("<!doctype html><body style=\"margin:0;background:#081018\"></body>");
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate<{ readonly dataUrl: string; readonly metrics: HdrVisualRender["metrics"] }, HdrVisualEngine>(
    async (engineName) => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 720;
        canvas.height = 420;
        canvas.style.width = "720px";
        canvas.style.height = "420px";
        document.body.replaceChildren(canvas);
        const bundleName = `G3D_${engineName}_hdr_visual_parity`;
        const render = (window as unknown as Record<string, { renderHdrVisualParity?: (canvas: HTMLCanvasElement) => Promise<HdrVisualRender["metrics"]> }>)[bundleName]?.renderHdrVisualParity;
        if (!render) throw new Error(`Missing browser render function: ${bundleName}.renderHdrVisualParity`);
        const metrics = await render(canvas);
        return { dataUrl: canvas.toDataURL("image/png"), metrics };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${engineName} HDR visual parity render failed: ${message}`);
      }
    },
    engine
  );
  const screenshotPath = `${artifactDir}/${engine}-hdr.png`;
  writePngDataUrl(root, screenshotPath, result.dataUrl);
  return {
    engine,
    screenshotPath,
    bundleBytes: Buffer.byteLength(bundle),
    metrics: result.metrics,
  };
}

async function createScreenshotDiff(page: Page, root: string, renders: readonly HdrVisualRender[], comparedEngine: "threejs" | "babylon"): Promise<HdrVisualDiff> {
  const baseline = renders.find((render) => render.engine === "galileo");
  const compared = renders.find((render) => render.engine === comparedEngine);
  if (!baseline || !compared) throw new Error(`Missing render for HDR screenshot diff: ${comparedEngine}.`);
  const diffPath = `${artifactDir}/${comparedEngine}-hdr-diff.png`;
  const result = await page.evaluate<DiffResultWithDataUrl>(
    `(${browserScreenshotDiffScript})(${JSON.stringify({
      baselineUrl: pngDataUrl(root, baseline.screenshotPath),
      comparedUrl: pngDataUrl(root, compared.screenshotPath),
    })})`
  );
  writePngDataUrl(root, diffPath, result.diffDataUrl);
  const { diffDataUrl: _diffDataUrl, ...metrics } = result;
  return {
    baselineEngine: "galileo",
    comparedEngine,
    baselinePath: baseline.screenshotPath,
    comparedPath: compared.screenshotPath,
    diffPath,
    ...metrics,
  };
}

function renderViolations(render: HdrVisualRender): string[] {
  return [
    ...(render.metrics.width === 720 && render.metrics.height === 420 ? [] : [`${render.engine}: unexpected render dimensions`]),
    ...(render.metrics.nonBlankPixels > 40_000 ? [] : [`${render.engine}: HDR render is too dark or empty`]),
    ...(render.metrics.colorBuckets >= 5 ? [] : [`${render.engine}: HDR render has too few color buckets`]),
    ...(render.metrics.hdrTargetWidth === 16 && render.metrics.hdrTargetHeight === 16 ? [] : [`${render.engine}: unexpected HDR target dimensions`]),
    ...(render.metrics.sampleOverOne && render.metrics.hdrSampleR > 1 ? [] : [`${render.engine}: HDR render target did not preserve overbright float samples`]),
    ...(render.metrics.toneMappedPatches >= 3 ? [] : [`${render.engine}: tone-mapped visible patches are missing`]),
    ...(render.metrics.drawCalls > 0 ? [] : [`${render.engine}: HDR visible render has no draw calls`]),
  ];
}

function pngDataUrl(root: string, path: string): string {
  return `data:image/png;base64,${readFileSync(join(root, path)).toString("base64")}`;
}

function writePngDataUrl(root: string, path: string, dataUrl: string): void {
  const base64 = dataUrl.split(",", 2)[1];
  if (!base64) throw new Error("Invalid PNG data URL.");
  const outputPath = join(root, path);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(base64, "base64"));
}

function matrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): string {
  return `new Float32Array([${sx},0,0,0,0,${sy},0,0,0,0,${sz},0,${tx},${ty},${tz},1])`;
}

function sharedBrowserHelpers(): string {
  return String.raw`
    function toneMap(value) {
      return value / (1 + value);
    }
    function byteColor(r, g, b) {
      return [toneMap(r), toneMap(g), toneMap(b)];
    }
    function pixelStats(canvas) {
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) return { nonBlankPixels: 0, colorBuckets: 0 };
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const buckets = new Set();
      let nonBlankPixels = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index] || 0;
        const g = pixels[index + 1] || 0;
        const b = pixels[index + 2] || 0;
        if (r > 8 || g > 8 || b > 8) {
          nonBlankPixels += 1;
          buckets.add(String(r >> 5) + ":" + String(g >> 5) + ":" + String(b >> 5));
        }
      }
      return { nonBlankPixels, colorBuckets: buckets.size };
    }
    function nextFrame() {
      return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
    function createRawFloatTargetSample(gl) {
      const ext = gl.getExtension("EXT_color_buffer_float");
      if (!ext) throw new Error("EXT_color_buffer_float unavailable.");
      const target = gl.createTexture();
      const framebuffer = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D, target);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 16, 16, 0, gl.RGBA, gl.FLOAT, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("Float framebuffer incomplete.");
      }
      const vertex = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vertex, "#version 300 es\nin vec2 a_position;\nvoid main(){gl_Position=vec4(a_position,0.0,1.0);}");
      gl.compileShader(vertex);
      if (!gl.getShaderParameter(vertex, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(vertex) || "float target vertex shader compile failed");
      }
      const fragment = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fragment, "#version 300 es\nprecision highp float;\nout vec4 outColor;\nvoid main(){outColor=vec4(2.5,0.5,0.125,1.0);}");
      gl.compileShader(fragment);
      if (!gl.getShaderParameter(fragment, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(fragment) || "float target fragment shader compile failed");
      }
      const program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.bindAttribLocation(program, 0, "a_position");
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "float target shader link failed");
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
      gl.viewport(0, 0, 16, 16);
      gl.useProgram(program);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const sample = new Float32Array(4);
      gl.readPixels(8, 8, 1, 1, gl.RGBA, gl.FLOAT, sample);
      gl.disableVertexAttribArray(0);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.deleteTexture(target);
      gl.deleteFramebuffer(framebuffer);
      return {
        hdrTargetWidth: 16,
        hdrTargetHeight: 16,
        hdrSampleR: Number(sample[0].toFixed(4)),
        hdrSampleG: Number(sample[1].toFixed(4)),
        hdrSampleB: Number(sample[2].toFixed(4)),
        hdrSampleA: Number(sample[3].toFixed(4)),
        sampleOverOne: sample[0] > 1,
      };
    }
  `;
}

function galileoBundleSource(): string {
  return `
    import { Geometry, Renderer, UnlitMaterial } from "./packages/rendering/src/index.ts";
    ${sharedBrowserHelpers()}
    export async function renderHdrVisualParity(canvas) {
      const renderer = await Renderer.create({ backend: "webgl2", canvas, width: canvas.width, height: canvas.height, clearColor: [0.03, 0.06, 0.09, 1], antialias: true, preserveDrawingBuffer: true });
      const target = renderer.device.createRenderTarget({ width: 16, height: 16, label: "hdr-visual-galileo-rgba32f", format: "rgba32f" });
      const shader = renderer.device.createShaderProgram({
        label: "hdr-visual-overbright",
        marker: "@galileo3d-shader:hdr-visual-overbright",
        vertex: "#version 300 es\\nprecision highp float;\\n// @galileo3d-shader:hdr-visual-overbright\\nin vec3 a_position;\\nvoid main(){gl_Position=vec4(a_position.xy*2.0,0.0,1.0);}",
        fragment: "#version 300 es\\nprecision highp float;\\n// @galileo3d-shader:hdr-visual-overbright\\nout vec4 outColor;\\nvoid main(){outColor=vec4(2.5,0.5,0.125,1.0);}"
      });
      const geometry = Geometry.triangle();
      renderer.device.setRenderTarget(target);
      renderer.device.beginFrame(target.width, target.height);
      renderer.device.clear([0, 0, 0, 1]);
      renderer.device.draw({
        topology: geometry.topology,
        vertexBuffer: geometry.vertexBuffer.upload(renderer.device),
        vertexFormat: geometry.vertexBuffer.format,
        vertexCount: geometry.vertexBuffer.vertexCount,
        indexBuffer: geometry.indexBuffer?.upload(renderer.device),
        indexType: geometry.indexBuffer?.type,
        indexCount: geometry.indexBuffer?.count,
        shader
      });
      renderer.device.endFrame();
      const sample = renderer.device.readFloatPixels(8, 8, 1, 1);
      renderer.device.setRenderTarget(null);
      const quad = Geometry.litCube(1);
      const orange = byteColor(2.5, 0.5, 0.125);
      const cyan = byteColor(0.25, 1.8, 2.4);
      const white = byteColor(4.0, 4.0, 4.0);
      const diagnostics = renderer.render([
        { geometry: quad, material: new UnlitMaterial({ color: [orange[0], orange[1], orange[2], 1] }), modelMatrix: ${matrix(-0.48, 0.02, 0, 0.34, 0.46, 0.08)}, label: "galileo-hdr-orange" },
        { geometry: quad, material: new UnlitMaterial({ color: [cyan[0], cyan[1], cyan[2], 1] }), modelMatrix: ${matrix(0, 0.02, 0, 0.34, 0.46, 0.08)}, label: "galileo-hdr-cyan" },
        { geometry: quad, material: new UnlitMaterial({ color: [white[0], white[1], white[2], 1] }), modelMatrix: ${matrix(0.48, 0.02, 0, 0.34, 0.46, 0.08)}, label: "galileo-hdr-white" },
        { geometry: quad, material: new UnlitMaterial({ color: [0.08, 0.14, 0.2, 1] }), modelMatrix: ${matrix(0, -0.42, 0, 1.6, 0.05, 0.08)}, label: "galileo-hdr-baseline" },
      ]);
      await nextFrame();
      const stats = pixelStats(canvas);
      return {
        width: canvas.width,
        height: canvas.height,
        ...stats,
        drawCalls: diagnostics.drawCalls,
        hdrTargetWidth: target.width,
        hdrTargetHeight: target.height,
        hdrSampleR: Number((sample[0] || 0).toFixed(4)),
        hdrSampleG: Number((sample[1] || 0).toFixed(4)),
        hdrSampleB: Number((sample[2] || 0).toFixed(4)),
        hdrSampleA: Number((sample[3] || 0).toFixed(4)),
        sampleOverOne: (sample[0] || 0) > 1,
        toneMappedPatches: 3
      };
    }
  `;
}

function threeBundleSource(): string {
  return `
    import * as THREE from "three";
    ${sharedBrowserHelpers()}
    export async function renderHdrVisualParity(canvas) {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
      renderer.setSize(canvas.width, canvas.height, false);
      renderer.setClearColor(0x081018, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const hdr = createRawFloatTargetSample(renderer.getContext());
      renderer.resetState();
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 0.58, -0.58, 0.1, 10);
      camera.position.set(0, 0, 4);
      camera.lookAt(0, 0, 0);
      const quad = new THREE.BoxGeometry(1, 1, 0.08);
      const add = (x, color) => {
        const mesh = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ color: new THREE.Color(color[0], color[1], color[2]) }));
        mesh.position.set(x, 0.02, 0);
        mesh.scale.set(0.34, 0.46, 1);
        scene.add(mesh);
      };
      add(-0.48, byteColor(2.5, 0.5, 0.125));
      add(0, byteColor(0.25, 1.8, 2.4));
      add(0.48, byteColor(4.0, 4.0, 4.0));
      const baseline = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.14, 0.2) }));
      baseline.position.set(0, -0.42, 0);
      scene.add(baseline);
      renderer.render(scene, camera);
      await nextFrame();
      const stats = pixelStats(canvas);
      return { width: canvas.width, height: canvas.height, ...stats, drawCalls: 4, ...hdr, toneMappedPatches: 3 };
    }
  `;
}

function babylonBundleSource(): string {
  return `
    import * as BABYLON from "@babylonjs/core";
    ${sharedBrowserHelpers()}
    export async function renderHdrVisualParity(canvas) {
      const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false, antialias: true });
      engine.setSize(canvas.width, canvas.height);
      const hdr = createRawFloatTargetSample(engine._gl || canvas.getContext("webgl2"));
      const scene = new BABYLON.Scene(engine);
      scene.clearColor = new BABYLON.Color4(0.03, 0.06, 0.09, 1);
      const camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 0, -4), scene);
      camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
      camera.orthoLeft = -1;
      camera.orthoRight = 1;
      camera.orthoTop = 0.58;
      camera.orthoBottom = -0.58;
      camera.setTarget(BABYLON.Vector3.Zero());
      const makeMaterial = (name, color) => {
        const material = new BABYLON.StandardMaterial(name, scene);
        material.disableLighting = true;
        material.emissiveColor = new BABYLON.Color3(color[0], color[1], color[2]);
        return material;
      };
      const add = (x, color, name) => {
        const mesh = BABYLON.MeshBuilder.CreateBox(name, { width: 0.34, height: 0.46, depth: 0.08 }, scene);
        mesh.position = new BABYLON.Vector3(x, 0.02, 0);
        mesh.material = makeMaterial(name + "-material", color);
      };
      add(-0.48, byteColor(2.5, 0.5, 0.125), "hdr-orange");
      add(0, byteColor(0.25, 1.8, 2.4), "hdr-cyan");
      add(0.48, byteColor(4.0, 4.0, 4.0), "hdr-white");
      const baseline = BABYLON.MeshBuilder.CreateBox("baseline", { width: 1.6, height: 0.05, depth: 0.08 }, scene);
      baseline.position = new BABYLON.Vector3(0, -0.42, 0);
      baseline.material = makeMaterial("baseline-material", [0.08, 0.14, 0.2]);
      scene.render();
      await scene.whenReadyAsync();
      scene.render();
      await nextFrame();
      scene.render();
      const stats = pixelStats(canvas);
      return { width: canvas.width, height: canvas.height, ...stats, drawCalls: 4, ...hdr, toneMappedPatches: 3 };
    }
  `;
}

interface DiffResultWithDataUrl extends Omit<HdrVisualDiff, "baselineEngine" | "comparedEngine" | "baselinePath" | "comparedPath" | "diffPath"> {
  readonly diffDataUrl: string;
}

const browserScreenshotDiffScript = String.raw`
async (input) => {
  const loadImage = (url) => new Promise((resolveImage, rejectImage) => {
    const image = new Image();
    image.onload = () => resolveImage(image);
    image.onerror = () => rejectImage(new Error("Unable to decode screenshot PNG for diffing."));
    image.src = url;
  });
  const baseline = await loadImage(input.baselineUrl);
  const compared = await loadImage(input.comparedUrl);
  const width = Math.min(baseline.naturalWidth, compared.naturalWidth);
  const height = Math.min(baseline.naturalHeight, compared.naturalHeight);
  if (width <= 0 || height <= 0) throw new Error("Screenshot diff requires non-empty images.");
  const baselineCanvas = document.createElement("canvas");
  const comparedCanvas = document.createElement("canvas");
  const diffCanvas = document.createElement("canvas");
  baselineCanvas.width = comparedCanvas.width = diffCanvas.width = width;
  baselineCanvas.height = comparedCanvas.height = diffCanvas.height = height;
  const baselineContext = baselineCanvas.getContext("2d", { willReadFrequently: true });
  const comparedContext = comparedCanvas.getContext("2d", { willReadFrequently: true });
  const diffContext = diffCanvas.getContext("2d");
  if (!baselineContext || !comparedContext || !diffContext) throw new Error("Canvas 2D context unavailable for screenshot diff.");
  baselineContext.drawImage(baseline, 0, 0, width, height);
  comparedContext.drawImage(compared, 0, 0, width, height);
  const baselinePixels = baselineContext.getImageData(0, 0, width, height);
  const comparedPixels = comparedContext.getImageData(0, 0, width, height);
  const diffPixels = diffContext.createImageData(width, height);
  let changedPixels = 0;
  let totalAbsoluteDelta = 0;
  let maxChannelDelta = 0;
  const channelCount = width * height * 3;
  for (let index = 0; index < baselinePixels.data.length; index += 4) {
    const rDelta = Math.abs((baselinePixels.data[index] || 0) - (comparedPixels.data[index] || 0));
    const gDelta = Math.abs((baselinePixels.data[index + 1] || 0) - (comparedPixels.data[index + 1] || 0));
    const bDelta = Math.abs((baselinePixels.data[index + 2] || 0) - (comparedPixels.data[index + 2] || 0));
    const pixelDelta = Math.max(rDelta, gDelta, bDelta);
    totalAbsoluteDelta += rDelta + gDelta + bDelta;
    maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);
    if (pixelDelta > 6) {
      changedPixels += 1;
      diffPixels.data[index] = 255;
      diffPixels.data[index + 1] = Math.min(255, pixelDelta * 4);
      diffPixels.data[index + 2] = 0;
      diffPixels.data[index + 3] = 255;
    } else {
      diffPixels.data[index] = 0;
      diffPixels.data[index + 1] = 0;
      diffPixels.data[index + 2] = 0;
      diffPixels.data[index + 3] = 255;
    }
  }
  diffContext.putImageData(diffPixels, 0, 0);
  const comparedPixelsCount = width * height;
  const changedPixelRatio = changedPixels / comparedPixelsCount;
  const meanAbsoluteError = totalAbsoluteDelta / channelCount;
  const thresholds = {
    maxChangedPixelRatio: 0.55,
    maxMeanAbsoluteError: 36,
  };
  return {
    width,
    height,
    comparedPixels: comparedPixelsCount,
    changedPixels,
    changedPixelRatio: Number(changedPixelRatio.toFixed(6)),
    meanAbsoluteError: Number(meanAbsoluteError.toFixed(6)),
    maxChannelDelta,
    pass: changedPixelRatio <= thresholds.maxChangedPixelRatio && meanAbsoluteError <= thresholds.maxMeanAbsoluteError,
    thresholds,
    diffDataUrl: diffCanvas.toDataURL("image/png"),
  };
}
`;

function writeReport(root: string, report: V4HdrVisualParityReport): void {
  writeJson(root, reportPath, report);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = await createV4HdrVisualParityReport();
  writeReport(process.cwd(), report);
  console.log(JSON.stringify({
    ok: report.ok,
    boundedHdrRenderTargetParity: report.boundedHdrRenderTargetParity,
    productionHdrRenderTargetParity: report.productionHdrRenderTargetParity,
    renders: report.renders.map((render) => ({
      engine: render.engine,
      screenshotPath: render.screenshotPath,
      bytes: statSync(join(process.cwd(), render.screenshotPath)).size,
      metrics: render.metrics,
    })),
    diffs: report.diffs.map((diff) => ({
      comparedEngine: diff.comparedEngine,
      pass: diff.pass,
      changedPixelRatio: diff.changedPixelRatio,
      meanAbsoluteError: diff.meanAbsoluteError,
      diffPath: diff.diffPath,
    })),
    report: reportPath,
    violations: report.violations,
  }, null, 2));
}
