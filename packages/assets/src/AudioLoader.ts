import { mergeAssetRequestOptions, type AssetLoadRequest, type AssetLoader } from "./AssetLoader";
import type { LoadContext } from "./LoadContext";
import { fetchBytes } from "./LoaderFetch";

export interface AudioDecodeContext {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> | AudioBuffer;
}

export interface AudioAsset {
  readonly url: string;
  /** The caller owns the decoded buffer after a successful load. */
  readonly buffer: AudioBuffer;
}

export class AudioLoader implements AssetLoader<AudioAsset> {
  readonly type = "audio";

  private readonly audioContext: AudioDecodeContext;

  constructor(audioContext: AudioDecodeContext) {
    this.audioContext = audioContext;
  }

  canLoad(request: AssetLoadRequest): boolean {
    const audioFormat = /^(?:mp3|wav|wave|ogg|m4a|aac|flac|opus)$/i;
    // A supplied format identifies extensionless/signed URLs and takes
    // precedence over anything that happens to look like a suffix in the URL.
    if (request.format !== undefined) return audioFormat.test(request.format);
    if (/^data:audio\//i.test(request.url)) return true;
    let path = request.url.split(/[?#]/, 1)[0] ?? "";
    const authority = /^(?:[a-z][a-z\d+.-]*:)?\/\/[^/]*/i.exec(path);
    if (authority) path = path.slice(authority[0].length);
    const extension = /\.([^.\/]+)$/.exec(path)?.[1];
    return extension !== undefined && audioFormat.test(extension);
  }

  async load(request: AssetLoadRequest, context: LoadContext): Promise<AudioAsset> {
    context.throwIfAborted(request.url);

    const url = context.resolve(request.url);
    const signal = context.signalFor(request.signal);
    const policy = mergeAssetRequestOptions(context.requestOptionsFor(url), request);
    const bytes = await fetchBytes(url, signal, request.onProgress
      ? ({ loaded, total }) => request.onProgress!({ url, phase: "buffer", loadedBytes: loaded, ...(total !== undefined ? { totalBytes: total } : {}) })
      : undefined, { ...policy, maxBytes: policy.maxBytes ?? 64 * 1024 * 1024 });
    throwIfAborted(signal);
    // decodeAudioData itself is not abortable. Reject promptly and drop any late
    // result instead of transferring ownership to a cancelled subscriber.
    const byteLength = bytes.byteLength;
    const decoding = Promise.resolve(this.audioContext.decodeAudioData(bytes));
    const buffer = await abortableDecode(decoding, signal);
    throwIfAborted(signal);
    request.onProgress?.({ url, phase: "complete", loadedBytes: byteLength, totalBytes: byteLength });
    return { url, buffer };
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Audio load aborted", "AbortError");
}

function abortableDecode<T>(decoding: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return decoding;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("Audio load aborted", "AbortError"));
    if (signal.aborted) { decoding.catch(() => {}); abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    decoding.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
