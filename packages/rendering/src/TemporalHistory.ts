import { identityMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { ForwardPass, type RenderItem } from "./ForwardPass";
import { Material } from "./Material";
import { MaterialInstance } from "./MaterialInstance";
import { RenderDeviceError, type RenderDevice, type RenderTarget } from "./RenderDevice";
import { ShaderLibrary } from "./ShaderLibraryCore";

export interface TemporalFrameOptions {
  readonly sceneKey?: string;
  readonly reset?: boolean;
  readonly jitter?: boolean;
}

/** GPU-only bindings. RG velocity is current UV minus previous UV; BA are current/previous depth. */
export interface TemporalGpuBindings {
  readonly velocity: RenderTarget;
  readonly history: RenderTarget;
  readonly historyOutput: RenderTarget;
  readonly historyValid: boolean;
  readonly historyFrames?: number;
}

/** Renderer-lifetime owner; histories only advance after successful presentation. */
export class TemporalHistory {
  private targets: [RenderTarget, RenderTarget, RenderTarget] | undefined;
  private previous = new Map<string, Float32Array>();
  private pending = new Map<string, Float32Array>();
  private valid = false;
  private sceneKey: string | undefined;
  private frame = 0;
  private jitterEnabled = false;
  private readonly library = new ShaderLibrary();
  private pass: ForwardPass | undefined;
  renderItems: readonly RenderItem[] = [];
  private materials: Material[] = [];
  constructor() { this.library.register(velocityShader); }

  reset(): void { this.valid = false; this.previous.clear(); this.pending.clear(); this.frame = 0; }
  dispose(): void {
    this.pass = undefined;
    for (const material of this.materials) material.dispose();
    this.materials = [];
    for (const target of this.targets ?? []) target.dispose();
    this.targets = undefined;
    this.reset();
  }

  /** Aperiodic pixel quadrature; deliberately zero for the seed frame. */
  jitter(width: number, height: number): readonly [number, number] {
    // Base-2 Halton's even/odd samples occupy opposite half-pixels. A
    // short repeated sequence therefore aliases two-frame authored motion.
    // Incommensurate irrational increments distribute both parity subsequences over the
    // whole pixel instead of locking coverage to an object's motion phase.
    return this.valid ? [(((.5 + this.frame * ((Math.sqrt(5) - 1) / 2)) % 1) - .5) * 2 / width, (((.5 + this.frame * (Math.sqrt(2) - 1)) % 1) - .5) * 2 / height] : [0, 0];
  }

  prepare(device: RenderDevice, width: number, height: number, items: readonly RenderItem[], viewProjection: Float32Array | readonly number[] | undefined, options: TemporalFrameOptions): TemporalGpuBindings {
    if (Boolean(options.jitter) !== this.jitterEnabled) { this.reset(); this.jitterEnabled = Boolean(options.jitter); }
    if (options.reset || options.sceneKey !== this.sceneKey) { this.reset(); this.sceneKey = options.sceneKey; }
    if (!this.targets || this.targets.some(target => target.disposed || target.width !== width || target.height !== height)) {
      this.dispose();
      const made: RenderTarget[] = [];
      try {
        for (const label of ["velocity", "history-a", "history-b"]) made.push(device.createRenderTarget({ width, height, format: "rgba16f", depth: label === "velocity", sampleCount: 1, label: `renderer-temporal-${label}` }));
        this.targets = made as [RenderTarget, RenderTarget, RenderTarget];
      } catch (error) { for (const target of made) target.dispose(); throw error; }
    }
    for (const material of this.materials) material.dispose();
    this.materials = [];
    this.pending.clear();
    const velocityItems = items.map(item => {
      const base = item.material instanceof MaterialInstance ? item.material.baseMaterial : item.material;
      if (!item.label || this.pending.has(item.label) || item.skinning || item.morphTargets?.length || item.instanceTransforms?.length || item.geometry.topology !== "triangles" || base?.renderState.blend) {
        throw new RenderDeviceError("Temporal rendering requires stable unique labels and opaque rigid noninstanced geometry; skinning, morphing and transparency require separate velocity support.", "TEMPORAL_UNSUPPORTED_GEOMETRY", { label: item.label });
      }
      const current = new Float32Array(item.modelViewProjectionMatrix ?? multiplyMat4(Array.from(viewProjection ?? identityMat4()) as Mat4, Array.from(item.modelMatrix ?? identityMat4()) as Mat4));
      if (current.length !== 16 || !current.every(Number.isFinite)) throw new RenderDeviceError("Temporal transform must be finite mat4", "TEMPORAL_INVALID_MATRIX");
      // Jitter changes coverage, not physical motion. Reprojecting history by
      // sampling offsets makes the accumulated image follow the sampling pattern.
      const unjittered = new Float32Array(current);
      if (options.jitter) { const [x, y] = this.jitter(width, height); for (let col = 0; col < 4; col++) { current[col*4]! += x * current[col*4+3]!; current[col*4+1]! += y * current[col*4+3]!; } }
      const previous = this.valid ? this.previous.get(item.label) ?? unjittered : unjittered;
      this.pending.set(item.label, unjittered);
      const material = new Material({ shaderKey: velocityShader.name, requiredAttributes: ["a_position"], parameters: { u_modelViewProjection: current, u_previousViewProjection: previous, u_unjitteredViewProjection: unjittered }, uniformSchema: [{ name: "u_modelViewProjection", kind: "mat4" }, { name: "u_previousViewProjection", kind: "mat4" }, { name: "u_unjitteredViewProjection", kind: "mat4" }], renderState: { cullMode: base?.renderState.cullMode ?? "back" } });
      this.materials.push(material);
      return { ...item, material, modelViewProjectionMatrix: current };
    });
    this.renderItems = items.map((item, index) => ({ ...item, modelViewProjectionMatrix: velocityItems[index]!.modelViewProjectionMatrix }));
    device.setRenderTarget(this.targets[0]);
    device.clear([0, 0, 1, 1]);
    this.pass = new ForwardPass({ items: velocityItems, shaderLibrary: this.library });
    this.pass.execute({ device, width, height });
    return { velocity: this.targets[0], history: this.targets[1], historyOutput: this.targets[2], historyValid: this.valid, historyFrames: this.valid ? this.frame : 0 };
  }

  commit(): void {
    if (!this.targets) return;
    [this.targets[1], this.targets[2]] = [this.targets[2], this.targets[1]];
    this.previous = new Map(this.pending); this.valid = true; this.frame++;
  }
}



const velocityShader = {
  name: "renderer-temporal-velocity", marker: "AURA_TEMPORAL_VELOCITY",
  vertex: `#version 300 es
// AURA_TEMPORAL_VELOCITY
precision highp float;
in vec3 a_position;
uniform mat4 u_modelViewProjection;
uniform mat4 u_previousViewProjection;
uniform mat4 u_unjitteredViewProjection;
out vec4 v_current;
out vec4 v_previous;
void main(){ v_current=u_unjitteredViewProjection*vec4(a_position,1.0); v_previous=u_previousViewProjection*vec4(a_position,1.0); gl_Position=u_modelViewProjection*vec4(a_position,1.0); }`,
  fragment: `#version 300 es
// AURA_TEMPORAL_VELOCITY
precision highp float;
in vec4 v_current; in vec4 v_previous; out vec4 outColor;
void main(){ vec3 c=v_current.xyz/max(v_current.w,0.00001)*0.5+0.5; vec3 p=v_previous.xyz/max(v_previous.w,0.00001)*0.5+0.5; outColor=vec4(clamp(c.xy-p.xy,vec2(-0.25),vec2(0.25)),c.z,p.z); }`,
  portableBindings: [{ name: "u_modelViewProjection", kind: "mat4" as const }, { name: "u_previousViewProjection", kind: "mat4" as const }, { name: "u_unjitteredViewProjection", kind: "mat4" as const }],
  webgpu: {
    vertex: `// AURA_TEMPORAL_VELOCITY
/* @aura3d-bindings */
struct Out { @builtin(position) position: vec4<f32>, @location(0) current: vec4<f32>, @location(1) previous: vec4<f32> };
@vertex fn main(@location(0) position: vec3<f32>) -> Out { var out: Out; out.current=aura.u_unjitteredViewProjection*vec4<f32>(position,1); out.previous=aura.u_previousViewProjection*vec4<f32>(position,1); let clip=aura.u_modelViewProjection*vec4<f32>(position,1); out.position=vec4<f32>(clip.xy,(clip.z+clip.w)*0.5,clip.w); return out; }`,
    fragment: `// AURA_TEMPORAL_VELOCITY
/* @aura3d-bindings */
@fragment fn main(@location(0) current: vec4<f32>, @location(1) previous: vec4<f32>) -> @location(0) vec4<f32> { let c=current.xyz/max(current.w,0.00001)*0.5+0.5; let p=previous.xyz/max(previous.w,0.00001)*0.5+0.5; return vec4<f32>(clamp((c.xy-p.xy)*vec2<f32>(1,-1),vec2<f32>(-.25),vec2<f32>(.25)),c.z,p.z); }`
  }
};
