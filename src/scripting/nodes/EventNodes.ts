/**
 * EventNodes.ts - Event Nodes
 *
 * Event nodes that trigger graph execution.
 */

import { Node, NodeCategory, NodeExecutionResult } from '../Node';
import { PortType } from '../Port';
import { ExecutionContext } from '../execution/ExecutionContext';

/**
 * OnStart - fires once when graph starts
 */
export class OnStart extends Node {
    private _hasExecuted: boolean = false;

    constructor() {
        super({
            type: 'Event.OnStart',
            category: NodeCategory.EVENT,
            title: 'On Start',
            description: 'Fires once when the graph starts',
            color: '#4CAF50'
        });
    }

    protected setupPorts(): void {
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        if (this._hasExecuted) {
            return this.success();
        }

        this._hasExecuted = true;
        return this.success('out');
    }

    public override reset(): void {
        super.reset();
        this._hasExecuted = false;
    }
}

/**
 * OnUpdate - fires every frame
 */
export class OnUpdate extends Node {
    constructor() {
        super({
            type: 'Event.OnUpdate',
            category: NodeCategory.EVENT,
            title: 'On Update',
            description: 'Fires every frame',
            color: '#4CAF50'
        });
    }

    protected setupPorts(): void {
        this.addFlowOutput('out');
        this.addOutput({
            name: 'deltaTime',
            type: PortType.NUMBER,
            description: 'Time since last frame'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        this.setOutputValue('deltaTime', context.deltaTime);
        return this.success('out');
    }
}

/**
 * OnFixedUpdate - fires at fixed physics rate
 */
export class OnFixedUpdate extends Node {
    private _accumulator: number = 0;

    constructor() {
        super({
            type: 'Event.OnFixedUpdate',
            category: NodeCategory.EVENT,
            title: 'On Fixed Update',
            description: 'Fires at fixed physics rate (50 FPS)',
            color: '#4CAF50'
        });
    }

    protected setupPorts(): void {
        this.addFlowOutput('out');
        this.addOutput({
            name: 'fixedDeltaTime',
            type: PortType.NUMBER,
            description: 'Fixed physics timestep'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        this._accumulator += context.deltaTime;

        if (this._accumulator >= context.fixedDeltaTime) {
            this._accumulator -= context.fixedDeltaTime;
            this.setOutputValue('fixedDeltaTime', context.fixedDeltaTime);
            return this.success('out');
        }

        return this.success();
    }
}

/**
 * OnDestroy - fires when graph is destroyed
 */
export class OnDestroy extends Node {
    constructor() {
        super({
            type: 'Event.OnDestroy',
            category: NodeCategory.EVENT,
            title: 'On Destroy',
            description: 'Fires when the graph is destroyed',
            color: '#4CAF50'
        });
    }

    protected setupPorts(): void {
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        return this.success('out');
    }
}

/**
 * Custom Event - fires when custom event is triggered
 */
export class CustomEvent extends Node {
    private _eventName: string;

    constructor(eventName: string = 'CustomEvent') {
        super({
            type: 'Event.Custom',
            category: NodeCategory.EVENT,
            title: `Event: ${eventName}`,
            description: `Fires when ${eventName} is triggered`,
            color: '#4CAF50'
        });
        this._eventName = eventName;
    }

    protected setupPorts(): void {
        this.addFlowOutput('out');
        this.addOutput({
            name: 'data',
            type: PortType.ANY,
            description: 'Event data payload'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const eventData = context.getLocal(`event_${this._eventName}_data`);
        this.setOutputValue('data', eventData);
        return this.success('out');
    }

    public get eventName(): string {
        return this._eventName;
    }
}

/**
 * OnKeyPress - fires when key is pressed
 */
export class OnKeyPress extends Node {
    constructor() {
        super({
            type: 'Event.OnKeyPress',
            category: NodeCategory.EVENT,
            title: 'On Key Press',
            description: 'Fires when a key is pressed',
            color: '#4CAF50'
        });
    }

    protected setupPorts(): void {
        this.addFlowOutput('out');
        this.addInput({
            name: 'key',
            type: PortType.STRING,
            description: 'Key to listen for (e.g., "Space", "W")',
            defaultValue: 'Space'
        });
        this.addOutput({
            name: 'keyCode',
            type: PortType.STRING,
            description: 'The key that was pressed'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const targetKey = this.getInputValue('key', 'Space');
        const pressedKey = context.getLocal('pressedKey');

        if (pressedKey === targetKey) {
            this.setOutputValue('keyCode', pressedKey);
            return this.success('out');
        }

        return this.success();
    }
}

/**
 * OnCollisionEnter - fires when collision starts
 */
export class OnCollisionEnter extends Node {
    constructor() {
        super({
            type: 'Event.OnCollisionEnter',
            category: NodeCategory.EVENT,
            title: 'On Collision Enter',
            description: 'Fires when collision with another entity starts',
            color: '#4CAF50'
        });
    }

    protected setupPorts(): void {
        this.addFlowOutput('out');
        this.addOutput({
            name: 'otherEntity',
            type: PortType.ENTITY,
            description: 'The entity we collided with'
        });
        this.addOutput({
            name: 'contactPoint',
            type: PortType.VECTOR3,
            description: 'Collision contact point'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const collisionData = context.getLocal('collisionEnter');

        if (collisionData) {
            this.setOutputValue('otherEntity', collisionData.otherEntity);
            this.setOutputValue('contactPoint', collisionData.contactPoint);
            return this.success('out');
        }

        return this.success();
    }
}

/**
 * OnCollisionExit - fires when collision ends
 */
export class OnCollisionExit extends Node {
    constructor() {
        super({
            type: 'Event.OnCollisionExit',
            category: NodeCategory.EVENT,
            title: 'On Collision Exit',
            description: 'Fires when collision with another entity ends',
            color: '#4CAF50'
        });
    }

    protected setupPorts(): void {
        this.addFlowOutput('out');
        this.addOutput({
            name: 'otherEntity',
            type: PortType.ENTITY,
            description: 'The entity we stopped colliding with'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const collisionData = context.getLocal('collisionExit');

        if (collisionData) {
            this.setOutputValue('otherEntity', collisionData.otherEntity);
            return this.success('out');
        }

        return this.success();
    }
}
