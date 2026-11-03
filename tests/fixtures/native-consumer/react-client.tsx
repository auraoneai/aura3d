import React from "react";
import { createRoot } from "react-dom/client";
import { AuraCanvas, Lights, Model, Scene } from "@aura3d/react";
import { defineAuraAssets, lights, primitives, scene, type AuraApp } from "@aura3d/engine";
import { createWorkerRenderer, createWorkerRendererWorker, workerRendererUrl } from "@aura3d/engine/worker";
import { parseGaussianSplat } from "@aura3d/assets";
import { parseGaussianSplat as parseEngineGaussianSplat } from "@aura3d/engine/assets";

// The source harness generates this independent triangle and records its actual hash.
declare const __AURA_MATRIX_TRIANGLE_SHA256__: string;
const triangle = defineAuraAssets({ triangle: {
  type: "model", format: "glb", url: "/triangle.glb", hash: `sha256-${__AURA_MATRIX_TRIANGLE_SHA256__}`,
  bounds: [1.4, 1.3, 0], metadata: { license: "MIT", purpose: "abstract matrix fixture" }
} }).triangle;

declare global {
  interface Window {
    runNativeConsumer: () => Promise<{ mounts: number; disposals: number; worker: boolean; splats: number; engineSplats: number; nestedZstd: boolean }>;
  }
}

window.runNativeConsumer = async () => {
  let mounts = 0;
  let disposals = 0;
  for (let i = 0; i < 2; i++) {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const app = await new Promise<AuraApp>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("AuraCanvas did not mount")), 15_000);
      root.render(<AuraCanvas autoStart={false} onReady={(value) => {
        clearTimeout(timer);
        mounts++;
        const dispose = value.dispose.bind(value);
        value.dispose = () => { disposals++; dispose(); };
        resolve(value);
      }}><Scene><Lights type="ambient" intensity={1} /><Model asset={triangle} /></Scene></AuraCanvas>);
    });
    await app.ready();
    await app.stepAsync(0);
    if (!container.querySelector("canvas")) throw new Error("AuraCanvas did not render a canvas");
    root.unmount();
    container.remove();
  }
  if (mounts !== 2 || disposals !== 2) throw new Error(`mount/dispose mismatch: ${mounts}/${disposals}`);
  if (typeof OffscreenCanvas !== "function") throw new Error("OffscreenCanvas unavailable in this browser");
  const worker = createWorkerRendererWorker();
  const canvas = new OffscreenCanvas(32, 32);
  const renderer = createWorkerRenderer({
    canvas, worker, scene: scene().add(lights.ambient({ intensity: 1 })).add(primitives.box({ name: "matrix-cube" })).toJSON(),
    size: { width: 32, height: 32, pixelRatio: 1 }, autoStart: false, bridgeEvents: false
  });
  try {
    await renderer.ready;
    await renderer.resize({ width: 64, height: 48, pixelRatio: 1 });
    const frame = await renderer.step(1 / 60);
    if (frame.width !== 64 || frame.height !== 48 || frame.drawCalls < 1) throw new Error(`worker frame failed: ${JSON.stringify(frame)}`);
  } finally { await renderer.dispose(); }

  const response = await fetch("/splat.spz");
  if (!response.ok) throw new Error("Could not fetch the SPZ fixture");
  const input = new Uint8Array(await response.arrayBuffer());
  // Exercise the worker fallback even in browsers which support native Zstandard.
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "DecompressionStream");
  Object.defineProperty(globalThis, "DecompressionStream", { configurable: true, writable: true, value: undefined });
  let splats: number;
  let engineSplats: number;
  try {
    const cloud = await parseGaussianSplat(input, "spz");
    splats = cloud.count;
    if (splats !== 512 || cloud.positions[0] !== 1 || cloud.positions[1] !== -2 || cloud.positions[2] !== 0.5) throw new Error("Standalone SPZ decode failed");
    const engineCloud = await parseEngineGaussianSplat(input, "spz");
    engineSplats = engineCloud.count;
    if (engineSplats !== 512 || engineCloud.positions[0] !== 1 || engineCloud.positions[1] !== -2 || engineCloud.positions[2] !== 0.5) throw new Error("Engine SPZ decode failed");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "DecompressionStream", descriptor);
    else Reflect.deleteProperty(globalThis, "DecompressionStream");
  }

  // The engine's render worker carries a separate same-origin URL for its nested decoder.
  const manifest = JSON.parse(workerRendererUrl().searchParams.get("aura3dWorkerAssets") ?? "null") as { zstdWorker?: unknown } | null;
  if (typeof manifest?.zstdWorker !== "string" || new URL(manifest.zstdWorker).origin !== location.origin) throw new Error("Missing engine decoder worker URL");
  const nested = new Worker(manifest.zstdWorker, { type: "module" });
  const compressedLength = Number(new DataView(input.buffer, input.byteOffset, input.byteLength).getBigUint64(32, true));
  const compressed = input.slice(128, 128 + compressedLength);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Nested Zstandard worker timed out")), 10_000);
      nested.onmessage = (event: MessageEvent<{ ok?: boolean; output?: ArrayBuffer; notice?: string }>) => {
        clearTimeout(timer);
        const data = event.data;
        if (!data?.ok || !(data.output instanceof ArrayBuffer) || data.output.byteLength !== 4608 || !data.notice?.includes("Yann Collet")) reject(new Error("Nested Zstandard worker decode failed"));
        else resolve();
      };
      nested.onerror = () => { clearTimeout(timer); reject(new Error("Nested Zstandard worker failed to start")); };
      nested.postMessage({ input: compressed.buffer, expectedBytes: 4608 }, [compressed.buffer]);
    });
  } finally { nested.terminate(); }
  return { mounts, disposals, worker: true, splats, engineSplats, nestedZstd: true };
};
