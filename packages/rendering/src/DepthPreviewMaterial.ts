import { depthPreviewShader } from "./DepthPreviewShader";
import { PortableShaderMaterial, type PortableShaderSources } from "./PortableShaderMaterial";
import type { RecursiveUniformValue } from "./RenderDevice";
import { globalShaderSource, registerGlobalShaderSource, ShaderLibrary, unregisterGlobalShaderSource } from "./ShaderLibraryCore";

export interface DepthPreviewMaterialOptions {
  /** Preview mapping in view-space units, not the active camera's clip plane. */
  readonly near?: number;
  readonly far?: number;
  readonly side?: "front" | "back" | "double";
}

export interface ResolvedDepthPreviewMaterialOptions {
  readonly near: number;
  readonly far: number;
  readonly side: "front" | "back" | "double";
}

// A subnormal denominator may be flushed to zero by a shader implementation.
const MIN_NORMAL_FLOAT32 = 1.1754943508222875e-38;

/** Validate both authored numbers and the actual float32 shader denominator. */
export function resolveDepthPreviewMaterialOptions(options: DepthPreviewMaterialOptions = {}): ResolvedDepthPreviewMaterialOptions {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("material.depth: options must be an object");
  }
  for (const key of Object.keys(options)) {
    if (key !== "near" && key !== "far" && key !== "side") {
      throw new TypeError(`material.depth: unsupported option '${key}'`);
    }
  }
  const near = options.near === undefined ? 0.1 : options.near;
  const far = options.far === undefined ? 100 : options.far;
  const near32 = Math.fround(near);
  const far32 = Math.fround(far);
  const span = Math.fround(far32 - near32);
  if (!Number.isFinite(near) || near < 0 || !Number.isFinite(far) ||
      !Number.isFinite(near32) || !Number.isFinite(far32) || !Number.isFinite(span) ||
      (near > 0 && near32 < MIN_NORMAL_FLOAT32) ||
      far32 <= near32 || span < MIN_NORMAL_FLOAT32) {
    throw new RangeError("material.depth: near and far must be finite and non-negative, with far greater than near and normal float32 near/span values");
  }
  const side = options.side === undefined ? "front" : options.side;
  if (side !== "front" && side !== "back" && side !== "double") {
    throw new RangeError("material.depth: side must be front, back, or double");
  }
  return { near, far, side };
}

/** CPU reference for the shader's near-white, far-black linear mapping. */
export function depthPreviewValue(viewDepth: number, options: DepthPreviewMaterialOptions = {}): number {
  if (!Number.isFinite(viewDepth)) throw new RangeError("material.depth: view depth must be finite");
  const { near, far } = resolveDepthPreviewMaterialOptions(options);
  const near32 = Math.fround(near);
  const span = Math.fround(Math.fround(far) - near32);
  return 1 - Math.min(1, Math.max(0, (viewDepth - near32) / span));
}

let nextShaderId = 0;
let shaderName: string | undefined;
let sourceUsers = 0;

function acquireShaderName(): string {
  if (sourceUsers > 0) return shaderName!;
  // A previously released name can reuse the renderer's cached program,
  // provided no unrelated portable material has registered it meanwhile.
  if (shaderName && !globalShaderSource(`aura3d/portable/${shaderName}`)) return shaderName;
  do {
    shaderName = `native-depth-preview-${++nextShaderId}`;
  } while (globalShaderSource(`aura3d/portable/${shaderName}`));
  return shaderName;
}

/**
 * Aura3D's own opaque, unlit depth-preview material. Immutable, validated
 * range uniforms let instances share the same owned renderer program.
 * WebGL2 and WebGPU use the same view-distance mapping; ForwardPass rejects
 * unsupported clipping, deformation and depth conventions rather than dropping them.
 */
export class DepthPreviewMaterial extends PortableShaderMaterial {
  private readonly previewNear: number;
  private readonly previewSpan: number;
  // PortableShaderMaterial sets its initial parameters during super(); class
  // fields have not been initialized at that point.
  private readonly sealed = true;

  constructor(options: DepthPreviewMaterialOptions = {}) {
    const resolved = resolveDepthPreviewMaterialOptions(options);
    const near = Math.fround(resolved.near);
    const span = Math.fround(Math.fround(resolved.far) - near);
    const name = acquireShaderName();
    super({
      name,
      shaderLibrary: new ShaderLibrary(),
      sources: depthPreviewShader(),
      uniforms: [
        { name: "u_depthPreviewNear", kind: "float", value: near },
        { name: "u_depthPreviewSpan", kind: "float", value: span }
      ],
      requiredAttributes: ["a_position"],
      renderState: {
        blend: false,
        depthTest: true,
        depthWrite: true,
        cullMode: resolved.side === "double" ? "none" : resolved.side === "back" ? "front" : "back"
      }
    });
    this.previewNear = near;
    this.previewSpan = span;
    try {
      registerGlobalShaderSource(this.sourcePair(this.sources));
      sourceUsers += 1;
    } catch (error) {
      super.dispose();
      throw error;
    }
  }

  override setParameter(name: string, value: RecursiveUniformValue): void {
    if (this.sealed) throw new Error("DEPTH_PREVIEW_RANGE_IMMUTABLE: replace the material to change its preview range");
    super.setParameter(name, value);
  }

  override uniformValueDiagnostic(name: string, value: RecursiveUniformValue): string | null {
    const diagnostic = super.uniformValueDiagnostic(name, value);
    if (diagnostic) return diagnostic;
    const expected = name === "u_depthPreviewNear" ? this.previewNear
      : name === "u_depthPreviewSpan" ? this.previewSpan : undefined;
    if (expected !== undefined && (typeof value !== "number" || Math.fround(value) !== expected)) {
      return `DEPTH_PREVIEW_RANGE_IMMUTABLE: ${name} cannot be overridden`;
    }
    return null;
  }

  override hotReload(_sources: PortableShaderSources): void {
    throw new Error("DEPTH_PREVIEW_SHADER_IMMUTABLE: replace the material to change its preview range");
  }

  override dispose(): void {
    if (this.disposed) return;
    super.dispose();
    sourceUsers -= 1;
    if (sourceUsers === 0) unregisterGlobalShaderSource(this.shaderKey);
  }
}
