/**
 * @fileoverview Inspector registry for managing component inspectors and custom field editors.
 * @module editor/inspectors/InspectorRegistry
 */

import { Component } from '../../ecs/Component';
import { Entity } from '../../ecs/Entity';

/**
 * Field editor function type
 */
export type FieldEditor = (
  component: Component,
  fieldName: string,
  value: any,
  onChange: (newValue: any) => void
) => HTMLElement;

/**
 * Component inspector interface
 */
export interface IComponentInspector {
  /** Component type this inspector handles */
  componentType: new (...args: any[]) => Component;

  /** Renders the inspector UI */
  render(component: Component, entity: Entity): HTMLElement;

  /** Updates the inspector with new data */
  update?(component: Component): void;

  /** Validates component data */
  validate?(component: Component): boolean;

  /** Disposes of inspector resources */
  dispose?(): void;
}

/**
 * Property drawer for custom field rendering
 */
export interface IPropertyDrawer {
  /** Field type this drawer handles */
  fieldType: string;

  /** Renders the field UI */
  render(value: any, onChange: (newValue: any) => void, options?: any): HTMLElement;

  /** Validates field value */
  validate?(value: any): boolean;
}

/**
 * Inspector registry for managing component inspectors,
 * custom field editors, and property drawers.
 *
 * @example
 * ```typescript
 * // Register a component inspector
 * InspectorRegistry.registerInspector({
 *   componentType: Transform,
 *   render: (component, entity) => {
 *     const element = document.createElement('div');
 *     // Build UI for transform component
 *     return element;
 *   }
 * });
 *
 * // Register a field editor
 * InspectorRegistry.registerFieldEditor('Vector3', (component, field, value, onChange) => {
 *   const input = document.createElement('input');
 *   input.value = value.toString();
 *   input.onchange = () => onChange(parseVector3(input.value));
 *   return input;
 * });
 *
 * // Get inspector for component
 * const inspector = InspectorRegistry.getInspector(Transform);
 * ```
 */
export class InspectorRegistryManager {
  private inspectors: Map<string, IComponentInspector> = new Map();
  private fieldEditors: Map<string, FieldEditor> = new Map();
  private propertyDrawers: Map<string, IPropertyDrawer> = new Map();
  private inspectorCache: Map<Component, HTMLElement> = new Map();

  /**
   * Registers a component inspector
   * @param inspector - Inspector to register
   */
  public registerInspector(inspector: IComponentInspector): void {
    const typeName = inspector.componentType.name;
    this.inspectors.set(typeName, inspector);
  }

  /**
   * Unregisters a component inspector
   * @param componentType - Component class
   */
  public unregisterInspector(componentType: new (...args: any[]) => Component): void {
    const typeName = componentType.name;
    const inspector = this.inspectors.get(typeName);

    if (inspector && inspector.dispose) {
      inspector.dispose();
    }

    this.inspectors.delete(typeName);
  }

  /**
   * Gets an inspector for a component type
   * @param componentType - Component class
   * @returns Inspector or undefined
   */
  public getInspector(
    componentType: new (...args: any[]) => Component
  ): IComponentInspector | undefined {
    return this.inspectors.get(componentType.name);
  }

  /**
   * Checks if an inspector is registered for a component type
   * @param componentType - Component class
   */
  public hasInspector(componentType: new (...args: any[]) => Component): boolean {
    return this.inspectors.has(componentType.name);
  }

  /**
   * Renders an inspector for a component
   * @param component - Component to inspect
   * @param entity - Entity the component belongs to
   * @returns Inspector UI element or null
   */
  public renderInspector(component: Component, entity: Entity): HTMLElement | null {
    const inspector = this.getInspector(component.constructor as any);

    if (!inspector) {
      // Return default inspector
      return this.renderDefaultInspector(component, entity);
    }

    const element = inspector.render(component, entity);
    this.inspectorCache.set(component, element);
    return element;
  }

  /**
   * Renders a default inspector for components without custom inspectors
   */
  private renderDefaultInspector(component: Component, entity: Entity): HTMLElement {
    const container = document.createElement('div');
    container.className = 'inspector-default';

    const title = document.createElement('h3');
    title.textContent = component.constructor.name;
    container.appendChild(title);

    // Render all public properties
    const properties = this.getComponentProperties(component);

    properties.forEach(prop => {
      const field = this.renderField(component, prop.name, prop.value);
      container.appendChild(field);
    });

    return container;
  }

  /**
   * Gets all inspectable properties of a component
   */
  private getComponentProperties(component: Component): Array<{ name: string; value: any }> {
    const properties: Array<{ name: string; value: any }> = [];
    const proto = Object.getPrototypeOf(component);

    // Get all own properties
    for (const key in component) {
      if (component.hasOwnProperty(key) && !key.startsWith('_')) {
        properties.push({
          name: key,
          value: (component as any)[key]
        });
      }
    }

    return properties;
  }

  /**
   * Registers a custom field editor
   * @param typeName - Type name to handle
   * @param editor - Editor function
   */
  public registerFieldEditor(typeName: string, editor: FieldEditor): void {
    this.fieldEditors.set(typeName, editor);
  }

  /**
   * Unregisters a field editor
   * @param typeName - Type name
   */
  public unregisterFieldEditor(typeName: string): void {
    this.fieldEditors.delete(typeName);
  }

  /**
   * Gets a field editor for a type
   * @param typeName - Type name
   */
  public getFieldEditor(typeName: string): FieldEditor | undefined {
    return this.fieldEditors.get(typeName);
  }

  /**
   * Renders a field with appropriate editor
   */
  private renderField(component: Component, fieldName: string, value: any): HTMLElement {
    const container = document.createElement('div');
    container.className = 'inspector-field';

    const label = document.createElement('label');
    label.textContent = this.formatFieldName(fieldName);
    container.appendChild(label);

    const typeName = this.getTypeName(value);
    const editor = this.fieldEditors.get(typeName);

    const onChange = (newValue: any) => {
      (component as any)[fieldName] = newValue;
      if ((component as any).markDirty) {
        (component as any).markDirty();
      }
    };

    if (editor) {
      const editorElement = editor(component, fieldName, value, onChange);
      container.appendChild(editorElement);
    } else {
      const defaultEditor = this.renderDefaultField(value, onChange);
      container.appendChild(defaultEditor);
    }

    return container;
  }

  /**
   * Renders a default field editor based on value type
   */
  private renderDefaultField(value: any, onChange: (newValue: any) => void): HTMLElement {
    const input = document.createElement('input');

    if (typeof value === 'boolean') {
      input.type = 'checkbox';
      input.checked = value;
      input.onchange = () => onChange(input.checked);
    } else if (typeof value === 'number') {
      input.type = 'number';
      input.value = String(value);
      input.onchange = () => onChange(parseFloat(input.value));
    } else if (typeof value === 'string') {
      input.type = 'text';
      input.value = value;
      input.onchange = () => onChange(input.value);
    } else {
      input.type = 'text';
      input.value = String(value);
      input.disabled = true;
    }

    return input;
  }

  /**
   * Formats a field name for display
   */
  private formatFieldName(name: string): string {
    // Convert camelCase to Title Case
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase());
  }

  /**
   * Gets the type name of a value
   */
  private getTypeName(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    if (typeof value === 'object') {
      return value.constructor.name;
    }

    return typeof value;
  }

  /**
   * Registers a property drawer
   * @param drawer - Property drawer to register
   */
  public registerPropertyDrawer(drawer: IPropertyDrawer): void {
    this.propertyDrawers.set(drawer.fieldType, drawer);
  }

  /**
   * Unregisters a property drawer
   * @param fieldType - Field type
   */
  public unregisterPropertyDrawer(fieldType: string): void {
    this.propertyDrawers.delete(fieldType);
  }

  /**
   * Gets a property drawer for a field type
   * @param fieldType - Field type
   */
  public getPropertyDrawer(fieldType: string): IPropertyDrawer | undefined {
    return this.propertyDrawers.get(fieldType);
  }

  /**
   * Updates a cached inspector
   * @param component - Component to update
   */
  public updateInspector(component: Component): void {
    const inspector = this.getInspector(component.constructor as any);
    if (inspector && inspector.update) {
      inspector.update(component);
    }
  }

  /**
   * Clears the inspector cache
   */
  public clearCache(): void {
    this.inspectorCache.clear();
  }

  /**
   * Disposes of all inspectors
   */
  public dispose(): void {
    this.inspectors.forEach(inspector => {
      if (inspector.dispose) {
        inspector.dispose();
      }
    });

    this.inspectors.clear();
    this.fieldEditors.clear();
    this.propertyDrawers.clear();
    this.inspectorCache.clear();
  }
}

/**
 * Global inspector registry instance
 */
export const InspectorRegistry = new InspectorRegistryManager();
