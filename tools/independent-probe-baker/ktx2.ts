import {
  encodeRgb9e5ProbeKTX2,
  type Rgb9e5ProbeKTX2Options,
  type Rgb9e5ProbeLevel,
} from "../../packages/assets/src/exporters/Rgb9e5ProbeKTX2.js";
import type { BakedEnvironmentProbe } from "./index.js";

export type ProbeKTX2Options = Rgb9e5ProbeKTX2Options;

/**
 * Encode the independent bake's RGB mips with the shared assets exporter.
 * This writes no files and does not convert or infer source color primaries.
 */
export function encodeProbeKTX2(probe: Pick<BakedEnvironmentProbe, "mips">, options: ProbeKTX2Options): Uint8Array {
  if (!probe || !Array.isArray(probe.mips)) throw new RangeError("probe KTX2 requires cube mip levels");
  const levels: Rgb9e5ProbeLevel[] = [];
  for (const mip of probe.mips) {
    if (!mip) throw new RangeError("probe KTX2 has an invalid mip level");
    levels.push({ size: mip.size, channels: 3, faces: mip.faces });
  }
  return encodeRgb9e5ProbeKTX2(levels, options);
}
