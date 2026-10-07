/**
 * PRD-03 — `aura3d codemod post-v2 <glob> --report` (C-39).
 *
 * Phase 0 is REPORT-ONLY: `transform` returns the source unchanged and emits
 * one row per recognized legacy post construct with the mapping the v2 chain
 * will apply — `exact` (construct survives), `approximate` (semantics change:
 * values rescaled by v2 stage definitions), or `none` (no v2 path yet —
 * author must review). Write mode lands with Phase 5.
 */

/** @type {readonly {re: RegExp, construct: string, mapping: "exact"|"approximate"|"none", target?: string, note?: string}[]} */
const CONSTRUCTS = [
  { re: /\beffects\.bloom\s*\(/g, construct: "effects.bloom", mapping: "exact", target: "v2 S9-bloom (native HDR bloom)", note: "field names survive; intensity/threshold rescale under v2 definitions" },
  { re: /\beffects\.neonBloom\s*\(/g, construct: "effects.neonBloom", mapping: "exact", target: "v2 S9-bloom preset" },
  { re: /\beffects\.ambientOcclusion\s*\(/g, construct: "effects.ambientOcclusion", mapping: "approximate", target: "v2 S2-gtao", note: "radius/density re-derived from GTAO world-space params" },
  { re: /\beffects\.contactOcclusion\s*\(/g, construct: "effects.contactOcclusion", mapping: "approximate", target: "v2 contact AO (GTAO range)" },
  { re: /\beffects\.colorGrade\s*\(/g, construct: "effects.colorGrade", mapping: "approximate", target: "v2 S10b-grade", note: "exposure becomes real in Phase 1; shadows/highlights/lut Phase 5" },
  { re: /\beffects\.antiAlias\s*\(/g, construct: "effects.antiAlias", mapping: "approximate", target: "v2 S11-aa tier", note: "mode maps to tier AA (never FXAA on MSAA); TAA moves behind A3D_QR_POST_TAA" },
  { re: /\beffects\.outline\s*\(/g, construct: "effects.outline", mapping: "approximate", target: "v2 outline stage" },
  { re: /\beffects\.screenSpaceReflections\s*\(/g, construct: "effects.screenSpaceReflections", mapping: "approximate", target: "v2 S4-ssr" },
  { re: /\beffects\.depthOfField\s*\(/g, construct: "effects.depthOfField", mapping: "approximate", target: "v2 S6-dof" },
  { re: /\beffects\.motionBlur\s*\(/g, construct: "effects.motionBlur", mapping: "approximate", target: "v2 S7-motion-blur" },
  { re: /\beffects\.volumetricFog\s*\(/g, construct: "effects.volumetricFog", mapping: "approximate", target: "v2 S5-god-rays" },
  { re: /\bchromaticAberration\s*[:()]/g, construct: "chromaticAberration", mapping: "approximate", target: "v2 display-space aberration" },
  { re: /\bfilmGrain\s*[:()]/g, construct: "filmGrain", mapping: "approximate", target: "v2 film-grain stage" },
  { re: /\bvignette\s*[:()]/g, construct: "vignette", mapping: "approximate", target: "v2 cinematic vignette" },
  { re: /\btoneMapping\s*:/g, construct: "renderer.toneMapping", mapping: "exact", target: "output.toneMapping (ACES/AgX/Neutral/linear/reinhard/none)" },
  { re: /\btoneMappingExposure\s*:/g, construct: "renderer.toneMappingExposure", mapping: "exact", target: "exposure uniform (wired Phase 1)" },
  { re: /\bfxaa\b/g, construct: "fxaa", mapping: "exact", target: "v2 S11-aa-fxaa (r185 port + dither)" },
  { re: /\bPostProcessPass\b/g, construct: "PostProcessPass", mapping: "none", note: "legacy pass class — v2 has no drop-in; rewrite as C-13 custom pass or drop" },
  { re: /\baddPostPass\s*\(/g, construct: "app.addPostPass", mapping: "exact", target: "C-13 registered custom pass" },
  { re: /\bsetQualityTier\s*\(/g, construct: "app.setQualityTier", mapping: "approximate", target: "v2 tier AA/quality resolution" },
  { re: /\bpreserveDrawingBuffer\s*:/g, construct: "preserveDrawingBuffer", mapping: "none", note: "v2 chain never readbacks; capture via C-05 capture()" }
];

/**
 * @param {string} source
 * @param {string} fileName
 * @returns {{ code: string, rows: { file: string, line: number, construct: string, mapping: "exact"|"approximate"|"none", target?: string, note?: string }[] }}
 */
export function transformPostV2(source, fileName) {
  /** @type {{ file: string, line: number, construct: string, mapping: "exact"|"approximate"|"none", target?: string, note?: string }[]} */
  const rows = [];
  for (const rule of CONSTRUCTS) {
    rule.re.lastIndex = 0;
    let match;
    while ((match = rule.re.exec(source)) !== null) {
      const line = source.slice(0, match.index).split("\n").length;
      const row = { file: fileName, line, construct: rule.construct, mapping: rule.mapping };
      if (rule.target) row.target = rule.target;
      if (rule.note) row.note = rule.note;
      rows.push(row);
    }
  }
  rows.sort((a, b) => a.line - b.line || a.construct.localeCompare(b.construct));
  return { code: source, rows };
}

/** The C-39 codemod descriptor registered by `commands/prd03/index.ts`. */
export const postV2Codemod = {
  name: "post-v2",
  owner: "prd03",
  description: "Report-mode codemod for the v2 post chain: lists legacy post constructs per file and how each maps (exact / approximate / none).",
  transform: transformPostV2
};
