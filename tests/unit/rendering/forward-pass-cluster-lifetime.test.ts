import { describe, expect, it } from "vitest";
import { DirectionalLight } from "@aura3d/scene";
import "../../../packages/rendering/src/lanes/prd01";
import { MAX_LIGHTS_PER_CLUSTER, type ClusteredForwardLightingResources } from "../../../packages/rendering/src/ClusteredForwardLighting";
import { ForwardPass, identityMatrix } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { collectLight } from "../../../packages/rendering/src/LightCollector";
import { MockRenderDevice, RenderDeviceError, type BufferUsage, type RenderBuffer } from "../../../packages/rendering/src/RenderDevice";
import type { Texture } from "../../../packages/rendering/src/Texture";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";

const clusteredLights = () => Array.from({ length: 17 }, (_, index) => collectLight(new DirectionalLight(`cluster-${index}`)));
const generatedFlags = () => createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true });

function passCluster(pass: ForwardPass): ClusteredForwardLightingResources | null {
  return (pass as unknown as { clusteredLighting: ClusteredForwardLightingResources | null }).clusteredLighting;
}

interface ClusterObservation {
  readonly textures: readonly [Texture, Texture];
  readonly liveAtCapture: readonly boolean[];
  readonly bytesAtCapture: readonly number[];
  readonly retirements: number[];
}

function observeCluster(pass: ForwardPass): ClusterObservation {
  const cluster = passCluster(pass);
  const data = cluster?.lightData.texture;
  const indices = cluster?.lightIndices.texture;
  if (!data || !indices) throw new Error("Expected the pass to have allocated both cluster textures");
  const textures = [data, indices] as const;
  const liveAtCapture = textures.map((texture) => !texture.disposed);
  const bytesAtCapture = textures.map((texture) => texture.cpuByteLength);
  const retirements = [0, 0];
  textures.forEach((texture, index) => {
    texture.onDispose(() => { retirements[index] = (retirements[index] ?? 0) + 1; });
  });
  return { textures, liveAtCapture, bytesAtCapture, retirements };
}

function expectRetired(observation: ClusterObservation): void {
  expect(observation.textures.map((texture) => texture.label)).toEqual([
    "clustered-forward-light-data", "clustered-forward-light-indices"
  ]);
  expect(observation.liveAtCapture).toEqual([true, true]);
  expect(observation.bytesAtCapture).toEqual([17 * 6 * 4 * 4, MAX_LIGHTS_PER_CLUSTER * 4 * 4]);
  expect(observation.retirements).toEqual([1, 1]);
  expect(observation.textures.map((texture) => texture.disposed)).toEqual([true, true]);
  expect(observation.textures.map((texture) => texture.textureLevels)).toEqual([[], []]);
  expect(observation.textures.map((texture) => texture.cpuByteLength)).toEqual([0, 0]);
}

function thrownBy(action: () => void): unknown {
  try { action(); } catch (error) { return error; }
  throw new Error("Expected the action to throw");
}

type FailureStage = "createBuffer" | "updateBuffer" | "bindUniformBuffer";

class SetupFailureDevice extends MockRenderDevice {
  readonly failure = new Error("frame uniform setup failed");
  readonly observations: ClusterObservation[] = [];
  pass!: ForwardPass;

  constructor(private failureStage: FailureStage | null) { super(); }

  private visit(stage: FailureStage): void {
    if (this.failureStage !== stage && stage !== "bindUniformBuffer") return;
    this.observations.push(observeCluster(this.pass));
    if (this.failureStage === stage) {
      this.failureStage = null;
      throw this.failure;
    }
  }

  override createBuffer(usage: BufferUsage, byteLength: number, initialData?: ArrayBufferView): RenderBuffer {
    this.visit("createBuffer");
    return super.createBuffer(usage, byteLength, initialData);
  }

  override updateBuffer(buffer: RenderBuffer, byteOffset: number, data: ArrayBufferView): void {
    this.visit("updateBuffer");
    super.updateBuffer(buffer, byteOffset, data);
  }

  override bindUniformBuffer(buffer: RenderBuffer, binding: number): void {
    this.visit("bindUniformBuffer");
    super.bindUniformBuffer(buffer, binding);
  }
}

describe("ForwardPass clustered texture lifetime", () => {
  it.each([
    { name: "short", matrix: new Float32Array(15), scalars: 15 },
    { name: "non-finite", matrix: new Float32Array([...identityMatrix().slice(0, 15), Number.NaN]), scalars: 16 }
  ])("retires both textures when the $name camera view matrix is rejected", ({ matrix, scalars }) => {
    const device = new MockRenderDevice();
    setRendererQrFlags(generatedFlags(), device);
    let currentMatrix = matrix;
    let observation: ClusterObservation | undefined;
    let pass!: ForwardPass;
    pass = new ForwardPass({
      items: [],
      lights: clusteredLights(),
      get cameraViewMatrix() {
        observation = observeCluster(pass);
        return currentMatrix;
      }
    });
    try {
      device.beginFrame(8, 8);
      const failure = thrownBy(() => pass.execute({ device, width: 8, height: 8 }));
      expect(failure).toBeInstanceOf(RenderDeviceError);
      expect(failure).toMatchObject({
        message: "Render item transform uniforms must be finite mat4 values",
        code: "RENDER_ITEM_TRANSFORM_CONTRACT",
        details: { field: "cameraViewMatrix", scalars }
      });
      expect(observation).toBeDefined();
      const failedObservation = observation!;
      expectRetired(failedObservation);
      expect(passCluster(pass)).toBeNull();
      expect(device.uniformBufferBindings).toHaveLength(0);
      expect(device.drawCommands).toHaveLength(0);

      currentMatrix = new Float32Array(identityMatrix());
      pass.execute({ device, width: 8, height: 8 });
      expect(observation).not.toBe(failedObservation);
      expect(observation!.textures[0]).not.toBe(failedObservation.textures[0]);
      expectRetired(observation!);
      expect(passCluster(pass)).toBeNull();
      expect(device.uniformBufferBindings).toHaveLength(1);
      expect(device.drawCommands).toHaveLength(0);
    } finally {
      passCluster(pass)?.dispose();
      device.dispose();
    }
  });

  it.each<FailureStage>(["createBuffer", "updateBuffer", "bindUniformBuffer"])(
    "retires both textures and preserves the original %s error",
    (stage) => {
      const device = new SetupFailureDevice(stage);
      setRendererQrFlags(generatedFlags(), device);
      const pass = new ForwardPass({ items: [], lights: clusteredLights() });
      device.pass = pass;
      try {
        device.beginFrame(8, 8);
        expect(thrownBy(() => pass.execute({ device, width: 8, height: 8 }))).toBe(device.failure);
        expect(device.observations).toHaveLength(1);
        expectRetired(device.observations[0]!);
        expect(passCluster(pass)).toBeNull();
        expect(device.uniformBufferBindings).toHaveLength(0);
        expect(device.drawCommands).toHaveLength(0);

        pass.execute({ device, width: 8, height: 8 });
        expect(device.observations).toHaveLength(2);
        expect(device.observations[1]!.textures[0]).not.toBe(device.observations[0]!.textures[0]);
        expectRetired(device.observations[1]!);
        expect(passCluster(pass)).toBeNull();
        expect(device.uniformBufferBindings).toHaveLength(1);
        expect(device.drawCommands).toHaveLength(0);
      } finally {
        passCluster(pass)?.dispose();
        device.dispose();
      }
    }
  );

  it("keeps clustered projection validation errors unchanged before texture creation", () => {
    const device = new MockRenderDevice();
    setRendererQrFlags(generatedFlags(), device);
    const pass = new ForwardPass({ items: [], lights: clusteredLights(), cameraViewProjectionMatrix: new Float32Array(15) });
    try {
      device.beginFrame(8, 8);
      const failure = thrownBy(() => pass.execute({ device, width: 8, height: 8 }));
      expect(failure).toBeInstanceOf(RangeError);
      expect(failure).toHaveProperty("message", "Clustered-forward view-projection matrix must contain 16 values.");
      expect(passCluster(pass)).toBeNull();
      expect(device.uniformBufferBindings).toHaveLength(0);
      expect(device.drawCommands).toHaveLength(0);
    } finally {
      passCluster(pass)?.dispose();
      device.dispose();
    }
  });

  it("continues to retire textures and rethrow a draw callback failure", () => {
    const device = new MockRenderDevice();
    const geometry = Geometry.triangle();
    const failure = new Error("draw callback failed");
    let observation: ClusterObservation | undefined;
    let pass!: ForwardPass;
    pass = new ForwardPass({
      items: [{ geometry, onBeforeRender: () => { observation = observeCluster(pass); throw failure; } }],
      lights: clusteredLights()
    });
    try {
      device.beginFrame(8, 8);
      expect(thrownBy(() => pass.execute({ device, width: 8, height: 8 }))).toBe(failure);
      expect(observation).toBeDefined();
      expectRetired(observation!);
      expect(passCluster(pass)).toBeNull();
      expect(device.drawCommands).toHaveLength(0);
    } finally {
      passCluster(pass)?.dispose();
      geometry.dispose();
      device.dispose();
    }
  });
});
