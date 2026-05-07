import type { AssetLoadRequest, AssetLoader } from "./AssetLoader";
import type { LoadContext } from "./LoadContext";

export interface ShaderSourceAsset {
  readonly url: string;
  readonly source: string;
}

export class ShaderLoader implements AssetLoader<ShaderSourceAsset> {
  readonly type = "shader";

  canLoad(request: AssetLoadRequest): boolean {
    return /\.(?:wgsl|glsl|vert|frag)(?:\?.*)?$/i.test(request.url);
  }

  async load(request: AssetLoadRequest, context: LoadContext): Promise<ShaderSourceAsset> {
    context.throwIfAborted(request.url);

    if (typeof fetch !== "function") {
      throw new Error("ShaderLoader requires fetch");
    }

    const response = await fetch(request.url, { signal: request.signal });
    if (!response.ok) {
      throw new Error(`Shader request failed with ${response.status}`);
    }

    return { url: request.url, source: await response.text() };
  }
}
