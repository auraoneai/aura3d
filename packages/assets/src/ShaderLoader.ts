import { mergeAssetRequestOptions, type AssetLoadRequest, type AssetLoader } from "./AssetLoader";
import type { LoadContext } from "./LoadContext";
import { fetchBytes } from "./LoaderFetch";

export interface ShaderSourceAsset {
  readonly url: string;
  readonly source: string;
}

export class ShaderLoader implements AssetLoader<ShaderSourceAsset> {
  readonly type = "shader";

  canLoad(request: AssetLoadRequest): boolean {
    return /\.(?:wgsl|glsl|vert|frag)(?:[?#].*)?$/i.test(request.url);
  }

  async load(request: AssetLoadRequest, context: LoadContext): Promise<ShaderSourceAsset> {
    context.throwIfAborted(request.url);

    const signal = context.signalFor?.(request.signal) ?? request.signal;
    const options = mergeAssetRequestOptions(context.requestOptionsFor?.(request.url), request);
    const bytes = await fetchBytes(request.url, signal, request.onProgress ? (progress) => request.onProgress?.({
      url: request.url, phase: "document", loadedBytes: progress.loaded,
      ...(progress.total === undefined ? {} : { totalBytes: progress.total })
    }) : undefined, options);
    context.throwIfAborted(request.url);
    return { url: request.url, source: new TextDecoder().decode(bytes) };
  }
}
