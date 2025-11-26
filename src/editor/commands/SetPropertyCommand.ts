/**
 * @fileoverview Command for setting component properties with path-based access.
 * @module editor/commands/SetPropertyCommand
 */

import { BaseCommand } from './Command';
import { Entity } from '../../ecs/Entity';
import { IComponent } from '../../ecs/Component';
import { World } from '../../ecs/World';

/**
 * Property path parser for nested property access
 */
class PropertyPath {
  private parts: string[];

  constructor(path: string) {
    this.parts = path.split('.');
  }

  /**
   * Gets a property value from an object
   */
  public getValue(obj: any): any {
    let current = obj;
    for (const part of this.parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      // Handle array indices
      const match = part.match(/^(\w+)\[(\d+)\]$/);
      if (match) {
        current = current[match[1]];
        if (Array.isArray(current)) {
          current = current[parseInt(match[2])];
        }
      } else {
        current = current[part];
      }
    }
    return current;
  }

  /**
   * Sets a property value on an object
   */
  public setValue(obj: any, value: any): void {
    if (this.parts.length === 0) return;

    let current = obj;

    // Navigate to parent of target property
    for (let i = 0; i < this.parts.length - 1; i++) {
      const part = this.parts[i];

      // Handle array indices
      const match = part.match(/^(\w+)\[(\d+)\]$/);
      if (match) {
        current = current[match[1]];
        if (Array.isArray(current)) {
          current = current[parseInt(match[2])];
        }
      } else {
        current = current[part];
      }

      if (current === null || current === undefined) {
        throw new Error(`Cannot access property path: ${this.parts.join('.')}`);
      }
    }

    // Set the final property
    const lastPart = this.parts[this.parts.length - 1];
    const match = lastPart.match(/^(\w+)\[(\d+)\]$/);

    if (match) {
      const array = current[match[1]];
      if (Array.isArray(array)) {
        array[parseInt(match[2])] = value;
      }
    } else {
      current[lastPart] = value;
    }
  }

  /**
   * Clones a value (deep copy for objects/arrays)
   */
  public static cloneValue(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }

    // Handle primitives
    if (typeof value !== 'object') {
      return value;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(item => PropertyPath.cloneValue(item));
    }

    // Handle objects with clone method
    if (typeof value.clone === 'function') {
      return value.clone();
    }

    // Handle plain objects
    if (value.constructor === Object) {
      const cloned: any = {};
      for (const key in value) {
        cloned[key] = PropertyPath.cloneValue(value[key]);
      }
      return cloned;
    }

    // For other objects, return as-is (might need custom handling)
    return value;
  }
}

/**
 * Command for setting component properties with undo support.
 * Supports nested properties and array elements via path notation.
 *
 * @example
 * ```typescript
 * // Set a simple property
 * const cmd = new SetPropertyCommand(
 *   entity,
 *   Transform,
 *   'position.x',
 *   10
 * );
 *
 * // Set array element
 * const cmd = new SetPropertyCommand(
 *   entity,
 *   MeshRenderer,
 *   'materials[0].color',
 *   new Color(1, 0, 0)
 * );
 *
 * // Set on multiple entities
 * const cmd = new SetPropertyCommand(
 *   [entity1, entity2],
 *   Transform,
 *   'scale',
 *   new Vector3(2, 2, 2)
 * );
 * ```
 */
export class SetPropertyCommand extends BaseCommand {
  public description: string;
  private entities: Entity[];
  private componentType: new (...args: any[]) => IComponent;
  private propertyPath: string;
  private newValue: any;
  private oldValues: Map<Entity, any> = new Map();
  private path: PropertyPath;
  private mergeTimeMs: number = 100;
  private lastExecuteTime: number = 0;
  private world: World;

  /**
   * Creates a set property command
   * @param world - World instance for component access
   * @param entities - Entity or entities to modify
   * @param componentType - Component class
   * @param propertyPath - Property path (e.g., 'position.x' or 'materials[0].color')
   * @param newValue - New value to set
   * @param description - Optional custom description
   */
  constructor(
    world: World,
    entities: Entity | Entity[],
    componentType: new (...args: any[]) => IComponent,
    propertyPath: string,
    newValue: any,
    description?: string
  ) {
    super();

    this.world = world;
    this.entities = Array.isArray(entities) ? entities : [entities];
    this.componentType = componentType;
    this.propertyPath = propertyPath;
    this.newValue = newValue;
    this.path = new PropertyPath(propertyPath);

    // Capture old values
    this.entities.forEach(entity => {
      const component = this.world.getComponent(entity, componentType);
      if (component) {
        const oldValue = this.path.getValue(component);
        this.oldValues.set(entity, PropertyPath.cloneValue(oldValue));
      }
    });

    // Generate description
    const componentName = componentType.name;
    const entityCount = this.entities.length;
    const entityText = entityCount === 1 ? '' : ` on ${entityCount} entities`;

    this.description = description ||
      `Set ${componentName}.${propertyPath}${entityText}`;
  }

  /**
   * Executes the property change
   */
  override execute(): void {
    this.entities.forEach(entity => {
      const component = this.world.getComponent(entity, this.componentType);
      if (!component) return;

      this.path.setValue(component, PropertyPath.cloneValue(this.newValue));

      // Notify component of change if it has update methods
      if ((component as any).markDirty) {
        (component as any).markDirty();
      }
      if ((component as any).onPropertyChanged) {
        (component as any).onPropertyChanged(this.propertyPath, this.newValue);
      }
    });

    this.lastExecuteTime = Date.now();
  }

  /**
   * Undoes the property change
   */
  override undo(): void {
    this.entities.forEach(entity => {
      const component = this.world.getComponent(entity, this.componentType);
      const oldValue = this.oldValues.get(entity);

      if (!component || oldValue === undefined) return;

      this.path.setValue(component, PropertyPath.cloneValue(oldValue));

      // Notify component of change
      if ((component as any).markDirty) {
        (component as any).markDirty();
      }
      if ((component as any).onPropertyChanged) {
        (component as any).onPropertyChanged(this.propertyPath, oldValue);
      }
    });
  }

  /**
   * Checks if this command can be merged with another
   */
  override canMerge(other: BaseCommand): boolean {
    if (!(other instanceof SetPropertyCommand)) {
      return false;
    }

    // Check if same entities
    if (this.entities.length !== other.entities.length) {
      return false;
    }

    for (let i = 0; i < this.entities.length; i++) {
      if (this.entities[i] !== other.entities[i]) {
        return false;
      }
    }

    // Check if same component and property
    if (this.componentType !== other.componentType) {
      return false;
    }

    if (this.propertyPath !== other.propertyPath) {
      return false;
    }

    // Check time window
    const timeDiff = Date.now() - this.lastExecuteTime;
    if (timeDiff > this.mergeTimeMs) {
      return false;
    }

    return true;
  }

  /**
   * Merges another command into this one
   */
  override merge(other: BaseCommand): void {
    if (!(other instanceof SetPropertyCommand)) {
      throw new Error('Cannot merge with non-SetPropertyCommand');
    }

    // Update new value
    this.newValue = PropertyPath.cloneValue(other.newValue);

    // Keep old values from this command (original state)
  }

  /**
   * Validates the command
   */
  override validate(): boolean {
    // Check all entities have the component
    const valid = this.entities.every(entity =>
      this.world.hasComponent(entity, this.componentType)
    );

    if (!valid) {
      console.warn('Some entities do not have the required component');
      return false;
    }

    return true;
  }

  /**
   * Gets the memory size of this command
   */
  override getSize(): number {
    return 1 + this.entities.length;
  }

  /**
   * Serializes the command
   */
  public serialize(): any {
    return {
      type: 'SetPropertyCommand',
      entities: this.entities,
      componentType: this.componentType.name,
      propertyPath: this.propertyPath,
      newValue: this.serializeValue(this.newValue),
      oldValues: Array.from(this.oldValues.entries()).map(([entity, value]) => ({
        entityId: entity,
        value: this.serializeValue(value)
      }))
    };
  }

  /**
   * Serializes a value for storage
   */
  private serializeValue(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value !== 'object') {
      return value;
    }

    if (typeof value.toArray === 'function') {
      return { __type: 'array', data: value.toArray() };
    }

    if (typeof value.serialize === 'function') {
      return { __type: 'serialized', data: value.serialize() };
    }

    if (Array.isArray(value)) {
      return value.map(v => this.serializeValue(v));
    }

    if (value.constructor === Object) {
      const serialized: any = {};
      for (const key in value) {
        serialized[key] = this.serializeValue(value[key]);
      }
      return serialized;
    }

    return value;
  }
}

/**
 * Specialized command for setting boolean properties
 */
export class SetBooleanCommand extends SetPropertyCommand {
  constructor(
    world: World,
    entities: Entity | Entity[],
    componentType: new (...args: any[]) => IComponent,
    propertyPath: string,
    value: boolean
  ) {
    super(world, entities, componentType, propertyPath, value);
    this.description = `${value ? 'Enable' : 'Disable'} ${componentType.name}.${propertyPath}`;
  }
}

/**
 * Specialized command for setting number properties with range validation
 */
export class SetNumberCommand extends SetPropertyCommand {
  private min?: number;
  private max?: number;

  constructor(
    world: World,
    entities: Entity | Entity[],
    componentType: new (...args: any[]) => IComponent,
    propertyPath: string,
    value: number,
    min?: number,
    max?: number
  ) {
    super(world, entities, componentType, propertyPath, value);
    this.min = min;
    this.max = max;
  }

  override validate(): boolean {
    if (!super.validate()) {
      return false;
    }

    const value = (this as any).newValue as number;

    if (this.min !== undefined && value < this.min) {
      console.warn(`Value ${value} is below minimum ${this.min}`);
      return false;
    }

    if (this.max !== undefined && value > this.max) {
      console.warn(`Value ${value} is above maximum ${this.max}`);
      return false;
    }

    return true;
  }
}
