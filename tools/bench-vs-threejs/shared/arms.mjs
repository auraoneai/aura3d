// Arm names, tuning rules and renderer classification shared by the gate, the tally and the author runner.
//
// Methodology v2 (see ../METHODOLOGY.md): every comparison is made between arms that do the same
// amount of work, and a speed number is only ever labelled "gpu" when the renderer string says so.

/** results.json keys under scenes.<scene>.results. The 4.1.2 file only has `three`, `aura`, `three-msaa`. */
export const ARM_KEYS = {
  /** three.js with default WebGLRenderer settings (no antialiasing). */
  threePlain: "three",
  /** three.js with 4x MSAA (`antialias: true`, or a 4-sample composer target). The equal-work baseline for Aura3D. */
  threeMsaa: "three-msaa",
  /** Aura3D with `quality: "auto"` (the default from 4.5.0). */
  auraAuto: "aura-auto",
  /** Aura3D with `quality: "production"` (the pre-4.5.0 pipeline, kept so the cost of the old path stays visible). */
  auraProduction: "aura-production",
  /** Aura3D arm as written by the 4.1.2 harness (production profile). */
  auraLegacy: "aura"
};

/** Preference order for "the Aura3D number" a release claims: the default path first. */
const AURA_PREFERENCE = [ARM_KEYS.auraAuto, ARM_KEYS.auraLegacy, ARM_KEYS.auraProduction];

export function pickAuraArm(results) {
  for (const key of AURA_PREFERENCE) if (results?.[key]) return key;
  return null;
}

/** Scene result for the Aura3D arm a release claims, or undefined. */
export function auraRun(sceneResults) {
  const key = pickAuraArm(sceneResults);
  return key ? sceneResults[key] : undefined;
}

/**
 * Equal-work rules both libraries are tuned to, recorded in every results file so a reader can check them.
 * "Tuned" means each side is given the settings its own docs recommend for this scene, not the other
 * library's defaults.
 */
export const EQUAL_WORK = Object.freeze({
  canvas: { width: 640, height: 360, devicePixelRatio: 1 },
  toneMapping: "ACES",
  antialiasing: "msaa4 on both sides, or none on both sides; never msaa on one and none on the other",
  warmupFrames: 10,
  measuredFrames: 60,
  coldLoads: 3,
  three: { preserveDrawingBuffer: false, powerPreference: "high-performance", antialias: "match the Aura3D arm", note: "no composer pass the scene does not need" },
  aura: { quality: "auto and production reported as separate arms", preserveDrawingBuffer: "default (false outside capture mode)", note: "no hand-disabled features" }
});

/**
 * Pairs each Aura3D arm with the three.js arm that does the same amount of antialiasing work.
 * `auto` and `production` render into 4x multisampled targets, so both pair with `three-msaa`.
 * The legacy `aura` key is the production profile, which is also multisampled.
 */
export function equalAaPair(auraKey) {
  if ([ARM_KEYS.auraAuto, ARM_KEYS.auraLegacy, ARM_KEYS.auraProduction].includes(auraKey)) return ARM_KEYS.threeMsaa;
  throw new Error(`unknown Aura3D arm ${auraKey}`);
}

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|softpipe|microsoft basic render|subzero/i;

/** "software" for CPU rasterisers, "gpu" for anything else with a non-empty renderer string, "unknown" otherwise. */
export function classifyRenderer(renderer) {
  if (typeof renderer !== "string" || !renderer.trim()) return "unknown";
  return SOFTWARE_RENDERER.test(renderer) ? "software" : "gpu";
}

/** Throws unless the results file was taken on a real GPU. Used before any number is labelled a GPU number. */
export function assertRealGpu(results) {
  const kind = classifyRenderer(results?.env?.renderer);
  if (kind !== "gpu") throw new Error(`refusing to label results as real-GPU: renderer is ${kind} (${results?.env?.renderer ?? "none"})`);
  return results.env.renderer;
}
