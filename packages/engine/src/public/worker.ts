/** Worker-owned rendering bridge; importing this entry does not create a worker. */
export { AuraWorkerError, supportsWorkerRendering, createWorkerRendererOrFallback, createWorkerRenderer, installWorkerRenderer } from "../agent-api/app/workerRuntime.js";
export { workerRendererUrl, createWorkerRendererWorker } from "../agent-api/app/workerFactory.js";
export type { AuraWorkerRendererOptions, AuraWorkerRenderer, AuraWorkerRuntimeOptions, AuraWorkerRendererMountContext } from "../agent-api/app/workerRuntime.js";
export type { AuraWorkerPointer, AuraWorkerPointerEvent, AuraWorkerKeyEvent, AuraWorkerInput, AuraWorkerRequest, AuraWorkerFrameResult, AuraWorkerScreenshotPayload, AuraWorkerResponse, AuraWorkerEndpoint, AuraWorkerHostEndpoint } from "../agent-api/app/workerProtocol.js";
export type { OffscreenCanvasSize } from "../agent-api/app/canvas.js";
export type { WorkerScheduledFrame } from "../agent-api/app/workerFrameLoop.js";
