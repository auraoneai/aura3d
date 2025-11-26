/**
 * @fileoverview Component markers and sync rules for network replication.
 * Defines which components should be replicated and how.
 * @module net/replication/NetworkedComponent
 */

import { IComponent } from '../../ecs/Component';

/**
 * Synchronization frequency for component properties.
 */
export enum SyncFrequency {
  /** Never synchronize */
  NEVER = 'never',
  /** Synchronize only when changed */
  ON_CHANGE = 'on_change',
  /** Synchronize every tick */
  EVERY_TICK = 'every_tick',
  /** Synchronize at low frequency (1-5 Hz) */
  LOW_FREQUENCY = 'low_frequency',
  /** Synchronize at medium frequency (10-20 Hz) */
  MEDIUM_FREQUENCY = 'medium_frequency',
  /** Synchronize at high frequency (30-60 Hz) */
  HIGH_FREQUENCY = 'high_frequency',
}

/**
 * Synchronization direction.
 */
export enum SyncDirection {
  /** Server to clients only */
  SERVER_TO_CLIENT = 'server_to_client',
  /** Client to server only (for client-authoritative properties) */
  CLIENT_TO_SERVER = 'client_to_server',
  /** Bidirectional (for shared authority) */
  BIDIRECTIONAL = 'bidirectional',
}

/**
 * Property synchronization rule.
 */
export interface PropertySyncRule {
  /** Property name */
  propertyName: string;
  /** Synchronization frequency */
  frequency: SyncFrequency;
  /** Synchronization direction */
  direction: SyncDirection;
  /** Interpolate on client */
  interpolate: boolean;
  /** Extrapolate on client */
  extrapolate: boolean;
  /** Compression settings */
  compression?: {
    /** Minimum value (for range compression) */
    min?: number;
    /** Maximum value (for range compression) */
    max?: number;
    /** Precision (for float compression) */
    precision?: number;
  };
}

/**
 * Component synchronization metadata.
 */
export interface ComponentSyncMetadata {
  /** Component type name */
  componentType: string;
  /** Property sync rules */
  propertyRules: Map<string, PropertySyncRule>;
  /** Priority (higher priority components sync first) */
  priority: number;
  /** Enabled */
  enabled: boolean;
}

/**
 * Networked component interface.
 * Components that implement this can be automatically replicated.
 *
 * @example
 * ```typescript
 * class TransformComponent implements IComponent, INetworkedComponent {
 *   position = new Vector3(0, 0, 0);
 *   rotation = new Quaternion();
 *
 *   getSyncRules(): PropertySyncRule[] {
 *     return [
 *       {
 *         propertyName: 'position',
 *         frequency: SyncFrequency.HIGH_FREQUENCY,
 *         direction: SyncDirection.SERVER_TO_CLIENT,
 *         interpolate: true,
 *         extrapolate: false,
 *         compression: { min: -1000, max: 1000, precision: 0.01 },
 *       },
 *       {
 *         propertyName: 'rotation',
 *         frequency: SyncFrequency.MEDIUM_FREQUENCY,
 *         direction: SyncDirection.SERVER_TO_CLIENT,
 *         interpolate: true,
 *         extrapolate: false,
 *       },
 *     ];
 *   }
 *
 *   getState(): Map<string, any> {
 *     const state = new Map();
 *     state.set('position', this.position.toArray());
 *     state.set('rotation', this.rotation.toArray());
 *     return state;
 *   }
 *
 *   setState(state: Map<string, any>): void {
 *     if (state.has('position')) {
 *       this.position.fromArray(state.get('position'));
 *     }
 *     if (state.has('rotation')) {
 *       this.rotation.fromArray(state.get('rotation'));
 *     }
 *   }
 * }
 * ```
 */
export interface INetworkedComponent extends IComponent {
  /**
   * Gets synchronization rules for this component.
   * @returns Array of property sync rules
   */
  getSyncRules(): PropertySyncRule[];

  /**
   * Gets the current state for replication.
   * @returns State map
   */
  getState(): Map<string, any>;

  /**
   * Applies received state.
   * @param state - State map
   */
  setState(state: Map<string, any>): void;

  /**
   * Checks if component state has changed since last sync.
   * @returns True if changed
   */
  isDirty?(): boolean;

  /**
   * Marks component as clean (synced).
   */
  markClean?(): void;
}

/**
 * Decorator for marking components as networked.
 *
 * @param syncRules - Synchronization rules
 * @param priority - Sync priority (default: 0)
 *
 * @example
 * ```typescript
 * @Networked([
 *   {
 *     propertyName: 'health',
 *     frequency: SyncFrequency.ON_CHANGE,
 *     direction: SyncDirection.SERVER_TO_CLIENT,
 *     interpolate: false,
 *     extrapolate: false,
 *   }
 * ], 10)
 * class HealthComponent implements IComponent {
 *   health: number = 100;
 * }
 * ```
 */
export function Networked(syncRules: PropertySyncRule[], priority: number = 0) {
  return function <T extends { new (...args: any[]): IComponent }>(constructor: T) {
    const metadata: ComponentSyncMetadata = {
      componentType: constructor.name,
      propertyRules: new Map(syncRules.map((rule) => [rule.propertyName, rule])),
      priority,
      enabled: true,
    };

    // Store metadata on constructor
    (constructor as any).__networkMetadata = metadata;

    return constructor;
  };
}

/**
 * Registry for networked component metadata.
 * Manages sync rules and priorities for all networked components.
 *
 * @example
 * ```typescript
 * // Register a component type
 * NetworkedComponentRegistry.register('TransformComponent', {
 *   componentType: 'TransformComponent',
 *   propertyRules: new Map([
 *     ['position', {
 *       propertyName: 'position',
 *       frequency: SyncFrequency.HIGH_FREQUENCY,
 *       direction: SyncDirection.SERVER_TO_CLIENT,
 *       interpolate: true,
 *       extrapolate: false,
 *     }],
 *   ]),
 *   priority: 10,
 *   enabled: true,
 * });
 *
 * // Get metadata
 * const metadata = NetworkedComponentRegistry.get('TransformComponent');
 * ```
 */
export class NetworkedComponentRegistry {
  private static metadata = new Map<string, ComponentSyncMetadata>();

  /**
   * Registers component sync metadata.
   *
   * @param componentType - Component type name
   * @param metadata - Sync metadata
   */
  static register(componentType: string, metadata: ComponentSyncMetadata): void {
    this.metadata.set(componentType, metadata);
  }

  /**
   * Gets component sync metadata.
   *
   * @param componentType - Component type name
   * @returns Sync metadata or undefined
   */
  static get(componentType: string): ComponentSyncMetadata | undefined {
    return this.metadata.get(componentType);
  }

  /**
   * Checks if a component type is registered.
   *
   * @param componentType - Component type name
   * @returns True if registered
   */
  static has(componentType: string): boolean {
    return this.metadata.has(componentType);
  }

  /**
   * Gets all registered component types.
   * @returns Array of component type names
   */
  static getAllTypes(): string[] {
    return Array.from(this.metadata.keys());
  }

  /**
   * Gets all components sorted by priority.
   * @returns Array of component types sorted by priority (highest first)
   */
  static getByPriority(): string[] {
    return Array.from(this.metadata.entries())
      .sort(([, a], [, b]) => b.priority - a.priority)
      .map(([type]) => type);
  }

  /**
   * Enables or disables sync for a component type.
   *
   * @param componentType - Component type name
   * @param enabled - Enable/disable sync
   */
  static setEnabled(componentType: string, enabled: boolean): void {
    const metadata = this.metadata.get(componentType);
    if (metadata) {
      metadata.enabled = enabled;
    }
  }

  /**
   * Clears all registered metadata (for testing).
   * @internal
   */
  static clear(): void {
    this.metadata.clear();
  }
}

/**
 * Helper to create common sync rules.
 */
export class SyncRuleBuilder {
  /**
   * Creates a rule for a position property.
   *
   * @param propertyName - Property name
   * @param min - Minimum value
   * @param max - Maximum value
   * @param precision - Precision
   * @returns Sync rule
   */
  static position(
    propertyName: string = 'position',
    min: number = -1000,
    max: number = 1000,
    precision: number = 0.01
  ): PropertySyncRule {
    return {
      propertyName,
      frequency: SyncFrequency.HIGH_FREQUENCY,
      direction: SyncDirection.SERVER_TO_CLIENT,
      interpolate: true,
      extrapolate: false,
      compression: { min, max, precision },
    };
  }

  /**
   * Creates a rule for a rotation property.
   *
   * @param propertyName - Property name
   * @returns Sync rule
   */
  static rotation(propertyName: string = 'rotation'): PropertySyncRule {
    return {
      propertyName,
      frequency: SyncFrequency.MEDIUM_FREQUENCY,
      direction: SyncDirection.SERVER_TO_CLIENT,
      interpolate: true,
      extrapolate: false,
    };
  }

  /**
   * Creates a rule for a health/stat property.
   *
   * @param propertyName - Property name
   * @returns Sync rule
   */
  static stat(propertyName: string): PropertySyncRule {
    return {
      propertyName,
      frequency: SyncFrequency.ON_CHANGE,
      direction: SyncDirection.SERVER_TO_CLIENT,
      interpolate: false,
      extrapolate: false,
    };
  }

  /**
   * Creates a rule for a velocity property.
   *
   * @param propertyName - Property name
   * @returns Sync rule
   */
  static velocity(propertyName: string = 'velocity'): PropertySyncRule {
    return {
      propertyName,
      frequency: SyncFrequency.MEDIUM_FREQUENCY,
      direction: SyncDirection.SERVER_TO_CLIENT,
      interpolate: true,
      extrapolate: true,
      compression: { min: -100, max: 100, precision: 0.1 },
    };
  }

  /**
   * Creates a rule for client input.
   *
   * @param propertyName - Property name
   * @returns Sync rule
   */
  static clientInput(propertyName: string): PropertySyncRule {
    return {
      propertyName,
      frequency: SyncFrequency.EVERY_TICK,
      direction: SyncDirection.CLIENT_TO_SERVER,
      interpolate: false,
      extrapolate: false,
    };
  }

  /**
   * Creates a rule for an animation state.
   *
   * @param propertyName - Property name
   * @returns Sync rule
   */
  static animationState(propertyName: string): PropertySyncRule {
    return {
      propertyName,
      frequency: SyncFrequency.ON_CHANGE,
      direction: SyncDirection.SERVER_TO_CLIENT,
      interpolate: false,
      extrapolate: false,
    };
  }
}
