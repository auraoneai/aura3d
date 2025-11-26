/**
 * @fileoverview Shader graph serialization and deserialization
 * @module shaders/graph/GraphSerializer
 */

import { ShaderGraph } from './ShaderGraph';
import { ShaderEdge } from './ShaderEdge';
import { NodeLibrary } from './NodeLibrary';

/**
 * Serialized graph format version
 */
const CURRENT_VERSION = '1.0.0';

/**
 * Serialized graph data
 */
export interface SerializedGraph {
  /** Format version */
  version: string;
  /** Graph metadata */
  metadata: {
    name?: string;
    description?: string;
    author?: string;
    created?: string;
    modified?: string;
  };
  /** Serialized nodes */
  nodes: any[];
  /** Serialized edges */
  edges: any[];
}

/**
 * Serialization options
 */
export interface SerializationOptions {
  /** Include metadata */
  includeMetadata?: boolean;
  /** Pretty print JSON */
  prettyPrint?: boolean;
  /** Indentation for pretty print */
  indent?: number;
}

/**
 * Deserialization options
 */
export interface DeserializationOptions {
  /** Validate after deserialization */
  validate?: boolean;
  /** Skip unknown node types */
  skipUnknownNodes?: boolean;
}

/**
 * Handles serialization and deserialization of shader graphs
 */
export class GraphSerializer {
  /**
   * Serializes a shader graph to JSON
   * @param graph - Shader graph to serialize
   * @param options - Serialization options
   * @returns Serialized graph data
   */
  public static serialize(
    graph: ShaderGraph,
    options: SerializationOptions = {}
  ): SerializedGraph {
    const includeMetadata = options.includeMetadata !== false;

    const data: SerializedGraph = {
      version: CURRENT_VERSION,
      metadata: includeMetadata
        ? {
            name: graph.name,
            description: graph.description,
            created: graph.metadata.created,
            modified: new Date().toISOString(),
          }
        : {},
      nodes: [],
      edges: [],
    };

    // Serialize nodes
    for (const node of graph.nodes.values()) {
      data.nodes.push(node.serialize());
    }

    // Serialize edges
    for (const edge of graph.edges) {
      data.edges.push(edge.serialize());
    }

    return data;
  }

  /**
   * Serializes a shader graph to JSON string
   * @param graph - Shader graph to serialize
   * @param options - Serialization options
   * @returns JSON string
   */
  public static serializeToString(
    graph: ShaderGraph,
    options: SerializationOptions = {}
  ): string {
    const data = this.serialize(graph, options);

    if (options.prettyPrint) {
      return JSON.stringify(data, null, options.indent || 2);
    }

    return JSON.stringify(data);
  }

  /**
   * Deserializes a shader graph from JSON
   * @param data - Serialized graph data
   * @param options - Deserialization options
   * @returns Deserialized shader graph
   */
  public static deserialize(
    data: SerializedGraph,
    options: DeserializationOptions = {}
  ): ShaderGraph {
    // Check version and migrate if needed
    const migratedData = this.migrateVersion(data);

    // Create new graph
    const graph = new ShaderGraph();

    // Set metadata
    if (migratedData.metadata) {
      if (migratedData.metadata.name) {
        graph.name = migratedData.metadata.name;
      }
      if (migratedData.metadata.description) {
        graph.description = migratedData.metadata.description;
      }
      if (migratedData.metadata.created) {
        graph.metadata.created = migratedData.metadata.created;
      }
    }

    // Deserialize nodes
    const nodeIdMap = new Map<string, string>(); // Old ID -> New ID

    for (const nodeData of migratedData.nodes) {
      try {
        const node = NodeLibrary.create(nodeData.type, nodeData.id);
        node.deserialize(nodeData);
        graph.addNode(node);
        nodeIdMap.set(nodeData.id, node.id);
      } catch (error) {
        if (options.skipUnknownNodes) {
          console.warn(`Skipping unknown node type: ${nodeData.type}`);
          continue;
        }
        throw new Error(`Failed to deserialize node: ${error}`);
      }
    }

    // Deserialize edges
    for (const edgeData of migratedData.edges) {
      try {
        const edge = ShaderEdge.deserialize(edgeData);

        // Verify nodes exist
        const fromNode = graph.getNode(edge.from.nodeId);
        const toNode = graph.getNode(edge.to.nodeId);

        if (!fromNode || !toNode) {
          if (options.skipUnknownNodes) {
            console.warn(`Skipping edge with missing nodes: ${edge.id}`);
            continue;
          }
          throw new Error(`Edge references missing node: ${edge.id}`);
        }

        graph.connect(
          { nodeId: edge.from.nodeId, outputName: edge.from.outputName },
          { nodeId: edge.to.nodeId, inputName: edge.to.inputName }
        );
      } catch (error) {
        throw new Error(`Failed to deserialize edge: ${error}`);
      }
    }

    // Validate if requested
    if (options.validate) {
      const validation = graph.validate();
      if (!validation.valid) {
        const errorMessages = validation.errors.map((e) => e.message).join(', ');
        throw new Error(`Deserialized graph is invalid: ${errorMessages}`);
      }
    }

    return graph;
  }

  /**
   * Deserializes a shader graph from JSON string
   * @param json - JSON string
   * @param options - Deserialization options
   * @returns Deserialized shader graph
   */
  public static deserializeFromString(
    json: string,
    options: DeserializationOptions = {}
  ): ShaderGraph {
    try {
      const data = JSON.parse(json);
      return this.deserialize(data, options);
    } catch (error) {
      throw new Error(`Failed to parse JSON: ${error}`);
    }
  }

  /**
   * Validates serialized graph data
   * @param data - Serialized graph data
   * @returns True if data is valid
   */
  public static validateData(data: any): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }

    if (!data.version || typeof data.version !== 'string') {
      return false;
    }

    if (!Array.isArray(data.nodes)) {
      return false;
    }

    if (!Array.isArray(data.edges)) {
      return false;
    }

    // Validate node structure
    for (const node of data.nodes) {
      if (!node.id || !node.type) {
        return false;
      }
    }

    // Validate edge structure
    for (const edge of data.edges) {
      if (!edge.id || !edge.from || !edge.to) {
        return false;
      }
      if (!edge.from.nodeId || !edge.from.outputName) {
        return false;
      }
      if (!edge.to.nodeId || !edge.to.inputName) {
        return false;
      }
    }

    return true;
  }

  /**
   * Migrates data from older versions to current version
   * @param data - Serialized graph data
   * @returns Migrated data
   */
  private static migrateVersion(data: SerializedGraph): SerializedGraph {
    const version = data.version;

    // No migration needed for current version
    if (version === CURRENT_VERSION) {
      return data;
    }

    // Create a copy to avoid modifying original
    const migrated = JSON.parse(JSON.stringify(data));

    // Apply migrations based on version
    if (this.compareVersions(version, '1.0.0') < 0) {
      // Migrate from pre-1.0.0 format
      migrated.version = '1.0.0';
      // Add any necessary migrations here
    }

    return migrated;
  }

  /**
   * Compares two version strings
   * @param v1 - First version
   * @param v2 - Second version
   * @returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  private static compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }

    return 0;
  }

  /**
   * Clones a shader graph
   * @param graph - Graph to clone
   * @returns Cloned graph
   */
  public static clone(graph: ShaderGraph): ShaderGraph {
    const serialized = this.serialize(graph);
    return this.deserialize(serialized);
  }

  /**
   * Exports graph to a downloadable format
   * @param graph - Shader graph
   * @param options - Serialization options
   * @returns Blob containing graph data
   */
  public static exportToBlob(
    graph: ShaderGraph,
    options: SerializationOptions = {}
  ): Blob {
    const json = this.serializeToString(graph, {
      ...options,
      prettyPrint: true,
      indent: 2,
    });

    return new Blob([json], { type: 'application/json' });
  }

  /**
   * Imports graph from a file
   * @param file - File containing graph data
   * @param options - Deserialization options
   * @returns Promise resolving to deserialized graph
   */
  public static async importFromFile(
    file: File,
    options: DeserializationOptions = {}
  ): Promise<ShaderGraph> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const json = e.target?.result as string;
          const graph = this.deserializeFromString(json, options);
          resolve(graph);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsText(file);
    });
  }

  /**
   * Creates a minimal graph template
   * @returns Minimal shader graph with output node
   */
  public static createTemplate(): ShaderGraph {
    const graph = new ShaderGraph();
    const outputNode = NodeLibrary.create('utility.output', 'output-node');
    graph.addNode(outputNode);
    return graph;
  }

  /**
   * Exports graph statistics
   * @param graph - Shader graph
   * @returns Graph statistics
   */
  public static getStatistics(graph: ShaderGraph): {
    nodeCount: number;
    edgeCount: number;
    categories: Map<string, number>;
    complexity: number;
  } {
    const categories = new Map<string, number>();

    for (const node of graph.nodes.values()) {
      const category = node.metadata.category;
      categories.set(category, (categories.get(category) || 0) + 1);
    }

    // Simple complexity metric: nodes + edges
    const complexity = graph.nodes.size + graph.edges.length;

    return {
      nodeCount: graph.nodes.size,
      edgeCount: graph.edges.length,
      categories,
      complexity,
    };
  }
}
