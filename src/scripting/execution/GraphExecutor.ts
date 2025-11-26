/**
 * GraphExecutor.ts - Graph Executor
 *
 * Executes visual script graphs.
 * Handles flow control, error handling, and performance profiling.
 */

import { Graph } from '../Graph';
import { Node, NodeExecutionResult } from '../Node';
import { Edge } from '../Edge';
import { ExecutionContext, EntityRef } from './ExecutionContext';
import { FlowMachine } from './FlowMachine';

/**
 * Execution result
 */
export interface ExecutionResult {
    success: boolean;
    error?: string;
    nodesExecuted: number;
    executionTime: number;
}

/**
 * Execution options
 */
export interface ExecutionOptions {
    enableProfiling?: boolean;
    maxExecutionTime?: number;
    maxNodesPerFrame?: number;
    debugMode?: boolean;
}

/**
 * Graph executor class
 */
export class GraphExecutor {
    private _graph: Graph;
    private _context: ExecutionContext;
    private _flowMachine: FlowMachine;
    private _options: ExecutionOptions;
    private _nodesExecuted: number;
    private _executionStartTime: number;

    /**
     * Create graph executor
     */
    constructor(graph: Graph, entity: EntityRef | null = null, options: ExecutionOptions = {}) {
        this._graph = graph;
        this._context = new ExecutionContext(graph.id, entity, 0.016, new Map(graph.variables));
        this._flowMachine = new FlowMachine();
        this._options = {
            enableProfiling: options.enableProfiling ?? false,
            maxExecutionTime: options.maxExecutionTime ?? 100, // 100ms max
            maxNodesPerFrame: options.maxNodesPerFrame ?? 1000,
            debugMode: options.debugMode ?? false
        };
        this._nodesExecuted = 0;
        this._executionStartTime = 0;

        if (this._options.enableProfiling) {
            this._context.enableProfiling();
        }
    }

    /**
     * Execute graph from entry points
     */
    public async execute(deltaTime: number = 0.016): Promise<ExecutionResult> {
        this._executionStartTime = performance.now();
        this._nodesExecuted = 0;

        // Update context delta time
        (this._context as any).deltaTime = deltaTime;

        // Reset flow machine frame
        this._flowMachine.resetFrame();

        try {
            // Get entry points
            const entryPoints = this._graph.getEntryPoints();

            if (entryPoints.length === 0) {
                return {
                    success: true,
                    nodesExecuted: 0,
                    executionTime: this.getElapsedTime()
                };
            }

            // Start flows from entry points
            for (const node of entryPoints) {
                this._flowMachine.startFlow(node.id);
            }

            // Process flows
            await this.processFlows();

            // Process async continuations
            this._flowMachine.processAsyncContinuations();

            return {
                success: true,
                nodesExecuted: this._nodesExecuted,
                executionTime: this.getElapsedTime()
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                nodesExecuted: this._nodesExecuted,
                executionTime: this.getElapsedTime()
            };
        }
    }

    /**
     * Process flow queue
     */
    private async processFlows(): Promise<void> {
        while (this._flowMachine.hasPendingFlows()) {
            // Check execution time limit
            if (this.getElapsedTime() > this._options.maxExecutionTime!) {
                throw new Error(`Execution exceeded maximum time (${this._options.maxExecutionTime}ms)`);
            }

            // Check node count limit
            if (this._nodesExecuted >= this._options.maxNodesPerFrame!) {
                throw new Error(`Execution exceeded maximum nodes per frame (${this._options.maxNodesPerFrame})`);
            }

            // Get next flow
            const flow = this._flowMachine.getNextFlow();
            if (!flow) {
                break; // Safety limit reached
            }

            // Execute node
            await this.executeNode(flow.nodeId, flow.outputPort);
        }
    }

    /**
     * Execute single node
     */
    private async executeNode(nodeId: string, fromOutputPort?: string): Promise<void> {
        const node = this._graph.getNode(nodeId);
        if (!node) {
            throw new Error(`Node ${nodeId} not found in graph`);
        }

        // Check if node is enabled
        if (!node.enabled) {
            this._flowMachine.completeFlow(nodeId);
            return;
        }

        // Check for breakpoint
        if (node.hasBreakpoint && this._options.debugMode) {
            this._context.pause();
            return;
        }

        // Push to execution stack
        this._context.pushNode(nodeId);

        // Transfer input data
        this.transferInputData(node);

        // Profile node execution
        const profileStart = this._context.startNodeProfile(nodeId);

        try {
            // Execute node
            const result = await node.execute(this._context);

            // Profile end
            this._context.endNodeProfile(nodeId, profileStart);

            this._nodesExecuted++;

            if (!result.success) {
                throw new Error(`Node ${node.title} execution failed: ${result.error}`);
            }

            // Transfer output data
            this.transferOutputData(node);

            // Continue flow
            if (result.outputFlowPort) {
                await this.continueFlow(node, result.outputFlowPort);
            }

        } catch (error) {
            this._context.endNodeProfile(nodeId, profileStart);
            throw error;
        } finally {
            this._context.popNode();
            this._flowMachine.completeFlow(nodeId);
        }
    }

    /**
     * Transfer input data to node
     */
    private transferInputData(node: Node): void {
        const inputEdges = this._graph.getNodeInputEdges(node.id);

        for (const edge of inputEdges) {
            if (edge.isDataEdge) {
                edge.transferData();
            }
        }
    }

    /**
     * Transfer output data from node
     */
    private transferOutputData(node: Node): void {
        const outputEdges = this._graph.getNodeOutputEdges(node.id);

        for (const edge of outputEdges) {
            if (edge.isDataEdge) {
                edge.transferData();
            }
        }
    }

    /**
     * Continue flow to next nodes
     */
    private async continueFlow(node: Node, outputPortName: string): Promise<void> {
        const outputPort = node.getOutput(outputPortName);
        if (!outputPort || !outputPort.isFlow) {
            return;
        }

        // Find connected flow edges
        const outputEdges = this._graph.getNodeOutputEdges(node.id);
        const flowEdges = outputEdges.filter(e =>
            e.isFlowEdge &&
            e.sourcePort.name === outputPortName
        );

        // Queue next nodes
        for (const edge of flowEdges) {
            this._flowMachine.startFlow(edge.targetNodeId);
        }
    }

    /**
     * Execute from specific node (for debugging)
     */
    public async executeFromNode(nodeId: string): Promise<ExecutionResult> {
        this._executionStartTime = performance.now();
        this._nodesExecuted = 0;

        try {
            this._flowMachine.startFlow(nodeId);
            await this.processFlows();

            return {
                success: true,
                nodesExecuted: this._nodesExecuted,
                executionTime: this.getElapsedTime()
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                nodesExecuted: this._nodesExecuted,
                executionTime: this.getElapsedTime()
            };
        }
    }

    /**
     * Get execution context
     */
    public get context(): ExecutionContext {
        return this._context;
    }

    /**
     * Get flow machine
     */
    public get flowMachine(): FlowMachine {
        return this._flowMachine;
    }

    /**
     * Get elapsed execution time
     */
    private getElapsedTime(): number {
        return performance.now() - this._executionStartTime;
    }

    /**
     * Get profile data
     */
    public getProfileData(): Map<string, { count: number; totalTime: number; avgTime: number }> {
        return this._context.getProfileData();
    }

    /**
     * Reset executor
     */
    public reset(): void {
        this._context.clear();
        this._flowMachine.clear();
        this._nodesExecuted = 0;
    }

    /**
     * Update graph reference (for hot reload)
     */
    public updateGraph(graph: Graph): void {
        this._graph = graph;
        this.reset();
    }

    /**
     * Get execution statistics
     */
    public getStats(): object {
        return {
            nodesExecuted: this._nodesExecuted,
            executionTime: this.getElapsedTime(),
            activeFlows: this._flowMachine.activeFlowCount,
            contextSnapshot: this._context.getSnapshot(),
            flowSnapshot: this._flowMachine.getSnapshot()
        };
    }
}
