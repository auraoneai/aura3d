import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("WebGPU error diagnostics", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("surfaces invalid WGSL, missing bindings, incompatible vertex layouts, and unsupported feature errors", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (moduleUrl) => {
      const { VertexFormat, createRenderDevice } = await import(moduleUrl);

      const capture = async (operation: () => Promise<unknown> | unknown) => {
        try {
          await operation();
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            name: error instanceof Error ? error.name : "UnknownError",
            message: error instanceof Error ? error.message : String(error),
            code: typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : null
          };
        }
      };

      const invalidWgslDevice = await createRenderDevice({ backend: "webgpu", webgpu: createDiagnosticWebGPU("invalid-wgsl") });
      const invalidWgsl = await capture(() => invalidWgslDevice.createShaderProgram({
        label: "invalid-wgsl",
        marker: "@galileo3d-shader:invalid-wgsl",
        vertex: "// @galileo3d-shader:invalid-wgsl\n@vertex fn vs_main() -> @builtin(position) vec4<f32> { definitely_invalid_wgsl }",
        fragment: "// @galileo3d-shader:invalid-wgsl\n@fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }"
      }));
      invalidWgslDevice.dispose();

      const missingBinding = await runDrawCase("missing-binding");
      const incompatibleVertexLayout = await runDrawCase("incompatible-vertex-layout");
      const unsupportedFeature = await capture(() => createRenderDevice({
        backend: "webgpu",
        webgpu: {
          async requestAdapter() {
            return {
              name: "unsupported-feature-adapter",
              async requestDevice() {
                throw new Error("required feature texture-compression-bc is not supported");
              }
            };
          }
        }
      }));

      return { invalidWgsl, missingBinding, incompatibleVertexLayout, unsupportedFeature };

      async function runDrawCase(mode: "missing-binding" | "incompatible-vertex-layout") {
        const device = await createRenderDevice({ backend: "webgpu", webgpu: createDiagnosticWebGPU(mode) });
        const vertices = new Float32Array([
          -0.5, -0.5, 0,
          0.5, -0.5, 0,
          0, 0.5, 0
        ]);
        const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
        const shader = device.createShaderProgram({
          label: mode,
          marker: `@galileo3d-shader:${mode}`,
          vertex: `// @galileo3d-shader:${mode}\nin vec3 position;`,
          fragment: `// @galileo3d-shader:${mode}\nuniform vec4 color;`
        });
        const target = device.createRenderTarget({ width: 8, height: 8, label: mode });
        device.setRenderTarget(target);
        device.beginFrame(8, 8);
        const diagnostic = await capture(() => device.draw({
          label: mode,
          topology: "triangles",
          vertexBuffer,
          vertexFormat: VertexFormat.P3,
          vertexCount: 3,
          shader
        }));
        device.dispose();
        return diagnostic;
      }

      function createDiagnosticWebGPU(mode: "invalid-wgsl" | "missing-binding" | "incompatible-vertex-layout") {
        return {
          async requestAdapter() {
            return {
              name: `diagnostic-${mode}-adapter`,
              async requestDevice() {
                return createDiagnosticDevice(mode);
              }
            };
          }
        };
      }

      function createDiagnosticDevice(mode: "invalid-wgsl" | "missing-binding" | "incompatible-vertex-layout") {
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
          createShaderModule(descriptor: { code: string }) {
            if (mode === "invalid-wgsl" && descriptor.code.includes("definitely_invalid_wgsl")) {
              throw new Error("WGSL compilation failed: unexpected identifier definitely_invalid_wgsl");
            }
            return { mode, code: descriptor.code };
          },
          createTexture() {
            return {
              createView() {
                return { mode };
              },
              destroy() {}
            };
          },
          createRenderPipeline(descriptor: { vertex?: { buffers?: readonly unknown[] } }) {
            if (mode === "missing-binding") {
              throw new Error("WebGPU pipeline validation failed: missing @group(0) @binding(0)");
            }
            if (mode === "incompatible-vertex-layout" && descriptor.vertex?.buffers?.length) {
              throw new Error("WebGPU pipeline validation failed: vertex buffer layout is incompatible with shader input");
            }
            return {
              getBindGroupLayout(index: number) {
                return { index };
              }
            };
          },
          createBindGroup() {
            return {};
          },
          createCommandEncoder() {
            return {
              beginRenderPass() {
                return {
                  setPipeline() {},
                  setVertexBuffer() {},
                  setBindGroup() {},
                  draw() {},
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
    }, `${server.origin}/packages/rendering/src/index.ts`);

    expect(result.invalidWgsl).toMatchObject({ ok: false });
    expect(result.invalidWgsl.message).toContain("WGSL compilation failed");
    expect(result.missingBinding).toMatchObject({ ok: false });
    expect(result.missingBinding.message).toContain("missing @group(0) @binding(0)");
    expect(result.incompatibleVertexLayout).toMatchObject({ ok: false });
    expect(result.incompatibleVertexLayout.message).toContain("vertex buffer layout is incompatible");
    expect(result.unsupportedFeature).toMatchObject({
      ok: false,
      name: "RenderDeviceError",
      code: "WEBGPU_DEVICE_REQUEST_FAILED"
    });
    expect(result.unsupportedFeature.message).toContain("WebGPU adapter failed to create a device");
  });
});
