/**
 * KTX2 transcode worker pool (PRD-05 §7.4). Workers are built from the
 * vendored `basis_transcoder.js` + `.wasm` fetched once from the same-origin
 * `transcoderUrl` — three r185's blob-worker recipe, so no bundler worker
 * handling is required and module/wasm URLs stay same-origin.
 */

import type { KTX2TranscodedLevel } from "./KTX2TranscodeDriver.js";

const WORKER_SOURCE = `
let basisModule = null;
let readyPromise = null;
self.addEventListener("message", function (e) {
  const message = e.data;
  if (message.type === "init") {
    const mod = { wasmBinary: message.wasmBinary, onRuntimeInitialized: null };
    readyPromise = new Promise(function (resolve) {
      mod.onRuntimeInitialized = resolve;
      BASIS(mod);
    }).then(function () {
      basisModule = mod;
      basisModule.initializeBasis();
    });
    readyPromise = readyPromise.then(function () {
      self.postMessage({ type: "ready", id: message.id });
    });
    return;
  }
  if (message.type === "transcode") {
    readyPromise.then(function () {
      try {
        const result = __transcode(basisModule, new Uint8Array(message.buffer), message.transcoderFormat, message.maxDimension);
        self.postMessage({ type: "transcode", id: message.id, result: result }, result.levels.map(function (l) { return l.data.buffer; }));
      } catch (error) {
        self.postMessage({ type: "error", id: message.id, error: error && error.message ? error.message : String(error) });
      }
    });
  }
});
`;

const DRIVER_SOURCE = `
function __transcode(basis, bytes, transcoderFormat, maxDimension) {
  const file = new basis.KTX2File(bytes);
  function cleanup() { file.close(); file.delete(); }
  try {
    if (!file.isValid()) throw new Error("Invalid or unsupported .ktx2 file");
    if (!file.isUASTC() && !file.isETC1S() && !(file.isHDR && file.isHDR())) throw new Error("Unknown Basis encoding");
    const width = file.getWidth();
    const height = file.getHeight();
    const layerCount = file.getLayers() || 1;
    const levelCount = file.getLevels();
    const faceCount = file.getFaces();
    const hasAlpha = file.getHasAlpha();
    if (!width || !height || !levelCount) throw new Error("Invalid texture");
    if (!file.startTranscoding()) throw new Error(".startTranscoding failed");
    const levels = [];
    let remaining = levelCount;
    for (let face = 0; face < faceCount; face += 1) {
      for (let level = 0; level < levelCount; level += 1) {
        const levelInfo = file.getImageLevelInfo(level, 0, face);
        if (maxDimension !== undefined && Math.max(levelInfo.origWidth, levelInfo.origHeight) > maxDimension) { remaining -= 1; continue; }
        const layerData = [];
        for (let layer = 0; layer < layerCount; layer += 1) {
          const dst = new Uint8Array(file.getImageTranscodedSizeInBytes(level, layer, face, transcoderFormat));
          if (!file.transcodeImage(dst, level, layer, face, transcoderFormat, 0, -1, -1)) throw new Error(".transcodeImage failed");
          layerData.push(dst);
        }
        let data = layerData[0];
        if (layerData.length > 1) {
          let total = 0; for (const p of layerData) total += p.byteLength;
          data = new Uint8Array(total);
          let off = 0; for (const p of layerData) { data.set(p, off); off += p.byteLength; }
        }
        const mipWidth = remaining > 1 ? levelInfo.origWidth : levelInfo.width;
        const mipHeight = remaining > 1 ? levelInfo.origHeight : levelInfo.height;
        levels.push({ width: mipWidth, height: mipHeight, data: data });
        remaining -= 1;
      }
    }
    if (levels.length === 0) throw new Error("maxDimension skipped every mip level");
    return { width: levels[0].width, height: levels[0].height, isUASTC: file.isUASTC(), hasAlpha: hasAlpha, levels: levels };
  } finally {
    cleanup();
  }
}
`;

export interface KTX2WorkerTranscodeRequest {
  readonly bytes: Uint8Array;
  readonly transcoderFormat: number;
  readonly maxDimension?: number;
}

export interface KTX2WorkerTranscodeResult {
  readonly width: number;
  readonly height: number;
  readonly isUASTC: boolean;
  readonly hasAlpha: boolean;
  readonly levels: readonly KTX2TranscodedLevel[];
}

interface PoolWorker {
  readonly worker: Worker;
  busy: boolean;
}

interface PendingJob {
  readonly request: KTX2WorkerTranscodeRequest;
  readonly resolve: (result: KTX2WorkerTranscodeResult) => void;
  readonly reject: (error: Error) => void;
}

export interface KTX2TranscodeWorkerPool {
  transcode(request: KTX2WorkerTranscodeRequest): Promise<KTX2WorkerTranscodeResult>;
  dispose(): void;
}

/**
 * Creates a worker pool of `workerCount` transcoding workers. The pool lazily
 * materialises its blob URL on first `transcode` call — construction is cheap
 * and synchronous; `dispose()` terminates every worker.
 */
export function createKTX2TranscodeWorkerPool(transcoderUrl: string, workerCount: number): KTX2TranscodeWorkerPool {
  const base = transcoderUrl.endsWith("/") ? transcoderUrl : `${transcoderUrl}/`;
  const size = Math.max(1, workerCount | 0);
  let initPromise: Promise<PoolWorker[]> | undefined;
  const queue: PendingJob[] = [];
  const jobIds = new Map<number, PendingJob>();
  let nextJobId = 1;
  let disposed = false;

  const init = async (): Promise<PoolWorker[]> => {
    initPromise ??= (async () => {
      const [jsText, wasmBinary] = await Promise.all([
        fetch(`${base}basis_transcoder.js`).then((response) => {
          if (!response.ok) throw new Error(`basis_transcoder.js fetch failed with ${response.status}`);
          return response.text();
        }),
        fetch(`${base}basis_transcoder.wasm`).then((response) => {
          if (!response.ok) throw new Error(`basis_transcoder.wasm fetch failed with ${response.status}`);
          return response.arrayBuffer();
        })
      ]);
      const blob = new Blob([WORKER_SOURCE, "\n", jsText, "\n", DRIVER_SOURCE], { type: "text/javascript" });
      const workerUrl = URL.createObjectURL(blob);
      const workers: PoolWorker[] = [];
      for (let index = 0; index < size; index += 1) {
        const worker = new Worker(workerUrl);
        worker.onmessage = (event: MessageEvent) => onWorkerMessage(workers[index]!, event);
        workers.push({ worker, busy: false });
        worker.postMessage({ type: "init", id: 0, wasmBinary: wasmBinary.slice(0) }, [wasmBinary.slice(0)]);
      }
      return workers;
    })();
    return initPromise;
  };

  const onWorkerMessage = (slot: PoolWorker, event: MessageEvent): void => {
    const message = event.data as { type?: string; id?: number; result?: KTX2WorkerTranscodeResult; error?: string };
    if (message.type === "ready") { slot.busy = false; pump(slot); return; }
    const job = message.id !== undefined ? jobIds.get(message.id) : undefined;
    if (job) {
      jobIds.delete(message.id!);
      slot.busy = false;
      if (message.type === "transcode") job.resolve(message.result!);
      else job.reject(new Error(message.error ?? "KTX2 transcode failed"));
    }
    pump(slot);
  };

  const pump = (slot: PoolWorker): void => {
    if (slot.busy || disposed) return;
    const job = queue.shift();
    if (!job) return;
    slot.busy = true;
    const id = nextJobId++;
    jobIds.set(id, job);
    const payload = { type: "transcode", id, buffer: job.request.bytes.buffer.slice(0), transcoderFormat: job.request.transcoderFormat, maxDimension: job.request.maxDimension };
    slot.worker.postMessage(payload, [payload.buffer]);
  };

  return {
    async transcode(request: KTX2WorkerTranscodeRequest): Promise<KTX2WorkerTranscodeResult> {
      if (disposed) throw new Error("KTX2 worker pool is disposed");
      const workers = await init();
      return new Promise<KTX2WorkerTranscodeResult>((resolve, reject) => {
        const job: PendingJob = { request, resolve, reject };
        const free = workers.find((slot) => !slot.busy);
        if (free) { queue.push(job); pump(free); }
        else queue.push(job);
      });
    },
    dispose(): void {
      disposed = true;
      for (const job of queue.splice(0)) job.reject(new Error("KTX2 worker pool disposed"));
      for (const job of [...jobIds.values()]) job.reject(new Error("KTX2 worker pool disposed"));
      jobIds.clear();
      initPromise?.then((workers) => workers.forEach((slot) => slot.worker.terminate()));
    }
  };
}
