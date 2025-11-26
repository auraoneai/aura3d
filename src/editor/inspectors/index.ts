/**
 * @fileoverview Inspector system exports
 * @module editor/inspectors
 */

export {
  InspectorRegistry,
} from './InspectorRegistry';
export type {
  IComponentInspector,
  IPropertyDrawer,
  FieldEditor
} from './InspectorRegistry';
export {
  TransformInspector,
  MaterialInspector,
  LightInspector,
  CameraInspector,
  registerBuiltInInspectors
} from './ComponentInspectors';
