/**
 * @fileoverview Node-based visual shader graph system
 * @module shaders/graph/ShaderGraph
 */

import { ShaderNode, CodeGenContext, ShaderType } from './ShaderNode';
import { ShaderEdge, NodeOutputRef, NodeInputRef } from './ShaderEdge';
import { GraphValidator, ValidationResult } from './GraphValidator';

/**
 * Compilation target
 */
export type CompilationTarget = 'glsl' | 'wgsl';

/**
 * Compilation result
 */
export interface CompilationResult {
  /** Whether compilation succeeded */
  success: boolean;
  /** Generated shader code */
  code?: string;
  /** Compilation errors */
  errors?: string[];
  /** Vertex shader code (if applicable) */
  vertexCode?: string;
  /** Fragment shader code (if applicable) */
  fragmentCode?: string;
  /** Uniform declarations */
  uniforms?: Map<string, { type: ShaderType; binding?: number }>;
  /** Texture bindings */
  textures?: Map<string, { type: 'sampler2D' | 'samplerCube'; binding: number }>;
}

/**
 * Graph metadata
 */
export interface GraphMetadata {
  /** Creation timestamp */
  created?: string;
  /** Last modified timestamp */
  modified?: string;
  /** Graph author */
  author?: string;
  /** Graph version */
  version?: string;
}

/**
 * Node-based visual shader representation
 */
export class ShaderGraph {
  /** Map of node IDs to nodes */
  public readonly nodes: Map<string, ShaderNode>;

  /** Array of edges connecting nodes */
  public readonly edges: ShaderEdge[];

  /** Graph name */
  public name: string;

  /** Graph description */
  public description: string;

  /** Graph metadata */
  public metadata: GraphMetadata;

  /** Next node ID counter */
  private nextNodeId: number;

  /** Next edge ID counter */
  private nextEdgeId: number;

  /**
   * Creates a new shader graph
   * @param name - Graph name
   */
  constructor(name: string = 'Untitled Shader') {
    this.nodes = new Map();
    this.edges = [];
    this.name = name;
    this.description = '';
    this.metadata = {
      created: new Date().toISOString(),
    };
    this.nextNodeId = 0;
    this.nextEdgeId = 0;
  }

  /**
   * Adds a node to the graph
   * @param node - Node to add
   * @returns True if added successfully
   */
  public addNode(node: ShaderNode): boolean {
    if (this.nodes.has(node.id)) {
      return false;
    }

    this.nodes.set(node.id, node);
    this.metadata.modified = new Date().toISOString();
    return true;
  }

  /**
   * Removes a node from the graph
   * @param id - Node ID to remove
   * @returns True if removed successfully
   */
  public removeNode(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) {
      return false;
    }

    // Remove all edges connected to this node
    this.edges = this.edges.filter((edge) => !edge.isConnectedToNode(id));

    // Remove node
    this.nodes.delete(id);
    this.metadata.modified = new Date().toISOString();
    return true;
  }

  /**
   * Gets a node by ID
   * @param id - Node ID
   * @returns Node or undefined
   */
  public getNode(id: string): ShaderNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Gets the output node of the graph
   * @returns Output node or undefined
   */
  public getOutputNode(): ShaderNode | undefined {
    for (const node of this.nodes.values()) {
      if (node.type === 'utility.output') {
        return node;
      }
    }
    return undefined;
  }

  /**
   * Connects two nodes
   * @param from - Source output reference
   * @param to - Target input reference
   * @returns Created edge or undefined if connection failed
   */
  public connect(from: NodeOutputRef, to: NodeInputRef): ShaderEdge | undefined {
    const fromNode = this.getNode(from.nodeId);
    const toNode = this.getNode(to.nodeId);

    if (!fromNode || !toNode) {
      return undefined;
    }

    // Check if connection already exists
    for (const edge of this.edges) {
      if (edge.connects(from, to)) {
        return edge;
      }
    }

    // Remove any existing connection to the target input
    this.disconnectInput(to.nodeId, to.inputName);

    // Create new edge
    const edgeId = this.generateEdgeId();
    const edge = new ShaderEdge(edgeId, from, to);

    // Validate edge
    const validation = edge.validate(fromNode, toNode);
    if (!validation.valid) {
      console.error(`Connection validation failed: ${validation.error}`);
      return undefined;
    }

    // Update input connection reference
    const input = toNode.getInput(to.inputName);
    if (input) {
      input.connection = edgeId;
    }

    this.edges.push(edge);
    this.metadata.modified = new Date().toISOString();
    return edge;
  }

  /**
   * Disconnects an edge
   * @param edge - Edge to disconnect (or edge ID)
   * @returns True if disconnected successfully
   */
  public disconnect(edge: ShaderEdge | string): boolean {
    const edgeId = typeof edge === 'string' ? edge : edge.id;
    const edgeIndex = this.edges.findIndex((e) => e.id === edgeId);

    if (edgeIndex === -1) {
      return false;
    }

    const removedEdge = this.edges[edgeIndex];

    // Update input connection reference
    const toNode = this.getNode(removedEdge.to.nodeId);
    if (toNode) {
      const input = toNode.getInput(removedEdge.to.inputName);
      if (input) {
        input.connection = undefined;
      }
    }

    this.edges.splice(edgeIndex, 1);
    this.metadata.modified = new Date().toISOString();
    return true;
  }

  /**
   * Disconnects all edges connected to a specific input
   * @param nodeId - Node ID
   * @param inputName - Input port name
   * @returns Number of edges disconnected
   */
  public disconnectInput(nodeId: string, inputName: string): number {
    const toRemove: ShaderEdge[] = [];

    for (const edge of this.edges) {
      if (edge.inputsTo(nodeId, inputName)) {
        toRemove.push(edge);
      }
    }

    for (const edge of toRemove) {
      this.disconnect(edge);
    }

    return toRemove.length;
  }

  /**
   * Disconnects all edges connected to a specific output
   * @param nodeId - Node ID
   * @param outputName - Output port name
   * @returns Number of edges disconnected
   */
  public disconnectOutput(nodeId: string, outputName: string): number {
    const toRemove: ShaderEdge[] = [];

    for (const edge of this.edges) {
      if (edge.outputsFrom(nodeId, outputName)) {
        toRemove.push(edge);
      }
    }

    for (const edge of toRemove) {
      this.disconnect(edge);
    }

    return toRemove.length;
  }

  /**
   * Gets all edges connected to a node
   * @param nodeId - Node ID
   * @returns Array of edges
   */
  public getNodeEdges(nodeId: string): ShaderEdge[] {
    return this.edges.filter((edge) => edge.isConnectedToNode(nodeId));
  }

  /**
   * Gets all input edges for a node
   * @param nodeId - Node ID
   * @returns Array of input edges
   */
  public getInputEdges(nodeId: string): ShaderEdge[] {
    return this.edges.filter((edge) => edge.to.nodeId === nodeId);
  }

  /**
   * Gets all output edges for a node
   * @param nodeId - Node ID
   * @returns Array of output edges
   */
  public getOutputEdges(nodeId: string): ShaderEdge[] {
    return this.edges.filter((edge) => edge.from.nodeId === nodeId);
  }

  /**
   * Validates the graph
   * @returns Validation result
   */
  public validate(): ValidationResult {
    return GraphValidator.validate(this);
  }

  /**
   * Compiles the graph to shader code
   * @param target - Target shader language
   * @returns Compilation result
   */
  public compile(target: CompilationTarget = 'glsl'): CompilationResult {
    // Validate graph first
    const validation = this.validate();
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors.map((e) => e.message),
      };
    }

    try {
      // Get topological order
      const order = GraphValidator.getTopologicalOrder(this);
      if (!order) {
        return {
          success: false,
          errors: ['Graph contains cycles'],
        };
      }

      // Create code generation context
      const context: CodeGenContext = {
        target,
        indent: 0,
        variables: new Map(),
        functions: new Set(),
        uniforms: new Map(),
        textures: new Map(),
        stage: 'fragment',
      };

      // Generate code for each node in order
      const nodeOutputs = new Map<string, Map<string, string>>();

      for (const nodeId of order) {
        const node = this.getNode(nodeId);
        if (!node) continue;

        // Collect input values
        const inputValues = new Map<string, string>();
        for (const [inputName, input] of node.inputs) {
          if (input.connection) {
            // Find the edge that connects to this input
            const edge = this.edges.find((e) => e.id === input.connection);
            if (edge) {
              const sourceOutputs = nodeOutputs.get(edge.from.nodeId);
              if (sourceOutputs) {
                const value = sourceOutputs.get(edge.from.outputName);
                if (value) {
                  inputValues.set(inputName, value);
                }
              }
            }
          } else if (input.defaultValue !== undefined) {
            // Use default value
            inputValues.set(
              inputName,
              node['valueToCode'](input.defaultValue, input.type, context)
            );
          }
        }

        // Generate code for this node
        const outputs = node.generateCode(context, inputValues);
        nodeOutputs.set(nodeId, outputs);
      }

      // Build final shader code
      const code = this.buildShaderCode(context, target);

      return {
        success: true,
        code,
        fragmentCode: code,
        uniforms: context.uniforms,
        textures: context.textures,
      };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Builds final shader code from context
   * @param context - Code generation context
   * @param target - Target shader language
   * @returns Generated shader code
   */
  private buildShaderCode(context: CodeGenContext, target: CompilationTarget): string {
    const lines: string[] = [];

    // Add version directive
    if (target === 'glsl') {
      lines.push('#version 300 es');
      lines.push('precision highp float;');
      lines.push('');
    }

    // Add uniform declarations
    if (context.uniforms.size > 0) {
      for (const [name, uniform] of context.uniforms) {
        lines.push(`uniform ${uniform.type} ${name};`);
      }
      lines.push('');
    }

    // Add texture declarations
    if (context.textures.size > 0) {
      for (const [name, texture] of context.textures) {
        if (target === 'glsl') {
          lines.push(`uniform ${texture.type} ${name};`);
        } else {
          lines.push(`@binding(${texture.binding}) @group(0) var ${name}: ${texture.type};`);
        }
      }
      lines.push('');
    }

    // Add main function
    if (target === 'glsl') {
      lines.push('void main() {');
    } else {
      lines.push('@fragment');
      lines.push('fn main() {');
    }

    // Add variable declarations
    for (const varDecl of context.variables.values()) {
      lines.push('  ' + varDecl);
    }

    // Add output assignment (from output node)
    const outputNode = this.getOutputNode();
    if (outputNode) {
      lines.push('');
      if (target === 'glsl') {
        lines.push('  // Output');
        // Generate output from connected input
        const inputEdges = this.getInputEdges(outputNode.id);
        if (inputEdges.length > 0) {
          const colorInput = inputEdges.find(e => e.to.portName === 'color');
          if (colorInput) {
            const sourceVar = `node_${colorInput.from.nodeId.replace(/-/g, '_')}_${colorInput.from.portName}`;
            lines.push(`  gl_FragColor = ${sourceVar};`);
          } else {
            // Default to first connected input
            const edge = inputEdges[0];
            const sourceVar = `node_${edge.from.nodeId.replace(/-/g, '_')}_${edge.from.portName}`;
            lines.push(`  gl_FragColor = vec4(${sourceVar}, 1.0);`);
          }
        } else {
          // No connections - output black
          lines.push('  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);');
        }
      }
    }

    lines.push('}');

    return lines.join('\n');
  }

  /**
   * Optimizes the graph
   * @returns Number of optimizations applied
   */
  public optimize(): number {
    let optimizationCount = 0;

    // Dead node elimination
    optimizationCount += this.eliminateDeadNodes();

    // Constant folding
    optimizationCount += this.foldConstants();

    return optimizationCount;
  }

  /**
   * Eliminates dead nodes (nodes not connected to output)
   * @returns Number of nodes removed
   */
  private eliminateDeadNodes(): number {
    const outputNode = this.getOutputNode();
    if (!outputNode) return 0;

    const reachable = new Set<string>();

    const visit = (nodeId: string): void => {
      if (reachable.has(nodeId)) return;
      reachable.add(nodeId);

      // Visit all dependencies
      const inputEdges = this.getInputEdges(nodeId);
      for (const edge of inputEdges) {
        visit(edge.from.nodeId);
      }
    };

    visit(outputNode.id);

    // Remove unreachable nodes
    const toRemove: string[] = [];
    for (const nodeId of this.nodes.keys()) {
      if (!reachable.has(nodeId)) {
        toRemove.push(nodeId);
      }
    }

    for (const nodeId of toRemove) {
      this.removeNode(nodeId);
    }

    return toRemove.length;
  }

  /**
   * Folds constant expressions by evaluating nodes with only constant inputs.
   * @returns Number of constants folded
   */
  private foldConstants(): number {
    let foldCount = 0;
    let changed = true;

    // Iteratively fold until no more changes
    while (changed) {
      changed = false;

      for (const [nodeId, node] of this.nodes) {
        // Skip if already a constant node
        if (node.type === 'constant' || node.type === 'output') continue;

        // Check if all inputs are constants
        const inputEdges = this.getInputEdges(nodeId);
        const inputValues: Map<string, any> = new Map();
        let allConstant = true;

        for (const edge of inputEdges) {
          const sourceNode = this.nodes.get(edge.from.nodeId);
          if (!sourceNode || sourceNode.type !== 'constant') {
            allConstant = false;
            break;
          }
          inputValues.set(edge.to.portName, sourceNode.properties?.value);
        }

        if (allConstant && inputValues.size > 0) {
          // Evaluate the operation
          const result = this.evaluateConstantOperation(node.type, inputValues);

          if (result !== undefined) {
            // Replace node with constant
            node.type = 'constant';
            node.properties = { ...node.properties, value: result };

            // Remove input edges (constants have no inputs)
            for (const edge of inputEdges) {
              this.removeEdge(edge.id);
            }

            foldCount++;
            changed = true;
          }
        }
      }
    }

    return foldCount;
  }

  /**
   * Evaluates a constant operation.
   */
  private evaluateConstantOperation(op: string, inputs: Map<string, any>): any {
    const a = inputs.get('a') ?? inputs.get('input');
    const b = inputs.get('b');

    switch (op) {
      case 'add': return this.vectorOp(a, b, (x, y) => x + y);
      case 'subtract': return this.vectorOp(a, b, (x, y) => x - y);
      case 'multiply': return this.vectorOp(a, b, (x, y) => x * y);
      case 'divide': return this.vectorOp(a, b, (x, y) => y !== 0 ? x / y : 0);
      case 'abs': return this.vectorUnary(a, Math.abs);
      case 'sin': return this.vectorUnary(a, Math.sin);
      case 'cos': return this.vectorUnary(a, Math.cos);
      case 'sqrt': return this.vectorUnary(a, Math.sqrt);
      case 'normalize':
        if (Array.isArray(a)) {
          const len = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
          return len > 0 ? a.map(v => v / len) : a;
        }
        return a;
      default:
        return undefined; // Can't fold this operation
    }
  }

  /**
   * Applies binary operation to scalar or vector.
   */
  private vectorOp(a: any, b: any, op: (x: number, y: number) => number): any {
    if (typeof a === 'number' && typeof b === 'number') {
      return op(a, b);
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.map((v, i) => op(v, b[i] ?? 0));
    }
    if (Array.isArray(a) && typeof b === 'number') {
      return a.map(v => op(v, b));
    }
    return undefined;
  }

  /**
   * Applies unary operation to scalar or vector.
   */
  private vectorUnary(a: any, op: (x: number) => number): any {
    if (typeof a === 'number') return op(a);
    if (Array.isArray(a)) return a.map(op);
    return undefined;
  }

  /**
   * Serializes the graph
   * @returns Serialized graph data
   */
  public serialize(): any {
    return {
      name: this.name,
      description: this.description,
      metadata: { ...this.metadata },
      nodes: Array.from(this.nodes.values()).map((node) => node.serialize()),
      edges: this.edges.map((edge) => edge.serialize()),
    };
  }

  /**
   * Deserializes graph data
   * @param data - Serialized graph data
   */
  public deserialize(data: any): void {
    if (data.name) this.name = data.name;
    if (data.description) this.description = data.description;
    if (data.metadata) this.metadata = { ...data.metadata };
  }

  /**
   * Clears the graph
   */
  public clear(): void {
    this.nodes.clear();
    this.edges.length = 0;
    this.nextNodeId = 0;
    this.nextEdgeId = 0;
    this.metadata.modified = new Date().toISOString();
  }

  /**
   * Gets graph statistics
   * @returns Graph statistics
   */
  public getStatistics(): {
    nodeCount: number;
    edgeCount: number;
    complexity: number;
  } {
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.length,
      complexity: this.nodes.size + this.edges.length,
    };
  }

  /**
   * Generates a unique node ID
   * @returns Unique node ID
   */
  private generateNodeId(): string {
    return `node-${this.nextNodeId++}`;
  }

  /**
   * Generates a unique edge ID
   * @returns Unique edge ID
   */
  private generateEdgeId(): string {
    return `edge-${this.nextEdgeId++}`;
  }

  /**
   * Finds nodes by type
   * @param type - Node type
   * @returns Array of matching nodes
   */
  public findNodesByType(type: string): ShaderNode[] {
    const result: ShaderNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.type === type) {
        result.push(node);
      }
    }
    return result;
  }

  /**
   * Finds nodes by category
   * @param category - Node category
   * @returns Array of matching nodes
   */
  public findNodesByCategory(category: string): ShaderNode[] {
    const result: ShaderNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.metadata.category === category) {
        result.push(node);
      }
    }
    return result;
  }

  /**
   * Gets all node categories used in the graph
   * @returns Array of category names
   */
  public getUsedCategories(): string[] {
    const categories = new Set<string>();
    for (const node of this.nodes.values()) {
      categories.add(node.metadata.category);
    }
    return Array.from(categories).sort();
  }
}
