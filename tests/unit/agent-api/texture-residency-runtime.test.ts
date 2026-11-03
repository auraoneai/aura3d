import { describe, expect, it, vi } from "vitest";
import { createAppTextureResidency } from "../../../packages/engine/src/agent-api/compiler/textureResidency";
import { createGLTFTextureResidencySource } from "../../../packages/assets/src/gltf/GLTFTextureResidency";
import { Texture } from "../../../packages/rendering/src/Texture";

const ticks = async (count = 60) => { for (let i = 0; i < count; i++) await Promise.resolve(); };

type Source = NonNullable<ReturnType<typeof createGLTFTextureResidencySource>>;
type Allocation = { readonly bytes: number; readonly levels: number[]; readonly pixels: number[] };

class Device {
  readonly fallback = new Map<object, number[]>();
  readonly published = new Map<object, Allocation>();
  readonly allocations = new Set<Allocation>();
  readonly fences: (() => void)[] = [];
  holdFences = false;
  createTextureResidencyAdapter() { return this; }
  readonly device = this;
  generation() { return 1; }
  isLost() { return false; }
  acquireBudgetLimit(_maxBytes: number) { return { setLimit(_value: number) {}, release() {} }; }
  onDeviceLost() { return () => {}; }
  onDeviceRestored() { return () => {}; }
  usageBytes() { return this.fallback.size * 4 + [...this.allocations].reduce((sum, value) => sum + value.bytes, 0); }
  estimate(source: Source, count: number) { return source.levels.slice(-count).reduce((sum, level) => sum + level.bytes, 0); }
  prepare(source: Source, options: { maxBytes: number }) {
    if (this.usageBytes() + 4 > options.maxBytes) throw new Error("fallback exceeds device budget");
    this.fallback.set(source.texture, [...source.fallback]);
  }
  unprepare(source: Source) { this.fallback.delete(source.texture); return Promise.resolve(); }
  async allocate(source: Source, levels: readonly { level: number; value: { data: ArrayLike<number> } }[], options: { maxBytes: number }) {
    const bytes = this.estimate(source, levels.length);
    if (this.usageBytes() + bytes > options.maxBytes) throw new Error("device budget exceeded");
    const allocation = { bytes, levels: levels.map((level) => level.level), pixels: levels.map((level) => Number(level.value.data[0])) };
    this.allocations.add(allocation);
    return { allocation, bytes };
  }
  publish(texture: object, allocation: Allocation | null) {
    if (allocation) this.published.set(texture, allocation); else this.published.delete(texture);
  }
  retire(allocation: Allocation) {
    return new Promise<void>((resolve) => {
      const complete = () => { this.allocations.delete(allocation); resolve(); };
      if (this.holdFences) this.fences.push(complete); else complete();
    });
  }
}

function texture(value: number) {
  return new Texture({ width: 4, height: 4, generateMipmaps: false, mipLevels: [
    { width: 4, height: 4, data: new Uint8Array(64).fill(value) },
    { width: 2, height: 2, data: new Uint8Array(16).fill(value) },
    { width: 1, height: 1, data: new Uint8Array(4).fill(value) }
  ] });
}

function actorFor(textureValue: Texture, dispose = vi.fn()) {
  const source = createGLTFTextureResidencySource(textureValue, "factor")!;
  return { pipeline: { resources: { textureResidencySources: new Map([[textureValue, source]]) } }, dispose } as never;
}

function itemAt(x: number) {
  return { modelMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1] } as never;
}
function instanceAt(modelX: number, instanceX: number) {
  return { modelMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, modelX, 0, 0, 1],
    instanceTransforms: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, instanceX, 0, 0, 1]) } as never;
}

describe("app texture residency ownership", () => {
  it("publishes real coarse mip data to the closest live actor and changes bindings as the camera moves", async () => {
    const device = new Device();
    const owner = await createAppTextureResidency(device, 12);
    const changed = vi.fn();
    const unsubscribe = owner.onChange(changed);
    const nearTexture = texture(11), farTexture = texture(22);
    const far = actorFor(farTexture), near = actorFor(nearTexture);
    owner.trackActor(far); owner.trackActor(near);
    owner.beginFrame();
    owner.observeActor(far, [itemAt(10)], [0, 0, 0]);
    owner.observeActor(near, [instanceAt(100, -99)], [0, 0, 0]);
    owner.endFrame();
    await ticks();
    expect(device.published.get(nearTexture)).toMatchObject({ levels: [2], pixels: [11], bytes: 4 });
    expect(changed).toHaveBeenCalled();
    expect(device.published.has(farTexture)).toBe(false);
    expect(owner.snapshot()).toMatchObject({ usedBytes: 12, residentBytes: 4, residentEntries: 1, overBudget: true });
    owner.beginFrame();
    owner.observeActor(far, [itemAt(10)], [10, 0, 0]);
    owner.observeActor(near, [itemAt(1)], [10, 0, 0]);
    owner.endFrame();
    await ticks();
    expect(device.published.get(farTexture)).toMatchObject({ levels: [2], pixels: [22] });
    expect(device.published.has(nearTexture)).toBe(false);
    unsubscribe();
    owner.dispose();
    await owner.whenSettled();
    expect(device.usageBytes()).toBe(0);
  });

  it("isolates two device bindings for the same logical texture", async () => {
    const source = texture(44), firstDevice = new Device(), secondDevice = new Device();
    const first = await createAppTextureResidency(firstDevice, 128);
    const second = await createAppTextureResidency(secondDevice, 128);
    first.trackActor(actorFor(source)); second.trackActor(actorFor(source));
    await ticks();
    expect(firstDevice.published.has(source)).toBe(true);
    expect(secondDevice.published.has(source)).toBe(true);
    first.dispose(); await first.whenSettled();
    expect(firstDevice.usageBytes()).toBe(0);
    expect(secondDevice.published.has(source)).toBe(true);
    expect(source.disposed).toBe(false);
    second.dispose(); await second.whenSettled();
  });

  it("defers final actor disposal until its native fence, while a shared peer remains live", async () => {
    const device = new Device();
    const owner = await createAppTextureResidency(device, 128);
    const source = texture(55), disposeFirst = vi.fn(), disposeSecond = vi.fn(() => source.dispose());
    const first = actorFor(source, disposeFirst), second = actorFor(source, disposeSecond);
    owner.trackActor(first); owner.trackActor(second);
    await ticks();
    device.holdFences = true;
    owner.retireActor(first);
    await ticks();
    expect(disposeFirst).toHaveBeenCalledOnce();
    expect(source.disposed).toBe(false);
    owner.retireActor(second);
    await ticks();
    expect(disposeSecond).not.toHaveBeenCalled();
    expect(device.fences.length).toBeGreaterThan(0);
    for (const complete of device.fences.splice(0)) complete();
    await ticks();
    expect(disposeSecond).toHaveBeenCalledOnce();
    owner.dispose(); await owner.whenSettled();
  });
});
