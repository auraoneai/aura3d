/**
 * Graph.ts - Visual Scripting Graph
 *
 * Represents a complete visual script graph with nodes and edges.
 * Handles graph operations, validation, and serialization.
 */

import { Node, NodeCategory } from './Node';
import { Edge } from './Edge';
import { Port } from './Port';

/**
 * Graph metadata
 */
export interface GraphMetadata {
    name: string;
    description?: string;
    author?: string;
    version?: string;
    tags?: string[];
}

/**
 * Graph validation result
 */
export interface GraphValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Graph class - represents a visual script graph
 */
export class Graph {
    public readonly id: string;
    public metadata: GraphMetadata;

    private _nodes: Map<string, Node>;
    private _edges: Map<string, Edge>;
    private _variables: Map<string, any>;
    private _subgraphs: Map<string, Graph>;

    /**
     * Create a new graph
     */
    constructor(metadata?: Partial<GraphMetadata>) {
        this.id = this.generateId();
        this.metadata = {
            name: metadata?.name ?? 'Untitled Graph',
            description: metadata?.description ?? '',
            author: metadata?.author ?? '',
            version: metadata?.version ?? '1.0.0',
            tags: metadata?.tags ?? []
        };

        this._nodes = new Map();
        this._edges = new Map();
        this._variables = new Map();
        this._subgraphs = new Map();
    }

    /**
     * Generate unique graph ID
     */
    private generateId(): string {
        return `graph_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Add node to graph
     */
    public addNode(node: Node): Node {
        if (this._nodes.has(node.id)) {
            throw new Error(`Node with id ${node.id} already exists in graph`);
        }
        this._nodes.set(node.id, node);
        return node;
    }

    /**
     * Remove node from graph
     */
    public removeNode(nodeId: string): boolean {
        const node = this._nodes.get(nodeId);
        if (!node) {
            return false;
        }

        // Remove all edges connected to this node
        const edgesToRemove: string[] = [];
        for (const [edgeId, edge] of this._edges) {
            if (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId) {
                edgesToRemove.push(edgeId);
            }
        }

        for (const edgeId of edgesToRemove) {
            this.removeEdge(edgeId);
        }

        this._nodes.delete(nodeId);
        return true;
    }

    /**
     * Get node by ID
     */
    public getNode(nodeId: string): Node | undefined {
        return this._nodes.get(nodeId);
    }

    /**
     * Get all nodes
     */
    public get nodes(): ReadonlyMap<string, Node> {
        return this._nodes;
    }

    /**
     * Get nodes by category
     */
    public getNodesByCategory(category: NodeCategory): Node[] {
        return Array.from(this._nodes.values()).filter(n => n.category === category);
    }

    /**
     * Get nodes by type
     */
    public getNodesByType(type: string): Node[] {
        return Array.from(this._nodes.values()).filter(n => n.type === type);
    }

    /**
     * Connect two ports
     */
    public connect(sourcePort: Port, targetPort: Port): Edge {
        // Check if ports can connect
        if (!sourcePort.canConnectTo(targetPort)) {
            throw new Error(`Cannot connect ${sourcePort.name} to ${targetPort.name}`);
        }

        // Create edge
        const edge = new Edge({ sourcePort, targetPort });

        // Check for cycles (only for flow edges)
        if (edge.isFlowEdge && this.wouldCreateCycle(edge)) {
            edge.disconnect();
            throw new Error('Connection would create a cycle in the graph');
        }

        this._edges.set(edge.id, edge);
        return edge;
    }

    /**
     * Disconnect edge
     */
    public disconnect(edge: Edge): boolean {
        if (!this._edges.has(edge.id)) {
            return false;
        }

        edge.disconnect();
        this._edges.delete(edge.id);
        return true;
    }

    /**
     * Remove edge by ID
     */
    public removeEdge(edgeId: string): boolean {
        const edge = this._edges.get(edgeId);
        if (!edge) {
            return false;
        }
        return this.disconnect(edge);
    }

    /**
     * Get edge by ID
     */
    public getEdge(edgeId: string): Edge | undefined {
        return this._edges.get(edgeId);
    }

    /**
     * Get all edges
     */
    public get edges(): ReadonlyMap<string, Edge> {
        return this._edges;
    }

    /**
     * Get edges connected to node
     */
    public getNodeEdges(nodeId: string): Edge[] {
        return Array.from(this._edges.values()).filter(
            e => e.sourceNodeId === nodeId || e.targetNodeId === nodeId
        );
    }

    /**
     * Get input edges for node
     */
    public getNodeInputEdges(nodeId: string): Edge[] {
        return Array.from(this._edges.values()).filter(e => e.targetNodeId === nodeId);
    }

    /**
     * Get output edges for node
     */
    public getNodeOutputEdges(nodeId: string): Edge[] {
        return Array.from(this._edges.values()).filter(e => e.sourceNodeId === nodeId);
    }

    /**
     * Check if adding edge would create a cycle
     */
    private wouldCreateCycle(newEdge: Edge): boolean {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const hasCycle = (nodeId: string): boolean => {
            visited.add(nodeId);
            recursionStack.add(nodeId);

            // Get all outgoing edges including the new one
            const outgoingEdges = this.getNodeOutputEdges(nodeId);
            if (newEdge.sourceNodeId === nodeId) {
                outgoingEdges.push(newEdge);
            }

            for (const edge of outgoingEdges) {
                const targetId = edge.targetNodeId;

                if (!visited.has(targetId)) {
                    if (hasCycle(targetId)) {
                        return true;
                    }
                } else if (recursionStack.has(targetId)) {
                    return true;
                }
            }

            recursionStack.delete(nodeId);
            return false;
        };

        return hasCycle(newEdge.sourceNodeId);
    }

    /**
     * Get entry point nodes (nodes with no flow inputs or event nodes)
     */
    public getEntryPoints(): Node[] {
        const entryPoints: Node[] = [];

        for (const node of this._nodes.values()) {
            // Event nodes are always entry points
            if (node.category === NodeCategory.EVENT) {
                entryPoints.push(node);
                continue;
            }

            // Check if has no incoming flow edges
            const hasIncomingFlow = this.getNodeInputEdges(node.id).some(e => e.isFlowEdge);
            if (!hasIncomingFlow) {
                // Check if has any flow outputs
                const hasFlowOutputs = Array.from(node.outputs.values()).some(p => p.isFlow);
                if (hasFlowOutputs) {
                    entryPoints.push(node);
                }
            }
        }

        return entryPoints;
    }

    /**
     * Get execution order (topological sort)
     */
    public getExecutionOrder(): Node[] {
        const visited = new Set<string>();
        const order: Node[] = [];

        const visit = (nodeId: string) => {
            if (visited.has(nodeId)) {
                return;
            }

            visited.add(nodeId);

            // Visit dependencies first (nodes that feed into this one)
            const inputEdges = this.getNodeInputEdges(nodeId);
            for (const edge of inputEdges) {
                if (edge.isDataEdge) {
                    visit(edge.sourceNodeId);
                }
            }

            const node = this._nodes.get(nodeId);
            if (node) {
                order.push(node);
            }
        };

        // Start from entry points
        const entryPoints = this.getEntryPoints();
        for (const entry of entryPoints) {
            visit(entry.id);
        }

        // Visit any remaining nodes
        for (const nodeId of this._nodes.keys()) {
            visit(nodeId);
        }

        return order;
    }

    /**
     * Validate graph
     */
    public validate(): GraphValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate nodes
        for (const node of this._nodes.values()) {
            const nodeValidation = node.validate();
            if (!nodeValidation.valid) {
                errors.push(...nodeValidation.errors.map(e => `Node ${node.title}: ${e}`));
            }
        }

        // Check for disconnected nodes
        for (const node of this._nodes.values()) {
            if (node.category !== NodeCategory.EVENT) {
                const edges = this.getNodeEdges(node.id);
                if (edges.length === 0) {
                    warnings.push(`Node ${node.title} is disconnected`);
                }
            }
        }

        // Check for cycles
        for (const edge of this._edges.values()) {
            if (edge.isFlowEdge && this.wouldCreateCycle(edge)) {
                errors.push(`Cycle detected involving edge ${edge.id}`);
            }
        }

        // Check for missing entry points
        if (this.getEntryPoints().length === 0) {
            warnings.push('Graph has no entry points');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get/set graph variable
     */
    public getVariable(name: string): any {
        return this._variables.get(name);
    }

    public setVariable(name: string, value: any): void {
        this._variables.set(name, value);
    }

    public hasVariable(name: string): boolean {
        return this._variables.has(name);
    }

    public deleteVariable(name: string): boolean {
        return this._variables.delete(name);
    }

    public get variables(): ReadonlyMap<string, any> {
        return this._variables;
    }

    /**
     * Add subgraph
     */
    public addSubgraph(name: string, graph: Graph): void {
        this._subgraphs.set(name, graph);
    }

    /**
     * Get subgraph
     */
    public getSubgraph(name: string): Graph | undefined {
        return this._subgraphs.get(name);
    }

    /**
     * Clear graph
     */
    public clear(): void {
        // Disconnect all edges
        for (const edge of this._edges.values()) {
            edge.disconnect();
        }

        this._nodes.clear();
        this._edges.clear();
        this._variables.clear();
    }

    /**
     * Clone graph
     */
    public clone(): Graph {
        const clone = new Graph(this.metadata);

        // Clone nodes
        const nodeIdMap = new Map<string, string>();
        for (const node of this._nodes.values()) {
            const clonedNode = node.clone();
            nodeIdMap.set(node.id, clonedNode.id);
            clone.addNode(clonedNode);
        }

        // Clone edges
        for (const edge of this._edges.values()) {
            const sourceNode = clone.getNode(nodeIdMap.get(edge.sourceNodeId)!);
            const targetNode = clone.getNode(nodeIdMap.get(edge.targetNodeId)!);

            if (sourceNode && targetNode) {
                const sourcePort = sourceNode.getOutput(edge.sourcePort.name);
                const targetPort = targetNode.getInput(edge.targetPort.name);

                if (sourcePort && targetPort) {
                    clone.connect(sourcePort, targetPort);
                }
            }
        }

        // Clone variables
        clone._variables = new Map(this._variables);

        return clone;
    }

    /**
     * Serialize to JSON
     */
    public toJSON(): object {
        return {
            id: this.id,
            metadata: this.metadata,
            nodes: Array.from(this._nodes.values()).map(n => n.toJSON()),
            edges: Array.from(this._edges.values()).map(e => e.toJSON()),
            variables: Array.from(this._variables.entries())
        };
    }

    /**
     * Get graph statistics
     */
    public getStats(): {
        nodeCount: number;
        edgeCount: number;
        entryPoints: number;
        categories: Record<string, number>;
    } {
        const categories: Record<string, number> = {};

        for (const node of this._nodes.values()) {
            categories[node.category] = (categories[node.category] || 0) + 1;
        }

        return {
            nodeCount: this._nodes.size,
            edgeCount: this._edges.size,
            entryPoints: this.getEntryPoints().length,
            categories
        };
    }
}
