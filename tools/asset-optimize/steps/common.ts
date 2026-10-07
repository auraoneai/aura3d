import type { Document, Node } from "@gltf-transform/core";
import type { OptimizeStep, OptimizeStepContext, OptimizeStepRecord } from "../types.js";

/** Approximate serialized size: JSON-free — sums accessor arrays + texture image bytes. */
export function docByteSize(doc: Document): number {
  let bytes = 0;
  for (const accessor of doc.getRoot().listAccessors()) {
    bytes += accessor.getArray()?.byteLength ?? 0;
  }
  for (const texture of doc.getRoot().listTextures()) {
    bytes += texture.getImage()?.byteLength ?? 0;
  }
  return bytes;
}

/** Wraps a step body with timing + byte accounting → OptimizeStepRecord. */
export function recordStep(step: string, run: (doc: Document, ctx: OptimizeStepContext) => Promise<void>): OptimizeStep {
  return async (doc, ctx) => {
    const bytesBefore = docByteSize(doc);
    const started = Date.now();
    await run(doc, ctx);
    ctx.steps.push({ step, ms: Date.now() - started, bytesBefore, bytesAfter: docByteSize(doc) } satisfies OptimizeStepRecord);
  };
}

/** True when `node` is reachable from any scene root (excludes out-of-scene LOD targets). */
export function hasAncestorInScene(node: Node, root: ReturnType<Document["getRoot"]>): boolean {
  const seen = new Set<Node>();
  for (const scene of root.listScenes()) {
    for (const child of scene.listChildren()) {
      const stack: Node[] = [child];
      while (stack.length) {
        const cur = stack.pop()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        if (cur === node) return true;
        stack.push(...cur.listChildren());
      }
    }
  }
  return false;
}
