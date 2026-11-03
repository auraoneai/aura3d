import { TransformCommand, type Command } from "@aura3d/editor-runtime";
import type { EditorProjectNode } from "../project/ProjectSerializer";
import type { EditorShell } from "../EditorShell";
import { capturePanelFocus, restorePanelFocus } from "./PanelFocus";

let inspectorSequence = 0;

export class InspectorPanel {
  readonly element = document.createElement("section");
  private readonly title = document.createElement("div");
  private readonly status = document.createElement("div");
  private readonly error = document.createElement("div");
  private readonly fields = document.createElement("div");
  private readonly errorId = `editor-inspector-error-${++inspectorSequence}`;
  private displayedScene: EditorShell["scene"] | undefined;
  private displayedNodeId: string | null | undefined;
  private readonly fieldErrors = new Map<string, { readonly id: string; readonly value: string | boolean; readonly message: string }>();
  private readonly latestEdits = new Map<string, number>();
  private fieldErrorSequence = 0;
  private editSequence = 0;

  constructor(private readonly shell: EditorShell) {
    this.element.className = "panel inspector-panel";
    this.element.setAttribute("aria-label", "Inspector");
    this.title.className = "panel-title";
    this.status.className = "panel-feedback";
    this.status.setAttribute("role", "status");
    this.error.className = "panel-feedback";
    this.error.id = this.errorId;
    this.error.setAttribute("role", "alert");
    this.element.append(this.title, this.status, this.error, this.fields);
    this.element.addEventListener("input", (event) => {
      const input = event.target as HTMLInputElement | HTMLSelectElement;
      const path = input.dataset.path;
      const fieldError = path ? this.fieldErrors.get(path) : undefined;
      if (path && fieldError && this.shell.scene === this.displayedScene && this.shell.selectedProjectNode()?.id === this.displayedNodeId) {
        this.fieldErrors.set(path, {
          ...fieldError,
          value: input.type === "checkbox" ? (input as HTMLInputElement).checked : input.value
        });
      }
    });
    this.element.addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement | HTMLSelectElement;
      const path = input.dataset.path;
      const node = this.shell.selectedProjectNode();
      if (!path || !node) return;
      const scene = this.shell.scene;
      const value = input.type === "checkbox" ? (input as HTMLInputElement).checked : input.value;
      const edit = ++this.editSequence;
      const editKey = JSON.stringify([node.id, path]);
      this.latestEdits.set(editKey, edit);
      this.status.textContent = "";
      this.error.textContent = "";
      const previousError = this.fieldErrors.get(path);
      if (previousError) {
        this.fieldErrors.delete(path);
        input.removeAttribute("aria-invalid");
        input.removeAttribute("aria-describedby");
        document.getElementById(previousError.id)?.remove();
      }
      void this.updateField(path, value).then(() => {
        if (this.latestEdits.get(editKey) !== edit) return;
        this.latestEdits.delete(editKey);
        if (this.shell.scene === scene) this.status.textContent = `Updated ${path} on ${node.name}.`;
        else this.error.textContent = `The scene changed while updating ${path} on ${node.name}. Check the current project.`;
      }).catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.shell.addConsoleMessage("error", reason);
        if (this.latestEdits.get(editKey) !== edit) return;
        this.latestEdits.delete(editKey);
        if (this.shell.scene === scene && this.shell.selectedProjectNode()?.id === node.id) {
          this.fieldErrors.set(path, { id: `${this.errorId}-field-${++this.fieldErrorSequence}`, value, message: reason });
        }
        this.shell.refresh();
        this.error.textContent = `Could not update ${path} on ${node.name}: ${reason}`;
      });
    });
  }

  render(): void {
    const focused = capturePanelFocus(this.element);
    const node = this.shell.selectedProjectNode();
    const nodeId = node?.id ?? null;
    if (nodeId !== this.displayedNodeId || this.displayedScene !== this.shell.scene) {
      this.displayedScene = this.shell.scene;
      this.displayedNodeId = nodeId;
      this.fieldErrors.clear();
      this.error.textContent = "";
      this.status.textContent = node ? "" : "Select a node to edit authoring fields.";
    }
    if (!node) {
      this.title.innerHTML = "<span>Inspector</span>";
      this.fields.innerHTML = "";
      return;
    }
    const pivot = node.transform.pivot ?? [0, 0, 0];
    this.title.innerHTML = `<span>Inspector</span><strong>${escapeHtml(node.name)}</strong>`;
    this.fields.innerHTML = `
      <fieldset>
        <legend>Transform</legend>
        ${axisInput("position", "X", node.transform.position[0])}
        ${axisInput("position", "Y", node.transform.position[1])}
        ${axisInput("position", "Z", node.transform.position[2])}
        ${axisInput("rotation", "X", node.transform.rotation[0])}
        ${axisInput("rotation", "Y", node.transform.rotation[1])}
        ${axisInput("rotation", "Z", node.transform.rotation[2])}
        ${axisInput("rotation", "W", node.transform.rotation[3])}
        ${axisInput("scale", "X", node.transform.scale[0])}
        ${axisInput("scale", "Y", node.transform.scale[1])}
        ${axisInput("scale", "Z", node.transform.scale[2])}
        ${axisInput("pivot", "X", pivot[0])}
        ${axisInput("pivot", "Y", pivot[1])}
        ${axisInput("pivot", "Z", pivot[2])}
      </fieldset>
      <fieldset>
        <legend>Mesh Renderer</legend>
        <label><input data-path="mesh.enabled" type="checkbox" ${node.mesh.enabled ? "checked" : ""}> Enabled</label>
        <label>Primitive <select data-path="mesh.primitive">${option("cube", node.mesh.primitive)}${option("quad", node.mesh.primitive)}${option("imported", node.mesh.primitive)}</select></label>
        <label>Asset <select data-path="mesh.assetId">
          ${option("", node.mesh.assetId ?? "")}
          ${this.shell.project.assets.map((asset) => option(asset.id, node.mesh.assetId ?? "")).join("")}
        </select></label>
      </fieldset>
      <fieldset>
        <legend>Material</legend>
        <label>Name <input data-path="material.name" value="${escapeHtml(node.material.name)}"></label>
        <label>Base color <input data-path="material.baseColor" value="${escapeHtml(node.material.baseColor)}"></label>
        <label>Metallic <input data-path="material.metallic" type="number" step="0.1" value="${node.material.metallic}"></label>
        <label>Roughness <input data-path="material.roughness" type="number" step="0.1" value="${node.material.roughness}"></label>
        <label>Base texture <input data-path="material.textureSlots.baseColor" value="${escapeHtml(node.material.textureSlots.baseColor)}"></label>
        <label>Normal texture <input data-path="material.textureSlots.normal" value="${escapeHtml(node.material.textureSlots.normal)}"></label>
        <label>MR texture <input data-path="material.textureSlots.metallicRoughness" value="${escapeHtml(node.material.textureSlots.metallicRoughness)}"></label>
        <label>Emissive texture <input data-path="material.textureSlots.emissive" value="${escapeHtml(node.material.textureSlots.emissive)}"></label>
      </fieldset>
      <fieldset>
        <legend>Light</legend>
        <label>Kind <select data-path="light.kind">${option("none", node.light.kind)}${option("directional", node.light.kind)}${option("point", node.light.kind)}${option("spot", node.light.kind)}</select></label>
        <label>Intensity <input data-path="light.intensity" type="number" step="0.1" value="${node.light.intensity}"></label>
      </fieldset>
      <fieldset>
        <legend>Camera</legend>
        <label><input data-path="camera.enabled" type="checkbox" ${node.camera.enabled ? "checked" : ""}> Enabled</label>
        <label>FOV <input data-path="camera.fov" type="number" value="${node.camera.fov}"></label>
      </fieldset>
      <fieldset>
        <legend>Physics</legend>
        <label>Body <select data-path="physics.body">${option("none", node.physics.body)}${option("static", node.physics.body)}${option("dynamic", node.physics.body)}</select></label>
        <label>Collider <select data-path="physics.collider">${option("none", node.physics.collider)}${option("box", node.physics.collider)}${option("sphere", node.physics.collider)}</select></label>
        <label>Friction <input data-path="physics.friction" type="number" min="0" max="1" step="0.05" value="${node.physics.friction}"></label>
        <label>Restitution <input data-path="physics.restitution" type="number" min="0" max="1" step="0.05" value="${node.physics.restitution}"></label>
      </fieldset>
      <fieldset>
        <legend>Animation</legend>
        <label><input data-path="animation.enabled" type="checkbox" ${node.animation.enabled ? "checked" : ""}> Enabled</label>
        <label>Clip <input data-path="animation.clip" value="${escapeHtml(node.animation.clip)}"></label>
        <label><input data-path="animation.loop" type="checkbox" ${node.animation.loop ? "checked" : ""}> Loop</label>
      </fieldset>
      <fieldset>
        <legend>Audio</legend>
        <label>Source <input data-path="audio.source" value="${escapeHtml(node.audio.source)}"></label>
        <label><input data-path="audio.listener" type="checkbox" ${node.audio.listener ? "checked" : ""}> Listener</label>
        <label>Volume <input data-path="audio.volume" type="number" min="0" max="1" step="0.05" value="${node.audio.volume}"></label>
      </fieldset>
      <fieldset>
        <legend>Particle Emitter</legend>
        <label><input data-path="particleEmitter.enabled" type="checkbox" ${node.particleEmitter.enabled ? "checked" : ""}> Enabled</label>
        <label>Preset <select data-path="particleEmitter.preset">${option("none", node.particleEmitter.preset)}${option("fire", node.particleEmitter.preset)}${option("fountain", node.particleEmitter.preset)}${option("collision-burst", node.particleEmitter.preset)}</select></label>
        <label>Rate <input data-path="particleEmitter.emissionRate" type="number" min="0" step="1" value="${node.particleEmitter.emissionRate}"></label>
        <label>Max particles <input data-path="particleEmitter.maxParticles" type="number" min="1" step="1" value="${node.particleEmitter.maxParticles}"></label>
        <label>Lifetime <input data-path="particleEmitter.lifetime" type="number" min="0.05" step="0.05" value="${node.particleEmitter.lifetime}"></label>
        <label>Speed <input data-path="particleEmitter.speed" type="number" min="0" step="0.1" value="${node.particleEmitter.speed}"></label>
        <label><input data-path="particleEmitter.looping" type="checkbox" ${node.particleEmitter.looping ? "checked" : ""}> Looping</label>
      </fieldset>
      <fieldset>
        <legend>Script</legend>
        <label><input data-path="script.enabled" type="checkbox" ${node.script.enabled ? "checked" : ""}> Enabled</label>
        <label>Behavior <input data-path="script.behavior" value="${escapeHtml(node.script.behavior)}"></label>
      </fieldset>
    `;
    for (const [path, fieldError] of this.fieldErrors) {
      const field = Array.from(this.fields.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-path]"))
        .find((input) => input.dataset.path === path);
      if (field) {
        field.setAttribute("aria-invalid", "true");
        field.setAttribute("aria-describedby", fieldError.id);
        if (typeof fieldError.value === "boolean" && field instanceof HTMLInputElement) field.checked = fieldError.value;
        else if (typeof fieldError.value === "string") field.value = fieldError.value;
        const message = document.createElement("span");
        message.id = fieldError.id;
        message.className = "inspector-field-error";
        message.textContent = fieldError.message;
        field.insertAdjacentElement("afterend", message);
      }
    }
    restorePanelFocus(this.element, focused);
  }

  private async updateField(path: string, rawValue: string | boolean): Promise<void> {
    const selected = this.shell.selectedNode();
    const node = this.shell.selectedProjectNode();
    if (!selected || !node) {
      return;
    }
    if (path.startsWith("position.") || path.startsWith("rotation.") || path.startsWith("scale.") || path.startsWith("pivot.")) {
      const match = /^(position|rotation|scale|pivot)\.([XYZW])$/.exec(path);
      if (!match || (match[2] === "W" && match[1] !== "rotation")) throw new Error(`Invalid transform field: ${path}.`);
      if (typeof rawValue !== "string" || !rawValue.trim() || !Number.isFinite(Number(rawValue))) {
        throw new Error(`Transform field ${path} needs a finite number.`);
      }
      const axisIndex = match[2] === "X" ? 0 : match[2] === "Y" ? 1 : match[2] === "Z" ? 2 : 3;
      const position: [number, number, number] = [...node.transform.position];
      const rotation: [number, number, number, number] = [...node.transform.rotation];
      const scale: [number, number, number] = [...node.transform.scale];
      const pivot: [number, number, number] = node.transform.pivot ? [...node.transform.pivot] : [0, 0, 0];
      if (match[1] === "rotation") {
        rotation[axisIndex] = Number(rawValue);
        if (Math.hypot(...rotation) < 1e-12) throw new Error("Rotation quaternion must not be zero.");
      } else if (axisIndex !== 3) {
        if (match[1] === "position") position[axisIndex] = Number(rawValue);
        else if (match[1] === "scale") scale[axisIndex] = Number(rawValue);
        else pivot[axisIndex] = Number(rawValue);
      }
      await this.shell.runtime.executeCommand(new TransformCommand(selected, {
        position: { x: position[0], y: position[1], z: position[2] },
        rotation: { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] },
        scale: { x: scale[0], y: scale[1], z: scale[2] },
        ...(match[1] === "pivot" ? { pivot: { x: pivot[0], y: pivot[1], z: pivot[2] } } : {})
      }));
      this.shell.projectFromScene();
      this.shell.refresh();
      return;
    }
    await this.shell.runtime.executeCommand(new ProjectNodeFieldCommand(this.shell, node, path.split("."), coerceValue(path, rawValue)));
    this.shell.projectFromScene();
    this.shell.addConsoleMessage("info", `Edited ${path}.`);
    this.shell.refresh();
  }
}

class ProjectNodeFieldCommand implements Command {
  readonly name = "Edit Authoring Field";
  private readonly before: unknown;

  constructor(
    private readonly shell: EditorShell,
    target: EditorProjectNode,
    private readonly path: readonly string[],
    private readonly after: unknown
  ) {
    this.before = readPath(target, path);
    this.nodeId = target.id;
  }

  private readonly nodeId: string;

  execute(): void {
    writePath(this.target(), this.path, this.after);
  }

  undo(): void {
    writePath(this.target(), this.path, this.before);
  }

  private target(): EditorProjectNode {
    const node = this.shell.project.scene.nodes.find((entry) => entry.id === this.nodeId);
    if (!node) throw new Error(`Project node ${this.nodeId} no longer exists.`);
    return node;
  }
}

function axisInput(kind: "position" | "rotation" | "scale" | "pivot", axis: "X" | "Y" | "Z" | "W", value: number): string {
  return `<label>${kind === "rotation" ? "rotation quaternion" : kind} ${axis} <input data-path="${kind}.${axis}" type="number" step="0.1" value="${value}"></label>`;
}

function option(value: string, selected: string): string {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`;
}

function coerceValue(path: string, value: string | boolean): string | number | boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (
    path.endsWith(".metallic") ||
    path.endsWith(".roughness") ||
    path.endsWith(".intensity") ||
    path.endsWith(".fov") ||
    path.endsWith(".volume") ||
    path.endsWith(".friction") ||
    path.endsWith(".restitution") ||
    path.endsWith(".emissionRate") ||
    path.endsWith(".maxParticles") ||
    path.endsWith(".lifetime") ||
    path.endsWith(".speed")
  ) {
    if (!value.trim() || !Number.isFinite(Number(value))) throw new Error(`${path} needs a finite number.`);
    const number = Number(value);
    if (["material.metallic", "material.roughness", "physics.friction", "physics.restitution", "audio.volume"].includes(path) && (number < 0 || number > 1)) {
      throw new Error(`${path} must be between 0 and 1.`);
    }
    if (["light.intensity", "particleEmitter.emissionRate", "particleEmitter.speed"].includes(path) && number < 0) {
      throw new Error(`${path} must be non-negative.`);
    }
    return number;
  }
  if (path === "material.baseColor" && !/^#[0-9a-f]{6}$/i.test(value)) throw new Error("material.baseColor needs a #rrggbb color.");
  if (path.endsWith(".assetId") && value === "") {
    return null;
  }
  return value;
}

function readPath(target: object, path: readonly string[]): unknown {
  let current: unknown = target;
  for (const segment of path) {
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function writePath(target: object, path: readonly string[], value: unknown): void {
  let current: Record<string, unknown> = target as Record<string, unknown>;
  for (const segment of path.slice(0, -1)) {
    current = current[segment] as Record<string, unknown>;
  }
  current[path[path.length - 1]!] = value;
}

function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
