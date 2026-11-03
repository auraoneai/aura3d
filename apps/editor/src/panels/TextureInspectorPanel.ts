import type { Texture, TextureCubeFace } from "@aura3d/rendering";

/** A live renderer texture and its editor-local, stable selection identifier. */
export interface InspectableTexture {
  readonly id: string;
  readonly texture: Texture;
  /** `runtime`: held by the live device but owned by no project asset (targets, shadow maps). */
  readonly origin?: "asset" | "runtime";
}

export interface TextureResourceState {
  readonly status: "loading" | "ready" | "unloaded" | "disposed" | "error" | "unsupported";
  /** Null or absent means the device does not expose residency. */
  readonly gpuResident?: boolean | null;
  readonly gpuBytes?: number | null;
  readonly message?: string;
}

export interface TextureInspectorSource {
  getTextures(): readonly InspectableTexture[];
  getSelectedTextureId(): string | null;
  selectTexture(id: string | null): void;
  getState?(): { readonly status: "loading" | "ready" | "error" | "unsupported"; readonly message?: string };
  getResourceState?(id: string): TextureResourceState | null;
}

export interface InspectedTextureMip {
  readonly level: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly cpuBytes: number;
  readonly availableFaces: number;
  readonly revision: number;
}

export interface InspectedTexture {
  readonly label: string;
  readonly dimension: Texture["dimension"];
  readonly format: Texture["format"];
  readonly colorSpace: Texture["colorSpace"];
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly layers: number;
  readonly usage: readonly string[];
  readonly disposed: boolean;
  readonly needsUpdate: boolean;
  readonly revision: number;
  /** Descriptor-based estimate, not a GPU residency measurement. */
  readonly estimatedBytes: number;
  readonly sourceBacked: boolean;
  readonly dynamic: boolean;
  readonly generateMipmaps: boolean;
  readonly flipY: boolean;
  readonly mipLevels: readonly InspectedTextureMip[];
}

/** Inspect the actual current texture handle without exposing its pixel data. */
export function inspectTexture(texture: Texture): InspectedTexture {
  const faces: readonly (TextureCubeFace | undefined)[] = texture.dimension === "cube"
    ? ["px", "nx", "py", "ny", "pz", "nz"]
    : [undefined];
  const mipLevels: InspectedTextureMip[] = [];
  for (let level = 0; level < texture.mipLevelCount; level += 1) {
    let cpuBytes = 0;
    let availableFaces = 0;
    let revision = 0;
    for (const face of faces) {
      const mip = texture.getMipLevel(level, face);
      if (mip) {
        cpuBytes += mip.data.byteLength;
        availableFaces += 1;
      }
      revision = Math.max(revision, texture.getMipRevision(level, face));
    }
    mipLevels.push({
      level,
      width: Math.max(1, Math.floor(texture.width / 2 ** level)),
      height: Math.max(1, Math.floor(texture.height / 2 ** level)),
      depth: texture.dimension === "3d" ? Math.max(1, Math.floor(texture.depth / 2 ** level)) : texture.layers,
      cpuBytes,
      availableFaces,
      revision
    });
  }
  return {
    label: texture.label,
    dimension: texture.dimension,
    format: texture.format,
    colorSpace: texture.colorSpace,
    width: texture.width,
    height: texture.height,
    depth: texture.depth,
    layers: texture.layers,
    usage: [...texture.usage],
    disposed: texture.disposed,
    needsUpdate: texture.needsUpdate,
    revision: texture.revision,
    estimatedBytes: texture.byteLength,
    sourceBacked: texture.source !== null,
    dynamic: texture.dynamic,
    generateMipmaps: texture.generateMipmaps,
    flipY: texture.flipY,
    mipLevels
  };
}

/** Accessible compact panel backed exclusively by textures supplied by the renderer. */
export class TextureInspectorPanel {
  readonly element = document.createElement("section");
  private disposed = false;
  private readonly onChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || target.dataset.action !== "select-texture") return;
    try {
      this.source.selectTexture(target.value || null);
      this.render();
    } catch {
      this.showState("error", "Could not select the texture.");
    }
  };

  constructor(private readonly source: TextureInspectorSource) {
    this.element.className = "panel texture-inspector-panel";
    this.element.setAttribute("aria-label", "Texture inspector");
    this.element.addEventListener("change", this.onChange);
  }

  render(): void {
    if (this.disposed) return;
    try {
      const state = this.source.getState?.() ?? { status: "ready" as const };
      if (state.status !== "ready") {
        const defaultMessages = {
          loading: "Loading textures…",
          error: "Texture inspection failed.",
          unsupported: "Texture inspection is unavailable for this renderer."
        };
        this.showState(state.status, state.message ?? defaultMessages[state.status]);
        return;
      }
      const previousSelect = this.element.querySelector('[data-action="select-texture"]');
      const preserveSelectFocus = previousSelect !== null && document.activeElement === previousSelect;
      const textures = this.source.getTextures();
      const selectedId = this.source.getSelectedTextureId();
      const selected = textures.find((entry) => entry.id === selectedId);
      this.element.replaceChildren(title());
      if (textures.length === 0) {
        this.element.append(statusMessage("empty", "No textures are available in this renderer."));
        return;
      }
      const label = document.createElement("label");
      label.textContent = "Texture";
      label.style.padding = "8px 10px";
      const select = document.createElement("select");
      select.dataset.action = "select-texture";
      select.setAttribute("aria-label", "Selected texture");
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Select a texture";
      select.append(empty);
      for (const entry of textures) {
        const option = document.createElement("option");
        option.value = entry.id;
        option.textContent = `${entry.texture.label || entry.id}${entry.origin === "runtime" ? " (runtime)" : ""}`;
        option.selected = entry.id === selectedId;
        select.append(option);
      }
      label.append(select);
      this.element.append(label);
      if (preserveSelectFocus) select.focus({ preventScroll: true });
      if (!selected) {
        this.element.append(statusMessage("empty", selectedId ? "Selected texture is no longer available." : "Select a texture to inspect it."));
        return;
      }
      const texture = inspectTexture(selected.texture);
      const resource = this.source.getResourceState?.(selected.id) ?? null;
      const metrics = document.createElement("dl");
      metrics.className = "metrics";
      appendMetric(metrics, "State", texture.disposed ? "Disposed" : resource?.status ?? "Unknown");
      appendMetric(metrics, "Origin", selected.origin === "runtime" ? "Runtime-only (renderer allocation)" : "Project asset");
      appendMetric(metrics, "Dimensions", `${texture.width} × ${texture.height}${texture.dimension === "3d" ? ` × ${texture.depth}` : ""}`);
      appendMetric(metrics, "Dimension", texture.dimension);
      appendMetric(metrics, "Format", texture.format);
      appendMetric(metrics, "Color space", texture.colorSpace);
      appendMetric(metrics, "Layers", String(texture.layers));
      appendMetric(metrics, "Usage", texture.usage.join(", "));
      appendMetric(metrics, "Mip levels", String(texture.mipLevels.length));
      appendMetric(metrics, "Estimated allocation", `${texture.estimatedBytes} bytes`);
      appendMetric(metrics, "GPU residency", resource?.gpuResident == null ? "Unavailable" : resource.gpuResident ? "Resident" : "Not resident");
      if (resource?.gpuBytes != null) appendMetric(metrics, "Reported GPU bytes", String(resource.gpuBytes));
      appendMetric(metrics, "Revision", String(texture.revision));
      appendMetric(metrics, "Pending update", texture.needsUpdate ? "Yes" : "No");
      appendMetric(metrics, "Source", texture.sourceBacked ? "Image or video" : "Data or GPU allocation");
      appendMetric(metrics, "Dynamic", texture.dynamic ? "Yes" : "No");
      appendMetric(metrics, "Generate mipmaps", texture.generateMipmaps ? "Enabled" : "Disabled");
      appendMetric(metrics, "Flip Y", texture.flipY ? "Yes" : "No");
      this.element.append(metrics);
      if (resource?.message) this.element.append(statusMessage(resource.status, resource.message));
      const table = document.createElement("table");
      table.setAttribute("aria-label", "Texture mip levels");
      table.style.width = "100%";
      const header = table.createTHead().insertRow();
      for (const column of ["Level", "Size", "CPU bytes", "Faces", "Revision"]) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = column;
        header.append(th);
      }
      const body = table.createTBody();
      for (const mip of texture.mipLevels) {
        const row = body.insertRow();
        for (const value of [mip.level, `${mip.width} × ${mip.height}${texture.dimension === "3d" ? ` × ${mip.depth}` : ""}`, mip.cpuBytes, mip.availableFaces, mip.revision]) {
          row.insertCell().textContent = String(value);
        }
      }
      this.element.append(table);
    } catch {
      this.showState("error", "Texture inspection failed. The resource may no longer be available.");
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.element.removeEventListener("change", this.onChange);
    this.element.replaceChildren();
  }

  private showState(state: string, message: string): void {
    this.element.replaceChildren(title(), statusMessage(state, message));
  }
}

function title(): HTMLDivElement {
  const result = document.createElement("div");
  result.className = "panel-title";
  result.textContent = "Texture inspector";
  return result;
}

function statusMessage(state: string, message: string): HTMLParagraphElement {
  const result = document.createElement("p");
  result.className = "muted";
  result.dataset.state = state;
  result.setAttribute("role", state === "error" ? "alert" : "status");
  result.style.padding = "0 10px";
  result.textContent = message;
  return result;
}

function appendMetric(container: HTMLDListElement, name: string, value: string): void {
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = name;
  description.textContent = value;
  container.append(term, description);
}
