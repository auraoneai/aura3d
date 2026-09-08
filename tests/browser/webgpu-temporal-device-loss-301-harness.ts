import { Geometry, Renderer, UnlitMaterial } from "@aura3d/rendering";
import type { RenderTarget } from "../../packages/rendering/src/RenderDevice";
import type { WebGPULike, WebGPUDeviceLike } from "../../packages/rendering/src/WebGPUDevice";

/** Instrument real requestDevice results; never substitute an adapter, texture, queue, or shader. */
export async function runTemporalDeviceLoss301() {
  const gpu = (navigator as unknown as { gpu: WebGPULike }).gpu;
  if (!gpu) throw new Error("NATIVE_WEBGPU_REQUIRED: navigator.gpu is unavailable");
  const realAdapter = await gpu.requestAdapter();
  if (!realAdapter) throw new Error("NATIVE_WEBGPU_REQUIRED: no native adapter");
  let native: WebGPUDeviceLike | undefined;
  const instrumented: WebGPULike = {
    getPreferredCanvasFormat: () => gpu.getPreferredCanvasFormat?.() ?? "bgra8unorm",
    requestAdapter: async () => new Proxy(realAdapter, {
      get(target, property) {
        if (property === "requestDevice") return async (...args: unknown[]) => {
          native = await Reflect.apply(target.requestDevice, target, args);
          return native;
        };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  };
  const renderer = await Renderer.create({ backend: "webgpu", webgpu: instrumented, width: 32, height: 32 });
  const device = renderer.device;
  const targets: RenderTarget[] = [];
  const createTarget = device.createRenderTarget.bind(device);
  device.createRenderTarget = descriptor => { const target = createTarget(descriptor); targets.push(target); return target; };
  const geometry = Geometry.triangle();
  const material = new UnlitMaterial({ color: [0.8, 0.2, 0.1, 1] });
  const output = device.createRenderTarget({ width: 32, height: 32, format: "rgba8", label: "loss301-output" });
  const source = { renderItems: [{ geometry, material, label: "loss301-rigid-triangle" }], renderTarget: output,
    cameraPolicy: "identity" as const, postprocess: { execution: "auto" as const, toneMapping: { operator: "linear" as const }, taa: { blend: 0.8 }, temporal: { sceneKey: "loss301" } } };
  try {
    const adapter = `${device.info.vendor} ${device.info.renderer}`;
    if (/swiftshader|llvmpipe|software|lavapipe/i.test(adapter)) throw new Error(`NATIVE_HARDWARE_REQUIRED: ${adapter}`);
    await renderer.renderAsync(source);
    await renderer.renderAsync(source);
    const temporal = targets.filter(target => target.label.startsWith("renderer-temporal-"));
    device.setRenderTarget(output);
    const before = await device.readPixelsAsync!(0, 0, 32, 32);
    // A real copy/map is submitted, then the underlying GPU device is destroyed before awaiting it.
    const pending = device.readPixelsAsync!(0, 0, 32, 32).then(() => "completed-before-loss", error => `rejected:${String(error)}`);
    if (!native?.destroy || !native.lost) throw new Error("NATIVE_DEVICE_LOSS_API_REQUIRED");
    native.destroy();
    const loss = await native.lost;
    await Promise.resolve();
    const inFlight = await pending;
    let renderError = "", readError = "";
    try { await renderer.renderAsync(source); } catch (error) { renderError = String(error); }
    try { await device.readPixelsAsync!(0, 0, 32, 32); } catch (error) { readError = String(error); }
    const diagnostics = device.getDiagnostics();
    const historyDisposed = temporal.length >= 3 && temporal.every(target => target.disposed);
    renderer.dispose();
    const allTargetsDisposed = targets.every(target => target.disposed);
    // Recovery is explicit construction on a new native device; there is no fallback renderer.
    const replacement = await Renderer.create({ backend: "webgpu", width: 32, height: 32 });
    const freshOutput = replacement.device.createRenderTarget({ width: 32, height: 32, format: "rgba8", label: "loss301-reseed" });
    let freshPixels: Uint8Array;
    let reseedReferenceMaxDelta = 0;
    try {
      await replacement.renderAsync({ ...source, renderTarget: freshOutput, postprocess: { ...source.postprocess, temporal: { sceneKey: "loss301-new-device", reset: true } } });
      replacement.device.setRenderTarget(freshOutput);
      freshPixels = await replacement.device.readPixelsAsync!(0, 0, 32, 32);
      await replacement.renderAsync({ ...source, renderTarget: freshOutput, postprocess: { execution: "auto", toneMapping: { operator: "linear" } } });
      replacement.device.setRenderTarget(freshOutput);
      const coldReference = await replacement.device.readPixelsAsync!(0, 0, 32, 32);
      for (let i = 0; i < coldReference.length; i++) if (i % 4 !== 3) reseedReferenceMaxDelta = Math.max(reseedReferenceMaxDelta, Math.abs(coldReference[i]! - freshPixels[i]!));
    } finally { freshOutput.dispose(); replacement.dispose(); }
    return { schema: "muse301-native-temporal-device-loss/v1", adapter, backend: device.kind,
      loss: { reason: loss.reason, message: loss.message }, inFlight, renderError, readError,
      reseedReferenceMaxDelta, contextLost: diagnostics.contextLost, lastError: diagnostics.lastError, historyDisposed, allTargetsDisposed,
      beforeNonzero: before.some((value, index) => index % 4 !== 3 && value > 20),
      reseededNonzero: freshPixels.some((value, index) => index % 4 !== 3 && value > 20), replacementBackend: replacement.device.kind };
  } finally { renderer.dispose(); material.dispose(); geometry.dispose(); }
}
(window as unknown as { runTemporalDeviceLoss301: typeof runTemporalDeviceLoss301 }).runTemporalDeviceLoss301 = runTemporalDeviceLoss301;
