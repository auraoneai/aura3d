export interface DrawEntry {
  readonly meshId: string;
  readonly skeletonId?: string;
}

export interface DoubleFrameFinding {
  readonly kind: "shared-skeleton" | "coincident-model" | "double-blend";
  readonly detail: string;
  readonly ids: readonly string[];
}

export interface DoubleFrameReport {
  readonly ok: boolean;
  readonly findings: readonly DoubleFrameFinding[];
}

/** Two skinned meshes bound to one skeleton in the same frame draw the pose twice. */
export function detectSharedSkeleton(draws: readonly DrawEntry[]): DoubleFrameFinding[] {
  const bySkeleton = new Map<string, string[]>();
  for (const d of draws) {
    if (d.skeletonId === undefined) continue;
    const list = bySkeleton.get(d.skeletonId) ?? [];
    if (!list.includes(d.meshId)) list.push(d.meshId);
    bySkeleton.set(d.skeletonId, list);
  }
  const out: DoubleFrameFinding[] = [];
  for (const [skeleton, meshes] of bySkeleton) {
    if (meshes.length > 1) out.push({ kind: "shared-skeleton", detail: `skeleton ${skeleton} drives ${meshes.length} meshes`, ids: meshes });
  }
  return out;
}

export interface ModelInstance {
  readonly id: string;
  readonly modelId: string;
  readonly position: readonly [number, number, number];
}

/** Two instances of the same model at nearly the same place read as a ghost or doubled player. */
export function detectCoincidentModels(instances: readonly ModelInstance[], epsilon = 0.08): DoubleFrameFinding[] {
  const out: DoubleFrameFinding[] = [];
  for (let i = 0; i < instances.length; i += 1) {
    for (let j = i + 1; j < instances.length; j += 1) {
      const a = instances[i]!;
      const b = instances[j]!;
      if (a.modelId !== b.modelId) continue;
      const d = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2]);
      if (d <= epsilon) out.push({ kind: "coincident-model", detail: `${a.id} and ${b.id} (${a.modelId}) are ${d.toFixed(3)} m apart`, ids: [a.id, b.id] });
    }
  }
  return out;
}

export interface AnimLayer {
  readonly name: string;
  readonly clip: string;
  readonly weight: number;
  readonly blendMode?: "override" | "additive";
}

/** Override layers summing past 1, or one clip applied on two layers, give the doubled look. */
export function detectDoubleBlend(layers: readonly AnimLayer[]): DoubleFrameFinding[] {
  const out: DoubleFrameFinding[] = [];
  const active = layers.filter((l) => l.weight > 1e-3);
  const overrideSum = active.filter((l) => (l.blendMode ?? "override") === "override").reduce((s, l) => s + l.weight, 0);
  if (overrideSum > 1.001) out.push({ kind: "double-blend", detail: `override layers sum to ${overrideSum.toFixed(3)}`, ids: active.map((l) => l.name) });
  const byClip = new Map<string, string[]>();
  for (const l of active) byClip.set(l.clip, [...(byClip.get(l.clip) ?? []), l.name]);
  for (const [clip, names] of byClip) {
    if (names.length > 1) out.push({ kind: "double-blend", detail: `clip ${clip} is applied on ${names.length} layers`, ids: names });
  }
  return out;
}

export function checkDoubleFrame(input: { readonly draws?: readonly DrawEntry[]; readonly instances?: readonly ModelInstance[]; readonly layers?: readonly AnimLayer[]; readonly epsilon?: number }): DoubleFrameReport {
  const findings = [
    ...detectSharedSkeleton(input.draws ?? []),
    ...detectCoincidentModels(input.instances ?? [], input.epsilon),
    ...detectDoubleBlend(input.layers ?? [])
  ];
  return { ok: findings.length === 0, findings };
}
