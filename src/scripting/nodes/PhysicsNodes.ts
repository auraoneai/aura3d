/**
 * PhysicsNodes.ts - Physics Nodes
 *
 * Nodes for physics operations and interactions.
 */

import { Node, NodeCategory, NodeExecutionResult } from '../Node';
import { PortType } from '../Port';
import { ExecutionContext } from '../execution/ExecutionContext';

/**
 * ApplyForce - apply force to rigidbody
 */
export class ApplyForce extends Node {
    constructor() {
        super({
            type: 'Physics.ApplyForce',
            category: NodeCategory.PHYSICS,
            title: 'Apply Force',
            description: 'Apply force to rigidbody',
            color: '#8BC34A'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Entity with rigidbody',
            optional: true
        });
        this.addInput({
            name: 'force',
            type: PortType.VECTOR3,
            description: 'Force vector'
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const entity = this.getInputValue('entity') || context.entity;
        const force = this.getInputValue('force', { x: 0, y: 0, z: 0 });

        if (!entity) {
            return this.error('No entity provided');
        }

        const rigidbody = entity.rigidbody;
        if (rigidbody && rigidbody.applyForce) {
            rigidbody.applyForce(force);
        }

        return this.success('out');
    }
}

/**
 * ApplyImpulse - apply impulse to rigidbody
 */
export class ApplyImpulse extends Node {
    constructor() {
        super({
            type: 'Physics.ApplyImpulse',
            category: NodeCategory.PHYSICS,
            title: 'Apply Impulse',
            description: 'Apply impulse to rigidbody',
            color: '#8BC34A'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Entity with rigidbody',
            optional: true
        });
        this.addInput({
            name: 'impulse',
            type: PortType.VECTOR3,
            description: 'Impulse vector'
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const entity = this.getInputValue('entity') || context.entity;
        const impulse = this.getInputValue('impulse', { x: 0, y: 0, z: 0 });

        if (!entity) {
            return this.error('No entity provided');
        }

        const rigidbody = entity.rigidbody;
        if (rigidbody && rigidbody.applyImpulse) {
            rigidbody.applyImpulse(impulse);
        }

        return this.success('out');
    }
}

/**
 * SetVelocity - set rigidbody velocity
 */
export class SetVelocity extends Node {
    constructor() {
        super({
            type: 'Physics.SetVelocity',
            category: NodeCategory.PHYSICS,
            title: 'Set Velocity',
            description: 'Set rigidbody velocity',
            color: '#8BC34A'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Entity with rigidbody',
            optional: true
        });
        this.addInput({
            name: 'velocity',
            type: PortType.VECTOR3,
            description: 'Velocity vector'
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const entity = this.getInputValue('entity') || context.entity;
        const velocity = this.getInputValue('velocity', { x: 0, y: 0, z: 0 });

        if (!entity) {
            return this.error('No entity provided');
        }

        const rigidbody = entity.rigidbody;
        if (rigidbody) {
            rigidbody.velocity = velocity;
        }

        return this.success('out');
    }
}

/**
 * GetVelocity - get rigidbody velocity
 */
export class GetVelocity extends Node {
    constructor() {
        super({
            type: 'Physics.GetVelocity',
            category: NodeCategory.PHYSICS,
            title: 'Get Velocity',
            description: 'Get rigidbody velocity',
            color: '#8BC34A'
        });
    }

    protected setupPorts(): void {
        this.addInput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Entity with rigidbody',
            optional: true
        });
        this.addOutput({
            name: 'velocity',
            type: PortType.VECTOR3,
            description: 'Velocity vector'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const entity = this.getInputValue('entity') || context.entity;

        if (!entity) {
            this.setOutputValue('velocity', { x: 0, y: 0, z: 0 });
            return this.success();
        }

        const rigidbody = entity.rigidbody;
        const velocity = rigidbody ? rigidbody.velocity : { x: 0, y: 0, z: 0 };

        this.setOutputValue('velocity', velocity);
        return this.success();
    }
}

/**
 * Raycast - perform raycast
 */
export class Raycast extends Node {
    constructor() {
        super({
            type: 'Physics.Raycast',
            category: NodeCategory.PHYSICS,
            title: 'Raycast',
            description: 'Perform physics raycast',
            color: '#8BC34A'
        });
    }

    protected setupPorts(): void {
        this.addInput({
            name: 'origin',
            type: PortType.VECTOR3,
            description: 'Ray origin'
        });
        this.addInput({
            name: 'direction',
            type: PortType.VECTOR3,
            description: 'Ray direction'
        });
        this.addInput({
            name: 'maxDistance',
            type: PortType.NUMBER,
            description: 'Maximum ray distance',
            defaultValue: 100
        });
        this.addOutput({
            name: 'hit',
            type: PortType.BOOLEAN,
            description: 'Whether raycast hit something'
        });
        this.addOutput({
            name: 'hitEntity',
            type: PortType.ENTITY,
            description: 'Entity that was hit'
        });
        this.addOutput({
            name: 'hitPoint',
            type: PortType.VECTOR3,
            description: 'Point where ray hit'
        });
        this.addOutput({
            name: 'hitNormal',
            type: PortType.VECTOR3,
            description: 'Normal at hit point'
        });
        this.addOutput({
            name: 'distance',
            type: PortType.NUMBER,
            description: 'Distance to hit point'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const origin = this.getInputValue('origin', { x: 0, y: 0, z: 0 });
        const direction = this.getInputValue('direction', { x: 0, y: 0, z: 1 });
        const maxDistance = this.getInputValue<number>('maxDistance', 100);

        // Simulate raycast (in real implementation, would call physics engine)
        const raycastResult = context.getLocal('raycastResult');

        if (raycastResult) {
            this.setOutputValue('hit', true);
            this.setOutputValue('hitEntity', raycastResult.entity);
            this.setOutputValue('hitPoint', raycastResult.point);
            this.setOutputValue('hitNormal', raycastResult.normal);
            this.setOutputValue('distance', raycastResult.distance);
        } else {
            this.setOutputValue('hit', false);
            this.setOutputValue('hitEntity', null);
            this.setOutputValue('hitPoint', { x: 0, y: 0, z: 0 });
            this.setOutputValue('hitNormal', { x: 0, y: 1, z: 0 });
            this.setOutputValue('distance', maxDistance);
        }

        return this.success();
    }
}

/**
 * SetKinematic - set rigidbody kinematic state
 */
export class SetKinematic extends Node {
    constructor() {
        super({
            type: 'Physics.SetKinematic',
            category: NodeCategory.PHYSICS,
            title: 'Set Kinematic',
            description: 'Set whether rigidbody is kinematic',
            color: '#8BC34A'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Entity with rigidbody',
            optional: true
        });
        this.addInput({
            name: 'kinematic',
            type: PortType.BOOLEAN,
            description: 'Kinematic state',
            defaultValue: false
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const entity = this.getInputValue('entity') || context.entity;
        const kinematic = this.getInputValue<boolean>('kinematic', false);

        if (!entity) {
            return this.error('No entity provided');
        }

        const rigidbody = entity.rigidbody;
        if (rigidbody) {
            rigidbody.kinematic = kinematic;
        }

        return this.success('out');
    }
}

/**
 * SetGravity - enable/disable gravity on rigidbody
 */
export class SetGravity extends Node {
    constructor() {
        super({
            type: 'Physics.SetGravity',
            category: NodeCategory.PHYSICS,
            title: 'Set Gravity',
            description: 'Enable or disable gravity on rigidbody',
            color: '#8BC34A'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Entity with rigidbody',
            optional: true
        });
        this.addInput({
            name: 'enabled',
            type: PortType.BOOLEAN,
            description: 'Gravity enabled',
            defaultValue: true
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const entity = this.getInputValue('entity') || context.entity;
        const enabled = this.getInputValue<boolean>('enabled', true);

        if (!entity) {
            return this.error('No entity provided');
        }

        const rigidbody = entity.rigidbody;
        if (rigidbody) {
            rigidbody.useGravity = enabled;
        }

        return this.success('out');
    }
}
