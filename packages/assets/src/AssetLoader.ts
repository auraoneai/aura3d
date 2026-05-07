import type { LoadContext } from "./LoadContext";

export interface AssetLoadRequest {
  readonly url: string;
  readonly type?: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: AssetLoadProgress) => void;
}

export interface AssetLoadProgress {
  readonly url: string;
  readonly phase: "document" | "buffer" | "complete";
  readonly loadedBytes: number;
  readonly totalBytes?: number;
}

export interface AssetLoader<T = unknown> {
  readonly type: string;
  canLoad(request: AssetLoadRequest): boolean;
  dependencies?(request: AssetLoadRequest, context: LoadContext): Promise<readonly string[]> | readonly string[];
  load(request: AssetLoadRequest, context: LoadContext): Promise<T> | T;
  dispose?(asset: T): void | Promise<void>;
}

export class AssetLoadError extends Error {
  readonly url: string;
  readonly dependencyChain: readonly string[];

  constructor(message: string, url: string, dependencyChain: readonly string[] = [], cause?: unknown) {
    super(message);
    this.name = "AssetLoadError";
    this.url = url;
    this.dependencyChain = dependencyChain;
    this.cause = cause;
  }
}
