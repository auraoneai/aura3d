/**
 * ComponentNodes.ts - Component Access Nodes
 *
 * Nodes for accessing and manipulating entity components.
 */

import { Node, NodeCategory, NodeExecutionResult } from '../Node';
import { PortType } from '../Port';
import { ExecutionContext } from '../execution/ExecutionContext';

/**
 * GetComponent - get component from entity
 */
export class GetComponent extends Node {
    private _componentType: string;

    constructor(componentType: string = 'Transform') {
        super({
            type: 'Component.Get',
            category: NodeCategory.COMPONENT,
            title: `Get ${componentType}`,
            description: `Get ${componentType} component`,
            color: '#00BCD4'
        });
        this._componentType = componentType;
    }

    protected setupPorts(): void {
        this.addInput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Entity to get component from',
            optional: true
        });
        this.addOutput({
            name: 'component',
            type: PortType.COMPONENT,
            description: 'Component instance'
        });
        this.addOutput({
            name: 'found',
            type: PortType.BOOLEAN,
            description: 'Whether component was found'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const entity = this.getInputValue('entity') || context.entity;

        if (!entity) {
            this.setOutputValue('component', null);
            this.setOutputValue('found', false);
            return this.success();
        }

        // Simulate component lookup
        const component = entity[this._componentType.toLowerCase()];
        this.setOutputValue('component', component || null);
        this.setOutputValue('found', !!component);

        return this.success();
    }

    public get componentType(): string {
        return this._componentType;
    }
}

/**
 * GetComponentProperty - get property from component
 */
export class GetComponentProperty extends Node {
    private _componentType: string;
    private _propertyName: string;

    constructor(componentType: string = 'Transform', propertyName: string = 'position') {
        super({
            type: 'Component.GetProperty',
            category: NodeCategory.COMPONENT,
            title: `Get ${componentType}.${propertyName}`,
            description: `Get ${propertyName} from ${componentType}`,
            color: '#00BCD4'
        });
        this._componentType = componentType;
        this._propertyName = propertyName;
    }

    protected setupPorts(): void {
        this.addInput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Entity to get property from',
            optional: true
        });
        this.addOutput({
            name: 'value',
            type: PortType.ANY,
            description: 'Property value'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const entity = this.getInputValue('entity') || context.entity;

        if (!entity) {
            this.setOutputValue('value', null);
            return this.success();
        }

        const component = entity[this._componentType.toLowerCase()];
        const value = component ? component[this._propertyName] : null;

        this.setOutputValue('value', value);
        return this.success();
    }
}

/**
 * SetComponentProperty - set property on component
 */
export class SetComponentProperty extends Node {
    private _componentType: string;
    private _propertyName: string;

    constructor(componentType: string = 'Transform', propertyName: string = 'position') {
        super({
            type: 'Component.SetProperty',
            category: NodeCategory.COMPONENT,
            title: `Set ${componentType}.${propertyName}`,
            description: `Set ${propertyName} on ${componentType}`,
            color: '#00BCD4'
        });
        this._componentType = componentType;
        this._propertyName = propertyName;
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Entity to set property on',
            optional: true
        });
        this.addInput({
            name: 'value',
            type: PortType.ANY,
            description: 'Value to set'
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const entity = this.getInputValue('entity') || context.entity;
        const value = this.getInputValue('value');

        if (!entity) {
            return this.error('No entity provided');
        }

        const component = entity[this._componentType.toLowerCase()];
        if (component) {
            component[this._propertyName] = value;
        }

        return this.success('out');
    }
}

/**
 * FindEntityByName - find entity by name
 */
export class FindEntityByName extends Node {
    constructor() {
        super({
            type: 'Component.FindEntityByName',
            category: NodeCategory.COMPONENT,
            title: 'Find Entity By Name',
            description: 'Find entity by its name',
            color: '#00BCD4'
        });
    }

    protected setupPorts(): void {
        this.addInput({
            name: 'name',
            type: PortType.STRING,
            description: 'Entity name to search for'
        });
        this.addOutput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Found entity'
        });
        this.addOutput({
            name: 'found',
            type: PortType.BOOLEAN,
            description: 'Whether entity was found'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const name = this.getInputValue<string>('name', '');

        // Simulate entity lookup
        const entity = context.getGlobal(`entity_${name}`);

        this.setOutputValue('entity', entity || null);
        this.setOutputValue('found', !!entity);

        return this.success();
    }
}

/**
 * GetChildren - get child entities
 */
export class GetChildren extends Node {
    constructor() {
        super({
            type: 'Component.GetChildren',
            category: NodeCategory.COMPONENT,
            title: 'Get Children',
            description: 'Get child entities of an entity',
            color: '#00BCD4'
        });
    }

    protected setupPorts(): void {
        this.addInput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Parent entity',
            optional: true
        });
        this.addOutput({
            name: 'children',
            type: PortType.ANY,
            description: 'Array of child entities'
        });
        this.addOutput({
            name: 'count',
            type: PortType.NUMBER,
            description: 'Number of children'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const entity = this.getInputValue('entity') || context.entity;

        if (!entity) {
            this.setOutputValue('children', []);
            this.setOutputValue('count', 0);
            return this.success();
        }

        const children = entity.children || [];
        this.setOutputValue('children', children);
        this.setOutputValue('count', children.length);

        return this.success();
    }
}

/**
 * GetParent - get parent entity
 */
export class GetParent extends Node {
    constructor() {
        super({
            type: 'Component.GetParent',
            category: NodeCategory.COMPONENT,
            title: 'Get Parent',
            description: 'Get parent entity of an entity',
            color: '#00BCD4'
        });
    }

    protected setupPorts(): void {
        this.addInput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Child entity',
            optional: true
        });
        this.addOutput({
            name: 'parent',
            type: PortType.ENTITY,
            description: 'Parent entity'
        });
        this.addOutput({
            name: 'hasParent',
            type: PortType.BOOLEAN,
            description: 'Whether entity has a parent'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const entity = this.getInputValue('entity') || context.entity;

        if (!entity) {
            this.setOutputValue('parent', null);
            this.setOutputValue('hasParent', false);
            return this.success();
        }

        const parent = entity.parent || null;
        this.setOutputValue('parent', parent);
        this.setOutputValue('hasParent', !!parent);

        return this.success();
    }
}

/**
 * GetSelf - get current entity
 */
export class GetSelf extends Node {
    constructor() {
        super({
            type: 'Component.GetSelf',
            category: NodeCategory.COMPONENT,
            title: 'Get Self',
            description: 'Get reference to current entity',
            color: '#00BCD4'
        });
    }

    protected setupPorts(): void {
        this.addOutput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Current entity'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        this.setOutputValue('entity', context.entity);
        return this.success();
    }
}
