import { PRD02_IBL_FEATURE } from "../contracts/environment.js";
import type { ShaderFeature } from "../contracts/program.js";

/** The built-in global probe feature, without lane-registration side effects. */
export const PRD02_IBL_SHADER_FEATURE: ShaderFeature = {
  id: PRD02_IBL_FEATURE,
  owner: "prd02",
  flag: "A3D_QR_LIGHTING",
  hooks: ["fragment:pars", "fragment:indirect"],
  chunks: ["a3d_prd02_lighting_ibl", "a3d_prd02_lighting_ibl_call"],
  select(input) {
    return input.pass === "forward" && input.flags.on("A3D_QR_COMPILER") && input.flags.on("A3D_QR_LIGHTING")
      ? true
      : undefined;
  },
  defines(value): Readonly<Record<string, string | number | true>> {
    return value === true ? { A3D_PRD02_IBL: true } : {};
  }
};
