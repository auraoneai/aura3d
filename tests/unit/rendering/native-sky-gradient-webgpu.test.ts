import { describe, expect, it, vi } from "vitest";
import { sky } from "../../../packages/engine/src/agent-api/nodes/sky";
import { SkyBackgroundPass, type SkyFogState } from "../../../packages/rendering/src/atmosphere/SkyBackgroundPass";
import { GRADIENT_SKY_PORTABLE_BINDINGS, GRADIENT_SKY_WGSL } from "../../../packages/rendering/src/atmosphere/sky.wgsl";
import { MockRenderDevice, type RenderDevice, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const specOf = (builder: { toJSON(): unknown }): Readonly<Record<string, unknown>> =>
  (builder.toJSON() as { spec: Readonly<Record<string, unknown>> }).spec;
const grounded = () => specOf(sky.gradient({ zenith: "#2860a0", horizon: "#b0c0e0", ground: "#405020" }));

type Module = { readonly label: string; readonly code: string };
type PipelineDescriptor = {
  readonly vertex: { readonly module: Module; readonly buffers?: readonly unknown[] };
  readonly fragment: { readonly module: Module };
  readonly depthStencil?: { readonly depthCompare: string; readonly depthWriteEnabled: boolean };
};
type RecordedPass = {
  readonly descriptor: { readonly colorAttachments: readonly { readonly view: unknown }[] };
  pipeline?: { readonly descriptor: PipelineDescriptor };
  group?: { readonly bytes?: Uint8Array };
  vertexBytes?: Uint8Array;
  vertices?: number;
};

// Exercises the real host-side WebGPUDevice path. This recorder neither
// compiles WGSL nor claims to establish rendered pixels.
async function nativeFixture() {
  const modules: Module[] = [];
  const writes = new Map<object, Uint8Array>();
  const submissions: RecordedPass[] = [];
  const native = {
    features: new Set<string>(),
    limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxTextureDimension2D: 1024, maxBufferSize: 8_000_000, maxVertexBuffers: 8 },
    queue: {
      writeBuffer(buffer: object, _offset: number, data: ArrayBuffer | ArrayBufferView) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        writes.set(buffer, bytes.slice());
      },
      writeTexture() {},
      submit(commands: readonly { readonly passes: readonly RecordedPass[] }[]) { submissions.push(...commands.flatMap(command => command.passes)); },
      onSubmittedWorkDone: async () => {}
    },
    createBuffer: () => ({ destroy() {} }),
    createTexture: ({ label }: { readonly label?: string }) => {
      const texture = { label, createView: () => ({ texture }), destroy() {} };
      return texture;
    },
    createShaderModule(descriptor: Module) { modules.push(descriptor); return descriptor; },
    createBindGroupLayout: (descriptor: object) => descriptor,
    createPipelineLayout: (descriptor: object) => descriptor,
    createRenderPipeline(descriptor: PipelineDescriptor) { return { descriptor, getBindGroupLayout: () => ({}) }; },
    createBindGroup(descriptor: { readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] }) {
      const resource = descriptor.entries.find(entry => entry.binding === 0)?.resource as { readonly buffer?: object } | undefined;
      const bytes = resource?.buffer && writes.get(resource.buffer);
      return { buffer: resource?.buffer, ...(bytes ? { bytes: bytes.slice() } : {}) };
    },
    createCommandEncoder() {
      const passes: RecordedPass[] = [];
      return {
        beginRenderPass(descriptor: RecordedPass["descriptor"]) {
          const pass: RecordedPass = { descriptor };
          passes.push(pass);
          return {
            setPipeline(pipeline: RecordedPass["pipeline"]) { pass.pipeline = pipeline; },
            // A bind group reads its buffer's contents as of this submission (queue writes are ordered before it).
            setBindGroup(_index: number, group: RecordedPass["group"] & { readonly buffer?: object }) {
              const bytes = group?.buffer ? writes.get(group.buffer) : undefined;
              pass.group = bytes ? { ...group, bytes: bytes.slice() } : group;
            },
            setVertexBuffer(_slot: number, buffer: object) { pass.vertexBytes = writes.get(buffer)?.slice(); },
            setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {},
            draw(count: number) { pass.vertices = count; }, end() {}
          };
        },
        finish: () => ({ passes })
      };
    },
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
  return { device, modules, submissions };
}

function floats(bytes: Uint8Array, offset: number, count: number): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: count }, (_, i) => view.getFloat32(offset + i * 4, true));
}

function expectVector(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 6));
}

describe("native plain-gradient sky", () => {
  it("submits the grounded public sky with the real portable bindings and both depth modes", async () => {
    const f = await nativeFixture();
    const target = f.device.createRenderTarget({ width: 8, height: 6, format: "rgba16f", depth: true });
    const pass = new SkyBackgroundPass(f.device);
    try {
      f.device.beginFrame(8, 6);
      f.device.setRenderTarget(target);
      pass.setSpec(grounded(), 3);
      const translated = IDENTITY.slice();
      translated[12] = 2;
      pass.drawSky(translated);
      pass.drawSky(translated, true);
      const draws = f.submissions.filter(record => record.vertices !== undefined);
      expect(draws).toHaveLength(2);
      expect(draws.map(draw => draw.vertices)).toEqual([3, 3]);
      expect(draws[0]!.pipeline!.descriptor.depthStencil).toMatchObject({ depthCompare: "always", depthWriteEnabled: false });
      expect(draws[1]!.pipeline!.descriptor.depthStencil).toMatchObject({ depthCompare: "less-equal", depthWriteEnabled: false });
      const vertex = draws[0]!.pipeline!.descriptor.vertex.module.code;
      const fragment = draws[0]!.pipeline!.descriptor.fragment.module.code;
      expect(vertex).toContain("@vertex fn vs_main(@location(0) position: vec2<f32>)");
      expect(vertex).toContain("vec4<f32>(position, 0.999999, 1.0)");
      expect(draws[0]!.pipeline!.descriptor.vertex.buffers).toEqual([{
        arrayStride: 8, stepMode: "vertex", attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }]
      }]);
      expectVector(floats(draws[0]!.vertexBytes!, 0, 6), [-1, -1, 3, -1, -1, 3]);
      expect(fragment).toContain("@group(0) @binding(0) var<uniform> aura");
      expect(fragment).not.toContain("@aura3d-bindings");
      expect(fragment).not.toContain("u_bandColors");
      expect(f.modules).toHaveLength(2);

      const bytes = draws[0]!.group!.bytes!;
      expectVector(floats(bytes, 0, 16), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -2, 0, 0, 1]);
      const gradient = pass.skyFrame.gradient!;
      expectVector(floats(bytes, 64, 3), [0, 1, 0]);
      expectVector(floats(bytes, 80, 3), gradient.zenith);
      expectVector(floats(bytes, 96, 3), gradient.horizon);
      expectVector(floats(bytes, 112, 3), gradient.ground);
      expectVector(floats(bytes, 112, 3), [0x40, 0x50, 0x20].map(value => (value / 255) ** 2.2));
      expectVector(floats(bytes, 124, 3), [gradient.exponent, gradient.horizonGlow, pass.skyFrame.intensity]);
      expect(f.device.getRenderTarget()).toBe(target);
    } finally {
      pass.dispose();
      f.device.dispose();
    }
  });

  it("keeps the current rendered default and authored sun, ground, glow and linear opaque output semantics", async () => {
    const source = GRADIENT_SKY_WGSL.fragment;
    // The CPU evaluator omits the sun when absent, but the current rendered
    // GLSL uses [0,1,0] and still shows it; preserve the renderer contract.
    expect(source).toContain("dot(direction, aura.u_sunDirection)");
    expect(source).toContain("smoothstep(0.9995, 0.9999, cosine)");
    expect(source).toContain("pow(max(0.0, cosine), 350.0) * 0.6");
    expect(source).toContain("disc * 40.0 + halo, disc * 36.0 + halo * 0.9, disc * 30.0 + halo * 0.7");
    expect(source).toContain("1.0 - smoothstep(0.0, 0.25, abs(y))");
    expect(source).toContain("mix(aura.u_horizon, aura.u_ground, t)");
    expect(source).toContain("return vec4<f32>(color * aura.u_intensity, 1.0)");
    expect(GRADIENT_SKY_PORTABLE_BINDINGS.map(binding => binding.kind)).toEqual(["mat4", "vec3", "vec3", "vec3", "vec3", "float", "float", "float"]);

    const f = await nativeFixture();
    const target = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: false });
    const pass = new SkyBackgroundPass(f.device);
    try {
      f.device.beginFrame(2, 2);
      f.device.setRenderTarget(target);
      pass.setSpec(grounded(), 0);
      pass.drawSky(IDENTITY);
      pass.setSpec({ ...grounded(), sun: { elevationDeg: 30, azimuthDeg: 90, discSize: 0 }, intensity: 1.8, exponent: 2, horizonGlow: 0.4 }, 1);
      pass.drawSky(IDENTITY);
      const draws = f.submissions.filter(record => record.vertices !== undefined);
      expect(draws).toHaveLength(2);
      expect(f.modules).toHaveLength(2);
      expectVector(floats(draws[1]!.group!.bytes!, 64, 3), [Math.cos(Math.PI / 6), 0.5, 0]);
      expectVector(floats(draws[1]!.group!.bytes!, 124, 3), [2, 0.4, 1.8]);
    } finally {
      pass.dispose();
      f.device.dispose();
    }
  });

  it("rejects unsupported effects before using a cached plain program and recovers after each transition", async () => {
    const f = await nativeFixture();
    const previous = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const face = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const pass = new SkyBackgroundPass(f.device);
    try {
      f.device.beginFrame(2, 2);
      f.device.setRenderTarget(previous);
      pass.setSpec(grounded(), 0);
      pass.drawSky(IDENTITY);
      const variants: readonly [string, Readonly<Record<string, unknown>>][] = [
        ["model:hdri", { model: "hdri" }],
        ["model:cubemap", { model: "cubemap" }],
        ["model:none", { model: "none" }]
      ];
      for (const [reason, spec] of variants) {
        pass.setSpec(spec, 0);
        const before = f.submissions.length;
        let error: unknown;
        try { pass.renderToCubeFace(0, face, IDENTITY); } catch (caught) { error = caught; }
        expect(error).toMatchObject({ code: "WEBGPU_SKY_UNSUPPORTED", details: { unsupported: expect.arrayContaining([reason]) } });
        expect(f.device.getRenderTarget()).toBe(previous);
        expect(f.submissions).toHaveLength(before);
        expect(f.modules).toHaveLength(2);
        pass.setSpec(grounded(), 0);
        pass.drawSky(IDENTITY);
      }
      pass.setFog({} as SkyFogState);
      expect(() => pass.drawSky(IDENTITY)).toThrow(/WebGPU sky does not support background fog/);
      expect(f.modules).toHaveLength(2);
      pass.setFog(null);
      pass.setSpec({ ...grounded(), stars: { count: 0 }, clouds: { coverage: 0 } }, 0);
      pass.drawSky(IDENTITY);
      expect(f.modules).toHaveLength(2);
    } finally {
      pass.dispose();
      f.device.dispose();
    }
  });

  it("rejects the first unsupported draw before allocating a shader or drawing", async () => {
    const f = await nativeFixture();
    const pass = new SkyBackgroundPass(f.device);
    try {
      f.device.beginFrame(2, 2);
      pass.setSpec({ model: "hdri" }, 0);
      expect(() => pass.drawSky(IDENTITY)).toThrow(/model:hdri/);
      expect(f.modules).toHaveLength(0);
      expect(f.submissions).toHaveLength(0);
    } finally {
      pass.dispose();
      f.device.dispose();
    }
  });

  it("restores the caller target after a draw failure", async () => {
    const f = await nativeFixture();
    const previous = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const face = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const pass = new SkyBackgroundPass(f.device);
    try {
      f.device.beginFrame(2, 2);
      f.device.setRenderTarget(previous);
      pass.setSpec(grounded(), 0);
      vi.spyOn(f.device, "draw").mockImplementationOnce(() => { throw new Error("draw failed"); });
      expect(() => pass.renderToCubeFace(0, face, IDENTITY)).toThrow("draw failed");
      expect(f.device.getRenderTarget()).toBe(previous);
      pass.renderToCubeFace(0, face, IDENTITY);
      expect(f.device.getRenderTarget()).toBe(previous);
      expect(f.submissions.filter(record => record.vertices === 3)).toHaveLength(1);
    } finally {
      pass.dispose();
      f.device.dispose();
    }
  });

  it("rechecks the sky after a target-switch callback and restores the previous target", async () => {
    const f = await nativeFixture();
    const previous = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const face = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const pass = new SkyBackgroundPass(f.device);
    try {
      f.device.beginFrame(2, 2);
      f.device.setRenderTarget(previous);
      pass.setSpec(grounded(), 0);
      const setTarget = f.device.setRenderTarget.bind(f.device);
      const spy = vi.spyOn(f.device, "setRenderTarget").mockImplementation(target => {
        setTarget(target);
        if (target === face) pass.setSpec({ model: "cubemap" }, 0);
      });
      expect(() => pass.renderToCubeFace(0, face, IDENTITY)).toThrow(/model:cubemap/);
      expect(f.device.getRenderTarget()).toBe(previous);
      expect(f.modules).toHaveLength(0);
      expect(f.submissions.filter(record => record.vertices !== undefined)).toHaveLength(0);
      spy.mockRestore();
      pass.setSpec(grounded(), 0);
      pass.renderToCubeFace(0, face, IDENTITY);
      expect(f.device.getRenderTarget()).toBe(previous);
      expect(f.submissions.filter(record => record.vertices === 3)).toHaveLength(1);
    } finally {
      pass.dispose();
      f.device.dispose();
    }
  });

  it("retires cached shaders and triangle buffers on a device generation change and on disposal", () => {
    const shaders: Array<{ disposed: boolean; dispose(): void }> = [];
    const buffers: Array<{ disposed: boolean; dispose(): void }> = [];
    const device = {
      kind: "webgpu", generation: 1, disposed: false, contextLost: false,
      createShaderProgram(_sources: ShaderSources) {
        const program = { disposed: false, dispose() { this.disposed = true; } };
        shaders.push(program); return program;
      },
      createBuffer() {
        const buffer = { disposed: false, dispose() { this.disposed = true; } };
        buffers.push(buffer); return buffer;
      },
      updateBuffer() {}, draw() {}
    };
    const pass = new SkyBackgroundPass(device as unknown as RenderDevice);
    pass.setSpec(grounded(), 0);
    pass.drawSky(IDENTITY);
    pass.drawSky(IDENTITY);
    expect(shaders).toHaveLength(1);
    expect(buffers).toHaveLength(1);
    device.generation = 2;
    pass.drawSky(IDENTITY);
    expect(shaders).toHaveLength(2);
    expect(buffers).toHaveLength(2);
    expect(shaders[0]!.disposed).toBe(true);
    expect(buffers[0]!.disposed).toBe(true);
    shaders[1]!.dispose();
    pass.drawSky(IDENTITY);
    expect(shaders).toHaveLength(3);
    expect(buffers).toHaveLength(2);
    device.contextLost = true;
    expect(() => pass.drawSky(IDENTITY)).toThrow(/Render context is lost/);
    device.contextLost = false;
    pass.dispose();
    expect(shaders[2]!.disposed).toBe(true);
    expect(buffers[1]!.disposed).toBe(true);
  });

  it("leaves other backends' sky variants available", () => {
    const device = new MockRenderDevice();
    const compile = vi.spyOn(device, "createShaderProgram");
    const pass = new SkyBackgroundPass(device);
    try {
      device.beginFrame(2, 2);
      pass.setSpec({ ...grounded(), stars: { count: 30 }, bands: [{ elevationDeg: 2, widthDeg: 5, color: "#fff", intensity: 1 }] }, 0);
      pass.drawSky(IDENTITY);
      expect(device.drawCommands).toHaveLength(1);
      expect(compile.mock.calls[0]![0].webgpu).toBeUndefined();
    } finally {
      pass.dispose();
      device.dispose();
    }
  });
});

describe("native full sky (Preetham, colour, bands, stars, clouds, moon)", () => {
  const variants: readonly [string, Readonly<Record<string, unknown>>, readonly string[]][] = [
    ["preetham + stars", { model: "preetham", sun: { elevationDeg: 20, azimuthDeg: 30 }, stars: { count: 300 } }, ["fn skyPreetham", "fn skyStarfield", "color = skyPreetham(direction);"]],
    ["gradient bands", { ...grounded(), bands: [{ elevationDeg: 10, widthDeg: 5, color: "#ff00ff", intensity: 1 }] }, ["fn skyGradient", "aura.u_bandColors[i]"]],
    ["gradient stars", { ...grounded(), stars: { count: 300 } }, ["fn skyStarfield", "(1.0 - aura.u_sunfade) * 2.0"]],
    ["gradient stars + clouds", { ...grounded(), stars: { count: 300 }, clouds: { coverage: 0.3 } }, ["fbm(cloudUV * 1000.0)", "mix(color, vec3<f32>(aura.u_intensity)"]],
    ["preetham clouds", { model: "preetham", sun: { elevationDeg: 20, azimuthDeg: 30 }, clouds: { coverage: 0.4 } }, ["cloudColor *= aura.u_sunE * 0.00002;"]],
    ["moon", { ...grounded(), moon: { elevationDeg: 20, azimuthDeg: 0 } }, ["fn skyMoonDisc"]],
    ["colour", { model: "color", color: [1, 0, 0] }, ["color = aura.u_zenith;"]]
  ];

  for (const [name, spec, snippets] of variants) {
    it(`draws ${name} through the full WGSL program`, async () => {
      const f = await nativeFixture();
      const target = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: true });
      const pass = new SkyBackgroundPass(f.device);
      try {
        f.device.beginFrame(4, 4);
        f.device.setRenderTarget(target);
        pass.setSpec(spec, 1.5);
        pass.drawSky(IDENTITY);
        const draws = f.submissions.filter(record => record.vertices === 3);
        expect(draws).toHaveLength(1);
        const fragment = draws[0]!.pipeline!.descriptor.fragment.module.code;
        expect(fragment).toContain("@group(0) @binding(0) var<uniform> aura");
        for (const snippet of snippets) expect(fragment).toContain(snippet);
        // Reversed-edge smoothstep is undefined in WGSL; every port uses ordered edges.
        expect(fragment).not.toContain("smoothstep(0.5, 0.05");
      } finally {
        pass.dispose();
        f.device.dispose();
      }
    });
  }

  it("uploads the Preetham frame's sunE, betaR, betaM and Mie g where the WGSL struct reads them", async () => {
    const f = await nativeFixture();
    const pass = new SkyBackgroundPass(f.device);
    try {
      const target = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: true });
      f.device.beginFrame(2, 2);
      f.device.setRenderTarget(target);
      pass.setSpec({ model: "preetham", sun: { elevationDeg: 35, azimuthDeg: 120 }, turbidity: 4 }, 0);
      pass.drawSky(IDENTITY);
      const bytes = f.submissions.find(record => record.vertices === 3)!.group!.bytes!;
      const pre = pass.skyFrame.preetham!;
      expectVector(floats(bytes, 64, 3), pre.sunDirection);
      expect(floats(bytes, 76, 1)[0]).toBeCloseTo(pre.sunE, 2);
      expect(floats(bytes, 80, 1)[0]).toBeCloseTo(pre.sunfade, 6);
      expectVector(floats(bytes, 96, 3), pre.betaR);
      expectVector(floats(bytes, 112, 3), pre.betaM);
      expect(floats(bytes, 124, 1)[0]).toBeCloseTo(pre.mieDirectionalG, 6);
    } finally {
      pass.dispose();
      f.device.dispose();
    }
  });

  it("keeps the plain gradient on its dedicated program and caches full variants separately", async () => {
    const f = await nativeFixture();
    const pass = new SkyBackgroundPass(f.device);
    try {
      const target = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: true });
      f.device.beginFrame(2, 2);
      f.device.setRenderTarget(target);
      pass.setSpec(grounded(), 0);
      pass.drawSky(IDENTITY);
      pass.setSpec({ ...grounded(), bands: [{ elevationDeg: 10, widthDeg: 5, color: "#ff00ff", intensity: 1 }] }, 0);
      pass.drawSky(IDENTITY);
      pass.setSpec(grounded(), 0);
      pass.drawSky(IDENTITY);
      const fragments = f.submissions.filter(record => record.vertices === 3).map(draw => draw.pipeline!.descriptor.fragment.module.code);
      expect(fragments[0]).not.toContain("u_bandColors");
      expect(fragments[1]).toContain("u_bandColors");
      expect(fragments[2]).toBe(fragments[0]);
    } finally {
      pass.dispose();
      f.device.dispose();
    }
  });
});
