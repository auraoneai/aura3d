/**
 * @fileoverview JSON serialization/deserialization for behavior trees.
 * Enables saving/loading trees from JSON with full fidelity.
 * @module ai/behavior/BTSerializer
 */

import { Logger } from '../../core/Logger';
import { BTNode, NodeStatus } from './BTNode';
import { BehaviorTree, TickMode } from './BehaviorTree';
import { Blackboard, BlackboardValue } from './Blackboard';
import { BTSequence, BTSelector, BTParallel, BTRandomSelector, BTPrioritySelector, ParallelPolicy } from './BTComposite';
import {
  BTInverter,
  BTRepeater,
  BTRepeatUntilFail,
  BTCooldown,
  BTTimeLimit,
  BTForceSuccess,
  BTForceFailure,
  BTWait,
  BTUntilSuccess,
} from './BTDecorator';
import { BTAction, BTIdle, BTWaitAction, BTLog, BTSetBlackboard, BTClearBlackboard } from './BTAction';
import {
  BTCondition,
  BTHasKey,
  BTCompare,
  BTIsTrue,
  BTIsFalse,
  BTRandom,
  BTInRange,
  BTAlways,
  BTNever,
  ComparisonOperator,
} from './BTCondition';

const logger = Logger.create('BTSerializer');

/**
 * Serialized node representation.
 */
export interface SerializedNode {
  /** Node type (class name) */
  type: string;
  /** Node name */
  name: string;
  /** Node parameters */
  params?: Record<string, unknown>;
  /** Child node (for decorators) */
  child?: SerializedNode;
  /** Child nodes (for composites) */
  children?: SerializedNode[];
  /** Metadata */
  metadata?: Record<string, unknown>;
  /** Whether node is enabled */
  enabled?: boolean;
}

/**
 * Serialized tree representation.
 */
export interface SerializedTree {
  /** Tree name */
  name: string;
  /** Tick mode */
  tickMode: TickMode;
  /** Tick interval (for fixed-rate mode) */
  tickInterval?: number;
  /** Root node */
  root: SerializedNode;
  /** Blackboard snapshot */
  blackboard?: Record<string, BlackboardValue>;
  /** Metadata */
  metadata?: Record<string, unknown>;
  /** Whether tree is enabled */
  enabled?: boolean;
}

/**
 * Serializer for behavior trees.
 * Converts trees to/from JSON for persistence and hot-reloading.
 *
 * @example
 * ```typescript
 * // Serialize tree to JSON
 * const serializer = new BTSerializer();
 * const json = serializer.serialize(tree);
 * const jsonString = JSON.stringify(json, null, 2);
 *
 * // Save to file
 * fs.writeFileSync('tree.json', jsonString);
 *
 * // Load from file
 * const loadedJson = JSON.parse(fs.readFileSync('tree.json', 'utf-8'));
 * const loadedTree = serializer.deserialize(loadedJson);
 * ```
 */
export class BTSerializer {
  /** Custom node type registry for extension */
  private nodeRegistry: Map<string, new (...args: unknown[]) => BTNode>;

  /** Custom action function registry */
  private actionRegistry: Map<string, (...args: unknown[]) => NodeStatus>;

  /** Custom condition function registry */
  private conditionRegistry: Map<string, (...args: unknown[]) => boolean>;

  /**
   * Creates a new behavior tree serializer.
   */
  constructor() {
    this.nodeRegistry = new Map();
    this.actionRegistry = new Map();
    this.conditionRegistry = new Map();
    this.registerBuiltInNodes();
  }

  /**
   * Registers built-in node types.
   * @private
   */
  private registerBuiltInNodes(): void {
    // Composites
    this.registerNodeType('BTSequence', BTSequence);
    this.registerNodeType('BTSelector', BTSelector);
    this.registerNodeType('BTParallel', BTParallel);
    this.registerNodeType('BTRandomSelector', BTRandomSelector);
    this.registerNodeType('BTPrioritySelector', BTPrioritySelector);

    // Decorators
    this.registerNodeType('BTInverter', BTInverter);
    this.registerNodeType('BTRepeater', BTRepeater);
    this.registerNodeType('BTRepeatUntilFail', BTRepeatUntilFail);
    this.registerNodeType('BTCooldown', BTCooldown);
    this.registerNodeType('BTTimeLimit', BTTimeLimit);
    this.registerNodeType('BTForceSuccess', BTForceSuccess);
    this.registerNodeType('BTForceFailure', BTForceFailure);
    this.registerNodeType('BTWait', BTWait);
    this.registerNodeType('BTUntilSuccess', BTUntilSuccess);

    // Actions
    this.registerNodeType('BTIdle', BTIdle);
    this.registerNodeType('BTWaitAction', BTWaitAction);
    this.registerNodeType('BTLog', BTLog);
    this.registerNodeType('BTSetBlackboard', BTSetBlackboard);
    this.registerNodeType('BTClearBlackboard', BTClearBlackboard);

    // Conditions
    this.registerNodeType('BTHasKey', BTHasKey);
    this.registerNodeType('BTCompare', BTCompare);
    this.registerNodeType('BTIsTrue', BTIsTrue);
    this.registerNodeType('BTIsFalse', BTIsFalse);
    this.registerNodeType('BTRandom', BTRandom);
    this.registerNodeType('BTInRange', BTInRange);
    this.registerNodeType('BTAlways', BTAlways);
    this.registerNodeType('BTNever', BTNever);
  }

  /**
   * Registers a custom node type.
   *
   * @param typeName - Type name (used in serialization)
   * @param nodeClass - Node class constructor
   */
  registerNodeType(typeName: string, nodeClass: new (...args: unknown[]) => BTNode): void {
    this.nodeRegistry.set(typeName, nodeClass);
  }

  /**
   * Registers a custom action function.
   *
   * @param name - Action name
   * @param action - Action function
   */
  registerAction(name: string, action: (...args: unknown[]) => NodeStatus): void {
    this.actionRegistry.set(name, action);
  }

  /**
   * Registers a custom condition function.
   *
   * @param name - Condition name
   * @param condition - Condition function
   */
  registerCondition(name: string, condition: (...args: unknown[]) => boolean): void {
    this.conditionRegistry.set(name, condition);
  }

  /**
   * Serializes a behavior tree to JSON.
   *
   * @param tree - Tree to serialize
   * @returns Serialized tree
   */
  serialize(tree: BehaviorTree): SerializedTree {
    const serialized: SerializedTree = {
      name: tree.name,
      tickMode: tree.tickMode,
      tickInterval: tree.tickInterval,
      root: this.serializeNode(tree.root),
      blackboard: tree.blackboard.snapshot(true),
      enabled: tree.enabled,
    };

    // Serialize metadata
    if (tree.metadata.size > 0) {
      serialized.metadata = Object.fromEntries(tree.metadata);
    }

    return serialized;
  }

  /**
   * Serializes a node.
   * @private
   */
  private serializeNode(node: BTNode): SerializedNode {
    const serialized: SerializedNode = {
      type: node.constructor.name,
      name: node.name,
      enabled: node.enabled,
    };

    // Serialize metadata
    if (node.metadata.size > 0) {
      serialized.metadata = Object.fromEntries(node.metadata);
    }

    // Serialize based on node type
    if (node instanceof BTSequence || node instanceof BTSelector || node instanceof BTRandomSelector) {
      serialized.children = node.children.map((child) => this.serializeNode(child));
    } else if (node instanceof BTParallel) {
      serialized.children = node.children.map((child) => this.serializeNode(child));
      serialized.params = {
        policy: (node as any).policy,
      };
    } else if (node instanceof BTPrioritySelector) {
      // Note: Priority functions cannot be serialized, only static priorities
      serialized.children = node.children.map((child) => this.serializeNode(child));
      serialized.params = {
        dynamicPriorities: (node as any).dynamicPriorities,
      };
    } else if (
      node instanceof BTInverter ||
      node instanceof BTForceSuccess ||
      node instanceof BTForceFailure ||
      node instanceof BTRepeatUntilFail ||
      node instanceof BTUntilSuccess
    ) {
      serialized.child = this.serializeNode(node.child);
    } else if (node instanceof BTRepeater) {
      serialized.child = this.serializeNode(node.child);
      serialized.params = {
        maxRepeats: (node as any).maxRepeats,
      };
    } else if (node instanceof BTCooldown) {
      serialized.child = this.serializeNode(node.child);
      serialized.params = {
        cooldownDuration: (node as any).cooldownDuration,
      };
    } else if (node instanceof BTTimeLimit) {
      serialized.child = this.serializeNode(node.child);
      serialized.params = {
        timeLimit: (node as any).timeLimit,
      };
    } else if (node instanceof BTWait) {
      serialized.child = this.serializeNode(node.child);
      serialized.params = {
        duration: (node as any).duration,
      };
    } else if (node instanceof BTWaitAction) {
      serialized.params = {
        duration: (node as any).duration,
      };
    } else if (node instanceof BTLog) {
      serialized.params = {
        message: (node as any).message,
        includeBlackboard: (node as any).includeBlackboard,
      };
    } else if (node instanceof BTSetBlackboard) {
      serialized.params = {
        key: (node as any).key,
        value: (node as any).value,
      };
    } else if (node instanceof BTClearBlackboard) {
      serialized.params = {
        key: (node as any).key,
      };
    } else if (node instanceof BTHasKey) {
      serialized.params = {
        key: (node as any).key,
      };
    } else if (node instanceof BTCompare) {
      serialized.params = {
        key: (node as any).key,
        operator: (node as any).operator,
        reference: (node as any).reference,
      };
    } else if (node instanceof BTIsTrue) {
      serialized.params = {
        key: (node as any).key,
      };
    } else if (node instanceof BTIsFalse) {
      serialized.params = {
        key: (node as any).key,
      };
    } else if (node instanceof BTRandom) {
      serialized.params = {
        probability: (node as any).probability,
      };
    } else if (node instanceof BTInRange) {
      serialized.params = {
        key: (node as any).key,
        min: (node as any).min,
        max: (node as any).max,
      };
    }

    return serialized;
  }

  /**
   * Deserializes a behavior tree from JSON.
   *
   * @param data - Serialized tree data
   * @param blackboard - Optional blackboard to use (creates new if not provided)
   * @returns Deserialized tree
   */
  deserialize(data: SerializedTree, blackboard?: Blackboard): BehaviorTree {
    // Create or restore blackboard
    const bb = blackboard || new Blackboard('tree');
    if (data.blackboard) {
      bb.restore(data.blackboard);
    }

    // Deserialize root node
    const root = this.deserializeNode(data.root);

    // Create tree
    const tree = new BehaviorTree(root, bb, data.name);
    tree.tickMode = data.tickMode;
    if (data.tickInterval !== undefined) {
      tree.tickInterval = data.tickInterval;
    }
    if (data.enabled !== undefined) {
      tree.enabled = data.enabled;
    }

    // Restore metadata
    if (data.metadata) {
      for (const [key, value] of Object.entries(data.metadata)) {
        tree.setMetadata(key, value);
      }
    }

    logger.debug(`Deserialized tree "${tree.name}"`);

    return tree;
  }

  /**
   * Deserializes a node.
   * @private
   */
  private deserializeNode(data: SerializedNode): BTNode {
    let node: BTNode;

    const params = data.params || {};

    // Create node based on type
    switch (data.type) {
      // Composites
      case 'BTSequence':
        node = new BTSequence(
          data.name,
          data.children?.map((child) => this.deserializeNode(child)) || []
        );
        break;

      case 'BTSelector':
        node = new BTSelector(
          data.name,
          data.children?.map((child) => this.deserializeNode(child)) || []
        );
        break;

      case 'BTParallel':
        node = new BTParallel(
          data.name,
          data.children?.map((child) => this.deserializeNode(child)) || [],
          params.policy as ParallelPolicy
        );
        break;

      case 'BTRandomSelector':
        node = new BTRandomSelector(
          data.name,
          data.children?.map((child) => this.deserializeNode(child)) || []
        );
        break;

      case 'BTPrioritySelector':
        node = new BTPrioritySelector(data.name, params.dynamicPriorities as boolean);
        for (const childData of data.children || []) {
          const child = this.deserializeNode(childData);
          (node as BTPrioritySelector).addChildWithPriority(child, 0); // Default priority
        }
        break;

      // Decorators
      case 'BTInverter':
        node = new BTInverter(data.name, this.deserializeNode(data.child!));
        break;

      case 'BTRepeater':
        node = new BTRepeater(data.name, this.deserializeNode(data.child!), params.maxRepeats as number);
        break;

      case 'BTRepeatUntilFail':
        node = new BTRepeatUntilFail(data.name, this.deserializeNode(data.child!));
        break;

      case 'BTCooldown':
        node = new BTCooldown(data.name, this.deserializeNode(data.child!), params.cooldownDuration as number);
        break;

      case 'BTTimeLimit':
        node = new BTTimeLimit(data.name, this.deserializeNode(data.child!), params.timeLimit as number);
        break;

      case 'BTForceSuccess':
        node = new BTForceSuccess(data.name, this.deserializeNode(data.child!));
        break;

      case 'BTForceFailure':
        node = new BTForceFailure(data.name, this.deserializeNode(data.child!));
        break;

      case 'BTWait':
        node = new BTWait(data.name, this.deserializeNode(data.child!), params.duration as number);
        break;

      case 'BTUntilSuccess':
        node = new BTUntilSuccess(data.name, this.deserializeNode(data.child!));
        break;

      // Actions
      case 'BTAction':
        // Custom actions must be registered
        const actionName = params.actionName as string;
        const action = this.actionRegistry.get(actionName);
        if (!action) {
          throw new Error(`Action "${actionName}" not registered`);
        }
        node = new BTAction(data.name, action as any);
        break;

      case 'BTIdle':
        node = new BTIdle(data.name);
        break;

      case 'BTWaitAction':
        node = new BTWaitAction(data.name, params.duration as number);
        break;

      case 'BTLog':
        node = new BTLog(data.name, params.message as string, params.includeBlackboard as boolean);
        break;

      case 'BTSetBlackboard':
        node = new BTSetBlackboard(data.name, params.key as string, params.value);
        break;

      case 'BTClearBlackboard':
        node = new BTClearBlackboard(data.name, params.key as string);
        break;

      // Conditions
      case 'BTCondition':
        // Custom conditions must be registered
        const conditionName = params.conditionName as string;
        const condition = this.conditionRegistry.get(conditionName);
        if (!condition) {
          throw new Error(`Condition "${conditionName}" not registered`);
        }
        node = new BTCondition(data.name, condition as any);
        break;

      case 'BTHasKey':
        node = new BTHasKey(data.name, params.key as string);
        break;

      case 'BTCompare':
        node = new BTCompare(
          data.name,
          params.key as string,
          params.operator as ComparisonOperator,
          params.reference as BlackboardValue
        );
        break;

      case 'BTIsTrue':
        node = new BTIsTrue(data.name, params.key as string);
        break;

      case 'BTIsFalse':
        node = new BTIsFalse(data.name, params.key as string);
        break;

      case 'BTRandom':
        node = new BTRandom(data.name, params.probability as number);
        break;

      case 'BTInRange':
        node = new BTInRange(data.name, params.key as string, params.min as number, params.max as number);
        break;

      case 'BTAlways':
        node = new BTAlways(data.name);
        break;

      case 'BTNever':
        node = new BTNever(data.name);
        break;

      default:
        // Try custom registered node type
        const NodeClass = this.nodeRegistry.get(data.type);
        if (NodeClass) {
          node = new NodeClass(data.name, params);
        } else {
          throw new Error(`Unknown node type: ${data.type}`);
        }
    }

    // Restore enabled state
    if (data.enabled !== undefined) {
      node.enabled = data.enabled;
    }

    // Restore metadata
    if (data.metadata) {
      for (const [key, value] of Object.entries(data.metadata)) {
        node.setMetadata(key, value);
      }
    }

    return node;
  }

  /**
   * Serializes a tree to JSON string.
   *
   * @param tree - Tree to serialize
   * @param pretty - Whether to pretty-print JSON
   * @returns JSON string
   */
  toJSON(tree: BehaviorTree, pretty: boolean = true): string {
    const data = this.serialize(tree);
    return JSON.stringify(data, null, pretty ? 2 : 0);
  }

  /**
   * Deserializes a tree from JSON string.
   *
   * @param json - JSON string
   * @param blackboard - Optional blackboard to use
   * @returns Deserialized tree
   */
  fromJSON(json: string, blackboard?: Blackboard): BehaviorTree {
    const data = JSON.parse(json) as SerializedTree;
    return this.deserialize(data, blackboard);
  }
}
