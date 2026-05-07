import type { AssetLoadRequest, AssetLoader } from "./AssetLoader";
import type { LoadContext } from "./LoadContext";

export interface AudioDecodeContext {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> | AudioBuffer;
}

export interface AudioAsset {
  readonly url: string;
  readonly buffer: AudioBuffer;
}

export class AudioLoader implements AssetLoader<AudioAsset> {
  readonly type = "audio";

  private readonly audioContext: AudioDecodeContext;

  constructor(audioContext: AudioDecodeContext) {
    this.audioContext = audioContext;
  }

  canLoad(request: AssetLoadRequest): boolean {
    return /\.(?:mp3|wav|ogg|m4a|aac)(?:\?.*)?$/i.test(request.url);
  }

  async load(request: AssetLoadRequest, context: LoadContext): Promise<AudioAsset> {
    context.throwIfAborted(request.url);

    if (typeof fetch !== "function") {
      throw new Error("AudioLoader requires fetch");
    }

    const response = await fetch(request.url, { signal: request.signal });
    if (!response.ok) {
      throw new Error(`Audio request failed with ${response.status}`);
    }

    const buffer = await this.audioContext.decodeAudioData(await response.arrayBuffer());
    return { url: request.url, buffer };
  }
}
