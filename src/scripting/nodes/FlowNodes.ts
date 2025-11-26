/**
 * FlowNodes.ts - Flow Control Nodes
 *
 * Nodes for controlling execution flow.
 */

import { Node, NodeCategory, NodeExecutionResult } from '../Node';
import { PortType } from '../Port';
import { ExecutionContext } from '../execution/ExecutionContext';

/**
 * Branch - conditional execution (if/else)
 */
export class Branch extends Node {
    constructor() {
        super({
            type: 'Flow.Branch',
            category: NodeCategory.FLOW,
            title: 'Branch',
            description: 'Execute different paths based on condition',
            color: '#2196F3'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'condition',
            type: PortType.BOOLEAN,
            description: 'Condition to evaluate'
        });
        this.addFlowOutput('true');
        this.addFlowOutput('false');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const condition = this.getInputValue<boolean>('condition', false);
        return this.success(condition ? 'true' : 'false');
    }
}

/**
 * Switch - multi-way branch
 */
export class Switch extends Node {
    private _caseCount: number;

    constructor(caseCount: number = 3) {
        super({
            type: 'Flow.Switch',
            category: NodeCategory.FLOW,
            title: 'Switch',
            description: 'Execute different paths based on integer value',
            color: '#2196F3'
        });
        this._caseCount = caseCount;
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'value',
            type: PortType.NUMBER,
            description: 'Value to switch on'
        });

        for (let i = 0; i < this._caseCount; i++) {
            this.addFlowOutput(`case${i}`);
        }
        this.addFlowOutput('default');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const value = Math.floor(this.getInputValue<number>('value', 0));

        if (value >= 0 && value < this._caseCount) {
            return this.success(`case${value}`);
        }

        return this.success('default');
    }
}

/**
 * ForLoop - iterate a fixed number of times
 */
export class ForLoop extends Node {
    constructor() {
        super({
            type: 'Flow.ForLoop',
            category: NodeCategory.FLOW,
            title: 'For Loop',
            description: 'Execute loop body a fixed number of times',
            color: '#2196F3'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'startIndex',
            type: PortType.NUMBER,
            description: 'Starting index',
            defaultValue: 0
        });
        this.addInput({
            name: 'endIndex',
            type: PortType.NUMBER,
            description: 'Ending index (exclusive)',
            defaultValue: 10
        });
        this.addFlowOutput('body');
        this.addFlowOutput('completed');
        this.addOutput({
            name: 'index',
            type: PortType.NUMBER,
            description: 'Current loop index'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const startIndex = this.getInputValue<number>('startIndex', 0);
        const endIndex = this.getInputValue<number>('endIndex', 10);
        const count = Math.max(0, endIndex - startIndex);

        // Check if this is first execution or continuation
        const loopState = context.getLocal(`loop_${this.id}`);

        if (!loopState) {
            // First execution - initialize loop
            context.setLocal(`loop_${this.id}`, {
                current: startIndex,
                end: endIndex
            });
            this.setOutputValue('index', startIndex);
            return this.success('body');
        } else {
            // Continuation - increment and check
            loopState.current++;

            if (loopState.current < loopState.end) {
                this.setOutputValue('index', loopState.current);
                return this.success('body');
            } else {
                // Loop complete
                context.setLocal(`loop_${this.id}`, null);
                return this.success('completed');
            }
        }
    }
}

/**
 * WhileLoop - iterate while condition is true
 */
export class WhileLoop extends Node {
    constructor() {
        super({
            type: 'Flow.WhileLoop',
            category: NodeCategory.FLOW,
            title: 'While Loop',
            description: 'Execute loop body while condition is true',
            color: '#2196F3'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'condition',
            type: PortType.BOOLEAN,
            description: 'Loop condition'
        });
        this.addFlowOutput('body');
        this.addFlowOutput('completed');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const condition = this.getInputValue<boolean>('condition', false);

        if (condition) {
            // Check for infinite loop protection
            const iterations = (this.getState<number>('iterations') || 0) + 1;
            this.setState('iterations', iterations);

            if (iterations > 10000) {
                this.setState('iterations', 0);
                return this.error('While loop exceeded 10000 iterations');
            }

            return this.success('body');
        } else {
            this.setState('iterations', 0);
            return this.success('completed');
        }
    }
}

/**
 * Delay - wait for specified time
 */
export class Delay extends Node {
    constructor() {
        super({
            type: 'Flow.Delay',
            category: NodeCategory.FLOW,
            title: 'Delay',
            description: 'Wait for specified duration before continuing',
            color: '#2196F3'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'duration',
            type: PortType.NUMBER,
            description: 'Delay duration in seconds',
            defaultValue: 1.0
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const duration = this.getInputValue<number>('duration', 1.0);
        const delayMs = duration * 1000;

        // Schedule async continuation
        await new Promise(resolve => setTimeout(resolve, delayMs));

        return this.success('out');
    }
}

/**
 * Sequence - execute outputs in order
 */
export class Sequence extends Node {
    private _outputCount: number;

    constructor(outputCount: number = 3) {
        super({
            type: 'Flow.Sequence',
            category: NodeCategory.FLOW,
            title: 'Sequence',
            description: 'Execute multiple outputs in sequence',
            color: '#2196F3'
        });
        this._outputCount = outputCount;
    }

    protected setupPorts(): void {
        this.addFlowInput('in');

        for (let i = 0; i < this._outputCount; i++) {
            this.addFlowOutput(`out${i}`);
        }
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        // Execute first output, rest will be queued
        return this.success('out0');
    }
}

/**
 * DoOnce - execute only once until reset
 */
export class DoOnce extends Node {
    constructor() {
        super({
            type: 'Flow.DoOnce',
            category: NodeCategory.FLOW,
            title: 'Do Once',
            description: 'Execute only once until explicitly reset',
            color: '#2196F3'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addFlowInput('reset');
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const hasExecuted = this.getState<boolean>('hasExecuted') || false;

        // Check if this is a reset
        // In a real implementation, we'd check which input triggered
        const isReset = false; // Simplified

        if (isReset) {
            this.setState('hasExecuted', false);
            return this.success();
        }

        if (!hasExecuted) {
            this.setState('hasExecuted', true);
            return this.success('out');
        }

        return this.success();
    }
}

/**
 * Gate - allow or block execution flow
 */
export class Gate extends Node {
    constructor() {
        super({
            type: 'Flow.Gate',
            category: NodeCategory.FLOW,
            title: 'Gate',
            description: 'Allow or block execution flow',
            color: '#2196F3'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addFlowInput('open');
        this.addFlowInput('close');
        this.addFlowInput('toggle');
        this.addInput({
            name: 'startClosed',
            type: PortType.BOOLEAN,
            description: 'Start in closed state',
            defaultValue: false
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        let isOpen = this.getState<boolean>('isOpen');

        if (isOpen === undefined) {
            isOpen = !this.getInputValue<boolean>('startClosed', false);
            this.setState('isOpen', isOpen);
        }

        // Handle control inputs (simplified - would need input detection in real impl)
        // For now, just check the gate state

        if (isOpen) {
            return this.success('out');
        }

        return this.success();
    }
}

/**
 * FlipFlop - toggle between two outputs
 */
export class FlipFlop extends Node {
    constructor() {
        super({
            type: 'Flow.FlipFlop',
            category: NodeCategory.FLOW,
            title: 'Flip Flop',
            description: 'Alternate between two outputs on each execution',
            color: '#2196F3'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addFlowOutput('a');
        this.addFlowOutput('b');
        this.addOutput({
            name: 'isA',
            type: PortType.BOOLEAN,
            description: 'True if output A was triggered'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const isA = this.getState<boolean>('isA') ?? true;
        const nextIsA = !isA;

        this.setState('isA', nextIsA);
        this.setOutputValue('isA', nextIsA);

        return this.success(nextIsA ? 'a' : 'b');
    }
}
