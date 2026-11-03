/**
 * Display-referred transforms for linear RGB. Exposure is applied once, before
 * the curve, and the returned values are linear display light (encoding comes
 * later). These implementations are independently structured around published
 * equations: Reinhard et al. 2002, Hill's ACES RRT/ODT fit, the published AgX
 * log/contrast fit, the Khronos PBR Neutral curve, and the Cineon filmic fit.
 *
 * The ACES and AgX matrices operate on RGB triples as rows. Keeping the matrix
 * operation explicit here also makes the CPU reference independent of GLSL's
 * column-major constructor semantics.
 */

export type AuraToneOperator = "none" | "linear" | "reinhard" | "aces" | "agx" | "neutral";
export type Vec3 = readonly [number, number, number];
type MatrixRows = readonly [Vec3, Vec3, Vec3];

const limit = (value: number): number => Math.max(0, Math.min(1, value));
const mapChannels = (color: Vec3, fn: (channel: number) => number): Vec3 => [fn(color[0]), fn(color[1]), fn(color[2])];
const exposureScale = (color: Vec3, exposure: number): Vec3 => mapChannels(color, (v) => v * exposure);
// Nonlinear display curves are defined for non-negative scene radiance.
const radiance = (color: Vec3, exposure: number): Vec3 => mapChannels(exposureScale(color, exposure), (v) => Math.max(0, v));
const matrixTransform = (matrix: MatrixRows, color: Vec3): Vec3 => {
  const dot = (row: Vec3): number => row[0] * color[0] + row[1] * color[1] + row[2] * color[2];
  return [dot(matrix[0]), dot(matrix[1]), dot(matrix[2])];
};

export function linearToneMapping(color: Vec3, exposure: number): Vec3 {
  return mapChannels(exposureScale(color, exposure), limit);
}

/** Reinhard et al., Photographic Tone Reproduction for Digital Images, 2002. */
export function reinhardToneMapping(color: Vec3, exposure: number): Vec3 {
  return mapChannels(radiance(color, exposure), (v) => limit(v / (1 + v)));
}

/** John Hable's filmic Cineon approximation, returned in linear display light. */
export function cineonToneMapping(color: Vec3, exposure: number): Vec3 {
  return mapChannels(exposureScale(color, exposure), (v) => {
    const x = Math.max(0, v - 0.004);
    const numerator = x * (6.2 * x + 0.5);
    const denominator = x * (6.2 * x + 1.7) + 0.06;
    return (numerator / denominator) ** 2.2;
  });
}

// Stephen Hill's published ACES fit. The 1/0.6 viewing scale is part of
// Aura3D's existing operator contract, not part of the ACES standard.
const ACES_IN: MatrixRows = [
  [0.59719, 0.35458, 0.04823],
  [0.076, 0.90834, 0.01566],
  [0.0284, 0.13383, 0.83777]
];
const ACES_OUT: MatrixRows = [
  [1.60475, -0.53108, -0.07367],
  [-0.10208, 1.10813, -0.00605],
  [-0.00327, -0.07276, 1.07602]
];

export function acesFilmicToneMapping(color: Vec3, exposure: number): Vec3 {
  const working = matrixTransform(ACES_IN, radiance(color, exposure / 0.6));
  const fitted = mapChannels(working, (x) =>
    ((x + 0.0245786) * x - 0.000090537) / ((0.983729 * x + 0.432951) * x + 0.238081)
  );
  return mapChannels(matrixTransform(ACES_OUT, fitted), limit);
}

// The AgX fit uses Rec.2020 working primaries, an inset/outset, a log2
// exposure window and a published sixth-degree contrast approximation.
const TO_WIDE: MatrixRows = [
  [0.6274, 0.3293, 0.0433], [0.0691, 0.9195, 0.0113], [0.0164, 0.088, 0.8956]
];
const FROM_WIDE: MatrixRows = [
  [1.6605, -0.5876, -0.0728], [-0.1246, 1.1329, -0.0083], [-0.0182, -0.1006, 1.1187]
];
const AGX_IN: MatrixRows = [
  [0.856627153315983, 0.0951212405381588, 0.0482516061458583],
  [0.137318972929847, 0.761241990602591, 0.101439036467562],
  [0.11189821299995, 0.0767994186031903, 0.811302368396859]
];
const AGX_OUT: MatrixRows = [
  [1.1271005818144368, -0.11060664309660323, -0.016493938717834573],
  [-0.1413297634984383, 1.157823702216272, -0.016493938717834257],
  [-0.14132976349843826, -0.11060664309660294, 1.2519364065950405]
];
const AGX_MIN_EV = -12.47393;
const AGX_MAX_EV = 4.026069;

/** Polynomial evaluated with Horner's rule, not a lookup texture. */
function agxContrast(value: number): number {
  return ((((((15.5 * value - 40.14) * value + 31.96) * value - 6.868) * value + 0.4298) * value + 0.1191) * value - 0.00232);
}

export function agxToneMapping(color: Vec3, exposure: number): Vec3 {
  const wide = matrixTransform(AGX_IN, matrixTransform(TO_WIDE, radiance(color, exposure)));
  const contrasted = mapChannels(wide, (v) => {
    const ev = Math.log2(Math.max(v, 1e-10));
    return agxContrast(limit((ev - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV)));
  });
  const unscaled = matrixTransform(AGX_OUT, contrasted);
  const display = mapChannels(unscaled, (v) => Math.max(0, v) ** 2.2);
  return mapChannels(matrixTransform(FROM_WIDE, display), limit);
}

/** Khronos PBR Neutral: preserve dark tones and compress/highlight-desaturate. */
export function neutralToneMapping(color: Vec3, exposure: number): Vec3 {
  const exposed = radiance(color, exposure);
  const darkest = Math.min(...exposed);
  const blackOffset = darkest < 0.08 ? darkest * (1 - 6.25 * darkest) : 0.04;
  const shifted = mapChannels(exposed, (v) => v - blackOffset);
  const peak = Math.max(...shifted);
  const knee = 0.76;
  if (peak < knee) return shifted;
  const shoulder = 1 - knee;
  const compressedPeak = 1 - shoulder * shoulder / (peak + shoulder - knee);
  const scaled = mapChannels(shifted, (v) => v * (compressedPeak / peak));
  const colorRetention = 1 / (1 + 0.15 * (peak - compressedPeak));
  return mapChannels(scaled, (v) => compressedPeak + (v - compressedPeak) * colorRetention);
}

/** Select the operator; linear input and exposure are supplied separately. */
export function applyToneOperator(operator: AuraToneOperator, color: Vec3, exposure = 1): Vec3 {
  switch (operator) {
    case "none":
    case "linear": return linearToneMapping(color, exposure);
    case "reinhard": return reinhardToneMapping(color, exposure);
    case "aces": return acesFilmicToneMapping(color, exposure);
    case "agx": return agxToneMapping(color, exposure);
    case "neutral": return neutralToneMapping(color, exposure);
    default: {
      const exhaustive: never = operator;
      throw new Error(`POST_TONE_OPERATOR_UNKNOWN:${String(exhaustive)}`);
    }
  }
}

export const POST_TONE_OPERATORS: readonly Exclude<AuraToneOperator, "none">[] = ["linear", "reinhard", "aces", "agx", "neutral"];
