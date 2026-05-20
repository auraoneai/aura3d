import { TransformCommand, type Command } from "@galileo3d/editor-runtime";
import type { EditorProjectNode } from "../project/ProjectSerializer";
import type { EditorShell } from "../EditorShell";

export class InspectorPanel {
  readonly element = document.createElement("section");

  constructor(private readonly shell: EditorShell) {
    this.element.className = "panel inspector-panel";
    this.element.addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement | HTMLSelectElement;
      const path = input.dataset.path;
      if (!path) {
        return;
      }
      void this.updateField(path, input.type === "checkbox" ? (input as HTMLInputElement).checked : input.value);
    });
  }

  render(): void {
    const node = this.shell.selectedProjectNode();
    if (!node) {
      this.element.innerHTML = `<div class="panel-title"><span>Inspector</span></div><p class="muted">Select a node to edit authoring fields.</p>`;
      return;
    }
    this.element.innerHTML = `
      <div class="panel-title"><span>Inspector</span><strong>${escapeHtml(node.name)}</strong></div>
      <fieldset>
        <legend>Transform</legend>
        ${axisInput("position", "X", node.transform.position[0])}
        ${axisInput("position", "Y", node.transform.position[1])}
        ${axisInput("position", "Z", node.transform.position[2])}
        ${axisInput("rotation", "X", node.transform.rotation[0])}
        ${axisInput("rotation", "Y", node.transform.rotation[1])}
        ${axisInput("rotation", "Z", node.transform.rotation[2])}
        ${axisInput("scale", "X", node.transform.scale[0])}
        ${axisInput("scale", "Y", node.transform.scale[1])}
        ${axisInput("scale", "Z", node.transform.scale[2])}
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
  }

  private async updateField(path: string, rawValue: string | boolean): Promise<void> {
    const selected = this.shell.selectedNode();
    const node = this.shell.selectedProjectNode();
    if (!selected || !node) {
      return;
    }
    if (path.startsWith("position.") || path.startsWith("rotation.") || path.startsWith("scale.")) {
      const [, axis] = path.split(".");
      const axisIndex = axis === "X" ? 0 : axis === "Y" ? 1 : 2;
      const position = [...node.transform.position] as [number, number, number];
      const rotation = [...node.transform.rotation] as [number, number, number, number];
      const scale = [...node.transform.scale] as [number, number, number];
      if (path.startsWith("position.")) {
        position[axisIndex] = Number(rawValue);
      } else if (path.startsWith("rotation.")) {
        rotation[axisIndex] = Number(rawValue);
      } else {
        scale[axisIndex] = Number(rawValue);
      }
      await this.shell.runtime.executeCommand(new TransformCommand(selected, {
        position: { x: position[0], y: position[1], z: position[2] },
        rotation: { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] },
        scale: { x: scale[0], y: scale[1], z: scale[2] }
      }));
      this.shell.projectFromScene();
      this.shell.refresh();
      return;
    }
    await this.shell.runtime.executeCommand(new ProjectNodeFieldCommand(node, path.split("."), coerceValue(path, rawValue)));
    this.shell.projectFromScene();
    this.shell.addConsoleMessage("info", `Edited ${path}.`);
    this.shell.refresh();
  }
}

class ProjectNodeFieldCommand implements Command {
  readonly name = "Edit Authoring Field";
  private readonly before: unknown;

  constructor(
    private readonly target: EditorProjectNode,
    private readonly path: readonly string[],
    private readonly after: unknown
  ) {
    this.before = readPath(target, path);
  }

  execute(): void {
    writePath(this.target, this.path, this.after);
  }

  undo(): void {
    writePath(this.target, this.path, this.before);
  }
}

function axisInput(kind: "position" | "scale", axis: "X" | "Y" | "Z", value: number): string {
  return `<label>${kind} ${axis} <input data-path="${kind}.${axis}" type="number" step="0.1" value="${value}"></label>`;
}

function option(value: string, selected: string): string {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`;
}

function coerceValue(path: string, value: string | boolean): string | number | boolean {
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
    return Number(value);
  }
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
