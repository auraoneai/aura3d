import { AudioClip } from "./AudioClip";
import type { AudioContextLike } from "./AudioContextManager";

export interface AudioDecodeContextLike extends AudioContextLike {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> | AudioBuffer;
}

export interface AudioFileAssetLike {
  readonly kind?: string;
  readonly id?: string;
  readonly type?: string;
  readonly format?: string;
  readonly url: string;
  readonly hash?: string;
  readonly sizeBytes?: number;
  readonly license?: string;
}

export type AudioFileInput = string | URL | AudioFileAssetLike | AudioClip;

export interface AudioFileRequest {
  readonly input: AudioFileInput;
  readonly signal?: AbortSignal;
  readonly cacheKey?: string;
  readonly name?: string;
}

export interface AudioFileManagerOptions {
  readonly context: AudioDecodeContextLike;
  readonly fetch?: (url: string, init?: { readonly signal?: AbortSignal }) => Promise<AudioFileFetchResponseLike>;
  readonly cache?: Map<string, AudioClip>;
  readonly validateTypedAudioAssets?: boolean;
}

export interface AudioFileFetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ResolvedAudioFileRequest {
  readonly url: string;
  readonly cacheKey: string;
  readonly name?: string;
  readonly asset?: AudioFileAssetLike;
}

export interface EpisodeAudioAssetRequirement {
  readonly id: string;
  readonly role?: "dialogue" | "music" | "sfx" | "ambient";
  readonly required?: boolean;
  readonly requireLicense?: boolean;
}

export interface EpisodeAudioAssetDiagnostic {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly assetId: string;
}

export interface EpisodeAudioAssetReadiness {
  readonly ok: boolean;
  readonly requiredCount: number;
  readonly readyCount: number;
  readonly missingAssetIds: readonly string[];
  readonly diagnostics: readonly EpisodeAudioAssetDiagnostic[];
}

export class AudioFileManager {
  private readonly cache: Map<string, AudioClip>;
  private readonly inflight = new Map<string, Promise<AudioClip>>();

  constructor(private readonly options: AudioFileManagerOptions) {
    this.cache = options.cache ?? new Map();
  }

  resolve(input: AudioFileInput, request: Omit<AudioFileRequest, "input"> = {}): ResolvedAudioFileRequest {
    if (input instanceof AudioClip) {
      const name = request.name ?? input.name;
      return {
        url: name ? `clip:${name}` : "clip:anonymous",
        cacheKey: request.cacheKey ?? (name ? `clip:${name}` : "clip:anonymous"),
        ...(name ? { name } : {})
      };
    }

    if (input instanceof URL) {
      const url = input.toString();
      return { url, cacheKey: request.cacheKey ?? url, ...(request.name ? { name: request.name } : {}) };
    }

    if (typeof input === "string") {
      const url = input.trim();
      if (!url) {
        throw new Error("Audio file URL must be a non-empty string");
      }
      return { url, cacheKey: request.cacheKey ?? url, ...(request.name ? { name: request.name } : {}) };
    }

    if (this.options.validateTypedAudioAssets !== false && input.kind === "aura-asset-ref" && input.type !== "audio") {
      throw new Error(`Typed asset "${input.id ?? input.url}" is not an audio asset`);
    }
    const url = input.url.trim();
    if (!url) {
      throw new Error(`Audio asset "${input.id ?? "unknown"}" is missing a URL`);
    }
    const cacheKey = request.cacheKey ?? input.id ?? url;
    return {
      url,
      cacheKey,
      name: request.name ?? input.id,
      asset: input
    };
  }

  has(input: AudioFileInput, request: Omit<AudioFileRequest, "input"> = {}): boolean {
    return this.cache.has(this.resolve(input, request).cacheKey);
  }

  getCached(input: AudioFileInput, request: Omit<AudioFileRequest, "input"> = {}): AudioClip | undefined {
    return this.cache.get(this.resolve(input, request).cacheKey);
  }

  async load(input: AudioFileInput, request: Omit<AudioFileRequest, "input"> = {}): Promise<AudioClip> {
    if (input instanceof AudioClip) {
      const resolved = this.resolve(input, request);
      this.cache.set(resolved.cacheKey, input);
      return input;
    }

    const resolved = this.resolve(input, request);
    const cached = this.cache.get(resolved.cacheKey);
    if (cached) return cached;

    const pending = this.inflight.get(resolved.cacheKey);
    if (pending) return pending;

    const promise = this.loadResolved(resolved, request.signal);
    this.inflight.set(resolved.cacheKey, promise);
    try {
      const clip = await promise;
      this.cache.set(resolved.cacheKey, clip);
      return clip;
    } finally {
      this.inflight.delete(resolved.cacheKey);
    }
  }

  async loadMany(inputs: readonly AudioFileInput[], request: Omit<AudioFileRequest, "input"> = {}): Promise<readonly AudioClip[]> {
    return Promise.all(inputs.map((input) => this.load(input, request)));
  }

  clear(input?: AudioFileInput): void {
    if (input === undefined) {
      this.cache.clear();
      this.inflight.clear();
      return;
    }
    const { cacheKey } = this.resolve(input);
    this.cache.delete(cacheKey);
    this.inflight.delete(cacheKey);
  }

  private async loadResolved(resolved: ResolvedAudioFileRequest, signal?: AbortSignal): Promise<AudioClip> {
    const fetchAudio = this.options.fetch ?? defaultFetchAudio;
    const response = await fetchAudio(resolved.url, { signal });
    if (!response.ok) {
      throw new Error(`Audio request failed with ${response.status}: ${resolved.url}`);
    }

    const encoded = await response.arrayBuffer();
    const decoded = await this.options.context.decodeAudioData(encoded.slice(0));
    return new AudioClip({
      name: resolved.name ?? resolved.cacheKey,
      buffer: decoded
    });
  }
}

export function validateEpisodeAudioAssets(
  assets: readonly AudioFileAssetLike[],
  requirements: readonly EpisodeAudioAssetRequirement[],
  options: { readonly requireLicense?: boolean } = {}
): EpisodeAudioAssetReadiness {
  const byId = new Map(assets.filter((asset) => asset.id).map((asset) => [asset.id!, asset]));
  const diagnostics: EpisodeAudioAssetDiagnostic[] = [];
  const missingAssetIds: string[] = [];
  let requiredCount = 0;
  let readyCount = 0;

  for (const requirement of requirements) {
    const required = requirement.required ?? true;
    if (required) requiredCount++;
    const asset = byId.get(requirement.id);
    if (!asset) {
      if (required) {
        missingAssetIds.push(requirement.id);
        diagnostics.push({
          severity: "error",
          code: "audio-asset-missing",
          assetId: requirement.id,
          message: `Required ${requirement.role ?? "audio"} asset "${requirement.id}" is missing.`
        });
      }
      continue;
    }
    if (asset.kind === "aura-asset-ref" && asset.type !== "audio") {
      diagnostics.push({
        severity: "error",
        code: "audio-asset-wrong-type",
        assetId: requirement.id,
        message: `Typed asset "${requirement.id}" is "${asset.type ?? "unknown"}", not audio.`
      });
      continue;
    }
    if (!asset.url.trim()) {
      diagnostics.push({
        severity: "error",
        code: "audio-asset-missing-url",
        assetId: requirement.id,
        message: `Audio asset "${requirement.id}" is missing a URL.`
      });
      continue;
    }
    if ((options.requireLicense || requirement.requireLicense) && !asset.license) {
      diagnostics.push({
        severity: "error",
        code: "audio-asset-missing-license",
        assetId: requirement.id,
        message: `Audio asset "${requirement.id}" is missing license metadata.`
      });
      continue;
    }
    readyCount++;
  }

  return {
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    requiredCount,
    readyCount,
    missingAssetIds,
    diagnostics
  };
}

async function defaultFetchAudio(url: string, init?: { readonly signal?: AbortSignal }): Promise<AudioFileFetchResponseLike> {
  if (typeof fetch !== "function") {
    throw new Error("AudioFileManager requires fetch or a custom fetch implementation");
  }
  return fetch(url, init);
}
