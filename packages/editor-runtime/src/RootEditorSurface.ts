/**
 * muse3jsparity-PRD O3 — bounded root editor surface (package side).
 *
 * Promotes the real editor stack (undo, gizmos, play-mode, outliner) from
 * package-only to a documented capability WITHOUT touching
 * `packages/engine/src/agent-api/index.ts`.
 *
 * Capability label: `production-runtime`/editor. This surface is NOT root
 * `createAuraApp` until root-only browser proof exists per the boundaries
 * doc — the `capabilityLabel` field states that on every handle.
 *
 * Bounded surface (O3 task 1):
 * - `undo()`/`redo()` over the shared `CommandHistory`.
 * - `attachGizmo("translate"|"rotate"|"scale", target?)` — command-backed
 *   gizmos with snap settings (position/rotation/scale).
 * - `enterPlayMode()`/`exitPlayMode()` over `PlayModeBridge` (host supplies
 *   the `SnapshotAdapter`; double-enter fails closed).
 * - `describeOutliner(root)` — DOM-free read model over `SceneOutliner`.
 *
 * Everything else (ShaderGraphModel, MaterialVariantWorkflow,
 * MultiUserReviewWorkflow, NonlinearAnimationEditor, VisualReviewDashboard)
 * stays package-labeled; import it from `@aura3d/editor-runtime` directly.
 *
 * Root wiring is a re-export hunk in agent-api (reported, not applied):
 * `export const editor = { undo, redo, gizmo, playMode, outliner }`
 * delegating to `createRootEditorSurface`.
 */
import type { AnimationSceneNode } from "./AnimationSceneEditor";
import type { Command, CommandContext } from "./Command";
import { CommandHistory } from "./CommandHistory";
import type { TransformTarget } from "./commands/TransformCommand";
import { Gizmo, normalizeGizmoSettings, type GizmoSettings } from "./Gizmo";
import { InteractiveTransformGizmo, type InteractiveTransformGizmoOptions } from "./InteractiveTransformGizmo";
import { PlayModeBridge, type SnapshotAdapter } from "./PlayModeBridge";
import { RotateGizmo } from "./RotateGizmo";
import { ScaleGizmo } from "./ScaleGizmo";
import { SceneOutliner, type SceneOutlinerItem } from "./SceneOutliner";
import { TranslateGizmo } from "./TranslateGizmo";

export type RootEditorGizmoKind = "translate" | "rotate" | "scale";

export interface RootEditorSurfaceOptions {
  readonly history?: CommandHistory;
  readonly gizmoSettings?: Partial<GizmoSettings>;
  readonly snapshotAdapter?: SnapshotAdapter<unknown>;
}

export interface RootEditorGizmoHandle {
  readonly kind: RootEditorGizmoKind;
  readonly gizmo: Gizmo;
  settings(): GizmoSettings;
}

export interface RootEditorSurface {
  /** Capability label — always editor/production-runtime, never root. */
  readonly capabilityLabel: "editor";
  readonly history: CommandHistory;
  execute(command: Command, context?: CommandContext): Promise<void>;
  undo(context?: CommandContext): Promise<void>;
  redo(context?: CommandContext): Promise<void>;
  get canUndo(): boolean;
  get canRedo(): boolean;
  attachGizmo(kind: RootEditorGizmoKind, target?: TransformTarget): RootEditorGizmoHandle;
  configureGizmoSnap(settings: Partial<GizmoSettings>): GizmoSettings;
  createInteractiveGizmo(options?: InteractiveTransformGizmoOptions): InteractiveTransformGizmo;
  enterPlayMode(): void;
  exitPlayMode(restore?: boolean): void;
  get isPlaying(): boolean;
  describeOutliner(root: AnimationSceneNode): readonly SceneOutlinerItem[];
}

export function createRootEditorSurface(options: RootEditorSurfaceOptions = {}): RootEditorSurface {
  const history = options.history ?? new CommandHistory();
  const outliner = new SceneOutliner();
  const playMode = new PlayModeBridge<unknown>(options.snapshotAdapter ?? {
    capture: () => undefined,
    restore: () => undefined
  });
  let gizmoSettings = normalizeGizmoSettings(options.gizmoSettings ?? {});
  let playing = false;

  return {
    capabilityLabel: "editor",
    history,
    execute: (command, context) => history.execute(command, context),
    undo: (context) => history.undo(context),
    redo: (context) => history.redo(context),
    get canUndo() {
      return history.canUndo;
    },
    get canRedo() {
      return history.canRedo;
    },
    attachGizmo: (kind, target) => {
      const gizmo = kind === "translate"
        ? new TranslateGizmo(history, gizmoSettings)
        : kind === "rotate"
          ? new RotateGizmo(history, gizmoSettings)
          : new ScaleGizmo(history, gizmoSettings);
      if (target !== undefined) gizmo.setTarget(target);
      return { kind, gizmo, settings: () => gizmo.snapshotSettings() };
    },
    configureGizmoSnap: (settings) => {
      gizmoSettings = normalizeGizmoSettings({ ...gizmoSettings, ...settings });
      return gizmoSettings;
    },
    createInteractiveGizmo: (gizmoOptions = {}) => new InteractiveTransformGizmo({
      ...gizmoOptions,
      settings: { ...gizmoSettings, ...(gizmoOptions.settings ?? {}) }
    }),
    enterPlayMode: () => {
      playMode.enter();
      playing = true;
    },
    exitPlayMode: (restore = true) => {
      playMode.exit({ restore });
      playing = false;
    },
    get isPlaying() {
      return playing;
    },
    describeOutliner: (root) => outliner.describe(root)
  };
}
