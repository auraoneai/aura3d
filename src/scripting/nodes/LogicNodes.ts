/**
 * LogicNodes.ts - Logic Operation Nodes
 *
 * Boolean logic and comparison operations.
 */

import { Node, NodeCategory, NodeExecutionResult } from '../Node';
import { PortType } from '../Port';
import { ExecutionContext } from '../execution/ExecutionContext';

/**
 * AND - logical AND operation
 */
export class AND extends Node {
    constructor() {
        super({
            type: 'Logic.AND',
            category: NodeCategory.LOGIC,
            title: 'AND',
            description: 'Logical AND operation',
            color: '#FF9800'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.BOOLEAN, defaultValue: false });
        this.addInput({ name: 'b', type: PortType.BOOLEAN, defaultValue: false });
        this.addOutput({ name: 'result', type: PortType.BOOLEAN });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue<boolean>('a', false);
        const b = this.getInputValue<boolean>('b', false);
        this.setOutputValue('result', a && b);
        return this.success();
    }
}

/**
 * OR - logical OR operation
 */
export class OR extends Node {
    constructor() {
        super({
            type: 'Logic.OR',
            category: NodeCategory.LOGIC,
            title: 'OR',
            description: 'Logical OR operation',
            color: '#FF9800'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.BOOLEAN, defaultValue: false });
        this.addInput({ name: 'b', type: PortType.BOOLEAN, defaultValue: false });
        this.addOutput({ name: 'result', type: PortType.BOOLEAN });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue<boolean>('a', false);
        const b = this.getInputValue<boolean>('b', false);
        this.setOutputValue('result', a || b);
        return this.success();
    }
}

/**
 * NOT - logical NOT operation
 */
export class NOT extends Node {
    constructor() {
        super({
            type: 'Logic.NOT',
            category: NodeCategory.LOGIC,
            title: 'NOT',
            description: 'Logical NOT operation',
            color: '#FF9800'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'value', type: PortType.BOOLEAN, defaultValue: false });
        this.addOutput({ name: 'result', type: PortType.BOOLEAN });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const value = this.getInputValue<boolean>('value', false);
        this.setOutputValue('result', !value);
        return this.success();
    }
}

/**
 * XOR - logical XOR operation
 */
export class XOR extends Node {
    constructor() {
        super({
            type: 'Logic.XOR',
            category: NodeCategory.LOGIC,
            title: 'XOR',
            description: 'Logical XOR operation',
            color: '#FF9800'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.BOOLEAN, defaultValue: false });
        this.addInput({ name: 'b', type: PortType.BOOLEAN, defaultValue: false });
        this.addOutput({ name: 'result', type: PortType.BOOLEAN });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue<boolean>('a', false);
        const b = this.getInputValue<boolean>('b', false);
        this.setOutputValue('result', (a || b) && !(a && b));
        return this.success();
    }
}

/**
 * Equal - equality comparison
 */
export class Equal extends Node {
    constructor() {
        super({
            type: 'Logic.Equal',
            category: NodeCategory.LOGIC,
            title: 'Equal',
            description: 'Check if two values are equal',
            color: '#FF9800'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.ANY });
        this.addInput({ name: 'b', type: PortType.ANY });
        this.addOutput({ name: 'result', type: PortType.BOOLEAN });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue('a');
        const b = this.getInputValue('b');
        this.setOutputValue('result', a === b);
        return this.success();
    }
}

/**
 * NotEqual - inequality comparison
 */
export class NotEqual extends Node {
    constructor() {
        super({
            type: 'Logic.NotEqual',
            category: NodeCategory.LOGIC,
            title: 'Not Equal',
            description: 'Check if two values are not equal',
            color: '#FF9800'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.ANY });
        this.addInput({ name: 'b', type: PortType.ANY });
        this.addOutput({ name: 'result', type: PortType.BOOLEAN });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue('a');
        const b = this.getInputValue('b');
        this.setOutputValue('result', a !== b);
        return this.success();
    }
}

/**
 * Greater - greater than comparison
 */
export class Greater extends Node {
    constructor() {
        super({
            type: 'Logic.Greater',
            category: NodeCategory.LOGIC,
            title: 'Greater',
            description: 'Check if a > b',
            color: '#FF9800'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.NUMBER, defaultValue: 0 });
        this.addInput({ name: 'b', type: PortType.NUMBER, defaultValue: 0 });
        this.addOutput({ name: 'result', type: PortType.BOOLEAN });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue<number>('a', 0);
        const b = this.getInputValue<number>('b', 0);
        this.setOutputValue('result', a > b);
        return this.success();
    }
}

/**
 * Less - less than comparison
 */
export class Less extends Node {
    constructor() {
        super({
            type: 'Logic.Less',
            category: NodeCategory.LOGIC,
            title: 'Less',
            description: 'Check if a < b',
            color: '#FF9800'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.NUMBER, defaultValue: 0 });
        this.addInput({ name: 'b', type: PortType.NUMBER, defaultValue: 0 });
        this.addOutput({ name: 'result', type: PortType.BOOLEAN });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue<number>('a', 0);
        const b = this.getInputValue<number>('b', 0);
        this.setOutputValue('result', a < b);
        return this.success();
    }
}

/**
 * GreaterEqual - greater than or equal comparison
 */
export class GreaterEqual extends Node {
    constructor() {
        super({
            type: 'Logic.GreaterEqual',
            category: NodeCategory.LOGIC,
            title: 'Greater or Equal',
            description: 'Check if a >= b',
            color: '#FF9800'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.NUMBER, defaultValue: 0 });
        this.addInput({ name: 'b', type: PortType.NUMBER, defaultValue: 0 });
        this.addOutput({ name: 'result', type: PortType.BOOLEAN });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue<number>('a', 0);
        const b = this.getInputValue<number>('b', 0);
        this.setOutputValue('result', a >= b);
        return this.success();
    }
}

/**
 * LessEqual - less than or equal comparison
 */
export class LessEqual extends Node {
    constructor() {
        super({
            type: 'Logic.LessEqual',
            category: NodeCategory.LOGIC,
            title: 'Less or Equal',
            description: 'Check if a <= b',
            color: '#FF9800'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.NUMBER, defaultValue: 0 });
        this.addInput({ name: 'b', type: PortType.NUMBER, defaultValue: 0 });
        this.addOutput({ name: 'result', type: PortType.BOOLEAN });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue<number>('a', 0);
        const b = this.getInputValue<number>('b', 0);
        this.setOutputValue('result', a <= b);
        return this.success();
    }
}

/**
 * IsNull - check if value is null/undefined
 */
export class IsNull extends Node {
    constructor() {
        super({
            type: 'Logic.IsNull',
            category: NodeCategory.LOGIC,
            title: 'Is Null',
            description: 'Check if value is null or undefined',
            color: '#FF9800'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'value', type: PortType.ANY, optional: true });
        this.addOutput({ name: 'result', type: PortType.BOOLEAN });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const value = this.getInputValue('value');
        this.setOutputValue('result', value === null || value === undefined);
        return this.success();
    }
}

/**
 * IsValid - check if value is not null/undefined
 */
export class IsValid extends Node {
    constructor() {
        super({
            type: 'Logic.IsValid',
            category: NodeCategory.LOGIC,
            title: 'Is Valid',
            description: 'Check if value is not null or undefined',
            color: '#FF9800'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'value', type: PortType.ANY, optional: true });
        this.addOutput({ name: 'result', type: PortType.BOOLEAN });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const value = this.getInputValue('value');
        this.setOutputValue('result', value !== null && value !== undefined);
        return this.success();
    }
}

/**
 * Select - ternary select operation
 */
export class Select extends Node {
    constructor() {
        super({
            type: 'Logic.Select',
            category: NodeCategory.LOGIC,
            title: 'Select',
            description: 'Select value based on condition (ternary)',
            color: '#FF9800'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'condition', type: PortType.BOOLEAN, defaultValue: false });
        this.addInput({ name: 'ifTrue', type: PortType.ANY });
        this.addInput({ name: 'ifFalse', type: PortType.ANY });
        this.addOutput({ name: 'result', type: PortType.ANY });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const condition = this.getInputValue<boolean>('condition', false);
        const ifTrue = this.getInputValue('ifTrue');
        const ifFalse = this.getInputValue('ifFalse');
        this.setOutputValue('result', condition ? ifTrue : ifFalse);
        return this.success();
    }
}
