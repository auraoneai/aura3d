import type { AuraSceneIR } from "./AuraSceneIR.js";

export interface AuraSceneDiffEntry {
  readonly path: string;
  readonly before: unknown;
  readonly after: unknown;
}

export function diffAuraSceneIR(before: AuraSceneIR, after: AuraSceneIR): readonly AuraSceneDiffEntry[] {
  const diffs: AuraSceneDiffEntry[] = [];
  compare("$.title", before.title, after.title, diffs);
  compare("$.brief", before.brief, after.brief, diffs);
  compare("$.objects.length", before.objects.length, after.objects.length, diffs);
  for (const object of after.objects) {
    const previous = before.objects.find((entry) => entry.id === object.id);
    if (!previous) {
      diffs.push({ path: `$.objects.${object.id}`, before: undefined, after: object });
      continue;
    }
    compare(`$.objects.${object.id}.transform`, previous.transform, object.transform, diffs);
    compare(`$.objects.${object.id}.materialId`, previous.materialId, object.materialId, diffs);
  }
  compare("$.lighting", before.lighting, after.lighting, diffs);
  compare("$.provenance.patches.length", before.provenance.patches.length, after.provenance.patches.length, diffs);
  return diffs;
}

function compare(path: string, before: unknown, after: unknown, diffs: AuraSceneDiffEntry[]): void {
  if (JSON.stringify(before) !== JSON.stringify(after)) diffs.push({ path, before, after });
}
