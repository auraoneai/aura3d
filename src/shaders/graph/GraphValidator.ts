/**
 * @fileoverview Shader graph validation
 * @module shaders/graph/GraphValidator
 */

import { ShaderGraph } from './ShaderGraph';
import { ShaderNode } from './ShaderNode';
import { ShaderEdge } from './ShaderEdge';

/**
 * Validation error severity
 */
export enum ValidationSeverity {
  Error = 'error',
  Warning = 'warning',
  Info = 'info',
}

/**
 * Validation error
 */
export interface ValidationError {
  /** Error severity */
  severity: ValidationSeverity;
  /** Error message */
  message: string;
  /** Node ID if applicable */
  nodeId?: string;
  /** Edge ID if applicable */
  edgeId?: string;
  /** Input/output name if applicable */
  portName?: string;
}

/**
 * Graph validation result
 */
export interface ValidationResult {
  /** Whether the graph is valid */
  valid: boolean;
  /** List of validation errors */
  errors: ValidationError[];
  /** List of validation warnings */
  warnings: ValidationError[];
  /** Information messages */
  info: ValidationError[];
}

/**
 * Validates shader graph correctness
 */
export class GraphValidator {
  /**
   * Validates a shader graph
   * @param graph - Shader graph to validate
   * @returns Validation result
   */
  public static validate(graph: ShaderGraph): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const info: ValidationError[] = [];

    // Check for output node
    const outputNode = graph.getOutputNode();
    if (!outputNode) {
      errors.push({
        severity: ValidationSeverity.Error,
        message: 'Graph must have an output node',
      });
      // Can't continue validation without output node
      return {
        valid: false,
        errors,
        warnings,
        info,
      };
    }

    // Validate individual nodes
    this.validateNodes(graph, errors, warnings);

    // Validate edges
    this.validateEdges(graph, errors, warnings);

    // Check for cycles
    this.detectCycles(graph, errors);

    // Check for unreachable nodes
    this.detectUnreachableNodes(graph, warnings);

    // Validate required connections
    this.validateRequiredConnections(graph, errors);

    // Validate value ranges
    this.validateValueRanges(graph, warnings);

    // Check for dead code
    this.detectDeadNodes(graph, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info,
    };
  }

  /**
   * Validates individual nodes
   * @param graph - Shader graph
   * @param errors - Error list
   * @param warnings - Warning list
   */
  private static validateNodes(
    graph: ShaderGraph,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    for (const node of graph.nodes.values()) {
      // Run node's own validation
      const nodeErrors = node.validate();
      for (const error of nodeErrors) {
        errors.push({
          severity: ValidationSeverity.Error,
          message: error,
          nodeId: node.id,
        });
      }

      // Check for disconnected inputs with no default values
      for (const [name, input] of node.inputs) {
        if (!input.connection && input.defaultValue === undefined) {
          warnings.push({
            severity: ValidationSeverity.Warning,
            message: `Input '${name}' has no connection and no default value`,
            nodeId: node.id,
            portName: name,
          });
        }
      }
    }
  }

  /**
   * Validates edges
   * @param graph - Shader graph
   * @param errors - Error list
   * @param warnings - Warning list
   */
  private static validateEdges(
    graph: ShaderGraph,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    for (const edge of graph.edges) {
      const fromNode = graph.getNode(edge.from.nodeId);
      const toNode = graph.getNode(edge.to.nodeId);

      if (!fromNode) {
        errors.push({
          severity: ValidationSeverity.Error,
          message: `Edge references non-existent source node: ${edge.from.nodeId}`,
          edgeId: edge.id,
        });
        continue;
      }

      if (!toNode) {
        errors.push({
          severity: ValidationSeverity.Error,
          message: `Edge references non-existent target node: ${edge.to.nodeId}`,
          edgeId: edge.id,
        });
        continue;
      }

      // Validate edge connection
      const validation = edge.validate(fromNode, toNode);
      if (!validation.valid) {
        errors.push({
          severity: ValidationSeverity.Error,
          message: validation.error || 'Invalid edge connection',
          edgeId: edge.id,
        });
      }

      // Check for type compatibility warnings
      const fromOutput = fromNode.getOutput(edge.from.outputName);
      const toInput = toNode.getInput(edge.to.inputName);

      if (fromOutput && toInput) {
        if (fromOutput.type !== toInput.type) {
          warnings.push({
            severity: ValidationSeverity.Warning,
            message: `Type conversion from ${fromOutput.type} to ${toInput.type}`,
            edgeId: edge.id,
          });
        }
      }
    }
  }

  /**
   * Detects cycles in the graph
   * @param graph - Shader graph
   * @param errors - Error list
   */
  private static detectCycles(graph: ShaderGraph, errors: ValidationError[]): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const hasCycle = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        // Found a cycle
        const cycleStart = path.indexOf(nodeId);
        const cyclePath = path.slice(cycleStart).concat([nodeId]);
        errors.push({
          severity: ValidationSeverity.Error,
          message: `Cycle detected: ${cyclePath.join(' -> ')}`,
          nodeId,
        });
        return true;
      }

      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      // Get all nodes that this node depends on
      const dependencies = this.getNodeDependencies(graph, nodeId);
      for (const depId of dependencies) {
        if (hasCycle(depId)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      path.pop();

      return false;
    };

    // Check all nodes
    for (const nodeId of graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        hasCycle(nodeId);
      }
    }
  }

  /**
   * Gets all nodes that a node depends on (inputs)
   * @param graph - Shader graph
   * @param nodeId - Node ID
   * @returns Array of dependency node IDs
   */
  private static getNodeDependencies(graph: ShaderGraph, nodeId: string): string[] {
    const dependencies: string[] = [];
    for (const edge of graph.edges) {
      if (edge.to.nodeId === nodeId) {
        dependencies.push(edge.from.nodeId);
      }
    }
    return dependencies;
  }

  /**
   * Detects unreachable nodes (not connected to output)
   * @param graph - Shader graph
   * @param warnings - Warning list
   */
  private static detectUnreachableNodes(graph: ShaderGraph, warnings: ValidationError[]): void {
    const outputNode = graph.getOutputNode();
    if (!outputNode) return;

    const reachable = new Set<string>();

    const visit = (nodeId: string): void => {
      if (reachable.has(nodeId)) return;
      reachable.add(nodeId);

      // Visit all dependencies
      const dependencies = this.getNodeDependencies(graph, nodeId);
      for (const depId of dependencies) {
        visit(depId);
      }
    };

    // Start from output node
    visit(outputNode.id);

    // Check for unreachable nodes
    for (const node of graph.nodes.values()) {
      if (!reachable.has(node.id)) {
        warnings.push({
          severity: ValidationSeverity.Warning,
          message: `Node '${node.metadata.displayName}' is not connected to output`,
          nodeId: node.id,
        });
      }
    }
  }

  /**
   * Validates required connections
   * @param graph - Shader graph
   * @param errors - Error list
   */
  private static validateRequiredConnections(
    graph: ShaderGraph,
    errors: ValidationError[]
  ): void {
    for (const node of graph.nodes.values()) {
      for (const [name, input] of node.inputs) {
        // Check if input requires a connection (no default value allowed)
        if (input.type === 'sampler2D' || input.type === 'samplerCube') {
          if (!input.connection) {
            // Textures usually need connections, but it's not always an error
            // Only flag it if there's no default specified
            if (input.defaultValue === undefined) {
              errors.push({
                severity: ValidationSeverity.Error,
                message: `Texture input '${name}' requires a connection`,
                nodeId: node.id,
                portName: name,
              });
            }
          }
        }
      }
    }
  }

  /**
   * Validates value ranges
   * @param graph - Shader graph
   * @param warnings - Warning list
   */
  private static validateValueRanges(graph: ShaderGraph, warnings: ValidationError[]): void {
    for (const node of graph.nodes.values()) {
      for (const [name, input] of node.inputs) {
        if (input.defaultValue === undefined) continue;

        const constraints = input.constraints;
        if (!constraints) continue;

        // Check min/max constraints
        if (typeof input.defaultValue === 'number') {
          if (constraints.min !== undefined && input.defaultValue < constraints.min) {
            warnings.push({
              severity: ValidationSeverity.Warning,
              message: `Input '${name}' value ${input.defaultValue} is below minimum ${constraints.min}`,
              nodeId: node.id,
              portName: name,
            });
          }

          if (constraints.max !== undefined && input.defaultValue > constraints.max) {
            warnings.push({
              severity: ValidationSeverity.Warning,
              message: `Input '${name}' value ${input.defaultValue} is above maximum ${constraints.max}`,
              nodeId: node.id,
              portName: name,
            });
          }
        }

        // Check options constraints
        if (constraints.options && Array.isArray(constraints.options)) {
          if (!constraints.options.includes(input.defaultValue)) {
            warnings.push({
              severity: ValidationSeverity.Warning,
              message: `Input '${name}' value '${input.defaultValue}' is not in allowed options`,
              nodeId: node.id,
              portName: name,
            });
          }
        }
      }
    }
  }

  /**
   * Detects dead nodes (nodes with no outputs connected)
   * @param graph - Shader graph
   * @param warnings - Warning list
   */
  private static detectDeadNodes(graph: ShaderGraph, warnings: ValidationError[]): void {
    const outputNode = graph.getOutputNode();
    if (!outputNode) return;

    for (const node of graph.nodes.values()) {
      // Skip output node
      if (node.id === outputNode.id) continue;

      // Check if any outputs are connected
      let hasOutputConnection = false;
      for (const [outputName] of node.outputs) {
        for (const edge of graph.edges) {
          if (edge.from.nodeId === node.id && edge.from.outputName === outputName) {
            hasOutputConnection = true;
            break;
          }
        }
        if (hasOutputConnection) break;
      }

      if (!hasOutputConnection) {
        warnings.push({
          severity: ValidationSeverity.Warning,
          message: `Node '${node.metadata.displayName}' has no outputs connected`,
          nodeId: node.id,
        });
      }
    }
  }

  /**
   * Checks if a specific path exists between two nodes
   * @param graph - Shader graph
   * @param fromId - Start node ID
   * @param toId - End node ID
   * @returns True if a path exists
   */
  public static hasPath(graph: ShaderGraph, fromId: string, toId: string): boolean {
    if (fromId === toId) return true;

    const visited = new Set<string>();

    const visit = (nodeId: string): boolean => {
      if (nodeId === toId) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);

      // Visit all nodes that depend on this node
      for (const edge of graph.edges) {
        if (edge.from.nodeId === nodeId) {
          if (visit(edge.to.nodeId)) {
            return true;
          }
        }
      }

      return false;
    };

    return visit(fromId);
  }

  /**
   * Gets topological order of nodes (for code generation)
   * @param graph - Shader graph
   * @returns Array of node IDs in topological order, or null if cycle detected
   */
  public static getTopologicalOrder(graph: ShaderGraph): string[] | null {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialize
    for (const nodeId of graph.nodes.keys()) {
      inDegree.set(nodeId, 0);
      adjacency.set(nodeId, []);
    }

    // Build graph
    for (const edge of graph.edges) {
      adjacency.get(edge.from.nodeId)!.push(edge.to.nodeId);
      inDegree.set(edge.to.nodeId, inDegree.get(edge.to.nodeId)! + 1);
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);

      for (const neighbor of adjacency.get(nodeId)!) {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Check if all nodes were processed
    if (result.length !== graph.nodes.size) {
      return null; // Cycle detected
    }

    return result;
  }
}
