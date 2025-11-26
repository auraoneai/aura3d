/**
 * @fileoverview Built-in component inspectors for common components.
 * @module editor/inspectors/ComponentInspectors
 */

import { IComponentInspector, InspectorRegistry } from './InspectorRegistry';
import { IComponent } from '../../ecs/Component';
import { Entity } from '../../ecs/Entity';
import { Transform } from '../../math/Transform';
import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';

/**
 * Transform component inspector
 */
export class TransformInspector implements IComponentInspector {
  public componentType = Transform;

  public render(component: IComponent, entity: Entity): HTMLElement {
    const transform = component as Transform;
    const container = document.createElement('div');
    container.className = 'inspector-transform';

    // Title
    const title = document.createElement('h3');
    title.textContent = 'Transform';
    container.appendChild(title);

    // Position
    const positionGroup = this.createVector3Field(
      'Position',
      transform.position,
      (newValue) => {
        transform.position.copy(newValue);
      }
    );
    container.appendChild(positionGroup);

    // Rotation (as Euler angles)
    const eulerAngles = transform.rotation.toEuler();
    const rotationGroup = this.createVector3Field(
      'Rotation',
      eulerAngles,
      (newValue) => {
        transform.rotation = Quaternion.fromEuler(newValue.x, newValue.y, newValue.z);
      },
      true // Convert to degrees
    );
    container.appendChild(rotationGroup);

    // Scale
    const scaleGroup = this.createVector3Field(
      'Scale',
      transform.scale,
      (newValue) => {
        transform.scale.copy(newValue);
      }
    );
    container.appendChild(scaleGroup);

    return container;
  }

  private createVector3Field(
    label: string,
    value: Vector3,
    onChange: (newValue: Vector3) => void,
    useDegrees: boolean = false
  ): HTMLElement {
    const group = document.createElement('div');
    group.className = 'inspector-vector3-field';

    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    group.appendChild(labelElement);

    const fieldsContainer = document.createElement('div');
    fieldsContainer.className = 'vector3-fields';

    const createInput = (axis: 'x' | 'y' | 'z') => {
      const wrapper = document.createElement('div');
      wrapper.className = 'axis-field';

      const axisLabel = document.createElement('span');
      axisLabel.textContent = axis.toUpperCase();
      axisLabel.className = `axis-label axis-${axis}`;
      wrapper.appendChild(axisLabel);

      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.01';

      let displayValue = value[axis];
      if (useDegrees) {
        displayValue = (displayValue * 180) / Math.PI;
      }

      input.value = displayValue.toFixed(3);

      input.onchange = () => {
        let newValue = parseFloat(input.value);
        if (useDegrees) {
          newValue = (newValue * Math.PI) / 180;
        }

        const updated = value.clone();
        updated[axis] = newValue;
        onChange(updated);
      };

      wrapper.appendChild(input);
      return wrapper;
    };

    fieldsContainer.appendChild(createInput('x'));
    fieldsContainer.appendChild(createInput('y'));
    fieldsContainer.appendChild(createInput('z'));

    group.appendChild(fieldsContainer);
    return group;
  }
}

/**
 * Material inspector (placeholder for Material component)
 */
export class MaterialInspector implements IComponentInspector {
  public componentType: any = Object; // Would be Material

  public render(component: IComponent, entity: Entity): HTMLElement {
    const container = document.createElement('div');
    container.className = 'inspector-material';

    const title = document.createElement('h3');
    title.textContent = 'Material';
    container.appendChild(title);

    // Color picker
    const colorGroup = this.createColorField(
      'Color',
      { r: 1, g: 1, b: 1, a: 1 },
      (newValue) => {
        (component as any).color = newValue;
      }
    );
    container.appendChild(colorGroup);

    // Metallic slider
    const metallicGroup = this.createSliderField(
      'Metallic',
      0.5,
      0,
      1,
      (newValue) => {
        (component as any).metallic = newValue;
      }
    );
    container.appendChild(metallicGroup);

    // Roughness slider
    const roughnessGroup = this.createSliderField(
      'Roughness',
      0.5,
      0,
      1,
      (newValue) => {
        (component as any).roughness = newValue;
      }
    );
    container.appendChild(roughnessGroup);

    return container;
  }

  private createColorField(
    label: string,
    value: { r: number; g: number; b: number; a: number },
    onChange: (newValue: any) => void
  ): HTMLElement {
    const group = document.createElement('div');
    group.className = 'inspector-color-field';

    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    group.appendChild(labelElement);

    const input = document.createElement('input');
    input.type = 'color';
    input.value = this.rgbToHex(value.r, value.g, value.b);

    input.onchange = () => {
      const rgb = this.hexToRgb(input.value);
      onChange({ ...rgb, a: value.a });
    };

    group.appendChild(input);
    return group;
  }

  private createSliderField(
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (newValue: number) => void
  ): HTMLElement {
    const group = document.createElement('div');
    group.className = 'inspector-slider-field';

    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    group.appendChild(labelElement);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = '0.01';
    input.value = String(value);

    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = value.toFixed(2);

    input.oninput = () => {
      valueDisplay.textContent = parseFloat(input.value).toFixed(2);
      onChange(parseFloat(input.value));
    };

    group.appendChild(input);
    group.appendChild(valueDisplay);
    return group;
  }

  private rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) => {
      const hex = Math.round(n * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16) / 255,
          g: parseInt(result[2], 16) / 255,
          b: parseInt(result[3], 16) / 255
        }
      : { r: 0, g: 0, b: 0 };
  }
}

/**
 * Light inspector (placeholder for Light component)
 */
export class LightInspector implements IComponentInspector {
  public componentType: any = Object; // Would be Light

  public render(component: IComponent, entity: Entity): HTMLElement {
    const container = document.createElement('div');
    container.className = 'inspector-light';

    const title = document.createElement('h3');
    title.textContent = 'Light';
    container.appendChild(title);

    // Light type dropdown
    const typeGroup = this.createDropdownField(
      'Type',
      'directional',
      ['directional', 'point', 'spot'],
      (newValue) => {
        (component as any).type = newValue;
      }
    );
    container.appendChild(typeGroup);

    // Color
    const colorGroup = this.createColorField('Color', { r: 1, g: 1, b: 1 }, (newValue) => {
      (component as any).color = newValue;
    });
    container.appendChild(colorGroup);

    // Intensity slider
    const intensityGroup = this.createNumberField(
      'Intensity',
      1,
      0,
      10,
      (newValue) => {
        (component as any).intensity = newValue;
      }
    );
    container.appendChild(intensityGroup);

    return container;
  }

  private createDropdownField(
    label: string,
    value: string,
    options: string[],
    onChange: (newValue: string) => void
  ): HTMLElement {
    const group = document.createElement('div');
    group.className = 'inspector-dropdown-field';

    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    group.appendChild(labelElement);

    const select = document.createElement('select');
    options.forEach(option => {
      const optionElement = document.createElement('option');
      optionElement.value = option;
      optionElement.textContent = option;
      if (option === value) {
        optionElement.selected = true;
      }
      select.appendChild(optionElement);
    });

    select.onchange = () => onChange(select.value);

    group.appendChild(select);
    return group;
  }

  private createColorField(
    label: string,
    value: { r: number; g: number; b: number },
    onChange: (newValue: any) => void
  ): HTMLElement {
    const group = document.createElement('div');
    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    group.appendChild(labelElement);

    const input = document.createElement('input');
    input.type = 'color';
    input.onchange = () => onChange(input.value);
    group.appendChild(input);

    return group;
  }

  private createNumberField(
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (newValue: number) => void
  ): HTMLElement {
    const group = document.createElement('div');
    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    group.appendChild(labelElement);

    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = '0.1';
    input.value = String(value);
    input.onchange = () => onChange(parseFloat(input.value));
    group.appendChild(input);

    return group;
  }
}

/**
 * Camera inspector (placeholder for Camera component)
 */
export class CameraInspector implements IComponentInspector {
  public componentType: any = Object; // Would be Camera

  public render(component: IComponent, entity: Entity): HTMLElement {
    const container = document.createElement('div');
    container.className = 'inspector-camera';

    const title = document.createElement('h3');
    title.textContent = 'Camera';
    container.appendChild(title);

    // FOV
    const fovGroup = this.createNumberField('Field of View', 60, 1, 179, (newValue) => {
      (component as any).fov = newValue;
    });
    container.appendChild(fovGroup);

    // Near plane
    const nearGroup = this.createNumberField('Near Plane', 0.1, 0.01, 100, (newValue) => {
      (component as any).near = newValue;
    });
    container.appendChild(nearGroup);

    // Far plane
    const farGroup = this.createNumberField('Far Plane', 1000, 1, 10000, (newValue) => {
      (component as any).far = newValue;
    });
    container.appendChild(farGroup);

    return container;
  }

  private createNumberField(
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (newValue: number) => void
  ): HTMLElement {
    const group = document.createElement('div');
    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    group.appendChild(labelElement);

    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.onchange = () => onChange(parseFloat(input.value));
    group.appendChild(input);

    return group;
  }
}

/**
 * Registers all built-in component inspectors
 */
export function registerBuiltInInspectors(): void {
  InspectorRegistry.registerInspector(new TransformInspector());
  // Material, Light, Camera would be registered when those components exist
  // InspectorRegistry.registerInspector(new MaterialInspector());
  // InspectorRegistry.registerInspector(new LightInspector());
  // InspectorRegistry.registerInspector(new CameraInspector());
}
