/**
 * MathNodes.ts - Math Operation Nodes
 *
 * Mathematical operations and calculations.
 */

import { Node, NodeCategory, NodeExecutionResult } from '../Node';
import { PortType } from '../Port';
import { ExecutionContext } from '../execution/ExecutionContext';

/**
 * Add - addition operation
 */
export class Add extends Node {
    constructor() {
        super({
            type: 'Math.Add',
            category: NodeCategory.MATH,
            title: 'Add',
            description: 'Add two numbers',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.NUMBER, defaultValue: 0 });
        this.addInput({ name: 'b', type: PortType.NUMBER, defaultValue: 0 });
        this.addOutput({ name: 'result', type: PortType.NUMBER });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue<number>('a', 0);
        const b = this.getInputValue<number>('b', 0);
        this.setOutputValue('result', a + b);
        return this.success();
    }
}

/**
 * Subtract - subtraction operation
 */
export class Subtract extends Node {
    constructor() {
        super({
            type: 'Math.Subtract',
            category: NodeCategory.MATH,
            title: 'Subtract',
            description: 'Subtract two numbers',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.NUMBER, defaultValue: 0 });
        this.addInput({ name: 'b', type: PortType.NUMBER, defaultValue: 0 });
        this.addOutput({ name: 'result', type: PortType.NUMBER });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue<number>('a', 0);
        const b = this.getInputValue<number>('b', 0);
        this.setOutputValue('result', a - b);
        return this.success();
    }
}

/**
 * Multiply - multiplication operation
 */
export class Multiply extends Node {
    constructor() {
        super({
            type: 'Math.Multiply',
            category: NodeCategory.MATH,
            title: 'Multiply',
            description: 'Multiply two numbers',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.NUMBER, defaultValue: 1 });
        this.addInput({ name: 'b', type: PortType.NUMBER, defaultValue: 1 });
        this.addOutput({ name: 'result', type: PortType.NUMBER });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue<number>('a', 1);
        const b = this.getInputValue<number>('b', 1);
        this.setOutputValue('result', a * b);
        return this.success();
    }
}

/**
 * Divide - division operation
 */
export class Divide extends Node {
    constructor() {
        super({
            type: 'Math.Divide',
            category: NodeCategory.MATH,
            title: 'Divide',
            description: 'Divide two numbers',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.NUMBER, defaultValue: 1 });
        this.addInput({ name: 'b', type: PortType.NUMBER, defaultValue: 1 });
        this.addOutput({ name: 'result', type: PortType.NUMBER });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue<number>('a', 1);
        const b = this.getInputValue<number>('b', 1);

        if (b === 0) {
            return this.error('Division by zero');
        }

        this.setOutputValue('result', a / b);
        return this.success();
    }
}

/**
 * Power - exponentiation
 */
export class Power extends Node {
    constructor() {
        super({
            type: 'Math.Power',
            category: NodeCategory.MATH,
            title: 'Power',
            description: 'Raise base to exponent',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'base', type: PortType.NUMBER, defaultValue: 2 });
        this.addInput({ name: 'exponent', type: PortType.NUMBER, defaultValue: 2 });
        this.addOutput({ name: 'result', type: PortType.NUMBER });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const base = this.getInputValue<number>('base', 2);
        const exponent = this.getInputValue<number>('exponent', 2);
        this.setOutputValue('result', Math.pow(base, exponent));
        return this.success();
    }
}

/**
 * Sqrt - square root
 */
export class Sqrt extends Node {
    constructor() {
        super({
            type: 'Math.Sqrt',
            category: NodeCategory.MATH,
            title: 'Square Root',
            description: 'Calculate square root',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'value', type: PortType.NUMBER, defaultValue: 4 });
        this.addOutput({ name: 'result', type: PortType.NUMBER });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const value = this.getInputValue<number>('value', 4);

        if (value < 0) {
            return this.error('Cannot calculate square root of negative number');
        }

        this.setOutputValue('result', Math.sqrt(value));
        return this.success();
    }
}

/**
 * Abs - absolute value
 */
export class Abs extends Node {
    constructor() {
        super({
            type: 'Math.Abs',
            category: NodeCategory.MATH,
            title: 'Absolute',
            description: 'Get absolute value',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'value', type: PortType.NUMBER, defaultValue: 0 });
        this.addOutput({ name: 'result', type: PortType.NUMBER });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const value = this.getInputValue<number>('value', 0);
        this.setOutputValue('result', Math.abs(value));
        return this.success();
    }
}

/**
 * Sin - sine function
 */
export class Sin extends Node {
    constructor() {
        super({
            type: 'Math.Sin',
            category: NodeCategory.MATH,
            title: 'Sin',
            description: 'Calculate sine (radians)',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'angle', type: PortType.NUMBER, defaultValue: 0 });
        this.addOutput({ name: 'result', type: PortType.NUMBER });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const angle = this.getInputValue<number>('angle', 0);
        this.setOutputValue('result', Math.sin(angle));
        return this.success();
    }
}

/**
 * Cos - cosine function
 */
export class Cos extends Node {
    constructor() {
        super({
            type: 'Math.Cos',
            category: NodeCategory.MATH,
            title: 'Cos',
            description: 'Calculate cosine (radians)',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'angle', type: PortType.NUMBER, defaultValue: 0 });
        this.addOutput({ name: 'result', type: PortType.NUMBER });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const angle = this.getInputValue<number>('angle', 0);
        this.setOutputValue('result', Math.cos(angle));
        return this.success();
    }
}

/**
 * Tan - tangent function
 */
export class Tan extends Node {
    constructor() {
        super({
            type: 'Math.Tan',
            category: NodeCategory.MATH,
            title: 'Tan',
            description: 'Calculate tangent (radians)',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'angle', type: PortType.NUMBER, defaultValue: 0 });
        this.addOutput({ name: 'result', type: PortType.NUMBER });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const angle = this.getInputValue<number>('angle', 0);
        this.setOutputValue('result', Math.tan(angle));
        return this.success();
    }
}

/**
 * Min - minimum of two values
 */
export class Min extends Node {
    constructor() {
        super({
            type: 'Math.Min',
            category: NodeCategory.MATH,
            title: 'Min',
            description: 'Get minimum of two values',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.NUMBER, defaultValue: 0 });
        this.addInput({ name: 'b', type: PortType.NUMBER, defaultValue: 0 });
        this.addOutput({ name: 'result', type: PortType.NUMBER });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue<number>('a', 0);
        const b = this.getInputValue<number>('b', 0);
        this.setOutputValue('result', Math.min(a, b));
        return this.success();
    }
}

/**
 * Max - maximum of two values
 */
export class Max extends Node {
    constructor() {
        super({
            type: 'Math.Max',
            category: NodeCategory.MATH,
            title: 'Max',
            description: 'Get maximum of two values',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.NUMBER, defaultValue: 0 });
        this.addInput({ name: 'b', type: PortType.NUMBER, defaultValue: 0 });
        this.addOutput({ name: 'result', type: PortType.NUMBER });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue<number>('a', 0);
        const b = this.getInputValue<number>('b', 0);
        this.setOutputValue('result', Math.max(a, b));
        return this.success();
    }
}

/**
 * Clamp - clamp value between min and max
 */
export class Clamp extends Node {
    constructor() {
        super({
            type: 'Math.Clamp',
            category: NodeCategory.MATH,
            title: 'Clamp',
            description: 'Clamp value between min and max',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'value', type: PortType.NUMBER, defaultValue: 0 });
        this.addInput({ name: 'min', type: PortType.NUMBER, defaultValue: 0 });
        this.addInput({ name: 'max', type: PortType.NUMBER, defaultValue: 1 });
        this.addOutput({ name: 'result', type: PortType.NUMBER });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const value = this.getInputValue<number>('value', 0);
        const min = this.getInputValue<number>('min', 0);
        const max = this.getInputValue<number>('max', 1);
        this.setOutputValue('result', Math.max(min, Math.min(max, value)));
        return this.success();
    }
}

/**
 * Lerp - linear interpolation
 */
export class Lerp extends Node {
    constructor() {
        super({
            type: 'Math.Lerp',
            category: NodeCategory.MATH,
            title: 'Lerp',
            description: 'Linear interpolation between two values',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.NUMBER, defaultValue: 0 });
        this.addInput({ name: 'b', type: PortType.NUMBER, defaultValue: 1 });
        this.addInput({ name: 't', type: PortType.NUMBER, defaultValue: 0.5, description: 'Interpolation factor (0-1)' });
        this.addOutput({ name: 'result', type: PortType.NUMBER });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue<number>('a', 0);
        const b = this.getInputValue<number>('b', 1);
        const t = this.getInputValue<number>('t', 0.5);
        this.setOutputValue('result', a + (b - a) * t);
        return this.success();
    }
}

/**
 * InverseLerp - inverse linear interpolation
 */
export class InverseLerp extends Node {
    constructor() {
        super({
            type: 'Math.InverseLerp',
            category: NodeCategory.MATH,
            title: 'Inverse Lerp',
            description: 'Get interpolation factor from value',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.NUMBER, defaultValue: 0 });
        this.addInput({ name: 'b', type: PortType.NUMBER, defaultValue: 1 });
        this.addInput({ name: 'value', type: PortType.NUMBER, defaultValue: 0.5 });
        this.addOutput({ name: 'result', type: PortType.NUMBER });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue<number>('a', 0);
        const b = this.getInputValue<number>('b', 1);
        const value = this.getInputValue<number>('value', 0.5);

        if (a === b) {
            return this.error('a and b cannot be equal');
        }

        this.setOutputValue('result', (value - a) / (b - a));
        return this.success();
    }
}

/**
 * Random - random number in range
 */
export class Random extends Node {
    constructor() {
        super({
            type: 'Math.Random',
            category: NodeCategory.MATH,
            title: 'Random',
            description: 'Generate random number in range',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'min', type: PortType.NUMBER, defaultValue: 0 });
        this.addInput({ name: 'max', type: PortType.NUMBER, defaultValue: 1 });
        this.addOutput({ name: 'result', type: PortType.NUMBER });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const min = this.getInputValue<number>('min', 0);
        const max = this.getInputValue<number>('max', 1);
        this.setOutputValue('result', min + Math.random() * (max - min));
        return this.success();
    }
}

/**
 * Vector3Add - add two Vector3s
 */
export class Vector3Add extends Node {
    constructor() {
        super({
            type: 'Math.Vector3Add',
            category: NodeCategory.MATH,
            title: 'Vector3 Add',
            description: 'Add two 3D vectors',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'a', type: PortType.VECTOR3 });
        this.addInput({ name: 'b', type: PortType.VECTOR3 });
        this.addOutput({ name: 'result', type: PortType.VECTOR3 });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const a = this.getInputValue<any>('a', { x: 0, y: 0, z: 0 });
        const b = this.getInputValue<any>('b', { x: 0, y: 0, z: 0 });
        this.setOutputValue('result', {
            x: a.x + b.x,
            y: a.y + b.y,
            z: a.z + b.z
        });
        return this.success();
    }
}

/**
 * Vector3Scale - scale Vector3 by scalar
 */
export class Vector3Scale extends Node {
    constructor() {
        super({
            type: 'Math.Vector3Scale',
            category: NodeCategory.MATH,
            title: 'Vector3 Scale',
            description: 'Scale 3D vector by scalar',
            color: '#9C27B0'
        });
    }

    protected setupPorts(): void {
        this.addInput({ name: 'vector', type: PortType.VECTOR3 });
        this.addInput({ name: 'scale', type: PortType.NUMBER, defaultValue: 1 });
        this.addOutput({ name: 'result', type: PortType.VECTOR3 });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const vector = this.getInputValue<any>('vector', { x: 0, y: 0, z: 0 });
        const scale = this.getInputValue<number>('scale', 1);
        this.setOutputValue('result', {
            x: vector.x * scale,
            y: vector.y * scale,
            z: vector.z * scale
        });
        return this.success();
    }
}
