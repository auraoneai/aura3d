/**
 * Renderer-owned object motion (C-14 / WP-06): per-view velocity and reactive
 * surfaces rendered from the prepared temporal draw list, so temporal
 * reconstruction and motion blur no longer require caller-supplied inputs.
 *
 *   velocity (rgba32f): rg = (ndcCurrent - ndcPrevious) * 0.5 in unjittered
 *     clip space (the camera-velocity units), a = previous signed linear view
 *     depth of the same surface point, 3e38 where no previous surface exists.
 *   reactive (rgba8): r = 1 where history must not be trusted (transparent
 *     or particle coverage, deformation without previous-pose correspondence).
 *
 * The previous pose is exact for rigid, instanced (per-instance previous
 * matrices), skinned (previous joint palette), morphed (previous weights) and
 * batched content (each logical member draws with its own previous model,
 * keyed by its lifetime identity). Previous depth uses the committed
 * previous projection: view = inverse(previousProjection) * previousClip, so
 * it is independent of the standard, reversed or logarithmic raster depth
 * convention. Background pixels carry camera-only reprojection of the view
 * ray (rotation and, for orthographic cameras, translation).
 */
import { invertMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { batchMembersFor } from "../batching/BatchMembers";
import { ForwardPass, type RenderItem } from "../ForwardPass";
import { Geometry } from "../Geometry";
import { IndexBuffer } from "../IndexBuffer";
import { Material, type MaterialUniformDescriptor } from "../Material";
import { MaterialInstance } from "../MaterialInstance";
import type { RenderDevice, RenderTarget } from "../RenderDevice";
import type { ShaderLibrary, ShaderSourcePair } from "../ShaderLibraryCore";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat } from "../VertexFormat";
import { VELOCITY_PREVIOUS_INSTANCE_ATTRIBUTES, velocityMotionInputs, type VelocityMotionInputs } from "../forward/Velocity";
import type { TemporalCameraMatrices } from "../contracts/velocity";

/** Sentinel for "no previous surface", shared with linear depth and TAA. */
export const OBJECT_MOTION_NO_PREVIOUS_DEPTH = 3e38;

const PASS_VELOCITY = 0;
const PASS_REACTIVE = 1;
const PASS_BACKGROUND = 2;

const SHADER_NAME = "renderer-object-motion";
const MARKER = "AURA_RENDERER_OBJECT_MOTION";

export const OBJECT_MOTION_SHADER: ShaderSourcePair = {
  name: SHADER_NAME,
  marker: MARKER,
  vertex: `#version 300 es
// ${MARKER}
precision highp float;
in vec3 a_position;
in vec3 a_previousPosition;
in vec4 a_instanceMatrix0;
in vec4 a_instanceMatrix1;
in vec4 a_instanceMatrix2;
in vec4 a_instanceMatrix3;
in vec4 ${VELOCITY_PREVIOUS_INSTANCE_ATTRIBUTES[0]};
in vec4 ${VELOCITY_PREVIOUS_INSTANCE_ATTRIBUTES[1]};
in vec4 ${VELOCITY_PREVIOUS_INSTANCE_ATTRIBUTES[2]};
in vec4 ${VELOCITY_PREVIOUS_INSTANCE_ATTRIBUTES[3]};
uniform float u_a3dInstancing;
uniform float u_a3dMotionPass;
uniform float u_a3dMotionDeformed;
uniform mat4 u_a3dMotionRaster;
uniform mat4 u_a3dMotionCurrent;
uniform mat4 u_a3dMotionPrevious;
uniform mat4 u_a3dMotionPreviousView;
uniform mat4 u_a3dMotionGeometry;
out vec4 v_current;
out vec4 v_previous;
out vec4 v_previousView;
void main() {
  if (u_a3dMotionPass > 1.5) {
    v_current = vec4(0.0); v_previous = vec4(0.0); v_previousView = vec4(0.0);
    gl_Position = vec4(a_position.xy, 0.0, 1.0);
    return;
  }
  bool instanced = u_a3dInstancing > 0.5;
  mat4 instance = instanced ? mat4(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3) : mat4(1.0);
  mat4 previousInstance = instanced
    ? mat4(${VELOCITY_PREVIOUS_INSTANCE_ATTRIBUTES.join(", ")})
    : mat4(1.0);
  vec4 local = instance * (u_a3dMotionGeometry * vec4(a_position, 1.0));
  vec3 previousSource = u_a3dMotionDeformed > 0.5 ? a_previousPosition : a_position;
  vec4 previousLocal = previousInstance * (u_a3dMotionGeometry * vec4(previousSource, 1.0));
  v_current = u_a3dMotionCurrent * local;
  v_previous = u_a3dMotionPrevious * previousLocal;
  v_previousView = u_a3dMotionPreviousView * previousLocal;
  gl_Position = u_a3dMotionRaster * local;
}`,
  fragment: `#version 300 es
// ${MARKER}
precision highp float;
in vec4 v_current;
in vec4 v_previous;
in vec4 v_previousView;
uniform float u_a3dMotionPass;
uniform float u_a3dMotionReactive;
uniform float u_a3dMotionExactDepth;
uniform mat4 u_a3dMotionInverseCurrent;
uniform mat4 u_a3dMotionPreviousCamera;
uniform vec2 u_a3dMotionViewport;
uniform vec2 u_a3dMotionJitter;
out vec4 outColor;
const float NO_PREVIOUS_DEPTH = 3.0e38;
void main() {
  if (u_a3dMotionPass > 0.5 && u_a3dMotionPass < 1.5) {
    outColor = vec4(clamp(u_a3dMotionReactive, 0.0, 1.0), 0.0, 0.0, 1.0);
    return;
  }
  if (u_a3dMotionPass > 1.5) {
    // Camera-only reprojection of the view ray through this pixel center.
    vec2 ndc = gl_FragCoord.xy / u_a3dMotionViewport * 2.0 - 1.0 - u_a3dMotionJitter;
    vec4 a = u_a3dMotionInverseCurrent * vec4(ndc, 0.25, 1.0);
    vec4 b = u_a3dMotionInverseCurrent * vec4(ndc, 0.75, 1.0);
    vec3 pointA = a.xyz / a.w;
    vec3 pointB = b.xyz / b.w;
    vec4 previous = u_a3dMotionPreviousCamera * vec4(pointB - pointA, 0.0);
    // Orthographic rays have no vanishing point; reproject a point instead.
    if (abs(previous.w) < 1e-6) previous = u_a3dMotionPreviousCamera * vec4(pointB, 1.0);
    vec2 velocity = abs(previous.w) < 1e-20 ? vec2(0.0) : clamp((ndc - previous.xy / previous.w) * 0.5, vec2(-0.25), vec2(0.25));
    outColor = vec4(velocity, 0.0, NO_PREVIOUS_DEPTH);
    return;
  }
  if (!(v_previous.w > 1e-6) || !(abs(v_current.w) > 1e-20)) {
    // Behind the previous camera: no correspondence.
    outColor = vec4(0.0, 0.0, 0.0, NO_PREVIOUS_DEPTH);
    return;
  }
  vec2 velocity = clamp((v_current.xy / v_current.w - v_previous.xy / v_previous.w) * 0.5, vec2(-0.25), vec2(0.25));
  float previousDepth = NO_PREVIOUS_DEPTH;
  if (u_a3dMotionExactDepth > 0.5 && abs(v_previousView.w) > 1e-20) {
    float depth = -v_previousView.z / v_previousView.w;
    previousDepth = isnan(depth) || isinf(depth) ? NO_PREVIOUS_DEPTH : depth;
  }
  outColor = vec4(velocity, 0.0, previousDepth);
}`
};

const UNIFORMS: readonly MaterialUniformDescriptor[] = [
  { name: "u_a3dMotionPass", kind: "float" },
  { name: "u_a3dMotionDeformed", kind: "float" },
  { name: "u_a3dMotionReactive", kind: "float" },
  { name: "u_a3dMotionExactDepth", kind: "float" },
  { name: "u_a3dMotionRaster", kind: "mat4" },
  { name: "u_a3dMotionCurrent", kind: "mat4" },
  { name: "u_a3dMotionPrevious", kind: "mat4" },
  { name: "u_a3dMotionPreviousView", kind: "mat4" },
  { name: "u_a3dMotionGeometry", kind: "mat4" },
  { name: "u_a3dMotionInverseCurrent", kind: "mat4" },
  { name: "u_a3dMotionPreviousCamera", kind: "mat4" },
  { name: "u_a3dMotionViewport", kind: "vec2" },
  { name: "u_a3dMotionJitter", kind: "vec2" }
];

const MOTION_FORMAT = new VertexFormat([
  { semantic: "position", components: 3, offset: 0 },
  { semantic: "custom:a_previousPosition", components: 3, offset: 12, shaderLocation: 3, shaderName: "a_previousPosition" }
], 24);

const IDENTITY = Object.freeze(Array.from({ length: 16 }, (_, index) => (index % 5 === 0 ? 1 : 0)));
const mat = (value: ArrayLike<number> | undefined): Mat4 => Array.from(value ?? IDENTITY) as unknown as Mat4;
const f32 = (value: Mat4 | readonly number[]): Float32Array => Float32Array.from(value as ArrayLike<number>);

export interface ObjectMotionFrame {
  readonly matrices: TemporalCameraMatrices;
  /** Clip-space raster jitter of the current frame. */
  readonly jitterClip: readonly [number, number];
}

export interface ObjectMotionResult {
  /** Per-draw materials; the owner retires them after the frame's draws. */
  readonly materials: readonly Material[];
  /** True when velocity.a carries exact previous depth (both projections known). */
  readonly exactPreviousDepth: boolean;
  /** Stable reasons for content the pass could not represent. */
  readonly unsupported: readonly string[];
  /** Logical draws written per pass (diagnostics). */
  readonly velocityDraws: number;
  readonly reactiveDraws: number;
  readonly deformedDraws: number;
}

/**
 * Expand engine batch carriers into their logical members so each member
 * reprojects with its own previous model. `prepare` registers a member in the
 * owning view's history and returns its prepared item.
 */
export function objectMotionDrawList(sources: readonly RenderItem[], prepared: readonly RenderItem[],
  prepare: (member: RenderItem) => RenderItem): RenderItem[] {
  const list: RenderItem[] = [];
  sources.forEach((source, index) => {
    const members = batchMembersFor(source);
    if (members?.length) for (const member of members) list.push(prepare(member));
    else list.push(prepared[index]!);
  });
  return list;
}

function blended(item: RenderItem): boolean {
  const base = item.material instanceof MaterialInstance ? item.material.baseMaterial : item.material;
  return Boolean(base?.renderState.blend || (base?.renderState.blendMode !== undefined && base.renderState.blendMode !== "opaque"));
}

function transformPoint(m: ArrayLike<number>, offset: number, x: number, y: number, z: number, out: number[], weight: number): void {
  out[0] = out[0]! + weight * (m[offset]! * x + m[offset + 4]! * y + m[offset + 8]! * z + m[offset + 12]!);
  out[1] = out[1]! + weight * (m[offset + 1]! * x + m[offset + 5]! * y + m[offset + 9]! * z + m[offset + 13]!);
  out[2] = out[2]! + weight * (m[offset + 2]! * x + m[offset + 6]! * y + m[offset + 10]! * z + m[offset + 14]!);
}

function vertexRate(buffer: VertexBuffer): boolean {
  return buffer.format.streams.find((stream) => stream.slot === buffer.bufferSlot)?.stepMode !== "instance";
}

/**
 * Current and previous deformed positions (morph, then skin) for one draw.
 * Returns undefined when a deformation input has no vertex correspondence.
 */
export function deformObjectMotionGeometry(item: RenderItem, inputs: Pick<VelocityMotionInputs, "previousMorphWeights" | "previousJointMatrices">): Geometry | undefined {
  const source = item.geometry;
  const format = source.vertexBuffer.format;
  if (!format.hasAttribute("position")) return undefined;
  const positions = source.getAttributeBuffer("position");
  if (!vertexRate(positions)) return undefined;
  const count = positions.vertexCount;
  const morphTargets = item.morphTargets?.length && item.morphWeights ? item.morphTargets : undefined;
  const weights = morphTargets ? Array.from(item.morphWeights!) : [];
  const previousWeights = morphTargets
    ? (inputs.previousMorphWeights?.length === weights.length ? Array.from(inputs.previousMorphWeights) : weights)
    : [];
  const skin = item.skinning;
  let joints: VertexBuffer | undefined, skinWeights: VertexBuffer | undefined;
  let joints1: VertexBuffer | undefined, weights1: VertexBuffer | undefined;
  if (skin) {
    if (!format.hasAttribute("joints") || !format.hasAttribute("weights")) return undefined;
    joints = source.getAttributeBuffer("joints");
    skinWeights = source.getAttributeBuffer("weights");
    if (skin.extraInfluences && format.hasAttribute("joints1") && format.hasAttribute("weights1")) {
      joints1 = source.getAttributeBuffer("joints1");
      weights1 = source.getAttributeBuffer("weights1");
    }
    if (![joints, skinWeights, joints1, weights1].every((buffer) => !buffer || vertexRate(buffer))) return undefined;
  }
  const palette = skin?.matrices;
  const previousPalette = skin && inputs.previousJointMatrices?.length === palette!.length ? inputs.previousJointMatrices : palette;
  const buffer = new VertexBuffer(MOTION_FORMAT, count);
  const out = buffer.floats;
  const current = [0, 0, 0], previous = [0, 0, 0];
  for (let vertex = 0; vertex < count; vertex += 1) {
    const p = positions.getDecodedAttribute(vertex, "position");
    let cx = p[0] ?? 0, cy = p[1] ?? 0, cz = p[2] ?? 0;
    let px = cx, py = cy, pz = cz;
    if (morphTargets) {
      for (let target = 0; target < morphTargets.length; target += 1) {
        const delta = morphTargets[target]!.positions?.[vertex];
        if (!delta) continue;
        const w = weights[target] ?? 0, pw = previousWeights[target] ?? 0;
        cx += w * delta[0]; cy += w * delta[1]; cz += w * delta[2];
        px += pw * delta[0]; py += pw * delta[1]; pz += pw * delta[2];
      }
    }
    if (skin && palette && previousPalette) {
      current[0] = current[1] = current[2] = 0;
      previous[0] = previous[1] = previous[2] = 0;
      let total = 0;
      const apply = (indices: readonly number[], factors: readonly number[]): void => {
        for (let slot = 0; slot < 4; slot += 1) {
          const weight = factors[slot] ?? 0;
          if (weight === 0) continue;
          const joint = Math.max(0, Math.min(skin.jointCount - 1, Math.trunc(indices[slot] ?? 0)));
          transformPoint(palette, joint * 16, cx, cy, cz, current, weight);
          transformPoint(previousPalette, joint * 16, px, py, pz, previous, weight);
          total += weight;
        }
      };
      apply(joints!.getDecodedAttribute(vertex, "joints"), skinWeights!.getDecodedAttribute(vertex, "weights"));
      if (joints1 && weights1) apply(joints1.getDecodedAttribute(vertex, "joints1"), weights1.getDecodedAttribute(vertex, "weights1"));
      if (total > 0.0001) {
        [cx, cy, cz] = current as [number, number, number];
        [px, py, pz] = previous as [number, number, number];
      }
    }
    const offset = vertex * 6;
    out[offset] = cx; out[offset + 1] = cy; out[offset + 2] = cz;
    out[offset + 3] = px; out[offset + 4] = py; out[offset + 5] = pz;
  }
  if (!out.every(Number.isFinite)) {
    buffer.dispose();
    return undefined;
  }
  let index: IndexBuffer | null = null;
  try {
    const sourceIndex = source.indexBuffer;
    if (sourceIndex) index = new IndexBuffer(sourceIndex.data, count, sourceIndex.type);
    const geometry = new Geometry(buffer, index, source.topology);
    geometry.drawRange = source.drawRange;
    return geometry;
  } catch (error) {
    try { buffer.dispose(); } catch { /* Preserve the construction failure. */ }
    try { index?.dispose(); } catch { /* Preserve the construction failure. */ }
    throw error;
  }
}

interface MotionDraw {
  readonly item: RenderItem;
  readonly transparent: boolean;
  readonly reactive: number;
  readonly parameters: Record<string, Float32Array | number>;
}

/** Fold the per-draw clip and previous-view transforms in double precision. */
function drawParameters(inputs: VelocityMotionInputs, frame: ObjectMotionFrame, previousView: Mat4 | undefined,
  geometryMatrix: ArrayLike<number> | undefined, deformed: boolean, reactive: number): Record<string, Float32Array | number> {
  const model = mat(inputs.model), previousModel = mat(inputs.previousModel);
  return {
    u_a3dMotionDeformed: deformed ? 1 : 0,
    u_a3dMotionReactive: reactive,
    u_a3dMotionExactDepth: previousView ? 1 : 0,
    u_a3dMotionRaster: f32(multiplyMat4(mat(frame.matrices.jittered), model)),
    u_a3dMotionCurrent: f32(multiplyMat4(mat(frame.matrices.unjittered), model)),
    u_a3dMotionPrevious: f32(multiplyMat4(mat(frame.matrices.previous), previousModel)),
    u_a3dMotionPreviousView: f32(previousView ? multiplyMat4(previousView, previousModel) : IDENTITY),
    u_a3dMotionGeometry: f32(geometryMatrix ? Array.from(geometryMatrix) : IDENTITY)
  };
}

function motionMaterial(pass: number, parameters: Record<string, Float32Array | number>, depthWrite: boolean,
  depthTest: boolean, frame: ObjectMotionFrame, width: number, height: number, inverseCurrent: Float32Array): Material {
  return new Material({
    name: SHADER_NAME,
    shaderKey: SHADER_NAME,
    requiredAttributes: ["a_position"],
    uniformSchema: UNIFORMS,
    parameters: {
      u_a3dMotionDeformed: 0, u_a3dMotionReactive: 0, u_a3dMotionExactDepth: 0,
      u_a3dMotionRaster: f32(IDENTITY), u_a3dMotionCurrent: f32(IDENTITY), u_a3dMotionPrevious: f32(IDENTITY),
      u_a3dMotionPreviousView: f32(IDENTITY), u_a3dMotionGeometry: f32(IDENTITY),
      ...parameters,
      u_a3dMotionPass: pass,
      u_a3dMotionInverseCurrent: inverseCurrent,
      u_a3dMotionPreviousCamera: f32(Array.from(frame.matrices.previous)),
      u_a3dMotionViewport: Float32Array.of(width, height),
      u_a3dMotionJitter: Float32Array.of(frame.jitterClip[0], frame.jitterClip[1])
    },
    renderState: { cullMode: "none", depthTest, depthWrite, blend: false }
  });
}

function instanceColumns(transforms: Float32Array): RenderItem["instanceAttributes"] {
  const count = transforms.length / 16;
  return VELOCITY_PREVIOUS_INSTANCE_ATTRIBUTES.map((shaderName, column) => {
    const data = new Float32Array(count * 4);
    for (let instance = 0; instance < count; instance += 1) {
      data.set(transforms.subarray(instance * 16 + column * 4, instance * 16 + column * 4 + 4), instance * 4);
    }
    return { shaderName, components: 4 as const, data, divisor: 1 };
  });
}

/**
 * Render the view's velocity and reactive surfaces from prepared draws. Draws
 * without a live velocity context (not prepared for this frame) are skipped
 * and reported; transparent and particle coverage only marks reactive.
 */
export function renderObjectMotion(device: RenderDevice, library: ShaderLibrary, velocity: RenderTarget, reactive: RenderTarget,
  prepared: readonly RenderItem[], frame: ObjectMotionFrame, width: number, height: number): ObjectMotionResult {
  const unsupported = new Set<string>();
  const materials: Material[] = [];
  const transient: Geometry[] = [];
  const draws: MotionDraw[] = [];
  const { projection, previousProjection } = frame.matrices;
  let previousView: Mat4 | undefined;
  if (projection && previousProjection) {
    const inverse = invertMat4(mat(previousProjection));
    const folded = multiplyMat4(inverse, mat(frame.matrices.previous));
    if ((folded as unknown as number[]).every(Number.isFinite)) previousView = folded;
  }
  const inverseCurrent = f32(invertMat4(mat(frame.matrices.unjittered)));
  let deformedDraws = 0;
  try {
    for (const item of prepared) {
      const inputs = velocityMotionInputs(item);
      if (!inputs) { unsupported.add("motion-context"); continue; }
      if ((item as RenderItem & { readonly multiDraw?: unknown }).multiDraw !== undefined) { unsupported.add("batch-motion"); continue; }
      const transparent = blended(item) || Boolean(item.writesReactive);
      let geometry = item.geometry;
      let deformed = false;
      let poseUnavailable = inputs.poseUnavailable;
      if (item.skinning || item.morphTargets?.length) {
        const result = deformObjectMotionGeometry(item, inputs);
        if (result) { transient.push(result); geometry = result; deformed = true; deformedDraws += 1; }
        else { poseUnavailable = true; unsupported.add("deformation-motion"); }
      }
      const reactiveValue = transparent || poseUnavailable ? 1 : 0;
      const instances = item.instanceTransforms?.length ? Float32Array.from(item.instanceTransforms) : undefined;
      const previousInstances = instances && inputs.previousInstanceTransforms?.length === instances.length
        ? inputs.previousInstanceTransforms : instances;
      const motionItem: RenderItem = {
        geometry,
        // Distinct from the forward draw it shadows (diagnostics key on labels).
        label: `object-motion:${item.label ?? "item"}`,
        temporalObjectKey: inputs.objectKey,
        ...(item.drawRange ? { drawRange: item.drawRange } : {}),
        ...(item.modelMatrix ? { modelMatrix: item.modelMatrix } : {}),
        ...(instances ? { instanceTransforms: instances, instanceAttributes: instanceColumns(previousInstances!) } : {}),
        ...(item.instanceCount !== undefined ? { instanceCount: item.instanceCount } : {})
      };
      draws.push({ item: motionItem, transparent, reactive: reactiveValue,
        parameters: drawParameters(inputs, frame, previousView, item.geometryMatrix, deformed, reactiveValue) });
    }
    const execute = (items: readonly RenderItem[]): void => {
      if (items.length === 0) return;
      new ForwardPass({ items, shaderLibrary: library }).execute({ device, width, height });
    };
    const withMaterial = (draw: MotionDraw, pass: number, depthWrite: boolean): RenderItem => {
      const material = motionMaterial(pass, draw.parameters, depthWrite, true, frame, width, height, inverseCurrent);
      materials.push(material);
      return { ...draw.item, material };
    };
    // Velocity: camera-only background first, then every opaque surface.
    const backgroundVertices = new VertexBuffer(VertexFormat.P3, 3);
    backgroundVertices.floats.set([-1, -1, 0, 3, -1, 0, -1, 3, 0]);
    const background = new Geometry(backgroundVertices, null, "triangles");
    transient.push(background);
    const backgroundMaterial = motionMaterial(PASS_BACKGROUND, {}, false, false, frame, width, height, inverseCurrent);
    materials.push(backgroundMaterial);
    device.setRenderTarget(velocity);
    device.clear([0, 0, 0, OBJECT_MOTION_NO_PREVIOUS_DEPTH]);
    execute([{ geometry: background, material: backgroundMaterial, label: "object-motion-background" }]);
    const opaque = draws.filter((draw) => !draw.transparent);
    execute(opaque.map((draw) => withMaterial(draw, PASS_VELOCITY, true)));
    // Reactive: opaque surfaces establish visibility, then transparent and
    // particle coverage marks history as unreliable without writing depth.
    device.setRenderTarget(reactive);
    device.clear([0, 0, 0, 1]);
    execute(opaque.map((draw) => withMaterial(draw, PASS_REACTIVE, true)));
    const overlay = draws.filter((draw) => draw.transparent);
    execute(overlay.map((draw) => withMaterial(draw, PASS_REACTIVE, false)));
    return { materials, exactPreviousDepth: previousView !== undefined, unsupported: [...unsupported],
      velocityDraws: opaque.length, reactiveDraws: draws.length, deformedDraws };
  } catch (error) {
    for (const material of materials) {
      try { material.dispose(); } catch { /* Preserve the pass failure. */ }
    }
    throw error;
  } finally {
    for (const geometry of transient) {
      try { geometry.dispose(); } catch { /* Transient motion geometry is not retained. */ }
    }
  }
}
