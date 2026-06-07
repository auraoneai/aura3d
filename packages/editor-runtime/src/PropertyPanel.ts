import { CommandHistory } from "./CommandHistory";
import { InspectorModel, type InspectorEditableValue, type InspectorProperty } from "./InspectorModel";

export interface PropertyPanelField extends InspectorProperty {
  readonly label: string;
}

export interface PropertyPanelOptions {
  readonly history?: CommandHistory;
  readonly inspector?: InspectorModel;
  readonly onEdit?: (path: readonly string[], value: InspectorEditableValue) => void;
}

export class PropertyPanel {
  readonly history: CommandHistory;
  readonly inspector: InspectorModel;
  private disposers: (() => void)[] = [];

  constructor(options: PropertyPanelOptions = {}) {
    this.history = options.history ?? new CommandHistory();
    this.inspector = options.inspector ?? new InspectorModel();
  }

  describe(target: object): readonly PropertyPanelField[] {
    return this.inspector.describe(target).map((property) => ({
      ...property,
      label: property.path.join(".")
    }));
  }

  async edit(target: object, path: readonly string[], value: InspectorEditableValue): Promise<void> {
    await this.history.execute(this.inspector.createSetPropertyCommand(target, path, value));
  }

  render(target: object | undefined, container: HTMLElement, options: Pick<PropertyPanelOptions, "onEdit"> = {}): readonly PropertyPanelField[] {
    this.dispose();
    container.replaceChildren();
    if (!target) return [];
    const fields = this.describe(target);
    const documentRef = container.ownerDocument;
    for (const field of fields) {
      const row = documentRef.createElement("label");
      row.className = "aura-property-panel__row";
      const name = documentRef.createElement("span");
      name.className = "aura-property-panel__label";
      name.textContent = field.label;
      row.append(name);
      if (field.editable) {
        const input = documentRef.createElement("input");
        input.className = "aura-property-panel__input";
        input.name = field.label;
        input.value = String(field.value);
        input.type = field.type === "number" ? "number" : field.type === "boolean" ? "checkbox" : "text";
        if (field.type === "boolean") input.checked = Boolean(field.value);
        const change = (): void => {
          const value = parseInput(input, field.type);
          void this.edit(target, field.path, value).then(() => options.onEdit?.(field.path, value));
        };
        input.addEventListener("change", change);
        this.disposers.push(() => input.removeEventListener("change", change));
        row.append(input);
      } else {
        const value = documentRef.createElement("span");
        value.className = "aura-property-panel__value";
        value.textContent = field.type;
        row.append(value);
      }
      container.append(row);
    }
    return fields;
  }

  dispose(): void {
    for (const dispose of this.disposers.splice(0)) dispose();
  }
}

function parseInput(input: HTMLInputElement, type: InspectorProperty["type"]): InspectorEditableValue {
  if (type === "number") return Number(input.value);
  if (type === "boolean") return input.checked;
  return input.value;
}
