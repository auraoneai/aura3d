import type { CinematicSceneIR } from "./cinematic-demo-fixtures";

export function renderAssetPanel(root: HTMLElement, scene: CinematicSceneIR): void {
  const open = root.querySelector("details")?.open ?? false;
  root.innerHTML = `
    <details class="panel" ${open ? "open" : ""}>
      <summary>
        <span>Assets</span>
        <strong>${scene.assets.length}</strong>
      </summary>
      <div class="panel-body">
        <div class="asset-list">
          ${scene.assets.map((asset) => `
            <article class="asset-row">
              <div>
                <strong>${escapeHtml(asset.id)}</strong>
                <span>${escapeHtml(asset.role)}</span>
              </div>
              <em class="${asset.status === "missing" ? "bad" : ""}">${escapeHtml(asset.status)}</em>
            </article>
          `).join("")}
        </div>
      </div>
    </details>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
