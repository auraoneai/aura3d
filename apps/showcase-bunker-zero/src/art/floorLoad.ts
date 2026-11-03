/**
 * GU47 g11 phase 10: per-floor surface load. The scene used to build the mapped wall, accent, floor, ceiling and column
 * materials of all 7 floor slots at boot, so the maps of six hidden floors sat in the texture queue ahead of the active
 * floor's decals (texPending at every 25 s capture shot). Now only the boot slot's mapped surfaces are in the mounted scene;
 * every other slot mounts a map-free placeholder of the same geometry (always hidden, so shadow sizing and bounds read the
 * same scene), and its mapped surfaces are added through `app.nodes.add` when the floor is prepared: on the floor-clear
 * outcome, ahead of the descent (behind the transition banner), or at the latest when the floor starts.
 * Presentation only (PRD D8): sim, collision, scoring, input and replays never read these nodes.
 */

/** Material option keys that bind maps; the placeholder drops them and keeps the scalar look. */
export const BZ_MAP_KEYS = ["texture", "normal", "normalScale", "textureAnisotropy", "texTransforms"] as const;

/** The options without their maps (scalar placeholder material). */
export function withoutMaps<T extends object>(options: T): T {
  const out = { ...options } as Record<string, unknown>;
  for (const key of BZ_MAP_KEYS) delete out[key];
  return out as T;
}

/** Placeholder node id for a mapped static surface id. */
export const placeholderId = (id: string): string => `${id}-ph`;

/**
 * The slot the pending outcome starts next, so its surfaces load behind the outcome banner and the descent.
 * Slots: 0..5 the descent floors, 6 the Kill House. `null`: nothing starts (results panel).
 */
export function nextSlotOf(kind: "next" | "retry" | "killhouse-retry" | "to-descent" | "results", floorIdx: number, activeSlot: number, floors: number): number | null {
  switch (kind) {
    case "next": return floorIdx + 1 < floors ? floorIdx + 1 : null;
    case "retry": return activeSlot;
    case "killhouse-retry": return 6;
    case "to-descent": return 0;
    case "results": return null;
  }
}

export interface FloorSurfaceLoader<B> {
  /** Queues the mapped surfaces of a slot that is not mounted yet (at scene build). */
  defer(slot: number, builder: B): void;
  /** Adds the slot's deferred surfaces now (once). Returns the number of nodes added. */
  prepare(slot: number): number;
  /** Slots whose mapped surfaces are in the scene (mounted at boot or prepared). */
  loaded(): number[];
}

/**
 * Per-slot deferred surfaces. `bootSlot` is mounted with the scene; `add` mounts one node (the app's `app.nodes.add`) and
 * `afterAdd` runs once per prepared slot with the added count (the caller hides surfaces of a slot that is not active).
 */
export function createFloorSurfaceLoader<B>(bootSlot: number, add: (builder: B) => void, afterAdd?: (slot: number, added: number) => void): FloorSurfaceLoader<B> {
  const deferred = new Map<number, B[]>();
  const loaded = new Set<number>([bootSlot]);
  return {
    defer(slot, builder) {
      if (slot === bootSlot) throw new Error(`floor slot ${slot} is the boot slot: mount its surfaces with the scene`);
      const list = deferred.get(slot) ?? [];
      list.push(builder);
      deferred.set(slot, list);
    },
    prepare(slot) {
      if (loaded.has(slot)) return 0;
      const list = deferred.get(slot) ?? [];
      let added = 0;
      try {
        for (const builder of list) {
          add(builder);
          added += 1;
        }
      } finally {
        if (added > 0) {
          list.splice(0, added);
          afterAdd?.(slot, added);
        }
      }
      if (added === 0) afterAdd?.(slot, 0);
      deferred.delete(slot);
      loaded.add(slot);
      return added;
    },
    loaded() {
      return [...loaded].sort((a, b) => a - b);
    }
  };
}
