/**
 * Hierarchical fracture system with progressive fracture activation.
 * Supports multi-level fracture with damage accumulation.
 * @module HierarchicalFractureSystem
 */

import { Vector3 } from '../../math/Vector3';
import { Mesh } from '../../rendering/geometry/Mesh';
import {
  VoronoiFractureSystem,
  FractureFragment,
  PrecomputedFracture,
  FractureConfig,
} from './VoronoiFractureSystem';

/**
 * Node in the fracture hierarchy tree.
 */
export interface FragmentNode {
  /** Fragment data (null for non-leaf nodes) */
  fragment: FractureFragment | null;
  /** Child fragments (empty for leaf nodes) */
  children: FragmentNode[];
  /** Parent node */
  parent: FragmentNode | null;
  /** Accumulated damage (0-1) */
  damage: number;
  /** Damage threshold for fracture */
  damageThreshold: number;
  /** Is this fragment currently active? */
  active: boolean;
  /** Depth in the hierarchy (0 = root) */
  depth: number;
  /** Unique ID */
  id: number;
}

/**
 * Hierarchical fracture tree.
 */
export interface FractureTree {
  /** Root node */
  root: FragmentNode;
  /** Maximum depth */
  maxDepth: number;
  /** Total node count */
  nodeCount: number;
  /** Active fragments (leaves) */
  activeFragments: FractureFragment[];
}

/**
 * Damage event for fracture activation.
 */
export interface DamageEvent {
  /** Impact point in world space */
  impactPoint: Vector3;
  /** Damage amount (0-1) */
  damage: number;
  /** Impact radius */
  radius: number;
  /** Impulse strength */
  impulseStrength: number;
}

/**
 * Configuration for hierarchical fracture.
 */
export interface HierarchicalConfig {
  /** Maximum fracture depth */
  maxDepth?: number;
  /** Fragments per level */
  fragmentsPerLevel?: number[];
  /** Damage threshold per level */
  damageThresholds?: number[];
  /** Material density */
  density?: number;
  /** Enable progressive fracture */
  enableProgressive?: boolean;
}

/**
 * Hierarchical fracture system with progressive destruction.
 * Allows objects to fracture incrementally based on accumulated damage.
 *
 * @example
 * ```typescript
 * const hierarchical = new HierarchicalFractureSystem();
 *
 * // Build fracture hierarchy
 * const tree = hierarchical.buildHierarchy(mesh, {
 *   maxDepth: 3,
 *   fragmentsPerLevel: [10, 20, 40],
 *   damageThresholds: [0.5, 0.3, 0.2]
 * });
 *
 * // Apply damage over time
 * const damageEvent = {
 *   impactPoint: new Vector3(0, 0, 0),
 *   damage: 0.3,
 *   radius: 1.0,
 *   impulseStrength: 50
 * };
 *
 * const newFragments = hierarchical.applyDamage(tree, damageEvent);
 * ```
 */
export class HierarchicalFractureSystem {
  private fractureSystem: VoronoiFractureSystem;
  private nextNodeId: number;

  constructor() {
    this.fractureSystem = new VoronoiFractureSystem();
    this.nextNodeId = 0;
  }

  /**
   * Builds a hierarchical fracture tree.
   *
   * @param mesh - Mesh to fracture
   * @param config - Hierarchical configuration
   * @returns Fracture tree
   */
  buildHierarchy(mesh: Mesh, config: HierarchicalConfig = {}): FractureTree {
    const cfg: Required<HierarchicalConfig> = {
      maxDepth: config.maxDepth ?? 2,
      fragmentsPerLevel: config.fragmentsPerLevel ?? [10, 20],
      damageThresholds: config.damageThresholds ?? [0.5, 0.3],
      density: config.density ?? 2500,
      enableProgressive: config.enableProgressive ?? true,
    };

    while (cfg.fragmentsPerLevel.length < cfg.maxDepth) {
      cfg.fragmentsPerLevel.push(cfg.fragmentsPerLevel[cfg.fragmentsPerLevel.length - 1] * 2);
    }

    while (cfg.damageThresholds.length < cfg.maxDepth) {
      cfg.damageThresholds.push(cfg.damageThresholds[cfg.damageThresholds.length - 1] * 0.8);
    }

    const rootFragment: FractureFragment = {
      mesh: mesh.clone(),
      centerOfMass: mesh.boundingBox.center,
      mass: this.estimateMass(mesh, cfg.density),
      inertia: Vector3.one(),
      velocity: Vector3.zero(),
      angularVelocity: Vector3.zero(),
      id: this.nextNodeId++,
    };

    const root: FragmentNode = {
      fragment: rootFragment,
      children: [],
      parent: null,
      damage: 0,
      damageThreshold: cfg.damageThresholds[0],
      active: true,
      depth: 0,
      id: rootFragment.id,
    };

    this.buildNode(root, cfg, 0);

    return {
      root,
      maxDepth: cfg.maxDepth,
      nodeCount: this.countNodes(root),
      activeFragments: [rootFragment],
    };
  }

  /**
   * Recursively builds fracture hierarchy.
   */
  private buildNode(
    node: FragmentNode,
    config: Required<HierarchicalConfig>,
    depth: number
  ): void {
    if (depth >= config.maxDepth || !node.fragment) {
      return;
    }

    const numFragments = config.fragmentsPerLevel[depth];
    const center = node.fragment.mesh.boundingBox.center;

    const fractureConfig: FractureConfig = {
      numFragments,
      density: config.density,
      impulseStrength: 0,
      generateInteriorFaces: true,
    };

    const fragments = this.fractureSystem.fracture(
      node.fragment.mesh,
      center,
      fractureConfig
    );

    for (const fragment of fragments) {
      const childNode: FragmentNode = {
        fragment,
        children: [],
        parent: node,
        damage: 0,
        damageThreshold: depth + 1 < config.damageThresholds.length
          ? config.damageThresholds[depth + 1]
          : 0.1,
        active: false,
        depth: depth + 1,
        id: this.nextNodeId++,
      };

      node.children.push(childNode);

      this.buildNode(childNode, config, depth + 1);
    }
  }

  /**
   * Applies damage to the fracture tree.
   *
   * @param tree - Fracture tree
   * @param event - Damage event
   * @returns Newly activated fragments
   */
  applyDamage(tree: FractureTree, event: DamageEvent): FractureFragment[] {
    const newFragments: FractureFragment[] = [];
    const nodesToCheck: FragmentNode[] = [tree.root];

    while (nodesToCheck.length > 0) {
      const node = nodesToCheck.pop()!;

      if (!node.active) continue;

      const distance = node.fragment
        ? node.fragment.centerOfMass.sub(event.impactPoint).length()
        : Infinity;

      if (distance < event.radius) {
        const falloff = 1.0 - (distance / event.radius);
        const damageAmount = event.damage * falloff;

        node.damage += damageAmount;

        if (node.damage >= node.damageThreshold && node.children.length > 0) {
          this.activateChildren(node, event.impactPoint, event.impulseStrength, newFragments);
        }
      }

      for (const child of node.children) {
        if (child.active) {
          nodesToCheck.push(child);
        }
      }
    }

    tree.activeFragments = this.collectActiveFragments(tree.root);

    return newFragments;
  }

  /**
   * Activates child fragments of a node.
   */
  private activateChildren(
    node: FragmentNode,
    impactPoint: Vector3,
    impulseStrength: number,
    newFragments: FractureFragment[]
  ): void {
    node.active = false;

    for (const child of node.children) {
      child.active = true;

      if (child.fragment) {
        const toFragment = child.fragment.centerOfMass.sub(impactPoint);
        const distance = toFragment.length();
        const direction = distance > 0.001 ? toFragment.normalize() : Vector3.up();
        const falloff = 1.0 / (1.0 + distance * distance);

        child.fragment.velocity = direction.scale(
          impulseStrength * falloff / child.fragment.mass
        );

        const torqueAxis = direction.cross(Vector3.up()).normalize();
        if (torqueAxis.lengthSquared() > 0.001) {
          child.fragment.angularVelocity = torqueAxis.scale(
            impulseStrength * falloff * 0.1
          );
        }

        newFragments.push(child.fragment);
      }
    }
  }

  /**
   * Collects all active fragments from the tree.
   */
  private collectActiveFragments(node: FragmentNode): FractureFragment[] {
    const fragments: FractureFragment[] = [];

    if (node.active && node.fragment) {
      fragments.push(node.fragment);
    }

    for (const child of node.children) {
      fragments.push(...this.collectActiveFragments(child));
    }

    return fragments;
  }

  /**
   * Fractures a specific fragment in the tree.
   *
   * @param tree - Fracture tree
   * @param fragmentId - ID of fragment to fracture
   * @param impactPoint - Impact point
   * @param impulseStrength - Impulse strength
   * @returns Newly created fragments
   */
  fractureFragment(
    tree: FractureTree,
    fragmentId: number,
    impactPoint: Vector3,
    impulseStrength: number
  ): FractureFragment[] {
    const node = this.findNodeById(tree.root, fragmentId);

    if (!node || !node.active || node.children.length === 0) {
      return [];
    }

    const newFragments: FractureFragment[] = [];
    this.activateChildren(node, impactPoint, impulseStrength, newFragments);

    tree.activeFragments = this.collectActiveFragments(tree.root);

    return newFragments;
  }

  /**
   * Finds a node by ID.
   */
  private findNodeById(node: FragmentNode, id: number): FragmentNode | null {
    if (node.id === id) {
      return node;
    }

    for (const child of node.children) {
      const found = this.findNodeById(child, id);
      if (found) return found;
    }

    return null;
  }

  /**
   * Resets damage for all nodes in the tree.
   *
   * @param tree - Fracture tree
   */
  resetDamage(tree: FractureTree): void {
    this.resetNodeDamage(tree.root);
  }

  /**
   * Recursively resets damage for a node and its children.
   */
  private resetNodeDamage(node: FragmentNode): void {
    node.damage = 0;

    for (const child of node.children) {
      this.resetNodeDamage(child);
    }
  }

  /**
   * Resets the tree to initial state (only root active).
   *
   * @param tree - Fracture tree
   */
  resetTree(tree: FractureTree): void {
    this.resetNode(tree.root, true);
    tree.activeFragments = tree.root.fragment ? [tree.root.fragment] : [];
  }

  /**
   * Recursively resets a node and its children.
   */
  private resetNode(node: FragmentNode, isRoot: boolean): void {
    node.active = isRoot;
    node.damage = 0;

    if (node.fragment) {
      node.fragment.velocity = Vector3.zero();
      node.fragment.angularVelocity = Vector3.zero();
    }

    for (const child of node.children) {
      this.resetNode(child, false);
    }
  }

  /**
   * Gets fracture statistics.
   *
   * @param tree - Fracture tree
   * @returns Statistics object
   */
  getStatistics(tree: FractureTree): {
    totalNodes: number;
    activeFragments: number;
    maxDepth: number;
    averageDamage: number;
  } {
    const stats = {
      totalNodes: 0,
      activeNodes: 0,
      totalDamage: 0,
    };

    this.gatherStats(tree.root, stats);

    return {
      totalNodes: stats.totalNodes,
      activeFragments: tree.activeFragments.length,
      maxDepth: tree.maxDepth,
      averageDamage: stats.totalNodes > 0 ? stats.totalDamage / stats.totalNodes : 0,
    };
  }

  /**
   * Recursively gathers statistics.
   */
  private gatherStats(
    node: FragmentNode,
    stats: { totalNodes: number; activeNodes: number; totalDamage: number }
  ): void {
    stats.totalNodes++;
    stats.totalDamage += node.damage;

    if (node.active) {
      stats.activeNodes++;
    }

    for (const child of node.children) {
      this.gatherStats(child, stats);
    }
  }

  /**
   * Counts total nodes in a tree.
   */
  private countNodes(node: FragmentNode): number {
    let count = 1;

    for (const child of node.children) {
      count += this.countNodes(child);
    }

    return count;
  }

  /**
   * Estimates mass from mesh volume and density.
   */
  private estimateMass(mesh: Mesh, density: number): number {
    const bounds = mesh.boundingBox;
    const size = bounds.max.sub(bounds.min);
    const volume = size.x * size.y * size.z;
    return volume * density;
  }

  /**
   * Exports tree structure for serialization.
   *
   * @param tree - Fracture tree
   * @returns Serializable tree data
   */
  exportTree(tree: FractureTree): any {
    return {
      maxDepth: tree.maxDepth,
      nodeCount: tree.nodeCount,
      root: this.exportNode(tree.root),
    };
  }

  /**
   * Exports a single node.
   */
  private exportNode(node: FragmentNode): any {
    return {
      id: node.id,
      damage: node.damage,
      damageThreshold: node.damageThreshold,
      active: node.active,
      depth: node.depth,
      hasFragment: node.fragment !== null,
      children: node.children.map(child => this.exportNode(child)),
    };
  }

  /**
   * Visualizes damage distribution (returns damage values per fragment).
   *
   * @param tree - Fracture tree
   * @returns Map of fragment ID to damage value
   */
  visualizeDamage(tree: FractureTree): Map<number, number> {
    const damageMap = new Map<number, number>();
    this.collectDamage(tree.root, damageMap);
    return damageMap;
  }

  /**
   * Recursively collects damage values.
   */
  private collectDamage(node: FragmentNode, damageMap: Map<number, number>): void {
    if (node.fragment) {
      damageMap.set(node.id, node.damage);
    }

    for (const child of node.children) {
      this.collectDamage(child, damageMap);
    }
  }
}
