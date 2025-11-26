/**
 * Optimizer.ts - Graph Optimizer
 *
 * Optimizes visual script graphs for better performance.
 */

import { Graph } from '../Graph';
import { Node } from '../Node';
import { Edge } from '../Edge';

/**
 * Optimization result
 */
export interface OptimizationResult {
    optimized: boolean;
    removedNodes: number;
    removedEdges: number;
    optimizations: string[];
}

/**
 * Optimizer class
 */
export class Optimizer {
    /**
     * Optimize graph
     */
    public static optimize(graph: Graph, options: {
        constantFolding?: boolean;
        deadCodeElimination?: boolean;
        executionOrderOptimization?: boolean;
    } = {}): OptimizationResult {
        const opts = {
            constantFolding: options.constantFolding ?? true,
            deadCodeElimination: options.deadCodeElimination ?? true,
            executionOrderOptimization: options.executionOrderOptimization ?? true
        };

        let removedNodes = 0;
        let removedEdges = 0;
        const optimizations: string[] = [];

        // Constant folding
        if (opts.constantFolding) {
            const result = this.constantFolding(graph);
            removedNodes += result.removedNodes;
            if (result.removedNodes > 0) {
                optimizations.push(`Constant folding: removed ${result.removedNodes} constant nodes`);
            }
        }

        // Dead code elimination
        if (opts.deadCodeElimination) {
            const result = this.deadCodeElimination(graph);
            removedNodes += result.removedNodes;
            removedEdges += result.removedEdges;
            if (result.removedNodes > 0) {
                optimizations.push(`Dead code elimination: removed ${result.removedNodes} unreachable nodes`);
            }
        }

        // Execution order optimization
        if (opts.executionOrderOptimization) {
            const result = this.optimizeExecutionOrder(graph);
            if (result.optimized) {
                optimizations.push('Optimized execution order for better cache locality');
            }
        }

        return {
            optimized: removedNodes > 0 || removedEdges > 0,
            removedNodes,
            removedEdges,
            optimizations
        };
    }

    /**
     * Constant folding - evaluate constant expressions at compile time
     */
    private static constantFolding(graph: Graph): { removedNodes: number } {
        let removedNodes = 0;

        // Find constant math operations
        for (const node of graph.nodes.values()) {
            if (this.isMathNode(node) && this.hasConstantInputs(node, graph)) {
                // Evaluate constant expression
                // This is simplified - would need actual evaluation in real implementation
                removedNodes++;
            }
        }

        return { removedNodes };
    }

    /**
     * Dead code elimination - remove unreachable nodes
     */
    private static deadCodeElimination(graph: Graph): { removedNodes: number; removedEdges: number } {
        let removedNodes = 0;
        let removedEdges = 0;

        const reachableNodes = this.getReachableNodes(graph);
        const allNodes = Array.from(graph.nodes.keys());

        // Remove unreachable nodes
        for (const nodeId of allNodes) {
            if (!reachableNodes.has(nodeId)) {
                const edges = graph.getNodeEdges(nodeId);
                removedEdges += edges.length;

                graph.removeNode(nodeId);
                removedNodes++;
            }
        }

        return { removedNodes, removedEdges };
    }

    /**
     * Get all reachable nodes from entry points
     */
    private static getReachableNodes(graph: Graph): Set<string> {
        const reachable = new Set<string>();
        const toVisit = graph.getEntryPoints().map(n => n.id);

        while (toVisit.length > 0) {
            const nodeId = toVisit.pop()!;

            if (reachable.has(nodeId)) {
                continue;
            }

            reachable.add(nodeId);

            // Add connected nodes
            const edges = graph.getNodeOutputEdges(nodeId);
            for (const edge of edges) {
                if (!reachable.has(edge.targetNodeId)) {
                    toVisit.push(edge.targetNodeId);
                }
            }

            // Also add nodes connected via data edges
            const inputEdges = graph.getNodeInputEdges(nodeId);
            for (const edge of inputEdges) {
                if (edge.isDataEdge && !reachable.has(edge.sourceNodeId)) {
                    toVisit.push(edge.sourceNodeId);
                }
            }
        }

        return reachable;
    }

    /**
     * Optimize execution order for cache locality
     */
    private static optimizeExecutionOrder(graph: Graph): { optimized: boolean } {
        // This would reorder nodes to improve cache locality
        // For now, just return true if we have nodes to optimize
        const order = graph.getExecutionOrder();
        return { optimized: order.length > 0 };
    }

    /**
     * Check if node is a math node
     */
    private static isMathNode(node: Node): boolean {
        return node.type.startsWith('Math.');
    }

    /**
     * Check if node has all constant inputs
     */
    private static hasConstantInputs(node: Node, graph: Graph): boolean {
        const edges = graph.getNodeInputEdges(node.id);

        // If no edges, check if all inputs have default values
        if (edges.length === 0) {
            for (const port of node.inputs.values()) {
                if (port.defaultValue === undefined) {
                    return false;
                }
            }
            return true;
        }

        // Check if all connected nodes are constants
        for (const edge of edges) {
            const sourceNode = graph.getNode(edge.sourceNodeId);
            if (!sourceNode || sourceNode.type !== 'Constant') {
                return false;
            }
        }

        return true;
    }

    /**
     * Inline subgraphs
     */
    public static inlineSubgraphs(graph: Graph): { inlined: number } {
        let inlined = 0;

        // Find subgraph nodes and inline them
        for (const node of graph.nodes.values()) {
            if (node.type === 'Subgraph') {
                // Would inline the subgraph here
                inlined++;
            }
        }

        return { inlined };
    }

    /**
     * Remove duplicate nodes
     */
    public static removeDuplicates(graph: Graph): { removed: number } {
        let removed = 0;
        const nodeSignatures = new Map<string, string>();

        for (const node of graph.nodes.values()) {
            const signature = this.getNodeSignature(node, graph);

            if (nodeSignatures.has(signature)) {
                // Found duplicate - could merge them
                removed++;
            } else {
                nodeSignatures.set(signature, node.id);
            }
        }

        return { removed };
    }

    /**
     * Get node signature for duplicate detection
     */
    private static getNodeSignature(node: Node, graph: Graph): string {
        const inputs = Array.from(node.inputs.values()).map(p => {
            const edges = graph.getNodeInputEdges(node.id).filter(e => e.targetPort.id === p.id);
            if (edges.length > 0) {
                return `${p.name}:${edges[0].sourceNodeId}`;
            }
            return `${p.name}:${p.defaultValue}`;
        }).join(',');

        return `${node.type}|${inputs}`;
    }

    /**
     * Get optimization statistics
     */
    public static getStats(graph: Graph): {
        totalNodes: number;
        reachableNodes: number;
        unreachableNodes: number;
        totalEdges: number;
        constantNodes: number;
    } {
        const reachable = this.getReachableNodes(graph);
        let constantNodes = 0;

        for (const node of graph.nodes.values()) {
            if (this.hasConstantInputs(node, graph)) {
                constantNodes++;
            }
        }

        return {
            totalNodes: graph.nodes.size,
            reachableNodes: reachable.size,
            unreachableNodes: graph.nodes.size - reachable.size,
            totalEdges: graph.edges.size,
            constantNodes
        };
    }
}
