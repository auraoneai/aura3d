/** Static topology diagnostics only. Executed native resource flow is proven separately by
 * R06 unit/device assertions and browser pixels; metadata alone is never rendering proof. */

export interface FlowPassRecord {
  readonly id: string;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
}

export interface FrameGraphFlowOptions {
  /** Canonical pass order; when omitted, order is not checked. */
  readonly order?: readonly string[];
  /** Resources allowed to be written without a downstream reader. */
  readonly terminals?: readonly string[];
  /** Resource prefixes that exist before the graph runs. */
  readonly externalPrefixes?: readonly string[];
}

const DEFAULT_EXTERNAL_RESOURCES = ["scene.geometry", "scene.casters", "shadow.maps", "environment.sky", "environment.lighting"] as const;
const DEFAULT_TERMINALS = ["ldr.output"] as const;

function isExternal(resource: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => resource.startsWith(prefix));
}

/** Pure scan: every resource-flow break, in detection order. Empty is clean. */
export function findFrameGraphResourceBreaks(
  passes: readonly FlowPassRecord[],
  options: FrameGraphFlowOptions = {}
): readonly string[] {
  const breaks: string[] = [];
  const order = options.order;
  const terminals = new Set(options.terminals ?? DEFAULT_TERMINALS);
  const prefixes = options.externalPrefixes;

  const ids = passes.map((pass) => pass.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  for (const duplicate of [...new Set(duplicates)]) {
    breaks.push(`Duplicated production pass: ${duplicate}.`);
  }

  if (order) {
    for (const expected of order) {
      const count = ids.filter((id) => id === expected).length;
      if (count === 0) breaks.push(`Missing production pass: ${expected}.`);
    }
    const orderIndex = new Map(order.map((id, index) => [id, index] as const));
    let lastIndex = -1;
    for (const id of ids) {
      const index = orderIndex.get(id);
      if (index === undefined) {
        breaks.push(`Undocumented production pass: ${id}.`);
        continue;
      }
      if (index < lastIndex) breaks.push(`Misordered production pass: ${id}.`);
      lastIndex = Math.max(lastIndex, index);
    }
  }

  // NOTE: no single-writer rule. hdr.color is accumulated sequentially by
  // design (Skybox primes, Opaque composites, Transparent blends in place);
  // order + reads-before-written is the load-bearing invariant.
  const produced = new Set<string>();
  for (const pass of passes) {
    for (const resource of pass.reads) {
      if (!produced.has(resource) && !(prefixes ? isExternal(resource, prefixes) : DEFAULT_EXTERNAL_RESOURCES.some((name) => name === resource))) {
        breaks.push(`${pass.id} reads unwritten resource: ${resource}.`);
      }
    }
    for (const resource of pass.writes) produced.add(resource);
  }

  for (let index = 0; index < passes.length; index += 1) {
    const pass = passes[index]!;
    const readDownstream = new Set(passes.slice(index + 1).flatMap((downstream) => [...downstream.reads]));
    for (const resource of pass.writes) {
      if (!terminals.has(resource) && !readDownstream.has(resource)) {
        breaks.push(`${pass.id} writes ${resource} that no downstream pass reads.`);
      }
    }
  }
  return breaks;
}

/** Fail-closed gate: throws listing every resource-flow break. */
export function assertFrameGraphResourceFlow(
  passes: readonly FlowPassRecord[],
  options?: FrameGraphFlowOptions
): void {
  const breaks = findFrameGraphResourceBreaks(passes, options);
  if (breaks.length > 0) {
    throw new Error(`Framegraph resource-flow breaks (${breaks.length}):\n${breaks.map((item) => `  ${item}`).join("\n")}`);
  }
}
