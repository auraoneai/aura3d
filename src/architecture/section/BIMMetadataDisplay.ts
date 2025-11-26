/**
 * BIMMetadataDisplay.ts
 * Display and interact with BIM metadata
 * Part of G3D 5.0 Architecture/BIM Module
 */

import { IBIMMetadata } from './SectionTypes';

/**
 * Property filter options
 */
export interface IPropertyFilter {
  /** Filter by property set name */
  propertySet?: string;
  /** Filter by property name */
  propertyName?: string;
  /** Filter by value (partial match) */
  valueContains?: string;
  /** Filter by IFC type */
  ifcType?: string;
}

/**
 * Property display options
 */
export interface IPropertyDisplayOptions {
  /** Show IFC properties */
  showIFCProperties: boolean;
  /** Show material properties */
  showMaterials: boolean;
  /** Show spatial properties */
  showSpatial: boolean;
  /** Show custom properties */
  showCustom: boolean;
  /** Collapse empty property sets */
  collapseEmpty: boolean;
  /** Sort properties alphabetically */
  sortAlphabetically: boolean;
}

/**
 * Formatted property for display
 */
export interface IFormattedProperty {
  /** Property set name */
  setName: string;
  /** Property name */
  name: string;
  /** Property value */
  value: any;
  /** Property type */
  type: string;
  /** Display category */
  category: string;
}

/**
 * BIM metadata display and inspector
 * Interactive property viewer with search and filtering
 *
 * @example
 * ```typescript
 * const display = new BIMMetadataDisplay({
 *   showIFCProperties: true,
 *   showMaterials: true,
 *   sortAlphabetically: true
 * });
 *
 * // Display element metadata
 * display.show(elementMetadata);
 *
 * // Search properties
 * const results = display.search('concrete');
 *
 * // Filter by property set
 * const filtered = display.filter({
 *   propertySet: 'Pset_WallCommon'
 * });
 * ```
 */
export class BIMMetadataDisplay {
  private metadata?: IBIMMetadata;
  private displayOptions: IPropertyDisplayOptions;
  private formattedProperties: IFormattedProperty[];
  private onPropertySelect?: (property: IFormattedProperty) => void;

  /**
   * Create a new BIM metadata display
   * @param options - Display options
   */
  constructor(options: Partial<IPropertyDisplayOptions> = {}) {
    this.displayOptions = {
      showIFCProperties: options.showIFCProperties ?? true,
      showMaterials: options.showMaterials ?? true,
      showSpatial: options.showSpatial ?? true,
      showCustom: options.showCustom ?? true,
      collapseEmpty: options.collapseEmpty ?? true,
      sortAlphabetically: options.sortAlphabetically ?? true
    };
    this.formattedProperties = [];
  }

  /**
   * Show metadata for element
   * @param metadata - BIM metadata
   */
  public show(metadata: IBIMMetadata): void {
    this.metadata = metadata;
    this.formattedProperties = this.formatProperties(metadata);
  }

  /**
   * Clear displayed metadata
   */
  public clear(): void {
    this.metadata = undefined;
    this.formattedProperties = [];
  }

  /**
   * Format metadata into displayable properties
   * @param metadata - Raw metadata
   * @returns Formatted properties
   */
  private formatProperties(metadata: IBIMMetadata): IFormattedProperty[] {
    const properties: IFormattedProperty[] = [];

    // IFC properties
    if (this.displayOptions.showIFCProperties) {
      if (metadata.ifcType) {
        properties.push({
          setName: 'IFC',
          name: 'Type',
          value: metadata.ifcType,
          type: 'string',
          category: 'IFC'
        });
      }

      if (metadata.ifcGlobalId) {
        properties.push({
          setName: 'IFC',
          name: 'Global ID',
          value: metadata.ifcGlobalId,
          type: 'string',
          category: 'IFC'
        });
      }

      if (metadata.name) {
        properties.push({
          setName: 'IFC',
          name: 'Name',
          value: metadata.name,
          type: 'string',
          category: 'IFC'
        });
      }
    }

    // Property sets
    if (metadata.propertySets) {
      for (const [setName, propertySet] of metadata.propertySets) {
        if (propertySet.size === 0 && this.displayOptions.collapseEmpty) {
          continue;
        }

        for (const [propName, propValue] of propertySet) {
          properties.push({
            setName,
            name: propName,
            value: propValue,
            type: this.getValueType(propValue),
            category: 'PropertySet'
          });
        }
      }
    }

    // Materials
    if (this.displayOptions.showMaterials && metadata.materials) {
      properties.push({
        setName: 'Materials',
        name: 'Materials',
        value: metadata.materials.join(', '),
        type: 'array',
        category: 'Material'
      });
    }

    // Spatial properties
    if (this.displayOptions.showSpatial) {
      if (metadata.space) {
        properties.push({
          setName: 'Spatial',
          name: 'Space',
          value: metadata.space,
          type: 'string',
          category: 'Spatial'
        });
      }

      if (metadata.level) {
        properties.push({
          setName: 'Spatial',
          name: 'Level',
          value: metadata.level,
          type: 'string',
          category: 'Spatial'
        });
      }
    }

    // Custom properties
    if (this.displayOptions.showCustom) {
      const excludedKeys = new Set([
        'ifcType', 'ifcGlobalId', 'name', 'propertySets',
        'materials', 'space', 'level'
      ]);

      for (const [key, value] of Object.entries(metadata)) {
        if (!excludedKeys.has(key)) {
          properties.push({
            setName: 'Custom',
            name: key,
            value: value,
            type: this.getValueType(value),
            category: 'Custom'
          });
        }
      }
    }

    // Sort if requested
    if (this.displayOptions.sortAlphabetically) {
      properties.sort((a, b) => {
        if (a.setName !== b.setName) {
          return a.setName.localeCompare(b.setName);
        }
        return a.name.localeCompare(b.name);
      });
    }

    return properties;
  }

  /**
   * Get type of value
   * @param value - Value to check
   * @returns Type string
   */
  private getValueType(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Map) return 'map';
    if (typeof value === 'object') return 'object';
    return typeof value;
  }

  /**
   * Get all formatted properties
   * @returns Array of formatted properties
   */
  public getProperties(): IFormattedProperty[] {
    return this.formattedProperties;
  }

  /**
   * Get properties grouped by set
   * @returns Map of property set to properties
   */
  public getPropertiesBySet(): Map<string, IFormattedProperty[]> {
    const grouped = new Map<string, IFormattedProperty[]>();

    for (const prop of this.formattedProperties) {
      let group = grouped.get(prop.setName);
      if (!group) {
        group = [];
        grouped.set(prop.setName, group);
      }
      group.push(prop);
    }

    return grouped;
  }

  /**
   * Search properties by name or value
   * @param query - Search query
   * @returns Matching properties
   */
  public search(query: string): IFormattedProperty[] {
    const lowerQuery = query.toLowerCase();

    return this.formattedProperties.filter(prop => {
      const nameMatch = prop.name.toLowerCase().includes(lowerQuery);
      const valueMatch = String(prop.value).toLowerCase().includes(lowerQuery);
      const setMatch = prop.setName.toLowerCase().includes(lowerQuery);

      return nameMatch || valueMatch || setMatch;
    });
  }

  /**
   * Filter properties
   * @param filter - Filter options
   * @returns Filtered properties
   */
  public filter(filter: IPropertyFilter): IFormattedProperty[] {
    return this.formattedProperties.filter(prop => {
      if (filter.propertySet && prop.setName !== filter.propertySet) {
        return false;
      }

      if (filter.propertyName && prop.name !== filter.propertyName) {
        return false;
      }

      if (filter.valueContains) {
        const valueStr = String(prop.value).toLowerCase();
        if (!valueStr.includes(filter.valueContains.toLowerCase())) {
          return false;
        }
      }

      if (filter.ifcType && this.metadata?.ifcType !== filter.ifcType) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get property by name
   * @param setName - Property set name
   * @param propertyName - Property name
   * @returns Property value or undefined
   */
  public getProperty(setName: string, propertyName: string): any {
    const prop = this.formattedProperties.find(
      p => p.setName === setName && p.name === propertyName
    );
    return prop?.value;
  }

  /**
   * Get property set
   * @param setName - Property set name
   * @returns Properties in set
   */
  public getPropertySet(setName: string): IFormattedProperty[] {
    return this.formattedProperties.filter(p => p.setName === setName);
  }

  /**
   * Get available property set names
   * @returns Array of set names
   */
  public getPropertySetNames(): string[] {
    const names = new Set<string>();
    for (const prop of this.formattedProperties) {
      names.add(prop.setName);
    }
    return Array.from(names);
  }

  /**
   * Set display options
   * @param options - New display options
   */
  public setDisplayOptions(options: Partial<IPropertyDisplayOptions>): void {
    this.displayOptions = {
      ...this.displayOptions,
      ...options
    };

    // Re-format if metadata is loaded
    if (this.metadata) {
      this.formattedProperties = this.formatProperties(this.metadata);
    }
  }

  /**
   * Get current display options
   * @returns Display options
   */
  public getDisplayOptions(): IPropertyDisplayOptions {
    return { ...this.displayOptions };
  }

  /**
   * Export properties to JSON
   * @returns JSON string
   */
  public exportToJSON(): string {
    return JSON.stringify(this.formattedProperties, null, 2);
  }

  /**
   * Export properties to CSV
   * @returns CSV string
   */
  public exportToCSV(): string {
    const headers = ['Set', 'Name', 'Value', 'Type', 'Category'];
    const rows = this.formattedProperties.map(prop => [
      prop.setName,
      prop.name,
      String(prop.value),
      prop.type,
      prop.category
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    return csv;
  }

  /**
   * Set property selection callback
   * @param callback - Callback function
   */
  public onSelect(callback: (property: IFormattedProperty) => void): void {
    this.onPropertySelect = callback;
  }

  /**
   * Select property
   * @param setName - Property set name
   * @param propertyName - Property name
   */
  public selectProperty(setName: string, propertyName: string): void {
    const prop = this.formattedProperties.find(
      p => p.setName === setName && p.name === propertyName
    );

    if (prop && this.onPropertySelect) {
      this.onPropertySelect(prop);
    }
  }

  /**
   * Get property count
   * @returns Number of properties
   */
  public getPropertyCount(): number {
    return this.formattedProperties.length;
  }

  /**
   * Get raw metadata
   * @returns BIM metadata or undefined
   */
  public getMetadata(): IBIMMetadata | undefined {
    return this.metadata;
  }
}
