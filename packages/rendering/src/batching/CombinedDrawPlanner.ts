/**
 * A bounded ordering helper for a future combined indexed draw. The caller
 * supplies already-prepared records in the exact forward draw order, using a
 * shared identity key only for members with identical non-row draw inputs.
 * Neither this planner nor a matching key authenticates a device, producer,
 * material, shader, callback state, or resource lifetime.
 */

/** Each run also needs six RGBA texels per draw in the staged draw-data layout. */
export const MAX_COMBINED_DRAW_MEMBERS = 256;
/** Callers can plan a larger queue in chunks while preserving chunk boundaries. */
export const MAX_COMBINED_DRAW_PLAN_ITEMS = 4096;

export interface CombinedDrawPlanEntry {
  /** Opaque identity of every shared draw input, established by the caller. */
  readonly compatibilityKey: object;
  readonly indexType: "uint16" | "uint32";
  /** Packed-arena index units, not bytes. */
  readonly firstIndex: number;
  readonly indexCount: number;
}

export interface CombinedDrawPlanMember {
  readonly itemIndex: number;
  readonly firstIndex: number;
  readonly indexCount: number;
}

export interface CombinedDrawPlanRun {
  readonly indexType: "uint16" | "uint32";
  /** In submission order; each run's first member uses gl_DrawID zero. */
  readonly members: readonly CombinedDrawPlanMember[];
}

const MAX_GL_INT = 0x7fffffff;

function snapshotEntry(entry: CombinedDrawPlanEntry | null | undefined): CombinedDrawPlanEntry | undefined {
  if (!entry) return undefined;
  // Read each field once: even a malformed caller-supplied record must not
  // change between the range check and the resulting immutable plan.
  const { compatibilityKey, indexType, firstIndex, indexCount } = entry;
  if ((typeof compatibilityKey !== "object" && typeof compatibilityKey !== "function")
      || compatibilityKey === null || (indexType !== "uint16" && indexType !== "uint32")
      || !Number.isSafeInteger(firstIndex) || firstIndex < 0
      || !Number.isSafeInteger(indexCount) || indexCount <= 0 || indexCount > MAX_GL_INT) return undefined;
  const bytesPerIndex = indexType === "uint32" ? 4 : 2;
  if (firstIndex > Math.floor(MAX_GL_INT / bytesPerIndex)) return undefined;
  return { compatibilityKey, indexType, firstIndex, indexCount };
}

/**
 * Return only runs of at least two adjacent compatible candidates. Undefined,
 * null and invalid entries are barriers, as are key/type changes and the run
 * size limit. Members not returned in a run must be drawn separately in their
 * original positions. Input records are descriptive snapshots and must be
 * revalidated by the submitter; a planned run grants no permission to draw.
 */
export function planCombinedDrawRuns(
  entries: readonly (CombinedDrawPlanEntry | null | undefined)[],
  maxMembers = MAX_COMBINED_DRAW_MEMBERS
): readonly CombinedDrawPlanRun[] {
  if (!Number.isSafeInteger(maxMembers) || maxMembers < 1 || maxMembers > MAX_COMBINED_DRAW_MEMBERS) {
    throw new RangeError(`maxMembers must be an integer between 1 and ${MAX_COMBINED_DRAW_MEMBERS}`);
  }
  if (entries.length > MAX_COMBINED_DRAW_PLAN_ITEMS) {
    throw new RangeError(`Combined draw planning is limited to ${MAX_COMBINED_DRAW_PLAN_ITEMS} items per call`);
  }
  if (maxMembers === 1) return Object.freeze([]);
  const runs: CombinedDrawPlanRun[] = [];
  let key: object | undefined;
  let indexType: "uint16" | "uint32" | undefined;
  let members: CombinedDrawPlanMember[] = [];
  const finish = (): void => {
    if (members.length >= 2 && indexType !== undefined) {
      runs.push(Object.freeze({ indexType, members: Object.freeze(members) }));
    }
    key = undefined;
    indexType = undefined;
    members = [];
  };
  for (let itemIndex = 0; itemIndex < entries.length; itemIndex += 1) {
    const entry = snapshotEntry(entries[itemIndex]);
    if (!entry) { finish(); continue; }
    if (members.length && (entry.compatibilityKey !== key || entry.indexType !== indexType || members.length >= maxMembers)) finish();
    if (!members.length) { key = entry.compatibilityKey; indexType = entry.indexType; }
    members.push(Object.freeze({ itemIndex, firstIndex: entry.firstIndex, indexCount: entry.indexCount }));
  }
  finish();
  return Object.freeze(runs);
}
