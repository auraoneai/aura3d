/**
 * `assets repair-skin`: the generic, safe repairs for a skinned GLB. Every step is opt-in so a re-run changes only what you asked for:
 * `normalize` (renormalise weights, drop non-finite and out-of-range influences, keep the strongest K), `pruneDistant` (drop influences
 * from bones far from the vertex), `smoothBridges` (soften the weights around stretched bridging triangles so the patch deforms as one
 * surface) and `cutStretch` (remove triangles that still stretch past a limit; leaves holes, so it is the last resort).
 */
import { analyzeSkin, DEFAULT_SKIN_THRESHOLDS, samplePoses, triangleStretch, type SkinAnalysisOptions, type SkinReport } from "./analysis.js";
import { GlbEditor } from "./glbEdit.js";
import { buildHierarchy, jointBindPositions, loadSkins, vdist, type GlbData, type SkinInfo, type SkinnedPrimitive, type Vec3 } from "./gltf.js";

export interface RepairSkinOptions {
  readonly normalize?: boolean;
  /** Strongest influences kept per vertex (1 to 4; default 4). */
  readonly maxInfluences?: number;
  readonly pruneDistant?: boolean;
  readonly smoothBridges?: boolean;
  /** Triangles stretched past this multiple are the smoothing region (default 1.5). */
  readonly smoothThreshold?: number;
  /** Smoothing rounds: each re-measures the stretch with the new weights and smooths what is still stretched (default 1). */
  readonly smoothRounds?: number;
  /** How many rings of neighbouring vertices around a stretched triangle are smoothed (default 4). */
  readonly smoothRings?: number;
  /** Remove triangles stretched past this limit after the other steps (off by default). */
  readonly cutStretch?: number;
  readonly clips?: readonly string[];
  readonly samples?: number;
  readonly ignoreMaterials?: RegExp;
}

export interface RepairSkinReport {
  readonly steps: readonly string[];
  readonly primitives: readonly { readonly material: string; readonly normalizedVertices: number; readonly prunedInfluences: number; readonly smoothedVertices: number; readonly removedTriangles: number }[];
  readonly before: SkinReport;
  readonly after: SkinReport;
  readonly guidance: readonly string[];
}

type Dense = Map<number, number>;

function dense(prim: SkinnedPrimitive, v: number, jointCount: number): Dense {
  const m: Dense = new Map();
  const w = prim.weights[v] ?? [], j = prim.joints[v] ?? [];
  for (let k = 0; k < 4; k += 1) {
    const wk = w[k] ?? 0, jk = j[k] ?? 0;
    if (!(wk > 0) || !Number.isFinite(wk) || jk >= jointCount) continue;
    m.set(jk, (m.get(jk) ?? 0) + wk);
  }
  return m;
}

function adjacency(prim: SkinnedPrimitive): Set<number>[] {
  const adj = Array.from({ length: prim.pos.length }, () => new Set<number>());
  for (let i = 0; i + 2 < prim.indices.length; i += 3) {
    const a = prim.indices[i] as number, b = prim.indices[i + 1] as number, c = prim.indices[i + 2] as number;
    adj[a]?.add(b).add(c); adj[b]?.add(a).add(c); adj[c]?.add(a).add(b);
  }
  return adj;
}

export function repairSkin(glb: GlbData, options: RepairSkinOptions = {}): { glb: GlbData; report: RepairSkinReport } {
  const hierarchy = buildHierarchy(glb);
  const skins = loadSkins(glb, hierarchy);
  const editor = new GlbEditor(glb);
  const steps: string[] = [];
  const guidance: string[] = [];
  const reports: RepairSkinReport["primitives"][number][] = [];
  const analysisOptions: SkinAnalysisOptions = { clips: options.clips, samples: options.samples, ignoreMaterials: options.ignoreMaterials };
  const before = analyzeSkin(glb, analysisOptions);
  const K = Math.max(1, Math.min(4, Math.floor(options.maxInfluences ?? 4)));
  if (options.normalize) steps.push(`normalize (keep the strongest ${K} influences)`);
  if (options.pruneDistant) steps.push("prune-distant");
  if (options.smoothBridges) steps.push("smooth-bridges");
  if (options.cutStretch !== undefined) steps.push(`cut-stretch ${options.cutStretch}`);
  const animations = glb.json.animations ?? [];
  const clips = options.clips ? animations.filter((a) => options.clips?.includes(a.name ?? "")) : animations;
  const needPoses = options.smoothBridges || options.cutStretch !== undefined;
  const poses = needPoses ? samplePoses(glb, hierarchy, clips, Math.max(2, options.samples ?? 10)).poses : [];

  for (const skin of skins) {
    const bind = jointBindPositions(skin);
    for (const prim of skin.primitives) {
      if (options.ignoreMaterials?.test(prim.materialName)) continue;
      const nV = prim.pos.length;
      let weights: Dense[] = Array.from({ length: nV }, (_, v) => dense(prim, v, skin.joints.length));
      let normalizedVertices = 0, prunedInfluences = 0, smoothedVertices = 0, removedTriangles = 0;
      const height = (() => { let lo = Infinity, hi = -Infinity; for (const p of prim.pos) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); } return hi > lo ? hi - lo : 1; })();
      if (options.pruneDistant) {
        const limit = DEFAULT_SKIN_THRESHOLDS.distantFraction * height;
        weights = weights.map((m, v) => {
          const next: Dense = new Map();
          for (const [j, w] of m) {
            const at = bind[j];
            if (at && w >= DEFAULT_SKIN_THRESHOLDS.distantMinWeight && vdist(prim.pos[v] as Vec3, at) > limit) { prunedInfluences += 1; continue; }
            next.set(j, w);
          }
          return next.size > 0 ? next : m;
        });
      }
      let stretch: Float32Array | null = null;
      if (needPoses) stretch = triangleStretch(skin, prim, poses, Infinity, 0).worst;
      if (options.smoothBridges && stretch) {
        const adj = adjacency(prim);
        const threshold = options.smoothThreshold ?? 1.5;
        const rounds = Math.max(1, Math.floor(options.smoothRounds ?? 1));
        for (let round = 0; round < rounds; round += 1) {
        if (round > 0) {
          stretch = triangleStretch(skin, withWeights(prim, weights, K), poses, Infinity, 0).worst;
          let over = 0;
          for (let t = 0; t < stretch.length; t += 1) if ((stretch[t] as number) > DEFAULT_SKIN_THRESHOLDS.stretchLimit) over += 1;
          if (over <= Math.max(DEFAULT_SKIN_THRESHOLDS.stretchAllowTriangles, Math.floor(stretch.length * 0.001))) break;
        }
        let region = new Set<number>();
        for (let t = 0; t < stretch.length; t += 1) if ((stretch[t] as number) > threshold) for (let k = 0; k < 3; k += 1) region.add(prim.indices[t * 3 + k] as number);
        for (let r = 0; r < Math.max(1, Math.floor(options.smoothRings ?? 4)); r += 1) { const next = new Set(region); for (const v of region) for (const n of adj[v] ?? []) next.add(n); region = next; }
        for (let it = 0; it < 30; it += 1) {
          const next = weights.map((m) => new Map(m));
          for (const v of region) {
            const nb = [...(adj[v] ?? [])];
            if (nb.length === 0) continue;
            const avg: Dense = new Map();
            for (const n of nb) for (const [j, w] of weights[n] as Dense) avg.set(j, (avg.get(j) ?? 0) + w / nb.length);
            const m: Dense = new Map();
            for (const [j, w] of weights[v] as Dense) m.set(j, 0.2 * w);
            for (const [j, w] of avg) m.set(j, (m.get(j) ?? 0) + 0.8 * w);
            next[v] = m;
          }
          weights = next;
        }
        smoothedVertices = Math.max(smoothedVertices, region.size);
        }
      }
      const changedWeights = Boolean(options.normalize || options.pruneDistant || options.smoothBridges);
      let indices = prim.indices;
      if (options.cutStretch !== undefined && stretch) {
        // re-measure after the weight edits so the cut only removes what is still stretched
        const keep: number[] = [];
        const edited: SkinnedPrimitive = changedWeights ? withWeights(prim, weights, K) : prim;
        const again = triangleStretch(skin, edited, poses, Infinity, 0).worst;
        for (let t = 0; t < again.length; t += 1) {
          if ((again[t] as number) <= options.cutStretch) keep.push(prim.indices[t * 3] as number, prim.indices[t * 3 + 1] as number, prim.indices[t * 3 + 2] as number);
          else removedTriangles += 1;
        }
        indices = keep;
      }
      if (changedWeights) {
        const J: number[] = [], W: number[] = [];
        for (let v = 0; v < nV; v += 1) {
          const top = [...(weights[v] as Dense).entries()].sort((a, b) => b[1] - a[1]).slice(0, K);
          const sum = top.reduce((a, [, w]) => a + w, 0) || 1;
          if (top.length === 0) normalizedVertices += 1;
          if (Math.abs(((prim.weights[v] ?? []).reduce((a, b) => a + b, 0)) - 1) > DEFAULT_SKIN_THRESHOLDS.weightSumTolerance) normalizedVertices += 1;
          for (let k = 0; k < 4; k += 1) { J.push(top[k]?.[0] ?? 0); W.push(top[k] ? top[k][1] / sum : 0); }
        }
        const primitive = editor.primitive(prim.meshIndex, prim.primitiveIndex);
        primitive.attributes.JOINTS_0 = editor.addAccessor(J, 5123, "VEC4", 34962);
        primitive.attributes.WEIGHTS_0 = editor.addAccessor(W, 5126, "VEC4", 34962);
      }
      if (removedTriangles > 0) {
        const primitive = editor.primitive(prim.meshIndex, prim.primitiveIndex);
        primitive.indices = editor.addAccessor(indices, nV > 65535 ? 5125 : 5123, "SCALAR", 34963);
      }
      reports.push({ material: prim.materialName, normalizedVertices, prunedInfluences, smoothedVertices, removedTriangles });
    }
  }
  const repaired = editor.finish();
  const after = analyzeSkin(repaired, analysisOptions);
  if (before.bindMismatch.length > 0) {
    guidance.push(`Bind-pose mismatch on ${before.bindMismatch.map((b) => b.bone).join(", ")}: the mesh was modelled in a different pose than the skeleton assumes. Weight smoothing and triangle cuts only mask it. For a recognised humanoid run repair-skin --rebuild-limbs (rebuilds the legs in the skeleton's pose); otherwise rebuild the limbs in your DCC tool or regenerate and re-rig the model in the pose the skeleton assumes.`);
  }
  if (!after.ok && steps.length > 0) guidance.push(`Still failing after ${steps.join(", ")}: ${after.reasonCodes.join(", ")}. Cutting stretched triangles opens holes; prefer --rebuild-limbs or re-rigging.`);
  if (steps.length === 0) guidance.push("No repair step selected. Pass --normalize, --prune-distant, --smooth-bridges, --cut-stretch <limit> or --rebuild-limbs.");
  return { glb: repaired, report: { steps, primitives: reports, before, after, guidance } };
}

function withWeights(prim: SkinnedPrimitive, weights: Dense[], K: number): SkinnedPrimitive {
  const joints: number[][] = [], w: number[][] = [];
  for (let v = 0; v < prim.pos.length; v += 1) {
    const top = [...(weights[v] as Dense).entries()].sort((a, b) => b[1] - a[1]).slice(0, K);
    const sum = top.reduce((a, [, x]) => a + x, 0) || 1;
    joints.push([0, 1, 2, 3].map((k) => top[k]?.[0] ?? 0));
    w.push([0, 1, 2, 3].map((k) => (top[k] ? top[k][1] / sum : 0)));
  }
  return { ...prim, joints, weights: w };
}

export type { SkinInfo };
