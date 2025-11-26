/**
 * VariableNodes.ts - Variable Nodes
 *
 * Get and set variables in the graph context.
 */

import { Node, NodeCategory, NodeExecutionResult } from '../Node';
import { PortType } from '../Port';
import { ExecutionContext } from '../execution/ExecutionContext';

/**
 * GetVariable - get variable value
 */
export class GetVariable extends Node {
    private _variableName: string;

    constructor(variableName: string = 'myVariable') {
        super({
            type: 'Variable.Get',
            category: NodeCategory.VARIABLE,
            title: `Get ${variableName}`,
            description: `Get value of ${variableName}`,
            color: '#F44336'
        });
        this._variableName = variableName;
    }

    protected setupPorts(): void {
        this.addOutput({
            name: 'value',
            type: PortType.ANY,
            description: 'Variable value'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const value = context.getVariable(this._variableName);
        this.setOutputValue('value', value);
        return this.success();
    }

    public get variableName(): string {
        return this._variableName;
    }
}

/**
 * SetVariable - set variable value
 */
export class SetVariable extends Node {
    private _variableName: string;

    constructor(variableName: string = 'myVariable') {
        super({
            type: 'Variable.Set',
            category: NodeCategory.VARIABLE,
            title: `Set ${variableName}`,
            description: `Set value of ${variableName}`,
            color: '#F44336'
        });
        this._variableName = variableName;
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'value',
            type: PortType.ANY,
            description: 'Value to set'
        });
        this.addFlowOutput('out');
        this.addOutput({
            name: 'value',
            type: PortType.ANY,
            description: 'The value that was set'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const value = this.getInputValue('value');
        context.setVariable(this._variableName, value);
        this.setOutputValue('value', value);
        return this.success('out');
    }

    public get variableName(): string {
        return this._variableName;
    }
}

/**
 * GetLocalVariable - get local (graph-scoped) variable
 */
export class GetLocalVariable extends Node {
    private _variableName: string;

    constructor(variableName: string = 'localVar') {
        super({
            type: 'Variable.GetLocal',
            category: NodeCategory.VARIABLE,
            title: `Get Local ${variableName}`,
            description: `Get local variable ${variableName}`,
            color: '#F44336'
        });
        this._variableName = variableName;
    }

    protected setupPorts(): void {
        this.addOutput({
            name: 'value',
            type: PortType.ANY,
            description: 'Variable value'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const value = context.getLocal(this._variableName);
        this.setOutputValue('value', value);
        return this.success();
    }

    public get variableName(): string {
        return this._variableName;
    }
}

/**
 * SetLocalVariable - set local (graph-scoped) variable
 */
export class SetLocalVariable extends Node {
    private _variableName: string;

    constructor(variableName: string = 'localVar') {
        super({
            type: 'Variable.SetLocal',
            category: NodeCategory.VARIABLE,
            title: `Set Local ${variableName}`,
            description: `Set local variable ${variableName}`,
            color: '#F44336'
        });
        this._variableName = variableName;
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'value',
            type: PortType.ANY,
            description: 'Value to set'
        });
        this.addFlowOutput('out');
        this.addOutput({
            name: 'value',
            type: PortType.ANY,
            description: 'The value that was set'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const value = this.getInputValue('value');
        context.setLocal(this._variableName, value);
        this.setOutputValue('value', value);
        return this.success('out');
    }

    public get variableName(): string {
        return this._variableName;
    }
}

/**
 * GetGlobalVariable - get global (shared) variable
 */
export class GetGlobalVariable extends Node {
    private _variableName: string;

    constructor(variableName: string = 'globalVar') {
        super({
            type: 'Variable.GetGlobal',
            category: NodeCategory.VARIABLE,
            title: `Get Global ${variableName}`,
            description: `Get global variable ${variableName}`,
            color: '#F44336'
        });
        this._variableName = variableName;
    }

    protected setupPorts(): void {
        this.addOutput({
            name: 'value',
            type: PortType.ANY,
            description: 'Variable value'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const value = context.getGlobal(this._variableName);
        this.setOutputValue('value', value);
        return this.success();
    }

    public get variableName(): string {
        return this._variableName;
    }
}

/**
 * SetGlobalVariable - set global (shared) variable
 */
export class SetGlobalVariable extends Node {
    private _variableName: string;

    constructor(variableName: string = 'globalVar') {
        super({
            type: 'Variable.SetGlobal',
            category: NodeCategory.VARIABLE,
            title: `Set Global ${variableName}`,
            description: `Set global variable ${variableName}`,
            color: '#F44336'
        });
        this._variableName = variableName;
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'value',
            type: PortType.ANY,
            description: 'Value to set'
        });
        this.addFlowOutput('out');
        this.addOutput({
            name: 'value',
            type: PortType.ANY,
            description: 'The value that was set'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const value = this.getInputValue('value');
        context.setGlobal(this._variableName, value);
        this.setOutputValue('value', value);
        return this.success('out');
    }

    public get variableName(): string {
        return this._variableName;
    }
}

/**
 * Increment - increment variable by amount
 */
export class Increment extends Node {
    private _variableName: string;

    constructor(variableName: string = 'counter') {
        super({
            type: 'Variable.Increment',
            category: NodeCategory.VARIABLE,
            title: `Increment ${variableName}`,
            description: `Increment ${variableName} by amount`,
            color: '#F44336'
        });
        this._variableName = variableName;
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'amount',
            type: PortType.NUMBER,
            description: 'Amount to increment by',
            defaultValue: 1
        });
        this.addFlowOutput('out');
        this.addOutput({
            name: 'newValue',
            type: PortType.NUMBER,
            description: 'New value after increment'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const amount = this.getInputValue<number>('amount', 1);
        const currentValue = context.getVariable(this._variableName) || 0;
        const newValue = currentValue + amount;

        context.setVariable(this._variableName, newValue);
        this.setOutputValue('newValue', newValue);

        return this.success('out');
    }

    public get variableName(): string {
        return this._variableName;
    }
}

/**
 * Decrement - decrement variable by amount
 */
export class Decrement extends Node {
    private _variableName: string;

    constructor(variableName: string = 'counter') {
        super({
            type: 'Variable.Decrement',
            category: NodeCategory.VARIABLE,
            title: `Decrement ${variableName}`,
            description: `Decrement ${variableName} by amount`,
            color: '#F44336'
        });
        this._variableName = variableName;
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'amount',
            type: PortType.NUMBER,
            description: 'Amount to decrement by',
            defaultValue: 1
        });
        this.addFlowOutput('out');
        this.addOutput({
            name: 'newValue',
            type: PortType.NUMBER,
            description: 'New value after decrement'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const amount = this.getInputValue<number>('amount', 1);
        const currentValue = context.getVariable(this._variableName) || 0;
        const newValue = currentValue - amount;

        context.setVariable(this._variableName, newValue);
        this.setOutputValue('newValue', newValue);

        return this.success('out');
    }

    public get variableName(): string {
        return this._variableName;
    }
}
