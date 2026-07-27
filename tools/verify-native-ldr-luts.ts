/**
 * Exhaustive verification of the native LDR effect LUTs against the CPU postprocess kernels.
 * Run with: pnpm tsx tools/verify-native-ldr-luts.ts
 */
import {
  BLOOM_COMPOSITE_LUT_SIZE,
  OUTLINE_BLEND_LUT_WIDTH,
  OUTLINE_LIMB_RADIX,
  OUTLINE_LUMA_SCALE,
  createBloomBrightThresholdLut,
  createBloomCompositeLut,
  createOutlineBlendLut,
  createOutlineGradientBound,
  outlineEdgeFromNumerators,
  outlineLumaNumerator,
  readBloomBrightThresholdLut
} from "../packages/rendering/src/postprocess/NativeLdrEffectLuts";

function clampByte(value: number): number {
  return Math.round(Math.max(0, Math.min(255, value)));
}

const failures: string[] = [];
function check(condition: boolean, message: () => string): void {
  if (!condition && failures.length < 40) failures.push(message());
}

// 1. Bloom bright extract: every RGB triple, against the CPU predicate.
const brightThresholds = [0, 0.0722 / 1, 0.25, 0.5, 0.75, 0.2126, 0.9282, 1];
for (const threshold of brightThresholds) {
  const lut = createBloomBrightThresholdLut(threshold);
  for (let red = 0; red < 256; red += 1) {
    for (let green = 0; green < 256; green += 1) {
      for (let blue = 0; blue < 256; blue += 1) {
        const cpu = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 >= threshold;
        const gpu = readBloomBrightThresholdLut(lut, red, green, blue);
        check(cpu === gpu, () => `bright ${threshold} rgb(${red},${green},${blue}) cpu=${cpu} lut=${gpu}`);
      }
    }
  }
}
console.log(`bright-extract: checked ${brightThresholds.length * (1 << 24)} colors`);

// 2. Bloom composite: every (source, blurred) byte pair.
const intensities = [0, 0.1, 0.35, 0.5, 1, 1.5, 2, 3.75, 8];
for (const intensity of intensities) {
  const lut = createBloomCompositeLut(intensity);
  for (let blurred = 0; blurred < BLOOM_COMPOSITE_LUT_SIZE; blurred += 1) {
    for (let source = 0; source < BLOOM_COMPOSITE_LUT_SIZE; source += 1) {
      const cpu = clampByte(source + blurred * intensity);
      const gpu = lut[(blurred * BLOOM_COMPOSITE_LUT_SIZE + source) * 4]!;
      check(cpu === gpu, () => `composite i=${intensity} src=${source} blur=${blurred} cpu=${cpu} lut=${gpu}`);
    }
  }
}
console.log(`composite: checked ${intensities.length * 65536} byte pairs`);

// 3. Outline blend: every before-byte for a spread of colors and alphas.
const colors: readonly (readonly [number, number, number, number])[] = [
  [255, 188, 64, 255],
  [0, 0, 0, 255],
  [255, 255, 255, 128],
  [17, 203, 91, 200]
];
for (const color of colors) {
  for (const opacity of [0, 0.25, 0.5, 0.85, 1]) {
    const alpha = opacity * ((color[3] ?? 255) / 255);
    const lut = createOutlineBlendLut(color, alpha);
    for (let before = 0; before < OUTLINE_BLEND_LUT_WIDTH; before += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        const cpu = clampByte(before * (1 - alpha) + color[channel]! * alpha);
        const gpu = lut[before * 4 + channel]!;
        check(cpu === gpu, () => `blend ${color.join(",")} a=${alpha} before=${before} ch=${channel} cpu=${cpu} lut=${gpu}`);
      }
    }
  }
}
console.log(`outline-blend: checked ${colors.length * 5 * 256 * 3} channel entries`);

// 4. Outline gradient: shader word arithmetic vs exact rational bound, and vs CPU float64 hypot.
const MAX_NUMERATOR = 4 * OUTLINE_LUMA_SCALE;
const thresholds = [0, 0.02, 0.22, 0.5, 1, 1.5, 2.75, 4];
let wordChecks = 0;
let floatDisagreements = 0;
const disagreementSamples: string[] = [];

for (const threshold of thresholds) {
  const bound = createOutlineGradientBound(threshold);
  check(
    bound.highWord * OUTLINE_LIMB_RADIX + bound.lowWord === Number(bound.value),
    () => `bound words mismatch at threshold ${threshold}`
  );

  // Exhaustive-in-structure sweep: gy = 0 and gx = gy diagonals plus randomized pairs, including
  // numerators placed exactly at, just below, and just above the bound.
  const candidates: number[] = [];
  for (let n = 0; n <= MAX_NUMERATOR; n += 9973) candidates.push(n);
  const exactEdge = Math.floor(Math.sqrt(Number(bound.value)));
  for (const delta of [-2, -1, 0, 1, 2]) {
    const value = exactEdge + delta;
    if (value >= 0 && value <= MAX_NUMERATOR) candidates.push(value);
  }

  for (const gx of candidates) {
    for (const gy of [0, 1, gx, Math.min(MAX_NUMERATOR, gx * 2)]) {
      wordChecks += 1;
      const words = outlineEdgeFromNumerators(gx, gy, bound);
      const exact = BigInt(gx) * BigInt(gx) + BigInt(gy) * BigInt(gy) >= bound.value;
      check(words === exact, () => `words gx=${gx} gy=${gy} t=${threshold} words=${words} exact=${exact}`);

      // How the current CPU kernel would decide, in float64 over normalized lumas.
      const cpuFloat = Math.hypot(gx / OUTLINE_LUMA_SCALE, gy / OUTLINE_LUMA_SCALE) >= threshold;
      if (cpuFloat !== exact) {
        floatDisagreements += 1;
        if (disagreementSamples.length < 8) {
          disagreementSamples.push(`t=${threshold} gx=${gx} gy=${gy} float=${cpuFloat} exact=${exact}`);
        }
      }
    }
  }
}
console.log(`outline-gradient: checked ${wordChecks} numerator pairs`);
console.log(`outline float64-vs-exact disagreements: ${floatDisagreements}`);
if (disagreementSamples.length > 0) console.log(disagreementSamples);

// 5. Luma numerator agreement with the CPU normalized luma, over all channel bytes.
for (let value = 0; value < 256; value += 1) {
  const numerator = outlineLumaNumerator(value, value, value);
  check(numerator === 10000 * value, () => `luma numerator gray ${value} -> ${numerator}`);
}
const fullWhite = outlineLumaNumerator(255, 255, 255);
check(fullWhite === OUTLINE_LUMA_SCALE, () => `white numerator ${fullWhite} !== ${OUTLINE_LUMA_SCALE}`);

if (failures.length > 0) {
  console.error(`FAILURES (${failures.length}):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log("all LUT checks passed");
