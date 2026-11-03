import { installWorkerRenderer, type AuraWorkerEndpoint, type AuraWorkerRequest, type AuraWorkerResponse } from "@aura3d/engine/worker";

// Phase B can distinguish worker adapter absence from a renderer failure.
const workerGpu = (globalThis.navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
void (workerGpu ? workerGpu.requestAdapter().then(Boolean, () => false) : Promise.resolve(false))
  .then((available) => (globalThis as unknown as { postMessage(value: unknown): void }).postMessage({ type: "gpu-availability", available }));

// The pointer snapshot changes real scene data in the worker. The next frame
// recompiles that scene, so the pixel assertion exercises input delivery as well
// as worker-owned rendering, rather than merely checking a message counter.
installWorkerRenderer(globalThis as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>, {
  onFrame(frame, snapshot) {
    if (frame.input?.pointers.some((pointer) => pointer.buttons !== 0) && snapshot.background !== "#ee2010") {
      return { ...snapshot, background: "#ee2010" };
    }
  }
});
