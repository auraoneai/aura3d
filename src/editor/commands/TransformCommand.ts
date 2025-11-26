/**
 * @fileoverview Transform command for position, rotation, and scale changes
 * with merge support for continuous operations.
 * @module editor/commands/TransformCommand
 */

import { ICommand, BaseCommand } from './Command';
import { Entity } from '../../ecs/Entity';
import { Transform } from '../../components/Transform';
import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';

/**
 * Transform change data
 */
export interface TransformChange {
  /** Position change */
  position?: Vector3;
  /** Rotation change */
  rotation?: Quaternion;
  /** Scale change */
  scale?: Vector3;
}

/**
 * Transform state snapshot
 */
interface TransformState {
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
}

/**
 * Command for transforming entities (position, rotation, scale).
 * Supports multiple entities and merging for continuous transforms.
 *
 * @example
 * ```typescript
 * // Transform a single entity
 * const cmd = new TransformCommand(entity, {
 *   position: new Vector3(10, 0, 0)
 * });
 * History.execute(cmd);
 *
 * // Transform multiple entities
 * const cmd = new TransformCommand([entity1, entity2], {
 *   position: new Vector3(0, 5, 0),
 *   scale: new Vector3(2, 2, 2)
 * });
 * ```
 */
export class TransformCommand extends BaseCommand {
  public description: string;
  private entities: Entity[];
  private oldStates: Map<Entity, TransformState> = new Map();
  private newChanges: TransformChange;
  private mergeTimeMs: number = 100; // Time window for merging

  private lastExecuteTime: number = 0;

  /**
   * Creates a transform command
   * @param entities - Entity or array of entities to transform
   * @param changes - Transform changes to apply
   * @param description - Optional custom description
   */
  constructor(
    entities: Entity | Entity[],
    changes: TransformChange,
    description?: string
  ) {
    super();

    this.entities = Array.isArray(entities) ? entities : [entities];
    this.newChanges = changes;

    // Capture old states
    this.entities.forEach(entity => {
      const transform = entity.getComponent(Transform);
      if (transform) {
        this.oldStates.set(entity, {
          position: transform.position.clone(),
          rotation: transform.rotation.clone(),
          scale: transform.scale.clone()
        });
      }
    });

    // Generate description
    this.description = description || this.generateDescription();
  }

  /**
   * Generates a description based on the changes
   */
  private generateDescription(): string {
    const parts: string[] = [];

    if (this.newChanges.position) parts.push('position');
    if (this.newChanges.rotation) parts.push('rotation');
    if (this.newChanges.scale) parts.push('scale');

    const entityCount = this.entities.length;
    const entityText = entityCount === 1 ? 'entity' : `${entityCount} entities`;

    return `Transform ${parts.join(', ')} of ${entityText}`;
  }

  /**
   * Executes the transform
   */
  public execute(): void {
    this.entities.forEach(entity => {
      const transform = entity.getComponent(Transform);
      if (!transform) return;

      if (this.newChanges.position) {
        transform.position.copy(this.newChanges.position);
      }

      if (this.newChanges.rotation) {
        transform.rotation.copy(this.newChanges.rotation);
      }

      if (this.newChanges.scale) {
        transform.scale.copy(this.newChanges.scale);
      }

      transform.markDirty();
    });

    this.lastExecuteTime = Date.now();
  }

  /**
   * Undoes the transform
   */
  public undo(): void {
    this.entities.forEach(entity => {
      const transform = entity.getComponent(Transform);
      const oldState = this.oldStates.get(entity);

      if (!transform || !oldState) return;

      transform.position.copy(oldState.position);
      transform.rotation.copy(oldState.rotation);
      transform.scale.copy(oldState.scale);
      transform.markDirty();
    });
  }

  /**
   * Checks if this command can be merged with another
   */
  public canMerge(other: ICommand): boolean {
    if (!(other instanceof TransformCommand)) {
      return false;
    }

    // Check if entities match
    if (this.entities.length !== other.entities.length) {
      return false;
    }

    for (let i = 0; i < this.entities.length; i++) {
      if (this.entities[i] !== other.entities[i]) {
        return false;
      }
    }

    // Check if within time window
    const timeDiff = Date.now() - this.lastExecuteTime;
    if (timeDiff > this.mergeTimeMs) {
      return false;
    }

    // Check if same transform properties are being modified
    const thisProps = this.getModifiedProps();
    const otherProps = other.getModifiedProps();

    return thisProps.every(prop => otherProps.includes(prop));
  }

  /**
   * Merges another transform command into this one
   */
  public merge(other: ICommand): void {
    if (!(other instanceof TransformCommand)) {
      throw new Error('Cannot merge with non-TransformCommand');
    }

    // Update new changes with values from other command
    if (other.newChanges.position) {
      this.newChanges.position = other.newChanges.position.clone();
    }

    if (other.newChanges.rotation) {
      this.newChanges.rotation = other.newChanges.rotation.clone();
    }

    if (other.newChanges.scale) {
      this.newChanges.scale = other.newChanges.scale.clone();
    }

    // Keep the old states from this command (the original state)
    // Don't update old states - we want to undo to the original
  }

  /**
   * Gets the list of modified properties
   */
  private getModifiedProps(): string[] {
    const props: string[] = [];
    if (this.newChanges.position) props.push('position');
    if (this.newChanges.rotation) props.push('rotation');
    if (this.newChanges.scale) props.push('scale');
    return props;
  }

  /**
   * Validates the command
   */
  public validate(): boolean {
    // Check that all entities have Transform component
    return this.entities.every(entity => entity.hasComponent(Transform));
  }

  /**
   * Gets the memory size of this command
   */
  public getSize(): number {
    // Base size + 3 vectors per entity (old state) + changes
    return 1 + this.entities.length * 3;
  }

  /**
   * Serializes the command
   */
  public serialize(): any {
    return {
      type: 'TransformCommand',
      entities: this.entities.map(e => e.id),
      changes: {
        position: this.newChanges.position?.toArray(),
        rotation: this.newChanges.rotation?.toArray(),
        scale: this.newChanges.scale?.toArray()
      },
      oldStates: Array.from(this.oldStates.entries()).map(([entity, state]) => ({
        entityId: entity.id,
        position: state.position.toArray(),
        rotation: state.rotation.toArray(),
        scale: state.scale.toArray()
      }))
    };
  }
}

/**
 * Specialized command for position-only transforms
 */
export class PositionCommand extends TransformCommand {
  constructor(entities: Entity | Entity[], position: Vector3, description?: string) {
    super(entities, { position }, description || 'Move');
  }
}

/**
 * Specialized command for rotation-only transforms
 */
export class RotationCommand extends TransformCommand {
  constructor(entities: Entity | Entity[], rotation: Quaternion, description?: string) {
    super(entities, { rotation }, description || 'Rotate');
  }
}

/**
 * Specialized command for scale-only transforms
 */
export class ScaleCommand extends TransformCommand {
  constructor(entities: Entity | Entity[], scale: Vector3, description?: string) {
    super(entities, { scale }, description || 'Scale');
  }
}
