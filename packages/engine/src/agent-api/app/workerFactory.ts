/**
 * Create the bundled default module worker without transferring a canvas.
 * Vite consumers must set `worker: { format: "es" }` for the worker's dynamic imports.
 */
export function createWorkerRendererWorker(): Worker {
  return new Worker(new URL("./render.worker.js", import.meta.url), { type: "module" });
}

export { workerRendererUrl } from "./workerRuntime.js";
