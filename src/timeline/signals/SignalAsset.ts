/**
 * G3D 5.0 Timeline & Cinematics Module - Signal Asset
 *
 * Defines a signal with its parameter schema and metadata.
 * Signals are used for event-driven timeline interactions.
 */

/**
 * Parameter type
 */
export enum ParameterType {
    String = 'string',
    Number = 'number',
    Boolean = 'boolean',
    Vector3 = 'vector3',
    Color = 'color',
    Object = 'object',
    Any = 'any'
}

/**
 * Parameter definition
 */
export interface ParameterDefinition {
    /** Parameter name */
    name: string;
    /** Parameter type */
    type: ParameterType;
    /** Default value */
    defaultValue?: any;
    /** Description */
    description?: string;
    /** Whether parameter is required */
    required?: boolean;
    /** Validation function */
    validate?: (value: any) => boolean;
}

/**
 * Signal parameter schema
 */
export interface SignalSchema {
    /** Parameter definitions */
    parameters: ParameterDefinition[];
}

/**
 * Signal Asset
 *
 * Defines a signal type with its parameter schema.
 * Signals can be emitted from signal tracks and received by signal receivers.
 */
export class SignalAsset {
    private static nextId = 0;

    /** Unique signal ID */
    public readonly id: string;

    /** Signal name */
    public name: string;

    /** Parameter schema */
    public schema: SignalSchema;

    /** Signal description */
    public description: string;

    /** Signal category (for organization) */
    public category: string;

    /** Signal metadata */
    public metadata: Record<string, any>;

    constructor(
        name: string,
        schema?: SignalSchema,
        options?: {
            id?: string;
            description?: string;
            category?: string;
            metadata?: Record<string, any>;
        }
    ) {
        this.id = options?.id || `signal_${SignalAsset.nextId++}`;
        this.name = name;
        this.schema = schema || { parameters: [] };
        this.description = options?.description || '';
        this.category = options?.category || 'default';
        this.metadata = options?.metadata || {};
    }

    /**
     * Add a parameter to the schema
     */
    public addParameter(param: ParameterDefinition): void {
        this.schema.parameters.push(param);
    }

    /**
     * Get a parameter definition by name
     */
    public getParameter(name: string): ParameterDefinition | null {
        return this.schema.parameters.find(p => p.name === name) || null;
    }

    /**
     * Validate parameter values against schema
     */
    public validate(values: Record<string, any>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Check required parameters
        for (const param of this.schema.parameters) {
            if (param.required && !(param.name in values)) {
                errors.push(`Required parameter '${param.name}' is missing`);
                continue;
            }

            const value = values[param.name];

            // Skip validation if not provided and not required
            if (value === undefined && !param.required) {
                continue;
            }

            // Type validation
            if (!this.validateType(value, param.type)) {
                errors.push(`Parameter '${param.name}' has invalid type (expected ${param.type})`);
            }

            // Custom validation
            if (param.validate && !param.validate(value)) {
                errors.push(`Parameter '${param.name}' failed custom validation`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate a value against a parameter type
     */
    private validateType(value: any, type: ParameterType): boolean {
        switch (type) {
            case ParameterType.String:
                return typeof value === 'string';

            case ParameterType.Number:
                return typeof value === 'number' && !isNaN(value);

            case ParameterType.Boolean:
                return typeof value === 'boolean';

            case ParameterType.Vector3:
                return value && typeof value === 'object' &&
                       'x' in value && 'y' in value && 'z' in value;

            case ParameterType.Color:
                return value && typeof value === 'object' &&
                       'r' in value && 'g' in value && 'b' in value;

            case ParameterType.Object:
                return typeof value === 'object';

            case ParameterType.Any:
                return true;

            default:
                return false;
        }
    }

    /**
     * Create parameter values with defaults
     */
    public createDefaultValues(): Record<string, any> {
        const values: Record<string, any> = {};

        for (const param of this.schema.parameters) {
            if (param.defaultValue !== undefined) {
                values[param.name] = param.defaultValue;
            }
        }

        return values;
    }

    /**
     * Clone this signal asset
     */
    public clone(): SignalAsset {
        return new SignalAsset(
            this.name,
            {
                parameters: this.schema.parameters.map(p => ({ ...p }))
            },
            {
                description: this.description,
                category: this.category,
                metadata: { ...this.metadata }
            }
        );
    }

    /**
     * Serialize to JSON
     */
    public toJSON(): any {
        return {
            id: this.id,
            name: this.name,
            schema: {
                parameters: this.schema.parameters.map(p => ({
                    name: p.name,
                    type: p.type,
                    defaultValue: p.defaultValue,
                    description: p.description,
                    required: p.required
                }))
            },
            description: this.description,
            category: this.category,
            metadata: this.metadata
        };
    }

    /**
     * Deserialize from JSON
     */
    public static fromJSON(data: any): SignalAsset {
        const asset = new SignalAsset(
            data.name,
            {
                parameters: data.schema?.parameters || []
            },
            {
                id: data.id,
                description: data.description,
                category: data.category,
                metadata: data.metadata
            }
        );

        return asset;
    }
}

/**
 * Signal Asset Registry
 *
 * Global registry for signal assets.
 */
export class SignalAssetRegistry {
    private static _instance: SignalAssetRegistry | null = null;
    private _assets: Map<string, SignalAsset>;

    private constructor() {
        this._assets = new Map();
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): SignalAssetRegistry {
        if (!SignalAssetRegistry._instance) {
            SignalAssetRegistry._instance = new SignalAssetRegistry();
        }
        return SignalAssetRegistry._instance;
    }

    /**
     * Register a signal asset
     */
    public register(asset: SignalAsset): void {
        this._assets.set(asset.id, asset);
    }

    /**
     * Unregister a signal asset
     */
    public unregister(assetId: string): boolean {
        return this._assets.delete(assetId);
    }

    /**
     * Get a signal asset by ID
     */
    public get(assetId: string): SignalAsset | null {
        return this._assets.get(assetId) || null;
    }

    /**
     * Get a signal asset by name
     */
    public getByName(name: string): SignalAsset | null {
        for (const asset of this._assets.values()) {
            if (asset.name === name) {
                return asset;
            }
        }
        return null;
    }

    /**
     * Get all signal assets
     */
    public getAll(): SignalAsset[] {
        return Array.from(this._assets.values());
    }

    /**
     * Get signals by category
     */
    public getByCategory(category: string): SignalAsset[] {
        return this.getAll().filter(asset => asset.category === category);
    }

    /**
     * Check if a signal exists
     */
    public has(assetId: string): boolean {
        return this._assets.has(assetId);
    }

    /**
     * Clear all assets
     */
    public clear(): void {
        this._assets.clear();
    }
}

/**
 * Helper function to create a simple signal asset
 */
export function createSignalAsset(
    name: string,
    parameters?: ParameterDefinition[],
    description?: string
): SignalAsset {
    return new SignalAsset(
        name,
        { parameters: parameters || [] },
        { description }
    );
}

/**
 * Helper function to create a parameter definition
 */
export function createParameter(
    name: string,
    type: ParameterType,
    options?: {
        defaultValue?: any;
        description?: string;
        required?: boolean;
        validate?: (value: any) => boolean;
    }
): ParameterDefinition {
    return {
        name,
        type,
        defaultValue: options?.defaultValue,
        description: options?.description,
        required: options?.required ?? false,
        validate: options?.validate
    };
}
