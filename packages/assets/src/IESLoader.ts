import { mergeAssetRequestOptions, type AssetLoadRequest, type AssetLoader } from "./AssetLoader.js";
import type { LoadContext } from "./LoadContext.js";
import { fetchBytes } from "./LoaderFetch.js";

/** Independently parsed, Type-C LM-63 photometric data. Angles are in degrees. */
export interface IESProfile {
  readonly format: "ies-lm63";
  readonly version: string;
  readonly photometricType: "C";
  readonly units: "feet" | "meters";
  readonly lampCount: number;
  /** `null` denotes an absolute-photometry file (its lamp lumens field is -1). */
  readonly lumensPerLamp: number | null;
  readonly candelaMultiplier: number;
  readonly ballastFactor: number;
  readonly lampPhotometricFactor: number;
  /** LM-63-2019 generation code; metadata, not a lamp multiplier. */
  readonly generationType?: number;
  readonly lampMultiplier: number;
  readonly tiltMultiplier: number;
  readonly inputWatts: number;
  readonly luminousDimensions: readonly [number, number, number];
  readonly verticalAngles: readonly number[];
  readonly horizontalAngles: readonly number[];
  /** Horizontal-major rows, with vertical angles varying fastest, in candelas. */
  readonly candela: readonly number[];
  readonly symmetry: "rotational" | "quadrant" | "bilateral" | "none";
}

export interface IESParseOptions {
  /** Additional linear scale applied to the measured luminaire output. Default 1. */
  readonly lampMultiplier?: number;
  /** Tilt-table angle in degrees; used for embedded TILT=INCLUDE tables. Default 0. */
  readonly tiltDegrees?: number;
  /** Maximum number of vertical or horizontal angles (hard ceiling 4096). */
  readonly maxAngles?: number;
  /** Maximum number of candela samples (hard ceiling 1,048,576). */
  readonly maxSamples?: number;
}

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ANGLES = 4096;
const MAX_SAMPLES = 1024 * 1024;
const MAX_VALUE = 1e12;
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function fail(reason: string): never { throw new Error(`Invalid or unsupported IES profile: ${reason}`); }
function finiteBounded(value: number, name: string, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max) fail(`${name} must be within [${min}, ${max}]`);
  return value;
}
function count(value: number, name: string, max: number): number {
  if (!Number.isInteger(value) || value < 1 || value > max) fail(`${name} must be an integer within [1, ${max}]`);
  return value;
}
function sortedAngles(values: readonly number[], name: string, max: number): void {
  for (let i = 0; i < values.length; i++) {
    finiteBounded(values[i]!, name, 0, max);
    if (i > 0 && values[i]! <= values[i - 1]!) fail(`${name} must be strictly increasing`);
  }
}
function interpolate(values: readonly number[], samples: readonly number[], angle: number): number {
  if (values.length === 1 || angle <= values[0]!) return samples[0]!;
  const end = values.length - 1;
  if (angle >= values[end]!) return samples[end]!;
  let lo = 0;
  let hi = end;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (values[mid]! <= angle) lo = mid; else hi = mid;
  }
  const t = (angle - values[lo]!) / (values[hi]! - values[lo]!);
  return samples[lo]! + (samples[hi]! - samples[lo]!) * t;
}

/**
 * Parse a bounded LM-63 Type-C distribution. External tilt files and Type-A/B
 * coordinate systems are rejected explicitly; no referenced URL is fetched.
 * Table ordering and symmetry follow IESNA LM-63-2002 sections 5.4–5.19;
 * this implementation and its numerical fixtures were authored for Aura3D.
 * Measured candela is for the whole luminaire: lampCount is metadata, not a
 * second multiplier. The file's candela and ballast factors, its historical
 * lamp-photometric factor, the interpolated tilt factor and the caller's
 * lampMultiplier apply linearly. The 1995/2002 reserved field and 2019
 * generation-type field are never used as photometric multipliers.
 */
export function parseIES(source: string, options: IESParseOptions = {}): IESProfile {
  if (typeof source !== "string" || source.length > MAX_BYTES) fail(`input must be text no larger than ${MAX_BYTES} characters`);
  const angleLimit = count(options.maxAngles ?? MAX_ANGLES, "maxAngles", MAX_ANGLES);
  const sampleLimit = count(options.maxSamples ?? MAX_SAMPLES, "maxSamples", MAX_SAMPLES);
  const lampMultiplier = finiteBounded(options.lampMultiplier ?? 1, "lampMultiplier", 0, MAX_VALUE);
  const tiltDegrees = finiteBounded(options.tiltDegrees ?? 0, "tiltDegrees", 0, 180);
  const lines = source.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  const header = lines[0]?.trim() ?? "";
  if (!/^(?:IESNA(?:91|:LM-63-(?:1986|1991|1995|2002|2019))?|IES:LM-63-2019)$/i.test(header)) fail("missing or unsupported IESNA/LM-63 version header");
  const tiltIndex = lines.findIndex((line, index) => index > 0 && /^\s*TILT\s*=/i.test(line));
  if (tiltIndex < 0) fail("missing TILT declaration");
  const tilt = lines[tiltIndex]!.replace(/^\s*TILT\s*=\s*/i, "").trim().toUpperCase();
  if (tilt !== "NONE" && tilt !== "INCLUDE") fail("external TILT files are not supported; include the tilt table in the admitted profile");
  const body = lines.slice(tiltIndex + 1).join(" ").trim();
  const tokens = body.length ? body.split(/[\s,]+/) : [];
  let cursor = 0;
  const next = (name: string): number => {
    const token = tokens[cursor++];
    if (token === undefined || !NUMBER.test(token)) fail(`missing or nonnumeric ${name}`);
    const value = Number(token);
    if (!Number.isFinite(value)) fail(`nonfinite ${name}`);
    return value;
  };
  const take = (length: number, name: string): number[] => Array.from({ length }, () => next(name));
  let tiltMultiplier = 1;
  if (tilt === "INCLUDE") {
    const geometry = next("tilt geometry");
    if (geometry !== 1 && geometry !== 2 && geometry !== 3) fail("tilt geometry must be 1, 2 or 3");
    const n = count(next("tilt angle count"), "tilt angle count", angleLimit);
    const angles = take(n, "tilt angle");
    sortedAngles(angles, "tilt angle", 180);
    const factors = take(n, "tilt factor");
    factors.forEach((factor) => finiteBounded(factor, "tilt factor", 0, MAX_VALUE));
    tiltMultiplier = interpolate(angles, factors, tiltDegrees);
  }
  const lampCount = count(next("lamp count"), "lamp count", 1_000_000);
  const lumens = next("lumens per lamp");
  if (lumens !== -1) finiteBounded(lumens, "lumens per lamp", 0, MAX_VALUE);
  const candelaMultiplier = finiteBounded(next("candela multiplier"), "candela multiplier", 0, MAX_VALUE);
  const nv = count(next("vertical angle count"), "vertical angle count", angleLimit);
  const nh = count(next("horizontal angle count"), "horizontal angle count", angleLimit);
  if (nv * nh > sampleLimit) fail(`candela sample count exceeds ${sampleLimit}`);
  const type = next("photometric type");
  if (type !== 1) fail("only Type-C photometric angles are supported");
  const unitCode = next("units");
  if (unitCode !== 1 && unitCode !== 2) fail("units must be 1 (feet) or 2 (meters)");
  const dimensions = take(3, "luminous dimension");
  dimensions.forEach((v) => finiteBounded(v, "luminous dimension", -MAX_VALUE, MAX_VALUE));
  const ballastFactor = finiteBounded(next("ballast factor"), "ballast factor", 0, MAX_VALUE);
  const lampPhotometricField = finiteBounded(next("lamp photometric factor"), "lamp photometric factor", 0, MAX_VALUE);
  // LM-63-1995 and later reserve this field; it is not a multiplier.
  const modern = /^(?:IESNA:LM-63-(?:1995|2002|2019)|IES:LM-63-2019)$/i.test(header);
  const generationType = /^(?:IESNA|IES):LM-63-2019$/i.test(header) ? lampPhotometricField : undefined;
  const lampPhotometricFactor = modern ? 1 : lampPhotometricField;
  const inputWatts = finiteBounded(next("input watts"), "input watts", 0, MAX_VALUE);
  const verticalAngles = take(nv, "vertical angle");
  const horizontalAngles = take(nh, "horizontal angle");
  sortedAngles(verticalAngles, "vertical angle", 180);
  sortedAngles(horizontalAngles, "horizontal angle", 360);
  if (horizontalAngles[0] !== 0) fail("horizontal angles must begin at 0 degrees");
  const last = horizontalAngles[nh - 1]!;
  const symmetry = nh === 1 ? "rotational" : last === 90 ? "quadrant" : last === 180 ? "bilateral" : last === 360 ? "none" : fail("horizontal angles must end at 90, 180 or 360 degrees");
  const multiplier = candelaMultiplier * ballastFactor * lampPhotometricFactor * tiltMultiplier * lampMultiplier;
  if (!Number.isFinite(multiplier)) fail("combined photometric multiplier overflows");
  const candela = take(nv * nh, "candela value").map((value) => {
    finiteBounded(value, "candela value", 0, MAX_VALUE);
    const scaled = value * multiplier;
    return finiteBounded(scaled, "scaled candela value", 0, MAX_VALUE);
  });
  if (cursor !== tokens.length) fail("unexpected data after candela table");
  return {
    format: "ies-lm63", version: header, photometricType: "C", units: unitCode === 1 ? "feet" : "meters",
    lampCount, lumensPerLamp: lumens === -1 ? null : lumens, candelaMultiplier, ballastFactor,
    lampPhotometricFactor, ...(generationType !== undefined ? { generationType } : {}), lampMultiplier, tiltMultiplier, inputWatts,
    luminousDimensions: [dimensions[0]!, dimensions[1]!, dimensions[2]!],
    verticalAngles, horizontalAngles, candela, symmetry
  };
}

/** Bilinear Type-C angular interpolation; angles outside the measured vertical range emit no light. */
export function sampleIESProfile(profile: IESProfile, verticalDegrees: number, horizontalDegrees: number): number {
  finiteBounded(verticalDegrees, "verticalDegrees", 0, 180);
  if (!Number.isFinite(horizontalDegrees)) fail("horizontalDegrees must be finite");
  const vertical = profile.verticalAngles;
  const horizontal = profile.horizontalAngles;
  if (verticalDegrees < vertical[0]! || verticalDegrees > vertical[vertical.length - 1]!) return 0;
  let azimuth = ((horizontalDegrees % 360) + 360) % 360;
  if (profile.symmetry === "quadrant") {
    if (azimuth > 180) azimuth = 360 - azimuth;
    if (azimuth > 90) azimuth = 180 - azimuth;
  }
  else if (profile.symmetry === "bilateral" && azimuth > 180) azimuth = 360 - azimuth;
  if (!vertical.length || !horizontal.length || profile.candela.length !== vertical.length * horizontal.length) fail("invalid profile table dimensions");
  const rowAt = (row: number): number => {
    let lo = 0, hi = vertical.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (vertical[mid]! <= verticalDegrees) lo = mid; else hi = mid;
    }
    const first = profile.candela[row * vertical.length + lo]!;
    if (lo === hi) return first;
    const t = (verticalDegrees - vertical[lo]!) / (vertical[hi]! - vertical[lo]!);
    return first + (profile.candela[row * vertical.length + hi]! - first) * t;
  };
  if (horizontal.length === 1 || azimuth <= horizontal[0]!) return rowAt(0);
  let lo = 0, hi = horizontal.length - 1;
  if (azimuth >= horizontal[hi]!) return rowAt(hi);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (horizontal[mid]! <= azimuth) lo = mid; else hi = mid;
  }
  const a = rowAt(lo), b = rowAt(hi);
  return a + (b - a) * (azimuth - horizontal[lo]!) / (horizontal[hi]! - horizontal[lo]!);
}

/** AssetManager-compatible loader. Only the admitted URL is fetched; external tilt references are rejected. */
export class IESLoader implements AssetLoader<IESProfile> {
  readonly type = "ies";
  constructor(private readonly options: IESParseOptions = {}) {}
  canLoad(request: AssetLoadRequest): boolean { return request.type === "ies" || request.type === "photometric" || /\.ies(?:[?#]|$)/i.test(request.url); }
  async load(request: AssetLoadRequest, context: LoadContext): Promise<IESProfile> {
    context.throwIfAborted(request.url);
    const url = context.resolve(request.url);
    const policy = mergeAssetRequestOptions(context.requestOptionsFor(url), request);
    const maxBytes = Math.min(policy.maxBytes ?? MAX_BYTES, MAX_BYTES);
    const bytes = await fetchBytes(url, context.signalFor(request.signal), (progress) => {
      request.onProgress?.({ url, phase: "document", loadedBytes: progress.loaded, ...(progress.total !== undefined ? { totalBytes: progress.total } : {}) });
    }, { ...policy, maxBytes });
    context.throwIfAborted(url);
    const profile = parseIES(new TextDecoder("utf-8", { fatal: true }).decode(bytes), this.options);
    request.onProgress?.({ url, phase: "complete", loadedBytes: bytes.byteLength });
    return profile;
  }
}
