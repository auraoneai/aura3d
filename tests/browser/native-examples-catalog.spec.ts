import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import sharp from "sharp";
import { bindBrowserGate, snapshotBrowserOutput, type BrowserGateRecord, type BrowserOutputFile } from "../../tools/native-capability-gate/browser-contract";

/**
 * Phase B only. These are the candidate-built, retained outputs from Phase A;
 * this test never scaffolds, installs, builds, changes a dependency or serves the
 * workspace's source aliases. Both source reports and the global gate must be
 * staged with the exact candidate. Missing examples or visual references fail.
 *
 * Independently authored subject-region expectations are fixture inputs, not
 * output from this run. Place their manifest at
 * tests/fixtures/native-examples-catalog/expectations.json. Never bless a
 * screenshot automatically. Region comparisons are deliberately bounded below
 * so an empty/opaque canvas cannot become a passing visual expectation.
 */
const ROOT = process.cwd();
const EXPECTATIONS_PATH = "tests/fixtures/native-examples-catalog/expectations.json";
const VIEWPORT = { width: 1280, height: 720 } as const;
type CatalogKind = "template" | "capability-example" | "starter-example" | "documented-example";
interface CatalogCase { id: string; kind: CatalogKind }
interface SourceProject {
  id?: string; template?: string; path: string; outputEntry?: string;
  retention?: string; projectSha256?: string;
  files?: Array<{ path: string; size: number; sha256: string }>;
  outputFiles?: Array<{ path: string; bytes: number; sha256: string }>;
  outputSha256?: string;
}
interface SourceReport {
  schema: string;
  phase: string;
  runId: string;
  candidate?: { sha256?: string };
  candidateSha256?: string;
  projects: SourceProject[];
  cases?: Array<{ id: string; status: string; project?: string }>;
}

export interface VisualRegion {
  /** The subject region must cover the rendered 3D subject, not an overlay. */
  label: "subject" | "output";
  x: number;
  y: number;
  width: number;
  height: number;
  pixelThreshold: number;
  maxMeanDifference: number;
  maxChangedRatio: number;
}
interface VisualExpectation {
  id: string;
  kind: "reference" | "numeric";
  reference?: string;
  sha256?: string;
  provenance: string;
  author: string;
  subject: string;
  surface?: { kind: "canvas" | "svg" | "dom"; selector: string };
  regions: Array<VisualRegion | NumericRegion>;
}
export interface NumericRegion {
  label: "subject" | "output";
  x: number;
  y: number;
  width: number;
  height: number;
  minContrast: number;
  colors: Array<{
    name: string;
    red: [number, number];
    green: [number, number];
    blue: [number, number];
    minFraction: number;
    maxFraction: number;
  }>;
}
interface ExpectationFile { schema: string; cases: VisualExpectation[] }
interface CaseResult {
  id: string;
  kind: CatalogKind;
  status: "passed" | "failed";
  screenshot?: string;
  screenshotSha256?: string;
  backend?: Array<{ type: string; renderer?: string }>;
  surface?: { kind: "canvas" | "svg" | "dom"; selector: string };
  referenceSha256?: string;
  sourceProject?: string;
  sourceProjectSha256?: string;
  outputSha256?: string;
  servedOutputSha256?: string;
  subject?: string;
  boundsQuery?: { nodeName: string; distance: number; point: number[]; normal: number[] };
  behavior?: { kind: string; observations: CatalogBehaviorObservation[]; metrics: unknown };
  behaviorFrames?: Array<{ label: string; screenshot: string; sha256: string }>;
  assertions: unknown[];
  errors: string[];
}

const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex");

/** The required behavior cannot be switched off by editing the visual fixture. */
export type CatalogBehaviorKind = "postprocess" | "animation" | "controls";
export function requiredCatalogBehavior(id: string): CatalogBehaviorKind | undefined {
  if (id === "capability-example:postprocess") return "postprocess";
  if (id === "capability-example:animation") return "animation";
  if (id === "capability-example:controls") return "controls";
  return undefined;
}

export interface CatalogBehaviorObservation {
  backend: unknown;
  drawCalls: unknown;
  errors: unknown;
  time: unknown;
  camera: { position?: unknown; viewProjection?: unknown } | null;
  asset: {
    assetId?: unknown; clips?: unknown; activeClip?: unknown;
    skeleton?: { boneCount?: unknown };
    skinningPalette?: { updated?: unknown };
    renderItemCount?: unknown; skinnedRenderItemCount?: unknown;
  } | null;
  animation: { activeClip?: unknown; tracksApplied?: unknown } | null;
  post: {
    present?: unknown; pipeline?: unknown; submittedPasses?: unknown;
    pixelBackedPasses?: unknown; stagesRan?: unknown;
  } | null;
  grade: { contrast?: unknown; saturation?: unknown } | null;
  orbitTarget: unknown;
}

function finiteVector(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length &&
    value.every((v) => typeof v === "number" && Number.isFinite(v));
}

/** Validate runtime observations as well as pixels; no telemetry alone is a visual result. */
export function catalogBehaviorObservationErrors(
  kind: CatalogBehaviorKind,
  before: CatalogBehaviorObservation,
  after: CatalogBehaviorObservation,
  restored?: CatalogBehaviorObservation
): string[] {
  const errors: string[] = [];
  const observations = restored ? [before, after, restored] : [before, after];
  if (kind === "postprocess" && !restored) errors.push("grade restore observation is missing");
  for (const observation of observations) {
    if (!observation || !["webgl2", "webgpu"].includes(String(observation.backend)) ||
        typeof observation.drawCalls !== "number" || !Number.isFinite(observation.drawCalls) || observation.drawCalls <= 0 ||
        !Array.isArray(observation.errors) || observation.errors.length !== 0) {
      errors.push("a production frame or clean renderer diagnostics is missing");
      continue;
    }
    const projection = observation.camera?.viewProjection;
    if (!finiteVector(observation.camera?.position, 3) || !finiteVector(projection, 16) ||
        ![0, 1, 2, 3].every((row) => [0, 1, 2, 3].some((column) => Math.abs(projection[column * 4 + row]!) > 1e-8))) {
      errors.push("finite presented camera evidence is missing");
    }
    if (typeof observation.time !== "number" || !Number.isFinite(observation.time)) errors.push("finite app time is missing");
    if (observation.asset?.assetId !== "kaykitBarbarian" ||
        typeof observation.asset.renderItemCount !== "number" || observation.asset.renderItemCount < 1) {
      errors.push("the admitted barbarian render item is missing");
    }
    if (kind === "animation") {
      if (observation.animation?.activeClip !== "Idle" ||
          typeof observation.animation.tracksApplied !== "number" || observation.animation.tracksApplied <= 0 ||
          !Array.isArray(observation.asset?.clips) || !observation.asset.clips.includes("Idle") ||
          observation.asset.activeClip !== "Idle" ||
          typeof observation.asset.skeleton?.boneCount !== "number" || observation.asset.skeleton.boneCount < 1 ||
          observation.asset.skinningPalette?.updated !== true ||
          typeof observation.asset.skinnedRenderItemCount !== "number" || observation.asset.skinnedRenderItemCount < 1) {
        errors.push("the Idle clip, applied tracks, skin palette or skinned render item is missing");
      }
    }
    if (kind === "postprocess") {
      const post = observation.post;
      const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((x) => typeof x === "string");
      if (observation.grade?.contrast !== 1.12 || observation.grade.saturation !== 0.8 ||
          !post || post.present !== true || typeof post.pipeline !== "string" ||
          !strings(post.submittedPasses) || !strings(post.pixelBackedPasses) ||
          ![...post.submittedPasses, ...post.pixelBackedPasses, ...(strings(post.stagesRan) ? post.stagesRan : [])]
            .some((name) => /grade|s10/i.test(name))) {
        errors.push("the authored grade or submitted grade stage is missing");
      }
    }
    if (kind === "controls" && observation.orbitTarget !== "subject") errors.push("the orbit interaction does not target the subject");
  }
  if (finiteVector(before?.camera?.position, 3) && finiteVector(after?.camera?.position, 3) &&
      finiteVector(before?.camera?.viewProjection, 16) && finiteVector(after?.camera?.viewProjection, 16)) {
    const afterPosition = after.camera.position;
    const afterMatrix = after.camera.viewProjection;
    const eyeDelta = Math.hypot(...before.camera.position.map((v, i) => v - afterPosition[i]!));
    const matrixDelta = Math.max(...before.camera.viewProjection.map((v, i) => Math.abs(v - afterMatrix[i]!)));
    if (kind === "controls" ? eyeDelta < 0.05 || matrixDelta < 0.0001 : eyeDelta > 0.00001 || matrixDelta > 0.00001) {
      errors.push(kind === "controls" ? "pointer drag did not change the camera view" : "camera changed during the controlled comparison");
    }
  }
  if (restored && finiteVector(before?.camera?.viewProjection, 16) && finiteVector(restored.camera?.viewProjection, 16) &&
      before.camera.viewProjection.some((value, index) => Math.abs(value - (restored.camera!.viewProjection as number[])[index]!) > 0.00001)) {
    errors.push("camera changed before the grade was restored");
  }
  if (typeof before?.time === "number" && typeof after?.time === "number") {
    const elapsed = after.time - before.time;
    if (kind === "animation" && Math.abs(elapsed - 16 / 30) > 0.0001) errors.push("the Idle half-cycle was not advanced");
    if (kind === "postprocess" && (Math.abs(elapsed) > 0.00001 || !restored ||
        typeof restored.time !== "number" || Math.abs(restored.time - before.time) > 0.00001)) {
      errors.push("time changed during the grade comparison");
    }
  }
  if (kind === "postprocess" && restored && before?.post && after?.post && restored.post) {
    const chain = (o: CatalogBehaviorObservation) => JSON.stringify([o.post?.pipeline, o.post?.submittedPasses, o.post?.pixelBackedPasses]);
    if (chain(before) !== chain(after) || chain(before) !== chain(restored)) errors.push("grade comparison did not retain the same post chain");
  }
  return [...new Set(errors)];
}

/**
 * Compare only pixels matching the first independently described subject band
 * in either frame. For the three capability cases that is the barbarian's
 * skin-tone atlas band; the blue-gray armor band also overlaps the gray floor
 * and is deliberately not used as a motion/grade mask.
 * This is a bounded hypothesis for Phase B, not a reference-image approval.
 */
export function compareCatalogSubjectBehavior(
  before: Uint8Array, after: Uint8Array, width: number, height: number, region: NumericRegion
): { eligible: number; changed: number; changedFraction: number; meanDifference: number; beforeChroma: number; afterChroma: number } {
  // Reuse the existing bounds/band validator; the results themselves need not
  // pass here (e.g. the controlled neutral-grade frame has different colors).
  compareNumericCatalogRegions(before, width, height, [region]);
  compareNumericCatalogRegions(after, width, height, [region]);
  let eligible = 0, changed = 0, difference = 0, beforeChroma = 0, afterChroma = 0;
  const band = region.colors[0]!;
  const matches = (image: Uint8Array, i: number) =>
    image[i]! >= band.red[0] && image[i]! <= band.red[1] &&
    image[i + 1]! >= band.green[0] && image[i + 1]! <= band.green[1] &&
    image[i + 2]! >= band.blue[0] && image[i + 2]! <= band.blue[1];
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const i = (y * width + x) * 3;
      if (!matches(before, i) && !matches(after, i)) continue;
      eligible += 1;
      const deltas = [0, 1, 2].map((channel) => Math.abs(before[i + channel]! - after[i + channel]!));
      difference += deltas[0]! + deltas[1]! + deltas[2]!;
      if (Math.max(...deltas) > 3) changed += 1;
      beforeChroma += Math.max(before[i]!, before[i + 1]!, before[i + 2]!) - Math.min(before[i]!, before[i + 1]!, before[i + 2]!);
      afterChroma += Math.max(after[i]!, after[i + 1]!, after[i + 2]!) - Math.min(after[i]!, after[i + 1]!, after[i + 2]!);
    }
  }
  return {
    eligible, changed, changedFraction: eligible ? changed / eligible : 0,
    meanDifference: eligible ? difference / (eligible * 3) : 0,
    beforeChroma: eligible ? beforeChroma / eligible : 0,
    afterChroma: eligible ? afterChroma / eligible : 0
  };
}

export function catalogBehaviorPixelErrors(
  kind: CatalogBehaviorKind,
  changed: ReturnType<typeof compareCatalogSubjectBehavior>,
  repeat: ReturnType<typeof compareCatalogSubjectBehavior>
): string[] {
  const errors: string[] = [];
  if ([...Object.values(changed), ...Object.values(repeat)].some((value) => !Number.isFinite(value) || value < 0)) {
    return ["invalid subject pixel metrics"];
  }
  if (changed.eligible < 100 || changed.changed < 30 || changed.changedFraction < 0.005 || changed.meanDifference < 0.15) {
    errors.push("insufficient changed subject pixels");
  }
  if (repeat.eligible < 100 || repeat.meanDifference > 0.75 || repeat.changedFraction > 0.03) {
    errors.push("unchanged control frame was not stable");
  }
  // `changed` is neutral -> authored grade. The authored saturation 0.8
  // should reduce chroma despite its contrast 1.12; this is uncalibrated.
  if (kind === "postprocess" && (changed.beforeChroma < 3 || changed.afterChroma >= changed.beforeChroma * 0.995)) {
    errors.push("authored grade did not reduce subject chroma");
  }
  return errors;
}

function redactUrls(message: string): string {
  return message.replace(/https?:\/\/[^\s)\]}]+/g, (value) => {
    try {
      const url = new URL(value);
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return "[redacted URL]";
    }
  });
}

/** Pure numerical comparison, exported for source tests without launching a browser. */
export function compareCatalogRegions(
  actual: Uint8Array,
  reference: Uint8Array,
  width: number,
  height: number,
  regions: readonly VisualRegion[]
): Array<{ label: string; meanDifference: number; changedRatio: number; referenceContrast: number; pass: boolean }> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
      actual.length !== width * height * 3 || reference.length !== actual.length) {
    throw new Error("visual comparison requires equal, nonempty RGB images");
  }
  if (!regions.some((region) => region.label === "subject")) throw new Error("a subject region is required");
  return regions.map((region) => {
    const { x, y, width: rw, height: rh, pixelThreshold, maxMeanDifference, maxChangedRatio } = region;
    if (![x, y, rw, rh].every(Number.isInteger) || x < 0 || y < 0 || rw < 16 || rh < 16 ||
        x + rw > width || y + rh > height ||
        !Number.isFinite(pixelThreshold) || pixelThreshold <= 0 || pixelThreshold > 45 ||
        !Number.isFinite(maxMeanDifference) || maxMeanDifference <= 0 || maxMeanDifference > 24 ||
        !Number.isFinite(maxChangedRatio) || maxChangedRatio < 0 || maxChangedRatio > 0.35 ||
        (region.label !== "subject" && region.label !== "output")) {
      throw new Error(`invalid or unbounded ${String(region.label)} visual region`);
    }
    let error = 0;
    let changed = 0;
    let light = 0;
    let lightSquared = 0;
    const count = rw * rh;
    for (let row = y; row < y + rh; row += 1) {
      for (let col = x; col < x + rw; col += 1) {
        const i = (row * width + col) * 3;
        const dr = Math.abs(actual[i]! - reference[i]!);
        const dg = Math.abs(actual[i + 1]! - reference[i + 1]!);
        const db = Math.abs(actual[i + 2]! - reference[i + 2]!);
        error += dr + dg + db;
        if (Math.max(dr, dg, db) > pixelThreshold) changed += 1;
        const luma = 0.2126 * reference[i]! + 0.7152 * reference[i + 1]! + 0.0722 * reference[i + 2]!;
        light += luma;
        lightSquared += luma * luma;
      }
    }
    const meanDifference = error / (count * 3);
    const changedRatio = changed / count;
    const referenceContrast = Math.sqrt(Math.max(0, lightSquared / count - (light / count) ** 2));
    return {
      label: region.label,
      meanDifference,
      changedRatio,
      referenceContrast,
      pass: referenceContrast >= 5 && meanDifference <= maxMeanDifference && changedRatio <= maxChangedRatio
    };
  });
}

/** Compare screenshot pixels with independently authored numerical subject expectations. */
export function compareNumericCatalogRegions(
  actual: Uint8Array,
  width: number,
  height: number,
  regions: readonly NumericRegion[]
): Array<{ label: string; contrast: number; colors: Array<{ name: string; fraction: number; pass: boolean }>; pass: boolean }> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || actual.length !== width * height * 3) {
    throw new Error("numeric comparison requires a nonempty RGB image");
  }
  if (!regions.some((region) => region.label === "subject")) throw new Error("a subject region is required");
  return regions.map((region) => {
    const { x, y, width: rw, height: rh, colors, minContrast } = region;
    if (![x, y, rw, rh].every(Number.isInteger) || x < 0 || y < 0 || rw < 16 || rh < 16 ||
        x + rw > width || y + rh > height || !Number.isFinite(minContrast) || minContrast < 5 ||
        minContrast > 120 || !Array.isArray(colors) || !colors.length ||
        (region.label !== "subject" && region.label !== "output")) {
      throw new Error(`invalid or unbounded ${String(region.label)} numeric region`);
    }
    const names = new Set<string>();
    for (const band of colors) {
      if (!band.name?.trim() || names.has(band.name) ||
          ![band.red, band.green, band.blue].every((range) => Array.isArray(range) && range.length === 2 &&
            range.every(Number.isFinite) && range[0] >= 0 && range[1] <= 255 && range[0] <= range[1]) ||
          Math.min(band.red[1] - band.red[0], band.green[1] - band.green[0], band.blue[1] - band.blue[0]) > 128 ||
          !Number.isFinite(band.minFraction) || !Number.isFinite(band.maxFraction) || band.minFraction < 0.001 ||
          band.maxFraction > 0.95 || band.minFraction > band.maxFraction) {
        throw new Error(`invalid or unbounded color band in ${region.label}`);
      }
      names.add(band.name);
    }
    const counts = colors.map(() => 0);
    const count = rw * rh;
    let light = 0;
    let lightSquared = 0;
    for (let row = y; row < y + rh; row += 1) for (let col = x; col < x + rw; col += 1) {
      const i = (row * width + col) * 3;
      const r = actual[i]!, g = actual[i + 1]!, b = actual[i + 2]!;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      light += luma;
      lightSquared += luma * luma;
      colors.forEach((band, index) => {
        if (r >= band.red[0] && r <= band.red[1] && g >= band.green[0] && g <= band.green[1] && b >= band.blue[0] && b <= band.blue[1]) counts[index]! += 1;
      });
    }
    const contrast = Math.sqrt(Math.max(0, lightSquared / count - (light / count) ** 2));
    const observed = colors.map((band, index) => {
      const fraction = counts[index]! / count;
      return { name: band.name, fraction, pass: fraction >= band.minFraction && fraction <= band.maxFraction };
    });
    return { label: region.label, contrast, colors: observed, pass: contrast >= minContrast && observed.every((band) => band.pass) };
  });
}

/** Check set equality: a duplicate or an omitted required case is a failure. */
export function catalogSetErrors(expected: readonly string[], observed: readonly string[]): string[] {
  const errors: string[] = [];
  const required = new Set(expected);
  const found = new Set(observed);
  if (required.size !== expected.length) errors.push("duplicate required catalog ID");
  if (found.size !== observed.length) errors.push("duplicate observed catalog ID");
  for (const id of required) if (!found.has(id)) errors.push(`missing ${id}`);
  for (const id of found) if (!required.has(id)) errors.push(`unexpected ${id}`);
  if (required.size === 0) errors.push("empty required catalog");
  return errors;
}

export function boundsQueryHitError(value: unknown): string | null {
  if (!value || typeof value !== "object") return "bounds query did not return a hit";
  const hit = value as { nodeName?: unknown; distance?: unknown; point?: unknown; normal?: unknown };
  if (hit.nodeName !== "subject") return "bounds query did not hit the subject";
  if (typeof hit.distance !== "number" || !Number.isFinite(hit.distance) || hit.distance <= 0) {
    return "bounds query returned an invalid distance";
  }
  const vector = (candidate: unknown): candidate is number[] =>
    Array.isArray(candidate) && candidate.length === 3 && candidate.every((component) => typeof component === "number" && Number.isFinite(component));
  if (!vector(hit.point) || !vector(hit.normal) || Math.hypot(...hit.normal) < 0.5 ||
      Math.abs(hit.point[0]! + 1) > 0.0001 || Math.abs(hit.point[1]! - 0.8) > 0.0001 ||
      Math.abs(hit.point[2]! - (6 - hit.distance)) > 0.001) return "bounds query returned an invalid ray hit";
  return null;
}

function environment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function confinedFile(base: string, value: string): string {
  if (isAbsolute(value) || value.includes("\0")) throw new Error(`unsafe relative path: ${value}`);
  const parent = realpathSync(base);
  const actual = realpathSync(resolve(parent, value));
  if (actual !== parent && !actual.startsWith(`${parent}${sep}`)) throw new Error(`path escapes ${base}: ${value}`);
  return actual;
}

/** Load fixture inputs without starting a browser; injectable paths support source-only tests. */
export function loadExpectations(root = ROOT, expectationsPath = EXPECTATIONS_PATH): Map<string, VisualExpectation> {
  const file = confinedFile(root, expectationsPath);
  const parsed = JSON.parse(readFileSync(file, "utf8")) as ExpectationFile;
  if (parsed.schema !== "aura3d.native-example-expectations/1" || !Array.isArray(parsed.cases) || !parsed.cases.length) {
    throw new Error(`invalid expectation manifest ${expectationsPath}`);
  }
  const entries = new Map<string, VisualExpectation>();
  for (const entry of parsed.cases) {
    if (!entry || typeof entry.id !== "string" || !entry.id.trim() || entries.has(entry.id) ||
        (entry.kind !== "numeric" && entry.kind !== "reference") ||
        typeof entry.provenance !== "string" || !entry.provenance.trim() ||
        typeof entry.author !== "string" || !entry.author.trim() ||
        typeof entry.subject !== "string" || !entry.subject.trim() || !Array.isArray(entry.regions) ||
        !entry.regions.some((region) => region?.label === "subject")) {
      throw new Error(`invalid, incomplete or duplicate visual expectation: ${entry?.id ?? "unknown"}`);
    }
    if (entry.surface && (!(entry.surface.kind === "canvas" || entry.surface.kind === "svg" || entry.surface.kind === "dom") ||
        typeof entry.surface.selector !== "string" || !entry.surface.selector.trim())) throw new Error(`invalid visual surface: ${entry.id}`);
    if (entry.kind === "reference") {
      if (typeof entry.reference !== "string" || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
        throw new Error(`missing reference or digest: ${entry.id}`);
      }
      const reference = confinedFile(dirname(file), entry.reference);
      if (sha256(readFileSync(reference)) !== entry.sha256) throw new Error(`reference digest mismatch: ${entry.id}`);
    } else if (entry.reference !== undefined || entry.sha256 !== undefined) {
      throw new Error(`numeric expectation must not refer to a screenshot: ${entry.id}`);
    }
    entries.set(entry.id, entry);
  }
  return entries;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".woff": "font/woff", ".woff2": "font/woff2",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav"
};

function outputInventory(project: SourceProject, kind: CatalogKind): BrowserOutputFile[] {
  if (kind === "template") {
    if (project.retention !== "portable-v1" || !Array.isArray(project.files)) throw new Error("Template lacks its portable retained file inventory");
    return project.files.filter(file => file.path.startsWith("dist/")).map(file => ({
      path: file.path.slice("dist/".length), size: file.size, sha256: file.sha256
    }));
  }
  if (!Array.isArray(project.outputFiles) || !project.outputSha256) throw new Error("Example lacks its retained output inventory");
  return project.outputFiles.map(file => ({ path: file.path, size: file.bytes, sha256: file.sha256 }));
}

async function serveBuiltProject(project: string, outputEntry: string, inventory: readonly BrowserOutputFile[]): Promise<{ origin: string; outputSha256: string; close(): Promise<void> }> {
  const snapshot = snapshotBrowserOutput(resolve(project, "dist"), inventory);
  if (!snapshot.files.has(outputEntry) || extname(outputEntry).toLowerCase() !== ".html") throw new Error(`built HTML entry is missing: ${project}/${outputEntry}`);
  const server: Server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
      if (!pathname.startsWith("/") || pathname.includes("\0")) throw new Error("unsafe request");
      let path = pathname.slice(1) || "index.html";
      let bytes = snapshot.files.get(path);
      if (!bytes) { path = `${path.replace(/\/$/, "")}/index.html`; bytes = snapshot.files.get(path); }
      if (!bytes) throw new Error("not a recorded file");
      response.writeHead(200, { "Content-Type": MIME[extname(path).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-store" });
      response.end(bytes);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Not found");
    }
  });
  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => done());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((done) => server.close(() => done()));
    throw new Error("cannot obtain isolated project server address");
  }
  return {
    origin: `http://127.0.0.1:${address.port}/${outputEntry.split("/").map(encodeURIComponent).join("/")}`,
    outputSha256: snapshot.sha256,
    close: () => new Promise<void>((done, fail) => server.close((error) => error ? fail(error) : done()))
  };
}

async function imageRgb(bytes: Buffer): Promise<Uint8Array> {
  const image = await sharp(bytes).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== VIEWPORT.width || image.info.height !== VIEWPORT.height || image.info.channels !== 3) {
    throw new Error(`reference/screenshot must be ${VIEWPORT.width}x${VIEWPORT.height} RGB`);
  }
  return image.data;
}

/** Read only the candidate-built harness's existing app; never replace its scene or controls. */
async function catalogBehaviorObservation(page: Page): Promise<CatalogBehaviorObservation> {
  return page.evaluate(() => {
    const app = (window as any).__AURA_EXAMPLE_APP__;
    if (!app || typeof app.diagnostics !== "function" || typeof app.nodes?.require !== "function") {
      throw new Error("candidate capability app is unavailable");
    }
    const diagnostics = app.diagnostics();
    const node = app.nodes.require("subject");
    const imported = node.snapshot().importedAssetEvidence ?? null;
    const animation = typeof node.animation?.animationState === "function" ? node.animation.animationState() ?? null : null;
    const camera = typeof app.camera?.evidence === "function" ? app.camera.evidence() : null;
    const grade = app.scene.nodes.find((entry: any) => entry.kind === "effect" && entry.effect === "color-grade") ?? null;
    const orbit = app.scene.nodes.find((entry: any) => entry.kind === "interaction" && entry.mode === "orbit");
    const post = diagnostics.post ?? null;
    return {
      backend: diagnostics.backend,
      drawCalls: diagnostics.drawCalls,
      errors: diagnostics.errors,
      time: app.runtime?.time,
      camera: camera ? { position: camera.pose?.position, viewProjection: Array.from(camera.viewProjection ?? []) } : null,
      asset: imported ? {
        assetId: imported.assetId, clips: imported.clips, activeClip: imported.activeClip,
        skeleton: imported.skeleton, skinningPalette: imported.skinningPalette,
        renderItemCount: imported.renderItemCount, skinnedRenderItemCount: imported.skinnedRenderItemCount
      } : null,
      animation: animation ? { activeClip: animation.activeClip, tracksApplied: animation.tracksApplied } : null,
      post: post ? {
        present: post.present, pipeline: post.pipeline, submittedPasses: post.submittedPasses,
        pixelBackedPasses: post.pixelBackedPasses, stagesRan: post.stagesRan
      } : null,
      grade: grade ? { contrast: grade.contrast, saturation: grade.saturation } : null,
      orbitTarget: orbit?.target ?? null
    } satisfies CatalogBehaviorObservation;
  });
}

async function runCatalogBehavior(
  page: Page,
  kind: CatalogBehaviorKind,
  region: NumericRegion,
  rect: { x: number; y: number; width: number; height: number },
  retain: (label: string, bytes: Buffer) => void
): Promise<NonNullable<CaseResult["behavior"]>> {
  await page.evaluate((mode) => {
    const app = (window as any).__AURA_EXAMPLE_APP__;
    if (!app || typeof app.pause !== "function" || typeof app.step !== "function") throw new Error("controlled app stepping is unavailable");
    app.pause();
    if (mode === "animation") {
      // The admitted GLB's Idle duration is 32/30 seconds. Start at a
      // cycle boundary, then compare the independently inspected half-cycle.
      const duration = 32 / 30;
      if (!Number.isFinite(app.runtime?.time)) throw new Error("animation clock is unavailable");
      const remaining = (duration - (app.runtime.time % duration)) % duration;
      app.step(remaining);
    }
    app.step(0);
  }, kind);
  const frame = async (label: string): Promise<Uint8Array> => {
    const bytes = await page.screenshot({ animations: "disabled" });
    retain(label, bytes);
    return imageRgb(bytes);
  };
  const before = await catalogBehaviorObservation(page);
  const on = await frame(kind === "postprocess" ? "grade-authored" : "before");
  if (!compareNumericCatalogRegions(on, VIEWPORT.width, VIEWPORT.height, [region])[0]?.pass) {
    throw new Error("controlled initial frame did not contain the expected subject");
  }

  let after: CatalogBehaviorObservation;
  let restored: CatalogBehaviorObservation | undefined;
  let changed: ReturnType<typeof compareCatalogSubjectBehavior>;
  let repeat: ReturnType<typeof compareCatalogSubjectBehavior>;
  if (kind === "postprocess") {
    await page.evaluate(() => {
      const app = (window as any).__AURA_EXAMPLE_APP__;
      if (typeof app?.post?.setEffect !== "function") throw new Error("runtime grade control is unavailable");
      // Neutralize only the two authored fields, retaining the same post node
      // and chain; disabling the whole post pipeline would not isolate grade.
      app.post.setEffect("colorGrade", { contrast: 1, saturation: 1 });
      app.step(0);
    });
    after = await catalogBehaviorObservation(page);
    const neutral = await frame("grade-neutral");
    await page.evaluate(() => {
      const app = (window as any).__AURA_EXAMPLE_APP__;
      app.post.setEffect("colorGrade", { contrast: 1.12, saturation: 0.8 });
      app.step(0);
    });
    restored = await catalogBehaviorObservation(page);
    const restoredFrame = await frame("grade-restored");
    changed = compareCatalogSubjectBehavior(neutral, on, VIEWPORT.width, VIEWPORT.height, region);
    repeat = compareCatalogSubjectBehavior(on, restoredFrame, VIEWPORT.width, VIEWPORT.height, region);
  } else {
    await page.evaluate(() => (window as any).__AURA_EXAMPLE_APP__.step(0));
    const stable = await frame("unchanged");
    repeat = compareCatalogSubjectBehavior(on, stable, VIEWPORT.width, VIEWPORT.height, region);
    if (kind === "animation") {
      await page.evaluate(() => (window as any).__AURA_EXAMPLE_APP__.step(16 / 30));
    } else {
      // Actual user input, not a synthetic camera mutation or a new harness rig.
      const x = rect.x + rect.width * 0.5, y = rect.y + rect.height * 0.5;
      await page.mouse.move(x, y);
      await page.mouse.down();
      try { await page.mouse.move(x + 120, y + 30, { steps: 12 }); }
      finally { await page.mouse.up(); }
      await page.evaluate(() => {
        const app = (window as any).__AURA_EXAMPLE_APP__;
        for (let i = 0; i < 12; i += 1) app.step(1 / 60);
      });
    }
    after = await catalogBehaviorObservation(page);
    const next = await frame(kind === "animation" ? "idle-half-cycle" : "after-pointer-drag");
    changed = compareCatalogSubjectBehavior(on, next, VIEWPORT.width, VIEWPORT.height, region);
  }
  const errors = [
    ...catalogBehaviorObservationErrors(kind, before, after, restored),
    ...catalogBehaviorPixelErrors(kind, changed, repeat)
  ];
  if (errors.length) throw new Error(`${kind} behavior: ${errors.join("; ")}; metrics=${JSON.stringify({ changed, repeat })}`);
  return { kind, observations: restored ? [before, after, restored] : [before, after], metrics: { changed, repeat } };
}

async function runCase(browser: Browser, testInfo: TestInfo, item: CatalogCase, project: string, inventory: readonly BrowserOutputFile[], expectation: VisualExpectation, outputEntry = "index.html"): Promise<CaseResult> {
  const result: CaseResult = { id: item.id, kind: item.kind, status: "failed", assertions: [], errors: [],
    referenceSha256: expectation.sha256, subject: expectation.subject };
  let server: Awaited<ReturnType<typeof serveBuiltProject>> | undefined;
  let context: Awaited<ReturnType<Browser["newContext"]>> | undefined;
  let screenshot: Buffer | undefined;
  const behaviorFrames: Array<{ label: string; bytes: Buffer }> = [];
  let comparisons: Array<{ pass: boolean }> = [];
  const issues: Array<{ message: string; url?: string }> = [];
  let declaresIcon = true;
  try {
    server = await serveBuiltProject(project, outputEntry, inventory);
    result.servedOutputSha256 = server.outputSha256;
    context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    // Observe the context the untouched project requests. This is diagnostic
    // instrumentation only; it does not substitute a renderer or scene.
    await page.addInitScript(() => {
      const contexts: Array<{ type: string; renderer?: string }> = [];
      (window as unknown as { __auraCatalogContexts: typeof contexts }).__auraCatalogContexts = contexts;
      const original = HTMLCanvasElement.prototype.getContext;
      const prototype = HTMLCanvasElement.prototype as unknown as { getContext(type: string, ...args: unknown[]): unknown };
      prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]): unknown {
        const context = Reflect.apply(original, this, [type, ...args]) as WebGL2RenderingContext | null;
        if (context && (type === "webgl2" || type === "webgpu")) {
          const renderer = type === "webgl2" ? String(context.getParameter(context.RENDERER)) : undefined;
          contexts.push(renderer ? { type, renderer } : { type });
        }
        return context;
      };
    });
    page.on("pageerror", (error) => issues.push({ message: `page error: ${redactUrls(error.message)}` }));
    page.on("console", (message) => { if (message.type() === "error") issues.push({ message: `console: ${redactUrls(message.text())}`, url: message.location().url }); });
    page.on("requestfailed", (request) => issues.push({ message: `request failed: ${redactUrls(request.url())} ${request.failure()?.errorText ?? "unknown"}`, url: request.url() }));
    page.on("response", (response) => { if (response.status() >= 400) issues.push({ message: `HTTP ${response.status()}: ${redactUrls(response.url())}`, url: response.url() }); });
    const navigation = await page.goto(server.origin, { waitUntil: "load", timeout: 60_000 });
    if (!navigation?.ok()) throw new Error(`navigation failed: ${navigation?.status() ?? "no response"}`);
    declaresIcon = (await page.locator('link[rel~="icon"]').count()) > 0;
    const surface = expectation.surface ?? { kind: "canvas" as const, selector: "canvas" };
    if ((item.kind === "template" || item.kind === "capability-example") && surface.kind !== "canvas") {
      throw new Error("3D template and capability examples require their rendered canvas");
    }
    const target = page.locator(surface.selector).first();
    await target.waitFor({ state: "visible", timeout: 60_000 });
    const tag = await target.evaluate((element) => element.tagName.toLowerCase());
    if ((surface.kind === "canvas" && tag !== "canvas") || (surface.kind === "svg" && tag !== "svg")) {
      throw new Error(`expected ${surface.kind} surface, got ${tag}`);
    }
    if (surface.kind === "canvas") {
      await expect.poll(() => page.evaluate(() => (window as unknown as { __auraCatalogContexts: unknown[] }).__auraCatalogContexts.length), { timeout: 60_000 }).toBeGreaterThan(0);
      result.backend = await page.evaluate(() => (window as unknown as { __auraCatalogContexts: Array<{ type: string; renderer?: string }> }).__auraCatalogContexts);
    }
    if (item.id === "capability-example:bounds-query") {
      let hit: unknown;
      await expect.poll(async () => {
        hit = await page.evaluate(() => (window as unknown as { __AURA_EXAMPLE_BOUNDS_HIT__?: unknown }).__AURA_EXAMPLE_BOUNDS_HIT__ ?? null);
        return boundsQueryHitError(hit);
      }, { timeout: 60_000, intervals: [500, 1000, 2000] }).toBeNull();
      const validated = hit as { nodeName: string; distance: number; point: number[]; normal: number[] };
      result.boundsQuery = { nodeName: validated.nodeName, distance: validated.distance, point: validated.point, normal: validated.normal };
    }
    result.surface = surface;
    const rect = await target.boundingBox();
    if (!rect || rect.width < 160 || rect.height < 120) throw new Error("render surface is missing or too small");
    for (const region of expectation.regions.filter((entry) => entry.label === "subject")) {
      if (region.x < rect.x || region.y < rect.y || region.x + region.width > rect.x + rect.width || region.y + region.height > rect.y + rect.height) {
        throw new Error("subject region must be wholly inside its declared rendered surface");
      }
    }
    if (surface.kind === "canvas") {
      const exposed = await target.evaluate((element, regions) => regions.every((region) => {
        for (let row = 0; row < 4; row += 1) for (let col = 0; col < 4; col += 1) {
          const x = region.x + region.width * ((col + 0.5) / 4);
          const y = region.y + region.height * ((row + 0.5) / 4);
          if (document.elementFromPoint(x, y) !== element) return false;
        }
        return true;
      }), expectation.regions.filter((region) => region.label === "subject"));
      if (!exposed) throw new Error("a subject-region sample is covered by another DOM element");
    }
    const reference = expectation.kind === "reference"
      ? await imageRgb(readFileSync(confinedFile(dirname(resolve(ROOT, EXPECTATIONS_PATH)), expectation.reference!)))
      : undefined;
    await expect.poll(async () => {
      screenshot = await page.screenshot({ animations: "disabled" });
      const actual = await imageRgb(screenshot);
      comparisons = expectation.kind === "reference"
        ? compareCatalogRegions(actual, reference!, VIEWPORT.width, VIEWPORT.height, expectation.regions as VisualRegion[])
        : compareNumericCatalogRegions(actual, VIEWPORT.width, VIEWPORT.height, expectation.regions as NumericRegion[]);
      return comparisons.every((entry) => entry.pass);
    }, { timeout: 60_000, intervals: [500, 1000, 2000] }).toBe(true);
    if (!screenshot) throw new Error("screenshot was not captured");
    const behavior = requiredCatalogBehavior(item.id);
    if (behavior) {
      const region = expectation.kind === "numeric"
        ? (expectation.regions as NumericRegion[]).find((entry) => entry.label === "subject")
        : undefined;
      if (!region || region.colors[0]?.name !== "skin-tone model texture") {
        throw new Error(`${behavior} requires the independently authored skin-tone subject region`);
      }
      result.behavior = await runCatalogBehavior(page, behavior, region, rect, (label, bytes) => behaviorFrames.push({ label, bytes }));
    }
    result.status = "passed";
  } catch (error) {
    result.errors.push(redactUrls(error instanceof Error ? error.message : String(error)));
  } finally {
    try { await context?.close(); } catch (error) { result.errors.push(`context cleanup: ${String(error)}`); }
    try { await server?.close(); } catch (error) { result.errors.push(`server cleanup: ${String(error)}`); }
    for (const issue of issues) {
      let implicitFavicon = false;
      try { implicitFavicon = !declaresIcon && Boolean(issue.url) && new URL(issue.url!).pathname === "/favicon.ico"; } catch { /* retain the error */ }
      // Browsers may request the conventional favicon even when the page never
      // declared one. A missing declared icon and every other failed request fail.
      if (!implicitFavicon) result.errors.push(issue.message);
    }
    if (screenshot) {
      const path = testInfo.outputPath(`${item.id.replace(/[^a-z0-9_-]/gi, "-")}.png`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, screenshot);
      result.screenshot = relative(ROOT, path);
      result.screenshotSha256 = sha256(screenshot);
    }
    if (behaviorFrames.length) result.behaviorFrames = behaviorFrames.map(({ label, bytes }) => {
      const path = testInfo.outputPath(`${item.id.replace(/[^a-z0-9_-]/gi, "-")}-${label}.png`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
      return { label, screenshot: relative(ROOT, path), sha256: sha256(bytes) };
    });
    result.assertions = comparisons;
    if (result.errors.length) result.status = "failed";
  }
  return result;
}

// Vitest imports the pure helpers above for source-only tests. No browser is
// launched by those tests; Playwright registers this suite during Phase B.
if (process.env.VITEST !== "true") {
  test.describe("packed native example catalog", () => {
    test.setTimeout(6_000_000);
    let inputs: { gate: BrowserGateRecord & { runId: string }; candidatePlan: string; consumerReport: string; examplesReport: string };
    test.beforeAll(async () => {
      // Defense in depth: the remote launcher validates before starting a job;
      // a direct invocation must independently fail closed too.
      const gatePath = environment("AURA3D_CODE_COMPLETE_GATE");
      const candidatePlan = environment("A3D_RELEASE_PLAN");
      const consumerReport = environment("NATIVE_CONSUMER_SOURCE_REPORT");
      const examplesReport = environment("NATIVE_EXAMPLES_SOURCE_REPORT");
      const gateModulePath = "../../tools/native-capability-gate/index.mjs";
      const gateModule = await import(gateModulePath) as {
        validateAcceptanceGate(input: { root: string; gatePath: string }): BrowserGateRecord & { runId: string };
      };
      const gate = bindBrowserGate(() => gateModule.validateAcceptanceGate({ root: ROOT, gatePath }), {
        candidatePlan, reports: { sourceConsumerReport: consumerReport, examplesSourceReport: examplesReport }
      });
      inputs = { gate, candidatePlan, consumerReport, examplesReport };
    });
    test("all supported candidate-built templates and examples match independent subject expectations", async ({ browser }, testInfo) => {
      const runId = environment("NATIVE_ACCEPTANCE_RUN_ID");
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(runId)) throw new Error("invalid acceptance run ID");
      const { gate, candidatePlan, consumerReport, examplesReport } = inputs;
      const consumerPath = resolve(ROOT, consumerReport);
      const examplesPath = resolve(ROOT, examplesReport);
      const candidateSha256 = sha256(readFileSync(resolve(ROOT, candidatePlan)));
      if (candidateSha256 !== gate.candidatePlan.sha256) throw new Error("Candidate plan changed after gate validation");
      const consumerBytes = readFileSync(consumerPath), examplesBytes = readFileSync(examplesPath);
      if (sha256(consumerBytes) !== gate.sourceConsumerReport?.sha256 || sha256(examplesBytes) !== gate.examplesSourceReport?.sha256) {
        throw new Error("Source reports changed after gate validation");
      }
      const consumer = JSON.parse(consumerBytes.toString("utf8")) as SourceReport;
      const examples = JSON.parse(examplesBytes.toString("utf8")) as SourceReport;
      for (const report of [consumer, examples]) {
        if (report.schema !== "aura3d.native-consumers/1" || report.phase !== "source" || report.runId !== gate.runId ||
            (report.candidate?.sha256 ?? report.candidateSha256) !== candidateSha256 || !Array.isArray(report.projects)) {
          throw new Error("source report is missing, is not a source report, or belongs to a different candidate");
        }
      }
      // These Phase A validators re-hash candidate archives, manifests, locks,
      // installed package identities, retained project content and check status.
      const cleanModulePath = "../../tools/package-clean-install/index.ts";
      const examplesModulePath = "../../tools/agent-examples/index.ts";
      const planModulePath = "../../tools/release/exact-release-plan.mjs";
      const release = await import(planModulePath) as { loadValidatedReleasePlan(root: string, path: string): { reference: { path: string; sha256: string } } | null };
      const plan = release.loadValidatedReleasePlan(ROOT, candidatePlan);
      if (!plan || plan.reference.path !== candidatePlan || plan.reference.sha256 !== gate.candidatePlan.sha256) throw new Error("validated candidate plan is unavailable or differs from the gate");
      const clean = await import(cleanModulePath) as { validateSourceConsumerReport(root: string, path: string, plan: unknown): unknown };
      const exampleTools = await import(examplesModulePath) as {
        validateExampleSourceReport(root: string, path: string, plan?: string): unknown;
        collectSupportedExampleCatalog(root: string): CatalogCase[];
        collectCapabilityCatalog(root: string): CatalogCase[];
      };
      if (typeof clean.validateSourceConsumerReport !== "function" || typeof exampleTools.validateExampleSourceReport !== "function") {
        throw new Error("source-report validators are unavailable");
      }
      await clean.validateSourceConsumerReport(ROOT, consumerPath, plan);
      await exampleTools.validateExampleSourceReport(ROOT, examplesPath, candidatePlan);
      const templateModulePath = "../../packages/create-aura3d/src/index.ts";
      const templates = await import(templateModulePath) as { CREATE_AURA3D_TEMPLATES: readonly string[] };
      const capabilityCatalog = exampleTools.collectCapabilityCatalog(ROOT);
      const documentedCatalog = exampleTools.collectSupportedExampleCatalog(ROOT);
      if (!templates.CREATE_AURA3D_TEMPLATES.length || !capabilityCatalog.length || !documentedCatalog.length) {
        throw new Error("template, capability and documented example inventories must all be nonempty");
      }
      const catalog: CatalogCase[] = [
        ...templates.CREATE_AURA3D_TEMPLATES.map((name) => ({ id: `template:${name}`, kind: "template" as const })),
        ...capabilityCatalog,
        ...documentedCatalog
      ];
      const catalogErrors = catalogSetErrors(catalog.map(({ id }) => id), catalog.map(({ id }) => id));
      if (catalogErrors.length) throw new Error(catalogErrors.join("; "));
      let expectations = new Map<string, VisualExpectation>();
      let expectationError: string | undefined;
      try {
        expectations = loadExpectations();
      } catch (error) {
        expectationError = error instanceof Error ? error.message : String(error);
      }
      const expectedIds = catalog.map(({ id }) => id);
      const unexpected = [...expectations.keys()].filter((id) => !expectedIds.includes(id));
      if (unexpected.length) expectationError = `unexpected visual expectations: ${unexpected.join(", ")}`;
      const cases: CaseResult[] = [];
      const reportPath = resolve(ROOT, "tests/reports/native-examples-catalog", runId, "browser.json");
      const writeReport = (): void => {
        mkdirSync(dirname(reportPath), { recursive: true });
        writeFileSync(reportPath, `${JSON.stringify({
          schema: "aura3d-native-examples-browser@1", phase: "browser", runId, candidateSha256,
          pass: cases.length === catalog.length && cases.every((entry) => entry.status === "passed"),
          sourceReportSha256: gate.sourceConsumerReport!.sha256, examplesSourceReportSha256: gate.examplesSourceReport!.sha256,
          expectationsSha256: existsSync(resolve(ROOT, EXPECTATIONS_PATH)) ? sha256(readFileSync(resolve(ROOT, EXPECTATIONS_PATH))) : null,
          browser: { name: testInfo.project.use.browserName, version: browser.version(), project: testInfo.project.name,
            platform: process.platform, architecture: process.arch },
          harness: { contextObserver: "records canvas WebGL2/WebGPU context requests", changesToConsumerFiles: [] }, cases
        }, null, 2)}\n`);
      };
      for (const item of catalog) {
        const report = item.kind === "template" ? consumer : examples;
        const project = report.projects.find((entry) => (entry.id ?? (entry.template ? `template:${entry.template}` : "")) === item.id);
        const sourceCase = item.kind === "template" ? undefined : report.cases?.find((entry) => entry.id === item.id);
        const expectation = expectations.get(item.id);
        if (!project || !expectation || expectationError || (item.kind !== "template" && sourceCase?.status !== "passed")) {
          cases.push({ id: item.id, kind: item.kind, status: "failed", assertions: [], errors: [
            ...(!project ? ["missing retained built source project"] : []),
            ...(!expectation ? ["missing independently authored visual expectation"] : []),
            ...(expectationError ? [expectationError] : []),
            ...(item.kind !== "template" && sourceCase?.status !== "passed" ? ["source case missing or did not pass"] : [])
          ] });
        } else {
          try {
            const inventory = outputInventory(project, item.kind);
            const result = await runCase(browser, testInfo, item, confinedFile(ROOT, project.path), inventory, expectation, project.outputEntry ?? "index.html");
            result.sourceProject = project.path;
            result.sourceProjectSha256 = project.projectSha256;
            result.outputSha256 = project.outputSha256;
            cases.push(result);
          } catch (error) {
            cases.push({ id: item.id, kind: item.kind, status: "failed", assertions: [], errors: [
              error instanceof Error ? error.message : String(error)
            ] });
          }
        }
        writeReport();
      }
      expect(catalogSetErrors(expectedIds, cases.map(({ id }) => id))).toEqual([]);
      expect(cases.filter(({ status }) => status !== "passed"), `failing catalog cases; report: ${reportPath}`).toEqual([]);
    });
  });
}
