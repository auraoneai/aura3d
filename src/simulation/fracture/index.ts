/**
 * Fracture simulation module.
 * Provides Voronoi-based and hierarchical fracture systems for realistic destruction.
 * @module simulation/fracture
 */

export { VoronoiMath } from './VoronoiMath';
export type { VoronoiCell } from './VoronoiMath';

export { GeometryClipper } from './GeometryClipper';
export type { ClipResult } from './GeometryClipper';

export { VoronoiFractureSystem } from './VoronoiFractureSystem';
export type {
  FractureFragment,
  PrecomputedFracture,
  FractureConfig,
} from './VoronoiFractureSystem';

export { HierarchicalFractureSystem } from './HierarchicalFractureSystem';
export type {
  FragmentNode,
  FractureTree,
  DamageEvent,
  HierarchicalConfig,
} from './HierarchicalFractureSystem';
