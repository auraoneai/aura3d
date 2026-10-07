// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import { createRootEditorSurface as createRootEditorSurfaceFn } from "@aura3d/editor-runtime";

const rootEditorSurface = createRootEditorSurfaceFn();

export const editor = {
  undo: rootEditorSurface.undo,
  redo: rootEditorSurface.redo,
  gizmo: rootEditorSurface.attachGizmo,
  playMode: { enter: rootEditorSurface.enterPlayMode, exit: rootEditorSurface.exitPlayMode },
  outliner: rootEditorSurface.describeOutliner,
  capabilityLabel: "editor" as const
} as const;
