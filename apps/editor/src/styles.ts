export function installEditorStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    :root {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      background: #0c111b;
      color: #e5edf8;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #0c111b; }
    button, input, select, textarea {
      font: inherit;
      color: #e5edf8;
      background: #121a27;
      border: 1px solid #344256;
      border-radius: 6px;
      padding: 6px 8px;
    }
    button { cursor: pointer; }
    button:hover { border-color: #6aa7ff; }
    .editor-topbar {
      height: 52px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 14px;
      border-bottom: 1px solid #263244;
      background: #101723;
    }
    .editor-topbar strong { margin-right: auto; }
    .editor-layout {
      min-height: calc(100vh - 52px);
      display: grid;
      grid-template-columns: minmax(260px, 300px) minmax(440px, 1fr) minmax(300px, 360px);
      gap: 10px;
      padding: 10px;
    }
    .left-rail, .right-rail, .center-stage {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .panel, .editor-viewport-panel {
      border: 1px solid #263244;
      background: #101723;
      border-radius: 8px;
      overflow: hidden;
    }
    .panel-title {
      min-height: 38px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      border-bottom: 1px solid #263244;
      background: #121a27;
    }
    .toolbar { display: flex; gap: 8px; }
    .hierarchy-list, .asset-list, fieldset, .metrics, .diagnostics-list, .plugin-list, .timeline-controls, .timeline-track-list {
      padding: 10px;
    }
    .hierarchy-row {
      display: grid;
      grid-template-columns: minmax(84px, 1fr) minmax(80px, 1fr) auto auto;
      gap: 6px;
      align-items: center;
      margin-bottom: 6px;
    }
    .hierarchy-row.is-selected { background: rgba(106, 167, 255, 0.12); }
    .hierarchy-row button:first-child { text-align: left; }
    fieldset {
      margin: 0;
      border: 0;
      border-bottom: 1px solid #263244;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    legend { grid-column: 1 / -1; color: #9fb3c8; padding: 0 0 4px; }
    label { display: grid; gap: 4px; color: #c7d2e2; }
    .asset-card {
      display: grid;
      gap: 5px;
      padding: 10px;
      border: 1px solid #263244;
      border-radius: 7px;
      margin-bottom: 8px;
      background: #121a27;
    }
    .asset-card span, .asset-card small, .muted { color: #9fb3c8; }
    .timeline-controls {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      border-bottom: 1px solid #263244;
    }
    .timeline-controls label { grid-column: 1 / -1; }
    .timeline-track-list { display: grid; gap: 8px; }
    .timeline-track {
      display: grid;
      grid-template-columns: minmax(90px, 1fr) minmax(110px, 1.2fr);
      gap: 8px;
      align-items: center;
      border: 1px solid #263244;
      border-radius: 7px;
      padding: 8px;
      background: #121a27;
    }
    .timeline-track span { color: #9fb3c8; }
    .viewport-stack { position: relative; min-height: 520px; }
    .editor-viewport, .editor-viewport-overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
    }
    .editor-viewport-overlay { pointer-events: none; }
    .viewport-hud {
      padding: 8px 10px;
      color: #c7d2e2;
      border-top: 1px solid #263244;
      background: #121a27;
    }
    .metrics {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 7px 10px;
    }
    .metrics dt { color: #9fb3c8; }
    .metrics dd { margin: 0; }
    .diagnostics-list, .plugin-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      border-top: 1px solid #263244;
    }
    .diagnostics-list span, .plugin-list span {
      border: 1px solid #344256;
      border-radius: 999px;
      padding: 4px 8px;
      color: #c7d2e2;
    }
    .diagnostics-list span[data-status="warning"] { border-color: #d69e2e; color: #ffe8a3; }
    .diagnostics-list span[data-status="error"] { border-color: #f56565; color: #fecaca; }
    .project-buffer, .export-summary {
      position: fixed;
      right: 12px;
      bottom: 12px;
      width: 360px;
      max-width: calc(100vw - 24px);
      height: 110px;
      opacity: 0.08;
      pointer-events: none;
    }
    .export-summary {
      bottom: 130px;
      height: auto;
      min-height: 48px;
      padding: 8px;
      white-space: pre-wrap;
      background: #121a27;
      border: 1px solid #344256;
      border-radius: 6px;
    }
    @media (max-width: 920px) {
      .editor-layout { grid-template-columns: 1fr; }
      .viewport-stack { min-height: 360px; }
      fieldset { grid-template-columns: 1fr; }
    }
  `;
  document.head.append(style);
}
