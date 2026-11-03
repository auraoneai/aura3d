// threejs-parity lane L6 (docs/workflows/threejs-parity-gaps.md §5.6):
// C-36 node handlers for `kind: "line" | "points" | "sprite"` (SG-06/07/08,
// AD-08, SC-03). Handlers replace the `parityPending` table defaults — the
// compile-time gate on `A3D_PARITY_LINES` keeps flag-off behaviour identical
// to the old default (a `parity-not-implemented` validate error).
//
// Rendering notes:
//  - Thin lines draw `"lines"`-topology geometry through `UnlitMaterial`
//    (a_color vertex colours work on both the lean and generated paths).
//  - `dashed` thin lines and `lines.fat` draw real screen-space quads via
//    `Geometry.screenSpaceLineSegments` + `ScreenSpaceLineMaterial` (width=1
//    for dashed-thin — the only route that shades dashes, and pixel-exact to
//    three's 1px stroke). `a_lineDistance` accumulates continuously across
//    segment pairs, matching three's `computeLineDistances`.
//  - Points/sprite parity behaviour (size attenuation, `gl_PointCoord` map
//    sampling, billboard reprojection) is contributed by the generated-path
//    ShaderFeatures `prd15.parityPoints` / `prd15.paritySprite`, gated on
//    `A3D_PARITY_LINES` and selected by material marker parameters.
//  - World-width lines use camera-facing geometry and the same distance and
//    color attributes as pixel-width lines.

import {
  Geometry,
  IndexBuffer,
  ScreenSpaceLineMaterial,
  Texture,
  TextureBinding,
  UnlitMaterial,
  VertexBuffer,
  VertexFormat,
  createSpriteQuadGeometry,
  generateProceduralMaterialTexture,
  isTextureBinding,
  type RenderItem,
  type RenderMaterial
} from "@aura3d/rendering";
import { registerShaderChunk, registerShaderFeature, type ShaderFeature, type ShaderFeatureSelectInput } from "@aura3d/rendering/contracts";
import type { NodeHandler, SceneCompileContext } from "../../contracts/compiler.js";
import type { RenderState } from "@aura3d/rendering";
import type { AuraLineNode, AuraMaterialSpec, AuraMaterialTextureInput, AuraPointsNode, AuraSpriteNode, AuraRuntimeNodeHandle, AuraTransformSpec, AuraVec3 } from "../nodes/types.js";
import type { AuraCustomGeometrySpec } from "../RootGeometry.js";
import { normalizeGeometryAttributes } from "../RootGeometry.js";
import { runtimeNodeEffectiveVisibility, runtimeNodeQueryState } from "../app/runtimeNodes.js";
import { parseAuraColor } from "../../contracts/sceneGraph.js";
import { colorToLinearRgba } from "../colorUtils.js";
import { localMatrixOf } from "../sceneGraph.js";
import { worldTransformOf } from "./sceneGraph.js";
import { normalizeLinePositions, validateLineDashOptions } from "../nodes/lines.js";
import { getMaterialClipping } from "../nodes/scene.js";
import { AuraRuntimeError } from "./errors.js";

const L6_FLAG = "A3D_PARITY_LINES" as const;
/** Any non-"prd15" owner runs: "prd15" is the C-36 bridge/skip sentinel. */
const L6_OWNER = "prd11" as const;

// ── ShaderFeature chunks (generated path; dead code until a feature selects) ──

/** fragment-side sampler for `u_pointMap` (guarded — declared only under the map bit). */
const POINTS_PARS = "a3d_prd15_points_pars";
const POINTS_VERTEX_END = "a3d_prd15_points_vertex_end";
const POINTS_MATERIAL = "a3d_prd15_points_material";
const SPRITE_PARS = "a3d_prd15_sprite_pars";
const SPRITE_VERTEX_END = "a3d_prd15_sprite_vertex_end";

const POINT_ATTENUATE_BIT = 1;
const POINT_MAP_BIT = 2;
const POINT_ROUND_BIT = 4;

const parityPointsFeature: ShaderFeature = {
  id: "prd15.parityPoints",
  owner: "prd15",
  flag: L6_FLAG,
  hooks: ["fragment:pars", "vertex:end", "fragment:material"],
  chunks: [POINTS_PARS, POINTS_VERTEX_END, POINTS_MATERIAL],
  select(input: ShaderFeatureSelectInput) {
    const material = input.item.material as RenderMaterial | undefined;
    const get = (name: string): unknown => (material as { getParameter?: (n: string) => unknown } | undefined)?.getParameter?.(name);
    // The sprite material shares UnlitMaterial — never let the billboard quad
    // take the gl_PointCoord path.
    if (get("u_spriteMode") === 1) return undefined;
    let bits = 0;
    if (get("u_pointSizeAttenuation") === 1) bits |= POINT_ATTENUATE_BIT;
    if (isTextureBinding(get("u_pointMap"))) bits |= POINT_MAP_BIT;
    if (get("u_roundPoints") === 1) bits |= POINT_ROUND_BIT;
    return bits === 0 ? undefined : bits;
  },
  defines(value): Readonly<Record<string, string | number | true>> {
    const bits = typeof value === "number" ? value : 0;
    const out: Record<string, string | number | true> = { A3D_PARITY_POINTS: 1 };
    if (bits & POINT_ATTENUATE_BIT) out.A3D_PARITY_POINT_ATTENUATION = 1;
    if (bits & POINT_MAP_BIT) out.A3D_PARITY_POINT_MAP = 1;
    if (bits & POINT_ROUND_BIT) out.A3D_PARITY_POINT_ROUND = 1;
    return out;
  }
};

const paritySpriteFeature: ShaderFeature = {
  id: "prd15.paritySprite",
  owner: "prd15",
  flag: L6_FLAG,
  hooks: ["vertex:pars", "vertex:end"],
  chunks: [SPRITE_PARS, SPRITE_VERTEX_END],
  select(input: ShaderFeatureSelectInput) {
    const material = input.item.material as RenderMaterial | undefined;
    const value = (material as { getParameter?: (n: string) => unknown } | undefined)?.getParameter?.("u_spriteMode");
    return value === 1 ? true : undefined;
  },
  defines(value): Readonly<Record<string, string | number | true>> {
    return value === true ? { A3D_PARITY_SPRITE: 1 } : {};
  }
};

let shaderFeaturesRegistered = false;

/**
 * Registers the L6 chunks + features. Runs at module import: `handlers.ts`
 * imports the handler objects below, and registry activation stays gated on
 * `A3D_PARITY_LINES` (flag-off selects nothing, so other draws are untouched).
 */
function registerParityShaderFeatures(): void {
  if (shaderFeaturesRegistered) return;
  shaderFeaturesRegistered = true;

  registerShaderChunk({
    name: POINTS_PARS,
    owner: "prd15",
    stage: "fragment",
    glsl: `#ifdef A3D_PARITY_POINT_MAP\nuniform sampler2D u_pointMap;\n#endif`
  });
  registerShaderChunk({
    name: POINTS_VERTEX_END,
    owner: "prd15",
    stage: "vertex",
    // three.js PointsMaterial.sizeAttenuation: size · pixelRatio · (0.5·CSS height ÷ view depth), which is
    // size · (0.5·device height ÷ view depth). u_pointSize carries the bare `size` here;
    // u_resolutionFarTime.y is the render-target height in device px.
    // The cap (12% of the render-target height) and the near cull keep a point that passes close to the camera, or a
    // huge authored size, from becoming a screen-filling disc on GPUs that allow very large point sizes.
    glsl: `#ifdef A3D_PARITY_POINT_ATTENUATION
{
  float a3dPointPx = u_pointSize * (0.5 * u_resolutionFarTime.y) / max(gl_Position.w, 1e-3);
  gl_PointSize = min(a3dPointPx, 0.12 * u_resolutionFarTime.y);
  if (gl_Position.w < 0.05) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
#endif`
  });
  registerShaderChunk({
    name: POINTS_MATERIAL,
    owner: "prd15",
    stage: "fragment",
    glsl: `#ifdef A3D_PARITY_POINT_MAP
a3dBaseColor *= texture(u_pointMap, gl_PointCoord);
#endif
#ifdef A3D_PARITY_POINT_ROUND
if (length(gl_PointCoord - vec2(0.5)) > 0.5) discard;
#endif`
  });
  registerShaderChunk({
    name: SPRITE_PARS,
    owner: "prd15",
    stage: "vertex",
    glsl: `uniform float u_spriteRotation;
uniform vec2 u_spriteCenter;
uniform float u_spriteSizeAttenuation;
#ifdef A3D_CLIPPING
uniform mat4 u_a3dSpriteViewToWorld;
uniform mat4 u_a3dSpriteWorldToObject;
#endif`
  });
  registerShaderChunk({
    name: SPRITE_VERTEX_END,
    owner: "prd15",
    stage: "vertex",
    // three's SpriteMaterial vertex program: anchor offset in view space,
    // rotated in the screen plane; sizeAttenuation:false scales by -viewZ so
    // the sprite keeps a constant screen fraction under perspective.
    glsl: `{
  vec3 a3dSpriteCenterWorld = (u_modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec4 a3dSpriteView = u_view * vec4(a3dSpriteCenterWorld, 1.0);
  vec2 a3dSpriteScale = vec2(length(u_modelMatrix[0].xyz), length(u_modelMatrix[1].xyz));
  if (u_spriteSizeAttenuation < 0.5 && u_projection[2][3] < -0.5) {
    a3dSpriteScale *= -a3dSpriteView.z;
  }
  vec2 a3dSpriteAligned = (a_position.xy - (u_spriteCenter - vec2(0.5))) * a3dSpriteScale;
  float a3dSpriteCos = cos(u_spriteRotation);
  float a3dSpriteSin = sin(u_spriteRotation);
  vec2 a3dSpriteRotated = vec2(
    a3dSpriteCos * a3dSpriteAligned.x - a3dSpriteSin * a3dSpriteAligned.y,
    a3dSpriteSin * a3dSpriteAligned.x + a3dSpriteCos * a3dSpriteAligned.y
  );
  a3dSpriteView.xy += a3dSpriteRotated;
  gl_Position = u_projection * a3dSpriteView;
  v_worldPosition = a3dSpriteCenterWorld;
#ifdef A3D_CLIPPING
  // The billboard is expanded in view space after the generator's ordinary
  // clip coordinates have been assigned. Reconstruct the expanded vertex;
  // clipping the source quad or the centre gives the wrong cut after a camera
  // rotation, sprite anchor, scale, or screen-plane rotation.
  // CPU-validated inverses avoid a second, lower-precision determinant test
  // in the vertex shader. For a global-only group, object-local coordinates
  // are unused and the pass may bind identity for a singular model.
  vec4 a3dSpriteClipWorld = u_a3dSpriteViewToWorld * a3dSpriteView;
  v_a3dClipWorld = a3dSpriteClipWorld.xyz / a3dSpriteClipWorld.w;
  v_a3dClipLocal = (u_a3dSpriteWorldToObject * vec4(v_a3dClipWorld, 1.0)).xyz;
#endif
}`
  });

  registerShaderFeature(parityPointsFeature);
  registerShaderFeature(paritySpriteFeature);
}

registerParityShaderFeatures();

// ── Shared helpers ──────────────────────────────────────────────────────────

/** Fail closed while the lane flag is off (identical code path to parityPending). */
function assertL6Flag(ctx: SceneCompileContext, kind: string): void {
  if (!ctx.flags.on(L6_FLAG)) {
    throw new AuraRuntimeError(
      "parity-not-implemented",
      `Aura3D scene node kind "${kind}" is not yet implemented (${L6_FLAG}). See docs/workflows/threejs-parity-gaps.md.`
    );
  }
}

type CanvasLike = { readonly width?: number; readonly height?: number; readonly clientWidth?: number };

function mountCanvas(ctx: SceneCompileContext): CanvasLike {
  return (ctx as { readonly canvas?: CanvasLike }).canvas ?? { width: 1, height: 1 };
}

function canvasDpr(ctx: SceneCompileContext): number {
  const canvas = mountCanvas(ctx);
  const width = canvas.width ?? 0;
  const client = canvas.clientWidth ?? 0;
  if (width > 0 && client > 0) return width / client;
  const globalDpr = (globalThis as { devicePixelRatio?: number }).devicePixelRatio;
  return Number.isFinite(globalDpr) && (globalDpr ?? 0) > 0 ? (globalDpr as number) : 1;
}

interface ParityRecord {
  readonly geometry: Geometry;
  material: UnlitMaterial | ScreenSpaceLineMaterial;
  readonly kind: "line" | "fat" | "points" | "sprite";
  readonly label: string;
  lineSegments?: readonly LineSegment[];
  lastDistanceMatrix?: Float32Array;
  lineData?: LineData;
  appliedGeometry?: AuraCustomGeometrySpec;
  dispose(): void;
}

function makeRecord(geometry: Geometry, material: UnlitMaterial | ScreenSpaceLineMaterial, kind: ParityRecord["kind"], label: string, lineSegments?: readonly LineSegment[], lastDistanceMatrix?: Float32Array): ParityRecord {
  return {
    geometry,
    material,
    kind,
    label,
    lineSegments,
    lastDistanceMatrix,
    dispose() {
      geometry.dispose();
      this.material.dispose();
    }
  };
}

/** T·R·S from the node's transform with live handle overrides (SG-09 mutable path). */
function modelMatrixFor(
  node: AuraTransformSpec,
  handle: { readonly position?: AuraVec3; readonly rotation?: AuraVec3; readonly scale?: number | AuraVec3 } | undefined
): Float32Array {
  if (handle && "snapshot" in handle) {
    const world = runtimeNodeQueryState(handle as AuraRuntimeNodeHandle)?.worldMatrix;
    if (world) return world;
  }
  // A true scene-graph flatten can preserve a sheared world matrix that cannot
  // be reconstructed from the flattened node's decomposed TRS fields.
  const flattened = !handle ? worldTransformOf(node)?.matrix : undefined;
  if (flattened) return Float32Array.from(flattened);
  return localMatrixOf({
    ...node,
    position: handle?.position ?? node.position,
    rotation: handle?.rotation ?? node.rotation,
    scale: handle?.scale ?? node.scale
  }, new Float32Array(16));
}

function isVisible(node: { readonly visible?: boolean }, handle: { readonly visible?: boolean } | undefined): boolean {
  if (handle && "snapshot" in handle) return runtimeNodeEffectiveVisibility(handle as AuraRuntimeNodeHandle);
  return (handle?.visible ?? node.visible) !== false;
}

/** Flattened nodes retain their original material snapshot. Runtime material
 * replacement belongs to the source node referenced by the live handle. */
function materialClippingFor(node: { readonly material?: AuraMaterialSpec }, handle: AuraRuntimeNodeHandle | undefined) {
  const current = handle && "snapshot" in handle ? runtimeNodeQueryState(handle) : undefined;
  return getMaterialClipping(current ? current.node.material : node.material);
}

interface MaterialColorInput {
  readonly color?: string;
  readonly opacity?: number;
}

function materialRgba(spec: MaterialColorInput | undefined, fallback: readonly [number, number, number, number]): readonly [number, number, number, number] {
  if (spec?.color === undefined && spec?.opacity === undefined) return fallback;
  const [r, g, b, a] = spec?.color !== undefined ? parseAuraColor(spec.color) : fallback;
  return [r, g, b, a * (spec?.opacity !== undefined ? Math.min(1, Math.max(0, spec.opacity)) : 1)];
}

function transparentRenderState(spec: MaterialColorInput | undefined, forceTransparent: boolean | undefined): { blend: boolean; depthWrite: boolean; cullMode?: "none" } | undefined {
  const opacity = spec?.opacity ?? 1;
  if (forceTransparent === true || opacity < 0.999) return { blend: true, depthWrite: false };
  return undefined;
}

/**
 * `ScreenSpaceLineMaterial.renderState` requires the full RenderState (unlike
 * UnlitMaterial's Partial). Default matches Material's base state — only the
 * transparency fields come from `transparentRenderState`.
 */
function fullRenderState(partial: ReturnType<typeof transparentRenderState>): RenderState {
  return {
    depthTest: true,
    depthWrite: partial?.depthWrite ?? true,
    cullMode: "none",
    blend: partial?.blend ?? false,
    depthCompare: "less-equal",
    colorWrite: [true, true, true, true]
  };
}

const P3_C4 = new VertexFormat([
  { semantic: "position", components: 3, offset: 0 },
  { semantic: "color", components: 4, offset: 12 }
]);

function vertexColorsGeometry(positions: readonly AuraVec3[], colors: readonly string[], topology: "lines" | "points", label: string): Geometry {
  if (colors.length !== positions.length) {
    throw new Error(`${label} colors must match positions length (${colors.length} colors, ${positions.length} points)`);
  }
  const vertices = new VertexBuffer(P3_C4, positions.length);
  positions.forEach((position, index) => {
    vertices.setAttribute(index, "position", position);
    vertices.setAttribute(index, "color", colorToLinearRgba(colors[index]!));
  });
  return new Geometry(vertices, null, topology);
}

/** Polyline → segment pairs; `"loop"` appends the closing edge (last → first). */
interface LineSegment {
  readonly start: AuraVec3;
  readonly end: AuraVec3;
  readonly startColor?: readonly [number, number, number, number];
  readonly endColor?: readonly [number, number, number, number];
}

type LineColor = readonly [number, number, number, number];
interface LineData {
  readonly positions: readonly AuraVec3[];
  readonly colors?: readonly LineColor[];
  readonly indices?: readonly number[];
}

function polylineSegments(positions: readonly AuraVec3[], mode: "line" | "loop" | "segments", colors?: readonly LineColor[]): LineSegment[] {
  const segment = (start: number, end: number): LineSegment => ({
    start: positions[start]!,
    end: positions[end]!,
    ...(colors ? { startColor: colors[start]!, endColor: colors[end]! } : {})
  });
  if (mode === "segments") {
    const out: LineSegment[] = [];
    for (let i = 0; i + 1 < positions.length; i += 2) out.push(segment(i, i + 1));
    return out;
  }
  const out: LineSegment[] = [];
  for (let i = 0; i + 1 < positions.length; i += 1) out.push(segment(i, i + 1));
  if (mode === "loop" && positions.length > 2) out.push(segment(positions.length - 1, 0));
  return out;
}

function segmentsForData(data: LineData, mode: "line" | "loop" | "segments", label: string): LineSegment[] {
  const order = data.indices ?? data.positions.map((_, i) => i);
  const positions = order.map((i) => {
    const point = data.positions[i];
    if (!point) throw new RangeError(`${label} index ${i} is outside the positions`);
    return point;
  });
  const colors = data.colors ? order.map((i) => data.colors![i]!) : undefined;
  if (positions.length !== 0 && positions.length < (mode === "loop" ? 3 : 2)) throw new Error(`${label} has too few points`);
  if (mode === "segments" && positions.length % 2) throw new Error(`${label} requires an even number of points`);
  return polylineSegments(positions, mode, colors);
}

function lineDataFromSpec(spec: AuraCustomGeometrySpec): LineData {
  if (spec.topology !== undefined && spec.topology !== "lines") throw new Error("LINE_GEOMETRY_UNSUPPORTED: line topology must be lines");
  if (spec.normals || spec.uvs || spec.uv1s || spec.attributes || spec.groups || spec.drawRange || spec.morphTargets) {
    throw new Error("LINE_GEOMETRY_UNSUPPORTED: line geometry accepts positions, colors and indices only");
  }
  // Color strings use the same parser as authored line colors; numeric arrays
  // are already linear data and are not gamma-converted a second time.
  const colorStrings = Array.isArray(spec.colors) && typeof spec.colors[0] === "string"
    ? Float32Array.from((spec.colors as readonly string[]).flatMap((color) => [...parseAuraColor(color)]))
    : spec.colors;
  const normalized = normalizeGeometryAttributes({ ...spec, colors: colorStrings });
  const positions = Array.from({ length: normalized.vertexCount }, (_, i): AuraVec3 => [
    normalized.positions[i * 3]!, normalized.positions[i * 3 + 1]!, normalized.positions[i * 3 + 2]!
  ]);
  const colors = normalized.colors ? Array.from({ length: normalized.vertexCount }, (_, i): LineColor => [
    normalized.colors![i * 4]!, normalized.colors![i * 4 + 1]!, normalized.colors![i * 4 + 2]!, normalized.colors![i * 4 + 3]!
  ]) : undefined;
  return { positions, ...(colors ? { colors } : {}), ...(normalized.indices ? { indices: Array.from(normalized.indices) } : {}) };
}

interface PendingLineAttribute {
  readonly name: string;
  readonly array: ArrayLike<number>;
  readonly offset: number;
}

function applyLineUpdates(data: LineData, updates: readonly PendingLineAttribute[]): LineData {
  const positions = data.positions.map((point) => [...point] as [number, number, number]);
  let colors = data.colors?.map((color) => [...color] as [number, number, number, number]);
  for (const update of updates) {
    const name = update.name.toLowerCase();
    const isPosition = name === "position" || name === "positions";
    const isColor = name === "color" || name === "colors";
    if (!isPosition && !isColor) throw new Error(`LINE_ATTRIBUTE_UNSUPPORTED: ${update.name}`);
    const width = isPosition ? 3 : 4;
    if (!Number.isInteger(update.offset) || update.offset < 0 || update.array.length % width !== 0 ||
        update.offset + update.array.length / width > positions.length) {
      throw new RangeError(`Line attribute "${update.name}" update exceeds its vertex range or has incomplete items`);
    }
    if (isColor && !colors) colors = positions.map(() => [1, 1, 1, 1]);
    const target = isPosition ? positions : colors!;
    for (let i = 0; i < update.array.length; i += 1) {
      const value = update.array[i]!;
      if (!Number.isFinite(value)) throw new RangeError(`Line attribute "${update.name}" must contain finite values`);
      target[update.offset + Math.floor(i / width)]![i % width] = value;
    }
  }
  return { positions, ...(colors ? { colors } : {}), ...(data.indices ? { indices: data.indices } : {}) };
}

/** Dash distances follow the transformed line, including non-uniform scale. */
function withWorldDistances(segments: readonly LineSegment[], matrix: Float32Array): (LineSegment & { startDistance: number; endDistance: number })[] {
  let distance = 0;
  return segments.map((segment) => {
    const x = segment.end[0] - segment.start[0];
    const y = segment.end[1] - segment.start[1];
    const z = segment.end[2] - segment.start[2];
    const startDistance = distance;
    distance += Math.hypot(
      matrix[0]! * x + matrix[4]! * y + matrix[8]! * z,
      matrix[1]! * x + matrix[5]! * y + matrix[9]! * z,
      matrix[2]! * x + matrix[6]! * y + matrix[10]! * z
    );
    return { ...segment, startDistance, endDistance: distance };
  });
}

/**
 * Best-effort compile-time texture resolution (SG-07/SG-08):
 *  - `aura-procedural-texture` specs rasterize through
 *    `generateProceduralMaterialTexture` (exported by `@aura3d/rendering`).
 *  - `aura-texture-ref`/`aura-asset-ref` resolve through the async texture
 *    pipeline owned by lanes L4/L7 — until that seam lands the ref degrades to
 *    a recorded `option-ignored` (never a silent wrong-texture draw). A live
 *    `Texture` instance smuggled on the ref is honoured for tests/fixtures.
 */
function resolveParityMapTexture(
  input: AuraMaterialTextureInput | undefined,
  ctx: SceneCompileContext,
  nodeId: string,
  slotLabel: string
): Texture | undefined {
  if (input === undefined) return undefined;
  const maybe = input as { readonly kind?: string; readonly texture?: unknown };
  if (maybe.texture instanceof Texture) return maybe.texture;
  if (maybe.kind === "aura-procedural-texture") {
    const spec = input as { readonly texture: string; readonly scale: number; readonly strength: number; readonly contrast?: number; readonly direction?: AuraVec3 };
    try {
      const generated = generateProceduralMaterialTexture(spec.texture as Parameters<typeof generateProceduralMaterialTexture>[0], {
        scale: spec.scale,
        strength: spec.strength,
        ...(spec.contrast !== undefined ? { contrast: spec.contrast } : {}),
        ...(spec.direction !== undefined ? { direction: spec.direction } : {})
      });
      return new Texture({ width: generated.width, height: generated.height, data: generated.data, colorSpace: "srgb", label: `${nodeId}-${slotLabel}` });
    } catch (error) {
      ctx.degrade({ code: "option-ignored", nodeId, message: `${slotLabel} procedural map failed to rasterize: ${error instanceof Error ? error.message : String(error)}` });
      return undefined;
    }
  }
  ctx.degrade({
    code: "option-ignored",
    nodeId,
    message: `${slotLabel} map refs (aura-asset-ref / aura-texture-ref) resolve through the async texture pipeline (lane L4/L7) — pass an aura-procedural-texture spec for compile-time maps`
  });
  return undefined;
}

function runtimeIdOf(node: { readonly runtime?: { readonly id?: string }; readonly name?: string }): string {
  return node.runtime?.id ?? node.name ?? "anonymous";
}

// ── kind:"line" ─────────────────────────────────────────────────────────────

const lineRecords = new WeakMap<object, ParityRecord>();

function lineMaterial(node: AuraLineNode, ctx: SceneCompileContext, segmentsList: readonly LineSegment[], label: string): UnlitMaterial | ScreenSpaceLineMaterial {
  const dashed = node.dashed === true || (node.dashSize ?? 0) > 0;
  const rgba = materialRgba(node.material, [1, 1, 1, 1]);
  const hasColorAlpha = segmentsList.some((segment) => (segment.startColor?.[3] ?? 1) < 1 || (segment.endColor?.[3] ?? 1) < 1);
  const renderState = transparentRenderState(node.material, hasColorAlpha || rgba[3] < 1);
  if (node.line === "fat" || dashed) {
    return new ScreenSpaceLineMaterial({
      name: `${label}.fat`, color: rgba, width: node.line === "fat" ? (node.width ?? 1) : 1,
      worldUnits: node.worldUnits === true,
      resolution: [Math.max(1, mountCanvas(ctx).width ?? 1), Math.max(1, mountCanvas(ctx).height ?? 1)],
      pixelRatio: canvasDpr(ctx),
      dashSize: dashed ? (node.dashSize ?? 1) : 0, gapSize: dashed ? (node.gapSize ?? 0) : 0,
      dashOffset: node.dashOffset ?? 0, renderState: fullRenderState(renderState)
    });
  }
  // Geometry always has a white default color, so adding colors later does not
  // need a shader/layout replacement.
  return new UnlitMaterial({ name: label, color: rgba, pointSize: 1, vertexColors: true, renderState });
}

function compileLineRecord(node: AuraLineNode, ctx: SceneCompileContext, initial?: LineData): ParityRecord {
  const label = `l6.line.${runtimeIdOf(node)}`;
  const positions = normalizeLinePositions(node.positions, 2, `line node "${label}"`);
  const mode = node.line === "fat" ? "line" : node.line;
  if (node.colors && node.colors.length !== positions.length) throw new Error(`${label} colors must match positions length`);
  const data = initial ?? { positions, ...(node.colors ? { colors: node.colors.map(parseAuraColor) } : {}) };
  const segmentsList = segmentsForData(data, mode, label);
  validateLineDashOptions(node, label);
  const dashed = node.dashed === true || (node.dashSize ?? 0) > 0;
  if (node.line !== "fat" && (node.width !== undefined || node.worldUnits !== undefined)) {
    throw new AuraRuntimeError("invalid-line-spec", `${label} width and worldUnits are supported only for fat lines`);
  }
  if (node.line === "fat" && (!Number.isFinite(node.width ?? 1) || (node.width ?? 1) <= 0)) {
    throw new AuraRuntimeError("invalid-line-spec", `${label} width must be positive and finite`);
  }
  if (node.line === "fat" || dashed) {
    const initialMatrix = modelMatrixFor(node, undefined);
    const geometry = Geometry.screenSpaceLineSegments(withWorldDistances(segmentsList, initialMatrix));
    const record = makeRecord(geometry, lineMaterial(node, ctx, segmentsList, label), "fat", label, segmentsList, initialMatrix);
    record.lineData = data;
    return record;
  }

  const geometry = Geometry.lineSegments(
    segmentsList.flatMap((segment) => [segment.start, segment.end]),
    data.colors ? segmentsList.flatMap((segment) => [segment.startColor!, segment.endColor!]) : undefined
  );
  const record = makeRecord(geometry, lineMaterial(node, ctx, segmentsList, label), "line", label);
  record.lineData = data;
  return record;
}

export const lineNodeHandler: NodeHandler<{ readonly kind: "line" }> = {
  kind: "line",
  owner: L6_OWNER,
  flag: L6_FLAG,
  compile(node, ctx, out) {
    assertL6Flag(ctx, "line");
    const lineNode = node as AuraLineNode;
    if (normalizeLinePositions(lineNode.positions, 2, `line node "l6.line.${runtimeIdOf(lineNode)}"`).length === 0) {
      ctx.degrade({ code: "option-ignored", nodeId: runtimeIdOf(lineNode), message: "GEOMETRY_EMPTY: line has no points; nothing is drawn" });
      out.feature("vfx.parityLines");
      return;
    }
    const record = compileLineRecord(lineNode, ctx);
    lineRecords.set(node, record);
    out.feature("vfx.parityLines");
  },
  update(node, handle, ctx, out, _timeSeconds) {
    type LineHandle = AuraRuntimeNodeHandle & {
      readonly __parityL2Geometry?: AuraCustomGeometrySpec;
      __parityL2AttributeUpdates?: PendingLineAttribute[];
    };
    const lineNode = node as AuraLineNode;
    const liveHandle = handle as LineHandle | undefined;
    const query = liveHandle && "snapshot" in liveHandle ? runtimeNodeQueryState(liveHandle) : undefined;
    const spec = query?.geometry ?? liveHandle?.__parityL2Geometry;
    const updates = liveHandle?.__parityL2AttributeUpdates ?? [];
    let record = lineRecords.get(node);
    if (!record) {
      // Empty source lines still acquire resources when populated later via a
      // handle. No GPU objects are allocated until there is a segment to draw.
      if (!spec) return;
      let data = lineDataFromSpec(spec);
      if (!query?.geometry && updates.length) data = applyLineUpdates(data, updates);
      if (!segmentsForData(data, lineNode.line === "fat" ? "line" : lineNode.line, runtimeIdOf(lineNode)).length) return;
      record = compileLineRecord(lineNode, ctx, data);
      record.appliedGeometry = spec;
      lineRecords.set(node, record);
      if (liveHandle) liveHandle.__parityL2AttributeUpdates = [];
    } else if (record.lineData && ((spec && spec !== record.appliedGeometry) || updates.length > 0)) {
      let data = spec && spec !== record.appliedGeometry ? lineDataFromSpec(spec) : record.lineData;
      // Query snapshots incorporate queued writes after setGeometry. Before a
      // query snapshot exists, replay the handle's copied writes on our data.
      if (!query?.geometry && updates.length) data = applyLineUpdates(data, updates);
      const mode = lineNode.line === "fat" ? "line" : lineNode.line;
      const segments = segmentsForData(data, mode, record.label);
      const matrix = modelMatrixFor(lineNode, handle);
      if (record.kind === "fat") {
        record.geometry.updateScreenSpaceLineSegments(withWorldDistances(segments, matrix));
        record.lastDistanceMatrix = matrix;
      } else {
        record.geometry.updateLineSegments(
          segments.flatMap((segment) => [segment.start, segment.end]),
          data.colors ? segments.flatMap((segment) => [segment.startColor!, segment.endColor!]) : undefined
        );
      }
      const needsBlend = segments.some((segment) => (segment.startColor?.[3] ?? 1) < 1 || (segment.endColor?.[3] ?? 1) < 1) ||
        materialRgba(lineNode.material, [1, 1, 1, 1])[3] < 1;
      if (needsBlend !== record.material.renderState.blend) {
        const previous = record.material;
        record.material = lineMaterial(lineNode, ctx, segments, record.label);
        previous.dispose();
      }
      record.lineData = data;
      record.lineSegments = segments;
      record.appliedGeometry = spec;
      if (liveHandle) liveHandle.__parityL2AttributeUpdates = [];
    }
    if (!isVisible(lineNode, handle)) return;
    if ((record.kind === "line" || record.kind === "fat") && record.geometry.drawRange?.count === 0) return;
    const modelMatrix = modelMatrixFor(lineNode, handle);
    if (record.material instanceof ScreenSpaceLineMaterial) {
      const canvas = mountCanvas(ctx);
      record.material.setResolution(Math.max(1, canvas.width ?? 1), Math.max(1, canvas.height ?? 1), canvasDpr(ctx));
      if (record.lineSegments && (!record.lastDistanceMatrix || modelMatrix.some((value, index) => value !== record.lastDistanceMatrix![index]))) {
        record.geometry.updateScreenSpaceLineSegments(withWorldDistances(record.lineSegments, modelMatrix));
        record.lastDistanceMatrix = modelMatrix;
      }
    }
    const materialClipping = materialClippingFor(lineNode, handle);
    out.addItems([
      {
        geometry: record.geometry,
        material: record.material,
        ...(materialClipping ? { materialClipping } : {}),
        modelMatrix,
        ...(record.material instanceof ScreenSpaceLineMaterial ? { frustumCulled: false } : {}),
        label: record.label
      } satisfies RenderItem
    ]);
  },
  dispose(node) {
    const record = lineRecords.get(node);
    if (record) {
      record.dispose();
      lineRecords.delete(node);
    }
  }
};

// ── kind:"points" ───────────────────────────────────────────────────────────

const pointsRecords = new WeakMap<object, ParityRecord>();

export const pointsNodeHandler: NodeHandler<{ readonly kind: "points" }> = {
  kind: "points",
  owner: L6_OWNER,
  flag: L6_FLAG,
  compile(node, ctx, out) {
    assertL6Flag(ctx, "points");
    const n = node as AuraPointsNode;
    const label = `l6.points.${runtimeIdOf(n)}`;
    const positions = normalizeLinePositions(n.positions, 1, `points node "${label}"`);
    if (positions.length === 0) {
      ctx.degrade({ code: "option-ignored", nodeId: runtimeIdOf(n), message: "GEOMETRY_EMPTY: points node has no positions; nothing is drawn" });
      return;
    }
    const hasColors = n.colors !== undefined;
    const geometry = hasColors
      ? vertexColorsGeometry(positions, n.colors!, "points", label)
      : Geometry.points(positions);
    const map = resolveParityMapTexture(n.map, ctx, runtimeIdOf(n), "points.map");
    const rgba = materialRgba(n.material, [1, 1, 1, 1]);
    const material = new UnlitMaterial({
      name: label,
      color: rgba,
      pointSize: n.size ?? 1,
      sizeAttenuation: n.sizeAttenuation !== false,
      alphaTest: n.alphaTest,
      vertexColors: hasColors,
      map: map ? new TextureBinding({ name: "u_pointMap", texture: map }) : undefined,
      renderState: transparentRenderState(n.material, n.transparent)
    });
    pointsRecords.set(node, makeRecord(geometry, material, "points", label));
    out.feature("vfx.parityLines");
  },
  update(node, handle, ctx, out, _timeSeconds) {
    const record = pointsRecords.get(node);
    if (!record) return;
    if (!isVisible(node as AuraPointsNode, handle)) return;
    // A fixed-size point is `size` CSS px, so fold dpr in. An attenuated point scales by
    // 0.5 · render-target height ÷ view depth with that height already in device pixels, so dpr
    // must not be applied a second time: it made attenuated points dpr× too large on retina.
    const n = node as AuraPointsNode;
    const attenuated = n.sizeAttenuation !== false;
    record.material.setParameter("u_pointSize", (n.size ?? 1) * (attenuated ? 1 : canvasDpr(ctx)));
    const materialClipping = materialClippingFor(n, handle);
    out.addItems([
      {
        geometry: record.geometry,
        material: record.material,
        ...(materialClipping ? { materialClipping } : {}),
        modelMatrix: modelMatrixFor(n, handle),
        label: record.label
      } satisfies RenderItem
    ]);
  },
  dispose(node) {
    const record = pointsRecords.get(node);
    if (record) {
      record.dispose();
      pointsRecords.delete(node);
    }
  }
};

// ── kind:"sprite" ───────────────────────────────────────────────────────────

const spriteRecords = new WeakMap<object, ParityRecord>();

export const spriteNodeHandler: NodeHandler<{ readonly kind: "sprite" }> = {
  kind: "sprite",
  owner: L6_OWNER,
  flag: L6_FLAG,
  compile(node, ctx, out) {
    assertL6Flag(ctx, "sprite");
    const n = node as AuraSpriteNode;
    const label = `l6.sprite.${runtimeIdOf(n)}`;
    const geometry = createSpriteQuadGeometry();
    const map = resolveParityMapTexture(n.map, ctx, runtimeIdOf(n), "sprite.map");
    const rgba = materialRgba(n.material, [1, 1, 1, 1]);
    const color = n.color !== undefined ? (colorToLinearRgba(n.color).slice(0, 3) as [number, number, number]) : [rgba[0], rgba[1], rgba[2]] as [number, number, number];
    const material = new UnlitMaterial({
      name: label,
      color: [color[0], color[1], color[2], rgba[3]],
      spriteMode: true,
      spriteCenter: n.center,
      spriteRotation: n.spriteRotation,
      spriteSizeAttenuation: n.sizeAttenuation !== false,
      renderState: transparentRenderState(n.material, undefined)
    });
    // Sprite maps ride the standard baseColor slot (USE_BASE_COLOR_MAP,
    // sampled at v_uv) — never the gl_PointCoord point map.
    if (map) {
      material.setParameter("u_baseColorTexture", new TextureBinding({ name: "u_baseColorMap", texture: map }));
    }
    spriteRecords.set(node, makeRecord(geometry, material, "sprite", label));
    out.feature("vfx.parityLines");
  },
  update(node, handle, ctx, out, _timeSeconds) {
    const record = spriteRecords.get(node);
    if (!record) return;
    if (!isVisible(node as AuraSpriteNode, handle)) return;
    const materialClipping = materialClippingFor(node as AuraSpriteNode, handle);
    out.addItems([
      {
        geometry: record.geometry,
        material: record.material,
        ...(materialClipping ? { materialClipping } : {}),
        modelMatrix: modelMatrixFor(node as AuraSpriteNode, handle),
        label: record.label
      } satisfies RenderItem
    ]);
  },
  dispose(node) {
    const record = spriteRecords.get(node);
    if (record) {
      record.dispose();
      spriteRecords.delete(node);
    }
  }
};

/** L6 handler table entries — imported by `AA/compiler/handlers.ts`. */
export const l6NodeHandlers = {
  line: lineNodeHandler,
  points: pointsNodeHandler,
  sprite: spriteNodeHandler
} as const;
