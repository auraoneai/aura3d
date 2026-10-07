/**
 * PRD-03 Phase 2 — `.cube` LUT parser (display domain, sRGB-encoded).
 *
 * Parses the Adobe/Resolve `.cube` text format into `LutTexture3D`
 * (size³×4 Float32Array) for the S10b display-grade bake. Supported:
 * `TITLE`, `LUT_3D_SIZE`, `DOMAIN_MIN`, `DOMAIN_MAX`, `#` comments and blank
 * lines. 1-D LUTs (`LUT_1D_SIZE`) are rejected — the display grade is a
 * 3-D transform; a 1-D cube would silently per-channel-map. Sizes above 65
 * are rejected (unrealistic for a display LUT and almost certainly a corrupt
 * file). Data rows are in red-fastest order (`index = r + g·size + b·size²`)
 * and are remapped through `DOMAIN_MIN/MAX` — the default domain is [0,1].
 */

import type { LutTexture3D } from "./PostGraph";

const MAX_LUT_SIZE = 65;

function parseVec3(line: string): [number, number, number] | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const v: [number, number, number] = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  return v.every((n) => Number.isFinite(n)) ? v : null;
}

export function parseCubeLut(text: string): LutTexture3D {
  let size: number | null = null;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const rows: [number, number, number][] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const keyword = line.split(/\s+/)[0]!;
    const rest = line.slice(keyword.length).trim();

    if (keyword === "LUT_1D_SIZE") {
      throw new Error(`CUBE_LUT_1D_UNSUPPORTED: 1-D LUTs cannot bake into the display-grade TEXTURE_3D (size ${rest}).`);
    }
    if (keyword === "LUT_3D_SIZE") {
      const parsed = Number(rest);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`CUBE_LUT_SIZE_INVALID: ${rest}`);
      }
      if (parsed > MAX_LUT_SIZE) {
        throw new Error(`CUBE_LUT_SIZE_INVALID: 3-D size ${parsed} exceeds ${MAX_LUT_SIZE}.`);
      }
      size = parsed;
      continue;
    }
    if (keyword === "DOMAIN_MIN") {
      const v = parseVec3(rest);
      if (v) domainMin = v;
      continue;
    }
    if (keyword === "DOMAIN_MAX") {
      const v = parseVec3(rest);
      if (v) domainMax = v;
      continue;
    }
    if (keyword === "TITLE" || keyword === "LUT_1D_INPUT_RANGE" || keyword === "LUT_3D_INPUT_RANGE") {
      continue;
    }
    // Anything else must be a data row — or the file is malformed.
    const v = parseVec3(line);
    if (!v) {
      throw new Error(`CUBE_LUT_MALFORMED: unrecognised line "${line.slice(0, 48)}".`);
    }
    rows.push(v);
  }

  if (size === null) {
    throw new Error("CUBE_LUT_MALFORMED: missing LUT_3D_SIZE.");
  }
  if (rows.length !== size * size * size) {
    throw new Error(`CUBE_LUT_MALFORMED: expected ${size * size * size} data rows for size ${size}, found ${rows.length}.`);
  }

  const data = new Float32Array(size * size * size * 4);
  for (let i = 0; i < rows.length; i += 1) {
    const [r, g, b] = rows[i]!;
    const base = i * 4;
    // .cube rows are authored in the file's input domain; remap to [0,1].
    data[base] = (r - domainMin[0]) / (domainMax[0] - domainMin[0]);
    data[base + 1] = (g - domainMin[1]) / (domainMax[1] - domainMin[1]);
    data[base + 2] = (b - domainMin[2]) / (domainMax[2] - domainMin[2]);
    data[base + 3] = 1;
  }
  return { size, data };
}
