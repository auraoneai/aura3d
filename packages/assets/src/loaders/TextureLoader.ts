import { createV5FileLoaderDiagnostic } from "./LoaderDiagnostics";

export type V5BrowserTextureFormat = "png" | "jpg" | "jpeg" | "webp";

export class TextureLoaderV5 {
  readonly supportedFormats: readonly V5BrowserTextureFormat[] = ["png", "jpg", "jpeg", "webp"];

  load(uri: string) {
    const extension = uri.split(".").pop()?.toLowerCase() ?? "";
    return createV5FileLoaderDiagnostic("TextureLoaderV5", uri, {
      warnings: this.supportedFormats.includes(extension as V5BrowserTextureFormat) ? [] : [`Texture format ${extension || "unknown"} requires browser support check.`]
    });
  }
}
