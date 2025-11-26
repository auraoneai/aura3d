/**
 * @fileoverview NameComponent provides human-readable names for entities.
 * Used for debugging, editor displays, and entity lookup by name.
 * @module ecs/components/NameComponent
 */

import { IComponent, ComponentSchema } from '../Component';

/**
 * Component that stores a human-readable name for an entity.
 * Useful for debugging, editor displays, and entity identification.
 *
 * @implements {IComponent}
 *
 * @example
 * ```typescript
 * // Create a named entity
 * const entity = world.createEntity();
 * const nameComp = new NameComponent('Player');
 * world.addComponent(entity, NameComponent, nameComp);
 *
 * // Access the name
 * const comp = world.getComponent(entity, NameComponent);
 * console.log(comp.toString()); // "Player"
 * ```
 *
 * @example
 * ```typescript
 * // Use default empty name
 * const nameComp = new NameComponent();
 * console.log(nameComp.name); // ""
 *
 * // Set name later
 * nameComp.name = 'Enemy';
 * ```
 *
 * @example
 * ```typescript
 * // Serialization
 * const comp = new NameComponent('Boss');
 * const data = comp.serialize();
 * // data = { name: 'Boss' }
 *
 * const newComp = new NameComponent();
 * newComp.deserialize(data);
 * console.log(newComp.name); // "Boss"
 * ```
 */
class NameComponent implements IComponent {
  /**
   * The human-readable name of the entity.
   * @type {string}
   */
  name: string;

  /**
   * Schema definition for automatic serialization.
   * Defines the component as having a single string field.
   * @type {ComponentSchema}
   * @static
   * @readonly
   */
  static readonly schema: ComponentSchema = {
    name: 'string'
  };

  /**
   * Component name for registration and identification.
   * @type {string}
   * @static
   * @readonly
   */
  static readonly _componentName: string = 'NameComponent';

  /**
   * Creates a new NameComponent instance.
   *
   * @param {string} [name=''] - The initial name for the entity. Defaults to empty string.
   *
   * @example
   * ```typescript
   * // Create with a name
   * const comp1 = new NameComponent('Player');
   * console.log(comp1.name); // "Player"
   *
   * // Create with default empty name
   * const comp2 = new NameComponent();
   * console.log(comp2.name); // ""
   * ```
   */
  constructor(name: string = '') {
    this.name = name;
  }

  /**
   * Resets the component to its default state.
   * Clears the name to an empty string for object pooling reuse.
   *
   * @returns {void}
   *
   * @example
   * ```typescript
   * const comp = new NameComponent('Temporary');
   * comp.reset();
   * console.log(comp.name); // ""
   * ```
   */
  reset(): void {
    this.name = '';
  }

  /**
   * Serializes the component to a plain object.
   * Returns a representation suitable for JSON serialization or storage.
   *
   * @returns {object} Plain object containing the component's name
   *
   * @example
   * ```typescript
   * const comp = new NameComponent('Hero');
   * const data = comp.serialize();
   * console.log(data); // { name: 'Hero' }
   * console.log(JSON.stringify(data)); // '{"name":"Hero"}'
   * ```
   */
  serialize(): object {
    return {
      name: this.name
    };
  }

  /**
   * Deserializes component data from a plain object.
   * Restores the component state from serialized data.
   *
   * @param {object} data - Plain object containing the name field
   *
   * @example
   * ```typescript
   * const comp = new NameComponent();
   * comp.deserialize({ name: 'Villain' });
   * console.log(comp.name); // "Villain"
   * ```
   *
   * @example
   * ```typescript
   * // Load from JSON
   * const json = '{"name":"NPC"}';
   * const data = JSON.parse(json);
   * const comp = new NameComponent();
   * comp.deserialize(data);
   * console.log(comp.name); // "NPC"
   * ```
   */
  deserialize(data: object): void {
    const d = data as { name: string };
    this.name = d.name;
  }

  /**
   * Returns the string representation of this component.
   * Provides a convenient way to get the entity's name.
   *
   * @returns {string} The entity's name
   *
   * @example
   * ```typescript
   * const comp = new NameComponent('Dragon');
   * console.log(comp.toString()); // "Dragon"
   * console.log(`Entity: ${comp}`); // "Entity: Dragon" (implicit toString)
   * ```
   *
   * @example
   * ```typescript
   * const comp = new NameComponent();
   * console.log(comp.toString()); // ""
   * ```
   */
  toString(): string {
    return this.name;
  }
}

export { NameComponent };
