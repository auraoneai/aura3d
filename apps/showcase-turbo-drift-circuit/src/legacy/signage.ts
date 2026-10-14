/**
 * Turbo Drift Circuit start/finish gantry signage (PRD TDC-A4 / C8 text3D).
 *
 * The gantry carries two real extruded-glyph boards built with the engine's
 * `text3D` surface (bitmap-glyph triangle meshes with depth - not DOM labels, not
 * canvas textures): a static "TSUKUBA" circuit name and a lap-state board whose
 * text is driven by the race session state.
 *
 * Every label is checked against the engine glyph set (A-Z, 0-9, space) before it can
 * be rendered, so an unsupported character fails here rather than silently missing
 * strokes on the board.
 */

/** Engine `createAuraText3DGeometry` supports these characters plus space. */
export const TURBO_SIGNAGE_GLYPH_PATTERN = /^[A-Z0-9 ]+$/;

export function turboSignageLabelIsGlyphSafe(label: string): boolean {
  return label.length > 0 && TURBO_SIGNAGE_GLYPH_PATTERN.test(label);
}

export function assertTurboSignageLabels(labels: readonly string[]): void {
  for (const label of labels) {
    if (!turboSignageLabelIsGlyphSafe(label)) {
      throw new Error(
        "Turbo signage label contains glyphs outside the engine A-Z/0-9 set: " + JSON.stringify(label)
      );
    }
  }
}

export interface TurboGantryPlanInput {
  /** Centreline sample at the start/finish line (game plane + kit heading). */
  readonly startLine: { readonly x: number; readonly y: number; readonly heading: number };
  /** Game-to-scene point converter from the racing scene binding. */
  readonly toScenePoint: (point: { readonly x: number; readonly y: number }, y?: number) => readonly [number, number, number];
  /** Scene-space road half width the gantry must span. */
  readonly roadHalfWidthScene: number;
  /** Scene Y of the track contact plane. */
  readonly trackY: number;
  /** Height of the crossbar above the track plane, scene units. */
  readonly crossbarHeightScene?: number;
}

export interface TurboGantryPlan {
  readonly boardYaw: number;
  readonly postPositions: readonly [readonly [number, number, number], readonly [number, number, number]];
  readonly postSize: readonly [number, number, number];
  readonly crossbarCenter: readonly [number, number, number];
  readonly crossbarSize: readonly [number, number, number];
  readonly circuitBoardCenter: readonly [number, number, number];
  readonly lapBoardCenter: readonly [number, number, number];
  readonly boardSize: readonly [number, number, number];
  readonly backingSize: readonly [number, number, number];
}

/**
 * Solves the gantry layout in scene space: two posts outside the road, a crossbar, and
 * two glyph boards hung beneath it. Boards face back along the travel direction so the
 * approaching driver reads them (yaw mirrors the kit's own pose convention, plus pi).
 */
export function planTurboGantry(input: TurboGantryPlanInput): TurboGantryPlan {
  const crossbarHeight = input.crossbarHeightScene ?? 0.9;
  const halfSpan = Math.max(0.35, input.roadHalfWidthScene + 0.16);
  const center = input.toScenePoint(input.startLine, input.trackY);
  // Kit pose convention: scene yaw = -heading + pi/2 faces local +Z along travel;
  // boards must face *against* travel, hence one extra pi.
  const boardYaw = -input.startLine.heading + Math.PI / 2 + Math.PI;
  const left = { x: Math.sin(input.startLine.heading), z: -Math.cos(input.startLine.heading) };
  const postOffsetX = left.x * halfSpan;
  const postOffsetZ = left.z * halfSpan;
  const postHeight = crossbarHeight + 0.04;
  return {
    boardYaw,
    postPositions: [
      [center[0] + postOffsetX, input.trackY + postHeight / 2, center[2] + postOffsetZ],
      [center[0] - postOffsetX, input.trackY + postHeight / 2, center[2] - postOffsetZ]
    ],
    postSize: [0.045, postHeight, 0.045],
    crossbarCenter: [center[0], input.trackY + crossbarHeight + 0.02, center[2]],
    crossbarSize: [halfSpan * 2 + 0.05, 0.032, 0.04],
    circuitBoardCenter: [center[0], input.trackY + crossbarHeight - 0.07, center[2]],
    lapBoardCenter: [center[0], input.trackY + crossbarHeight - 0.14, center[2]],
    boardSize: [0.34, 0.055, 0.012],
    // The board is an identity/status instrument, not a billboard wall. Keep it
    // shallow enough that the chase camera sees the rival, gate, and horizon
    // through the gantry opening.
    backingSize: [halfSpan * 2 + 0.02, 0.13, 0.006]
  };
}
