/**
 * P-1..P-4 verdict logic for the Crayon probe (threejs-parity §9). Pure and
 * side-effect free so it is unit-tested without a browser.
 *
 * Honesty rules (the previous probe violated both):
 *  - `no` requires proof that the question was actually asked: a live scene
 *    traversal that ran over a populated scene, or a module-level proof that
 *    the class cannot be constructed. Otherwise the answer is `inconclusive`.
 *  - A heap-snapshot class name is never evidence of use. Core three classes
 *    (BatchedMesh, ShaderMaterial, InstancedMesh) are present in every three
 *    build, so heap hits on them only mean "the library is loaded".
 */

export type AnswerBasis = "live" | "module" | "heap" | "none";

export interface ProbeAnswer {
  readonly answer: "yes" | "no" | "inconclusive";
  readonly basis: AnswerBasis;
  readonly value: unknown;
  readonly detail: string;
}

export interface SceneCensus {
  readonly scenes: number;
  readonly objects: number;
  readonly batchedMeshes: number;
  readonly instancedMeshes: number;
  readonly shaderMaterials: number;
  readonly rawShaderMaterials: number;
  readonly nodeMaterialClasses: number;
  readonly nodeMaterialsAuthored: number;
}

export interface PipelineWalk {
  readonly composers: number;
  readonly postProcessing: number;
  readonly nodesVisited: number;
  readonly truncated: boolean;
  readonly errors?: number;
  readonly failed?: boolean;
}

export interface ResourceSignals {
  readonly threeCoreLoaded: boolean;
  readonly webgpuBuild: readonly string[];
  readonly effectComposerModule?: readonly string[];
  readonly composerModule: readonly string[];
  readonly passModules: readonly string[];
}

export interface ProbeEvidence {
  readonly hookInstalled: boolean;
  readonly traversal?: SceneCensus;
  readonly pipelines?: PipelineWalk;
  readonly resourceSignals?: ResourceSignals;
  readonly importmapHasWebgpu?: boolean;
  readonly renderers?: readonly { readonly kind: string }[];
  readonly heap: Readonly<Record<string, number>>;
  readonly heapBytes: number;
}

/** A scene was captured and holds at least one child beyond the scene root. */
export function liveTraversalRan(ev: ProbeEvidence): boolean {
  const t = ev.traversal;
  return ev.hookInstalled && !!t && t.scenes >= 1 && t.objects > t.scenes;
}

export function buildVerdicts(ev: ProbeEvidence): {
  readonly p1: ProbeAnswer;
  readonly p2: ProbeAnswer;
  readonly p3: ProbeAnswer;
  readonly p4: ProbeAnswer;
} {
  const t = ev.traversal;
  const ran = liveTraversalRan(ev);
  const heapNode = ev.heap.NodeMaterial ?? 0;
  const heapComposer = ev.heap.EffectComposer ?? 0;
  const heapPost = ev.heap.PostProcessing ?? 0;
  const res = ev.resourceSignals;
  const sceneSummary = t ? `${t.scenes} scene(s), ${t.objects} objects` : "no scene captured";

  // P-1: node materials actually authored on a live material.
  // Heap class names are deliberately NOT used here: a lone `"NodeMaterial"` string appears in plain three builds.
  const webgpuRenderer = (ev.renderers ?? []).some((r) => r.kind === "WebGPURenderer");
  const webgpuLoaded = (res?.webgpuBuild.length ?? 0) > 0 || ev.importmapHasWebgpu === true || webgpuRenderer;
  const p1Value = {
    authored: t?.nodeMaterialsAuthored ?? 0,
    nodeMaterialClasses: t?.nodeMaterialClasses ?? 0,
    webgpuBuildResources: res?.webgpuBuild ?? [],
    importmapHasWebgpu: ev.importmapHasWebgpu === true,
    webgpuRendererObserved: webgpuRenderer,
    heapNodeMaterialNames: heapNode
  };
  let p1: ProbeAnswer;
  if ((t?.nodeMaterialsAuthored ?? 0) > 0) {
    p1 = { answer: "yes", basis: "live", value: p1Value, detail: `${t!.nodeMaterialsAuthored} live NodeMaterial(s) with fragmentNode/colorNode/positionNode set (${sceneSummary})` };
  } else if (!webgpuLoaded && res?.threeCoreLoaded === true) {
    p1 = { answer: "no", basis: "module", value: p1Value, detail: "three loaded from the importmap with no three/webgpu or three/tsl build requested; NodeMaterial cannot be constructed" };
  } else if (ran) {
    p1 = { answer: "no", basis: "live", value: p1Value, detail: `live traversal found 0 authored NodeMaterials (${sceneSummary})` };
  } else {
    p1 = { answer: "inconclusive", basis: "none", value: p1Value, detail: `no populated scene captured (${sceneSummary}); cannot rule node materials in or out` };
  }

  // P-2: BatchedMesh instances.
  const p2Value = { liveBatchedMeshes: t?.batchedMeshes ?? 0, instancedMeshes: t?.instancedMeshes ?? 0, heapClassPresent: (ev.heap.BatchedMesh ?? 0) > 0 };
  let p2: ProbeAnswer;
  if ((t?.batchedMeshes ?? 0) > 0) {
    p2 = { answer: "yes", basis: "live", value: p2Value, detail: `${t!.batchedMeshes} live isBatchedMesh object(s) (${sceneSummary})` };
  } else if (ran) {
    p2 = { answer: "no", basis: "live", value: p2Value, detail: `live traversal found 0 BatchedMesh (${sceneSummary}); heap class presence is ignored (core three class)` };
  } else {
    p2 = { answer: "inconclusive", basis: "none", value: p2Value, detail: `no populated scene captured (${sceneSummary}); heap class presence is not usage` };
  }

  // P-3: EffectComposer or the r186 PostProcessing pipeline.
  const composers = ev.pipelines?.composers ?? 0;
  const postProcessing = ev.pipelines?.postProcessing ?? 0;
  const walkIncomplete = !ev.pipelines || ev.pipelines.truncated || ev.pipelines.failed === true;
  const composerModuleLoaded = (res?.composerModule.length ?? 0) > 0 || (res?.passModules.length ?? 0) > 0;
  const p3Value = {
    liveComposers: composers,
    livePostProcessing: postProcessing,
    composerModuleResources: res?.composerModule ?? [],
    passModuleResources: res?.passModules ?? [],
    heapComposerNames: heapComposer,
    heapPostProcessingNames: heapPost,
    walk: ev.pipelines ? { nodesVisited: ev.pipelines.nodesVisited, truncated: ev.pipelines.truncated, failed: ev.pipelines.failed === true } : null
  };
  let p3: ProbeAnswer;
  if (composers > 0 || postProcessing > 0) {
    p3 = { answer: "yes", basis: "live", value: p3Value, detail: `${composers} live EffectComposer, ${postProcessing} live PostProcessing reachable from window/renderer` };
  } else if ((res?.effectComposerModule?.length ?? 0) > 0) {
    p3 = { answer: "yes", basis: "module", value: p3Value, detail: "EffectComposer.js was fetched by the game's importmap (an addon only loads when game code imports it); the instance is closure-held and not reachable from window or the renderer" };
  } else if (ran && !walkIncomplete && !composerModuleLoaded && !webgpuLoaded && res?.threeCoreLoaded === true) {
    p3 = { answer: "no", basis: "module", value: p3Value, detail: `populated scene rendered (${sceneSummary}) with no postprocessing addon module and no three/webgpu build requested by the importmap game` };
  } else {
    p3 = { answer: "inconclusive", basis: "none", value: p3Value, detail: "composer/pipeline class may exist (module loaded, inlined bundle, or closure-held) but no live instance was reachable from window or the renderer" };
  }

  // P-4: GLSL ShaderMaterial / RawShaderMaterial on live materials.
  const shader = t?.shaderMaterials ?? 0;
  const raw = t?.rawShaderMaterials ?? 0;
  const p4Value = { liveShader: shader, liveRawShader: raw, heapShaderNames: ev.heap.ShaderMaterial ?? 0, heapRawShaderNames: ev.heap.RawShaderMaterial ?? 0 };
  let p4: ProbeAnswer;
  if (shader + raw > 0) {
    p4 = { answer: "yes", basis: "live", value: p4Value, detail: `${shader} live isShaderMaterial, ${raw} live isRawShaderMaterial (${sceneSummary})` };
  } else if (ran) {
    p4 = { answer: "no", basis: "live", value: p4Value, detail: `live traversal found 0 ShaderMaterial/RawShaderMaterial (${sceneSummary}); heap class presence is ignored (core three class)` };
  } else {
    p4 = { answer: "inconclusive", basis: "none", value: p4Value, detail: `no populated scene captured (${sceneSummary}); a heap ShaderMaterial hit is only the library class` };
  }

  return { p1, p2, p3, p4 };
}
