/**
 * Real bindings for the screening pipeline's injected effects.
 *
 * ## Why this file exists separately from the pipeline
 *
 * `asset-screening-pipeline.ts` owns *ordering and record-keeping* and takes every external effect as an
 * injected function. That separation is what makes the part that historically failed -- running the steps
 * in order and keeping every rejection reason -- testable offline. But an orchestrator with no real
 * bindings is a library nobody can run: the previous state of this work had 38 passing tests against
 * injected fakes and no way to actually screen a candidate.
 *
 * This module supplies the production wiring: catalog search, download, and structural geometry
 * inspection read from the pulled file. It deliberately does **not** supply a render probe by default.
 *
 * ## Why no default render probe
 *
 * Rendering requires a browser (Playwright) and a dev server. Importing that here would make the CLI
 * package depend on the test harness, and worse, it would tempt a caller into fabricating a "rendered"
 * verdict from geometry when no browser is present. Omitting `renderProbe` means admission reports
 * rendered visibility as `unproven` rather than passing -- the honest outcome, and the one the whole
 * investigation was about. A caller with a working harness injects it explicitly.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defaultDownloadFile, runSearch } from "./pull-bridge.js";
import type { AssetGeometryFacts } from "./asset-role-admission.js";
import type {
  ScreeningCandidate,
  ScreeningEffects,
  ScreeningPullResult,
  ScreeningRenderCost
} from "./asset-screening-pipeline.js";

export interface ScreeningEffectsOptions {
  /** Repository/project root, used for durable staging when registering. */
  readonly projectDir?: string | undefined;
  /** Directory pulled candidates are downloaded into. Defaults to a fresh temp directory. */
  readonly stagingDir?: string | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  /** Candidates requested per query. */
  readonly searchLimit?: number | undefined;
  /**
   * Optional render probe. Supply one only when a real browser harness is available.
   *
   * When omitted, admission correctly reports rendered visibility as `unproven`.
   *
   * This is a capability boundary, not a gap: geometry must never stand in for a rendered verdict.
   */
  readonly renderProbe?: ScreeningEffects["renderProbe"] | undefined;
  /** Optional registration step, so a screening run can end in a typed asset. */
  readonly register?: ScreeningEffects["register"] | undefined;
}

/**
 * Build production screening effects.
 *
 * Search failures propagate as thrown errors so the pipeline records them per query rather than treating
 * an outage as "no candidates exist" -- a distinction that cost a whole pass when I concluded the catalog
 * was empty without having searched it.
 */
export function createScreeningEffects(options: ScreeningEffectsOptions = {}): ScreeningEffects {
  const staging = options.stagingDir
    ? (mkdirSync(options.stagingDir, { recursive: true }), options.stagingDir)
    : mkdtempSync(join(tmpdir(), "aura3d-screening-"));

  return {
    async search(query) {
      const report = await runSearch({
        query,
        ...(options.env ? { env: options.env } : {}),
        limit: options.searchLimit ?? 10
      });
      // Rejected candidates are deliberately included: the pipeline's own licence/pullability gates decide
      // and record why each one fails. Filtering them here would discard exactly the reasons that make a
      // screening report reviewable.
      return [...report.candidates, ...report.rejectedCandidates].map(toScreeningCandidate);
    },

    async pull(candidate) {
      const url = candidate.downloadUrl;
      if (!url) throw new Error("candidate has no download URL");
      // Content-addressed by id so a re-pull of the same candidate is idempotent within a run.
      const safeName = candidate.id.replace(/[^a-zA-Z0-9_-]+/g, "_");
      const destination = join(staging, `${safeName}.glb`);
      if (existsSync(destination)) {
        return { localPath: destination, sizeBytes: statSync(destination).size };
      }
      const result = await defaultDownloadFile(url, destination);
      const localPath = result?.path ?? destination;
      if (!existsSync(localPath)) throw new Error(`download produced no file at ${localPath}`);
      return { localPath, sizeBytes: statSync(localPath).size };
    },

    async inspectGeometry(_candidate, pull) {
      return inspectGlbGeometry(pull.localPath);
    },

    ...(options.renderProbe ? { renderProbe: options.renderProbe } : {}),
    ...(options.register ? { register: options.register } : {})
  };
}

/**
 * Structural geometry facts read directly from a GLB.
 *
 * This is the same measurement the standalone auditor performs, expressed in the admission vocabulary. It
 * reads accessor min/max composed through the node hierarchy rather than trusting any manifest metadata,
 * because the whole point of screening is to judge a file that is not registered yet.
 */
export function inspectGlbGeometry(file: string): AssetGeometryFacts & ScreeningRenderCost {
  const json = readGlbJson(file);
  const parts = collectNodeWorldBounds(json);
  const sizeBytes = statSync(file).size;

  if (parts.length === 0) {
    return { partCount: 0, triangles: 0, bounds: [0, 0, 0], materialCount: 0, textureCount: 0, drawCallsPerInstance: 0, sizeBytes } as AssetGeometryFacts & ScreeningRenderCost;
  }

  const lo = [0, 1, 2].map((axis) => Math.min(...parts.map((part) => part.lo[axis]!)));
  const hi = [0, 1, 2].map((axis) => Math.max(...parts.map((part) => part.hi[axis]!)));
  const size: readonly [number, number, number] = [hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!];
  const triangles = parts.reduce((sum, part) => sum + part.triangles, 0);

  const lengthAxis = size[0] >= size[2] ? 0 : 2;
  const widthAxis = lengthAxis === 0 ? 2 : 0;

  // Wheel-like parts: roughly circular in side profile, low-mounted, plausibly sized. Mirrors the
  // standalone auditor's heuristic, because a second heuristic would let the two disagree.
  const wheelParts = parts.filter((part) => {
    const extent = [part.hi[0]! - part.lo[0]!, part.hi[1]! - part.lo[1]!, part.hi[2]! - part.lo[2]!];
    if (Math.min(...extent) <= 0) return false;
    const topFraction = (part.hi[1]! - lo[1]!) / Math.max(size[1], 1e-9);
    if (topFraction > 0.55) return false;
    const height = extent[1]!;
    const length = extent[lengthAxis]!;
    const width = extent[widthAxis]!;
    if (Math.min(height, length) / Math.max(height, length) < 0.55) return false;
    if (width > Math.max(height, length) * 1.25) return false;
    const relative = Math.max(height, length) / Math.max(size[1], 1e-9);
    return relative > 0.12 && relative < 0.75;
  });

  const midLength = (lo[lengthAxis]! + hi[lengthAxis]!) / 2;
  const midWidth = (lo[widthAxis]! + hi[widthAxis]!) / 2;
  const corners = new Set(wheelParts.map((part) => {
    const alongLength = (part.lo[lengthAxis]! + part.hi[lengthAxis]!) / 2 > midLength ? "f" : "r";
    const alongWidth = (part.lo[widthAxis]! + part.hi[widthAxis]!) / 2 > midWidth ? "l" : "r";
    return `${alongLength}${alongWidth}`;
  }));

  const bodyHalfWidth = Math.max(Math.abs(lo[widthAxis]!), Math.abs(hi[widthAxis]!));
  const wheelHalfWidth = wheelParts.reduce(
    (widest, part) => Math.max(widest, Math.abs(part.lo[widthAxis]!), Math.abs(part.hi[widthAxis]!)),
    0
  );
  const wheelsVisibleInSilhouette = wheelParts.length > 0 &&
    wheelHalfWidth >= bodyHalfWidth - Math.max(size[widthAxis] * 0.02, 1e-6);

  /*
   * Per-instance draw cost, approximated as primitives x materials-in-use.
   *
   * This axis exists because a triangle budget missed a real regression: a 4.6MB pine cluster rendered
   * correctly in isolation but carried 42 nodes and 5 materials per instance, driving a route to 840 draw
   * calls and a blank capture.
   */
  const primitiveCount = parts.reduce((sum, part) => sum + part.primitiveCount, 0);
  const materialCount = (json.materials ?? []).length;
  const textureCount = (json.textures ?? []).length;

  return {
    partCount: parts.length,
    triangles,
    bounds: size,
    materialCount,
    textureCount,
    wheelCandidates: wheelParts.length,
    distinctWheelCorners: corners.size,
    wheelsVisibleInSilhouette,
    wheelHalfWidth,
    bodyHalfWidth,
    minY: lo[1]!,
    drawCallsPerInstance: primitiveCount,
    sizeBytes
  } as AssetGeometryFacts & ScreeningRenderCost;
}

/** Map a catalog search line into the pipeline's candidate shape. */
function toScreeningCandidate(line: {
  readonly id: string;
  readonly source: string;
  readonly title: string;
  readonly license: string;
  readonly autoPullable: boolean;
  readonly sourcePage?: string | undefined;
  readonly downloadUrl?: string | undefined;
  readonly author?: string | undefined;
}): ScreeningCandidate {
  return {
    id: line.id,
    title: line.title,
    provider: line.source,
    licenseSpdx: line.license,
    autoPullable: line.autoPullable,
    ...(line.sourcePage ? { sourcePage: line.sourcePage } : {}),
    ...(line.downloadUrl ? { downloadUrl: line.downloadUrl } : {}),
    ...(line.author ? { author: line.author } : {})
  };
}

interface GlbJson {
  readonly nodes?: readonly GlbNode[];
  readonly meshes?: readonly { readonly primitives?: readonly GlbPrimitive[] }[];
  readonly accessors?: readonly { readonly min?: readonly number[]; readonly max?: readonly number[]; readonly count?: number }[];
  readonly materials?: readonly unknown[];
  readonly textures?: readonly unknown[];
}
interface GlbNode {
  readonly children?: readonly number[];
  readonly mesh?: number;
  readonly matrix?: readonly number[];
  readonly translation?: readonly number[];
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
}
interface GlbPrimitive {
  readonly attributes?: { readonly POSITION?: number };
  readonly indices?: number;
}

function readGlbJson(file: string): GlbJson {
  const bytes = readFileSync(file);
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`${file} is not a binary GLB`);
  }
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) as GlbJson;
}

interface PartBounds {
  readonly lo: readonly number[];
  readonly hi: readonly number[];
  readonly triangles: number;
  readonly primitiveCount: number;
}

/** World-space AABB per mesh node, from accessor min/max composed through the node hierarchy. */
function collectNodeWorldBounds(json: GlbJson): readonly PartBounds[] {
  const nodes = json.nodes ?? [];
  const parent = new Map<number, number>();
  nodes.forEach((node, index) => (node.children ?? []).forEach((child) => parent.set(child, index)));

  const localMatrix = (node: GlbNode): readonly number[] => {
    if (Array.isArray(node.matrix)) return node.matrix;
    const [tx = 0, ty = 0, tz = 0] = node.translation ?? [];
    const [x = 0, y = 0, z = 0, w = 1] = node.rotation ?? [];
    const [sx = 1, sy = 1, sz = 1] = node.scale ?? [];
    const r = [
      1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
      2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
      2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)
    ];
    return [
      r[0]! * sx, r[1]! * sx, r[2]! * sx, 0,
      r[3]! * sy, r[4]! * sy, r[5]! * sy, 0,
      r[6]! * sz, r[7]! * sz, r[8]! * sz, 0,
      tx, ty, tz, 1
    ];
  };
  const multiply = (a: readonly number[], b: readonly number[]): readonly number[] => {
    const out = new Array<number>(16).fill(0);
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        let sum = 0;
        for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row]! * b[column * 4 + k]!;
        out[column * 4 + row] = sum;
      }
    }
    return out;
  };
  const worldMatrix = (index: number): readonly number[] => {
    let matrix = localMatrix(nodes[index]!);
    let next = parent.get(index);
    while (next !== undefined) {
      matrix = multiply(localMatrix(nodes[next]!), matrix);
      next = parent.get(next);
    }
    return matrix;
  };
  const apply = (m: readonly number[], point: readonly number[]): readonly number[] => [
    m[0]! * point[0]! + m[4]! * point[1]! + m[8]! * point[2]! + m[12]!,
    m[1]! * point[0]! + m[5]! * point[1]! + m[9]! * point[2]! + m[13]!,
    m[2]! * point[0]! + m[6]! * point[1]! + m[10]! * point[2]! + m[14]!
  ];

  const out: PartBounds[] = [];
  nodes.forEach((node, index) => {
    if (node.mesh === undefined) return;
    const mesh = json.meshes?.[node.mesh];
    if (!mesh) return;
    let lo = [Infinity, Infinity, Infinity];
    let hi = [-Infinity, -Infinity, -Infinity];
    let triangles = 0;
    let primitiveCount = 0;
    for (const primitive of mesh.primitives ?? []) {
      const positionIndex = primitive.attributes?.POSITION;
      if (positionIndex === undefined) continue;
      const accessor = json.accessors?.[positionIndex];
      if (!accessor?.min || !accessor?.max) continue;
      primitiveCount += 1;
      lo = lo.map((value, axis) => Math.min(value, accessor.min![axis]!));
      hi = hi.map((value, axis) => Math.max(value, accessor.max![axis]!));
      if (primitive.indices !== undefined) {
        triangles += Math.floor((json.accessors?.[primitive.indices]?.count ?? 0) / 3);
      }
    }
    if (!lo.every(Number.isFinite)) return;
    const matrix = worldMatrix(index);
    const corners: readonly number[][] = [
      ...[lo[0]!, hi[0]!].flatMap((x) =>
        [lo[1]!, hi[1]!].flatMap((y) => [lo[2]!, hi[2]!].map((z) => apply(matrix, [x, y, z]) as number[])))
    ];
    out.push({
      lo: [0, 1, 2].map((axis) => Math.min(...corners.map((corner) => corner[axis]!))),
      hi: [0, 1, 2].map((axis) => Math.max(...corners.map((corner) => corner[axis]!))),
      triangles,
      primitiveCount
    });
  });
  return out;
}

/** sha256 of a staged file, for provenance binding in a screening report. */
export function hashStagedFile(file: string): string {
  return `sha256-${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
}

/** Resolve a project-relative path, for callers staging into the repository. */
export function resolveProjectPath(projectDir: string | undefined, relativePath: string): string {
  return resolve(projectDir ?? process.cwd(), relativePath);
}

/**
 * Build a render probe that reads a *retained* multi-angle visibility report.
 *
 * ## Why reading retained evidence is the right binding
 *
 * The alternative — launching a browser from inside the CLI — would make this package depend on the test
 * harness and would put a 30-second render inside a search loop. Worse, a caller without a browser would be
 * tempted to synthesise a verdict from geometry, which is the conflation that produced a false renderer
 * diagnosis in the first place.
 *
 * Retained reports are produced by `tests/browser/vehicle-wheel-visibility.spec.ts`, which renders an asset
 * across several azimuths and measures the lower-silhouette wheel band per angle. Reading them means the
 * pipeline consumes *real rendered proof* while the rendering stays owned by the browser suite.
 *
 * A missing report is not treated as a failure: `renderedWheelVisibility` is left undefined so admission
 * reports `unproven`. That distinction matters — "no evidence" and "evidence of absence" are different, and
 * conflating them is what made a correctly-drawing asset look broken.
 */
export function createRetainedRenderProbe(options: {
  /** Directory holding `<assetId>.json` visibility reports. */
  readonly reportDir?: string | undefined;
  readonly projectDir?: string | undefined;
  /**
   * Minimum band pixels for a wheel band to count as readable at an angle.
   *
   * Measured against the accepted hero: its readable angles carry >10k band pixels while a dead-on front
   * view carries mass that is body, not tyre. The threshold is deliberately low and paired with the
   * outer-third test below rather than being tuned to a single asset.
   */
  readonly minBandPixels?: number | undefined;
} = {}): NonNullable<ScreeningEffects["renderProbe"]> {
  const reportDir = options.reportDir ?? "tests/reports/vehicle-wheel-visibility";
  const minBandPixels = options.minBandPixels ?? 2_000;

  return async (candidate) => {
    // Reports are keyed by registered asset id, not by provider candidate id.
    const assetId = candidate.id.includes(":") ? candidate.id.split(":").pop()! : candidate.id;
    const path = resolveProjectPath(options.projectDir, join(reportDir, `${assetId}.json`));
    if (!existsSync(path)) return {};

    const report = JSON.parse(readFileSync(path, "utf8")) as {
      readonly angles?: readonly {
        readonly azimuth?: number;
        readonly wheelBand?: {
          readonly pixels?: number;
          readonly leftThird?: number;
          readonly rightThird?: number;
        };
      }[];
    };
    const angles = report.angles ?? [];
    /*
     * An angle counts as readable when the wheel band carries real mass in *both* outer thirds.
     *
     * Centre-only mass is bodywork seen head-on — precisely the geometry of the misleading dead-astern
     * probe. Requiring both outer thirds is what distinguishes "wheels read here" from "the car's rear is
     * filling the frame".
     */
    const readable = angles.filter((angle) => {
      const band = angle.wheelBand;
      if (!band || (band.pixels ?? 0) < minBandPixels) return false;
      const outer = Math.min(band.leftThird ?? 0, band.rightThird ?? 0);
      return outer >= (band.pixels ?? 0) * 0.18;
    });

    return {
      screenshotPath: join(reportDir, `${assetId}-angle-0.png`),
      renderedWheelVisibility: readable.length > 0,
      renderedAzimuths: readable
        .map((angle) => angle.azimuth ?? 0)
        // A dead-on view is excluded from the evidence set: it is the one angle where bodywork hides wheels.
        .filter((azimuth) => Math.abs(azimuth) > 0.2)
    };
  };
}
