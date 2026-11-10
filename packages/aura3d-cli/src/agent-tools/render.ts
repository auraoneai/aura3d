// `aura3d render`: build (optional), serve, open the app in headless Chrome and print a compact text (or `--json`) summary:
// subject framing measured with the engine's own `measureFrameFill` on the live camera pose and node bounds, exposure,
// shadows, motion, errors, fps and backend. It is `aura3d verify`'s browser half (same driver, same frame analysis, same
// codes) plus colour and framing metrics; `--url` renders an already running dev server instead of building.
// The PNG is written only with `--screenshot` (alias `--image`): an image costs an agent far more context than the summary,
// and most render calls only need to know "framed, lit, no errors". `--full` prints the full diagnostics report.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { explainCode } from "../verify/codes.js";
import { createChromeCdpDriver, type RenderSceneNodeBox, type RenderSceneProbe, type VerifyBrowserDriver } from "../verify/cdp.js";
import { decodePng, type FrameAnalysis, type RgbImage } from "../verify/frame.js";
import { runVerify, type VerifyFinding, type VerifyReport, type VerifyStep } from "../verify/run.js";
import { optionNumber, optionValue, positionals, type AgentToolIo } from "./shared.js";

export const RENDER_SCHEMA = "aura3d.render/1";
export const RENDER_SUMMARY_SCHEMA = "aura3d.render-summary/1";
export const RENDER_USAGE =
  "aura3d render [projectDir] [--json] [--screenshot|--image] [--out shot.png] [--full] [--no-build] [--url http://127.0.0.1:5173/] [--route /path]\n" +
  "              [--dist dist] [--width N --height N --settle-ms N --ready-timeout-ms N] [--chrome <path>] [--software-gl]\n" +
  "  Builds (unless --no-build or --url), serves dist/, renders the app in headless Chrome and prints a short summary:\n" +
  "  subject framing (engine measureFrameFill on the live camera and node bounds), exposure, shadow, motion, errors, fps, backend,\n" +
  "  and `done` / `next`. Text by default; --json prints the same summary as JSON (stable keys, rounded numbers).\n" +
  "  --screenshot (or --image) also writes the PNG (to --out, default .aura3d/render.png); without it no PNG is written and a\n" +
  "  stale one at that path is removed. --full prints the full diagnostics report (aura3d.render/1) instead of the summary.\n" +
  "  When `done` is true (no errors, subject framed, exposure ok) and `aura3d validate` passes, stop: the scene is finished.\n" +
  "  Exit 0 when no error finding, 1 otherwise, 2 on usage error.";

export interface ColorMetrics {
  /** Mean HSV saturation (0..1) over pixels that are not near-black. */
  readonly meanSaturation: number;
  /** Share of pixels with saturation >= 0.25. */
  readonly saturatedFraction: number;
  readonly meanLuma: number;
  readonly lumaStddev: number;
  /** Share of pixels with luma >= 235 (clipped highlights). */
  readonly clippedFraction: number;
}

export interface SubjectMetrics {
  /** Share of the frame that differs from the border-estimated background. */
  readonly fill: number;
  /** Bounding box of the subject blocks, in 0..1 frame units. */
  readonly bbox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** bbox height / frame height. */
  readonly heightFraction: number;
  /** Background colours estimated from the frame border (1 to 4). */
  readonly background: readonly (readonly [number, number, number])[];
}

export interface RenderReport {
  readonly schema: typeof RENDER_SCHEMA;
  readonly ok: boolean;
  readonly target: string;
  readonly screenshot?: string;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly backend?: string;
  readonly drawCalls?: number;
  readonly frame?: FrameAnalysis;
  readonly color?: ColorMetrics;
  /** Null when the border is not a uniform background (sky gradient, full-bleed scene), so fill cannot be measured this way. */
  readonly subject: SubjectMetrics | null;
  readonly subjectNote?: string;
  readonly motion?: { readonly moved: boolean; readonly changedPixelFraction: number };
  /** Unique finding codes, errors first. */
  readonly codes: readonly string[];
  /** Messages of error findings (console errors, exceptions, failed requests, engine errors). */
  readonly errors: readonly string[];
  readonly findings: readonly VerifyFinding[];
  readonly steps: VerifyReport["steps"];
  readonly counts: VerifyReport["counts"];
  /** Subject framing from the live scene (engine `measureFrameFill`), or from pixels when the page has no live app. */
  readonly framing?: SubjectFraming;
  /** Live scene facts the framing was measured from (fps, backend, shadows); absent without a live app. */
  readonly live?: { readonly fps?: number; readonly backend?: string; readonly shadows?: RenderSceneProbe["shadows"]; readonly pose?: RenderSceneProbe["pose"]; readonly probeError?: string };
  /** The compact, deterministic summary `aura3d render` prints by default. */
  readonly summary: RenderSummary;
}

/** `measureFrameFill(bounds, pose, aspect)` from `@aura3d/engine`. */
export type MeasureFrameFill = (
  bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] },
  pose: { readonly position: readonly [number, number, number]; readonly target: readonly [number, number, number]; readonly fov: number },
  aspect?: number
) => number;

export type FramingVerdict = "framed" | "small" | "cropped" | "off-centre" | "out-of-frame" | "scene-wide" | "unknown";

export interface SubjectFraming {
  readonly verdict: FramingVerdict;
  /** Larger of the subject's projected height / width as a fraction of the frame (the `camera.frame` definition); null when unmeasured. */
  readonly fill: number | null;
  /** Every corner of the subject box projects inside the frame. Null when the camera is inside the box or it was not measured. */
  readonly inFrame: boolean | null;
  readonly centred: boolean | null;
  /** Centre of the projected subject box in frame units (-1..1, +x right, +y up); null when unmeasured. */
  readonly offset: readonly [number, number] | null;
  /** How many visible, non-ground models and primitives make up the subject box. */
  readonly nodes: number | null;
  /** `engine`: `measureFrameFill` on the live pose; `viewProjection`: the live camera matrix; `pixels`: border-background estimate. */
  readonly source: "engine" | "viewProjection" | "pixels" | "none";
}

export type ExposureVerdict = "ok" | "too-dark" | "too-bright" | "unknown";
export type ShadowVerdict = "yes" | "no" | "requested-not-drawn" | "unknown";

/** Deterministic render summary: fixed key order, no timestamps or durations, coarse rounding, so an unchanged static scene prints the same bytes. */
export interface RenderSummary {
  readonly schema: typeof RENDER_SUMMARY_SCHEMA;
  readonly ok: boolean;
  /** No errors, subject framed (or a scene-wide shot), exposure ok: with a passing `aura3d validate`, stop here. */
  readonly done: boolean;
  readonly target: string;
  readonly subject: { readonly framing: FramingVerdict; readonly fillPct: number | null; readonly inFrame: boolean | null; readonly centred: boolean | null; readonly offset: readonly [number, number] | null; readonly nodes: number | null; readonly source: SubjectFraming["source"] };
  readonly exposure: ExposureVerdict;
  readonly luma: { readonly mean: number; readonly p99: number } | null;
  readonly shadow: ShadowVerdict;
  readonly motion: "moving" | "static" | "unknown";
  readonly fps: number | null;
  readonly backend: string | null;
  readonly drawCalls: number | null;
  /** `CODE: message` for every error finding. */
  readonly errors: readonly string[];
  /** `CODE: message` for every warning finding. */
  readonly warnings: readonly string[];
  /** Codes of info findings. */
  readonly notes: readonly string[];
  /** The one next step. */
  readonly next: string;
  /** Present only when the PNG was written (`--screenshot`). */
  readonly screenshot?: string;
}

const round = (v: number, d = 3): number => Math.round(v * 10 ** d) / 10 ** d;

export function colorMetrics(image: RgbImage): ColorMetrics {
  const { rgb } = image;
  const n = image.width * image.height;
  let satSum = 0, satCount = 0, saturated = 0, lumSum = 0, lumSq = 0, clipped = 0;
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3]!, g = rgb[i * 3 + 1]!, b = rgb[i * 3 + 2]!;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumSum += l; lumSq += l * l; if (l >= 235) clipped++;
    if (max >= 20) { const s = (max - min) / max; satSum += s; satCount++; if (s >= 0.25) saturated++; }
  }
  const mean = lumSum / n;
  return {
    meanSaturation: round(satCount ? satSum / satCount : 0), saturatedFraction: round(saturated / n),
    meanLuma: round(mean, 2), lumaStddev: round(Math.sqrt(Math.max(0, lumSq / n - mean * mean)), 2), clippedFraction: round(clipped / n, 4)
  };
}

/**
 * Subject fill against a background estimated from the frame border (outer 4%). The border colours are bucketed (32 levels per
 * channel) and the most common buckets that together cover 85% of the border (at most 4: a backdrop plus a floor, say) are the
 * background. Blocks of 8x8 pixels where at least half the pixels differ from every background colour by more than 30 (max
 * channel) count as subject. Returns null with a reason when 4 buckets cannot cover the border (a sky gradient, a full-bleed
 * scene), because then the estimate would be noise.
 */
export function subjectMetrics(image: RgbImage): { subject: SubjectMetrics | null; note?: string } {
  const { width: w, height: h, rgb } = image;
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.04));
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let samples = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue;
    const i = (y * w + x) * 3, r = rgb[i]!, g = rgb[i + 1]!, b = rgb[i + 2]!;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const cell = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cell.n++; cell.r += r; cell.g += g; cell.b += b; buckets.set(key, cell);
    samples++;
  }
  const ranked = [...buckets.values()].sort((a, b) => b.n - a.n);
  const background: [number, number, number][] = [];
  let covered = 0;
  for (const cell of ranked) {
    if (covered >= samples * 0.85) break;
    // Neighbouring buckets of a gentle gradient fold into an existing background colour.
    const colour: [number, number, number] = [cell.r / cell.n, cell.g / cell.n, cell.b / cell.n];
    if (!background.some((c) => Math.max(Math.abs(c[0] - colour[0]), Math.abs(c[1] - colour[1]), Math.abs(c[2] - colour[2])) <= 12)) {
      if (background.length === 4) break;
      background.push(colour);
    }
    covered += cell.n;
  }
  if (covered < samples * 0.85) return { subject: null, note: `The frame border has no small set of background colours (4 colours cover ${Math.round((covered / Math.max(1, samples)) * 100)}% of it), e.g. a sky gradient or a full-bleed scene; subject fill not measured.` };
  const far = (r: number, g: number, b: number): boolean => background.every((c) => Math.max(Math.abs(r - c[0]), Math.abs(g - c[1]), Math.abs(b - c[2])) > 30);
  const bs = 8;
  let blocks = 0, hits = 0, minX = w, minY = h, maxX = -1, maxY = -1;
  for (let by = 0; by + bs <= h; by += bs) for (let bx = 0; bx + bs <= w; bx += bs) {
    let off = 0;
    for (let y = by; y < by + bs; y++) for (let x = bx; x < bx + bs; x++) { const i = (y * w + x) * 3; if (far(rgb[i]!, rgb[i + 1]!, rgb[i + 2]!)) off++; }
    blocks++;
    if (off * 2 >= bs * bs) { hits++; minX = Math.min(minX, bx); minY = Math.min(minY, by); maxX = Math.max(maxX, bx + bs); maxY = Math.max(maxY, by + bs); }
  }
  const bg = background.map((c) => c.map(Math.round) as [number, number, number]);
  if (hits === 0) return { subject: { fill: 0, bbox: { x: 0, y: 0, width: 0, height: 0 }, heightFraction: 0, background: bg } };
  return {
    subject: {
      fill: round(hits / blocks), heightFraction: round((maxY - minY) / h),
      bbox: { x: round(minX / w), y: round(minY / h), width: round((maxX - minX) / w), height: round((maxY - minY) / h) }, background: bg
    }
  };
}

// ---- framing from the live scene ---------------------------------------------------------------------------------------
type Vec3 = readonly [number, number, number];

/** Same set the engine's scene-wide `camera.frame` leaves out (`isGroundLikeNode` in camera/frameNodes.ts): planes and nodes named like ground or set dressing. */
const GROUND_NAME = /ground|floor|terrain|backdrop|skybox|sea|ocean|\bwalls?\b/i;
export function isGroundLikeBox(node: Pick<RenderSceneNodeBox, "name" | "primitive">): boolean {
  return node.primitive === "plane" || (typeof node.name === "string" && GROUND_NAME.test(node.name));
}

/** A wide, thin slab (a stage, rug or turntable disc under the subject): height under 8% of its larger horizontal side. */
function isFlatSlab(n: RenderSceneNodeBox): boolean {
  const w = n.max[0] - n.min[0], h = n.max[1] - n.min[1], d = n.max[2] - n.min[2];
  return Math.max(w, d) > 0 && h <= 0.08 * Math.max(w, d);
}

/**
 * World box of the subject: the visible models and primitives that are not ground-like (the engine's `camera.frameScene`
 * filter) and not flat slabs, unioned. When only slabs remain they are the subject.
 */
export function subjectBoundsOf(nodes: readonly RenderSceneNodeBox[]): { min: Vec3; max: Vec3; count: number } | undefined {
  const usable = nodes.filter((n) => n.visible && !isGroundLikeBox(n) && [...n.min, ...n.max].every(Number.isFinite));
  const solid = usable.filter((n) => !isFlatSlab(n));
  const pick = solid.length > 0 ? solid : usable;
  if (pick.length === 0) return undefined;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const n of pick) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i]!, n.min[i]!); max[i] = Math.max(max[i]!, n.max[i]!); }
  return { min: min as unknown as Vec3, max: max as unknown as Vec3, count: pick.length };
}

/** Column-major perspective x lookAt for a pose (what the presented camera draws with), for apps that expose no `viewProjection()`. */
export function viewProjectionFromPose(pose: { readonly position: Vec3; readonly target: Vec3; readonly fov: number }, aspect: number): number[] | undefined {
  const z = [pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2]];
  const zl = Math.hypot(z[0]!, z[1]!, z[2]!);
  if (!(zl > 1e-9)) return undefined;
  const zn = [z[0]! / zl, z[1]! / zl, z[2]! / zl];
  let x = [zn[2]!, 0, -zn[0]!]; // cross(up=[0,1,0], z)
  let xl = Math.hypot(x[0]!, x[2]!);
  if (xl < 1e-6) { x = [1, 0, 0]; xl = 1; }
  const xn = [x[0]! / xl, x[1]! / xl, x[2]! / xl];
  const yn = [zn[1]! * xn[2]! - zn[2]! * xn[1]!, zn[2]! * xn[0]! - zn[0]! * xn[2]!, zn[0]! * xn[1]! - zn[1]! * xn[0]!];
  const p = pose.position;
  const dot = (a: number[], b: Vec3) => a[0]! * b[0] + a[1]! * b[1] + a[2]! * b[2];
  const view = [xn[0]!, yn[0]!, zn[0]!, 0, xn[1]!, yn[1]!, zn[1]!, 0, xn[2]!, yn[2]!, zn[2]!, 0, -dot(xn, p), -dot(yn, p), -dot(zn, p), 1];
  const f = 1 / Math.tan((pose.fov * Math.PI) / 360), near = 0.01, far = 1e5;
  const proj = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r]! += proj[k * 4 + r]! * view[c * 4 + k]!;
  return out;
}

/** Project the 8 box corners through a column-major view-projection matrix; null when any corner is behind the camera. */
function projectBox(box: { min: Vec3; max: Vec3 }, m: readonly number[]): { minX: number; maxX: number; minY: number; maxY: number } | null {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const x of [box.min[0], box.max[0]]) for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) {
    const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
    if (!(w > 1e-6)) return null;
    const nx = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w;
    const ny = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w;
    minX = Math.min(minX, nx); maxX = Math.max(maxX, nx); minY = Math.min(minY, ny); maxY = Math.max(maxY, ny);
  }
  return { minX, maxX, minY, maxY };
}

const SCENE_WIDE_NODES = 8;

function framingVerdict(fill: number | null, inFrame: boolean | null, centred: boolean | null, nodes: number): FramingVerdict {
  if (fill === null) return "unknown";
  // Many pieces spread wider than the frame, or a camera inside the box: an environment or flythrough, not one subject.
  if (inFrame === null || (fill > 1.2 && nodes >= SCENE_WIDE_NODES)) return "scene-wide";
  if (fill > 1.05) return "cropped";
  if (inFrame === false) return fill < 0.2 ? "out-of-frame" : "cropped";
  if (fill < 0.2) return "small";
  if (centred === false) return "off-centre";
  return "framed";
}

/**
 * Framing of the live scene's subject: `measureFrameFill` (the engine's `camera.frame` definition: larger of projected height /
 * width fraction) on the presented camera pose, plus in-frame / centring from the live view-projection matrix. Null when the
 * probe has no pose or no spatial nodes.
 */
export function measureSubjectFraming(probe: RenderSceneProbe | null | undefined, viewport: { readonly width: number; readonly height: number }, engine?: MeasureFrameFill | EngineFramingTools | null): SubjectFraming | null {
  const tools: EngineFramingTools | null = typeof engine === "function" ? { measureFrameFill: engine } : engine ?? null;
  const measureFrameFill = tools?.measureFrameFill;
  const boxes = [...(probe?.nodes ?? []), ...(tools?.worldBounds && probe?.sceneNodes ? sceneNodeBoxes(probe.sceneNodes, tools.worldBounds) : [])];
  if (!probe || boxes.length === 0) return null;
  const box = subjectBoundsOf(boxes);
  if (!box) return { verdict: "unknown", fill: null, inFrame: null, centred: null, offset: null, nodes: 0, source: "none" };
  const aspect = viewport.width / Math.max(1, viewport.height);
  const matrix = probe.viewProjection?.length === 16 ? probe.viewProjection : probe.pose ? viewProjectionFromPose(probe.pose, aspect) : undefined;
  const projected = matrix ? projectBox(box, matrix) : undefined;
  let fill: number | null = null;
  let source: SubjectFraming["source"] = "none";
  if (probe.pose && measureFrameFill) {
    try { const f = measureFrameFill(box, probe.pose, aspect); if (Number.isFinite(f)) { fill = f; source = "engine"; } } catch { /* fall through to the matrix */ }
  }
  if (fill === null && projected) { fill = Math.max((projected.maxX - projected.minX) / 2, (projected.maxY - projected.minY) / 2); source = "viewProjection"; }
  if (fill === null && !projected) return { verdict: matrix ? "scene-wide" : "unknown", fill: null, inFrame: null, centred: null, offset: null, nodes: box.count, source: "none" };
  let inFrame: boolean | null = null, centred: boolean | null = null, offset: readonly [number, number] | null = null;
  if (projected) {
    const tol = 0.02;
    inFrame = projected.minX >= -1 - tol && projected.maxX <= 1 + tol && projected.minY >= -1 - tol && projected.maxY <= 1 + tol;
    offset = [(projected.minX + projected.maxX) / 2, (projected.minY + projected.maxY) / 2];
    centred = Math.abs(offset[0]) <= 0.25 && Math.abs(offset[1]) <= 0.3;
  }
  return { verdict: framingVerdict(fill, inFrame, centred, box.count), fill, inFrame, centred, offset, nodes: box.count, source };
}

/** Framing from the pixel subject estimate when the page exposes no live app (bbox in 0..1 frame units, y down). */
export function framingFromPixels(subject: SubjectMetrics | null): SubjectFraming {
  if (!subject || subject.fill === 0) return { verdict: "unknown", fill: null, inFrame: null, centred: null, offset: null, nodes: null, source: subject ? "pixels" : "none" };
  const { x, y, width, height } = subject.bbox;
  const fill = Math.max(width, height);
  const edge = 0.01;
  const inFrame = x > edge && y > edge && x + width < 1 - edge && y + height < 1 - edge;
  const offset: [number, number] = [(x + width / 2) * 2 - 1, 1 - (y + height / 2) * 2];
  const centred = Math.abs(offset[0]) <= 0.25 && Math.abs(offset[1]) <= 0.3;
  // A box touching the border may just be a subject that fills the frame; only call it cropped when it is also large.
  const verdict: FramingVerdict = fill < 0.2 ? "small" : !inFrame && fill > 0.9 ? "cropped" : !centred ? "off-centre" : "framed";
  return { verdict, fill, inFrame, centred, offset, nodes: null, source: "pixels" };
}

/** The engine's framing maths, loaded from the project's own `@aura3d/engine`. */
export interface EngineFramingTools {
  readonly measureFrameFill: MeasureFrameFill;
  /** `camera.worldBounds(node)`: the world box `camera.frame` uses (size, scale, rotation, model fit, groups, instances). */
  readonly worldBounds?: (subject: unknown) => { readonly min: Vec3; readonly max: Vec3 };
}

/** Per top-level snapshot node, the engine's own world box (`camera.worldBounds`); nodes that occupy no space are skipped. */
export function sceneNodeBoxes(sceneNodes: readonly unknown[], worldBounds: NonNullable<EngineFramingTools["worldBounds"]>): RenderSceneNodeBox[] {
  const out: RenderSceneNodeBox[] = [];
  sceneNodes.forEach((raw, index) => {
    const node = raw as { kind?: string; name?: string; primitive?: string; visible?: boolean; runtime?: { id?: string } };
    if (!node || typeof node !== "object" || node.kind === "light" || node.kind === "environment" || node.kind === "interaction" || node.kind === "effect") return;
    try {
      const b = worldBounds(node);
      if (!b || ![...b.min, ...b.max].every(Number.isFinite)) return;
      out.push({ id: node.runtime?.id ?? `${node.kind ?? "node"}-${index}`, kind: String(node.kind ?? "node"), ...(node.name ? { name: node.name } : {}), ...(node.primitive ? { primitive: node.primitive } : {}), visible: node.visible !== false, min: b.min, max: b.max });
    } catch { /* not spatial, or a shape the engine cannot bound offline */ }
  });
  return out;
}

const engineCache = new Map<string, EngineFramingTools | null>();

/** `measureFrameFill` and `camera.worldBounds` from the project's installed `@aura3d/engine` (pure maths; the import takes about 0.4 s). Null when not installed. */
export async function loadEngineFraming(projectDir: string): Promise<EngineFramingTools | null> {
  const key = resolve(projectDir);
  if (engineCache.has(key)) return engineCache.get(key)!;
  let tools: EngineFramingTools | null = null;
  try {
    const entry = createRequire(join(key, "package.json")).resolve("@aura3d/engine");
    const mod = (await import(pathToFileURL(entry).href)) as { measureFrameFill?: MeasureFrameFill; camera?: { worldBounds?: EngineFramingTools["worldBounds"] } };
    if (typeof mod.measureFrameFill === "function") {
      const wb = mod.camera?.worldBounds;
      tools = { measureFrameFill: mod.measureFrameFill, ...(typeof wb === "function" ? { worldBounds: (subject: unknown) => wb(subject) } : {}) };
    }
  } catch { tools = null; }
  engineCache.set(key, tools);
  return tools;
}

// ---- summary -----------------------------------------------------------------------------------------------------------
const step = (v: number, unit: number): number => Math.round(Math.round(v / unit) * unit * 1000) / 1000;
/** Absolute served origins (random port) and long numbers make repeated renders differ; strip them. */
const stableText = (text: string): string => text.replace(/https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+/g, "").replace(/\s+/g, " ").trim().slice(0, 240);

export function exposureVerdict(frame: FrameAnalysis | undefined, color: ColorMetrics | undefined, codes: readonly string[]): ExposureVerdict {
  if (!frame || !color) return "unknown";
  if (frame.black || frame.dim || color.meanLuma < 28) return "too-dark";
  if (codes.includes("RENDER_WASHED_OUT") || (color.meanLuma >= 225 && color.lumaStddev < 25)) return "too-bright";
  return "ok";
}

export function shadowVerdict(shadows: RenderSceneProbe["shadows"] | undefined): ShadowVerdict {
  if (!shadows) return "unknown";
  if ((shadows.sampledLights ?? 0) > 0 || shadows.contact === true) return "yes";
  if (shadows.declaredLights > 0) return shadows.sampledLights === undefined && shadows.contact === undefined ? "yes" : "requested-not-drawn";
  return shadows.sampledLights === undefined && shadows.contact === undefined ? "unknown" : "no";
}

function nextStep(s: Omit<RenderSummary, "next" | "done" | "schema" | "screenshot">, done: boolean): string {
  if (s.errors.length > 0) return `Fix ${s.errors[0]!.split(":")[0]} first, then render again.`;
  if (s.exposure === "too-dark") return "Frame too dark: add a key light (lights.directional or lights.key) or a looks.preset, then render again.";
  if (s.exposure === "too-bright") return "Frame washed out: lower ambient/hemisphere or fog, or use a look with a grade, then render again.";
  const fill = s.subject.fillPct;
  switch (s.subject.framing) {
    case "small": return `Subject fills ${fill}% of the frame: use camera.frame(subject, { fill: 0.6 }) or move the camera closer.`;
    case "cropped": return `Subject is cropped (${fill}% fill): use camera.frame(subject, { fill: 0.6 }) or move the camera back.`;
    case "out-of-frame": return "Subject is outside the frame: aim the camera target at it or use camera.frame(subject).";
    case "off-centre": return "Subject is off-centre: set the camera target to the subject centre or use camera.frame(subject).";
    default: break;
  }
  if (done) return "Done: no errors, subject framed, exposure ok. If `aura3d validate` passes, stop and finish; do not keep polishing.";
  return "Check the warnings; if they are expected for this scene and `aura3d validate` passes, stop.";
}

/** Build the deterministic summary from a full report. */
export function summarizeRender(report: Omit<RenderReport, "summary">): RenderSummary {
  const framing = report.framing ?? framingFromPixels(report.subject);
  const pick = (severity: VerifyFinding["severity"]) => report.findings.filter((f) => f.severity === severity);
  const uniq = (list: string[]) => [...new Set(list)];
  const fps = report.live?.fps;
  const base = {
    ok: report.ok,
    target: report.target,
    subject: {
      framing: framing.verdict,
      fillPct: framing.fill === null ? null : Math.round(step(framing.fill, 0.05) * 100),
      inFrame: framing.inFrame,
      centred: framing.centred,
      offset: framing.offset ? ([step(framing.offset[0], 0.05), step(framing.offset[1], 0.05)] as const) : null,
      nodes: framing.nodes,
      source: framing.source
    },
    exposure: exposureVerdict(report.frame, report.color, report.codes),
    luma: report.frame ? { mean: Math.round(report.frame.meanLuma), p99: Math.round(report.frame.p99Luma) } : null,
    shadow: shadowVerdict(report.live?.shadows),
    motion: report.motion ? (report.motion.moved ? "moving" as const : "static" as const) : "unknown" as const,
    fps: fps === undefined ? null : Math.round(fps / 10) * 10,
    backend: report.live?.backend ?? report.backend ?? null,
    drawCalls: report.drawCalls ?? null,
    errors: uniq(pick("error").map((f) => `${f.code}: ${stableText(f.message)}`)),
    warnings: uniq(pick("warning").map((f) => `${f.code}: ${stableText(f.message)}`)),
    notes: uniq(pick("info").map((f) => f.code))
  };
  const framedEnough = framing.verdict === "framed" || framing.verdict === "scene-wide" || (framing.verdict === "unknown" && !!report.frame?.drawn);
  const done = report.ok && base.errors.length === 0 && base.exposure === "ok" && framedEnough;
  return { schema: RENDER_SUMMARY_SCHEMA, ...base, done, next: nextStep(base, done), ...(report.screenshot ? { screenshot: report.screenshot } : {}) };
}

/** Short text form of the summary (what `aura3d render` prints without --json). */
export function formatRenderSummary(s: RenderSummary): string {
  const sub = s.subject;
  const where = sub.fillPct === null ? "" : `, ${sub.fillPct}% of frame${sub.inFrame === false ? ", partly outside" : ""}${sub.centred === false ? ", off-centre" : sub.centred ? ", centred" : ""}`;
  const lines = [
    `aura3d render: ${s.ok ? "PASS" : "FAIL"} ${s.target}${s.done ? "  done" : ""} (${s.errors.length} error, ${s.warnings.length} warning)`,
    `  subject: ${sub.framing}${where}${sub.source === "none" ? "" : ` (${sub.source === "engine" ? "engine measureFrameFill" : sub.source}${sub.nodes ? `, ${sub.nodes} node${sub.nodes === 1 ? "" : "s"}` : ""})`}`,
    `  exposure: ${s.exposure}${s.luma ? ` (mean luma ${s.luma.mean}, p99 ${s.luma.p99})` : ""}   shadow: ${s.shadow}   motion: ${s.motion}`,
    `  ${s.backend ?? "?"}, ${s.drawCalls ?? "?"} draw calls${s.fps === null ? "" : `, ~${s.fps} fps`}`
  ];
  if (s.screenshot) lines.push(`  screenshot: ${s.screenshot}`);
  for (const e of s.errors) lines.push(`  error ${e}`);
  for (const w of s.warnings) lines.push(`  warning ${w}`);
  if (s.notes.length) lines.push(`  notes: ${s.notes.join(", ")}`);
  lines.push(`  next: ${s.next}`);
  return lines.join("\n");
}

function extraFinding(code: string, message: string, evidence: Record<string, unknown>): VerifyFinding {
  const entry = explainCode(code)!;
  return { code, severity: entry.severity, step: entry.step, message, cause: entry.cause, fix: entry.fix, evidence };
}

export interface RenderOptions {
  readonly projectDir: string;
  readonly out?: string;
  /** Write the PNG (to `out`, default `.aura3d/render.png`). Default true for API callers; the CLI passes false unless `--screenshot`. */
  readonly screenshot?: boolean;
  readonly build?: boolean;
  readonly url?: string;
  readonly route?: string;
  readonly distDir?: string;
  readonly width?: number;
  readonly height?: number;
  readonly settleMs?: number;
  readonly readyTimeoutMs?: number;
  readonly chromePath?: string;
  readonly softwareGl?: boolean;
  readonly driver?: VerifyBrowserDriver;
  readonly runCommand?: Parameters<typeof runVerify>[0]["runCommand"];
  /** Framing maths; default: `measureFrameFill` + `camera.worldBounds` from the project's installed `@aura3d/engine`. `null` skips it (live boxes and matrix only). */
  readonly measureFrameFill?: MeasureFrameFill | EngineFramingTools | null;
}

export async function runRender(options: RenderOptions): Promise<RenderReport> {
  const projectDir = resolve(options.projectDir);
  const framesDir = mkdtempSync(join(tmpdir(), "aura3d-render-"));
  const skip: VerifyStep[] = ["typecheck", "assets", "lint"];
  if (options.build === false || options.url) skip.push("build");
  const writeShot = options.screenshot !== false;
  const shotPath = resolve(projectDir, options.out ?? join(".aura3d", "render.png"));
  // Keep the live scene probe the driver reads right after the first frame (verify's own report does not carry it).
  const inner = options.driver ?? createChromeCdpDriver({ ...(options.chromePath ? { chromePath: options.chromePath } : {}), ...(options.softwareGl ? { softwareGl: true } : {}) });
  let probe: RenderSceneProbe | null | undefined;
  const driver: VerifyBrowserDriver = { name: inner.name, close: () => inner.close(), capture: async (url, o) => { const c = await inner.capture(url, o); probe = c.scene; return c; } };
  try {
    const report = await runVerify({
      projectDir, skip, framesDir, driver,
      ...(options.url ? { url: options.url } : {}), ...(options.route ? { route: options.route } : {}), ...(options.distDir ? { distDir: options.distDir } : {}),
      ...(options.width ? { width: options.width } : {}), ...(options.height ? { height: options.height } : {}),
      ...(options.settleMs !== undefined ? { settleMs: options.settleMs } : {}), ...(options.readyTimeoutMs !== undefined ? { readyTimeoutMs: options.readyTimeoutMs } : {}),
      ...(options.runCommand ? { runCommand: options.runCommand } : {})
    });
    const findings: VerifyFinding[] = [...report.findings];
    let screenshot: string | undefined;
    let color: ColorMetrics | undefined;
    let subject: SubjectMetrics | null = null;
    let subjectNote: string | undefined;
    const first = report.render?.frames?.[0];
    if (!writeShot && /\.png$/i.test(shotPath) && existsSync(shotPath)) {
      // A PNG left by an earlier `--screenshot` run would describe an old frame; nothing at this path may outlive its render.
      rmSync(shotPath, { force: true });
    }
    if (first && existsSync(join(framesDir, first))) {
      const framePath = join(framesDir, first);
      if (writeShot) {
        screenshot = shotPath;
        mkdirSync(dirname(screenshot), { recursive: true });
        copyFileSync(framePath, screenshot);
      }
      const image = decodePng(readFileSync(framePath));
      color = colorMetrics(image);
      const measured = subjectMetrics(image);
      subject = measured.subject;
      subjectNote = measured.note;
      const drawn = report.render?.frame?.drawn ?? false;
      if (drawn && color.meanSaturation < 0.12 && color.meanLuma > 140 && color.lumaStddev < 40) {
        findings.push(extraFinding("RENDER_WASHED_OUT", `Mean saturation ${color.meanSaturation} at mean luma ${color.meanLuma} with luma spread ${color.lumaStddev}: the frame reads grey, bright and low-contrast.`, { ...color }));
      }
      // A small subject on a plain background often fails the "drawn" texture threshold (FRAME_EMPTY), so only black and flat frames are excluded here.
      const visible = !!report.render?.frame && !report.render.frame.black && !report.render.frame.flat;
      if (visible && subject && subject.fill > 0 && subject.heightFraction < 0.25 && subject.fill < 0.08) {
        findings.push(extraFinding("RENDER_SUBJECT_SMALL", `The subject covers ${Math.round(subject.fill * 100)}% of the frame and ${Math.round(subject.heightFraction * 100)}% of its height.`, { ...subject }));
      }
    }
    const viewport = report.render?.viewport ?? { width: options.width ?? 960, height: options.height ?? 540 };
    let framing: SubjectFraming | undefined;
    if (probe && ((probe.nodes?.length ?? 0) > 0 || (probe.sceneNodes?.length ?? 0) > 0)) {
      const tools = options.measureFrameFill === undefined ? await loadEngineFraming(projectDir) : options.measureFrameFill;
      framing = measureSubjectFraming(probe, viewport, tools) ?? undefined;
    }
    const counts = { error: 0, warning: 0, info: 0 };
    for (const f of findings) counts[f.severity]++;
    const order = { error: 0, warning: 1, info: 2 } as const;
    const codes = [...new Set([...findings].sort((a, b) => order[a.severity] - order[b.severity]).map((f) => f.code))];
    const live = probe ? {
      ...(probe.fps !== undefined ? { fps: probe.fps } : {}), ...(probe.backend ? { backend: probe.backend } : {}),
      ...(probe.shadows ? { shadows: probe.shadows } : {}), ...(probe.pose ? { pose: probe.pose } : {}), ...(probe.error ? { probeError: probe.error } : {})
    } : undefined;
    const full: Omit<RenderReport, "summary"> = {
      schema: RENDER_SCHEMA,
      ok: counts.error === 0,
      target: options.url ?? `${basename(projectDir)}${options.route ?? "/"}`,
      ...(screenshot ? { screenshot } : {}),
      ...(report.render ? { viewport: report.render.viewport } : {}),
      ...(report.render?.backend ? { backend: report.render.backend } : {}),
      ...(report.render?.drawCalls !== undefined ? { drawCalls: report.render.drawCalls } : {}),
      ...(report.render?.frame ? { frame: report.render.frame } : {}),
      ...(color ? { color } : {}),
      subject,
      ...(subjectNote ? { subjectNote } : {}),
      ...(report.render?.motion ? { motion: { moved: report.render.motion.moved, changedPixelFraction: report.render.motion.changedPixelFraction } } : {}),
      codes,
      errors: findings.filter((f) => f.severity === "error").map((f) => `${f.code}: ${f.message}`),
      findings,
      steps: report.steps,
      counts,
      ...(framing ? { framing } : {}),
      ...(live ? { live } : {})
    };
    return { ...full, summary: summarizeRender(full) };
  } finally {
    rmSync(framesDir, { recursive: true, force: true });
  }
}

export function formatRender(report: RenderReport): string {
  const lines = [`aura3d render: ${report.ok ? "PASS" : "FAIL"} ${report.target} (${report.counts.error} error, ${report.counts.warning} warning)`];
  if (report.screenshot) lines.push(`  screenshot: ${report.screenshot}`);
  if (report.framing) lines.push(`  framing: ${report.framing.verdict}${report.framing.fill === null ? "" : `, fill ${report.framing.fill.toFixed(2)}`} (${report.framing.source})`);
  if (report.backend || report.drawCalls !== undefined) lines.push(`  backend ${report.backend ?? "?"}, ${report.drawCalls ?? "?"} draw calls`);
  if (report.frame) lines.push(`  frame: mean luma ${report.frame.meanLuma}, p99 ${report.frame.p99Luma}, ${report.frame.distinctColors} colours, ${(report.frame.texturedBlockFraction * 100).toFixed(1)}% textured${report.frame.drawn ? "" : `  (${report.frame.reasons.join("; ")})`}`);
  if (report.color) lines.push(`  colour: mean saturation ${report.color.meanSaturation}, ${(report.color.saturatedFraction * 100).toFixed(1)}% saturated, ${(report.color.clippedFraction * 100).toFixed(2)}% clipped`);
  if (report.subject) lines.push(`  subject: ${(report.subject.fill * 100).toFixed(1)}% of frame, ${(report.subject.heightFraction * 100).toFixed(0)}% of height, bbox x ${report.subject.bbox.x} y ${report.subject.bbox.y} w ${report.subject.bbox.width} h ${report.subject.bbox.height}`);
  else if (report.subjectNote) lines.push(`  subject: ${report.subjectNote}`);
  if (report.motion) lines.push(`  motion: ${report.motion.moved ? "moving" : "static"} (${(report.motion.changedPixelFraction * 100).toFixed(2)}% pixels changed)`);
  for (const step of report.steps) if (step.status !== "skipped") lines.push(`  ${step.status.padEnd(7)} ${step.id}${step.detail ? `  (${step.detail})` : ""}`);
  for (const f of report.findings) lines.push(`${f.severity.toUpperCase().padEnd(7)} ${f.code}`, `        ${f.message}`, `        fix: ${f.fix}`);
  return lines.join("\n");
}

export async function renderCommand(argv: readonly string[], io: AgentToolIo, injected?: { driver?: VerifyBrowserDriver; runCommand?: RenderOptions["runCommand"]; measureFrameFill?: RenderOptions["measureFrameFill"] }): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) { io.stdout(RENDER_USAGE); return 0; }
  const valueFlags = new Set(["--out", "--url", "--route", "--dist", "--width", "--height", "--settle-ms", "--ready-timeout-ms", "--chrome"]);
  // The PNG is opt-in: an image in an agent's context costs far more than the summary. AURA3D_RENDER_SCREENSHOT=1 restores the old default.
  const screenshot = argv.includes("--screenshot") || argv.includes("--image") || process.env.AURA3D_RENDER_SCREENSHOT === "1";
  let report: RenderReport;
  try {
    const url = optionValue(argv, "--url");
    if (url && !/^https?:\/\//.test(url)) { io.stderr("--url needs an http(s) URL, for example http://127.0.0.1:5173/"); return 2; }
    report = await runRender({
      projectDir: resolve(io.cwd, positionals(argv, valueFlags)[0] ?? "."),
      build: !argv.includes("--no-build"),
      screenshot,
      ...(optionValue(argv, "--out") ? { out: resolve(io.cwd, optionValue(argv, "--out")!) } : {}),
      ...(url ? { url } : {}),
      ...(optionValue(argv, "--route") ? { route: optionValue(argv, "--route")! } : {}),
      ...(optionValue(argv, "--dist") ? { distDir: optionValue(argv, "--dist")! } : {}),
      ...(optionNumber(argv, "--width") ? { width: optionNumber(argv, "--width")! } : {}),
      ...(optionNumber(argv, "--height") ? { height: optionNumber(argv, "--height")! } : {}),
      ...(optionNumber(argv, "--settle-ms") !== undefined ? { settleMs: optionNumber(argv, "--settle-ms")! } : {}),
      ...(optionNumber(argv, "--ready-timeout-ms") !== undefined ? { readyTimeoutMs: optionNumber(argv, "--ready-timeout-ms")! } : {}),
      ...(optionValue(argv, "--chrome") ? { chromePath: optionValue(argv, "--chrome")! } : {}),
      ...(argv.includes("--software-gl") ? { softwareGl: true } : {}),
      ...(injected?.driver ? { driver: injected.driver } : {}),
      ...(injected?.runCommand ? { runCommand: injected.runCommand } : {}),
      ...(injected?.measureFrameFill !== undefined ? { measureFrameFill: injected.measureFrameFill } : {})
    });
  } catch (error) { io.stderr(String((error as Error).message ?? error)); return 2; }
  const json = argv.includes("--json");
  if (argv.includes("--full")) io.stdout(json ? JSON.stringify(report, null, 2) : formatRender(report));
  else io.stdout(json ? JSON.stringify(report.summary) : formatRenderSummary(report.summary));
  return report.ok ? 0 : 1;
}
