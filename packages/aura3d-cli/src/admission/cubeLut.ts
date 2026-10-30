/**
 * GU47 E-C: admission check for `aura3d assets add <file.cube> --type lut`.
 *
 * The engine binds the LUT in the S10b display grade (`post/CubeLut.ts`
 * `parseCubeLut` → `post/DisplayLutCache.ts`), so a file that the runtime
 * parser would reject is refused here instead of shipping and silently
 * rendering the identity grade. Same rules and error codes as the runtime
 * parser: a 3-D `LUT_3D_SIZE` in [2, 65], no `LUT_1D_SIZE`, exactly size³
 * numeric RGB rows; `TITLE`, `DOMAIN_MIN`/`DOMAIN_MAX`, `LUT_3D_INPUT_RANGE`,
 * comments and blank lines are allowed.
 */

export interface CubeLutAdmission {
  readonly size: number;
  readonly rows: number;
  readonly title?: string;
}

const MAX_LUT_SIZE = 65;
const HEADER_KEYWORDS = new Set(["TITLE", "DOMAIN_MIN", "DOMAIN_MAX", "LUT_1D_INPUT_RANGE", "LUT_3D_INPUT_RANGE"]);

export function validateCubeLut(text: string): CubeLutAdmission {
  let size: number | null = null;
  let title: string | undefined;
  let rows = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const keyword = line.split(/\s+/)[0]!;
    const rest = line.slice(keyword.length).trim();
    if (keyword === "LUT_1D_SIZE") {
      throw new Error(`CUBE_LUT_1D_UNSUPPORTED: 1-D LUTs cannot bind to the display-grade 3-D LUT (size ${rest}).`);
    }
    if (keyword === "LUT_3D_SIZE") {
      const parsed = Number(rest);
      if (!Number.isInteger(parsed) || parsed < 2 || parsed > MAX_LUT_SIZE) {
        throw new Error(`CUBE_LUT_SIZE_INVALID: LUT_3D_SIZE ${rest} must be an integer in [2, ${MAX_LUT_SIZE}].`);
      }
      size = parsed;
      continue;
    }
    if (HEADER_KEYWORDS.has(keyword)) {
      if (keyword === "TITLE") title = rest.replace(/^"|"$/g, "");
      continue;
    }
    const parts = line.split(/\s+/);
    if (parts.length < 3 || !parts.slice(0, 3).every((part) => Number.isFinite(Number(part)))) {
      throw new Error(`CUBE_LUT_MALFORMED: unrecognised line "${line.slice(0, 48)}".`);
    }
    rows += 1;
  }
  if (size === null) throw new Error("CUBE_LUT_MALFORMED: missing LUT_3D_SIZE.");
  if (rows !== size * size * size) {
    throw new Error(`CUBE_LUT_MALFORMED: expected ${size * size * size} data rows for size ${size}, found ${rows}.`);
  }
  return { size, rows, ...(title ? { title } : {}) };
}
