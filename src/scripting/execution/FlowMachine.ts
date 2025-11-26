/**
 * FlowMachine.ts - Flow State Machine
 *
 * Manages flow control execution state.
 * Handles branches, loops, and async continuations.
 */

import { Node } from '../Node';
import { Edge } from '../Edge';
import { Port } from '../Port';

/**
 * Flow state
 */
interface FlowState {
    nodeId: string;
    outputPort?: string;
    iterationCount?: number;
    maxIterations?: number;
    continueCallback?: () => Promise<void>;
}

/**
 * Loop state
 */
interface LoopState {
    nodeId: string;
    index: number;
    count: number;
    continuePort: string;
    exitPort: string;
}

/**
 * Async continuation
 */
interface AsyncContinuation {
    nodeId: string;
    outputPort: string;
    timestamp: number;
}

/**
 * Flow machine class
 */
export class FlowMachine {
    private _activeFlows: Set<string>;
    private _flowQueue: FlowState[];
    private _loopStates: Map<string, LoopState>;
    private _asyncContinuations: AsyncContinuation[];
    private _maxFlowsPerFrame: number;
    private _flowsExecutedThisFrame: number;

    /**
     * Create flow machine
     */
    constructor() {
        this._activeFlows = new Set();
        this._flowQueue = [];
        this._loopStates = new Map();
        this._asyncContinuations = [];
        this._maxFlowsPerFrame = 1000;
        this._flowsExecutedThisFrame = 0;
    }

    /**
     * Start flow from node
     */
    public startFlow(nodeId: string, outputPort?: string): void {
        this._flowQueue.push({
            nodeId,
            outputPort
        });
        this._activeFlows.add(nodeId);
    }

    /**
     * Get next flow to execute
     */
    public getNextFlow(): FlowState | null {
        if (this._flowsExecutedThisFrame >= this._maxFlowsPerFrame) {
            return null; // Prevent infinite loops
        }

        const flow = this._flowQueue.shift();
        if (flow) {
            this._flowsExecutedThisFrame++;
        }
        return flow || null;
    }

    /**
     * Check if has pending flows
     */
    public hasPendingFlows(): boolean {
        return this._flowQueue.length > 0;
    }

    /**
     * Get active flow count
     */
    public get activeFlowCount(): number {
        return this._activeFlows.size;
    }

    /**
     * Complete flow from node
     */
    public completeFlow(nodeId: string): void {
        this._activeFlows.delete(nodeId);
    }

    /**
     * Check if node is in active flow
     */
    public isActiveFlow(nodeId: string): boolean {
        return this._activeFlows.has(nodeId);
    }

    /**
     * Start loop
     */
    public startLoop(nodeId: string, count: number, continuePort: string, exitPort: string): void {
        this._loopStates.set(nodeId, {
            nodeId,
            index: 0,
            count,
            continuePort,
            exitPort
        });
    }

    /**
     * Continue loop iteration
     */
    public continueLoop(nodeId: string): { shouldContinue: boolean; index: number; outputPort: string } {
        const state = this._loopStates.get(nodeId);
        if (!state) {
            throw new Error(`No loop state found for node ${nodeId}`);
        }

        state.index++;

        const shouldContinue = state.index < state.count;
        const outputPort = shouldContinue ? state.continuePort : state.exitPort;

        if (!shouldContinue) {
            this._loopStates.delete(nodeId);
        }

        return {
            shouldContinue,
            index: state.index - 1,
            outputPort
        };
    }

    /**
     * Get loop state
     */
    public getLoopState(nodeId: string): LoopState | undefined {
        return this._loopStates.get(nodeId);
    }

    /**
     * Exit loop early
     */
    public exitLoop(nodeId: string): void {
        this._loopStates.delete(nodeId);
    }

    /**
     * Schedule async continuation
     */
    public scheduleAsync(nodeId: string, outputPort: string, delayMs: number = 0): void {
        this._asyncContinuations.push({
            nodeId,
            outputPort,
            timestamp: Date.now() + delayMs
        });
    }

    /**
     * Process async continuations
     */
    public processAsyncContinuations(): void {
        const now = Date.now();
        const ready: AsyncContinuation[] = [];

        // Find ready continuations
        this._asyncContinuations = this._asyncContinuations.filter(cont => {
            if (cont.timestamp <= now) {
                ready.push(cont);
                return false;
            }
            return true;
        });

        // Start flows for ready continuations
        for (const cont of ready) {
            this.startFlow(cont.nodeId, cont.outputPort);
        }
    }

    /**
     * Check if has pending async continuations
     */
    public hasPendingAsync(): boolean {
        return this._asyncContinuations.length > 0;
    }

    /**
     * Branch to output port
     */
    public branch(nodeId: string, outputPort: string): void {
        this.startFlow(nodeId, outputPort);
    }

    /**
     * Reset frame counters
     */
    public resetFrame(): void {
        this._flowsExecutedThisFrame = 0;
    }

    /**
     * Set max flows per frame
     */
    public setMaxFlowsPerFrame(max: number): void {
        this._maxFlowsPerFrame = max;
    }

    /**
     * Clear all state
     */
    public clear(): void {
        this._activeFlows.clear();
        this._flowQueue = [];
        this._loopStates.clear();
        this._asyncContinuations = [];
        this._flowsExecutedThisFrame = 0;
    }

    /**
     * Get state snapshot
     */
    public getSnapshot(): object {
        return {
            activeFlows: Array.from(this._activeFlows),
            flowQueueSize: this._flowQueue.length,
            loopStates: Array.from(this._loopStates.entries()),
            asyncContinuations: this._asyncContinuations.length,
            flowsExecutedThisFrame: this._flowsExecutedThisFrame
        };
    }

    /**
     * Validate flow state
     */
    public validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Check for stuck loops
        for (const [nodeId, state] of this._loopStates) {
            if (state.index > state.count * 10) {
                errors.push(`Loop at node ${nodeId} appears to be stuck (index: ${state.index})`);
            }
        }

        // Check for too many active flows
        if (this._activeFlows.size > 100) {
            errors.push(`Too many active flows: ${this._activeFlows.size}`);
        }

        // Check for too many queued flows
        if (this._flowQueue.length > 100) {
            errors.push(`Too many queued flows: ${this._flowQueue.length}`);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}
