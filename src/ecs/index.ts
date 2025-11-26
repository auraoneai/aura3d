/**
 * @module ECS
 * @description
 * Entity Component System (ECS) architecture for the G3D engine.
 *
 * This module provides a high-performance, data-oriented ECS implementation with support for:
 * - Efficient entity management with archetype-based storage
 * - Component registration and lifecycle management
 * - Fast entity queries with bitset filtering
 * - System scheduling with automatic dependency resolution
 * - Command buffering for deferred entity operations
 * - Serialization and deserialization of ECS state
 * - Built-in profiling and performance monitoring
 *
 * The ECS architecture separates data (components) from logic (systems), enabling better
 * code organization, improved cache locality, and easier parallelization.
 *
 * @example
 * ```typescript
 * import { World, Entity, Component } from './ecs';
 *
 * // Define a component
 * class Position extends Component {
 *   x: number = 0;
 *   y: number = 0;
 * }
 *
 * // Create a world and entities
 * const world = new World();
 * const entity = world.createEntity();
 * world.addComponent(entity, Position, { x: 10, y: 20 });
 *
 * // Query entities with specific components
 * const query = world.query([Position]);
 * for (const entity of query) {
 *   const pos = world.getComponent(entity, Position);
 *   console.log(`Position: ${pos.x}, ${pos.y}`);
 * }
 * ```
 */

// Core ECS exports
export * from './Entity';
export * from './Bitset';
export * from './SparseSet';
export * from './Component';
export { Archetype } from './Archetype';
export * from './CommandBuffer';
export * from './Scheduler';

// Export from ComponentRegistry (will override Component.ts types)
export { ComponentRegistry } from './ComponentRegistry';
export type { ComponentId, IComponent, ComponentType, ComponentFieldType, ComponentSchema, ComponentMetadata } from './ComponentRegistry';

// Export from Query (single source of truth)
export { Query } from './Query';
export type { QueryDescriptor } from './Query';

// Export from System (single source of truth)
export { System } from './System';
export type { IWorld } from './System';

// Export from World (single source of truth)
export { World } from './World';
export type { WorldOptions } from './World';

// Export from Serializer
export { ECSSerializer, PrefabManager } from './Serializer';

// Export from ECSProfiler
export { ECSProfiler, Profile } from './ECSProfiler';

// Export types separately to avoid conflicts
export type { SystemProfile, ArchetypeProfile, QueryProfile, WorldProfile, FrameProfile } from './ECSProfiler';
export type { EntityRecord } from './EntityManager';

// Components
export * from './components/TransformComponent';
export * from './components/TagComponent';
export * from './components/HierarchyComponent';
export * from './components/NameComponent';
export * from './components/ActiveComponent';

// Systems
export * from './systems';
