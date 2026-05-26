import { createThreeCompatFileLoaderDiagnostic } from "./LoaderDiagnostics";

export type ThreeCompatBrowserTextureFormat = "png" | "jpg" | "jpeg" | "webp";

export class TextureLoaderThreeCompat {
  readonly supportedFormats: readonly ThreeCompatBrowserTextureFormat[] = ["png", "jpg", "jpeg", "webp"];

  load(uri: string) {
    const extension = uri.split(".").pop()?.toLowerCase() ?? "";
    return createThreeCompatFileLoaderDiagnostic("TextureLoaderThreeCompat", uri, {
      warnings: this.supportedFormats.includes(extension as ThreeCompatBrowserTextureFormat) ? [] : [`Texture format ${extension || "unknown"} requires browser support check.`]
    });
  }
}
