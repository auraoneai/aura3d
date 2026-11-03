/** Explicit input-color declaration for standard RGB9E5 probe output. */
export type StandardProbePrimaries = "bt709" | "unspecified";

export const STANDARD_PROBE_PRIMARIES_FLAG = "--standard-ktx2-primaries";
export const UNSPECIFIED_PROBE_READER_WARNING =
  "Standard RGB9E5 output has unspecified primaries; the Aura3D probe reader currently requires BT.709. No color conversion was performed.";

export function requireStandardProbePrimaries(value: unknown): StandardProbePrimaries {
  if (value !== "bt709" && value !== "unspecified") {
    throw new Error(`${STANDARD_PROBE_PRIMARIES_FLAG} requires bt709 or unspecified`);
  }
  return value;
}

/** Parse the opt-in without silently inferring a color space for an HDR file. */
export function standardProbePrimaries(argv: readonly string[]): StandardProbePrimaries | undefined {
  const index = argv.indexOf(STANDARD_PROBE_PRIMARIES_FLAG);
  if (index < 0) return undefined;
  if (argv.indexOf(STANDARD_PROBE_PRIMARIES_FLAG, index + 1) >= 0) {
    throw new Error(`${STANDARD_PROBE_PRIMARIES_FLAG} may be supplied only once`);
  }
  return requireStandardProbePrimaries(argv[index + 1]);
}
