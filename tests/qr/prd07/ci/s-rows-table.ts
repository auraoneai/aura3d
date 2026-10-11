// 07 Phase D — the S1..S15 row table (FINISH-LANE-07 Phase D thresholds,
// PRD-07 §17.1). Each row lists its checks; s-rows-lib.ts holds the check
// primitives. Judge item ids:
//   scene frames          `<scene>`            (e.g. `prd07-flipbook`)
//   S3 per kind           `prd07-impact-library#<kind>`
//   S11 per element       `prd07-trails-beams#<element>`
//   games                 `<game>@vfx`, `<game>@none`
// Judge flag vocabulary (C-32 record `flags[]`): `primitive-shape` (S3),
// `seam` (S5), `banding` (S4), `pop` (S7), `distinct-fogs-5` (S7),
// `sort-flicker` (S12).
import {
  capability,
  gameBasics,
  humanCheck,
  judgeCheck,
  liveParticles,
  rowResult,
  S11_ELEMENTS,
  S3_KIND_COUNT,
  S4_HOUR_SCENES,
  sceneBasics,
  sceneEngine,
  type Check,
  type PhaseDInputs,
  type RowResult
} from "./s-rows-lib";

const V = ["vfx"] as const;
const SKY_FOG = ["vfx", "vfx.sky", "vfx.fog"] as const;

function evidence(id: string, ok: boolean | null, detail: string): Check {
  return { id, cls: "evidence", status: ok === null ? "unmeasured" : ok ? "pass" : "fail", detail };
}

function frameMetric(input: PhaseDInputs, scene: string, key: "subjectPresence" | "skyVariance", test: (v: number) => boolean, label: string): Check {
  const v = input.frames[scene]?.[key];
  const src = key === "skyVariance" ? ` [${input.frames[scene]?.skyVarianceSource ?? "n/a"}]` : "";
  return evidence(`${scene}:${key}`, v === null || v === undefined ? null : test(v), v === null || v === undefined ? `${key} not measurable (no ${key === "subjectPresence" ? "three object-id mask" : "frame"})` : `${key}=${v.toFixed(4)} (${label})${src}`);
}

function s1(input: PhaseDInputs): Check[] {
  const scene = "prd07-particles-fountain";
  const noneBase = JSON.stringify(sceneEngine(input.none, "14-particles", "aura3d")?.payload ?? null);
  const vfxBase = sceneEngine(input.vfx, "14-particles", "aura3d");
  return [
    ...sceneBasics(input, scene, V, false),
    liveParticles(input, scene),
    ...sceneBasics(input, "14-particles", V, false).filter((c) => c.id.endsWith(":zero-pixels") || c.id.endsWith(":ready")),
    evidence("14-particles@none:EFFECT_ZERO_PIXELS-reported", noneBase === "null" ? null : noneBase.includes("EFFECT_ZERO_PIXELS"),
      noneBase === "null" ? "14-particles absent from the none capture" : noneBase.includes("EFFECT_ZERO_PIXELS") ? "reported with flags none" : "not reported with flags none (the none arm publishes no effects diagnostics)"),
    evidence("14-particles@vfx:effects-present", vfxBase?.payload?.extra?.effects ? true : false, vfxBase?.payload?.extra?.effects ? "diagnostics().effects present with vfx" : "diagnostics().effects absent with vfx"),
    frameMetric(input, scene, "subjectPresence", (v) => v >= 0.8, "≥ 0.8"),
    judgeCheck(input, { item: scene, category: "particles", min: 5 }),
    humanCheck(input, "S1")
  ];
}

function s3(input: PhaseDInputs): Check[] {
  const scene = "prd07-impact-library";
  const prefix = `${scene}#`;
  const kinds = [...new Set(input.judges.filter((r) => r.itemId.startsWith(prefix)).map((r) => r.itemId))];
  const perKind = kinds.map((item) => judgeCheck(input, { item, category: "vfx", min: 6, forbidFlags: ["primitive-shape"] }));
  const passing = perKind.filter((c) => c.status === "pass").length;
  const primitive = perKind.filter((c) => c.detail.includes("primitive-shape")).length;
  const judged = perKind.filter((c) => c.status !== "pending").length;
  const sheet: Check = judged < S3_KIND_COUNT
    ? { id: `judge:${scene}:kinds`, cls: "judge", status: "pending", detail: `${judged}/${S3_KIND_COUNT} kinds judged by two judges` }
    : { id: `judge:${scene}:kinds`, cls: "judge", status: passing >= 11 && primitive === 0 ? "pass" : "fail", detail: `${passing}/${S3_KIND_COUNT} kinds vfx ≥ 6 (need ≥ 11); ${primitive} flagged primitive shape (need 0)` };
  return [...sceneBasics(input, scene, V, false), liveParticles(input, scene), sheet, humanCheck(input, "S3")];
}

function s4(input: PhaseDInputs): Check[] {
  return S4_HOUR_SCENES.flatMap((scene) => [
    ...sceneBasics(input, scene, SKY_FOG, true),
    frameMetric(input, scene, "skyVariance", (v) => v > 0, "> 0"),
    judgeCheck(input, { item: scene, category: "atmospheric_effects", vsReferenceMinus: 0.5, forbidFlags: ["banding"] })
  ]);
}

function s11(input: PhaseDInputs): Check[] {
  const scene = "prd07-trails-beams";
  const nodes = sceneEngine(input.vfx, scene, "aura3d")?.payload?.extra?.effects?.nodes ?? [];
  const perElement = S11_ELEMENTS.map((el): Check => {
    const mine = nodes.filter((n) => n.effect === el);
    const drawn = mine.some((n) => (n.drawCalls ?? 0) > 0);
    return { id: `${scene}:${el}:drawn`, cls: "engineering", status: drawn ? "pass" : "fail", detail: mine.length ? `${mine.length} ${el} node(s), drawCalls ${mine.map((n) => n.drawCalls ?? 0).join(",")}` : `no ${el} node in diagnostics().effects` };
  });
  return [
    ...sceneBasics(input, scene, V, false),
    ...perElement,
    ...S11_ELEMENTS.map((el) => judgeCheck(input, { item: `${scene}#${el}`, category: "vfx", min: 6 })),
    humanCheck(input, "S11")
  ];
}

function s12(input: PhaseDInputs): Check[] {
  const scene = "prd07-particles-stress";
  const fx = sceneEngine(input.vfx, scene, "aura3d")?.payload?.extra?.effects;
  const gpu = (fx?.nodes ?? []).filter((n) => n.sim === "gpu" && (n.instancesDrawn ?? 0) > 0);
  const readbacks = fx?.deviceReadbacks;
  return [
    ...sceneBasics(input, scene, V, false),
    liveParticles(input, scene),
    evidence(`${scene}:gpu-sim`, fx ? gpu.length > 0 : null, fx ? `${gpu.length} node(s) drawing from a GPU sim (P5-T1: 45,904 GPU particles at the High cap)` : "effects diagnostics absent"),
    readbacks === undefined
      ? evidence(`${scene}:readbacks`, null, "diagnostics().effects.deviceReadbacks not published")
      : { id: `${scene}:readbacks`, cls: "engineering", status: readbacks === 0 ? "pass" : "fail", detail: `deviceReadbacks=${readbacks} (§18: 0)` },
    evidence(`${scene}:particles-gpu-ms`, typeof fx?.gpuMs === "number" ? true : null, typeof fx?.gpuMs === "number" ? `particles scope GPU ${fx.gpuMs.toFixed(3)} ms` : "particles-scope GPU ms not published"),
    evidence(`${scene}:raf-p50-p95`, null, "rAF p50/p95 not sampled by capture.mjs (single settled frame)"),
    judgeCheck(input, { item: scene, category: "particles", min: 6, forbidFlags: ["sort-flicker"] })
  ];
}

function game(input: PhaseDInputs, row: string, id: string, category: string, plus: number, human: boolean): Check[] {
  return [
    ...gameBasics(input, id),
    judgeCheck(input, { item: `${id}@vfx`, category, vsItem: { item: `${id}@none`, plus } }),
    ...(human ? [humanCheck(input, row)] : [])
  ];
}

/** Evaluate every Phase D row for one run. */
export function evaluatePhaseD(input: PhaseDInputs): RowResult[] {
  const rows: [string, Check[]][] = [
    ["S1", s1(input)],
    ["S2", [...sceneBasics(input, "prd07-flipbook", V, true), liveParticles(input, "prd07-flipbook"), judgeCheck(input, { item: "prd07-flipbook", category: "vfx", min: 6, vsReferenceMinus: 0.5 })]],
    ["S3", s3(input)],
    ["S4", s4(input)],
    ["S5", [...sceneBasics(input, "prd07-outdoor-sky", SKY_FOG, true), judgeCheck(input, { item: "prd07-outdoor-sky", category: "atmospheric_effects", min: 6, forbidFlags: ["seam"] }), humanCheck(input, "S5")]],
    ["S6", [
      ...sceneBasics(input, "prd07-fog-height", ["vfx", "vfx.fog"], false),
      evidence("prd07-fog-height:cpu-reference", null, "per-pillar fog vs HeightFog CPU reference not measured: the scene has receding ridges, not the §17 pillars at 10/25/50/100/200 m"),
      judgeCheck(input, { item: "prd07-fog-height", category: "atmospheric_effects", min: 6 })
    ]],
    ["S7", [
      ...sceneBasics(input, "prd07-fog-transition", ["vfx", "vfx.fog"], false),
      capability(input, "prd07-fog-transition", "fog-transition"),
      judgeCheck(input, { item: "prd07-fog-transition", category: "atmospheric_effects", requireFlags: ["distinct-fogs-5"], forbidFlags: ["pop"] })
    ]],
    ["S8", [...sceneBasics(input, "prd07-rain-night", V, true), liveParticles(input, "prd07-rain-night"), judgeCheck(input, { item: "prd07-rain-night", category: "particles", min: 6, vsReferenceMinus: 0.5 })]],
    ["S9", [...sceneBasics(input, "prd07-snow", V, false), liveParticles(input, "prd07-snow"), judgeCheck(input, { item: "prd07-snow", category: "particles", min: 6 })]],
    ["S10", [...sceneBasics(input, "prd07-decals", ["vfx", "vfx.decals"], true), capability(input, "prd07-decals", "decal"), judgeCheck(input, { item: "prd07-decals", category: "vfx", vsReferenceMinus: 1.0 })]],
    ["S11", s11(input)],
    ["S12", s12(input)],
    ["S13", game(input, "S13", "showcase-skyline-runner", "atmospheric_effects", 1, true)],
    ["S14", game(input, "S14", "showcase-neon-swarm", "vfx", 2, false)],
    ["S15", game(input, "S15", "showcase-turbo-drift-circuit", "particles", 2, false)]
  ];
  return rows.map(([row, checks]) => rowResult(row, checks));
}
