/**
 * PRD-13 §7.6 — `look rubric` / `look judge` data model.
 *
 * AGENT_LOOK_CATEGORIES is the 12-category agent judging rubric: the subset of
 * C-32 GAME_VISUAL_CATEGORIES an agent can move from code (the full list also
 * covers sound, controls, physics feel, ... that screenshots cannot prove).
 * The ⊆ assertion lives in tests/unit/cli/look-judge.test.ts.
 *
 * CATEGORY_HINTS is the next-change hint table the judge reports: keyed by the
 * weakest rubric category, it names the concrete @aura3d/engine API to touch —
 * drawn from aura3d-art-direction/references/look-recipes.md and the lookLint
 * rule inventory. Keep entries in terms of real exported APIs only.
 */

export const AGENT_LOOK_CATEGORIES = [
  "lighting", "shadows", "ibl_reflections", "environment_world", "atmospheric_effects",
  "material_quality", "modeling_assets", "composition", "camera", "postprocessing",
  "animation_quality", "ui_hud"
] as const;
export type AgentLookCategory = (typeof AGENT_LOOK_CATEGORIES)[number];

export const LOOK_JUDGEMENT_SCHEMA = "aura3d.look-judgement/1" as const;

export interface LookJudgement {
  readonly schema: typeof LOOK_JUDGEMENT_SCHEMA;
  readonly round: number;
  readonly shots: readonly { readonly path: string; readonly sha256: string }[];
  readonly references: readonly string[];                    // reference-frame ids used
  readonly scores: Readonly<Partial<Record<AgentLookCategory, number>>>; // 0-10, 0.5 steps; N/A omitted
  readonly observations: readonly { readonly category: string; readonly seen: string }[]; // >= 1 per score < 7
  readonly nextChange: { readonly category: string; readonly change: string; readonly api: string };
  readonly judge: "self" | "prism";
}

/** Genre → recipe row (condensed from look-recipes.md; the doc is the narrative). */
export const GENRE_RECIPE_ROWS: Readonly<Record<string, {
  readonly look: string; readonly camera: string; readonly subjectPercent: string;
  readonly keyLight: string; readonly palette: string; readonly atmosphere: string; readonly post: string;
}>> = {
  platformer: { look: "outdoor-day", camera: "follow (side-on), fov 50", subjectPercent: "18–25", keyLight: "sun 48°/35° 3/4 front", palette: "saturated greens + sky blue + warm wood, coin gold accent", atmosphere: "fog 0.0025", post: "daylight-outdoor" },
  racing: { look: "golden-hour", camera: "chase, fov 60", subjectPercent: "15–25", keyLight: "low sun 12°/35°", palette: "warm asphalt + burnt orange + charcoal, headlight amber", atmosphere: "fog 30–180 m", post: "cinematic-film" },
  fighting: { look: "arena-fight", camera: "follow (side-on), fov 45", subjectPercent: "20–30 (pair)", keyLight: "top spot 60°/0°", palette: "arena dark + rope colour + crowd shadow, spotlight rim", atmosphere: "haze cone", post: "arena-fight" },
  "arena shooter": { look: "space", camera: "orthographic top-down 60°, fov 55", subjectPercent: "10–15 (field)", keyLight: "rim 70°/210°", palette: "deep space blue + graphite + teal, laser magenta", atmosphere: "none (space background exception)", post: "space" },
  "sports/table": { look: "interior-industrial", camera: "orthographic broadcast 70°, fov 40", subjectPercent: "25–40 (table)", keyLight: "flood 55°/45°", palette: "turf green + line white + crowd dark, ball accent", atmosphere: "indoor haze", post: "arena-fight" },
  product: { look: "product-studio", camera: "orbit autoframe, fov 35", subjectPercent: "45–70", keyLight: "softbox 45°/30°", palette: "neutral grey + white + metal, one brand accent", atmosphere: "none", post: "product-studio" },
  character: { look: "character-showcase", camera: "orbit, fov 40", subjectPercent: "50–70", keyLight: "3-point 50°/35°", palette: "costume neutrals + rim pick", atmosphere: "light room haze", post: "product-studio" },
  "outdoor environment": { look: "overcast", camera: "establishing wide, fov 55", subjectPercent: "vista", keyLight: "sun 50°/40°", palette: "muted green + slate + fog blue, wildflower accent", atmosphere: "fog 0.004", post: "daylight-outdoor" },
  interior: { look: "interior-warm", camera: "medium orbit, fov 45", subjectPercent: "30–50 (anchor)", keyLight: "window 35°/60°", palette: "warm wood + cream + book spines, plant green", atmosphere: "dust shafts", post: "cinematic-film" },
  "night city": { look: "night-city", camera: "low tele, fov 35", subjectPercent: "20–35 (street)", keyLight: "neon rim 25°/120°", palette: "sodium orange + neon + dark asphalt, cyan accent", atmosphere: "fog 15–90 m wet street", post: "neon-night" },
  space: { look: "space", camera: "orbit wide, fov 60", subjectPercent: "30–50 (planet)", keyLight: "star key 30°/180°", palette: "void blue + planet limb + star field, aurora accent", atmosphere: "none (background exception)", post: "space" },
  underwater: { look: "underwater", camera: "follow, fov 50", subjectPercent: "20–40 (creature)", keyLight: "godray 70°/10°", palette: "deep blue + teal + kelp green, coral accent", atmosphere: "scatter 0.03 caustics", post: "underwater" },
  cinematic: { look: "polar-night", camera: "establishing dolly, fov 35", subjectPercent: "25–40", keyLight: "moon 20°/300°", palette: "aurora green + snow blue + night, lantern amber", atmosphere: "snow mist 0.006", post: "cinematic-film" }
};

export interface LookHint { readonly category: string; readonly change: string; readonly api: string }

/**
 * Weakest-category → concrete next change. APIs are restricted to the public
 * @aura3d/engine surface (looks.preset overrides, environments.*, lights.*,
 * camera.*, effects/post ids) so the hint is always actionable.
 */
export const CATEGORY_HINTS: Readonly<Record<string, LookHint>> = {
  lighting: { category: "lighting", change: "raise key light or soften ambient so lit:shadow ratio reads ~2:1; move the sun to the recipe's azimuth/elevation", api: "looks.preset(id, { sun: { azimuthDeg, elevationDeg } })" },
  shadows: { category: "shadows", change: "raise shadow strength toward the look target and pull the key light to an angle that throws visible contact shadows", api: "looks.preset(id, { sun: { azimuthDeg, elevationDeg } })" },
  ibl_reflections: { category: "ibl_reflections", change: "set the look's environment so metals/glossy materials pick up image-based reflections", api: "environments.hdri(url) or the look's preset env" },
  environment_world: { category: "environment_world", change: "swap to the genre's env preset or lower fog density so the world reads past the subject", api: "environments.<named>(…) builders" },
  atmospheric_effects: { category: "atmospheric_effects", change: "add the recipe row's atmosphere (fog scale, haze, shafts) at the look's intensity", api: "looks.preset(id, { fogDensityScale })" },
  material_quality: { category: "material_quality", change: "move flat materials to PBR values and let IBL drive specular response", api: "material.pbr / the look's material defaults" },
  modeling_assets: { category: "modeling_assets", change: "replace primitives with typed catalog models sized to the recipe", api: "model(assets.x) after assets resolve/add" },
  composition: { category: "composition", change: "reframe so the subject fills the recipe's frame-height share", api: "camera.perspective / camera.orbit fov + target" },
  camera: { category: "camera", change: "switch to the recipe row's rig and fov", api: "camera.follow / camera.orbit / camera.dolly" },
  postprocessing: { category: "postprocessing", change: "apply the recipe row's post preset instead of hand-tuning render passes", api: "the look's post preset (AuraPostPresetId)" },
  animation_quality: { category: "animation_quality", change: "play the asset's real clips (idle/run/jump) rather than transform tweens", api: "the asset's clip handle (assets.x animations)" },
  ui_hud: { category: "ui_hud", change: "reduce HUD to genre-minimal elements over the look's palette", api: "HUD layer over the applied look" }
};

/** Lint-code → hint prefix so judge output ties a weak category to the failing rule. */
export const LINT_CODE_HINTS: Readonly<Record<string, { readonly change: string; readonly api: string }>> = {
  "look/no-lights": { change: "the scene has no light nodes at all", api: "looks.preset(id)" },
  "look/ambient-kills-ibl": { change: "ambient light washes out the look's image-based lighting", api: "drop lights.ambient or set the env's own ambient" },
  "look/no-ibl": { change: "materials get no specular response without an environment", api: "environments.hdri / preset env" },
  "look/weak-shadow": { change: "shadows too weak to read", api: "raise shadow strength on the key light" },
  "look/low-dpr": { change: "pixel ratio under the tier cap", api: "looks.appOptions(id) pixelRatio" },
  "look/solid-void": { change: "flat void background", api: "the look's sky/gradient background" },
  "look/primitive-subject": { change: "hero subject is a primitive", api: "model(assets.x)" },
  "look/flat-palette": { change: "palette lacks the recipe's base+accent structure", api: "looks.preset(id, { accent })" },
  "look/double-aa": { change: "two AA passes fighting", api: "the look's single AA choice" },
  "look/debug-overlay": { change: "debug overlay ships in the frame", api: "turn the overlay off before capture" },
  "look/multiple-looks": { change: "more than one look applied", api: "one looks.preset per scene" },
  "look/expansion-mismatch": { change: "look resolved differently than declared", api: "re-run capture; pin the look id" },
  "look/ambient-flattens": { change: "ambient above the look's ceiling flattens shading", api: "lower ambient intensity" },
  "look/fake-effect-names": { change: "fake effect names in the source", api: "use the engine's real effect ids" },
  "look/capture-branch": { change: "behaviour branches on capture params", api: "one code path; captures observe it" }
};

export function lookHintFor(category: string, lintCodes: readonly string[] = []): LookHint {
  const lint = lintCodes.map((code) => LINT_CODE_HINTS[code]).find((hint) => hint !== undefined);
  const base = CATEGORY_HINTS[category];
  if (lint && base) {
    return { category, change: `${lint.change} — ${base.change}`, api: lint.api };
  }
  if (base) return base;
  if (lint) return { category, change: lint.change, api: lint.api };
  return { category, change: "iterate inside the look-dev loop", api: "looks.preset(id)" };
}

// ---------------------------------------------------------------------------
// LookJudgement validation

export interface LookJudgementValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

const CATEGORY_SET: ReadonlySet<string> = new Set(AGENT_LOOK_CATEGORIES);

export function validateLookJudgement(value: unknown): LookJudgementValidation {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) {
    return { ok: false, errors: ["judgement is not an object"] };
  }
  const j = value as Record<string, unknown>;
  if (j.schema !== LOOK_JUDGEMENT_SCHEMA) errors.push(`schema must be ${LOOK_JUDGEMENT_SCHEMA}`);
  if (typeof j.round !== "number" || !Number.isInteger(j.round) || (j.round as number) < 1) errors.push("round must be an integer >= 1");
  if (!Array.isArray(j.shots) || j.shots.length === 0) {
    errors.push("shots must be a non-empty array");
  } else {
    for (const [i, shot] of (j.shots as unknown[]).entries()) {
      if (typeof shot !== "object" || shot === null) { errors.push(`shots[${i}] is not an object`); continue; }
      const s = shot as Record<string, unknown>;
      if (typeof s.path !== "string" || s.path.length === 0) errors.push(`shots[${i}].path required`);
      if (typeof s.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(s.sha256)) errors.push(`shots[${i}].sha256 must be 64 hex chars`);
    }
  }
  if (!Array.isArray(j.references)) errors.push("references must be an array");
  if (typeof j.scores !== "object" || j.scores === null) {
    errors.push("scores must be an object");
  } else {
    const scores = j.scores as Record<string, unknown>;
    if (Object.keys(scores).length === 0) errors.push("scores must not be empty");
    for (const [category, score] of Object.entries(scores)) {
      if (!CATEGORY_SET.has(category)) errors.push(`unknown category "${category}" (must be one of AGENT_LOOK_CATEGORIES)`);
      if (typeof score !== "number" || score < 0 || score > 10 || (score * 2) % 1 !== 0) {
        errors.push(`score ${category}=${String(score)} must be 0–10 in 0.5 steps`);
      }
    }
  }
  if (!Array.isArray(j.observations)) {
    errors.push("observations must be an array");
  } else if (typeof j.scores === "object" && j.scores !== null) {
    const scores = j.scores as Record<string, number>;
    const observed = new Set(
      (j.observations as { category?: unknown }[]).map((o) => o.category).filter((c): c is string => typeof c === "string")
    );
    for (const [category, score] of Object.entries(scores)) {
      if (score < 7 && !observed.has(category)) {
        errors.push(`score ${category}=${score} < 7 requires at least one observation for that category`);
      }
    }
  }
  const next = j.nextChange as Record<string, unknown> | undefined;
  if (typeof next !== "object" || next === null) {
    errors.push("nextChange required");
  } else {
    for (const key of ["category", "change", "api"] as const) {
      if (typeof next[key] !== "string" || (next[key] as string).length === 0) errors.push(`nextChange.${key} required`);
    }
    if (typeof next.category === "string" && !CATEGORY_SET.has(next.category)) {
      errors.push(`nextChange.category "${next.category}" is not a rubric category`);
    }
  }
  if (j.judge !== "self" && j.judge !== "prism") errors.push('judge must be "self" or "prism"');
  return { ok: errors.length === 0, errors };
}

export function weakestLookCategory(judgement: LookJudgement): AgentLookCategory | undefined {
  let weakest: AgentLookCategory | undefined;
  let low = Number.POSITIVE_INFINITY;
  for (const [category, score] of Object.entries(judgement.scores)) {
    if (typeof score === "number" && score < low) {
      low = score;
      weakest = category as AgentLookCategory;
    }
  }
  return weakest;
}
