/* Aura3D KTX2 worker. Basis Universal is loaded separately from the same directory.
 * This file has no imports so its compiled JavaScript can run as a classic worker.
 */
(() => {
  type ImageInfo = { origWidth: number; origHeight: number };
  interface KTX2File {
    isValid(): boolean;
    isUASTC(): boolean;
    isETC1S(): boolean;
    isHDR?(): boolean;
    getWidth(): number;
    getHeight(): number;
    getLayers(): number;
    getLevels(): number;
    getFaces(): number;
    getHasAlpha(): boolean;
    getImageLevelInfo(level: number, layer: number, face: number): ImageInfo;
    getImageTranscodedSizeInBytes(level: number, layer: number, face: number, format: number): number;
    startTranscoding(): boolean;
    transcodeImage(dst: Uint8Array, level: number, layer: number, face: number, format: number, a: number, b: number, c: number): boolean;
    close(): void;
    delete(): void;
  }
  interface BasisModule {
    initializeBasis(): void;
    KTX2File: new (bytes: Uint8Array) => KTX2File;
  }
  type WorkerMessage = {
    type: "init" | "transcode" | "cancel" | "dispose";
    id: number;
    wasmBinary?: ArrayBuffer;
    scriptUrl?: string;
    buffer?: ArrayBuffer;
    transcoderFormat?: number;
    maxDimension?: number;
    maxOutputBytes?: number;
  };
  const scope = globalThis as unknown as {
    onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
    postMessage(message: unknown, transfer?: Transferable[]): void;
    importScripts(...urls: string[]): void;
    close(): void;
    BASIS?: (config: Record<string, unknown>) => unknown;
  };
  let module: BasisModule | undefined;
  let closing = false;

  const fail = (id: number, error: unknown): void => scope.postMessage({ type: "error", id, error: error instanceof Error ? error.message : String(error) });
  function decode(bytes: Uint8Array, format: number, maxDimension: number | undefined, outputLimit: number) {
    if (!module) throw new Error("KTX2 worker is not initialized");
    const file = new module.KTX2File(bytes);
    try {
      if (!file.isValid() || (!file.isUASTC() && !file.isETC1S() && !(file.isHDR?.() ?? false))) throw new Error("Invalid or unsupported KTX2 texture");
      const width = file.getWidth();
      const height = file.getHeight();
      const layers = file.getLayers() || 1;
      const levels = file.getLevels();
      const faces = file.getFaces();
      if (![width, height, layers, levels, faces].every(Number.isSafeInteger) || width <= 0 || height <= 0 || width > 32768 || height > 32768 || layers <= 0 || layers > 2048 || levels <= 0 || levels > 32 || (faces !== 1 && faces !== 6)) throw new Error("Invalid KTX2 texture dimensions");
      if (maxDimension !== undefined && (!Number.isSafeInteger(maxDimension) || maxDimension <= 0)) throw new Error("Invalid KTX2 maximum dimension");
      if (!Number.isSafeInteger(outputLimit) || outputLimit <= 0) throw new Error("Invalid KTX2 output byte limit");
      if (!file.startTranscoding()) throw new Error("KTX2 transcoder initialization failed");
      const output: Array<{ width: number; height: number; data: Uint8Array }> = [];
      let used = 0;
      for (let face = 0; face < faces; face++) {
        for (let level = 0; level < levels; level++) {
          const info = file.getImageLevelInfo(level, 0, face);
          if (![info.origWidth, info.origHeight].every((n) => Number.isSafeInteger(n) && n > 0)) throw new Error("Invalid KTX2 mip dimensions");
          if (maxDimension !== undefined && Math.max(info.origWidth, info.origHeight) > maxDimension) continue;
          const sizes: number[] = [];
          for (let layer = 0; layer < layers; layer++) {
            const size = file.getImageTranscodedSizeInBytes(level, layer, face, format);
            if (!Number.isSafeInteger(size) || size <= 0 || size > outputLimit - used) throw new Error("KTX2 output exceeds byte limit");
            used += size;
            sizes.push(size);
          }
          const data = new Uint8Array(sizes.reduce((sum, size) => sum + size, 0));
          let offset = 0;
          for (let layer = 0; layer < layers; layer++) {
            const end = offset + sizes[layer]!;
            if (!file.transcodeImage(data.subarray(offset, end), level, layer, face, format, 0, -1, -1)) throw new Error("KTX2 transcode failed");
            offset = end;
          }
          output.push({ width: info.origWidth, height: info.origHeight, data });
        }
      }
      if (output.length === 0) throw new Error("KTX2 maximum dimension skipped every mip");
      return { width: output[0]!.width, height: output[0]!.height, isUASTC: file.isUASTC(), hasAlpha: file.getHasAlpha(), levels: output };
    } finally {
      try { file.close(); } finally { file.delete(); }
    }
  }

  scope.onmessage = (event) => {
    const message = event.data;
    if (!message || !Number.isSafeInteger(message.id)) return;
    if (message.type === "cancel") {
      // A synchronous codec call finishes before this event can be delivered.
      // Acknowledging only here proves that the previous call no longer runs.
      scope.postMessage({ type: "cancelled", id: message.id });
      return;
    }
    if (message.type === "dispose") {
      closing = true;
      module = undefined;
      scope.postMessage({ type: "disposed", id: message.id });
      scope.close();
      return;
    }
    if (message.type === "init") {
      if (!(message.wasmBinary instanceof ArrayBuffer)) { fail(message.id, new Error("Missing KTX2 wasm")); return; }
      try {
        if (message.scriptUrl !== undefined) {
          const script = new URL(message.scriptUrl, globalThis.location.href);
          if (script.origin !== globalThis.location.origin || !["http:", "https:"].includes(script.protocol) || script.username || script.password || script.hash) throw new Error("KTX2 codec must be same-origin");
          scope.importScripts(script.href);
        } else scope.importScripts("basis_transcoder.js");
        const factory = scope.BASIS;
        if (typeof factory !== "function") throw new Error("Basis transcoder factory is missing");
        const configuration: Record<string, unknown> = { wasmBinary: message.wasmBinary };
        void new Promise<BasisModule>((resolve, reject) => {
          configuration.onRuntimeInitialized = () => resolve(configuration as unknown as BasisModule);
          configuration.onAbort = (reason: unknown) => reject(new Error(`Basis initialization failed: ${String(reason)}`));
          try {
            const pending = factory(configuration);
            if (pending && typeof (pending as PromiseLike<unknown>).then === "function") {
              Promise.resolve(pending).catch(reject);
            }
          } catch (error) { reject(error); }
        }).then((loaded) => {
          if (closing) return;
          loaded.initializeBasis();
          module = loaded;
          scope.postMessage({ type: "ready", id: message.id });
        }).catch((error: unknown) => { if (!closing) fail(message.id, error); });
      } catch (error) { fail(message.id, error); }
      return;
    }
    if (message.type === "transcode") {
      try {
        if (!(message.buffer instanceof ArrayBuffer) || !Number.isSafeInteger(message.transcoderFormat)) throw new Error("Invalid KTX2 job");
        const result = decode(new Uint8Array(message.buffer), message.transcoderFormat!, message.maxDimension, message.maxOutputBytes ?? 256 * 1024 * 1024);
        scope.postMessage({ type: "transcode", id: message.id, result }, result.levels.map((level) => level.data.buffer as ArrayBuffer));
      } catch (error) { fail(message.id, error); }
    }
  };
})();
