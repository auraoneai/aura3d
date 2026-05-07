import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("GPU particle backend", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("reports unsupported capability when WebGPU is absent", async ({ page }) => {
    await page.goto(`${server.origin}/examples/10-particles/index.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (moduleUrl) => {
      const { detectGPUParticleBackend, UnsupportedGPUParticleBackend } = await import(moduleUrl);
      const capabilities = detectGPUParticleBackend({ navigator: {} });
      const backend = new UnsupportedGPUParticleBackend(capabilities);
      let rejected = false;

      try {
        await backend.initialize();
      } catch {
        rejected = true;
      }

      return { capabilities, rejected };
    }, `${server.origin}/packages/rendering/src/index.ts`);

    expect(result.capabilities.supported).toBe(false);
    expect(result.capabilities.backend).toBe("none");
    expect(result.capabilities.reason).toContain("WebGPU");
    expect(result.rejected).toBe(true);
  });

  test("runs WebGPU compute update contract with a browser-side device", async ({ page }) => {
    await page.goto(`${server.origin}/examples/10-particles/index.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (moduleUrl) => {
      const { WebGPUParticleBackend, queryGPUParticleBackendCapabilities } = await import(moduleUrl);
      const fakeGpu = createFakeWebGPU();
      const capabilities = await queryGPUParticleBackendCapabilities({ navigator: { gpu: fakeGpu } });
      const backend = new WebGPUParticleBackend({ gpu: fakeGpu });
      await backend.initialize();

      const update = await backend.update({
        count: 2,
        deltaTime: 0.5,
        positions: new Float32Array([0, 1, 2, 0, 10, 20, 30, 0]),
        velocities: new Float32Array([2, 4, 6, 0, -2, -4, -6, 0]),
      });
      backend.dispose();

      return {
        capabilities,
        count: update.count,
        workgroups: update.workgroups,
        positions: Array.from(update.positions),
        velocities: Array.from(update.velocities),
      };

      function createFakeWebGPU() {
        const device = createFakeDevice();
        return {
          async requestAdapter() {
            return {
              name: "browser-test-webgpu-adapter",
              async requestDevice() {
                return device;
              },
            };
          },
        };
      }

      function createFakeDevice() {
        return {
          queue: {
            writeBuffer(buffer: { data: ArrayBuffer }, offset: number, data: ArrayBuffer | ArrayBufferView) {
              const source = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
              new Uint8Array(buffer.data).set(source, offset);
            },
            submit() {},
          },
          createShaderModule(descriptor: { code: string }) {
            return { code: descriptor.code };
          },
          createComputePipeline() {
            return {
              getBindGroupLayout() {
                return {};
              },
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
              destroy() {},
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
                    const positionBuffer = bindGroup.entries[0].resource.buffer;
                    const velocityBuffer = bindGroup.entries[1].resource.buffer;
                    const accelerationBuffer = bindGroup.entries[2].resource.buffer;
                    const paramsBuffer = bindGroup.entries[3].resource.buffer;
                    const params = new DataView(paramsBuffer.data);
                    const deltaTime = params.getFloat32(0, true);
                    const count = params.getUint32(4, true);
                    const positions = new Float32Array(positionBuffer.data);
                    const velocities = new Float32Array(velocityBuffer.data);
                    const accelerations = new Float32Array(accelerationBuffer.data);

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
                  end() {},
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
              },
            };
          },
          destroy() {},
        };
      }
    }, `${server.origin}/packages/rendering/src/index.ts`);

    expect(result.capabilities).toMatchObject({
      supported: true,
      backend: "webgpu",
      adapterName: "browser-test-webgpu-adapter",
    });
    expect(result.count).toBe(2);
    expect(result.workgroups).toBe(1);
    expect(result.positions).toEqual([1, 3, 5, 0.5, 9, 18, 27, 0.5]);
    expect(result.velocities).toEqual([2, 4, 6, 0, -2, -4, -6, 0]);
  });

  test("integrates ParticleSystem through explicit GPU update path", async ({ page }) => {
    await page.goto(`${server.origin}/examples/10-particles/index.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (moduleUrl) => {
      const { ParticleEmitter, ParticleSystem, WebGPUParticleBackend } = await import(moduleUrl);
      const backend = new WebGPUParticleBackend({ gpu: createFakeWebGPU() });
      const system = new ParticleSystem({
        maxParticles: 2,
        emitters: [
          new ParticleEmitter({
            seed: 11,
            emissionRate: 0,
            bursts: [{ time: 0, count: 1 }],
            lifetime: 2,
            speed: 0,
            shape: { type: "point", position: { x: 1, y: 2, z: 3 } },
            initial: {
              acceleration: { x: 0, y: -8, z: 0 },
            },
          }),
        ],
      });

      await system.updateOnGPU(0.25, backend);
      const particle = system.particles[0];
      const stats = system.getStats();
      backend.dispose();

      return {
        position: particle.position,
        previousPosition: particle.previousPosition,
        velocity: particle.velocity,
        age: particle.age,
        liveCount: stats.liveCount,
        spawnedCount: stats.spawnedCount,
        gpuSpawns: stats.gpuSpawns,
        gpuUpdates: stats.gpuUpdates,
        bufferUploads: stats.bufferUploads,
        uploadedBytes: stats.uploadedBytes,
      };

      function createFakeWebGPU() {
        const device = createFakeDevice();
        return {
          async requestAdapter() {
            return {
              name: "browser-test-webgpu-adapter",
              async requestDevice() {
                return device;
              },
            };
          },
        };
      }

      function createFakeDevice() {
        return {
          queue: {
            writeBuffer(buffer: { data: ArrayBuffer }, offset: number, data: ArrayBuffer | ArrayBufferView) {
              const source = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
              new Uint8Array(buffer.data).set(source, offset);
            },
            submit() {},
          },
          createShaderModule(descriptor: { code: string }) {
            return { code: descriptor.code };
          },
          createComputePipeline() {
            return {
              getBindGroupLayout() {
                return {};
              },
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
              destroy() {},
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
                    const positionBuffer = bindGroup.entries[0].resource.buffer;
                    const velocityBuffer = bindGroup.entries[1].resource.buffer;
                    const accelerationBuffer = bindGroup.entries[2].resource.buffer;
                    const paramsBuffer = bindGroup.entries[3].resource.buffer;
                    const params = new DataView(paramsBuffer.data);
                    const deltaTime = params.getFloat32(0, true);
                    const count = params.getUint32(4, true);
                    const positions = new Float32Array(positionBuffer.data);
                    const velocities = new Float32Array(velocityBuffer.data);
                    const accelerations = new Float32Array(accelerationBuffer.data);

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
                  end() {},
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
              },
            };
          },
          destroy() {},
        };
      }
    }, `${server.origin}/packages/rendering/src/index.ts`);

    expect(result.liveCount).toBe(1);
    expect(result.spawnedCount).toBe(1);
    expect(result.gpuSpawns).toBe(1);
    expect(result.gpuUpdates).toBe(1);
    expect(result.bufferUploads).toBe(2);
    expect(result.uploadedBytes).toBe(128);
    expect(result.previousPosition).toEqual({ x: 1, y: 2, z: 3 });
    expect(result.position).toEqual({ x: 1, y: 1.5, z: 3 });
    expect(result.velocity).toEqual({ x: 0, y: -2, z: 0 });
    expect(result.age).toBe(0.25);
  });

  test("draws WebGPU-updated particles through an async browser render graph pass", async ({ page }) => {
    await page.goto(`${server.origin}/examples/10-particles/index.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (moduleUrl) => {
      const {
        MockRenderDevice,
        ParticleRenderPass,
        ParticleSystem,
        RenderGraph,
        WebGPUParticleBackend,
        createParticle,
      } = await import(moduleUrl);
      const backend = new WebGPUParticleBackend({ gpu: createFakeWebGPU() });
      const system = new ParticleSystem({ maxParticles: 2 });
      system.particles.push(
        createParticle({
          id: 1,
          position: { x: 0, y: 0, z: 1 },
          velocity: { x: 0, y: 0, z: 2 },
          color: { r: 1, g: 0, b: 0, a: 1 },
          size: 1,
          lifetime: 4,
        }),
        createParticle({
          id: 2,
          position: { x: 0, y: 0, z: 5 },
          velocity: { x: 0, y: 0, z: -2 },
          color: { r: 0, g: 0, b: 1, a: 1 },
          size: 1,
          lifetime: 4,
        }),
      );

      const canvas = document.createElement("canvas");
      canvas.width = 4;
      canvas.height = 4;
      document.body.appendChild(canvas);
      const context = canvas.getContext("2d");
      if (!context) return { status: "error", error: "2D context unavailable" };
      const drawOrders: number[][] = [];

      const pass = new ParticleRenderPass({
        system,
        target: {
          drawParticles(batch) {
            drawOrders.push(batch.sprites.map((sprite) => sprite.id));
            context.clearRect(0, 0, canvas.width, canvas.height);
            for (const sprite of batch.sprites) {
              context.fillStyle = `rgba(${Math.round(sprite.color.r * 255)}, ${Math.round(sprite.color.g * 255)}, ${Math.round(sprite.color.b * 255)}, ${sprite.color.a})`;
              context.fillRect(1, 1, 2, 2);
            }
          },
        },
        update: { deltaTime: 0.5, gpuBackend: backend },
        renderOptions: { sort: "back-to-front", cameraPosition: { x: 0, y: 0, z: 0 } },
        reads: ["scene-color"],
        writes: ["scene-color-with-particles"],
      });
      const graph = new RenderGraph();
      graph.addPass({ name: "scene", reads: [], writes: ["scene-color"], execute() {} });
      graph.addPass(pass);

      await graph.executeAsync({ device: new MockRenderDevice(), width: 4, height: 4 });
      const batch = pass.getLastBatch();
      const stats = system.getStats();
      const pixel = Array.from(context.getImageData(1, 1, 1, 1).data);
      backend.dispose();

      return {
        status: "ready",
        updateMode: pass.getLastUpdateMode(),
        drawOrders,
        spritePositions: batch?.sprites.map((sprite) => [sprite.id, sprite.position.z]),
        pixel,
        stats,
      };

      function createFakeWebGPU() {
        const device = createFakeDevice();
        return {
          async requestAdapter() {
            return {
              name: "browser-render-graph-webgpu-adapter",
              async requestDevice() {
                return device;
              },
            };
          },
        };
      }

      function createFakeDevice() {
        return {
          queue: {
            writeBuffer(buffer: { data: ArrayBuffer }, offset: number, data: ArrayBuffer | ArrayBufferView) {
              const source = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
              new Uint8Array(buffer.data).set(source, offset);
            },
            submit() {},
          },
          createShaderModule(descriptor: { code: string }) {
            return { code: descriptor.code };
          },
          createComputePipeline() {
            return {
              getBindGroupLayout() {
                return {};
              },
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
              destroy() {},
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
                    const positionBuffer = bindGroup.entries[0].resource.buffer;
                    const velocityBuffer = bindGroup.entries[1].resource.buffer;
                    const accelerationBuffer = bindGroup.entries[2].resource.buffer;
                    const paramsBuffer = bindGroup.entries[3].resource.buffer;
                    const params = new DataView(paramsBuffer.data);
                    const deltaTime = params.getFloat32(0, true);
                    const count = params.getUint32(4, true);
                    const positions = new Float32Array(positionBuffer.data);
                    const velocities = new Float32Array(velocityBuffer.data);
                    const accelerations = new Float32Array(accelerationBuffer.data);

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
                  end() {},
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
              },
            };
          },
          destroy() {},
        };
      }
    }, `${server.origin}/packages/rendering/src/index.ts`);

    expect(result.status, result.status === "error" ? result.error : undefined).toBe("ready");
    expect(result.updateMode).toBe("gpu");
    expect(result.drawOrders).toEqual([[2, 1]]);
    expect(result.spritePositions).toEqual([[2, 4], [1, 2]]);
    expect(result.pixel).toEqual([255, 0, 0, 255]);
    expect(result.stats).toMatchObject({ liveCount: 2, gpuUpdates: 1, bufferUploads: 2 });
  });
});
