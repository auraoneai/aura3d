/**
 * @module ECS/Components
 * @description
 * Built-in ECS components for the G3D engine.
 *
 * This module provides a collection of commonly used components that form the foundation
 * of the entity-component system. These components cover essential functionality such as:
 *
 * - **TransformComponent**: Spatial transformation (position, rotation, scale)
 * - **TagComponent**: Lightweight entity categorization and filtering
 * - **HierarchyComponent**: Parent-child relationships between entities
 * - **NameComponent**: Human-readable entity identification
 * - **ActiveComponent**: Entity activation state for scene management
 *
 * All components follow the ECS architecture principles and are designed for optimal
 * memory layout and cache efficiency.
 *
 * @example
 * ```typescript
 * import { TransformComponent, NameComponent, ActiveComponent } from './ecs/components';
 *
 * // Add multiple components to an entity
 * world.addComponent(entity, TransformComponent, { position: [0, 5, 0] });
 * world.addComponent(entity, NameComponent, { name: 'Player' });
 * world.addComponent(entity, ActiveComponent, { isActive: true });
 * ```
 */

// ECS Components barrel export
export { TransformComponent } from './TransformComponent';
export { TagComponent } from './TagComponent';
export { HierarchyComponent } from './HierarchyComponent';
export { NameComponent } from './NameComponent';
export { ActiveComponent } from './ActiveComponent';
