import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("rendering WebGPU backend", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("reports injected WebGPU render-device capabilities and offscreen raster readback", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (moduleUrl) => {
      const { VertexFormat, createRenderDevice } = await import(moduleUrl);
      const device = await createRenderDevice({ backend: "webgpu", webgpu: createFakeWebGPU() });
      const buffer = device.createBuffer("vertex", 4, new Uint8Array([9, 8, 7, 6]));
      const readback = Array.from(device.readBuffer(buffer));
      const vertices = new Float32Array([
        -0.8, -0.8, 0,
        0.8, -0.8, 0,
        0, 0.8, 0
      ]);
      const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
      const lineVertices = new Float32Array([
        -0.75, 0, 0,
        0.75, 0, 0
      ]);
      const pointVertices = new Float32Array([
        0, 0.65, 0
      ]);
      const lineBuffer = device.createBuffer("vertex", lineVertices.byteLength, lineVertices);
      const pointBuffer = device.createBuffer("vertex", pointVertices.byteLength, pointVertices);
      const shader = device.createShaderProgram({
        label: "browser-webgpu-raster",
        marker: "@galileo3d-shader:browser-webgpu-raster",
        vertex: "// @galileo3d-shader:browser-webgpu-raster\nin vec3 position;",
        fragment: "// @galileo3d-shader:browser-webgpu-raster\nuniform vec4 u_color;"
      });
      const target = device.createRenderTarget({ width: 16, height: 16, label: "browser-webgpu-target" });
      device.setRenderTarget(target);
      device.beginFrame(16, 16);
      device.clear([0, 0, 0, 1]);
      device.draw({
        topology: "triangles",
        vertexBuffer,
        vertexFormat: VertexFormat.P3,
        vertexCount: 3,
        shader,
        uniforms: new Map([["u_color", [0.1, 0.8, 0.2, 1]]])
      });
      const centerPixel = Array.from(device.readPixels(8, 8, 1, 1));
      device.draw({
        topology: "lines",
        vertexBuffer: lineBuffer,
        vertexFormat: VertexFormat.P3,
        vertexCount: 2,
        shader,
        uniforms: new Map([["u_color", [0.9, 0.2, 0.1, 1]]])
      });
      device.draw({
        topology: "points",
        vertexBuffer: pointBuffer,
        vertexFormat: VertexFormat.P3,
        vertexCount: 1,
        shader,
        uniforms: new Map([["u_color", [0.1, 0.35, 1, 1]]])
      });
      device.endFrame();
      const linePixel = Array.from(device.readPixels(8, 8, 1, 1));
      const pointPixel = Array.from(device.readPixels(8, 2, 1, 1));
      const info = device.info;

      device.dispose();
      return {
        kind: device.kind,
        info,
        readback,
        centerPixel,
        linePixel,
        pointPixel,
        disposed: device.disposed
      };

      function createFakeWebGPU() {
        return {
          async requestAdapter() {
            return {
              name: "browser-render-webgpu-adapter",
              async requestDevice() {
                return createFakeDevice();
              }
            };
          }
        };
      }

      function createFakeDevice() {
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
          destroy() {}
        };
      }
    }, `${server.origin}/packages/rendering/src/index.ts`);

    expect(result.kind).toBe("webgpu");
    expect(result.info.renderer).toBe("browser-render-webgpu-adapter");
    expect(result.info.capabilities).toEqual(expect.arrayContaining(["buffers", "buffer-readback", "draw-validation"]));
    expect(result.info.capabilities).toContain("rasterization");
    expect(result.info.limitations.join(" ")).toContain("native WebGPU render-pipeline");
    expect(result.readback).toEqual([9, 8, 7, 6]);
    expect(result.centerPixel).toEqual([26, 204, 51, 255]);
    expect(result.linePixel).toEqual([230, 51, 26, 255]);
    expect(result.pointPixel).toEqual([26, 89, 255, 255]);
    expect(result.disposed).toBe(true);
  });

  test("rejects malformed browser-side WebGPU devices with explicit diagnostics", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (moduleUrl) => {
      const { createRenderDevice } = await import(moduleUrl);

      try {
        await createRenderDevice({
          backend: "webgpu",
          webgpu: {
            async requestAdapter() {
              return {
                name: "browser-invalid-webgpu-adapter",
                async requestDevice() {
                  return {
                    queue: {
                      submit() {}
                    },
                    createBuffer() {
                      return { destroy() {} };
                    }
                  };
                }
              };
            }
          }
        });
        return { ok: true };
      } catch (error) {
        const renderError = error as Error & { code?: string; details?: { missing?: readonly string[] } };
        return {
          ok: false,
          name: renderError.name,
          code: renderError.code,
          missing: renderError.details?.missing ?? []
        };
      }
    }, `${server.origin}/packages/rendering/src/index.ts`);

    expect(result).toMatchObject({
      ok: false,
      name: "RenderDeviceError",
      code: "WEBGPU_DEVICE_INVALID",
      missing: expect.arrayContaining(["queue.writeBuffer"])
    });
  });

  test("reports browser WebGPU unavailable paths without silently falling back", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (moduleUrl) => {
      const { createRenderDevice } = await import(moduleUrl);
      const originalGpu = (navigator as Navigator & { gpu?: unknown }).gpu;
      const hadOwnGpu = Object.prototype.hasOwnProperty.call(navigator, "gpu");
      const capture = async (operation: () => Promise<unknown>) => {
        try {
          await operation();
          return { ok: true };
        } catch (error) {
          const renderError = error as Error & { code?: string };
          return { ok: false, name: renderError.name, code: renderError.code, message: renderError.message };
        }
      };

      Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true });
      const missingRuntime = await capture(() => createRenderDevice({ backend: "webgpu" }));
      if (hadOwnGpu) {
        Object.defineProperty(navigator, "gpu", { value: originalGpu, configurable: true });
      } else {
        delete (navigator as Navigator & { gpu?: unknown }).gpu;
      }
      const missingAdapter = await capture(() => createRenderDevice({
        backend: "webgpu",
        webgpu: {
          async requestAdapter() {
            return null;
          }
        }
      }));

      return { missingRuntime, missingAdapter };
    }, `${server.origin}/packages/rendering/src/index.ts`);

    expect(result.missingRuntime).toMatchObject({
      ok: false,
      name: "RenderDeviceError",
      code: "WEBGPU_RUNTIME_MISSING"
    });
    expect(result.missingAdapter).toMatchObject({
      ok: false,
      name: "RenderDeviceError",
      code: "WEBGPU_ADAPTER_MISSING"
    });
  });

  test("configures an injected WebGPU canvas surface and presents through a native render pass", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (moduleUrl) => {
      const { VertexFormat, createRenderDevice } = await import(moduleUrl);
      const state = {
        configurations: [] as unknown[],
        textureViews: [] as number[],
        renderPasses: [] as Array<{ label?: string; pipeline?: string; bindGroups: number[]; drawCalls: Array<{ kind: string; count: number }> }>,
        bindGroups: [] as unknown[],
        uniformWrites: [] as number[][],
        submissions: 0,
        unconfigured: false
      };
      const device = await createRenderDevice({
        backend: "webgpu",
        webgpu: createNativeFakeWebGPU(state),
        canvas: createFakeCanvas(state) as unknown as HTMLCanvasElement
      });
      const vertices = new Float32Array([
        -0.6, -0.6, 0,
        0.6, -0.6, 0,
        0, 0.6, 0
      ]);
      const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
      const shader = device.createShaderProgram({
        label: "browser-webgpu-canvas",
        marker: "@galileo3d-shader:browser-webgpu-canvas",
        vertex: "// @galileo3d-shader:browser-webgpu-canvas\nin vec3 position;",
        fragment: "// @galileo3d-shader:browser-webgpu-canvas\nuniform vec4 color;"
      });

      device.beginFrame(32, 32);
      device.clear([0, 0, 0, 1]);
      device.draw({
        label: "browser-canvas-triangle",
        topology: "triangles",
        vertexBuffer,
        vertexFormat: VertexFormat.P3,
        vertexCount: 3,
        shader
      });
      device.endFrame();
      const info = device.info;
      const diagnostics = device.getDiagnostics();
      device.dispose();

      return {
        capabilities: info.capabilities,
        limitations: info.limitations,
        diagnostics,
        configurations: state.configurations,
        textureViews: state.textureViews,
        renderPasses: state.renderPasses,
        bindGroups: state.bindGroups,
        uniformWrites: state.uniformWrites,
        submissions: state.submissions,
        unconfigured: state.unconfigured
      };

      function createFakeCanvas(surfaceState: typeof state) {
        return {
          getContext(type: string) {
            if (type !== "webgpu") return null;
            return {
              configure(configuration: unknown) {
                surfaceState.configurations.push(configuration);
              },
              getCurrentTexture() {
                return {
                  createView() {
                    const id = surfaceState.textureViews.length + 1;
                    surfaceState.textureViews.push(id);
                    return { id };
                  },
                  destroy() {}
                };
              },
              unconfigure() {
                surfaceState.unconfigured = true;
              }
            };
          }
        };
      }

      function createNativeFakeWebGPU(surfaceState: typeof state) {
        return {
          getPreferredCanvasFormat() {
            return "bgra8unorm";
          },
          async requestAdapter() {
            return {
              name: "browser-native-canvas-adapter",
              async requestDevice() {
                return {
                  queue: {
                    writeBuffer(buffer: { data: Uint8Array; usage?: string }, offset: number, data: ArrayBuffer | ArrayBufferView) {
                      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
                      buffer.data.set(bytes, offset);
                      if (buffer.usage === "uniform") {
                        surfaceState.uniformWrites.push(Array.from(new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)));
                      }
                    },
                    submit(commands: readonly unknown[]) {
                      surfaceState.submissions += commands.length;
                    }
                  },
                  createBuffer(descriptor: { size: number; usage?: number }) {
                    return {
                      data: new Uint8Array(descriptor.size),
                      usage: descriptor.usage && (descriptor.usage & 0x0040) !== 0 ? "uniform" : "buffer",
                      destroy() {
                        this.data = new Uint8Array(0);
                      }
                    };
                  },
                  createShaderModule(descriptor: { label?: string; code: string }) {
                    return descriptor;
                  },
                  createRenderPipeline(descriptor: { label?: string }) {
                    return {
                      label: descriptor.label,
                      getBindGroupLayout(index: number) {
                        return { index, pipeline: descriptor.label };
                      }
                    };
                  },
                  createBindGroup(descriptor: { label?: string; entries: unknown[] }) {
                    const bindGroup = { label: descriptor.label, entries: descriptor.entries };
                    surfaceState.bindGroups.push(bindGroup);
                    return bindGroup;
                  },
                  createTexture() {
                    return {
                      createView() {
                        return { id: 0 };
                      },
                      destroy() {}
                    };
                  },
                  createCommandEncoder() {
                    return {
                      beginRenderPass(descriptor: { label?: string }) {
                        const pass = { label: descriptor.label, pipeline: undefined as string | undefined, bindGroups: [] as number[], drawCalls: [] as Array<{ kind: string; count: number }> };
                        surfaceState.renderPasses.push(pass);
                        return {
                          setPipeline(pipeline: { label?: string }) {
                            pass.pipeline = pipeline.label;
                          },
                          setVertexBuffer() {},
                          setBindGroup(index: number) {
                            pass.bindGroups.push(index);
                          },
                          draw(count: number) {
                            pass.drawCalls.push({ kind: "draw", count });
                          },
                          end() {}
                        };
                      },
                      finish() {
                        return {};
                      }
                    };
                  },
                  destroy() {}
                };
              }
            };
          }
        };
      }
    }, `${server.origin}/packages/rendering/src/index.ts`);

    expect(result.capabilities).toEqual(expect.arrayContaining(["native-render-pipeline", "canvas-surface"]));
    expect(result.limitations.join(" ")).not.toContain("Canvas presentation requires");
    expect(result.diagnostics.nativeSubmissions).toBe(1);
    expect(result.configurations).toHaveLength(1);
    expect(result.textureViews).toEqual([1]);
    expect(result.renderPasses).toEqual([
      expect.objectContaining({
        label: "browser-canvas-triangle-pass",
        pipeline: "browser-webgpu-canvas-pipeline",
        bindGroups: [0],
        drawCalls: [{ kind: "draw", count: 3 }]
      })
    ]);
    expect(result.bindGroups).toEqual([
      expect.objectContaining({
        label: "browser-canvas-triangle-fragment-bind-group"
      })
    ]);
    expect(result.uniformWrites).toEqual([[1, 1, 1, 1]]);
    expect(result.submissions).toBeGreaterThanOrEqual(1);
    expect(result.unconfigured).toBe(true);
  });
});
