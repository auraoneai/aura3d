import type { TextureCompressedFormat, TextureMipLevelDescriptor } from "@aura3d/rendering";
import type { DecodedGLTFImage } from "./GLTFRenderResources";

export type KTX2BasisTargetFormat = "etc2-rgba8unorm" | "bc3-rgba-unorm" | "astc-4x4-rgba-unorm" | "rgba8";

export interface KTX2BasisTextureTranscoderOptions {
  readonly targetFormat?: KTX2BasisTargetFormat;
  readonly includeFallback?: boolean;
  readonly loaderOptions?: Record<string, unknown>;
}

interface LoadersGLTextureLevel {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  readonly compressed?: boolean;
  readonly textureFormat?: string;
}

type LoadersGLTextureResult = readonly (readonly LoadersGLTextureLevel[])[];

const DEFAULT_BROWSER_CDN = "https://unpkg.com/@loaders.gl";
let nodeFileHooksReady = false;

export async function transcodeKTX2BasisTexture(
  bytes: ArrayBuffer | ArrayBufferView,
  options: KTX2BasisTextureTranscoderOptions = {}
): Promise<DecodedGLTFImage> {
  const source = toArrayBuffer(bytes);
  const targetFormat = options.targetFormat ?? "etc2-rgba8unorm";
  const compressedLevels = await parseTextureLevels(source, targetFormat, options.loaderOptions);
  const baseLevel = compressedLevels[0];
  if (!baseLevel) {
    throw new Error("KTX2/Basis transcode produced no texture levels");
  }

  if (targetFormat === "rgba8") {
    return {
      width: baseLevel.width,
      height: baseLevel.height,
      colorSpace: "linear",
      format: "rgba8",
      data: baseLevel.data
    };
  }

  const fallbackLevels = options.includeFallback === false
    ? []
    : validRGBA8Levels(await parseTextureLevels(source, "rgba8", options.loaderOptions));
  const format = mapTargetFormat(targetFormat);

  return {
    width: baseLevel.width,
    height: baseLevel.height,
    colorSpace: "linear",
    format,
    mipLevels: compressedLevels,
    fallbackMipLevels: fallbackLevels
  };
}

function validRGBA8Levels(levels: readonly TextureMipLevelDescriptor[]): readonly TextureMipLevelDescriptor[] {
  const validLevels: TextureMipLevelDescriptor[] = [];
  for (const level of levels) {
    if (level.data.byteLength !== level.width * level.height * 4) break;
    validLevels.push(level);
  }
  return validLevels;
}

async function parseTextureLevels(
  source: ArrayBuffer,
  targetFormat: KTX2BasisTargetFormat,
  loaderOptions: Record<string, unknown> | undefined
): Promise<readonly TextureMipLevelDescriptor[]> {
  await installNodeLoadersGLFileHooks();
  const { parse, BasisLoader } = await loadLoadersGLModules();
  const parsed = await parse(source.slice(0), BasisLoader, {
    worker: true,
    CDN: defaultLoadersGLCdn(),
    modules: defaultLoadersGLModules(),
    ...loaderOptions,
    ...(loaderOptions?.modules && typeof loaderOptions.modules === "object"
      ? { modules: { ...defaultLoadersGLModules(), ...(loaderOptions.modules as Record<string, unknown>) } }
      : {}),
    basis: {
      ...basisOptions(loaderOptions),
      containerFormat: "ktx2",
      module: "encoder",
      format: loadersGLBasisFormat(targetFormat)
    }
  }) as LoadersGLTextureResult;
  const levels = parsed[0];
  if (!levels || levels.length === 0) {
    throw new Error("KTX2/Basis transcode returned no texture levels");
  }
  return levels.map((level) => ({
    width: level.width,
    height: level.height,
    data: new Uint8Array(level.data)
  }));
}

function defaultLoadersGLCdn(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/node_modules/@loaders.gl`;
  }
  return DEFAULT_BROWSER_CDN;
}

function defaultLoadersGLModules(): Record<string, string> | undefined {
  if (typeof window === "undefined" || !window.location?.origin) return undefined;
  const baseUrl = `${window.location.origin}/node_modules/@loaders.gl/textures/dist/libs`;
  return {
    "basis_encoder.js": `${baseUrl}/basis_encoder.js`,
    "basis_encoder.wasm": `${baseUrl}/basis_encoder.wasm`,
    "basis_transcoder.js": `${baseUrl}/basis_transcoder.js`,
    "basis_transcoder.wasm": `${baseUrl}/basis_transcoder.wasm`
  };
}

async function loadLoadersGLModules(): Promise<{ readonly parse: typeof import("@loaders.gl/core").parse; readonly BasisLoader: typeof import("@loaders.gl/textures").BasisLoader }> {
  try {
    const [core, textures] = await Promise.all([
      import("@loaders.gl/core"),
      import("@loaders.gl/textures")
    ]);
    return { parse: core.parse, BasisLoader: textures.BasisLoader };
  } catch (error) {
    throw new Error(`KTX2/Basis transcoder dependency resolution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function basisOptions(loaderOptions: Record<string, unknown> | undefined): Record<string, unknown> {
  const basis = loaderOptions?.basis;
  return basis && typeof basis === "object" ? basis as Record<string, unknown> : {};
}

function loadersGLBasisFormat(format: KTX2BasisTargetFormat): string {
  switch (format) {
    case "etc2-rgba8unorm":
      return "etc2";
    case "bc3-rgba-unorm":
      return "bc3";
    case "astc-4x4-rgba-unorm":
      return "astc-4x4";
    case "rgba8":
      return "rgba32";
  }
}

function mapTargetFormat(format: KTX2BasisTargetFormat): TextureCompressedFormat {
  switch (format) {
    case "etc2-rgba8unorm":
    case "bc3-rgba-unorm":
    case "astc-4x4-rgba-unorm":
      return format;
    case "rgba8":
      throw new Error("rgba8 is not a compressed texture target");
  }
}

function toArrayBuffer(bytes: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) return bytes.slice(0);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  return copy.buffer;
}

async function installNodeLoadersGLFileHooks(): Promise<void> {
  if (nodeFileHooksReady || typeof process === "undefined" || !process.versions?.node) return;
  const existing = (globalThis as typeof globalThis & {
    loaders?: {
      requireFromFile?: (path: string) => unknown;
      readFileAsArrayBuffer?: (path: string) => Promise<ArrayBuffer>;
    };
  }).loaders ?? {};
  if (existing.requireFromFile && existing.readFileAsArrayBuffer) {
    nodeFileHooksReady = true;
    return;
  }

  const [{ readFile }, { dirname, join }, { createRequire }, vm] = await Promise.all([
    importNodeModule<typeof import("node:fs/promises")>("node:fs/promises"),
    importNodeModule<typeof import("node:path")>("node:path"),
    importNodeModule<typeof import("node:module")>("node:module"),
    importNodeModule<typeof import("node:vm")>("node:vm")
  ]);
  const require = createRequire(import.meta.url);
  const texturesRoot = dirname(dirname(require.resolve("@loaders.gl/textures")));
  const moduleCache = new Map<string, unknown>();
  const resolveLibraryPath = (libraryPath: string): string => {
    if (libraryPath.startsWith("modules/textures/")) {
      return join(texturesRoot, libraryPath.slice("modules/textures/".length));
    }
    return libraryPath;
  };

  (globalThis as typeof globalThis & { loaders?: typeof existing }).loaders = {
    ...existing,
    async requireFromFile(libraryPath: string): Promise<unknown> {
      const resolved = resolveLibraryPath(libraryPath);
      if (moduleCache.has(resolved)) return moduleCache.get(resolved);
      const code = await readFile(resolved, "utf8");
      const module = { exports: {} as unknown };
      const wrapper = vm.runInNewContext(
        `(function(exports,module,require,__dirname,__filename){${code}\n})`,
        { Buffer, WebAssembly, clearTimeout, console, process, setTimeout, TextDecoder, TextEncoder }
      ) as (exports: unknown, module: { exports: unknown }, require: NodeJS.Require, dirname: string, filename: string) => void;
      wrapper(module.exports, module, require, dirname(resolved), resolved);
      moduleCache.set(resolved, module.exports);
      return module.exports;
    },
    async readFileAsArrayBuffer(libraryPath: string): Promise<ArrayBuffer> {
      const buffer = await readFile(resolveLibraryPath(libraryPath));
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
  };
  nodeFileHooksReady = true;
}

async function importNodeModule<T>(specifier: string): Promise<T> {
  return import(/* @vite-ignore */ specifier) as Promise<T>;
}
