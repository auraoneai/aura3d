import { Renderer } from "../../../packages/rendering/src/Renderer";
import { temporalAccumulationWeight } from "../../../packages/rendering/src/webgpu/WebGPUTemporal";
import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd03";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { identityMat4 } from "@aura3d/scene";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { createRendererPostprocessPlanDiagnostics } from "../../../packages/rendering/src/RendererPostprocessPlan";

function fixture() {
  const device = new MockRenderDevice();
  const owner = new TemporalHistory();
  const item = { geometry: Geometry.triangle(), label: "rigid", modelMatrix: identityMat4() };
  const prepare = (options = {}, width = 16) => { device.beginFrame(width, 16); try { return owner.prepare(device, width, 16, [item], identityMat4(), options); } finally { device.endFrame(); } };
  return { device, owner, item, prepare };
}

describe("renderer temporal ownership", () => {
  it.each([false,true])("reseeds after a configured temporal frame with no active effect (async=%s)", async (asynchronous) => {
    const renderer = await Renderer.create({backend:"mock",width:16,height:16});
    const owner = (renderer as unknown as {temporalHistory:TemporalHistory}).temporalHistory;
    const prepare=vi.spyOn(owner,"prepare"),commit=vi.spyOn(owner,"commit");
    renderer.device.presentLdrPostprocess=()=>undefined;
    const item={geometry:Geometry.triangle(),label:"frame-state-rigid",modelMatrix:identityMat4()};
    const render=async(active:boolean)=>{
      const source={renderItems:[item],cameraPolicy:"identity" as const,postprocess:{execution:"auto" as const,toneMapping:{operator:"linear" as const},temporal:{sceneKey:"same"},...(active?{taa:{blend:.9}}:{})}};
      if(asynchronous)await renderer.renderAsync(source);else renderer.render(source);
    };
    await render(true);expect(prepare.mock.results.at(-1)!.value.historyValid).toBe(false);
    await render(false);expect(commit).toHaveBeenCalledTimes(1);
    await render(true);expect(prepare.mock.results.at(-1)!.value.historyValid).toBe(false);
    expect(commit).toHaveBeenCalledTimes(2);
    renderer.dispose();
  });

  it("removes arbitrary cold-sample bias before reaching the authored steady weight", () => {
    let firstSampleWeight = 1;
    for (let samples = 1; samples <= 9; samples++) {
      firstSampleWeight *= temporalAccumulationWeight(.9, samples);
      expect(firstSampleWeight).toBeCloseTo(1 / (samples + 1), 12);
    }
    expect(temporalAccumulationWeight(.9, 20)).toBe(.9);
    expect(temporalAccumulationWeight(.9, 0)).toBe(0);
    expect(()=>temporalAccumulationWeight(.9, -1)).toThrow();
  });

  it("rasterizes rigid transforms and advances only after a committed frame", () => {
    const { device, owner, item, prepare } = fixture();
    const seed = prepare();
    expect(seed.historyValid).toBe(false);
    const first = device.drawCommands.at(-1)!;
    expect(first.uniforms?.get("u_previousViewProjection")).toEqual(first.uniforms?.get("u_modelViewProjection"));
    owner.commit();
    item.modelMatrix[12] = .25;
    const moved = prepare();
    expect(moved.historyValid).toBe(true);
    expect(moved.history).toBe(seed.historyOutput);
    const draw = device.drawCommands.at(-1)!;
    expect((draw.uniforms?.get("u_previousViewProjection") as Float32Array)[12]).toBe(0);
    expect((draw.uniforms?.get("u_modelViewProjection") as Float32Array)[12]).toBe(.25);
    owner.dispose(); device.dispose();
  });

  it("keeps raster jitter out of physical motion vectors", () => {
    const { device, owner, prepare } = fixture();
    prepare({ jitter: true }); owner.commit();
    prepare({ jitter: true });
    const draw = device.drawCommands.at(-1)!;
    const raster = draw.uniforms!.get("u_modelViewProjection") as Float32Array;
    const current = draw.uniforms!.get("u_unjitteredViewProjection") as Float32Array;
    const previous = draw.uniforms!.get("u_previousViewProjection") as Float32Array;
    expect(current).toEqual(previous);
    expect(Array.from(current)).toEqual(identityMat4());
    expect(Array.from(raster)).not.toEqual(Array.from(current));
    owner.dispose(); device.dispose();
  });

  it("distributes both alternating motion phases across the whole pixel", () => {
    const { device, owner, prepare } = fixture();
    const phases: number[][] = [[], [], [], []];
    for (let frame = 0; frame < 64; frame++) {
      prepare({ jitter: true });
      if (frame > 0) for (let axis=0;axis<2;axis++) phases[axis*2+frame % 2]!.push(owner.jitter(16, 16)[axis]! * 8);
      owner.commit();
    }
    for (const samples of phases) {
      expect(Math.min(...samples)).toBeLessThan(-.4);
      expect(Math.max(...samples)).toBeGreaterThan(.4);
      expect(Math.abs(samples.reduce((a,b)=>a+b,0)/samples.length)).toBeLessThan(.08);
    }
    owner.dispose(); device.dispose();
  });

  it("reseeds cuts, scene replacement, resize, and releases old targets", () => {
    const { device, owner, prepare } = fixture();
    const first = prepare({sceneKey:"a"}); owner.commit();
    expect(prepare({sceneKey:"a"}).historyValid).toBe(true);
    expect(prepare({sceneKey:"b"}).historyValid).toBe(false);
    owner.commit(); owner.reset();
    expect(prepare({sceneKey:"b"}).historyValid).toBe(false);
    owner.commit();
    const resized = prepare({sceneKey:"b"}, 32);
    expect(resized.historyValid).toBe(false);
    expect(first.velocity.disposed).toBe(true);
    owner.dispose();
    expect([resized.velocity,resized.history,resized.historyOutput].every(target=>target.disposed)).toBe(true);
    device.dispose();
  });

  it("rejects duplicate identities and deformed geometry rather than inventing velocity", () => {
    const { device, owner, item } = fixture(); device.beginFrame(16,16);
    expect(()=>owner.prepare(device,16,16,[item,item],identityMat4(),{})).toThrow(/stable unique labels/);
    expect(()=>owner.prepare(device,16,16,[{...item, morphTargets:[{} as never]}],identityMat4(),{})).toThrow(/stable unique labels/);
    owner.dispose(); device.dispose();
  });

  it("flag on (A3D_QR_POST): no velocity re-draw, deformed items accepted, C-14 matrices returned", () => {
    setRendererQrFlags(resolveQrFlags({ options: { A3D_QR_POST: true } }));
    try {
      const { device, owner, prepare } = fixture();
      const drawsBefore = device.drawCommands.length;
      const bindings = prepare({ sceneKey: "s", jitter: true, frameTime: 1 / 60 });
      expect(device.drawCommands.length).toBe(drawsBefore); // no velocity re-render pass
      expect(bindings.v2).toBeDefined();
      expect(bindings.v2!.jitterClip).toHaveLength(2);
      // Jitter is zero on the seed frame by design; the committed second
      // frame carries it, and it must equal what raster applied.
      owner.commit();
      const second = prepare({ sceneKey: "s", jitter: true, frameTime: 1 / 60 });
      expect(second.v2!.jittered).not.toEqual(second.v2!.unjittered);
      expect(device.drawCommands.length).toBe(drawsBefore);
      // Deformed (morph) items throw only on the flag-off re-draw path.
      const morphed = { geometry: Geometry.triangle(), label: "morphed", modelMatrix: identityMat4(), morphTargets: [{} as never] };
      device.beginFrame(16, 16);
      try {
        expect(() => owner.prepare(device, 16, 16, [morphed], identityMat4(), {})).not.toThrow();
      } finally {
        device.endFrame();
      }
      owner.dispose();
      device.dispose();
    } finally {
      setRendererQrFlags(resolveQrFlags({}));
    }
  });

  it("requires three distinct live GPU targets and rejects disposed temporal inputs", () => {
    const { device, owner, prepare } = fixture();
    const temporal = prepare();
    const context = {nativeLdrPostprocess:true, sourceTargetFormat:"rgba8" as const};
    expect(createRendererPostprocessPlanDiagnostics({taa:{temporal}},context).missingInputs).toEqual([]);
    const alias = {...temporal,historyOutput:temporal.history};
    expect(createRendererPostprocessPlanDiagnostics({taa:{temporal:alias}},context).missingInputs).toEqual(["taa:history","taa:velocity"]);
    owner.dispose();
    expect(createRendererPostprocessPlanDiagnostics({taa:{temporal}},context).missingInputs).toEqual(["taa:history","taa:velocity"]);
    device.dispose();
  });
});
