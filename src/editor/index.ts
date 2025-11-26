/**
 * @fileoverview Editor Integration module main exports
 * @module editor
 */

// Core Editor
export { EditorEngine, EditorMode } from './EditorEngine';
export type { IEditorPlugin, EditorPreferences } from './EditorEngine';
export { EditorState, EditorTool, TransformSpace, PivotMode } from './EditorState';
export type { ViewportSettings, GridSnapSettings } from './EditorState';
export { Selection, SelectionManager } from './Selection';
export type { SelectionChangeEvent, SelectionFilter } from './Selection';
export { History, HistoryManager } from './History';
export type { HistoryChangeEvent } from './History';

// Commands
export * from './commands';

// Gizmos
export * from './gizmos';

// Picking
export * from './picking';

// Inspectors
export * from './inspectors';
