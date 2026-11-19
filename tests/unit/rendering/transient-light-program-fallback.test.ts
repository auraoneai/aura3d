/**
 * A short-lived point light (VFX flash) changes the forward light bucket keyed into every lit generated program.
 * While those new variants compile (async KHR_parallel_shader_compile / WebGPU pipelines, or beyond the T0-06
 * per-frame sync bound), the forward pass must keep drawing lit meshes with their last ready program instead of
 * skipping them (Duneglide turbo "empty world", Diamond one-frame black outfield, Hoops white flash).
 */
import { afterEach, describe, expect, it } from "vitest";
import { DirectionalLight, PointLight } from "@aura3d/scene";
import "../../../packages/rendering/src/lanes/prd01";
import { ForwardPass, type RenderItem } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { collectLight } from "../../../packages/rendering/src/LightCollector";
import { MockRenderDevice, type RenderShaderProgram, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import type { DeviceProbe } from "../../../packages/rendering/src/contracts/device";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { rendererProgramCachePeek } from "../../../packages/rendering/src/renderer/qrSubFlags";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";

const V2 = resolveQrFlags({ env: { A3D_QR_CORE: "v2" } });
const OFF = resolveQrFlags({ env: {} });

/** A device with parallel compile whose async compiles can be held open (like a slow driver). */
class ParallelCompileDevice extends MockRenderDevice {
  hold = false;
  private readonly held: (() => void)[] = [];
  readonly probe = { backend: "webgl2", parallelShaderCompile: true } as unknown as DeviceProbe;
  compileAsync(sources: ShaderSources): Promise<RenderShaderProgram> {
    if (!this.hold) return Promise.resolve(this.createShaderProgram(sources));
    return new Promise((resolve, reject) => {
      this.held.push(() => { try { resolve(this.createShaderProgram(sources)); } catch (error) { reject(error); } });
    });
  }
  release(): void { for (const done of this.held.splice(0)) done(); }
}

const flush = async (): Promise<void> => { for (let i = 0; i < 4; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0)); };

function frame(device: ParallelCompileDevice, items: readonly RenderItem[], lights: ReturnType<typeof collectLight>[]): number {
  rendererProgramCachePeek(device, V2)?.beginFrame?.();
  device.beginFrame(16, 16);
  const before = device.drawCommands.length;
  new ForwardPass({ items, lights, cameraPosition: [0, 2, 6] }).execute({ device, width: 16, height: 16 });
  const drawn = device.drawCommands.length - before;
  device.endFrame();
  return drawn;
}

afterEach(() => setRendererQrFlags(OFF));

describe("transient light program fallback", () => {
  const lit = (): { items: RenderItem[]; sun: ReturnType<typeof collectLight>; flash: ReturnType<typeof collectLight>; flash2: ReturnType<typeof collectLight> } => {
    const items: RenderItem[] = [
      { label: "ground", geometry: Geometry.box(), material: new PBRMaterial({ name: "ground", baseColor: [0.6, 0.5, 0.3, 1] }) },
      { label: "kart", geometry: Geometry.box(), material: new PBRMaterial({ name: "kart", baseColor: [0.8, 0.1, 0.1, 1], metallic: 0.4 }) }
    ];
    const sunLight = new DirectionalLight("sun");
    sunLight.transform.updateWorld(undefined, true);
    const point = (name: string) => {
      const light = new PointLight(name);
      light.range = 6;
      light.transform.updateWorld(undefined, true);
      return collectLight(light);
    };
    return { items, sun: collectLight(sunLight), flash: point("turbo-flash"), flash2: point("ring-flash") };
  };

  it("a light leaving keeps every lit mesh drawn with the ready larger-bound variant while the new one compiles", async () => {
    setRendererQrFlags(V2);
    const device = new ParallelCompileDevice();
    const { items, sun, flash } = lit();
    // Only the flash variant is warm (the scene started mid-flash).
    frame(device, items, [sun, flash]);
    await flush();
    const steady = frame(device, items, [sun, flash]);
    expect(steady).toBe(items.length);
    // The flash ends: the sun-only variants compile behind a held driver, the 2-light program stands in.
    device.hold = true;
    expect(frame(device, items, [sun])).toBe(steady);
    expect(rendererProgramCachePeek(device, V2)?.stats().pending ?? 0).toBeGreaterThan(0);
    device.hold = false;
    device.release();
    await flush();
    expect(frame(device, items, [sun])).toBe(steady);
    device.dispose();
  });

  it("a light arriving never borrows a smaller-bound program (WebGPU rejects the packet) and draws once its variant is ready", async () => {
    setRendererQrFlags(V2);
    const device = new ParallelCompileDevice();
    const { items, sun, flash, flash2 } = lit();
    frame(device, items, [sun]);
    await flush();
    const steady = frame(device, items, [sun]);
    expect(steady).toBe(items.length);
    // No ready variant can hold 2 lights: the draws wait (no throw, no wrong-bound program).
    device.hold = true;
    expect(() => frame(device, items, [sun, flash])).not.toThrow();
    expect(frame(device, items, [sun, flash])).toBe(0);
    device.hold = false;
    device.release();
    await flush();
    expect(frame(device, items, [sun, flash])).toBe(steady);
    // Warm a 3-light variant (what games do for VFX lights); dropping back to 2 lights while the 2-light variant is
    // evicted/pending borrows the warmed larger one.
    frame(device, items, [sun, flash, flash2]);
    await flush();
    expect(frame(device, items, [sun, flash, flash2])).toBe(steady);
    device.dispose();
  });

  it("a material with no ready sibling still waits for its first program (no wrong-variant draw)", async () => {
    setRendererQrFlags(V2);
    const device = new ParallelCompileDevice();
    device.hold = true;
    const items: RenderItem[] = [{ label: "first", geometry: Geometry.box(), material: new PBRMaterial({ name: "first" }) }];
    const sunLight = new DirectionalLight("sun");
    sunLight.transform.updateWorld(undefined, true);
    const sun = collectLight(sunLight);
    expect(frame(device, items, [sun])).toBe(0);
    device.hold = false;
    device.release();
    await flush();
    expect(frame(device, items, [sun])).toBe(1);
    device.dispose();
  });
});
