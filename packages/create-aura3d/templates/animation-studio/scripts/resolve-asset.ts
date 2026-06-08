/**
 * resolve-asset.ts — pull a real asset from the Aura3D hosted catalog (#3) into the
 * template's public dir, so a scene's cast/props are DYNAMIC (resolved from the prompt),
 * not the Moon Garden defaults. Reuses the hosted-catalog worker (Objaverse direct GLBs)
 * + the hardened loader (auto weight-normalization). Records provenance (CC-BY).
 *
 * Used by `animation-scene cast add` / `prop add`.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ProbeSession } from "./asset-render-probe.js";
import { probeEmbeddedMotion, type ClipMotionScore, type MotionProbeReport } from "./asset-motion-probe.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "..", "public", "aura-assets");
const REPORT_DIR = resolve(__dirname, "..", "dist", "scene");
const WORKER = "https://aura3d-asset-index-cron.newsroom.workers.dev/search";

/**
 * Rig grade: how faithfully will the standard humanoid retarget onto this skeleton?
 *  A — full humanoid (spine+arms+legs+head, plenty of joints): body acting retargets cleanly.
 *  B — humanoid torso+arms but sparse legs / fewer joints: upper-body acting good, locomotion iffy.
 *  C — minimal/partial rig (few mapped bones): only crude motion; body acting unreliable.
 *  D — not retargetable (no skeleton or no humanoid mapping): refuse body acting.
 *
 * We prefer the engine's `gradeRig` (from a future RigQuality module shipped in the dist) when it
 * is available at runtime; otherwise we inline this bone-count/humanoid heuristic (the PRD's
 * fallback). The inline heuristic uses the SAME signals the engine would: humanoid mapping, joint
 * count, and presence of the arm/leg chains.
 */
export type RigGrade = "A" | "B" | "C" | "D";

const ARM_HINTS = ["shoulder", "arm", "forearm", "hand", "clavicle", "wrist"];
const LEG_HINTS = ["leg", "thigh", "calf", "shin", "foot", "ankle", "upleg", "femur", "knee"];

function gradeRigInline(info: GlbInfo): { grade: RigGrade; reason: string } {
  if (!info.skinned || info.jointCount === 0) return { grade: "D", reason: "no skeleton" };
  if (!info.humanoid) return { grade: "D", reason: "no humanoid bone mapping" };
  const hasArms = info.boneHintHits.arms;
  const hasLegs = info.boneHintHits.legs;
  if (info.jointCount >= 20 && hasArms && hasLegs) return { grade: "A", reason: "full humanoid skeleton (spine+arms+legs)" };
  if (hasArms && (hasLegs || info.jointCount >= 12)) return { grade: "B", reason: "humanoid torso+arms, sparse/partial legs" };
  if (info.jointCount >= 8) return { grade: "C", reason: "minimal humanoid mapping — crude retarget only" };
  return { grade: "D", reason: "too few mapped bones to retarget" };
}

/**
 * Try the engine's `gradeRig` (RigQuality) via the runtime module if it exists; fall back to the
 * inline heuristic. Kept async + defensive: the import must never break the resolver if the symbol
 * is absent (current dist) — the PRD explicitly allows the inline fallback.
 */
async function gradeRig(info: GlbInfo): Promise<{ grade: RigGrade; reason: string }> {
  try {
    const mod = (await import("@aura3d/animation")) as Record<string, unknown>;
    const fn = mod["gradeRig"];
    if (typeof fn === "function") {
      const r = (fn as (j: number, h: boolean, a: boolean, l: boolean) => RigGrade)(
        info.jointCount, info.humanoid, info.boneHintHits.arms, info.boneHintHits.legs
      );
      if (r === "A" || r === "B" || r === "C" || r === "D") return { grade: r, reason: "graded by @aura3d/animation RigQuality" };
    }
  } catch { /* not available at runtime — inline heuristic below */ }
  return gradeRigInline(info);
}

export interface ResolvedAsset {
  readonly id: string;
  readonly url: string; // /aura-assets/<file>.glb (served path)
  readonly hash: string;
  readonly bounds: readonly [number, number, number];
  readonly clips: readonly string[];
  readonly clipCount: number;
  readonly humanoid: boolean;
  readonly skinned: boolean;
  readonly textured: boolean;
  readonly attribution: string;
  readonly sourceUrl: string;
  readonly license: string;
  // ── Quality report (characters only; props leave these undefined). ──
  readonly rigGrade?: RigGrade;
  /** Mesh/material detail grade (poly count + texture resolution + material validity). */
  readonly meshGrade?: MeshGrade;
  /** Combined fidelity letter (worse of rig + mesh) — the headline grade preferred A-first. */
  readonly fidelity?: RigGrade;
  readonly tris?: number;
  readonly textureMaxDim?: number;
  /** Per-embedded-clip motion quality scores (amplitude + bones affected + vocabulary mapping). */
  readonly clipScores?: readonly ClipMotionScore[];
  /** Count of embedded clips that drive real body motion (passed the amplitude gate). */
  readonly usefulClips?: number;
  /** True when embedded clips alone cover idle/talk-or-gesture/walk/react. */
  readonly hasViableActingPack?: boolean;
  /** True when motion must come from the shared retargeted library (no viable pack). */
  readonly libraryFallback?: boolean;
}

/** One row of the CHARACTER RESOLVER REPORT — one per candidate sifted for a scene's cast slot. */
export interface CharacterResolverRow {
  readonly source: string;
  readonly title: string;
  readonly license: string;
  readonly url: string;
  readonly rigGrade: RigGrade;
  readonly meshGrade: MeshGrade;
  readonly fidelity: RigGrade;
  readonly tris: number;
  readonly textureMaxDim: number;
  readonly clipCount: number;
  readonly usefulClips: number;
  readonly renderPass: boolean;
  readonly motionPass: boolean;
  readonly hasMouth: boolean;
  readonly accepted: boolean;
  readonly libraryFallback: boolean;
  readonly rejectReason?: string;
}

/** The full resolver report written to disk for the chosen cast slot. */
export interface CharacterResolverReport {
  readonly id: string;
  readonly query: string;
  readonly requireDialogue: boolean;
  readonly candidatesTried: number;
  readonly accepted: CharacterResolverRow | null;
  readonly rows: readonly CharacterResolverRow[];
  readonly generatedAt: string;
}

interface CatalogResult { id: string; title: string; source: string; url: string; license?: string; attribution?: string }

async function searchCatalog(query: string): Promise<CatalogResult[]> {
  // The hosted ~850k Aura3D catalog (Objaverse + Sketchfab + Poly Pizza + …). Pull a WIDE
  // ranked list so the metadata + render-test gates downstream have many real candidates to
  // sift — most catalog "robots" are static props, so we need depth to find a rigged one
  // whose textures actually bind. Accept any direct .glb (not just objaverse).
  const url = `${WORKER}?q=${encodeURIComponent(query)}&limit=60&commercial=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  const data = (await res.json()) as { results?: CatalogResult[] };
  return (data.results ?? []).filter((r) => typeof r.url === "string" && /\.glb($|\?)/.test(r.url));
}

interface GlbInfo { skinned: boolean; textured: boolean; embeddedTextures: boolean; clips: string[]; bounds: [number, number, number]; tris: number; verts: number; jointCount: number; humanoid: boolean; boneHintHits: { arms: boolean; legs: boolean }; textureMaxDim: number; materialCount: number; validMaterials: number }

/**
 * MESH/MATERIAL fidelity grade (separate from the RIG grade): how much visual detail does the
 * asset actually carry? This is the PRD's "poly count, texture resolution, material validity"
 * lever — a rig can be A-grade yet render as a flat 200-triangle blob, so we grade the mesh too
 * and prefer A across BOTH axes.
 *
 *  A — high detail: ≥8k tris AND (a ≥512px texture OR multiple valid materials) → reads crisp.
 *  B — moderate: ≥2k tris with at least one valid material / small texture.
 *  C — low: <2k tris or no real material variety — previz-grade silhouette.
 *  D — degenerate: no geometry.
 */
export type MeshGrade = "A" | "B" | "C" | "D";

function gradeMesh(info: GlbInfo): { grade: MeshGrade; reason: string } {
  if (info.tris === 0) return { grade: "D", reason: "no geometry" };
  const tex = info.textureMaxDim;
  const mats = info.validMaterials;
  const richTexture = tex >= 512;
  const richMaterials = mats >= 2;
  if (info.tris >= 8_000 && (richTexture || richMaterials)) {
    return { grade: "A", reason: `${info.tris} tris, ${tex || 0}px texture, ${mats} valid material(s)` };
  }
  if (info.tris >= 2_000 && (mats >= 1 || tex >= 128)) {
    return { grade: "B", reason: `${info.tris} tris, ${tex || 0}px texture, ${mats} valid material(s)` };
  }
  return { grade: "C", reason: `low detail: ${info.tris} tris, ${tex || 0}px texture, ${mats} valid material(s)` };
}

/** Combine rig + mesh into a single fidelity letter (the worse of the two dominates). */
export function combineFidelity(rig: RigGrade, mesh: MeshGrade): RigGrade {
  const order: RigGrade[] = ["A", "B", "C", "D"];
  return order[Math.max(order.indexOf(rig), order.indexOf(mesh as RigGrade))]!;
}

// Bone names that signal a humanoid skeleton (Mixamo / VRM / generic rigs). We only need a
// cheap heuristic: if a handful of these turn up among the skin's joint node names, the rig is
// retargetable to our standard humanoid.
const HUMANOID_BONE_HINTS = ["hips", "spine", "neck", "head", "shoulder", "arm", "forearm", "hand", "upleg", "leg", "foot", "thigh", "calf", "pelvis", "clavicle"];

function inspectGlb(buf: Buffer): GlbInfo | null {
  if (buf.readUInt32LE(0) !== 0x46546c67) return null;
  const jlen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jlen).toString("utf8")) as Record<string, any>;
  const prims = (json.meshes ?? []).flatMap((m: any) => m.primitives ?? []);
  const imgs = json.images ?? [];
  const min = [1e9, 1e9, 1e9];
  const max = [-1e9, -1e9, -1e9];
  let tris = 0;
  let verts = 0;
  for (const p of prims) {
    const a = json.accessors?.[p.attributes?.POSITION];
    if (a?.min && a?.max) for (let i = 0; i < 3; i += 1) { min[i] = Math.min(min[i]!, a.min[i]); max[i] = Math.max(max[i]!, a.max[i]); }
    if (a?.count) verts += a.count;
    const idx = json.accessors?.[p.indices];
    if (idx) tris += idx.count / 3;
  }
  // ── Texture resolution: parse PNG/JPEG headers embedded in the BIN to read pixel dimensions.
  // glTF images don't carry width/height, so we sniff the actual encoded bytes. Largest wins.
  const binStart = 20 + jlen + 8; // glb header(12) + json chunk header(8) + json + bin chunk header(8)
  const views = (json.bufferViews ?? []) as any[];
  let textureMaxDim = 0;
  for (const img of imgs) {
    if (img.bufferView === undefined) continue;
    const v = views[img.bufferView];
    if (!v) continue;
    const off = binStart + (v.byteOffset ?? 0);
    const dim = sniffImageDim(buf, off, v.byteLength ?? 0);
    if (dim > textureMaxDim) textureMaxDim = dim;
  }
  // ── Material validity: a material counts as "valid" when it actually drives a surface colour
  // (a baseColorTexture, a non-default baseColorFactor, or an emissive). Flat default-white
  // materials don't add visual detail and aren't counted.
  const materials = (json.materials ?? []) as any[];
  let validMaterials = 0;
  for (const m of materials) {
    const pbr = m.pbrMetallicRoughness ?? {};
    const hasTex = pbr.baseColorTexture !== undefined || m.normalTexture !== undefined || m.emissiveTexture !== undefined;
    const bcf = pbr.baseColorFactor as number[] | undefined;
    const nonDefaultColor = Array.isArray(bcf) && (Math.abs((bcf[0] ?? 1) - 1) > 0.02 || Math.abs((bcf[1] ?? 1) - 1) > 0.02 || Math.abs((bcf[2] ?? 1) - 1) > 0.02);
    const ef = m.emissiveFactor as number[] | undefined;
    const hasEmissive = Array.isArray(ef) && (ef[0] > 0.01 || ef[1] > 0.01 || ef[2] > 0.01);
    if (hasTex || nonDefaultColor || hasEmissive) validMaterials += 1;
  }
  // Joint/skeleton inspection: count skin joints and check their node names for humanoid bones.
  const skins = (json.skins ?? []) as any[];
  const nodes = (json.nodes ?? []) as any[];
  const jointIdx = new Set<number>();
  for (const s of skins) for (const j of (s.joints ?? [])) jointIdx.add(j);
  const jointCount = jointIdx.size;
  let hits = 0;
  let hasArms = false;
  let hasLegs = false;
  for (const j of jointIdx) {
    const name = String(nodes[j]?.name ?? "").toLowerCase();
    if (HUMANOID_BONE_HINTS.some((h) => name.includes(h))) hits += 1;
    if (ARM_HINTS.some((h) => name.includes(h))) hasArms = true;
    if (LEG_HINTS.some((h) => name.includes(h))) hasLegs = true;
  }
  // A humanoid rig has a meaningful joint count and several recognisable bone names.
  const humanoid = jointCount >= 8 && hits >= 4;
  return {
    skinned: skins.length > 0,
    textured: imgs.length > 0,
    embeddedTextures: imgs.every((i: any) => i.bufferView !== undefined),
    clips: (json.animations ?? []).map((a: any) => a.name).filter(Boolean),
    bounds: [Math.min(99, +(max[0]! - min[0]!).toFixed(2)), Math.min(99, +(max[1]! - min[1]!).toFixed(2)), Math.min(99, +(max[2]! - min[2]!).toFixed(2))],
    tris,
    verts,
    jointCount,
    humanoid,
    boneHintHits: { arms: hasArms, legs: hasLegs },
    textureMaxDim,
    materialCount: materials.length,
    validMaterials
  };
}

/**
 * Read the pixel dimension (max of width/height) of an embedded PNG or JPEG from its header
 * bytes at `off` in `buf`. Returns 0 for unknown formats. PNG: IHDR at byte 16; JPEG: scan SOF
 * markers. Cheap + dependency-free — we only need a rough resolution tier for grading.
 */
function sniffImageDim(buf: Buffer, off: number, len: number): number {
  if (len < 24 || off + 24 > buf.length) return 0;
  // PNG signature 89 50 4E 47 0D 0A 1A 0A, then IHDR (width@16, height@20, big-endian).
  if (buf[off] === 0x89 && buf[off + 1] === 0x50 && buf[off + 2] === 0x4e && buf[off + 3] === 0x47) {
    const w = buf.readUInt32BE(off + 16);
    const h = buf.readUInt32BE(off + 20);
    return Math.max(w, h);
  }
  // JPEG starts FF D8; walk segment markers to a Start-Of-Frame (C0..CF except C4/C8/CC).
  if (buf[off] === 0xff && buf[off + 1] === 0xd8) {
    let p = off + 2;
    const end = Math.min(off + len, buf.length) - 1;
    while (p < end) {
      if (buf[p] !== 0xff) { p += 1; continue; }
      const marker = buf[p + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        if (p + 9 > buf.length) return 0;
        const h = buf.readUInt16BE(p + 5);
        const w = buf.readUInt16BE(p + 7);
        return Math.max(w, h);
      }
      if (p + 4 > buf.length) return 0;
      p += 2 + buf.readUInt16BE(p + 2); // skip this segment
    }
  }
  return 0;
}

/** A downloaded + inspected candidate, kept in memory so we can rank before render-testing. */
interface ScoredCandidate { c: CatalogResult; buf: Buffer; info: GlbInfo; richness: number }

/**
 * Richness score for a character candidate (higher = better cast member). The big wins are a
 * humanoid rig and MULTIPLE named clips — those bring real, retargetable motion. Single-clip
 * rigs still score (the retargeting library covers them); non-rigged ones are filtered before
 * scoring. Joint count is a small tie-breaker (a fuller skeleton retargets more faithfully).
 */
function scoreCharacter(info: GlbInfo): number {
  let score = 0;
  if (info.humanoid) score += 100;            // a real humanoid rig dominates the ranking
  score += Math.min(info.clips.length, 8) * 20; // more named clips = more motion to draw from
  if (info.skinned) score += 10;
  if (info.textured) score += 5;
  score += Math.min(info.jointCount, 60) * 0.1; // tie-breaker: fuller skeletons retarget better
  // MESH FIDELITY also lifts the ranking so an A-grade textured high-poly candidate is render-
  // tested before a flat low-poly one (the PRD's "prefer A-grade" on poly/texture/material).
  const mesh = gradeMesh(info);
  score += { A: 40, B: 20, C: 5, D: 0 }[mesh.grade];
  score += Math.min(info.tris, 60_000) * 0.0005;  // gentle poly tie-breaker
  score += Math.min(info.textureMaxDim, 2048) * 0.002; // gentle texture-resolution tie-breaker
  return +score.toFixed(2);
}

/**
 * Resolve an asset for `query`. role="character" requires skinned + animated + embedded
 * textures + a clean standing extent; role="prop" accepts any self-contained GLB. For
 * characters, all viable candidates are downloaded + inspected, then RANKED so multi-clip
 * humanoid rigs are render-tested first (single-clip rigs are a still-acceptable fallback).
 * The first candidate to pass the render-test gate is written to public/aura-assets.
 */
export async function resolveAsset(
  query: string,
  id: string,
  role: "character" | "prop",
  opts: { requireDialogue?: boolean } = {}
): Promise<ResolvedAsset> {
  const requireDialogue = opts.requireDialogue ?? true; // animation-studio scenes are dialogue scenes
  const candidates = await searchCatalog(query);
  const file = `${id}.catalog.glb`;

  function finalize(
    c: CatalogResult,
    buf: Buffer,
    info: GlbInfo,
    quality?: { rigGrade: RigGrade; motion: MotionProbeReport; meshGrade?: MeshGrade }
  ): ResolvedAsset {
    mkdirSync(PUBLIC_DIR, { recursive: true });
    writeFileSync(resolve(PUBLIC_DIR, file), buf);
    const hash = `sha256-${createHash("sha256").update(buf).digest("hex")}`;
    // Prefer the EFFECTIVE mesh grade (incl. rendered detail) the decision loop passes in; fall
    // back to the metadata-only grade for the prop path that has no render probe.
    const mesh = { grade: quality?.meshGrade ?? gradeMesh(info).grade };
    return {
      id,
      url: `/aura-assets/${file}`,
      hash,
      bounds: info.bounds,
      clips: info.clips,
      clipCount: info.clips.length,
      humanoid: info.humanoid,
      skinned: info.skinned,
      textured: info.textured,
      attribution: `${c.title} (${c.source}, ${c.license ?? "CC-BY-4.0"})${c.attribution ? ` by ${c.attribution}` : ""}`,
      sourceUrl: c.url,
      license: c.license ?? "CC-BY-4.0",
      meshGrade: mesh.grade,
      tris: info.tris,
      textureMaxDim: info.textureMaxDim,
      ...(quality
        ? {
            rigGrade: quality.rigGrade,
            fidelity: combineFidelity(quality.rigGrade, mesh.grade),
            clipScores: quality.motion.clips,
            usefulClips: quality.motion.usefulClips,
            hasViableActingPack: quality.motion.hasViableActingPack,
            libraryFallback: quality.motion.libraryFallback
          }
        : {})
    };
  }

  // The CHARACTER RESOLVER REPORT accumulates one row per candidate we actually inspect, then is
  // written to disk so a scene carries an honest, auditable record of what was accepted/rejected.
  const reportRows: CharacterResolverRow[] = [];
  function writeResolverReport(accepted: CharacterResolverRow | null): void {
    const report: CharacterResolverReport = {
      id,
      query,
      requireDialogue,
      candidatesTried: candidates.length,
      accepted,
      rows: reportRows,
      generatedAt: new Date().toISOString()
    };
    try {
      mkdirSync(REPORT_DIR, { recursive: true });
      writeFileSync(resolve(REPORT_DIR, `${id}.resolver-report.json`), `${JSON.stringify(report, null, 2)}\n`);
    } catch { /* report is best-effort; never block resolution on a write failure */ }
    console.error(`\n  CHARACTER RESOLVER REPORT (${id}) — ${reportRows.length} candidate(s) graded, accepted=${accepted ? accepted.title : "NONE"}`);
    for (const r of reportRows) {
      console.error(`    ${r.accepted ? "ACCEPT" : "reject"} [fidelity ${r.fidelity}: rig ${r.rigGrade}/mesh ${r.meshGrade}] ${r.title} — ${r.tris}tris ${r.textureMaxDim || 0}px clips ${r.usefulClips}/${r.clipCount} render=${r.renderPass ? "Y" : "n"} motion=${r.motionPass ? "Y" : "n"} mouth=${r.hasMouth ? "Y" : "n"}${r.libraryFallback ? " (library-fallback)" : ""}${r.rejectReason ? ` — ${r.rejectReason}` : ""}`);
    }
  }

  // Shared cheap metadata gate (self-contained textures + sane scale + tri budget).
  function passesCheapGate(info: GlbInfo): boolean {
    if (info.textured && !info.embeddedTextures) return false; // external-texture GLBs aren't self-contained
    const maxExt = Math.max(...info.bounds);
    if (maxExt > 30 || maxExt < 0.1) return false;
    if (info.tris > 200_000) return false;
    return true;
  }

  // ── PROP: stream through candidates, take the first self-contained GLB with geometry. ──
  if (role === "prop") {
    for (const c of candidates) {
      let buf: Buffer;
      try {
        const r = await fetch(c.url);
        if (!r.ok) continue;
        buf = Buffer.from(await r.arrayBuffer());
      } catch { continue; }
      const info = inspectGlb(buf);
      if (!info || !passesCheapGate(info) || info.tris === 0) continue;
      return finalize(c, buf, info);
    }
    throw new Error(`no suitable prop found for "${query}" (tried ${candidates.length} candidates)`);
  }

  // ── CHARACTER: download + inspect every viable candidate, RANK by richness, then render-test. ──
  const scored: ScoredCandidate[] = [];
  for (const c of candidates) {
    let buf: Buffer;
    try {
      const r = await fetch(c.url);
      if (!r.ok) continue;
      buf = Buffer.from(await r.arrayBuffer());
    } catch { continue; }
    const info = inspectGlb(buf);
    if (!info || !passesCheapGate(info)) continue;
    // A cast member must be a rigged, animated, textured GLB. Non-rigged/untextured/unanimated
    // are rejected here exactly as before — the retargeting library covers single-clip rigs, so
    // ≥1 clip is the floor; ≥2 clips + humanoid is merely PREFERRED via the score below.
    if (!info.skinned || info.clips.length === 0 || !info.textured) continue;
    scored.push({ c, buf, info, richness: scoreCharacter(info) });
  }

  // Prefer multi-clip humanoid rigs first, then single-clip rigs, then the rest. Render-test in
  // this order and accept the first that actually renders (passes the chroma/detail gate).
  scored.sort((a, b) => b.richness - a.richness);
  if (scored.length > 0) {
    console.error(`  ranked ${scored.length} rigged candidate(s) for "${query}" (preferring multi-clip humanoid rigs):`);
    for (const s of scored.slice(0, 8)) {
      console.error(`    [${s.richness}] ${s.c.title} — ${s.info.clips.length} clip(s)${s.info.humanoid ? " +humanoid" : ""} (joints=${s.info.jointCount}) clips=[${s.info.clips.slice(0, 6).join(", ")}]`);
    }
  }

  // One warm probe harness reused across every render-tested character candidate.
  let probe: ProbeSession | undefined;
  const probeFile = `${id}.probe.glb`;
  try {
    for (const s of scored) {
      const { c, buf, info } = s;

      // ── GRADE 1/3: RIG GRADE (A/B/C/D). D = no skeleton or no humanoid mapping → reject. ──
      const { grade: rigGrade, reason: gradeReason } = await gradeRig(info);

      // ── MESH/MATERIAL GRADE: poly count + texture resolution + material validity (metadata).
      // The rendered-detail grade from the render probe is folded in below (effMeshGrade). ──
      const mesh = gradeMesh(info);

      // ── GRADE 2/3: MOTION PROBE — do the embedded clips actually move the body? ──
      const motion = probeEmbeddedMotion(buf);

      // ── GRADE 3/3: RENDER PROBE — does it render with colour/detail (not a white ghost)? ──
      const probeScale = info.bounds[1] > 0.1 && info.bounds[1] < 3 ? Math.min(4, Math.max(0.3, 1.6 / info.bounds[1])) : 1.6;
      mkdirSync(PUBLIC_DIR, { recursive: true });
      writeFileSync(resolve(PUBLIC_DIR, probeFile), buf); // serve under a probe name
      probe ??= await ProbeSession.start();
      const verdict = await probe.probe(`/aura-assets/${probeFile}`, info.clips[0]!, probeScale, info.bounds[1] || 1.6);
      const renderPass = verdict.ok;

      // Decide accept/reject against the FULL set of reject criteria (E1). Motion may be a
      // library-fallback (embedded clips weak) WITHOUT rejecting the character — the shared
      // retargeted library supplies the motion; that is recorded, not treated as a failure.
      let rejectReason: string | undefined;
      if (rigGrade === "D") rejectReason = `unusable rig: ${gradeReason}`;          // no skeleton / no humanoid
      else if (!renderPass) rejectReason = `render failed: ${verdict.reason}`;       // broken/missing textures, bad bind
      else if (requireDialogue && !motion.hasMouth) rejectReason = "no mouth/face for a dialogue scene";

      const accepted = !rejectReason;
      // Fold the RENDERED detail grade (measured pixels) into the mesh grade — metadata can claim
      // textures the renderer never binds, so the worse of (metadata mesh, rendered detail) wins.
      const effMeshGrade = combineFidelity(mesh.grade as RigGrade, verdict.detailGrade as RigGrade) as MeshGrade;
      const effFidelity = combineFidelity(rigGrade, effMeshGrade);
      const row: CharacterResolverRow = {
        source: c.source,
        title: c.title,
        license: c.license ?? "CC-BY-4.0",
        url: c.url,
        rigGrade,
        meshGrade: effMeshGrade,
        fidelity: effFidelity,
        tris: info.tris,
        textureMaxDim: info.textureMaxDim,
        clipCount: info.clips.length,
        usefulClips: motion.usefulClips,
        renderPass,
        motionPass: motion.motionPass,
        hasMouth: motion.hasMouth,
        accepted,
        libraryFallback: motion.libraryFallback,
        rejectReason
      };
      reportRows.push(row);
      console.error(
        `  probe ${c.title} [fidelity=${effFidelity} rig=${rigGrade} mesh=${effMeshGrade} (meta ${mesh.grade}/render ${verdict.detailGrade}), richness=${s.richness}, ${info.clips.length} clip(s)→${motion.usefulClips} useful]: ` +
        `render=${renderPass ? "PASS" : "REJECT"} (chroma=${verdict.meanChroma} detail=${verdict.lumaStd} ${info.tris}tris ${info.textureMaxDim || 0}px) motion=${motion.motionPass ? "PASS" : "weak"} mouth=${motion.hasMouth ? "Y" : "n"} — ${rejectReason ?? motion.reason}`
      );
      if (!accepted) continue;

      console.error(`  ACCEPTED ${c.title}: fidelity ${effFidelity} (rig ${rigGrade}/mesh ${effMeshGrade}), ${motion.usefulClips}/${info.clips.length} useful clip(s)${motion.libraryFallback ? " (motion via shared library fallback)" : " (viable acting pack)"}`);
      writeResolverReport(row);
      return finalize(c, buf, info, { rigGrade, motion, meshGrade: effMeshGrade });
    }
  } finally {
    if (probe) await probe.close();
  }
  writeResolverReport(null);
  throw new Error(`no suitable character found for "${query}" (tried ${candidates.length} candidates, ${scored.length} rigged) — see resolver report`);
}

/**
 * USER-UPLOAD PATH (M1). Resolve a character from a LOCAL .glb the user dropped in — bypassing
 * the catalog entirely. The file is inspected, graded (rig + mesh), render-probed exactly like a
 * catalog candidate, copied into public/aura-assets under `<id>.catalog.glb`, and a resolver
 * report is written. Throws (with the grades in the message) if the GLB has no usable rig or
 * fails the render probe, so a broken upload is rejected honestly rather than silently shipped.
 */
export async function resolveLocalGlb(
  filePath: string,
  id: string,
  opts: { requireDialogue?: boolean; skipRenderProbe?: boolean } = {}
): Promise<ResolvedAsset> {
  const requireDialogue = opts.requireDialogue ?? true;
  const abs = resolve(process.cwd(), filePath);
  if (!existsSync(abs)) throw new Error(`upload not found: ${abs}`);
  const buf = readFileSync(abs);
  const info = inspectGlb(buf);
  if (!info) throw new Error(`not a binary glTF (.glb): ${filePath}`);
  if (!info.skinned || info.jointCount === 0) throw new Error(`uploaded GLB has no skeleton — characters must be rigged (${filePath})`);

  const { grade: rigGrade, reason: gradeReason } = await gradeRig(info);
  const metaMesh = gradeMesh(info);
  const motion = probeEmbeddedMotion(buf);
  if (rigGrade === "D") throw new Error(`uploaded GLB rejected — unusable rig: ${gradeReason} (rig ${rigGrade}/mesh ${metaMesh.grade})`);
  if (requireDialogue && !motion.hasMouth) {
    console.error(`  note: ${filePath} has no mouth/face morph — lip-sync will be disabled for this character.`);
  }

  // RENDER PROBE (same gate as the catalog path) unless explicitly skipped (offline/no-browser).
  // The rendered detail grade is folded into the mesh grade (worse-of metadata + rendered).
  let renderPass = true;
  let renderReason = "render probe skipped";
  let mesh: MeshGrade = metaMesh.grade;
  if (!opts.skipRenderProbe) {
    const probeFile = `${id}.probe.glb`;
    mkdirSync(PUBLIC_DIR, { recursive: true });
    writeFileSync(resolve(PUBLIC_DIR, probeFile), buf);
    const probeScale = info.bounds[1] > 0.1 && info.bounds[1] < 3 ? Math.min(4, Math.max(0.3, 1.6 / info.bounds[1])) : 1.6;
    const probe = await ProbeSession.start();
    try {
      const verdict = await probe.probe(`/aura-assets/${probeFile}`, info.clips[0] ?? "", probeScale, info.bounds[1] || 1.6);
      renderPass = verdict.ok;
      renderReason = verdict.reason;
      mesh = combineFidelity(metaMesh.grade as RigGrade, verdict.detailGrade as RigGrade) as MeshGrade;
    } finally {
      await probe.close();
    }
    if (!renderPass) throw new Error(`uploaded GLB rejected — render probe failed: ${renderReason} (rig ${rigGrade}/mesh ${mesh})`);
  }
  const fidelity = combineFidelity(rigGrade, mesh);

  // Accept: copy into the served public dir under the catalog name + write a resolver report.
  const file = `${id}.catalog.glb`;
  mkdirSync(PUBLIC_DIR, { recursive: true });
  writeFileSync(resolve(PUBLIC_DIR, file), buf);
  const hash = `sha256-${createHash("sha256").update(buf).digest("hex")}`;

  const row: CharacterResolverRow = {
    source: "user-upload", title: `${id} (uploaded ${filePath})`, license: "user-provided", url: abs,
    rigGrade, meshGrade: mesh, fidelity, tris: info.tris, textureMaxDim: info.textureMaxDim,
    clipCount: info.clips.length, usefulClips: motion.usefulClips, renderPass,
    motionPass: motion.motionPass, hasMouth: motion.hasMouth, accepted: true,
    libraryFallback: motion.libraryFallback
  };
  try {
    mkdirSync(REPORT_DIR, { recursive: true });
    const report: CharacterResolverReport = {
      id, query: `upload:${filePath}`, requireDialogue, candidatesTried: 1, accepted: row, rows: [row], generatedAt: new Date().toISOString()
    };
    writeFileSync(resolve(REPORT_DIR, `${id}.resolver-report.json`), `${JSON.stringify(report, null, 2)}\n`);
  } catch { /* best-effort */ }
  console.error(`  UPLOAD ACCEPTED ${id}: fidelity ${fidelity} (rig ${rigGrade}/mesh ${mesh}), ${info.tris} tris, ${info.textureMaxDim || 0}px texture, ${motion.usefulClips}/${info.clips.length} useful clip(s)`);

  return {
    id, url: `/aura-assets/${file}`, hash, bounds: info.bounds, clips: info.clips, clipCount: info.clips.length,
    humanoid: info.humanoid, skinned: info.skinned, textured: info.textured,
    attribution: `User-uploaded GLB (${filePath})`, sourceUrl: abs, license: "user-provided",
    rigGrade, meshGrade: mesh, fidelity, tris: info.tris, textureMaxDim: info.textureMaxDim,
    clipScores: motion.clips, usefulClips: motion.usefulClips, hasViableActingPack: motion.hasViableActingPack, libraryFallback: motion.libraryFallback
  };
}

/**
 * Inspect + grade a GLB buffer WITHOUT any network or render probe (pure metadata). Used by the
 * cast-library manifest generator and tests to report a deterministic fidelity grade for a file.
 * Returns the rig + mesh + combined fidelity plus the raw mesh/skeleton stats.
 */
export function gradeCastGlb(buf: Buffer): {
  rigGrade: RigGrade; meshGrade: MeshGrade; fidelity: RigGrade;
  jointCount: number; humanoid: boolean; tris: number; verts: number;
  textureMaxDim: number; materials: number; validMaterials: number;
  clips: string[]; hasMouthMorph: boolean;
} {
  const info = inspectGlb(buf);
  if (!info) throw new Error("not a binary glTF (.glb)");
  const rig = gradeRigInline(info).grade;
  const mesh = gradeMesh(info).grade;
  return {
    rigGrade: rig, meshGrade: mesh, fidelity: combineFidelity(rig, mesh),
    jointCount: info.jointCount, humanoid: info.humanoid, tris: info.tris, verts: info.verts,
    textureMaxDim: info.textureMaxDim, materials: info.materialCount, validMaterials: info.validMaterials,
    clips: info.clips, hasMouthMorph: hasMouthMorphTarget(buf)
  };
}

/**
 * Does the GLB ship a face/mouth morph target (lip-sync CAPABILITY)? This checks for the morph
 * itself — `meshes[].extras.targetNames` carrying a mouth/lip/jaw name, or any declared morph
 * target weights — independent of whether a clip happens to animate it. (The motion probe's
 * `hasMouth` instead asks whether a clip MOVES the mouth, a different question.)
 */
function hasMouthMorphTarget(buf: Buffer): boolean {
  if (buf.readUInt32LE(0) !== 0x46546c67) return false;
  const jlen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jlen).toString("utf8")) as Record<string, any>;
  const mouthRe = /mouth|lip|jaw|teeth|talk|viseme|open/i;
  for (const m of (json.meshes ?? []) as any[]) {
    const names = m.extras?.targetNames as string[] | undefined;
    if (Array.isArray(names) && names.some((n) => mouthRe.test(String(n)))) return true;
    // A primitive carrying morph targets at all is a lip-sync-capable signal for authored faces.
    const prims = (m.primitives ?? []) as any[];
    if (Array.isArray(names) && names.length > 0 && prims.some((p) => Array.isArray(p.targets) && p.targets.length > 0)) return true;
  }
  return false;
}

// CLI helper: `resolve-asset <query> --id <id> --role character|prop` (used by tests).
if (process.argv[1] && process.argv[1].endsWith("resolve-asset.ts")) {
  const query = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const idIdx = process.argv.indexOf("--id");
  const roleIdx = process.argv.indexOf("--role");
  const id = idIdx >= 0 ? process.argv[idIdx + 1]! : "asset";
  const role = (roleIdx >= 0 ? process.argv[roleIdx + 1] : "prop") as "character" | "prop";
  if (!query) { console.error("usage: resolve-asset <query> --id <id> --role character|prop"); process.exitCode = 1; }
  else void resolveAsset(query, id, role).then((a) => console.log(JSON.stringify(a, null, 2))).catch((e) => { console.error(e.message); process.exitCode = 1; });
}

if (!existsSync(PUBLIC_DIR)) mkdirSync(PUBLIC_DIR, { recursive: true });
