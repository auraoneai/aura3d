/** A narrow controller keeps the DOM independent from graph storage and renderer ownership. */
export interface ShaderGraphPanelNode {
  readonly id: string;
  readonly op: string;
  readonly type: string;
  readonly inputs?: readonly string[];
  readonly value?: unknown;
  readonly name?: string;
  readonly resource?: string;
  readonly components?: string;
}

export interface ShaderGraphPanelGraph {
  readonly stage?: "material" | "compute";
  readonly nodes: readonly ShaderGraphPanelNode[];
  readonly outputs: Readonly<Record<string, string | undefined>>;
  readonly resources?: readonly { readonly name: string; readonly kind: string; readonly type?: string }[];
}

export interface ShaderGraphPanelDiagnostic {
  readonly message: string;
  readonly severity?: "error" | "warning" | "info";
  readonly nodeId?: string;
}

export type ShaderGraphPanelTextureKind = "texture2d" | "texture3d" | "depth2d";
export type ShaderGraphPanelResourceKind = "uniform" | ShaderGraphPanelTextureKind;

export interface ShaderGraphPanelState {
  readonly graph: ShaderGraphPanelGraph | null;
  readonly status: "empty" | "uncompiled" | "compiling" | "ready" | "error" | "unsupported";
  readonly diagnostics: readonly ShaderGraphPanelDiagnostic[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly bindings?: Readonly<Record<string, unknown>>;
  readonly textures?: readonly { readonly id: string; readonly label: string; readonly kind: ShaderGraphPanelTextureKind }[];
  readonly inspection?: {
    readonly status: "empty" | "compiled" | "error";
    readonly target: string;
    readonly shaderStages: readonly { readonly stage: string; readonly lines: number }[];
    readonly bindings: readonly { readonly kind: string; readonly group: number; readonly binding: number; readonly type: string | null }[];
    readonly outputs: readonly string[];
    readonly expressions: readonly { readonly nodeIndex: number; readonly expression: string }[];
    readonly diagnostics: readonly { readonly message: string; readonly nodeIndex: number | null }[];
    readonly requiresLighting: boolean | null;
  };
}

export interface ShaderGraphPanelOperation {
  readonly op: string;
  readonly label: string;
  readonly inputCount: number;
  readonly types: readonly string[];
}

export interface ShaderGraphPanelController {
  state(): ShaderGraphPanelState;
  operations(): readonly ShaderGraphPanelOperation[];
  inputPorts(id: string): readonly { readonly index: number; readonly name: string; readonly acceptedTypes: readonly string[]; readonly connectedNodeId: string | null }[];
  canConnect(from: string, to: string, input: number): boolean;
  create(): void | Promise<void>;
  addNode(op: string, type: string): void | Promise<void>;
  removeNode(id: string): void | Promise<void>;
  setValue(id: string, value: unknown): void | Promise<void>;
  setField(id: string, field: "name" | "resource" | "components", value: string): void | Promise<void>;
  setResource(name: string, kind: ShaderGraphPanelResourceKind, type: string): void | Promise<void>;
  removeResource(name: string): void | Promise<void>;
  setBinding(name: string, value: unknown): void | Promise<void>;
  importTexture(file: File): void | Promise<void>;
  connect(id: string, input: number, from: string | null): void | Promise<void>;
  setOutput(channel: string, id: string | null): void | Promise<void>;
  undo(): void | Promise<void>;
  redo(): void | Promise<void>;
  compile(): void | Promise<void>;
}

const outputChannels = ["color", "normal", "roughness", "metalness", "emissive", "opacity", "position"] as const;

/** Keyboard-operable graph authoring using the same controller as the live material. */
export class ShaderGraphPanel {
  readonly element = document.createElement("section");
  private error = "";
  /** Visible progress for an import that is still reading/decoding. */
  private pending: string | null = null;
  private selectedOperation = "";
  private selectedType = "";
  private resourceName = "";
  private resourceKind: ShaderGraphPanelResourceKind = "uniform";
  private resourceType = "f32";

  constructor(private readonly controller: ShaderGraphPanelController) {
    this.element.className = "panel shader-graph-panel";
    this.element.setAttribute("aria-label", "Shader graph");
    this.element.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-graph-action]");
      if (!button || !this.element.contains(button)) return;
      const action = button.dataset.graphAction;
      if (action === "create") void this.run(() => this.controller.create());
      if (action === "add") void this.run(() => this.controller.addNode(this.selectedOperation, this.selectedType));
      if (action === "undo") void this.run(() => this.controller.undo());
      if (action === "redo") void this.run(() => this.controller.redo());
      if (action === "compile") void this.run(() => this.controller.compile());
      if (action === "remove" && button.dataset.nodeId) void this.run(() => this.controller.removeNode(button.dataset.nodeId!));
      if (action === "add-resource") void this.run(() => this.controller.setResource(this.resourceName, this.resourceKind, this.resourceType));
      if (action === "remove-resource" && button.dataset.resourceName) void this.run(() => this.controller.removeResource(button.dataset.resourceName!));
    });
    this.element.addEventListener("change", (event) => this.change(event));
    this.element.addEventListener("keydown", (event) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      event.stopPropagation();
      void this.run(() => key === "y" || event.shiftKey ? this.controller.redo() : this.controller.undo());
    });
  }

  render(): void {
    const state = this.controller.state();
    const operations = this.controller.operations();
    if (!operations.some((entry) => entry.op === this.selectedOperation)) {
      this.selectedOperation = operations[0]?.op ?? "";
    }
    const operation = operations.find((entry) => entry.op === this.selectedOperation);
    if (!operation?.types.includes(this.selectedType)) this.selectedType = operation?.types[0] ?? "";
    const graph = state.graph;
    const diagnostics = [...state.diagnostics, ...(this.error ? [{ severity: "error" as const, message: this.error }] : [])];
    this.element.innerHTML = `
      <div class="panel-title"><span>Shader graph</span>
        <span><button type="button" data-graph-action="undo" ${state.canUndo ? "" : "disabled"}>Undo</button>
        <button type="button" data-graph-action="redo" ${state.canRedo ? "" : "disabled"}>Redo</button></span>
      </div>
      <div style="padding: 10px; display: grid; gap: 8px">
        ${graph?.stage === "compute" ? `
          <p class="muted">Compute graph editing and preview are unavailable here. The saved graph is preserved.</p>
          <fieldset><legend>Resources (read-only)</legend>${(graph.resources ?? []).map((resource) => `<p>${escapeHtml(resource.name)} (${escapeHtml(resource.kind)}${resource.type ? `, ${escapeHtml(resource.type)}` : ""})</p>`).join("") || "<p>None</p>"}</fieldset>` : graph ? `
          <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: end">
            <label>Operation<select data-graph-operation aria-label="Graph operation">
              ${operations.map((entry) => `<option value="${escapeHtml(entry.op)}" ${entry.op === this.selectedOperation ? "selected" : ""}>${escapeHtml(entry.label)}</option>`).join("")}
            </select></label>
            <label>Value type<select data-graph-type aria-label="Graph value type">
              ${(operation?.types ?? []).map((type) => `<option value="${escapeHtml(type)}" ${type === this.selectedType ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}
            </select></label>
            <button type="button" data-graph-action="add" ${operation ? "" : "disabled"}>Add node</button>
            <button type="button" data-graph-action="compile">Compile graph</button>
          </div>
          <div data-role="graph-nodes">${graph.nodes.length ? graph.nodes.map((node) => this.nodeMarkup(node, graph)).join("") : `<p class="muted">No nodes. Add a node to start the graph.</p>`}</div>
          <fieldset><legend>Material outputs</legend>
            ${outputChannels.map((channel) => `<label>${escapeHtml(channel)}
              <select data-graph-output="${channel}" aria-label="${escapeHtml(channel)} output">
                <option value="">None</option>${graph.nodes.filter((node) => outputTypes(channel).includes(node.type) || graph.outputs[channel] === node.id).map((node) => `<option value="${escapeHtml(node.id)}" ${graph.outputs[channel] === node.id ? "selected" : ""}>${escapeHtml(node.id)} (${escapeHtml(node.type)})</option>`).join("")}
              </select></label>`).join("")}
          </fieldset>
          <fieldset><legend>Resources</legend>
            <label>Import texture (2D image) <input type="file" accept="image/*" data-graph-import-texture aria-label="Import texture" ${this.pending ? 'disabled aria-busy="true"' : ""}></label>
            <label>Name <input data-resource-name aria-label="Resource name" value="${escapeHtml(this.resourceName)}"></label>
            <label>Kind <select data-resource-kind aria-label="Resource kind"><option value="uniform" ${this.resourceKind === "uniform" ? "selected" : ""}>Uniform</option><option value="texture2d" ${this.resourceKind === "texture2d" ? "selected" : ""}>Texture 2D</option><option value="texture3d" ${this.resourceKind === "texture3d" ? "selected" : ""}>Texture 3D</option><option value="depth2d" ${this.resourceKind === "depth2d" ? "selected" : ""}>Depth texture 2D</option></select></label>
            ${this.resourceKind === "uniform" ? `<label>Type <select data-resource-type aria-label="Resource type">${["f32", "i32", "u32", "bool", "vec2", "vec3", "vec4"].map((type) => `<option value="${type}" ${this.resourceType === type ? "selected" : ""}>${type}</option>`).join("")}</select></label>` : ""}
            <button type="button" data-graph-action="add-resource">Add resource</button>
            ${(graph.resources ?? []).map((resource) => `<div style="grid-column: 1 / -1; display: grid; gap: 4px; border-bottom: 1px solid #d8dde5; padding: 4px 0">
              <span>${escapeHtml(resource.name)} (${escapeHtml(resource.kind)}${resource.type ? `, ${escapeHtml(resource.type)}` : ""})</span>
              ${resourceBindingMarkup(resource, state)}
              <button type="button" data-graph-action="remove-resource" data-resource-name="${escapeHtml(resource.name)}" aria-label="Remove resource ${escapeHtml(resource.name)}">Remove resource</button></div>`).join("")}
          </fieldset>` : `
          <p class="muted">${state.status === "unsupported" ? "Shader graph editing is unavailable for this material." : "No graph is assigned to the selected material."}</p>
          <button type="button" data-graph-action="create" ${state.status === "unsupported" ? "disabled" : ""}>Create graph</button>`}
        <div role="status" aria-live="polite" data-role="graph-status"${this.pending ? ' data-state="loading" aria-busy="true"' : ""}>${escapeHtml(this.pending ?? statusText(state.status))}</div>
        <div role="alert" data-role="graph-diagnostics">${diagnostics.map((entry) => `<p>${escapeHtml(entry.severity ?? "error")}: ${entry.nodeId ? `${escapeHtml(entry.nodeId)}: ` : ""}${escapeHtml(entry.message)}</p>`).join("")}</div>
        ${state.inspection ? inspectionMarkup(state.inspection) : ""}
      </div>`;
  }

  private nodeMarkup(node: ShaderGraphPanelNode, graph: ShaderGraphPanelGraph): string {
    const ports = this.controller.inputPorts(node.id);
    const inputs = ports.map((port) => `<label>${escapeHtml(port.name)} (${escapeHtml(port.acceptedTypes.join(", ") || "select a compatible resource")})
      <select data-graph-input="${port.index}" data-node-id="${escapeHtml(node.id)}" aria-label="${escapeHtml(node.id)} ${escapeHtml(port.name.toLowerCase())}">
        <option value="">Disconnected</option>
        ${graph.nodes.filter((candidate) => candidate.id !== node.id && (this.controller.canConnect(candidate.id, node.id, port.index) || port.connectedNodeId === candidate.id)).map((candidate) => `<option value="${escapeHtml(candidate.id)}" ${port.connectedNodeId === candidate.id ? "selected" : ""}>${escapeHtml(candidate.id)} (${escapeHtml(candidate.type)})</option>`).join("")}
      </select></label>`).join("");
    const value = node.value === undefined ? "" : `<label>Value <input data-graph-value data-node-id="${escapeHtml(node.id)}" aria-label="${escapeHtml(node.id)} value" value="${escapeHtml(formatValue(node.value))}"></label>`;
    const fields: readonly ("name" | "resource" | "components")[] = node.op === "input" || node.op === "local" ? ["name"] : node.op === "uniform" || node.op === "textureSample" || node.op === "textureLoad" || node.op === "storageLoad" ? ["resource"] : node.op === "swizzle" ? ["components"] : [];
    const details = fields.map((field) => `<label>${escapeHtml(field)} <input data-graph-field="${field}" data-node-id="${escapeHtml(node.id)}" aria-label="${escapeHtml(node.id)} ${field}" value="${escapeHtml(node[field] ?? "")}"></label>`).join("");
    const hint = node.op === "textureLoad" && graph.resources?.find((resource) => resource.name === node.resource)?.kind === "depth2d"
      ? `<p class="muted">Depth pixels use a lower-left origin at mip 0.</p>` : "";
    return `<div data-graph-node="${escapeHtml(node.id)}" style="border-bottom: 1px solid #d8dde5; padding: 8px 0; display: grid; gap: 8px">
      <div style="display: flex; gap: 8px; align-items: center; justify-content: space-between"><span>${escapeHtml(node.id)}: ${escapeHtml(node.op)} (${escapeHtml(node.type)})</span><button type="button" data-graph-action="remove" data-node-id="${escapeHtml(node.id)}" aria-label="Remove ${escapeHtml(node.id)}">Remove</button></div>
      ${value}${details}${hint}${inputs}
    </div>`;
  }

  private change(event: Event): void {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (input instanceof HTMLInputElement && input.hasAttribute("data-graph-import-texture")) {
      const file = input.files?.[0];
      if (file) {
        if (this.pending) return;
        void this.run(() => this.controller.importTexture(file), `Importing texture ${file.name || "image"}…`);
      }
      return;
    }
    if (input.hasAttribute("data-graph-operation")) {
      this.selectedOperation = input.value;
      this.selectedType = "";
      this.render();
      this.element.querySelector<HTMLSelectElement>("[data-graph-operation]")?.focus();
      return;
    }
    if (input.hasAttribute("data-graph-type")) {
      this.selectedType = input.value;
      return;
    }
    if (input.hasAttribute("data-resource-name")) { this.resourceName = input.value; return; }
    if (input.hasAttribute("data-resource-kind")) {
      this.resourceKind = isTextureKind(input.value) ? input.value : "uniform";
      this.render();
      this.element.querySelector<HTMLSelectElement>("[data-resource-kind]")?.focus();
      return;
    }
    if (input.hasAttribute("data-resource-type")) { this.resourceType = input.value; return; }
    if (input.dataset.resourceBinding) {
      const resource = this.controller.state().graph?.resources?.find((entry) => entry.name === input.dataset.resourceBinding);
      try {
        if (!resource) throw new Error("Resource is no longer available.");
        if (resource.kind !== "uniform" && !isTextureKind(resource.kind)) throw new Error("This resource cannot be bound from the material editor.");
        const value = isTextureKind(resource.kind) ? input.value || null : parseResourceValue(input.value, resource.type ?? "");
        void this.run(() => this.controller.setBinding(input.dataset.resourceBinding!, value));
      } catch (error) {
        this.error = errorMessage(error);
        this.render();
      }
      return;
    }
    const id = input.dataset.nodeId;
    if (id && input.hasAttribute("data-graph-value")) {
      const node = this.controller.state().graph?.nodes.find((entry) => entry.id === id);
      try {
        const value = parseValue(input.value, node?.value);
        void this.run(() => this.controller.setValue(id, value));
      } catch (error) {
        this.error = errorMessage(error);
        this.render();
      }
    } else if (id && (input.dataset.graphField === "name" || input.dataset.graphField === "resource" || input.dataset.graphField === "components")) {
      const field = input.dataset.graphField;
      void this.run(() => this.controller.setField(id, field, input.value));
    } else if (id && input.dataset.graphInput !== undefined) {
      void this.run(() => this.controller.connect(id, Number(input.dataset.graphInput), input.value || null));
    } else if (input.dataset.graphOutput) {
      void this.run(() => this.controller.setOutput(input.dataset.graphOutput!, input.value || null));
    }
  }

  private async run(action: () => void | Promise<void>, pending?: string): Promise<void> {
    const focused = document.activeElement instanceof HTMLElement && this.element.contains(document.activeElement)
      ? focusKey(document.activeElement) : null;
    this.error = "";
    if (pending) {
      this.pending = pending;
      this.render();
    }
    try {
      await action();
    } catch (error) {
      this.error = pending ? `${pending.replace(/…$/, "")} failed: ${errorMessage(error)}` : errorMessage(error);
    } finally {
      if (pending) this.pending = null;
    }
    this.render();
    if (focused) {
      const match = Array.from(this.element.querySelectorAll<HTMLElement>("button, input, select")).find((element) => focusKey(element) === focused);
      match?.focus();
    }
  }
}

function isTextureKind(kind: string): kind is ShaderGraphPanelTextureKind {
  return kind === "texture2d" || kind === "texture3d" || kind === "depth2d";
}

function resourceBindingMarkup(resource: NonNullable<ShaderGraphPanelGraph["resources"]>[number], state: ShaderGraphPanelState): string {
  const binding = state.bindings?.[resource.name];
  if (resource.kind === "uniform") {
    if (!["f32", "i32", "u32", "bool", "vec2", "vec3", "vec4"].includes(resource.type ?? "")) {
      return `<p class="muted">This uniform type is unavailable in the material editor.</p>`;
    }
    const warning = typeof binding === "string" ? `<p class="muted">The saved binding is not a uniform value.</p>` : "";
    return `${warning}<label>Uniform value <input data-resource-binding="${escapeHtml(resource.name)}" aria-label="${escapeHtml(resource.name)} binding" value="${escapeHtml(formatValue(typeof binding === "string" ? "" : binding ?? ""))}"></label>`;
  }
  if (isTextureKind(resource.kind)) {
    const choices = (state.textures ?? []).filter((texture) => texture.kind === resource.kind);
    const selected = typeof binding === "string" ? binding : undefined;
    const missing = selected !== undefined && !choices.some((texture) => texture.id === selected);
    const invalid = binding !== undefined && typeof binding !== "string";
    const description = { texture2d: "2D color", texture3d: "3D color", depth2d: "2D depth" }[resource.kind];
    const status = invalid ? `<p class="muted">The saved binding is not a texture.</p>` : choices.length ? "" : `<p class="muted">No compatible live ${description} texture is available.</p>`;
    return `${status}<label>Texture binding <select data-resource-binding="${escapeHtml(resource.name)}" aria-label="${escapeHtml(resource.name)} binding"><option value="" ${selected === undefined && !invalid ? "selected" : ""}>Unbound</option>${invalid ? `<option selected disabled>Invalid saved binding</option>` : ""}${missing ? `<option value="${escapeHtml(selected ?? "")}" selected disabled>Saved texture unavailable: ${escapeHtml(selected ?? "")}</option>` : ""}${choices.map((texture) => `<option value="${escapeHtml(texture.id)}" ${selected === texture.id ? "selected" : ""}>${escapeHtml(texture.label)}</option>`).join("")}</select></label>`;
  }
  return `<p class="muted">Binding unavailable for this resource in the material editor.</p>`;
}

function inspectionMarkup(inspection: NonNullable<ShaderGraphPanelState["inspection"]>): string {
  const stages = inspection.shaderStages.map((stage) => `${escapeHtml(stage.stage)}: ${stage.lines} lines`).join(", ") || "Unavailable";
  const bindings = inspection.bindings.map((binding) => `<li>${escapeHtml(binding.kind)}${binding.type ? ` (${escapeHtml(binding.type)})` : ""}, group ${binding.group}, binding ${binding.binding}</li>`).join("");
  const expressions = inspection.expressions.map((entry) => `<li>Node ${entry.nodeIndex + 1}: <code>${escapeHtml(entry.expression)}</code></li>`).join("");
  const diagnostics = inspection.diagnostics.map((entry) => `<li>${entry.nodeIndex === null ? "Graph" : `Node ${entry.nodeIndex + 1}`}: ${escapeHtml(entry.message)}</li>`).join("");
  return `<details data-role="graph-compiler-inspection"><summary>Compiler inspection</summary>
    <p>${escapeHtml(inspection.target)}: ${escapeHtml(inspection.status)}. Stages: ${stages}.</p>
    <p>Outputs: ${inspection.outputs.length ? inspection.outputs.map(escapeHtml).join(", ") : "None"}. Lighting: ${inspection.requiresLighting === null ? "Unavailable" : inspection.requiresLighting ? "Required" : "Not required"}.</p>
    ${bindings ? `<p>Bindings</p><ul>${bindings}</ul>` : ""}
    ${expressions ? `<p>Expressions (values and identifiers hidden)</p><ul>${expressions}</ul>` : ""}
    ${diagnostics ? `<ul>${diagnostics}</ul>` : ""}
  </details>`;
}

function focusKey(element: HTMLElement): string | null {
  const data = element.dataset;
  if (data.graphAction) return `action:${data.graphAction}:${data.nodeId ?? data.resourceName ?? ""}`;
  if (data.graphValue !== undefined) return `value:${data.nodeId ?? ""}`;
  if (data.graphField) return `field:${data.nodeId ?? ""}:${data.graphField}`;
  if (data.graphInput !== undefined) return `input:${data.nodeId ?? ""}:${data.graphInput}`;
  if (data.graphOutput) return `output:${data.graphOutput}`;
  if (data.resourceBinding) return `binding:${data.resourceBinding}`;
  return null;
}

function parseValue(text: string, current: unknown): unknown {
  if (typeof current === "boolean") {
    if (text.trim() !== "true" && text.trim() !== "false") throw new Error("Enter true or false.");
    return text.trim() === "true";
  }
  const values = text.split(",").map((value) => value.trim());
  if (values.some((value) => value === "" || !Number.isFinite(Number(value)))) throw new Error("Enter finite numbers separated by commas.");
  if (Array.isArray(current) && values.length !== current.length) throw new Error(`Enter ${current.length} numeric components.`);
  if (!Array.isArray(current) && values.length !== 1) throw new Error("Enter one numeric value.");
  return Array.isArray(current) ? values.map(Number) : Number(values[0]);
}

function formatValue(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function parseResourceValue(value: string, type: string): number | boolean | readonly number[] {
  if (type === "bool") return validateGraphUniformValue(parseValue(value, false), type);
  const width = type === "vec2" ? 2 : type === "vec3" ? 3 : type === "vec4" ? 4 : 1;
  const parsed = parseValue(value, width === 1 ? 0 : Array.from({ length: width }, () => 0));
  return validateGraphUniformValue(parsed, type);
}

/** Apply the material binding contract before changing the persisted graph. */
export function validateGraphUniformValue(value: unknown, type: string): number | boolean | readonly number[] {
  if (type === "bool") {
    if (typeof value !== "boolean") throw new Error("Enter true or false.");
    return value;
  }
  const widths: Readonly<Record<string, number>> = { f32: 1, i32: 1, u32: 1, vec2: 2, vec3: 3, vec4: 4 };
  const width = Object.hasOwn(widths, type) ? widths[type] : undefined;
  if (!width) throw new Error(`Uniform type ${type} is not supported by the material editor.`);
  const values = Array.isArray(value) ? value : [value];
  if ((width === 1 && Array.isArray(value)) || (width > 1 && !Array.isArray(value)) || values.length !== width ||
      values.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
    throw new Error(`Enter ${width === 1 ? "one finite number" : `${width} finite numeric components`} for ${type}.`);
  }
  const scalar = values[0] as number;
  if (type === "i32" && (!Number.isInteger(scalar) || scalar < -2147483648 || scalar > 2147483647)) {
    throw new Error("Enter an i32 integer between -2147483648 and 2147483647.");
  }
  if (type === "u32" && (!Number.isInteger(scalar) || scalar < 0 || scalar > 4294967295)) {
    throw new Error("Enter a u32 integer between 0 and 4294967295.");
  }
  return width === 1 ? scalar : [...values] as number[];
}

function statusText(status: ShaderGraphPanelState["status"]): string {
  switch (status) {
    case "empty": return "No graph";
    case "uncompiled": return "Graph has uncompiled changes";
    case "compiling": return "Compiling graph";
    case "ready": return "Graph compiled";
    case "error": return "Graph has errors; the last valid material remains active";
    case "unsupported": return "Graph editing is unsupported";
  }
}

function outputTypes(channel: typeof outputChannels[number]): readonly string[] {
  if (channel === "color") return ["vec3", "vec4"];
  if (channel === "normal" || channel === "emissive" || channel === "position") return ["vec3"];
  return ["f32"];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
