import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { arch, platform, release } from "node:os";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { startExampleDevServer } from "../browser/example-dev-server";

interface BaselineResult {
  readonly backend: "webgl2" | "webgpu";
  readonly scene: string;
  readonly evidenceType: "real-browser-webgl2" | "injected-webgpu-contract";
  readonly status: "pass" | "unavailable";
  readonly frames: number;
  readonly elapsedMs?: number;
  readonly averageFrameMs?: number;
  readonly drawCalls?: number;
  readonly readbackPixel?: readonly number[];
  readonly details?: Record<string, unknown>;
  readonly error?: string;
}

interface ComparisonReport {
  readonly generatedAt: string;
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
  readonly source: "tests/performance/webgpu-vs-webgl2-baseline.ts";
  readonly status: "pass" | "partial";
  readonly os: {
    readonly platform: string;
    readonly release: string;
  };
  readonly userAgent: string;
  readonly baselines: readonly BaselineResult[];
  readonly comparisons: readonly {
    readonly scene: string;
    readonly note: string;
    readonly webgl2AverageFrameMs?: number;
    readonly webgpuAverageFrameMs?: number;
    readonly ratioWebGPUToWebGL2?: number;
  }[];
}

const FRAMES = 90;
const SCENES = ["offscreen-triangle-render-target-readback", "offscreen-instanced-triangles-render-target-readback"] as const;

function round(value: number, places = 4): number {
  return Number(value.toFixed(places));
}

async function main(): Promise<void> {
  const server = await startExampleDevServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async ({ moduleUrl, frames, scenes }) => {
      const { VertexFormat, createRenderDevice } = await import(moduleUrl);
      const userAgent = navigator.userAgent;
      const baselines = [];
      for (const scene of scenes) {
        baselines.push(await measureBackend("webgl2", scene));
        baselines.push(await measureBackend("webgpu", scene));
      }

      return { userAgent, baselines };

      async function measureBackend(backend: "webgl2" | "webgpu", scene: typeof scenes[number]) {
        const evidenceType = backend === "webgl2" ? "real-browser-webgl2" : "injected-webgpu-contract";
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 64;
          canvas.height = 64;
          document.body.append(canvas);
          const device = await createRenderDevice(backend === "webgpu"
            ? { backend, webgpu: createInjectedWebGPU() }
            : { backend, canvas });
          const shader = device.createShaderProgram({
            label: `${backend}-baseline-shader`,
            marker: `@galileo3d-shader:${backend}-baseline`,
            vertex: scene === "offscreen-instanced-triangles-render-target-readback" ? `#version 300 es
// @galileo3d-shader:${backend}-baseline
precision highp float;
layout(location = 0) in vec3 a_position;
uniform mat4 u_instanceMatrices[64];
uniform float u_instanceCount;
void main() {
  int instanceIndex = clamp(gl_InstanceID, 0, max(int(u_instanceCount) - 1, 0));
  gl_Position = u_instanceMatrices[instanceIndex] * vec4(a_position, 1.0);
}
` : `#version 300 es
// @galileo3d-shader:${backend}-baseline
precision highp float;
layout(location = 0) in vec3 a_position;
void main() {
  gl_Position = vec4(a_position, 1.0);
}
`,
            fragment: `#version 300 es
// @galileo3d-shader:${backend}-baseline
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  outColor = u_color;
}
`
          });
          const isInstanced = scene === "offscreen-instanced-triangles-render-target-readback";
          const vertexBuffer = device.createBuffer("vertex", 36, isInstanced ? new Float32Array([
            -0.18, -0.22, 0,
            0.18, -0.22, 0,
            0, 0.22, 0
          ]) : new Float32Array([
            -0.7, -0.7, 0,
            0.7, -0.7, 0,
            0, 0.7, 0
          ]));
          const instanceMatrices = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            -0.42, 0, 0, 1,
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0.42, 0, 0, 1
          ]);
          const uniforms = new Map<string, number[] | Float32Array>([
            ["u_color", [0.85, 0.25, 0.12, 1]]
          ]);
          if (isInstanced) {
            uniforms.set("u_instanceMatrices", instanceMatrices);
            uniforms.set("u_instanceCount", [2]);
          }
          const target = device.createRenderTarget({ width: 64, height: 64, label: `${backend}-baseline-target` });
          device.setRenderTarget(target);

          const before = performance.now();
          for (let frame = 0; frame < frames; frame += 1) {
            const green = 0.25 + (frame % 16) / 32;
            device.beginFrame(64, 64);
            device.clear([0.02, 0.03, 0.04, 1]);
            uniforms.set("u_color", [0.85, green, 0.12, 1]);
            device.draw({
              label: `${backend}-baseline-triangle`,
              topology: "triangles",
              vertexBuffer,
              vertexFormat: VertexFormat.P3,
              vertexCount: 3,
              ...(isInstanced ? { instanceCount: 2 } : {}),
              shader,
              uniforms
            });
            device.endFrame();
          }
          const elapsedMs = performance.now() - before;
          const readbackPixel = Array.from(device.readPixels(isInstanced ? 19 : 32, 32, 1, 1));
          const rightReadbackPixel = isInstanced ? Array.from(device.readPixels(45, 32, 1, 1)) : undefined;
          const diagnostics = device.getDiagnostics();
          device.dispose();
          canvas.remove();

          return {
            backend,
            scene,
            evidenceType,
            status: "pass",
            frames,
            elapsedMs: roundBrowser(elapsedMs, 3),
            averageFrameMs: roundBrowser(elapsedMs / frames),
            drawCalls: diagnostics.drawCalls,
            readbackPixel,
            details: {
              capabilities: device.info.capabilities ?? [],
              limitations: device.info.limitations ?? [],
              renderer: device.info.renderer,
              ...(rightReadbackPixel ? { rightReadbackPixel } : {})
            }
          };
        } catch (error) {
          return {
            backend,
            scene,
            evidenceType,
            status: "unavailable",
            frames,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      function roundBrowser(value: number, places = 4) {
        return Number(value.toFixed(places));
      }

      function createInjectedWebGPU() {
        return {
          async requestAdapter() {
            return {
              name: "webgpu-vs-webgl2-injected-render-adapter",
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
    }, { moduleUrl: `${server.origin}/packages/rendering/src/index.ts`, frames: FRAMES, scenes: SCENES });

    const baselines = result.baselines as BaselineResult[];
    const comparisons = SCENES.map((scene) => {
      const webgl2 = baselines.find((baseline) => baseline.scene === scene && baseline.backend === "webgl2" && baseline.status === "pass");
      const webgpu = baselines.find((baseline) => baseline.scene === scene && baseline.backend === "webgpu" && baseline.status === "pass");
      return {
      scene,
      note: "WebGPU uses the current injected render-device contract; this is not real WebGPU hardware evidence.",
      ...(webgl2?.averageFrameMs !== undefined ? { webgl2AverageFrameMs: webgl2.averageFrameMs } : {}),
      ...(webgpu?.averageFrameMs !== undefined ? { webgpuAverageFrameMs: webgpu.averageFrameMs } : {}),
      ...(webgl2?.averageFrameMs !== undefined && webgpu?.averageFrameMs !== undefined
        ? { ratioWebGPUToWebGL2: round(webgpu.averageFrameMs / webgl2.averageFrameMs) }
        : {})
      };
    });
    const report: ComparisonReport = {
      generatedAt: new Date().toISOString(),
      releaseRunId: process.env.G3D_RELEASE_RUN_ID ?? "standalone-webgpu-vs-webgl2-run",
      gitSha: gitSha(),
      command: "tsx --tsconfig tsconfig.base.json tests/performance/webgpu-vs-webgl2-baseline.ts --write-report",
      environment: {
        platform: platform(),
        release: release(),
        arch: arch(),
        node: process.version
      },
      sourceInputs: [
        "tests/performance/webgpu-vs-webgl2-baseline.ts",
        "packages/rendering/src/WebGL2Device.ts",
        "packages/rendering/src/WebGPUDevice.ts"
      ],
      source: "tests/performance/webgpu-vs-webgl2-baseline.ts",
      status: baselines.every((baseline) => baseline.status === "pass") ? "pass" : "partial",
      os: {
        platform: platform(),
        release: release()
      },
      userAgent: result.userAgent,
      baselines,
      comparisons
    };

    if (process.argv.includes("--write-report")) {
      const reportPath = resolve("tests/reports/webgpu-vs-webgl2.json");
      mkdirSync(dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
}

function gitSha(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
