/**
 * muse3jsparity-PRD PART T box T3b — assertFrameGraphResourceFlow.
 *
 * Source-verified basis (2026-09-04): the six production passes
 * (`packages/rendering/src/production-runtime/passes/`) own real logic
 * (validated options, truthful reads/writes, resource validation, context
 * validation, execution bookkeeping) and are barrel-exported from
 * `packages/rendering/src/production-runtime/index.ts:113-120`, re-surfaced
 * at `@aura3d/engine` `./rendering/production-runtime`. Canonical order and
 * the reads-before-written check live in `passes/FramegraphTopology.ts`
 * (`validatePassOrder`, `validatePassResourceFlow`), proven by
 * `tests/unit/rendering/framegraph-passes-t3.test.ts`.
 *
 * This assert is the named T3 gate "built for real": it takes pass records
 * structurally (no package import, so tools never deep-import owned source)
 * and enforces the full contract — canonical order, reads-before-written,
 * every non-terminal write consumed downstream, unique pass ids. Strictly
 * stronger than either topology validator alone.
 */

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

const DEFAULT_EXTERNAL_PREFIXES = ["scene.", "environment.", "shadow."] as const;
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
  const prefixes = options.externalPrefixes ?? DEFAULT_EXTERNAL_PREFIXES;

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
      if (!produced.has(resource) && !isExternal(resource, prefixes)) {
        breaks.push(`${pass.id} reads unwritten resource: ${resource}.`);
      }
    }
    for (const resource of pass.writes) produced.add(resource);
  }

  const readDownstream = new Set<string>();
  for (const pass of passes) {
    for (const resource of pass.reads) readDownstream.add(resource);
  }
  for (const pass of passes) {
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
