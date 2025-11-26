/**
 * @fileoverview Edge connections between shader graph nodes
 * @module shaders/graph/ShaderEdge
 */

import { ShaderNode, ShaderType } from './ShaderNode';

/**
 * Reference to a node output port
 */
export interface NodeOutputRef {
  /** Node ID */
  nodeId: string;
  /** Output port name */
  outputName: string;
}

/**
 * Reference to a node input port
 */
export interface NodeInputRef {
  /** Node ID */
  nodeId: string;
  /** Input port name */
  inputName: string;
}

/**
 * Edge validation result
 */
export interface EdgeValidationResult {
  /** Whether the edge is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
}

/**
 * Represents a connection between two shader nodes
 */
export class ShaderEdge {
  /** Unique edge identifier */
  public readonly id: string;

  /** Source node output */
  public readonly from: NodeOutputRef;

  /** Target node input */
  public readonly to: NodeInputRef;

  /** Edge metadata */
  public metadata: {
    /** Connection strength/weight (for future use) */
    weight?: number;
    /** Whether this edge can be removed */
    locked?: boolean;
  };

  /**
   * Creates a new shader edge
   * @param id - Unique identifier
   * @param from - Source output reference
   * @param to - Target input reference
   */
  constructor(id: string, from: NodeOutputRef, to: NodeInputRef) {
    this.id = id;
    this.from = from;
    this.to = to;
    this.metadata = {};
  }

  /**
   * Validates this edge connection
   * @param fromNode - Source node
   * @param toNode - Target node
   * @returns Validation result
   */
  public validate(fromNode: ShaderNode, toNode: ShaderNode): EdgeValidationResult {
    // Check if output exists
    const output = fromNode.getOutput(this.from.outputName);
    if (!output) {
      return {
        valid: false,
        error: `Output '${this.from.outputName}' not found on node ${fromNode.id}`,
      };
    }

    // Check if input exists
    const input = toNode.getInput(this.to.inputName);
    if (!input) {
      return {
        valid: false,
        error: `Input '${this.to.inputName}' not found on node ${toNode.id}`,
      };
    }

    // Check type compatibility
    if (!this.areTypesCompatible(output.type, input.type)) {
      return {
        valid: false,
        error: `Type mismatch: cannot connect ${output.type} to ${input.type}`,
      };
    }

    // Check for self-connection
    if (fromNode.id === toNode.id) {
      return {
        valid: false,
        error: 'Cannot connect a node to itself',
      };
    }

    return { valid: true };
  }

  /**
   * Checks if two shader types are compatible for connection
   * @param outputType - Source type
   * @param inputType - Target type
   * @returns True if types are compatible
   */
  private areTypesCompatible(outputType: ShaderType, inputType: ShaderType): boolean {
    // Exact match
    if (outputType === inputType) {
      return true;
    }

    // Check if implicit conversion is possible
    return ShaderNode.canConvertType(outputType, inputType);
  }

  /**
   * Gets a string representation of this edge
   * @returns String representation
   */
  public toString(): string {
    return `${this.from.nodeId}.${this.from.outputName} -> ${this.to.nodeId}.${this.to.inputName}`;
  }

  /**
   * Serializes edge to JSON
   * @returns Serialized edge data
   */
  public serialize(): any {
    return {
      id: this.id,
      from: {
        nodeId: this.from.nodeId,
        outputName: this.from.outputName,
      },
      to: {
        nodeId: this.to.nodeId,
        inputName: this.to.inputName,
      },
      metadata: { ...this.metadata },
    };
  }

  /**
   * Deserializes an edge from JSON
   * @param data - Serialized edge data
   * @returns New ShaderEdge instance
   */
  public static deserialize(data: any): ShaderEdge {
    const edge = new ShaderEdge(
      data.id,
      {
        nodeId: data.from.nodeId,
        outputName: data.from.outputName,
      },
      {
        nodeId: data.to.nodeId,
        inputName: data.to.inputName,
      }
    );

    if (data.metadata) {
      edge.metadata = { ...data.metadata };
    }

    return edge;
  }

  /**
   * Creates a unique edge ID from connection references
   * @param from - Source output reference
   * @param to - Target input reference
   * @returns Unique edge ID
   */
  public static createId(from: NodeOutputRef, to: NodeInputRef): string {
    return `${from.nodeId}:${from.outputName}->${to.nodeId}:${to.inputName}`;
  }

  /**
   * Checks if this edge connects the specified ports
   * @param from - Source output reference
   * @param to - Target input reference
   * @returns True if this edge connects these ports
   */
  public connects(from: NodeOutputRef, to: NodeInputRef): boolean {
    return (
      this.from.nodeId === from.nodeId &&
      this.from.outputName === from.outputName &&
      this.to.nodeId === to.nodeId &&
      this.to.inputName === to.inputName
    );
  }

  /**
   * Checks if this edge is connected to a specific node
   * @param nodeId - Node ID to check
   * @returns True if edge is connected to the node
   */
  public isConnectedToNode(nodeId: string): boolean {
    return this.from.nodeId === nodeId || this.to.nodeId === nodeId;
  }

  /**
   * Checks if this edge outputs from a specific node and port
   * @param nodeId - Node ID
   * @param outputName - Output port name
   * @returns True if edge outputs from this port
   */
  public outputsFrom(nodeId: string, outputName: string): boolean {
    return this.from.nodeId === nodeId && this.from.outputName === outputName;
  }

  /**
   * Checks if this edge inputs to a specific node and port
   * @param nodeId - Node ID
   * @param inputName - Input port name
   * @returns True if edge inputs to this port
   */
  public inputsTo(nodeId: string, inputName: string): boolean {
    return this.to.nodeId === nodeId && this.to.inputName === inputName;
  }
}
