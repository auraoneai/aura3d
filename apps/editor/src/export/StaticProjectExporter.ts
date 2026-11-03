import { createStaticExportHtml, createStaticExportRuntime } from "@aura3d/editor-runtime";
import type { EditorAssetRecord, EditorProject } from "../project/ProjectSerializer";
import { ProjectSerializer } from "../project/ProjectSerializer";

export interface StaticExportFile {
  readonly path: string;
  readonly content: string;
  readonly type: "html" | "json" | "javascript";
}

export interface StaticExportResult {
  readonly files: readonly StaticExportFile[];
  readonly entry: string;
}

export interface ExportRuntimeBundle {
  readonly script: string;
  readonly fontDataUri: string;
}

export class StaticProjectExporter {
  private readonly serializer = new ProjectSerializer();

  constructor(
    private readonly loadRuntime: () => Promise<ExportRuntimeBundle> = async () => { throw new Error("The standalone export runtime bundle is unavailable."); },
    private readonly fetchAsset: typeof fetch = (...args) => fetch(...args),
    private readonly baseUrl: () => string = () => document.baseURI
  ) {}

  async export(project: EditorProject, signal?: AbortSignal): Promise<StaticExportResult> {
    this.serializer.validate(project);
    const baseUrl = this.baseUrl();
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abort, { once: true });
    let rejectCancellation: (() => void) | undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      rejectCancellation = () => reject(new Error("Export was cancelled."));
      controller.signal.addEventListener("abort", rejectCancellation, { once: true });
    });
    let runtime: ExportRuntimeBundle;
    let assets: EditorAssetRecord[];
    try {
      if (controller.signal.aborted) throw new Error("Export was cancelled.");
      [runtime, assets] = await Promise.race([
        Promise.all([
          this.loadRuntime(),
          Promise.all(project.assets.map((asset) => snapshotAsset(asset, baseUrl, this.fetchAsset, controller.signal)))
        ]),
        cancelled
      ]);
      if (controller.signal.aborted) throw new Error("Export was cancelled.");
    } catch (error) {
      controller.abort();
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
      if (rejectCancellation) controller.signal.removeEventListener("abort", rejectCancellation);
    }
    if (!runtime.script.trim() || !runtime.fontDataUri.startsWith("data:font/woff2;base64,")) {
      throw new Error("The standalone export bundle or licensed font is unavailable.");
    }
    const exportedProject: EditorProject = {
      ...project,
      assets,
      metadata: {
        ...project.metadata,
        provenance: this.serializer.createEditorProvenance([
          ...(project.metadata.provenance?.operations ?? []),
          { id: "static-export", runtimeApi: "StaticProjectExporter.export", target: "index.html" },
          { id: "static-export-runtime", runtimeApi: "createStaticExportRuntime", target: "runtime.js" }
        ])
      }
    };
    return {
      entry: "index.html",
      files: [
        { path: "index.html", type: "html", content: createStaticExportHtml({ title: project.export.title, fontDataUri: runtime.fontDataUri }) },
        { path: "project.json", type: "json", content: this.serializer.serialize(exportedProject) },
        { path: "runtime.js", type: "javascript", content: `${runtime.script}\n${createStaticExportRuntime()}` }
      ]
    };
  }
}

/** Snapshot source bytes, including glTF external buffers/images, into project data URIs. */
async function snapshotAsset(asset: EditorAssetRecord, baseUrl: string, fetchAsset: typeof fetch, signal: AbortSignal): Promise<EditorAssetRecord> {
  try {
    const source = resolveAssetUrl(asset.uri, baseUrl);
    const response = await fetchAsset(source, { signal });
    if (!response.ok) throw new Error(`asset request failed (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const resolvedSource = response.url || source;
    let data: Uint8Array = bytes;
    let mime = response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
    if (asset.type === "texture") mime = imageMimeType(bytes, mime);
    if (asset.type === "gltf") {
      const glb = isGlb(bytes);
      if (glb) {
        data = await snapshotGlb(bytes, resolvedSource, fetchAsset, signal);
        mime = "model/gltf-binary";
      } else {
        const document = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
        await snapshotGltfResources(document, resolvedSource, fetchAsset, signal);
        data = new TextEncoder().encode(JSON.stringify(document));
        mime = "model/gltf+json";
      }
    }
    return { ...asset, uri: dataUri(data, mime), cacheKey: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : "asset could not be read";
    throw new Error(`Cannot export ${asset.name}: ${redactExportError(message)}`);
  }
}

async function snapshotGltfResources(document: unknown, source: string, fetchAsset: typeof fetch, signal: AbortSignal): Promise<void> {
  if (!isRecord(document)) throw new Error("invalid glTF JSON");
  for (const name of ["buffers", "images"] as const) {
    const entries = document[name];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) throw new Error(`glTF ${name} must be an array`);
    await Promise.all(entries.map(async (entry) => {
      if (!isRecord(entry) || entry.uri === undefined) return;
      if (typeof entry.uri !== "string") throw new Error(`glTF ${name} URI must be a string`);
      if (entry.uri.startsWith("data:")) return;
      const response = await fetchAsset(resolveAssetUrl(entry.uri, source), { signal });
      if (!response.ok) throw new Error(`glTF ${name} request failed (${response.status})`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const declared = typeof entry.mimeType === "string" ? entry.mimeType : response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
      entry.uri = dataUri(bytes, name === "images" ? imageMimeType(bytes, declared) : declared);
    }));
  }
}

async function snapshotGlb(bytes: Uint8Array, source: string, fetchAsset: typeof fetch, signal: AbortSignal): Promise<Uint8Array> {
  if (bytes.length < 20) throw new Error("invalid GLB header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) throw new Error("invalid GLB version or length");
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonLength % 4 || 20 + jsonLength > bytes.length) throw new Error("invalid GLB JSON chunk");
  const document = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).replace(/[\u0000\s]+$/, "")) as unknown;
  await snapshotGltfResources(document, source, fetchAsset, signal);
  const json = new TextEncoder().encode(JSON.stringify(document));
  const padded = Math.ceil(json.length / 4) * 4;
  const tail = bytes.subarray(20 + jsonLength);
  const result = new Uint8Array(20 + padded + tail.length);
  result.set(bytes.subarray(0, 20));
  result.fill(0x20, 20, 20 + padded);
  result.set(json, 20);
  result.set(tail, 20 + padded);
  const output = new DataView(result.buffer);
  output.setUint32(8, result.length, true);
  output.setUint32(12, padded, true);
  return result;
}

function isGlb(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46;
}

function imageMimeType(bytes: Uint8Array, declared: string): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  if (bytes.length >= 12 && bytes[0] === 0xab && bytes[1] === 0x4b && bytes[2] === 0x54 && bytes[3] === 0x58 && bytes[4] === 0x20 && bytes[5] === 0x32) return "image/ktx2";
  return declared;
}

function resolveAssetUrl(uri: string, base: string): string {
  const url = new URL(uri, base);
  if (!["http:", "https:", "blob:", "data:"].includes(url.protocol)) throw new Error("unsupported asset URL scheme");
  return url.href;
}

function dataUri(bytes: Uint8Array, mime: string): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return `data:${mime};base64,${btoa(binary)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactExportError(value: string): string {
  return value.replace(/\b(?:https?|wss?):\/\/[^\s)\]"']+/gi, "[url]").replace(/data:[^\s)\]"']+/gi, "[data]");
}
