/**
 * R-22 diagnostic: one WebGPU presentation route per page load (`?route=<name>`).
 * Reports whether the GPUDevice survives presenting frames and whether the presented
 * pixels can be read back. No Aura3D code runs here: this isolates the browser/runner.
 */
export {};

type Route = "onscreen" | "detached" | "offscreen-main" | "offscreen-worker" | "copy-external" | "premultiplied-rgba8";

interface ProbeResult {
  route: string;
  status: "running" | "done" | "error";
  outcome?: string;
  pixel?: number[] | null;
  adapter?: Record<string, unknown>;
  error?: string;
  frames?: number;
}

declare global {
  interface Window {
    __PROBE__?: ProbeResult;
  }
}

const params = new URLSearchParams(location.search);
const route = (params.get("route") ?? "onscreen") as Route;
const result: ProbeResult = { route, status: "running" };
window.__PROBE__ = result;
const out = document.querySelector("#out")!;
const FRAMES = 8;
const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

const readPixel = async (source: CanvasImageSource): Promise<number[] | null> => {
  try {
    const flat = document.createElement("canvas");
    flat.width = 4; flat.height = 4;
    const ctx = flat.getContext("2d")!;
    ctx.drawImage(source, 0, 0, 4, 4);
    return Array.from(ctx.getImageData(2, 2, 1, 1).data);
  } catch {
    return null;
  }
};

const WORKER_SOURCE = `
self.onmessage = async (event) => {
  const { canvas, frames } = event.data;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();
    let lost = null;
    device.lost.then((info) => { lost = info.reason + ': ' + info.message; });
    const context = canvas.getContext('webgpu');
    context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque' });
    for (let i = 0; i < frames; i += 1) {
      const encoder = device.createCommandEncoder();
      encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0.9, g: 0.1, b: 0.1, a: 1 }, loadOp: 'clear', storeOp: 'store' }] }).end();
      device.queue.submit([encoder.finish()]);
      await new Promise((r) => setTimeout(r, 30));
    }
    await new Promise((r) => setTimeout(r, 600));
    let bitmap = null;
    try { bitmap = canvas.transferToImageBitmap ? canvas.transferToImageBitmap() : null; } catch (e) { bitmap = null; }
    self.postMessage({ lost, bitmap }, bitmap ? [bitmap] : []);
  } catch (error) {
    self.postMessage({ error: String(error && error.message || error) });
  }
};`;

const gpu = (navigator as unknown as { gpu?: any }).gpu;

const renderFrames = async (device: any, context: any, sink: { lost: string | null }, frameDelay: "raf" | "timeout"): Promise<void> => {
  for (let i = 0; i < FRAMES; i += 1) {
    const encoder = device.createCommandEncoder();
    encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0.9, g: 0.1, b: 0.1, a: 1 }, loadOp: "clear", storeOp: "store" }] }).end();
    device.queue.submit([encoder.finish()]);
    if (sink.lost) return;
    await (frameDelay === "raf" ? new Promise<void>((done) => requestAnimationFrame(() => done())) : wait(30));
  }
};

const main = async (): Promise<void> => {
  if (!gpu) throw new Error("navigator.gpu missing");
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error("no adapter");
  result.adapter = { isFallbackAdapter: adapter.isFallbackAdapter ?? null, vendor: adapter.info?.vendor ?? null, architecture: adapter.info?.architecture ?? null, description: adapter.info?.description ?? null };

  if (route === "offscreen-worker") {
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    const offscreen = canvas.transferControlToOffscreen();
    const worker = new Worker(URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" })));
    const reply = await new Promise<{ lost?: string | null; bitmap?: ImageBitmap | null; error?: string }>((done) => {
      worker.onmessage = (event) => done(event.data);
      worker.onerror = (event) => done({ error: `worker error: ${event.message}` });
      worker.postMessage({ canvas: offscreen, frames: FRAMES }, [offscreen]);
      setTimeout(() => done({ error: "worker timeout 15s" }), 15000);
    });
    result.frames = FRAMES;
    if (reply.error) { result.outcome = `error:${reply.error}`; return; }
    result.outcome = reply.lost ? `lost:${reply.lost}` : "alive";
    result.pixel = reply.bitmap ? await readPixel(reply.bitmap) : null;
    return;
  }

  const device = await adapter.requestDevice();
  const sink = { lost: null as string | null };
  void device.lost.then((info: { reason: string; message: string }) => { sink.lost = `${info.reason}: ${info.message}`; });
  const format = route === "premultiplied-rgba8" ? "rgba8unorm" : gpu.getPreferredCanvasFormat();
  let presented: CanvasImageSource | null = null;

  if (route === "offscreen-main") {
    const canvas = new OffscreenCanvas(64, 64);
    const context = canvas.getContext("webgpu") as any;
    context.configure({ device, format, alphaMode: "opaque" });
    await renderFrames(device, context, sink, "timeout");
    await wait(600);
    presented = canvas.transferToImageBitmap();
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    if (route !== "detached") document.body.appendChild(canvas);
    const context = canvas.getContext("webgpu") as any;
    if (route === "copy-external") {
      context.configure({ device, format, alphaMode: "opaque", usage: 0x10 | 0x02 });
      const source = document.createElement("canvas");
      source.width = 64; source.height = 64;
      const ctx2d = source.getContext("2d")!;
      ctx2d.fillStyle = "rgb(230,25,25)"; ctx2d.fillRect(0, 0, 64, 64);
      const bitmap = await createImageBitmap(source);
      for (let i = 0; i < FRAMES && !sink.lost; i += 1) {
        device.queue.copyExternalImageToTexture({ source: bitmap }, { texture: context.getCurrentTexture() }, [64, 64]);
        await new Promise<void>((done) => requestAnimationFrame(() => done()));
      }
    } else {
      context.configure({ device, format, alphaMode: route === "premultiplied-rgba8" ? "premultiplied" : "opaque" });
      await renderFrames(device, context, sink, "raf");
    }
    await wait(600);
    presented = canvas;
  }

  result.frames = FRAMES;
  result.outcome = sink.lost ? `lost:${sink.lost}` : "alive";
  result.pixel = presented ? await readPixel(presented) : null;
  if (!sink.lost) device.destroy();
};

main()
  .catch((error: unknown) => {
    result.status = "error";
    result.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    result.outcome = result.outcome ?? `error:${result.error}`;
  })
  .finally(() => {
    if (result.status === "running") result.status = "done";
    out.textContent = JSON.stringify(result);
  });
