import type { RenderDevice, RenderTarget } from "@aura3d/rendering";
import type { AuraExportResult } from "./ExportContext";
import { EXRExportError, exportEXR, type AuraEXRExportOptions } from "./EXRExporter";

export interface AuraRenderTargetEXROptions {
  /** Color attachment index. Required even for a single-output target. */
  readonly attachment: number;
  /** Optional EXR channel-layer name; the default is the unprefixed root layer. */
  readonly layer?: string;
  /** EXR channel sample type. Float preserves the readback; half can round it. */
  readonly type?: "float" | "half";
  readonly compression?: AuraEXRExportOptions["compression"];
  readonly pizEncoder?: AuraEXRExportOptions["pizEncoder"];
  /**
   * Per-export working-byte budget, default 256 MiB. It includes the RGBA
   * readback, planar channels, conservative 256-byte-aligned device staging,
   * and the EXR writer's working estimate. Driver and caller-supplied codec
   * allocations are outside this budget.
   */
  readonly maxBytes?: number;
  readonly signal?: AbortSignal;
}

const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function cancelled(): EXRExportError {
  return new EXRExportError("EXPORT_CANCELLED", "EXR export was cancelled");
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancelled();
}

/** Abort can settle the bridge immediately; the device retains its own pending work. */
function waitForReadback(readback: Promise<Float32Array>, signal?: AbortSignal): Promise<Float32Array> {
  if (!signal) return readback;
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener("abort", abort);
      reject(cancelled());
    };
    signal.addEventListener("abort", abort, { once: true });
    // Keep both handlers attached after cancellation: the device remains
    // responsible for retiring a submitted readback when it eventually settles.
    readback.then(
      (pixels) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) reject(cancelled());
        else resolve(pixels);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) reject(cancelled());
        else reject(error);
      }
    );
    if (signal.aborted) abort();
  });
}

/**
 * Read one concrete Aura3D float render-target attachment and encode RGBA as
 * scanline EXR. Pass a `layerTargets[i]` view for a cube/array layer; backend
 * ownership, resolve support, and further subresource restrictions remain the
 * device's responsibility. In particular, WebGPU currently supports only 2D
 * level-zero float readback.
 *
 * Readback rows are bottom-up; EXR scanlines are written top-down. Values,
 * including alpha, negatives and values above one, are not color-converted or
 * clamped. Half output can round and is reported by the EXR writer. Cancellation
 * discards the result without disposing the target or undoing submitted work.
 * Conversion and encoding are synchronous once readback finishes, so an
 * abort scheduled on the same event loop cannot preempt that CPU phase.
 */
export async function exportRenderTargetEXR(
  device: RenderDevice,
  target: RenderTarget,
  options: AuraRenderTargetEXROptions
): Promise<AuraExportResult> {
  const signal = options?.signal;
  checkAbort(signal);

  const attachment = options?.attachment;
  if (typeof attachment !== "number" || !Number.isSafeInteger(attachment) || attachment < 0) {
    throw new EXRExportError("EXR_ATTACHMENT_SELECTION", "Select a non-negative color attachment index", "attachment");
  }
  if (!target || target.disposed || target.depthOnly) {
    throw new EXRExportError("EXR_INVALID_TARGET", "A live render target with a color attachment is required", "target");
  }
  const textures = target.colorTextures ?? [target.colorTexture];
  const attachmentCount = textures.length;
  const texture = textures[attachment];
  if (!texture || texture.disposed) {
    throw new EXRExportError("EXR_ATTACHMENT_SELECTION", `Color attachment ${attachment} is not live or does not exist`, "attachment");
  }
  if (texture.format !== "rgba16f" && texture.format !== "rgba32f") {
    throw new EXRExportError("EXR_UNSUPPORTED_TARGET_FORMAT", "EXR readback requires an rgba16f or rgba32f color attachment", "attachment");
  }
  const sourceMip = target.attachmentMipLevel ?? 0;
  const sourceLayer = target.attachmentLayer ?? 0;
  const sampleCount = target.sampleCount ?? 1;
  const layerCount = texture.dimension === "cube" ? 6 : texture.dimension === "2d-array" ? texture.layers : 1;
  if (target.layerTargets?.length || (layerCount > 1 && target.attachmentLayer === undefined)) {
    throw new EXRExportError("EXR_SUBRESOURCE_SELECTION", "Select a concrete render-target layer view", "target");
  }
  const { width, height } = target;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width > 0x7fffffff || height > 0x7fffffff) {
    throw new EXRExportError("EXR_INVALID_DIMENSIONS", "EXR dimensions must be positive signed 32-bit integers", "target");
  }
  if ((texture.dimension !== "2d" && texture.dimension !== "cube" && texture.dimension !== "2d-array") ||
      !Number.isSafeInteger(sourceMip) || sourceMip < 0 || sourceMip >= texture.mipLevelCount ||
      !Number.isSafeInteger(sourceLayer) || sourceLayer < 0 || sourceLayer >= layerCount ||
      !Number.isSafeInteger(sampleCount) || sampleCount < 1 || !texture.usage.includes("render-attachment") ||
      width !== Math.max(1, Math.floor(texture.width / 2 ** sourceMip)) ||
      height !== Math.max(1, Math.floor(texture.height / 2 ** sourceMip))) {
    throw new EXRExportError("EXR_INVALID_SUBRESOURCE", "The selected color attachment has an invalid mip, layer, size, or usage", "target");
  }

  const layer = options.layer ?? "";
  if (typeof layer !== "string" || layer.length > 29 || layer.includes("\0")) {
    throw new EXRExportError("EXR_INVALID_NAME", "The EXR layer must leave room for a dot and channel name within 31 UTF-8 bytes", "layer");
  }
  const layerBytes = textEncoder.encode(layer);
  if (layerBytes.length > 29 || textDecoder.decode(layerBytes) !== layer) {
    throw new EXRExportError("EXR_INVALID_NAME", "The EXR layer must be well-formed UTF-8 and leave room for a channel name", "layer");
  }
  const type = options.type ?? "float";
  if (type !== "float" && type !== "half") {
    throw new EXRExportError("EXR_CHANNEL_TYPE", "EXR output type must be float or half", "type");
  }
  const compression = options.compression ?? "none";
  if (compression !== "none" && compression !== "rle" && compression !== "piz") {
    throw new EXRExportError("EXR_UNSUPPORTED_COMPRESSION", "EXR compression must be none, rle, or piz", "compression");
  }
  const pizEncoder = options.pizEncoder;
  if (compression === "piz" && pizEncoder && (pizEncoder.supported !== true || typeof pizEncoder.encodeBlock !== "function")) {
    throw new EXRExportError("EXR_PIZ_ENCODER_UNAVAILABLE", "The supplied PIZ encoder reports no support", "pizEncoder");
  }
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new EXRExportError("EXR_INVALID_LIMIT", "maxBytes must be a positive safe integer", "maxBytes");
  }
  const pixelCount = width * height;
  const samples = pixelCount * 4;
  const readbackBytes = samples * 4;
  const stagingBytes = Math.ceil(width * (texture.format === "rgba16f" ? 8 : 16) / 256) * 256 * height;
  const planarBytes = readbackBytes;
  const rawBytes = pixelCount * (type === "half" ? 8 : 16);
  // This matches the CPU writer's admission check, in addition to the bridge's
  // own arrays and the largest built-in device staging allocation.
  const encoderMinimum = rawBytes * 4 + height * 16 + (compression === "piz" ? 2 * 1024 * 1024 : 65536);
  const usedBytes = readbackBytes + stagingBytes + planarBytes;
  if (![pixelCount, samples, readbackBytes, stagingBytes, planarBytes, rawBytes, encoderMinimum, usedBytes].every(Number.isSafeInteger) ||
      maxBytes - usedBytes < encoderMinimum) {
    throw new EXRExportError("EXR_MEMORY_LIMIT", "Render-target readback and EXR encoding exceed maxBytes", "maxBytes");
  }
  const read = device?.readFloatRenderTarget;
  if (typeof read !== "function") {
    throw new EXRExportError("EXR_READBACK_UNAVAILABLE", "This device does not support float render-target readback", "device");
  }

  let pixels: Float32Array;
  try {
    pixels = await waitForReadback(Promise.resolve(read.call(device, { target, attachment, signal })), signal);
  } catch (error) {
    checkAbort(signal);
    throw error;
  }
  checkAbort(signal);
  const currentTextures = target.colorTextures ?? [target.colorTexture];
  if (target.disposed || texture.disposed || target.layerTargets?.length ||
      currentTextures.length !== attachmentCount || currentTextures[attachment] !== texture ||
      target.width !== width || target.height !== height ||
      (target.attachmentMipLevel ?? 0) !== sourceMip || (target.attachmentLayer ?? 0) !== sourceLayer ||
      (target.sampleCount ?? 1) !== sampleCount) {
    throw new EXRExportError("EXR_READBACK_SOURCE_CHANGED", "The render-target attachment changed or was disposed during readback", "target");
  }
  if (!(pixels instanceof Float32Array) || pixels.length !== samples) {
    throw new EXRExportError("EXR_INVALID_READBACK", "Float readback must contain tightly packed RGBA pixels", "device");
  }
  // A conforming reader may return a view into a larger caller-owned buffer.
  const actualUsedBytes = pixels.buffer.byteLength + stagingBytes + planarBytes;
  const encoderBudget = maxBytes - actualUsedBytes;
  if (!Number.isSafeInteger(actualUsedBytes) || encoderBudget < encoderMinimum) {
    throw new EXRExportError("EXR_MEMORY_LIMIT", "The returned readback buffer exceeds maxBytes", "maxBytes");
  }

  const red = new Float32Array(pixelCount);
  const green = new Float32Array(pixelCount);
  const blue = new Float32Array(pixelCount);
  const alpha = new Float32Array(pixelCount);
  for (let y = 0; y < height; y += 1) {
    checkAbort(signal);
    let source = (height - 1 - y) * width * 4;
    let destination = y * width;
    for (let x = 0; x < width; x += 1, source += 4, destination += 1) {
      if ((x & 16383) === 0) checkAbort(signal);
      red[destination] = pixels[source]!;
      green[destination] = pixels[source + 1]!;
      blue[destination] = pixels[source + 2]!;
      alpha[destination] = pixels[source + 3]!;
    }
  }
  checkAbort(signal);
  const result = exportEXR({
    attachments: [{ name: "color", width, height, layers: [{ name: layer, channels: [
      { name: "R", type, data: red },
      { name: "G", type, data: green },
      { name: "B", type, data: blue },
      { name: "A", type, data: alpha }
    ] }] }]
  }, { attachment: "color", layer, compression, pizEncoder, maxBytes: encoderBudget, signal });
  checkAbort(signal);
  return attachmentCount > 1 ? {
    ...result,
    warnings: [...result.warnings, {
      code: "EXR_ATTACHMENT_OMITTED",
      path: "target.colorTextures",
      message: `${attachmentCount - 1} unselected color attachment(s) were not represented in the EXR.`
    }]
  } : result;
}
